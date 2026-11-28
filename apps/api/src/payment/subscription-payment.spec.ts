jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { PaymentPurpose, PaymentStatus } from './entities/payment.entity';
import { PaymentService } from './payment.service';

/**
 * تست‌های آغاز پرداخت «اشتراک پیامکی» (SUBSCRIPTION):
 *   • پلن‌های نوع `public_page` (و هر نوع دیگر) از این مسیر رد می‌شوند؛
 *     مسیر آغاز پرداخت آن‌ها مسیر اختصاصی /payment/public-page است.
 *   • پلن sms غیرفعال یا نامعتبر نیز رد می‌شود و پرداختی ساخته نمی‌شود.
 */
describe('PaymentService — آغاز پرداخت اشتراک پیامکی (SUBSCRIPTION)', () => {
  function buildHarness(options?: {
    plan?: any;
    /** نتیجهٔ موفق `getDiscountQuote` برای تست مسیر کد تخفیف */
    discountQuote?: any;
  }) {
    const savedPayments: any[] = [];
    const paymentRepo = {
      create: jest.fn((value: any) => ({ ...value })),
      save: jest.fn(async (value: any) => {
        // مشابه DB: رکورد ذخیره‌شده شناسه دارد (برای ثبت مصرف کد تخفیف).
        const saved = { id: `pay-${savedPayments.length + 1}`, ...value };
        savedPayments.push(saved);
        return saved;
      }),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 7, phone: '09121234567' }),
    };
    const planRepo = {
      findOne: jest.fn().mockResolvedValue(options?.plan ?? null),
    };
    const publicPageService = {
      getDiscountQuote: jest
        .fn()
        .mockResolvedValue(options?.discountQuote ?? null),
      recordDiscountUsage: jest.fn().mockResolvedValue(true),
    };
    const userSubscriptionService = {
      activateSubscriptionAfterPayment: jest.fn().mockResolvedValue({}),
    };

    const service = new PaymentService(
      paymentRepo as any,
      userRepo as any,
      {} as any, // barberProfileRepo
      planRepo as any, // planRepo
      {} as any, // serviceRepo
      {} as any, // bookingRepo
      {} as any, // slotHoldRepo
      {} as any, // settingsRepo
      {} as any, // workHoursRepo
      {} as any, // bookingSmsService
      publicPageService as any,
      {} as any, // subscriptionService
      userSubscriptionService as any,
      {} as any, // referralService
      {} as any, // walletService
      { get: jest.fn() } as any, // configService
      {} as any, // dataSource
    );

    (service as any).requestZibalPayment = jest.fn().mockResolvedValue({
      trackId: 123,
      paymentUrl: 'https://gateway.test/pay',
    });

    return {
      service,
      savedPayments,
      planRepo,
      publicPageService,
      userSubscriptionService,
    };
  }

  it.each([
    { planKey: 'sms_trial', price: 0 },
    { planKey: 'sms_trial', price: 100 },
    { planKey: 'starter', price: 0 },
    { planKey: 'starter', price: -1 },
    { planKey: 'unknown', price: 100 },
  ])('پلن غیرقابل خرید $planKey با قیمت $price رد می‌شود', async plan => {
    const {
      service,
      savedPayments,
      publicPageService,
      userSubscriptionService,
    } = buildHarness({
      plan: { id: 'plan', planType: 'sms', isActive: true, ...plan },
    });
    await expect(
      service.initiateSubscriptionPayment(7, {
        subscriptionPlanId: 'plan',
        discountCode: 'SMSFREE',
      }),
    ).rejects.toThrow('این پلن پیامکی قابل خرید نیست');
    expect(publicPageService.getDiscountQuote).not.toHaveBeenCalled();
    expect(
      userSubscriptionService.activateSubscriptionAfterPayment,
    ).not.toHaveBeenCalled();
    expect(savedPayments).toHaveLength(0);
  });

  it('پلن پیامکی معتبر پذیرفته می‌شود و پرداخت PENDING ساخته می‌شود', async () => {
    const { service, savedPayments, planRepo } = buildHarness({
      plan: {
        id: 'plan-sms-1',
        planKey: 'basic',
        planType: 'sms',
        price: 169_000,
        durationDays: 30,
        isActive: true,
      },
    });

    const result = await service.initiateSubscriptionPayment(7, {
      subscriptionPlanId: 'plan-sms-1',
    });

    expect(planRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'plan-sms-1', isActive: true, planType: 'sms' },
    });
    expect(result.amount).toBe(169_000);
    expect(savedPayments[0]).toMatchObject({
      purpose: PaymentPurpose.SUBSCRIPTION,
      status: PaymentStatus.PENDING,
      amount: 169_000,
      purposeId: 'plan-sms-1',
    });
  });

  it('پلن نوع public_page رد می‌شود و پرداختی ساخته نمی‌شود', async () => {
    const { service, savedPayments, planRepo } = buildHarness({
      plan: null, // کوئریِ planType='sms' برای پلن public_page نتیجه‌ای نمی‌دهد
    });

    await expect(
      service.initiateSubscriptionPayment(7, {
        subscriptionPlanId: 'plan-public-page-1',
      }),
    ).rejects.toThrow(/پلن/);
    expect(planRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'plan-public-page-1',
        isActive: true,
        planType: 'sms',
      },
    });
    expect(savedPayments).toHaveLength(0);
  });

  it('پلن sms غیرفعال یا نامعتبر رد می‌شود و پرداختی ساخته نمی‌شود', async () => {
    const { service, savedPayments } = buildHarness({ plan: null });

    await expect(
      service.initiateSubscriptionPayment(7, {
        subscriptionPlanId: 'plan-inactive',
      }),
    ).rejects.toThrow(/پلن/);
    expect(savedPayments).toHaveLength(0);
  });

  describe('کد تخفیف خرید اشتراک پیامکی (SUBSCRIPTION)', () => {
    const smsPlan = {
      id: 'plan-sms-1',
      planKey: 'basic',
      planType: 'sms',
      price: 169_000,
      durationDays: 30,
      isActive: true,
    };

    it('کد تخفیف مبلغ نهایی را کم می‌کند، در metadata ثبت می‌شود و سهمیه نمی‌سوزد', async () => {
      const { service, savedPayments, publicPageService } = buildHarness({
        plan: smsPlan,
        discountQuote: {
          discountId: 'disc-sub',
          code: 'SMS20',
          percentOff: 20,
          applicableTo: 'SUBSCRIPTION',
          planId: 'plan-sms-1',
          target: 'SUBSCRIPTION',
          originalAmount: 169_000,
          discountAmount: 33_800,
          amount: 135_200,
        },
      });

      const result = await service.initiateSubscriptionPayment(7, {
        subscriptionPlanId: 'plan-sms-1',
        discountCode: 'SMS20',
      });

      expect(publicPageService.getDiscountQuote).toHaveBeenCalledWith({
        userId: 7,
        code: 'SMS20',
        target: 'SUBSCRIPTION',
        planId: 'plan-sms-1',
      });
      expect(result).toMatchObject({
        amount: 135_200,
        originalAmount: 169_000,
        discountAmount: 33_800,
        discountPercent: 20,
        discountCode: 'SMS20',
      });
      expect(savedPayments[0].amount).toBe(135_200);
      expect(JSON.parse(savedPayments[0].metadata)).toEqual({
        discount: {
          id: 'disc-sub',
          code: 'SMS20',
          percentOff: 20,
          amount: 33_800,
        },
      });
      // سهمیه فقط هنگام «پرداخت موفق» سوزانده می‌شود، نه هنگام آغاز پرداخت.
      expect(publicPageService.recordDiscountUsage).not.toHaveBeenCalled();
    });

    it('کد ۱۰۰٪: بدون درگاه، پرداخت PAID، اشتراک فعال و مصرف کد همان لحظه ثبت می‌شود', async () => {
      const {
        service,
        savedPayments,
        publicPageService,
        userSubscriptionService,
      } = buildHarness({
        plan: smsPlan,
        discountQuote: {
          discountId: 'disc-sub-free',
          code: 'SMSFREE',
          percentOff: 100,
          applicableTo: 'BOTH',
          planId: 'plan-sms-1',
          target: 'SUBSCRIPTION',
          originalAmount: 169_000,
          discountAmount: 169_000,
          amount: 0,
        },
      });
      (service as any).requestZibalPayment = jest.fn();

      const result = await service.initiateSubscriptionPayment(7, {
        subscriptionPlanId: 'plan-sms-1',
        discountCode: 'SMSFREE',
      });

      expect(result).toMatchObject({
        free: true,
        amount: 0,
        discountCode: 'SMSFREE',
        discountAmount: 169_000,
        discountPercent: 100,
      });
      expect((service as any).requestZibalPayment).not.toHaveBeenCalled();
      expect(savedPayments[0]).toMatchObject({
        status: PaymentStatus.PAID,
        amount: 0,
        purposeId: 'plan-sms-1',
      });
      expect(
        userSubscriptionService.activateSubscriptionAfterPayment,
      ).toHaveBeenCalledWith(7, 'plan-sms-1');
      expect(publicPageService.recordDiscountUsage).toHaveBeenCalledWith({
        discountId: 'disc-sub-free',
        userId: 7,
        paymentId: 'pay-1',
        purpose: 'SUBSCRIPTION',
        discountAmount: 169_000,
      });
    });

    it('مبلغ نهاییِ کمتر از حداقل مجاز درگاه با خطای فارسی رد می‌شود', async () => {
      const { service, savedPayments } = buildHarness({
        plan: { ...smsPlan, id: 'plan-cheap', price: 500 },
        discountQuote: {
          discountId: 'disc-90',
          code: 'OFF90',
          percentOff: 90,
          applicableTo: 'BOTH',
          planId: 'plan-cheap',
          target: 'SUBSCRIPTION',
          originalAmount: 500,
          discountAmount: 450,
          amount: 50,
        },
      });

      await expect(
        service.initiateSubscriptionPayment(7, {
          subscriptionPlanId: 'plan-cheap',
          discountCode: 'OFF90',
        }),
      ).rejects.toThrow(/حداقل مجاز درگاه/);
      expect(savedPayments).toHaveLength(0);
    });

    it.each([
      'زمان استفاده از این کد تخفیف هنوز شروع نشده است',
      'مهلت استفاده از این کد تخفیف به پایان رسیده است',
    ])(
      'propagates validity error without creating payment: %s',
      async message => {
        const { service, savedPayments, publicPageService } = buildHarness({
          plan: smsPlan,
        });
        publicPageService.getDiscountQuote.mockRejectedValueOnce(
          new Error(message),
        );
        await expect(
          service.initiateSubscriptionPayment(7, {
            subscriptionPlanId: 'plan-sms-1',
            discountCode: 'RANGE',
          }),
        ).rejects.toThrow(message);
        expect(savedPayments).toHaveLength(0);
      },
    );

    it('کد نامعتبر (خطای اعتبارسنجی بک‌اند) پرداختی نمی‌سازد', async () => {
      const { service, savedPayments, publicPageService } = buildHarness({
        plan: smsPlan,
      });
      publicPageService.getDiscountQuote.mockRejectedValueOnce(
        new Error('سقف استفاده شما از این کد تخفیف تکمیل شده است'),
      );

      await expect(
        service.initiateSubscriptionPayment(7, {
          subscriptionPlanId: 'plan-sms-1',
          discountCode: 'PERUSER1',
        }),
      ).rejects.toThrow('سقف استفاده شما از این کد تخفیف تکمیل شده است');
      expect(savedPayments).toHaveLength(0);
    });

    it('پرداخت موفقِ اشتراک دارای کد، مصرف کد را هنگام تسویه ثبت می‌کند', async () => {
      const { service, publicPageService, userSubscriptionService } =
        buildHarness({ plan: smsPlan });

      await (service as any).fulfillPayment({
        id: 'pay-7',
        userId: 7,
        purpose: PaymentPurpose.SUBSCRIPTION,
        purposeId: 'plan-sms-1',
        metadata: JSON.stringify({
          discount: {
            id: 'disc-sub',
            code: 'SMS20',
            percentOff: 20,
            amount: 33_800,
          },
        }),
      });

      expect(publicPageService.recordDiscountUsage).toHaveBeenCalledWith({
        discountId: 'disc-sub',
        userId: 7,
        paymentId: 'pay-7',
        purpose: 'SUBSCRIPTION',
        discountAmount: 33_800,
      });
      expect(
        userSubscriptionService.activateSubscriptionAfterPayment,
      ).toHaveBeenCalledWith(7, 'plan-sms-1');
    });
  });
});
