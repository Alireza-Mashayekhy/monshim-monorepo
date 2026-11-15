import { BadRequestException } from '@nestjs/common';

import { BarberController } from './barber.controller';

/**
 * تست قرارداد آپلود نمونه‌کار در پنل آرایشگر.
 *
 * تمرکز روی «جایگزینی»: کاربر با ۵ عکس باید بتواند یکی را حذف و یکی جدید
 * اضافه کند. شرط قبلی (`kept + uploaded <= 5`) این حالت طبیعی را مسدود
 * می‌کرد، در حالی که نتیجهٔ نهایی هرگز از سقف رد نمی‌شد.
 */
describe('BarberController — portfolio upload', () => {
  const liveImages = [
    '/uploads/portfolio/a.webp',
    '/uploads/portfolio/b.webp',
    '/uploads/portfolio/c.webp',
    '/uploads/portfolio/d.webp',
    '/uploads/portfolio/e.webp',
  ];

  function createHarness(pendingImages: string[] | undefined = undefined) {
    let saved = 0;
    const uploadedPaths: string[] = [];

    const profile = {
      id: 'profile-1',
      userId: 7,
      portfolioImages: [...liveImages],
      pendingChanges: pendingImages ? { portfolioImages: pendingImages } : null,
    };

    const filesService = {
      saveFile: jest.fn(async () => {
        saved += 1;
        const path = `/uploads/portfolio/new-${saved}.webp`;
        uploadedPaths.push(path);
        return path;
      }),
      deleteFiles: jest.fn(),
    };

    const barberProfileRepo = {
      findOne: jest.fn(async () => profile),
    };

    const barberService = {
      updatePortfolioImages: jest.fn(
        async (_userId: number, images: string[]) => ({
          ...profile,
          portfolioImages: images,
          pendingStatus: 'none',
        }),
      ),
    };

    const controller = new BarberController(
      barberService as never,
      filesService as never,
      {} as never,
      barberProfileRepo as never,
    );

    const call = (existing: string[], files?: Express.Multer.File[]) =>
      controller.updatePortfolioImages(
        { user: { id: 7 } },
        files,
        JSON.stringify(existing),
      );

    return { controller, call, filesService, barberService, uploadedPaths };
  }

  const file = (name: string): Express.Multer.File =>
    ({
      buffer: Buffer.from('x'),
      size: 1,
      originalname: name,
      mimetype: 'image/png',
    }) as Express.Multer.File;

  it('۵ عکس موجود، حذف یکی و افزودن یکی جدید ← مجاز است', async () => {
    const { call, barberService } = createHarness();

    const result = await call(liveImages.slice(0, 4), [file('new.png')]);

    expect(result.message).toContain('موفقیت');
    const finalImages = barberService.updatePortfolioImages.mock.calls[0][1];
    expect(finalImages).toHaveLength(5);
    expect(finalImages[4]).toBe('/uploads/portfolio/new-1.webp');
  });

  it('افزودن بدون حذف وقتی سقف پر است ← رد با پیام مشخص', async () => {
    const { call } = createHarness();

    await expect(call(liveImages, [file('new.png')])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('نگه‌داشتن عکس پروفایل دیگر ← رد (کنترل دسترسی)', async () => {
    const { call } = createHarness();

    await expect(call(['/uploads/portfolio/other-user.webp'])).rejects.toThrow(
      /پروفایل دیگر/,
    );
  });

  it('عکس‌های پیش‌نویس (در انتظار تایید) هم قابل نگه‌داشتن هستند', async () => {
    const draft = ['/uploads/portfolio/draft.webp'];
    const { call } = createHarness(draft);

    const result = await call(draft);
    expect(result.message).toContain('موفقیت');
  });

  it('تکرار یک مسیر در فهرست ← رد', async () => {
    const { call } = createHarness();
    await expect(call([liveImages[0], liveImages[0]])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('فهرست نامعتبر (رشتهٔ غیر JSON یا نوع اشتباه) ← رد با پیام فارسی', async () => {
    const { controller } = createHarness();
    await expect(
      controller.updatePortfolioImages({ user: { id: 7 } }, [], 'not-json'),
    ).rejects.toThrow(/نامعتبر/);

    await expect(
      controller.updatePortfolioImages(
        { user: { id: 7 } },
        [],
        JSON.stringify([1, 2]),
      ),
    ).rejects.toThrow(/نامعتبر/);
  });

  it('خطای ذخیره‌سازی یک فایل ← فقط فایل‌های همان درخواست پاک می‌شوند', async () => {
    const { controller, filesService, barberService } = createHarness();
    // فایل اول موفق، فایل دوم ناموفق
    let attempt = 0;
    (filesService.saveFile as jest.Mock).mockImplementation(async () => {
      attempt += 1;
      if (attempt === 2)
        throw new BadRequestException('فایل ارسالی معتبر نیست');
      return '/uploads/portfolio/ok-1.webp';
    });

    await expect(
      controller.updatePortfolioImages(
        { user: { id: 7 } },
        [file('a.png'), file('bad.png')],
        JSON.stringify([]),
      ),
    ).rejects.toThrow(/فایل شماره ۲/);

    // فایل موفقِ همان درخواست پاک می‌شود (بدون فایل یتیم)...
    expect(filesService.deleteFiles).toHaveBeenCalledWith([
      '/uploads/portfolio/ok-1.webp',
    ]);
    // ...و هیچ تغییری در دیتابیس اعمال نمی‌شود.
    expect(barberService.updatePortfolioImages).not.toHaveBeenCalled();
  });
});
