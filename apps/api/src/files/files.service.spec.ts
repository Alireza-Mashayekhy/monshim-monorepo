import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { IMAGE_MAX_SIZE_BYTES } from 'src/common/constants/constants';

/**
 * تست‌های چرخهٔ عمر فایل در سرویس آپلود.
 *
 * این‌ها با فایل‌های واقعی روی دیسک موقت اجرا می‌شوند (بدون دیتابیس) تا
 * رفتار واقعی `sharp` و `fs` سنجیده شود، نه mock.
 */
describe('FilesService — file lifecycle', () => {
  let tempRoot: string;
  let FilesServiceClass: typeof import('./files.service').FilesService;
  /**
   * کلاس‌های خطا هم داخل همان رجیستریِ ایزوله گرفته می‌شوند؛ وگرنه
   * `instanceof` با نسخهٔ دیگری از `@nestjs/common` مقایسه می‌شد و همیشه
   * شکست می‌خورد (کلاس‌ها یکی‌اند، اما شناسهٔ سازنده متفاوت است).
   */
  let BadRequestException: typeof import('@nestjs/common').BadRequestException;
  let ServiceUnavailableException: typeof import('@nestjs/common').ServiceUnavailableException;

  beforeAll(async () => {
    tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'monshim-upload-'),
    );
    process.env.UPLOAD_DIR = tempRoot;
    /**
     * `UPLOAD_DIR` باید پیش از **بارگذاری ماژول** ست شود، چون سرویس مسیر
     * ریشه را در فیلد کلاس (زمان ساخت) حساب می‌کند. `jest.isolateModules`
     * همان بارگذاری تازه را بدون نیاز به `import()` پویا (که در ts-jest/CJS
     * پشتیبانی نمی‌شود) می‌دهد.
     */
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const nestCommon =
        require('@nestjs/common') as typeof import('@nestjs/common');
      BadRequestException = nestCommon.BadRequestException;
      ServiceUnavailableException = nestCommon.ServiceUnavailableException;

      FilesServiceClass = (
        require('./files.service') as typeof import('./files.service')
      ).FilesService;
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
  });

  afterAll(async () => {
    delete process.env.UPLOAD_DIR;
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  const buildImage = async (
    format: 'jpeg' | 'png' | 'webp' = 'png',
    width = 64,
    height = 64,
  ) => {
    let pipeline = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 60, b: 90 },
      },
    });
    if (format === 'jpeg') pipeline = pipeline.jpeg();
    else if (format === 'webp') pipeline = pipeline.webp();
    else pipeline = pipeline.png();
    return pipeline.toBuffer();
  };

  const asMulterFile = (
    buffer: Buffer,
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File => ({
    buffer,
    size: buffer.length,
    originalname: 'sample.png',
    mimetype: 'image/png',
    fieldname: 'file',
    encoding: '7bit',
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  });

  it('تصویر معتبر را به webp تبدیل و در زیرپوشه ذخیره می‌کند', async () => {
    const service = new FilesServiceClass();
    const buffer = await buildImage('png');

    const relative = await service.saveFile(asMulterFile(buffer), 'portfolio');

    expect(relative).toMatch(/^\/uploads\/portfolio\/[\w-]+\.webp$/);
    const onDisk = path.join(tempRoot, relative.replace('/uploads/', ''));
    expect(fs.existsSync(onDisk)).toBe(true);

    const meta = await sharp(onDisk).metadata();
    expect(meta.format).toBe('webp');
  });

  it('نام تکراری فایل، فایل قبلی را بازنویسی نمی‌کند', async () => {
    const service = new FilesServiceClass();
    const buffer = await buildImage('png');
    const first = await service.saveFile(asMulterFile(buffer), 'portfolio');
    const second = await service.saveFile(asMulterFile(buffer), 'portfolio');
    expect(first).not.toBe(second);
  });

  it('پسوند غیرمجاز را رد می‌کند (اعتبارسنجی ورودی)', async () => {
    const service = new FilesServiceClass();
    const buffer = await buildImage('png');
    await expect(
      service.saveFile(
        asMulterFile(buffer, { originalname: 'payload.exe' }),
        'portfolio',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('MIME غیرمجاز را رد می‌کند', async () => {
    const service = new FilesServiceClass();
    const buffer = await buildImage('png');
    await expect(
      service.saveFile(
        asMulterFile(buffer, { mimetype: 'application/pdf' }),
        'portfolio',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('فایلی که محتوایش تصویر نیست را رد می‌کند حتی با پسوند png', async () => {
    const service = new FilesServiceClass();
    const fakeImage = Buffer.from('<html>not an image</html>');
    await expect(
      service.saveFile(asMulterFile(fakeImage), 'portfolio'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('فایل بزرگ‌تر از سقف را با پیام درست رد می‌کند', async () => {
    const service = new FilesServiceClass();
    const buffer = await buildImage('png');
    const oversized = {
      ...asMulterFile(buffer),
      size: IMAGE_MAX_SIZE_BYTES + 1,
    };

    await expect(service.saveFile(oversized, 'portfolio')).rejects.toThrow(
      /۳ مگابایت|3 مگابایت/,
    );
  });

  it('اگر یک فایل در دسته شکست بخورد، فایل‌های موفق همان دسته پاک می‌شوند', async () => {
    const service = new FilesServiceClass();
    const good = await buildImage('png');
    const bad = Buffer.from('definitely-not-an-image');

    await expect(
      service.saveMultipleFiles(
        [asMulterFile(good), asMulterFile(bad)],
        'atomic',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // هیچ فایل یتیمی از این دسته نباید باقی بماند.
    const folder = path.join(tempRoot, 'atomic');
    const leftovers = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
    expect(leftovers).toEqual([]);
  });

  it('deleteFile فایل موجود را پاک می‌کند و برای ناموجود خطا نمی‌دهد', async () => {
    const service = new FilesServiceClass();
    const buffer = await buildImage('png');
    const relative = await service.saveFile(asMulterFile(buffer), 'delete-me');

    const onDisk = path.join(tempRoot, relative.replace('/uploads/', ''));
    expect(fs.existsSync(onDisk)).toBe(true);

    expect(service.deleteFile(relative).message).toContain('حذف شد');
    expect(fs.existsSync(onDisk)).toBe(false);

    expect(service.deleteFile(relative).message).toContain('یافت نشد');
  });

  it('deleteFile مسیر خارج از پوشهٔ آپلود را رد می‌کند (path traversal)', async () => {
    const service = new FilesServiceClass();
    expect(() => service.deleteFile('/uploads/../etc/passwd')).toThrow(
      BadRequestException,
    );
    expect(() => service.deleteFile('../../package.json')).toThrow(
      BadRequestException,
    );
  });

  it('خطای دیسک به ۵۰۳ با پیام قابل فهم تبدیل می‌شود، نه ۵۰۰ خام', async () => {
    const service = new FilesServiceClass();
    const buffer = await buildImage('png');

    // یک فایل (نه پوشه) در مسیر زیرپوشه می‌سازیم تا mkdir شکست بخورد.
    const blocker = path.join(tempRoot, 'blocked');
    await fs.promises.writeFile(blocker, 'x');

    await expect(
      service.saveFile(asMulterFile(buffer), 'blocked'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
