import { BadRequestException, ConflictException } from '@nestjs/common';

import { AuthController } from './auth.controller';

/**
 * تست قرارداد «فایل‌ها و ثبت‌نام اتمیک».
 *
 * قانون طلایی: وضعیت فایل روی دیسک باید با وضعیت دیتابیس یکی باشد.
 *   • ثبت‌نام ناموفق → هیچ فایل تازه‌ای نباید باقی بماند.
 *   • ثبت‌نام موفق  → هیچ فایلی نباید پاک شود (حتی اگر پاسخ‌دهی خطا بدهد).
 */
describe('AuthController.registerBarber — rollback فایل‌ها', () => {
  function createHarness(options: {
    registerError?: Error;
    saveError?: Error;
  }) {
    const savedPaths: string[] = [];
    let counter = 0;

    const filesService = {
      saveFile: jest.fn(async () => {
        if (options.saveError) throw options.saveError;
        counter += 1;
        const path = `/uploads/profiles/p${counter}.webp`;
        savedPaths.push(path);
        return path;
      }),
      saveMultipleFiles: jest.fn(async (files: unknown[]) => {
        if (options.saveError) throw options.saveError;
        return files.map(() => {
          counter += 1;
          const path = `/uploads/portfolio/p${counter}.webp`;
          savedPaths.push(path);
          return path;
        });
      }),
      deleteFiles: jest.fn(),
    };

    const authService = {
      registerBarber: jest.fn(
        async (
          _dto: unknown,
          _response: unknown,
          outcome?: { persisted: boolean },
        ) => {
          if (options.registerError) throw options.registerError;
          // قرارداد واقعی: سرویس پس از commit پرچم را true می‌کند.
          if (outcome) outcome.persisted = true;
          return { message: 'ok' };
        },
      ),
    };

    const controller = new AuthController(
      authService as never,
      filesService as never,
    );

    return { controller, filesService, authService };
  }

  const multipartFile = (name: string): Express.Multer.File =>
    ({
      buffer: Buffer.from('x'),
      size: 1,
      originalname: name,
      mimetype: 'image/png',
    }) as Express.Multer.File;

  const baseDto = () =>
    ({
      fullName: 'مریم',
      phone: '09120000000',
      salonName: 'سالن',
      activityType: 'women',
      provinceId: 1,
      cityId: 1,
      address: 'خیابان',
      code: '1234',
      password: 'secret1',
    }) as never;

  const response = {} as never;

  it('ثبت‌نام موفق: فایل‌ها پاک نمی‌شوند و مسیرها به DTO می‌رسند', async () => {
    const { controller, filesService, authService } = createHarness({});

    await controller.registerBarber(
      {
        profileImage: [multipartFile('logo.png')],
        portfolio: [multipartFile('a.png'), multipartFile('b.png')],
      },
      baseDto(),
      response,
    );

    expect(filesService.deleteFiles).not.toHaveBeenCalled();
    const dto = (
      authService.registerBarber.mock.calls as unknown as [
        [{ profileImage?: string; portfolioImages?: string[] }],
      ]
    )[0][0];
    expect(dto.profileImage).toBe('/uploads/profiles/p1.webp');
    expect(dto.portfolioImages).toEqual([
      '/uploads/portfolio/p2.webp',
      '/uploads/portfolio/p3.webp',
    ]);
  });

  it('شمارهٔ تکراری (Conflict): فایل‌های تازه پاک می‌شوند', async () => {
    const { controller, filesService } = createHarness({
      registerError: new ConflictException('این شماره قبلاً ثبت شده است'),
    });

    await expect(
      controller.registerBarber(
        {
          profileImage: [multipartFile('logo.png')],
          portfolio: [multipartFile('a.png')],
        },
        baseDto(),
        response,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(filesService.deleteFiles).toHaveBeenCalledTimes(1);
    expect(filesService.deleteFiles).toHaveBeenCalledWith([
      '/uploads/profiles/p1.webp',
      '/uploads/portfolio/p2.webp',
    ]);
  });

  it('خطای پس از commit (مثلاً صدور توکن): فایل‌ها حفظ می‌شوند', async () => {
    /**
     * سناریوی واقعی: کاربر و پروفایل در دیتابیس ثبت شده‌اند اما صدور توکن یا
     * نوشتن پاسخ شکست می‌خورد. پیش‌تر همین حالت فایل‌ها را پاک می‌کرد و
     * پروفایل ذخیره‌شده تصاویر شکسته پیدا می‌کرد.
     */
    const { controller, filesService, authService } = createHarness({});
    authService.registerBarber.mockImplementation(
      async (
        _dto: unknown,
        _response: unknown,
        outcome?: { persisted: boolean },
      ) => {
        if (outcome) outcome.persisted = true;
        throw new Error('response stream failed');
      },
    );

    await expect(
      controller.registerBarber(
        { portfolio: [multipartFile('a.png')] },
        baseDto(),
        response,
      ),
    ).rejects.toThrow('response stream failed');

    expect(filesService.deleteFiles).not.toHaveBeenCalled();
  });

  it('خطای پیش از commit: فایل‌ها پاک می‌شوند', async () => {
    const { controller, filesService } = createHarness({
      registerError: new Error('transaction rolled back'),
    });

    await expect(
      controller.registerBarber(
        { portfolio: [multipartFile('a.png')] },
        baseDto(),
        response,
      ),
    ).rejects.toThrow('transaction rolled back');

    expect(filesService.deleteFiles).toHaveBeenCalledTimes(1);
  });

  it('خطای ذخیره‌سازی فایل: هیچ فایلی پاک نمی‌شود چون چیزی ذخیره نشده', async () => {
    const { controller, filesService } = createHarness({
      saveError: new BadRequestException('فرمت فایل مجاز نیست'),
    });

    await expect(
      controller.registerBarber(
        { portfolio: [multipartFile('a.png')] },
        baseDto(),
        response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(filesService.deleteFiles).toHaveBeenCalledWith([]);
  });

  it('بدون فایل: ثبت‌نام بدون آپلود انجام می‌شود', async () => {
    const { controller, filesService, authService } = createHarness({});

    await controller.registerBarber(undefined, baseDto(), response);

    expect(filesService.saveFile).not.toHaveBeenCalled();
    expect(filesService.saveMultipleFiles).not.toHaveBeenCalled();
    expect(authService.registerBarber).toHaveBeenCalledTimes(1);
  });

  it('فیلدهای تصویری کلاینت نادیده گرفته می‌شوند (مسیر جعلی قابل تزریق نیست)', async () => {
    const { controller, authService } = createHarness({});
    const dto = {
      ...(baseDto() as Record<string, unknown>),
      profileImage: '/uploads/profiles/attacker.webp',
      portfolioImages: ['/uploads/portfolio/attacker.webp'],
    };

    await controller.registerBarber(undefined, dto, response);

    const passed = (
      authService.registerBarber.mock.calls as unknown as [
        [Record<string, unknown>],
      ]
    )[0][0];
    expect(passed.profileImage).toBeUndefined();
    expect(passed.portfolioImages).toBeUndefined();
  });
});
