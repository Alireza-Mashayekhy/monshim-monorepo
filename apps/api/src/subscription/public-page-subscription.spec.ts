jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { UserSubscriptionStatus } from './entities/user-subscription.entity';
import { addCalendarMonths, addPlanDuration } from './subscription-dates';
import { UserSubscriptionService } from './user-subscription.service';

/**
 * تست‌های اشتراک «پروفایل اختصاصی»:
 *   • محاسبهٔ دقیق مدت اعتبار بر اساس ماه تقویمی؛
 *   • اعطای خودکار دورهٔ رایگان پس از ثبت‌نام (یک‌بار و idempotent)؛
 *   • تمدید قبل از انقضا (جمع شدن با زمان باقی‌مانده) و بعد از انقضا؛
 *   • idempotency پیامک اطلاع‌رسانی دورهٔ رایگان.
 */
describe('اشتراک پروفایل اختصاصی — منطق تاریخ', () => {
  it('افزودن یک ماه تقویمی از ۳۱ ژانویه، ۲۸ فوریه می‌شود (نه ۳ مارس)', () => {
    expect(addCalendarMonths(new Date(2026, 0, 31), 1)).toEqual(
      new Date(2026, 1, 28),
    );
  });

  it('در سال کبیسه، ۳۱ ژانویه + یک ماه = ۲۹ فوریه', () => {
    expect(addCalendarMonths(new Date(2024, 0, 31), 1)).toEqual(
      new Date(2024, 1, 29),
    );
  });

  it('پلن یک‌ماههٔ پروفایل اختصاصی دقیقاً یک ماه تقویمی است', () => {
    expect(addPlanDuration(new Date(2026, 0, 31), 30, 'public_page')).toEqual(
      new Date(2026, 1, 28),
    );
  });

  it('پلن سه‌ماههٔ پروفایل اختصاصی دقیقاً سه ماه تقویمی است', () => {
    expect(addPlanDuration(new Date(2026, 0, 31), 90, 'public_page')).toEqual(
      new Date(2026, 3, 30),
    );
  });

  it('پلن‌های پیامکی همچنان بر اساس روز محاسبه می‌شوند (رفتار قبلی)', () => {
    // ۳۱ ژانویه + ۳۰ روز = ۲ مارس (برخلاف ماه تقویمی که ۲۸ فوریه می‌شود)
    expect(addPlanDuration(new Date(2026, 0, 31), 30, 'sms')).toEqual(
      new Date(2026, 2, 2),
    );
  });
});

describe('اشتراک پروفایل اختصاصی — دورهٔ رایگان و تمدید', () => {
  const trialPlan = {
    id: 'plan-trial',
    planKey: 'public_page_trial',
    name: 'پروفایل اختصاصی رایگان',
    price: 0,
    smsCount: 0,
    durationDays: 30,
    planType: 'public_page',
  } as any;

  const monthlyPlan = {
    id: 'plan-monthly',
    planKey: 'public_page_monthly',
    name: 'تمدید یک‌ماههٔ پروفایل اختصاصی',
    price: 99_000,
    smsCount: 0,
    durationDays: 30,
    planType: 'public_page',
  } as any;

  const quarterlyPlan = {
    id: 'plan-quarterly',
    planKey: 'public_page_quarterly',
    name: 'تمدید سه‌ماههٔ پروفایل اختصاصی',
    price: 250_000,
    smsCount: 0,
    durationDays: 90,
    planType: 'public_page',
  } as any;

  const legacyPlan = {
    id: 'plan-legacy',
    planKey: 'public_page_legacy',
    name: 'مهلت انتقالی خریداران قبلی',
    price: 0,
    smsCount: 0,
    durationDays: 180,
    planType: 'public_page',
  } as any;

  function createHarness(options?: {
    plans?: any[];
    subscriptions?: any[];
    claimAffected?: number[];
  }) {
    const plans = options?.plans ?? [
      trialPlan,
      monthlyPlan,
      quarterlyPlan,
      legacyPlan,
    ];
    const subscriptions = [...(options?.subscriptions ?? [])];
    const claimQueue = [...(options?.claimAffected ?? [1])];
    let claimCall = 0;

    // مثل TypeORM با `relations: { subscriptionPlan: true }`، رابطهٔ پلن را
    // از روی `subscriptionPlanId` پر می‌کنیم تا ردیف‌های تازه‌ساخته هم پلن داشته باشند.
    const withPlan = (row: any) =>
      row.subscriptionPlan
        ? row
        : {
            ...row,
            subscriptionPlan:
              plans.find(plan => plan.id === row.subscriptionPlanId) ?? null,
          };

    const userSubscriptionRepo: any = {
      findOne: jest.fn(async () =>
        subscriptions[0] ? withPlan(subscriptions[0]) : null,
      ),
      find: jest.fn(async () => subscriptions.map(withPlan)),
      create: jest.fn((value: any) => ({ ...value })),
      save: jest.fn(async (value: any) => {
        const index = subscriptions.findIndex(row => row.id === value.id);
        if (index >= 0) subscriptions[index] = value;
        else subscriptions.push(value);
        return value;
      }),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue([]),
        execute: jest.fn(async () => {
          const affected = claimQueue[claimCall] ?? 0;
          claimCall += 1;
          return { affected };
        }),
      })),
    };

    const subscriptionPlanRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where?.id) return plans.find(plan => plan.id === where.id) ?? null;
        if (where?.planKey)
          return plans.find(plan => plan.planKey === where.planKey) ?? null;
        return null;
      }),
      create: jest.fn((value: any) => ({ id: 'plan-created', ...value })),
      save: jest.fn(async (value: any) => {
        plans.push(value);
        return value;
      }),
    };

    const manager: any = {
      getRepository: jest.fn((entity: any) => {
        if (entity.name === 'UserSubscription') return userSubscriptionRepo;
        if (entity.name === 'SubscriptionPlan') return subscriptionPlanRepo;
        return { findOne: jest.fn(async () => ({ id: 42 })) };
      }),
      transaction: jest.fn(async (callback: (transactionManager: any) => any) =>
        callback(manager),
      ),
    };
    userSubscriptionRepo.manager = manager;

    const service = new UserSubscriptionService(
      userSubscriptionRepo,
      subscriptionPlanRepo,
      {} as any,
      {} as any,
    );

    return { service, subscriptions, userSubscriptionRepo };
  }

  it('وضعیت فعال فقط برای بازهٔ startDate تا endDate و status=active محاسبه می‌شود', async () => {
    const { service, userSubscriptionRepo } = createHarness();

    await service.getCurrentPublicPageSubscription(42);
    let queryBuilder =
      userSubscriptionRepo.createQueryBuilder.mock.results[0].value;
    expect(queryBuilder.andWhere.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'subscription.status = :status',
          { status: UserSubscriptionStatus.ACTIVE },
        ],
        ['plan.planType = :planType', { planType: 'public_page' }],
        ['subscription.startDate <= :now', expect.any(Object)],
        ['subscription.endDate > :now', expect.any(Object)],
      ]),
    );

    await service.findActivePublicPageSubscriptionsForUsers([42]);
    queryBuilder =
      userSubscriptionRepo.createQueryBuilder.mock.results[1].value;
    expect(queryBuilder.andWhere.mock.calls).toEqual(
      expect.arrayContaining([
        ['subscription.startDate <= :now', expect.any(Object)],
        ['subscription.endDate > :now', expect.any(Object)],
      ]),
    );
  });

  it('اشتراک پیامکی را با خوانش قفل‌شده و نوع sms همگام می‌کند', async () => {
    const { service, userSubscriptionRepo } = createHarness();
    await service.getCurrent(42, 'sms');
    const queryBuilder =
      userSubscriptionRepo.createQueryBuilder.mock.results[0].value;
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'plan.planType = :planType',
      { planType: 'sms' },
    );
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('دورهٔ رایگان را با قیمت صفر و دقیقاً یک ماه تقویمی اعطا می‌کند', async () => {
    const { service, subscriptions } = createHarness();

    const result = await service.grantFreePublicPageTrial(42);

    expect(result?.created).toBe(true);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      userId: 42,
      subscriptionPlanId: 'plan-trial',
      price: 0,
      smsTotal: 0,
      status: UserSubscriptionStatus.ACTIVE,
    });
    expect(subscriptions[0].endDate).toEqual(
      addPlanDuration(subscriptions[0].startDate, 30, 'public_page'),
    );

    const repeated = await service.grantFreePublicPageTrial(42);
    expect(repeated?.created).toBe(false);
    expect(subscriptions).toHaveLength(1);
  });

  it('دورهٔ رایگان فقط یک‌بار اعطا می‌شود (کاربر تکراری/سوءاستفاده)', async () => {
    const existing = {
      id: 'sub-existing',
      userId: 42,
      subscriptionPlanId: 'plan-trial',
      subscriptionPlan: trialPlan,
      status: UserSubscriptionStatus.ACTIVE,
      endDate: new Date('2099-01-01T00:00:00.000Z'),
    };
    const { service, subscriptions } = createHarness({
      subscriptions: [existing],
    });

    const result = await service.grantFreePublicPageTrial(42);

    expect(result?.created).toBe(false);
    expect(result?.subscription.id).toBe('sub-existing');
    expect(subscriptions).toHaveLength(1);
  });

  it('اگر آخرین اشتراک کاربر sms باشد ولی قبلاً پروفایل اختصاصی داشته، دوباره دورهٔ رایگان اعطا نمی‌شود', async () => {
    const smsPlan = {
      id: 'plan-sms',
      planKey: 'starter',
      name: 'پلن آغاز',
      price: 59_000,
      smsCount: 100,
      durationDays: 30,
      planType: 'sms',
    } as any;

    const { service, subscriptions } = createHarness({
      subscriptions: [
        {
          id: 'sub-trial-old',
          userId: 42,
          subscriptionPlanId: 'plan-trial',
          subscriptionPlan: trialPlan,
          status: UserSubscriptionStatus.EXPIRED,
          endDate: new Date('2099-01-01T00:00:00.000Z'),
        },
        {
          id: 'sub-sms-new',
          userId: 42,
          subscriptionPlanId: 'plan-sms',
          subscriptionPlan: smsPlan,
          status: UserSubscriptionStatus.ACTIVE,
          endDate: new Date('2099-01-01T00:00:00.000Z'),
        },
      ],
    });

    const result = await service.grantFreePublicPageTrial(42);

    expect(result?.created).toBe(false);
    expect(subscriptions).toHaveLength(2);
  });

  it('نوع یک پلن trial قدیمی با planType اشتباه را پیش از اعطا اصلاح می‌کند', async () => {
    const staleTrialPlan = { ...trialPlan, planType: 'sms' };
    const { service, subscriptions } = createHarness({
      plans: [staleTrialPlan],
    });

    const result = await service.grantFreePublicPageTrial(42);

    expect(result?.created).toBe(true);
    expect(staleTrialPlan.planType).toBe('public_page');
    expect(subscriptions).toHaveLength(1);
  });

  it('اگر پلن trial seed نشده باشد، آن را idempotent ایجاد می‌کند و اشتراک را اعطا می‌کند', async () => {
    const { service, subscriptions } = createHarness({ plans: [] });

    const result = await service.grantFreePublicPageTrial(42);

    expect(result?.created).toBe(true);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      userId: 42,
      subscriptionPlanId: 'plan-created',
      status: UserSubscriptionStatus.ACTIVE,
    });
  });

  it('مهلت انتقالی خریداران قبلی: رایگان و دقیقاً شش ماه تقویمی از زمان اعطا', async () => {
    const { service, subscriptions } = createHarness();

    const result = await service.grantLegacyPublicPageAccess(42);

    expect(result?.created).toBe(true);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      userId: 42,
      subscriptionPlanId: 'plan-legacy',
      price: 0,
      smsTotal: 0,
      status: UserSubscriptionStatus.ACTIVE,
    });
    expect(subscriptions[0].endDate).toEqual(
      addPlanDuration(subscriptions[0].startDate, 180, 'public_page'),
    );
    // ۱۸۰ روز = ۶ ماه تقویمی؛ نه ۱۸۰ روز شمارشی.
    const start: Date = subscriptions[0].startDate;
    const end: Date = subscriptions[0].endDate;
    expect(
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - start.getUTCMonth()),
    ).toBe(6);
  });

  it('مهلت انتقالی فقط یک‌بار اعطا می‌شود؛ اگر کاربر هر اشتراک پروفایل اختصاصی داشته باشد چیزی ساخته نمی‌شود', async () => {
    const { service, subscriptions } = createHarness({
      subscriptions: [
        {
          id: 'sub-monthly',
          userId: 42,
          subscriptionPlanId: 'plan-monthly',
          subscriptionPlan: monthlyPlan,
          status: UserSubscriptionStatus.ACTIVE,
          endDate: new Date('2099-01-01T00:00:00.000Z'),
        },
      ],
    });

    const first = await service.grantLegacyPublicPageAccess(42);
    expect(first?.created).toBe(false);
    expect(first?.subscription.id).toBe('sub-monthly');
    expect(subscriptions).toHaveLength(1);

    // اجرای دوباره روی کاربری که خودِ مهلت انتقالی را گرفته است.
    const { service: fresh, subscriptions: freshRows } = createHarness();
    await fresh.grantLegacyPublicPageAccess(7);
    const again = await fresh.grantLegacyPublicPageAccess(7);
    expect(again?.created).toBe(false);
    expect(freshRows).toHaveLength(1);
  });

  it('اگر پلن مهلت انتقالی در دیتابیس نباشد، null برمی‌گرداند و چیزی نمی‌سازد', async () => {
    const { service, subscriptions } = createHarness({
      plans: [trialPlan, monthlyPlan, quarterlyPlan],
    });

    await expect(service.grantLegacyPublicPageAccess(42)).resolves.toBeNull();
    expect(subscriptions).toHaveLength(0);
  });

  it('تمدید پس از انقضا از زمان پرداخت موفق می‌شمارد', async () => {
    const now = Date.now();
    const { service, subscriptions } = createHarness({
      plans: [monthlyPlan],
      subscriptions: [
        {
          id: 'sub-old',
          userId: 7,
          subscriptionPlanId: 'plan-trial',
          subscriptionPlan: trialPlan,
          price: 0,
          smsTotal: 0,
          smsUsed: 0,
          status: UserSubscriptionStatus.EXPIRED,
          startDate: new Date(now - 60 * 86_400_000),
          endDate: new Date(now - 30 * 86_400_000),
        },
      ],
    });

    const saved = await service.activateSubscriptionAfterPayment(
      7,
      'plan-monthly',
    );

    expect(saved).not.toBeNull();
    expect(saved?.price).toBe(99_000);
    expect(saved?.status).toBe(UserSubscriptionStatus.ACTIVE);
    expect(saved?.startDate.getTime()).toBeGreaterThan(now - 5 * 86_400_000);
    expect(saved?.endDate).toEqual(
      addPlanDuration(
        saved!.startDate,
        monthlyPlan.durationDays,
        'public_page',
      ),
    );
    expect(subscriptions).toHaveLength(2);
  });

  it('تمدید قبل از انقضا به زمان باقی‌مانده اضافه می‌کند و اشتراک قبلی را می‌بندد', async () => {
    const now = Date.now();
    const existing = {
      id: 'sub-active',
      userId: 7,
      subscriptionPlanId: 'plan-trial',
      subscriptionPlan: trialPlan,
      price: 0,
      smsTotal: 0,
      smsUsed: 0,
      status: UserSubscriptionStatus.ACTIVE,
      startDate: new Date(now - 10 * 86_400_000),
      endDate: new Date(now + 20 * 86_400_000),
    };

    const { service, subscriptions } = createHarness({
      plans: [monthlyPlan],
      subscriptions: [existing],
    });

    const saved = await service.activateSubscriptionAfterPayment(
      7,
      'plan-monthly',
    );

    // شروع از انتهای اعتبار فعلی است، نه از زمان پرداخت.
    expect(saved?.startDate).toEqual(new Date(now + 20 * 86_400_000));
    expect(saved?.endDate).toEqual(
      addPlanDuration(
        new Date(now + 20 * 86_400_000),
        monthlyPlan.durationDays,
        'public_page',
      ),
    );
    expect(existing.status).toBe(UserSubscriptionStatus.EXPIRED);
    expect(
      subscriptions.filter(row => row.status === UserSubscriptionStatus.ACTIVE),
    ).toHaveLength(1);
  });

  it('پلن سه‌ماهه قیمت ۲۵۰٬۰۰۰ و مدت ۹۰ روز را از پلن می‌خواند', async () => {
    const { service } = createHarness({ plans: [quarterlyPlan] });

    const saved = await service.activateSubscriptionAfterPayment(
      7,
      'plan-quarterly',
    );

    expect(saved?.price).toBe(250_000);
    expect(saved?.endDate).toEqual(
      addPlanDuration(saved!.startDate, 90, 'public_page'),
    );
  });

  it('اگر پلن اشتباه باشد، اشتراکی ساخته نمی‌شود', async () => {
    const { service, subscriptions } = createHarness({ plans: [] });

    await expect(
      service.activateSubscriptionAfterPayment(7, 'plan-missing'),
    ).resolves.toBeNull();
    expect(subscriptions).toHaveLength(0);
  });

  it('claim پیامک دورهٔ رایگان فقط یک‌بار true می‌شود', async () => {
    const { service } = createHarness({ claimAffected: [1, 0] });

    await expect(service.claimFreeTrialSms('sub-1')).resolves.toBe(true);
    await expect(service.claimFreeTrialSms('sub-1')).resolves.toBe(false);
  });
});

describe('تکمیل دورهٔ رایگان برای آرایشگرهای ثبت‌نام‌کردهٔ قبلی', () => {
  const trialPlan = {
    id: 'plan-trial',
    planKey: 'public_page_trial',
    name: 'پروفایل اختصاصی رایگان',
    price: 0,
    smsCount: 0,
    durationDays: 30,
    planType: 'public_page',
  } as any;

  /**
   * ساخت سرویس با یک کوئریِ خامِ شبیه‌سازی‌شده.
   *
   * ریشهٔ باگی که این تست‌ها می‌گیرند: اعطای دورهٔ رایگان فقط در مسیر
   * `registerBarber` بود؛ آرایشگرهایی که پیش از آن ثبت‌نام کرده بودند هیچ
   * اشتراکی نداشتند و صفحهٔ اختصاصی‌شان غیرفعال می‌ماند.
   */
  function createBackfillHarness(options?: {
    candidateIds?: number[];
    plans?: any[];
  }) {
    const candidates = options?.candidateIds ?? [];
    const plans = options?.plans ?? [trialPlan];
    const subscriptions: any[] = [];

    const subscriptionPlanRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where?.planKey)
          return plans.find(plan => plan.planKey === where.planKey) ?? null;
        if (where?.id) return plans.find(plan => plan.id === where.id) ?? null;
        return null;
      }),
      create: jest.fn((value: any) => ({ id: 'plan-created', ...value })),
      save: jest.fn(async (value: any) => {
        plans.push(value);
        return value;
      }),
    };

    const userSubscriptionRepo: any = {
      find: jest.fn(async () => subscriptions),
      create: jest.fn((value: any) => ({ ...value })),
      save: jest.fn(async (value: any) => {
        subscriptions.push(value);
        return value;
      }),
      manager: {
        createQueryBuilder: jest.fn(() => ({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          getRawMany: jest.fn(async () =>
            candidates.map(id => ({ id: String(id) })),
          ),
        })),
        transaction: jest.fn(
          async (callback: (transactionManager: any) => any) =>
            callback({
              getRepository: (entity: any) => {
                if (entity.name === 'UserSubscription')
                  return userSubscriptionRepo;
                if (entity.name === 'SubscriptionPlan')
                  return subscriptionPlanRepo;
                return { findOne: jest.fn(async () => ({ id: 11 })) };
              },
            }),
        ),
      },
    };

    const service = new UserSubscriptionService(
      userSubscriptionRepo,
      subscriptionPlanRepo,
      {} as any,
      {} as any,
    );

    return { service, subscriptions, userSubscriptionRepo };
  }

  it('برای هر آرایشگرِ بدون اشتراک، دقیقاً یک دورهٔ رایگان یک‌ماهه می‌سازد', async () => {
    const { service, subscriptions } = createBackfillHarness({
      candidateIds: [11, 12, 13],
    });

    await expect(
      service.backfillFreePublicPageTrialForExistingBarbers(),
    ).resolves.toEqual({ candidates: 3, granted: 3, failed: 0, dryRun: false });

    expect(subscriptions).toHaveLength(3);
    for (const subscription of subscriptions) {
      expect(subscription).toMatchObject({
        subscriptionPlanId: 'plan-trial',
        price: 0,
        smsTotal: 0,
        status: UserSubscriptionStatus.ACTIVE,
      });
      expect(subscription.endDate).toEqual(
        addPlanDuration(subscription.startDate, 30, 'public_page'),
      );
    }
  });

  it('حالت dryRun فقط می‌شمارد و هیچ اشتراکی نمی‌سازد', async () => {
    const { service, subscriptions } = createBackfillHarness({
      candidateIds: [11, 12],
    });

    await expect(
      service.backfillFreePublicPageTrialForExistingBarbers({ dryRun: true }),
    ).resolves.toEqual({ candidates: 2, granted: 0, failed: 0, dryRun: true });

    expect(subscriptions).toHaveLength(0);
  });

  it('بدون کاندید، نتیجه صفر است و پلن هم خوانده نمی‌شود', async () => {
    const { service } = createBackfillHarness({ candidateIds: [] });

    await expect(
      service.backfillFreePublicPageTrialForExistingBarbers(),
    ).resolves.toEqual({ candidates: 0, granted: 0, failed: 0, dryRun: false });
  });

  it('اگر پلن trial از قبل seed نشده باشد، backfill آن را ایجاد و همهٔ کاندیدها را فعال می‌کند', async () => {
    const { service, subscriptions } = createBackfillHarness({
      candidateIds: [11, 12],
      plans: [],
    });

    await expect(
      service.backfillFreePublicPageTrialForExistingBarbers(),
    ).resolves.toEqual({
      candidates: 2,
      granted: 2,
      failed: 0,
      dryRun: false,
    });

    expect(subscriptions).toHaveLength(2);
  });
});
