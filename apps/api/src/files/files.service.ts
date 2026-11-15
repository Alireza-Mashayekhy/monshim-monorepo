// files/files.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_INPUT_PIXELS,
  IMAGE_MAX_SIZE_BYTES,
  IMAGE_WEBP_QUALITY,
  OUTPUT_IMAGE_EXTENSION,
} from 'src/common/constants/constants';
import { getUploadRoot } from 'src/common/utils/upload-path.util';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadDir = getUploadRoot();

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(
    file: Express.Multer.File,
    subFolder: string = '',
  ): Promise<string> {
    this.assertSafeImage(file);

    const optimizedBuffer = await this.optimizeToWebp(file.buffer);

    const filename = `${randomUUID()}${OUTPUT_IMAGE_EXTENSION}`;
    const safeFolder = subFolder.replace(/[^a-zA-Z0-9_-]/g, '');
    const folderPath = path.join(this.uploadDir, safeFolder);

    const filePath = path.join(folderPath, filename);
    try {
      await fs.promises.mkdir(folderPath, { recursive: true });
      // `flag: 'wx'` مانع بازنویسی تصادفی یک فایل موجود می‌شود (نام‌ها UUID
      // هستند، پس برخورد یعنی یک باگ؛ بهتر است خطا بدهد تا داده از دست نرود).
      await fs.promises.writeFile(filePath, optimizedBuffer, { flag: 'wx' });
    } catch (error) {
      /**
       * خطای دیسک (پر بودن فضا، نبود مجوز، volume mount اشتباه) نباید به
       * کاربر ۵۰۰ خام بدهد و نباید پیام «فایل تصویر معتبر نیست» بگیرد؛
       * تصویر معتبر بوده و ذخیره‌سازی شکست خورده است. این تمایز برای
       * عیب‌یابی اپراتور هم حیاتی است.
       */
      this.logger.error(
        `failed to persist upload in "${safeFolder || '.'}": ${String(error)}`,
      );
      throw new ServiceUnavailableException(
        'ذخیرهٔ تصویر در حال حاضر ممکن نیست. لطفاً کمی بعد دوباره تلاش کنید.',
      );
    }

    // بازگرداندن مسیر نسبی (شامل ساب‌فولدر)
    return safeFolder
      ? `/uploads/${safeFolder}/${filename}`
      : `/uploads/${filename}`;
  }

  /**
   * ذخیرهٔ چند فایل به‌صورت «همه یا هیچ».
   *
   * چرا مهم است؟
   * پیش‌تر از `Promise.all` استفاده می‌شد که با شکست یک فایل، فایل‌های
   * موفقِ همان دسته را روی دیسک رها می‌کرد و فراخواننده فقط خطا را می‌دید
   * (فایل‌های یتیم + ناهماهنگی بین دیسک و دیتابیس). حالا هر فایلِ ذخیره‌شده
   * در صورت شکست دسته پاک می‌شود.
   *
   * ذخیره به‌صورت سری است، نه موازی: تصاویر حداکثر ۳ مگابایتی‌اند و `sharp`
   * هم CPU-bound است؛ موازی‌سازی فقط فشار حافظه و رقابت روی CPU را زیاد
   * می‌کرد و ترتیب پاسخ‌ها را هم نامطمئن می‌ساخت.
   */
  async saveMultipleFiles(
    files: Express.Multer.File[],
    subFolder: string = '',
  ): Promise<string[]> {
    const saved: string[] = [];
    try {
      for (const file of files) {
        saved.push(await this.saveFile(file, subFolder));
      }
      return saved;
    } catch (error) {
      this.deleteFiles(saved);
      throw error;
    }
  }

  deleteFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      try {
        this.deleteFile(filePath);
      } catch (error) {
        this.logger.warn(`failed to delete file ${filePath}: ${String(error)}`);
      }
    }
  }

  deleteFile(filePath: string): { message: string } {
    if (!filePath) {
      return { message: 'مسیر فایل ارائه نشده است' };
    }

    const relativePath = filePath.replace(/^\/uploads\//, '');
    const fullPath = path.resolve(this.uploadDir, relativePath);

    if (!fullPath.startsWith(path.resolve(this.uploadDir) + path.sep)) {
      throw new BadRequestException('مسیر فایل نامعتبر است');
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return { message: 'فایل با موفقیت حذف شد' };
    }

    return { message: 'فایل یافت نشد' };
  }

  private async optimizeToWebp(buffer: Buffer): Promise<Buffer> {
    try {
      const image = sharp(buffer, {
        animated: true, // حفظ انیمیشن gif
        limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
        failOn: 'error',
      });

      // فرمت واقعی فایل باید از روی محتوا تشخیص داده شود، نه پسوند/میم‌تایپ
      const meta = await image.metadata();
      const { format } = meta;
      if (
        !format ||
        !ALLOWED_IMAGE_FORMATS.includes(
          format as (typeof ALLOWED_IMAGE_FORMATS)[number],
        )
      ) {
        throw new BadRequestException('فرمت تصویر مجاز نیست');
      }

      // برای تصاویر چندفریمی، ارتفاع هر فریم ملاک است
      const frameHeight =
        meta.pages && meta.pages > 1 ? meta.pageHeight : meta.height;
      const withinLimits =
        !!meta.width &&
        !!frameHeight &&
        meta.width <= IMAGE_MAX_DIMENSION &&
        frameHeight <= IMAGE_MAX_DIMENSION;

      const optimized = await image
        .rotate() // اصلاح چرخش بر اساس EXIF
        .resize({
          width: IMAGE_MAX_DIMENSION,
          height: IMAGE_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: IMAGE_WEBP_QUALITY, effort: 4 })
        .toBuffer();

      // اگر ورودی از قبل webp و در محدودهٔ ابعاد بوده و تبدیل ما حجمش را
      // بیشتر کرده، همان فایل اصلی بهینه‌تر است و نگه داشته می‌شود.
      if (
        format === 'webp' &&
        withinLimits &&
        optimized.length >= buffer.length
      ) {
        this.logger.debug('webp input kept as-is (re-encode was larger)');
        return buffer;
      }

      return optimized;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.warn(`image optimization failed: ${String(error)}`);

      const message = String(error);
      if (message.includes('pixel limit') || message.includes('exceeds')) {
        throw new BadRequestException('ابعاد تصویر بیش از حد مجاز است');
      }

      throw new BadRequestException('فایل ارسالی تصویر معتبری نیست');
    }
  }

  private assertSafeImage(file: Express.Multer.File) {
    if (!file?.buffer) {
      throw new BadRequestException('فایل آپلود نشده است');
    }

    if (file.size && file.size > IMAGE_MAX_SIZE_BYTES) {
      // پیام باید عدد واقعی سقف را نشان دهد. فرمول قبلی
      // (`/ (1024 * 1024 * 3)`) عدد را به «۱ مگابایت» تبدیل می‌کرد که هم
      // گمراه‌کننده بود و هم با متن UI («۳ مگابایت») نمی‌خواند.
      throw new BadRequestException(
        `حجم فایل نباید بیشتر از ${Math.round(
          IMAGE_MAX_SIZE_BYTES / (1024 * 1024),
        )} مگابایت باشد`,
      );
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      throw new BadRequestException('فرمت فایل مجاز نیست');
    }

    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException('نوع فایل مجاز نیست');
    }
  }
}
