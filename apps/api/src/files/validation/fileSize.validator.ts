import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { IMAGE_MAX_SIZE_BYTES } from 'src/common/constants/constants';

/**
 * اعتبارسنجی فایل آپلودی پس از دریافت multipart.
 *
 * محدودیت حجم در multer هم اعمال می‌شود (`limits.fileSize`)، اما آن مسیر به
 * خطای `MulterError` می‌رسد و پیامش عمومی است. این پایپ برای مسیرهایی است که
 * توانسته‌اند فایل را دریافت کنند و باید با پیام یکسان و واضح رد شوند.
 */
@Injectable()
export class FileSizeValidationPipe implements PipeTransform {
  private readonly maxSize = IMAGE_MAX_SIZE_BYTES;

  transform(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('فایل آپلود نشده است.');
    }

    if (file.size > this.maxSize) {
      // متن قبلی («... بیشتر از . ۱MB باشید») هم غلط املایی داشت و هم عدد
      // سقف را اشتباه محاسبه می‌کرد؛ همین ناهماهنگی باعث می‌شد کاربر با دو
      // پیام متفاوت برای یک محدودیت روبه‌رو شود.
      const megabytes = Math.round(this.maxSize / (1024 * 1024));
      throw new BadRequestException(
        `حجم فایل نباید بیشتر از ${megabytes} مگابایت باشد.`,
      );
    }

    return file;
  }
}
