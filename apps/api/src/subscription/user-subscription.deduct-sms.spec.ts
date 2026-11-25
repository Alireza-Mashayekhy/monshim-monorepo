/**
 * تست‌های واحد کسر اتمیک سهمیهٔ پیامک (`deductSms`).
 *
 * سناریوهای پوشش‌داده‌شده:
 * ۱. بدون اشتراک پیامکی → خطای «پلن را خریداری کنید» و هیچ کسری.
 * ۲. اعتبار ناکافی → خطای دقیق با عدد باقی‌مانده و هیچ کسری.
 * ۳. کسر موفق → UPDATE شرطی اتمیک + ثبت در دفتر مصرف + بازگشت اشتراک تازه.
 * ۴. باخت رقابت هم‌زمانی (affected=0) → خطا و هیچ ثبت مصرف.
 * ۵. حالت تراکنشی: همهٔ خوانش/نوشت‌ها از EntityManager همان تراکنش.
 */
import { EntityManager } from 'typeorm';

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_HOUR: '0 0 * * * *' },
}));

import { UserSubscriptionStatus } from './entities/user-subscription.entity';
import { UserSubscriptionService } from './user-subscription.service';

function buildQueryBuilder(end: { getOne?: unknown; affected?: number }) {
  const qb: any = {};
  for (const method of [
    'where',
    'andWhere',
    'update',
    'set',
    'setParameters',
    'orderBy',
    'innerJoinAndSelect',
  ]) {
    qb[method] = jest.fn().mockReturnThis();
  }
  qb.getOne = jest.fn().mockResolvedValue(end.getOne ?? null);
  qb.execute = jest.fn().mockResolvedValue({ affected: end.affected ?? 1 });
  return qb;
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 100,
    subscriptionPlanId: 'plan-1',
    price: 59000,
    smsTotal: 10,
    smsUsed: 8,
    status: UserSubscriptionStatus.ACTIVE,
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2099-07-01T00:00:00.000Z'),
    subscriptionPlan: { planType: 'sms', planKey: 'starter' },
    ...overrides,
  };
}

type Harness = {
  service: UserSubscriptionService;
  subscriptionRepo: any;
  smsUsageRepo: any;
  readQb: ReturnType<typeof buildQueryBuilder>;
  writeQb: ReturnType<typeof buildQueryBuilder>;
};

function buildHarness(options?: {
  subscription?: unknown;
  updateAffected?: number;
}): Harness {
  const readQb = buildQueryBuilder({ getOne: options?.subscription ?? null });
  const writeQb = buildQueryBuilder({
    affected: options?.updateAffected ?? 1,
  });

  const subscriptionRepo: any = {
    createQueryBuilder: jest.fn(() => readQb),
    findOne: jest.fn().mockResolvedValue(options?.subscription ?? null),
    find: jest.fn().mockResolvedValue([]),
    manager: { transaction: jest.fn() },
  };
  const smsUsageRepo: any = {
    create: jest.fn(input => ({ ...input })),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const planRepo: any = { find: jest.fn().mockResolvedValue([]) };

  // دوباره: getCurrent از createQueryBuilder('subscription') و کسر از
  // createQueryBuilder() استفاده می‌کند — ترتیب فراخوانی را جدا می‌کنیم.
  subscriptionRepo.createQueryBuilder = jest
    .fn()
    .mockImplementation((alias?: string) => (alias ? readQb : writeQb));

  const service = new UserSubscriptionService(
    subscriptionRepo,
    planRepo,
    smsUsageRepo,
    {} as any,
    undefined,
  );

  return { service, subscriptionRepo, smsUsageRepo, readQb, writeQb };
}

describe('UserSubscriptionService.deductSms', () => {
  it('rejects with a clear message when there is no active SMS subscription', async () => {
    const { service, writeQb, smsUsageRepo } = buildHarness({
      subscription: null,
    });

    await expect(service.deductSms(100, 2, 'تست')).rejects.toThrow(
      'برای ارسال پیامک ابتدا باید یکی از پلن‌های اشتراک را خریداری کنید',
    );

    expect(writeQb.execute).not.toHaveBeenCalled();
    expect(smsUsageRepo.save).not.toHaveBeenCalled();
  });

  it('rejects with the exact remaining credit when the quota is insufficient', async () => {
    const { service, writeQb, smsUsageRepo } = buildHarness({
      subscription: makeSubscription({ smsTotal: 10, smsUsed: 9 }),
    });

    await expect(service.deductSms(100, 2, 'تست')).rejects.toThrow(
      'اعتبار پیامک کافی نیست (پیامک باقی‌مانده: 1)',
    );

    expect(writeQb.execute).not.toHaveBeenCalled();
    expect(smsUsageRepo.save).not.toHaveBeenCalled();
  });

  it('deducts atomically and records the usage ledger entry', async () => {
    const subscription = makeSubscription({ smsTotal: 10, smsUsed: 8 });
    const { service, writeQb, smsUsageRepo, subscriptionRepo } = buildHarness({
      subscription,
    });

    const result = await service.deductSms(100, 2, 'پیامک تأیید نوبت دستی');

    // UPDATE شرطی اتمیک: فقط وقتی sms_used + count <= sms_total
    expect(writeQb.update).toHaveBeenCalled();
    expect(writeQb.where).toHaveBeenCalledWith('id = :id', { id: 'sub-1' });
    expect(writeQb.andWhere).toHaveBeenCalledWith(
      'sms_used + :count <= sms_total',
    );
    expect(writeQb.execute).toHaveBeenCalledTimes(1);

    // ثبت در دفتر مصرف پیامک
    expect(smsUsageRepo.create).toHaveBeenCalledWith({
      userId: 100,
      userSubscriptionId: 'sub-1',
      count: 2,
      reason: 'پیامک تأیید نوبت دستی',
    });
    expect(smsUsageRepo.save).toHaveBeenCalledTimes(1);

    // بازگشت وضعیت تازهٔ همان اشتراک
    expect(subscriptionRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
    });
    expect(result).toBe(subscription);
  });

  it('loses the race safely: no ledger entry when the conditional update affects nothing', async () => {
    // درخواست هم‌زمان اعتبار را برده و شرط UPDATE دیگر برقرار نیست
    const { service, smsUsageRepo } = buildHarness({
      subscription: makeSubscription({ smsTotal: 10, smsUsed: 9 }),
      updateAffected: 0,
    });

    await expect(service.deductSms(100, 1, 'تست رقابت')).rejects.toThrow(
      'اعتبار پیامک کافی نیست یا اشتراک شما تغییر کرده است. صفحه را بازخوانی کنید',
    );

    expect(smsUsageRepo.save).not.toHaveBeenCalled();
  });

  it('runs every read and write through the transaction manager when provided', async () => {
    const subscription = makeSubscription({ smsTotal: 10, smsUsed: 6 });
    const readQb = buildQueryBuilder({ getOne: subscription });
    const writeQb = buildQueryBuilder({ affected: 1 });

    const txSubscriptionRepo: any = {
      createQueryBuilder: jest
        .fn()
        .mockImplementation((alias?: string) => (alias ? readQb : writeQb)),
      findOne: jest.fn().mockResolvedValue(subscription),
    };
    const txSmsUsageRepo: any = {
      create: jest.fn(input => ({ ...input })),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const manager = {
      getRepository: jest.fn(entity => {
        if (entity.name === 'UserSubscription') {
          return txSubscriptionRepo;
        }
        if (entity.name === 'SmsUsage') {
          return txSmsUsageRepo;
        }
        throw new Error(`unexpected entity: ${entity.name}`);
      }),
    } as unknown as EntityManager;

    const subscriptionRepo: any = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    const smsUsageRepo: any = { create: jest.fn(), save: jest.fn() };

    const service = new UserSubscriptionService(
      subscriptionRepo,
      {} as any,
      smsUsageRepo,
      {} as any,
      undefined,
    );

    const result = await service.deductSms(
      100,
      2,
      'پیامک تأیید نوبت دستی',
      manager,
    );

    // همهٔ عملیات از رپوهای تراکنش انجام شده‌اند
    const requestedEntities = (
      manager.getRepository as jest.Mock
    ).mock.calls.map(call => call[0]);
    expect(requestedEntities).toHaveLength(3);
    expect(
      requestedEntities.filter(entity => entity.name === 'UserSubscription'),
    ).toHaveLength(2);
    expect(requestedEntities.some(entity => entity.name === 'SmsUsage')).toBe(
      true,
    );
    expect(txSubscriptionRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(writeQb.execute).toHaveBeenCalledTimes(1);
    expect(txSmsUsageRepo.save).toHaveBeenCalledTimes(1);
    expect(txSubscriptionRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
    });

    // هیچ عملیاتی از رپوهای بیرونِ تراکنش نرفته است
    expect(subscriptionRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(smsUsageRepo.save).not.toHaveBeenCalled();
    expect(result).toBe(subscription);
  });

  it('rejects non-positive counts before touching the database', async () => {
    const { service, readQb } = buildHarness({
      subscription: makeSubscription(),
    });

    await expect(service.deductSms(100, 0, 'تست')).rejects.toThrow(
      'تعداد پیامک برای کسر باید حداقل ۱ باشد',
    );

    expect(readQb.getOne).not.toHaveBeenCalled();
  });
});
