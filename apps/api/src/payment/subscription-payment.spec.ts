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
  function buildHarness(options?: { plan?: any }) {
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
    const planRepo = {
      findOne: jest.fn().mockResolvedValue(options?.plan ?? null),
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
      {} as any, // publicPageService
      {} as any, // subscriptionService
      {} as any, // userSubscriptionService
      {} as any, // referralService
      {} as any, // walletService
      { get: jest.fn() } as any, // configService
      {} as any, // dataSource
    );

    (service as any).requestZibalPayment = jest.fn().mockResolvedValue({
      trackId: 123,
      paymentUrl: 'https://gateway.test/pay',
    });

    return { service, savedPayments, planRepo };
  }

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
});
