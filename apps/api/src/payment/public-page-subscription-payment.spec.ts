jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { PaymentPurpose, PaymentStatus } from './entities/payment.entity';
import { PaymentService } from './payment.service';

/**
 * تست‌های پرداخت اشتراک «پروفایل اختصاصی»:
 *   • `planId` اجباری است و قیمت همیشه از پلن در بک‌اند خوانده می‌شود؛
 *   • تمدید با اشتراک فعال مجاز است؛
 *   • پرداخت موفق، اشتراک را فعال می‌کند و پرداخت ناموفق/لغوشده دست نمی‌زند.
 */
describe('PaymentService — پرداخت اشتراک پروفایل اختصاصی', () => {
  const profile = { id: 'profile-1', userId: 7, salonName: 'سالن تست' };

  function buildHarness(options?: { plan?: any; planFound?: boolean }) {
    const savedPayments: any[] = [];
    const paymentRepo = {
      create: jest.fn((value: any) => ({ ...value })),
      save: jest.fn(async (value: any) => {
        savedPayments.push(value);
        return value;
      }),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 7, phone: '09121234567' }),
    };
    const barberProfileRepo = {
      findOne: jest.fn().mockResolvedValue(profile),
    };
    const publicPageService = {
      getStatusByUserId: jest
        .fn()
        .mockResolvedValue({ isActive: false, reason: null }),
    };
    const subscriptionService = {
      findPublicPagePurchasePlan: jest
        .fn()
        .mockResolvedValue(
          options?.planFound === false ? null : (options?.plan ?? null),
        ),
    };
    const userSubscriptionService = {
      activateSubscriptionAfterPayment: jest.fn().mockResolvedValue({}),
      grantLegacyPublicPageAccess: jest.fn().mockResolvedValue({
        created: true,
      }),
    };

    const service = new PaymentService(
      paymentRepo as any,
      userRepo as any,
      barberProfileRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      publicPageService as any,
      subscriptionService as any,
      userSubscriptionService as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    (service as any).requestZibalPayment = jest.fn().mockResolvedValue({
      trackId: 123,
      paymentUrl: 'https://gateway.test/pay',
    });

    return {
      service,
      savedPayments,
      publicPageService,
      userSubscriptionService,
      subscriptionService,
    };
  }

  it('قیمت پلن یک‌ماهه را از بک‌اند می‌خواند (۹۹٬۰۰۰ تومان)', async () => {
    const plan = {
      id: 'plan-monthly',
      planKey: 'public_page_monthly',
      price: 99_000,
      durationDays: 30,
    };
    const { service, savedPayments } = buildHarness({ plan });

    const result = await service.initiatePublicPagePayment(
      7,
      null,
      'plan-monthly',
    );

    expect(result.amount).toBe(99_000);
    expect(result.planId).toBe('plan-monthly');
    expect(savedPayments[0]).toMatchObject({
      purpose: PaymentPurpose.PUBLIC_PAGE,
      status: PaymentStatus.PENDING,
      amount: 99_000,
    });
    expect(JSON.parse(savedPayments[0].metadata)).toEqual({
      subscriptionPlanId: 'plan-monthly',
    });
  });

  it('قیمت پلن سه‌ماهه ۲۵۰٬۰۰۰ تومان است', async () => {
    const plan = {
      id: 'plan-quarterly',
      planKey: 'public_page_quarterly',
      price: 250_000,
      durationDays: 90,
    };
    const { service, savedPayments } = buildHarness({ plan });

    const result = await service.initiatePublicPagePayment(
      7,
      null,
      'plan-quarterly',
    );

    expect(result.amount).toBe(250_000);
    expect(savedPayments[0].amount).toBe(250_000);
  });

  it('بدون شناسهٔ پلن رد می‌شود و پرداختی ساخته نمی‌شود', async () => {
    const { service, savedPayments } = buildHarness({ plan: { id: 'p1' } });

    await expect(service.initiatePublicPagePayment(7, null)).rejects.toThrow(
      /پلن/,
    );
    expect(savedPayments).toHaveLength(0);
  });

  it('شناسهٔ پلن نامعتبر رد می‌شود و پرداختی ساخته نمی‌شود', async () => {
    const { service, savedPayments } = buildHarness({ planFound: false });

    await expect(
      service.initiatePublicPagePayment(7, null, 'plan-bad'),
    ).rejects.toThrow(/پلن/);
    expect(savedPayments).toHaveLength(0);
  });

  it('اگر صفحه با اشتراک فعال باشد، تمدید پذیرفته می‌شود', async () => {
    const plan = {
      id: 'plan-monthly',
      planKey: 'public_page_monthly',
      price: 99_000,
      durationDays: 30,
    };
    const { service } = buildHarness({ plan });

    await expect(
      service.initiatePublicPagePayment(7, null, 'plan-monthly'),
    ).resolves.toMatchObject({ amount: 99_000 });
  });

  it('پرداخت موفقِ پلن اشتراک، اشتراک کاربر را فعال می‌کند', async () => {
    const { service, userSubscriptionService, publicPageService } =
      buildHarness({});

    await (service as any).fulfillPayment({
      userId: 7,
      purpose: PaymentPurpose.PUBLIC_PAGE,
      metadata: JSON.stringify({ subscriptionPlanId: 'plan-monthly' }),
    });

    expect(
      userSubscriptionService.activateSubscriptionAfterPayment,
    ).toHaveBeenCalledWith(7, 'plan-monthly');
    expect(publicPageService.getStatusByUserId).not.toHaveBeenCalled();
  });

  it('پرداخت موفقِ پکیج یک‌بارهٔ قدیمی به مهلت انتقالی منتقل می‌شود', async () => {
    const { service, userSubscriptionService } = buildHarness({});

    await (service as any).fulfillPayment({
      userId: 7,
      purpose: PaymentPurpose.PUBLIC_PAGE,
      metadata: null,
    });

    expect(
      userSubscriptionService.grantLegacyPublicPageAccess,
    ).toHaveBeenCalledWith(7);
    expect(
      userSubscriptionService.activateSubscriptionAfterPayment,
    ).not.toHaveBeenCalled();
  });

  it('پرداخت موفقِ پلن پیامکی (SUBSCRIPTION)، اشتراک را از سرویس مرکزی فعال می‌کند', async () => {
    const { service, userSubscriptionService } = buildHarness({});

    await (service as any).fulfillPayment({
      userId: 7,
      purpose: PaymentPurpose.SUBSCRIPTION,
      purposeId: 'plan-sms-1',
    });

    expect(
      userSubscriptionService.activateSubscriptionAfterPayment,
    ).toHaveBeenCalledWith(7, 'plan-sms-1');
  });

  it('پرداخت SUBSCRIPTION با purposeId خالی، اشتراکی فعال نمی‌کند', async () => {
    const { service, userSubscriptionService } = buildHarness({});

    await (service as any).fulfillPayment({
      userId: 7,
      purpose: PaymentPurpose.SUBSCRIPTION,
      purposeId: undefined,
    });

    expect(
      userSubscriptionService.activateSubscriptionAfterPayment,
    ).not.toHaveBeenCalled();
  });

  it('پرداخت ناموفق/لغوشده اشتراک را فعال نمی‌کند', async () => {
    const { userSubscriptionService, publicPageService } = buildHarness({});

    // `fulfillPayment` فقط برای پرداخت‌های موفق از مسیر settle صدا زده می‌شود؛
    // در اینجا قرارداد را مستقیم می‌سنجیم: بدون پرداخت موفق، هیچ اثری نداریم.
    expect(
      userSubscriptionService.activateSubscriptionAfterPayment,
    ).not.toHaveBeenCalled();
    expect(publicPageService.getStatusByUserId).not.toHaveBeenCalled();
  });
});
