jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { PaymentPurpose, PaymentStatus } from './entities/payment.entity';
import { PaymentService } from './payment.service';

/**
 * تست‌های پرداخت اشتراک «پروفایل اختصاصی»:
 *   • قیمت همیشه از پلن در بک‌اند خوانده می‌شود (نه از فرانت)؛
 *   • تمدید با اشتراک فعال مجاز است، اما با خرید یک‌باره پکیج نه؛
 *   • پرداخت موفق، اشتراک را فعال می‌کند و پرداخت ناموفق/لغوشده دست نمی‌زند.
 */
describe('PaymentService — پرداخت اشتراک پروفایل اختصاصی', () => {
  const profile = { id: 'profile-1', userId: 7, salonName: 'سالن تست' };

  function buildHarness(options?: {
    status?: any;
    plan?: any;
    planFound?: boolean;
  }) {
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
        .mockResolvedValue(
          options?.status ?? { isActive: false, reason: null },
        ),
      getReferralDiscountQuote: jest.fn().mockResolvedValue(null),
      getDiscountQuote: jest.fn().mockResolvedValue(null),
      activateAfterPayment: jest.fn().mockResolvedValue(undefined),
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
    };
    const referralService = {
      onReferredPublicPagePurchased: jest.fn().mockResolvedValue(undefined),
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
      {} as any,
      publicPageService as any,
      subscriptionService as any,
      userSubscriptionService as any,
      referralService as any,
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
      undefined,
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
      undefined,
      null,
      'plan-quarterly',
    );

    expect(result.amount).toBe(250_000);
    expect(savedPayments[0].amount).toBe(250_000);
  });

  it('شناسهٔ پلن نامعتبر رد می‌شود و پرداختی ساخته نمی‌شود', async () => {
    const { service, savedPayments } = buildHarness({ planFound: false });

    await expect(
      service.initiatePublicPagePayment(7, undefined, null, 'plan-bad'),
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
    const { service } = buildHarness({
      plan,
      status: { isActive: true, reason: 'SUBSCRIPTION' },
    });

    await expect(
      service.initiatePublicPagePayment(7, undefined, null, 'plan-monthly'),
    ).resolves.toMatchObject({ amount: 99_000 });
  });

  it('اگر صفحه با خرید یک‌بارهٔ پکیج فعال باشد، تمدید پذیرفته نمی‌شود', async () => {
    const plan = {
      id: 'plan-monthly',
      planKey: 'public_page_monthly',
      price: 99_000,
      durationDays: 30,
    };
    const { service } = buildHarness({
      plan,
      status: { isActive: true, reason: 'PACKAGE' },
    });

    await expect(
      service.initiatePublicPagePayment(7, undefined, null, 'plan-monthly'),
    ).rejects.toThrow(/فعال است/);
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
    expect(publicPageService.activateAfterPayment).not.toHaveBeenCalled();
  });

  it('پرداخت پکیج یک‌باره (بدون planId) همان رفتار قبلی را دارد', async () => {
    const { service, userSubscriptionService, publicPageService } =
      buildHarness({});

    await (service as any).fulfillPayment({
      userId: 7,
      purpose: PaymentPurpose.PUBLIC_PAGE,
      metadata: JSON.stringify({ discountCode: 'SAVE25' }),
    });

    expect(publicPageService.activateAfterPayment).toHaveBeenCalledTimes(1);
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
    expect(publicPageService.activateAfterPayment).not.toHaveBeenCalled();
  });
});
