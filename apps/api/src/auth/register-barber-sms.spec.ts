jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { SMS_TEMPLATES } from 'src/notification/sms-templates';

import { AuthService } from './auth.service';

/**
 * پس از تکمیل ثبت‌نام آرایشگر (ورود پروفایل به صف تایید ادمین) باید پیامک
 * قالب 573804 برای خود آرایشگر ارسال شود:
 *   «🔔 #NAME# عزیز، اطلاعات سالن شما در دست بررسی توسط کارشناسان ماست...»
 */
describe('AuthService.registerBarber — پیامک «پروفایل در حال بررسی» (573804)', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  const dto = {
    fullName: 'علی رضایی',
    phone: '09121234567',
    code: '1111',
    salonName: 'پیرایش کلاسیک',
    activityType: 'men',
    provinceId: 1,
    cityId: 2,
    address: 'تهران، خیابان نمونه',
    services: [],
  } as any;

  function buildHarness() {
    const createdUser = {
      id: 42,
      fullName: dto.fullName,
      phone: dto.phone,
      roles: ['user', 'barber'],
      isActive: true,
    };

    const usersService: any = {
      findWithPhone: jest.fn().mockResolvedValue(null),
      findWithNationalCode: jest.fn().mockResolvedValue(null),
      createWithRoles: jest.fn().mockResolvedValue(createdUser),
    };

    const otpService: any = { verifyOtp: jest.fn().mockResolvedValue(true) };
    const barberProfileService: any = {
      findByReferralCode: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'profile-1' }),
    };
    const servicesService: any = { create: jest.fn() };
    const referralService: any = { createReferral: jest.fn() };
    const userSubscriptionService: any = {
      grantFreePublicPageTrial: jest.fn().mockResolvedValue({
        subscription: { id: 'sub-trial-1' },
        created: true,
      }),
      grantFreeSmsTrial: jest.fn().mockResolvedValue({
        subscription: { id: 'sms-trial' },
        created: true,
      }),
      claimFreeTrialSms: jest.fn().mockResolvedValue(true),
    };
    const dataSource: any = {
      transaction: jest.fn((callback: any) => callback({})),
    };
    const jwtService: any = {
      signAsync: jest.fn().mockResolvedValue('token'),
    };
    const bookingSmsService: any = {
      sendBarberProfileSubmittedToBarber: jest
        .fn()
        .mockResolvedValue(undefined),
      sendPublicPageFreeTrialToBarber: jest.fn().mockResolvedValue(undefined),
    };
    const baleNotificationService: any = {
      notifyBarberRegistered: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AuthService(
      jwtService,
      usersService,
      otpService,
      barberProfileService,
      servicesService,
      referralService,
      userSubscriptionService,
      dataSource,
      {} as any, // session revocation is not used during registration
      baleNotificationService,
      bookingSmsService,
    );

    const response: any = { cookie: jest.fn() };

    return {
      service,
      response,
      bookingSmsService,
      createdUser,
      userSubscriptionService,
      referralService,
    };
  }

  it('بعد از ثبت‌نام، پیامک قالب 573804 با نام آرایشگر برای خودش ارسال می‌شود', async () => {
    const { service, response, bookingSmsService } = buildHarness();

    await service.registerBarber(dto, response);
    // ارسال پیامک عمداً fire-and-forget است
    await new Promise(resolve => setImmediate(resolve));

    expect(
      bookingSmsService.sendBarberProfileSubmittedToBarber,
    ).toHaveBeenCalledTimes(1);
    expect(
      bookingSmsService.sendBarberProfileSubmittedToBarber,
    ).toHaveBeenCalledWith('09121234567', { barberName: 'علی رضایی' });
    expect(SMS_TEMPLATES.BARBER_PROFILE_SUBMITTED).toBe(573804);
  });

  it('خطای ارسال پیامک، ثبت‌نام آرایشگر را نمی‌شکند', async () => {
    const { service, response, bookingSmsService } = buildHarness();
    bookingSmsService.sendBarberProfileSubmittedToBarber.mockRejectedValue(
      new Error('SMS gateway down'),
    );

    await expect(service.registerBarber(dto, response)).resolves.toBeDefined();
  });

  it('اگر سرویس پیامک در دسترس نباشد (تست‌ها/محیط بدون می‌ژول) ثبت‌نام انجام می‌شود', async () => {
    const { service, response } = buildHarness();

    (service as any).bookingSmsService = undefined;

    const result = await service.registerBarber(dto, response);

    expect(result.message).toContain('ثبت‌نام آرایشگر');
  });

  it('پس از ثبت‌نام موفق، دورهٔ رایگان پروفایل اختصاصی برای کاربر جدید اعطا می‌شود', async () => {
    const { service, response, userSubscriptionService } = buildHarness();

    await service.registerBarber(dto, response);

    expect(
      userSubscriptionService.grantFreePublicPageTrial,
    ).toHaveBeenCalledTimes(1);
    expect(
      userSubscriptionService.grantFreePublicPageTrial,
    ).toHaveBeenCalledWith(42, expect.anything());
    expect(userSubscriptionService.grantFreeSmsTrial).toHaveBeenCalledTimes(1);
    expect(userSubscriptionService.grantFreeSmsTrial).toHaveBeenCalledWith(
      42,
      userSubscriptionService.grantFreePublicPageTrial.mock.calls[0][1],
    );
  });

  it('خطای اعطای هدیهٔ پیامکی ثبت‌نام را ناموفق می‌کند', async () => {
    const { service, response, userSubscriptionService, bookingSmsService } =
      buildHarness();
    userSubscriptionService.grantFreeSmsTrial.mockRejectedValue(
      new Error('database failure'),
    );
    await expect(service.registerBarber(dto, response)).rejects.toThrow(
      'database failure',
    );
    expect(
      bookingSmsService.sendPublicPageFreeTrialToBarber,
    ).not.toHaveBeenCalled();
  });

  it('در صورت اعطای تازهٔ دورهٔ رایگان، پیامک فعال‌شدن برای آرایشگر ارسال می‌شود', async () => {
    const { service, response, bookingSmsService } = buildHarness();

    await service.registerBarber(dto, response);
    await new Promise(resolve => setImmediate(resolve));

    expect(
      bookingSmsService.sendPublicPageFreeTrialToBarber,
    ).toHaveBeenCalledTimes(1);
    expect(
      bookingSmsService.sendPublicPageFreeTrialToBarber,
    ).toHaveBeenCalledWith('09121234567', {
      barberName: dto.fullName,
    });
  });

  it('اگر دورهٔ رایگان تازه اعطا نشده باشد (کاربر تکراری)، پیامک رایگان ارسال نمی‌شود', async () => {
    const { service, response, bookingSmsService, userSubscriptionService } =
      buildHarness();
    userSubscriptionService.grantFreePublicPageTrial.mockResolvedValue({
      subscription: { id: 'sub-existing' },
      created: false,
    });

    await service.registerBarber(dto, response);
    await new Promise(resolve => setImmediate(resolve));

    expect(
      bookingSmsService.sendPublicPageFreeTrialToBarber,
    ).not.toHaveBeenCalled();
  });

  it('اگر claim پیامک رایگان گرفته نشود، پیامک تکراری ارسال نمی‌شود', async () => {
    const { service, response, bookingSmsService, userSubscriptionService } =
      buildHarness();
    userSubscriptionService.claimFreeTrialSms.mockResolvedValue(false);

    await service.registerBarber(dto, response);
    await new Promise(resolve => setImmediate(resolve));

    expect(
      bookingSmsService.sendPublicPageFreeTrialToBarber,
    ).not.toHaveBeenCalled();
  });

  it('خطای پیامک دورهٔ رایگان ثبت‌نام را نمی‌شکند', async () => {
    const { service, response, bookingSmsService } = buildHarness();
    bookingSmsService.sendPublicPageFreeTrialToBarber.mockRejectedValue(
      new Error('SMS gateway down'),
    );

    await expect(service.registerBarber(dto, response)).resolves.toBeDefined();
  });

  it('با غیرفعال‌بودن سیستم کد معرف، ثبت‌نام با کد معرف رد می‌شود', async () => {
    delete process.env.ENABLE_REFERRAL;
    const { service, response, referralService } = buildHarness();

    await expect(
      service.registerBarber({ ...dto, referralCode: 'ABC12345' }, response),
    ).rejects.toThrow(/کد معرف/);

    expect(referralService.createReferral).not.toHaveBeenCalled();
  });
});
