/**
 * تست‌های خلاصه‌ساز اشتراک پیامکی — همهٔ سناریوهای وضعیت:
 *
 * ۱. فعال با سهمیهٔ کامل          ۲. فعال با مصرف جزئی
 * ۳. فعال با سهمیهٔ تمام‌شده      ۴. بدون اشتراک
 * ۵. منقضی‌شده                    ۶. لغوشده
 * ۷. چند اشتراک قدیمی + یک فعال   ۸. شروع‌نشده (تمدید صف‌شده)
 */
import {
  UserSubscription,
  UserSubscriptionStatus,
} from './entities/user-subscription.entity';
import {
  isSmsSubscriptionInWindow,
  summarizeSmsSubscriptions,
  summarizeSmsSubscriptionsByUser,
} from './sms-subscription-summary';

const NOW = new Date('2026-06-15T10:00:00.000Z');

function makeSubscription(
  overrides: Partial<UserSubscription> & { userId?: number },
): UserSubscription {
  return {
    id: overrides.id ?? 'sub-1',
    userId: overrides.userId ?? 100,
    subscriptionPlanId: overrides.subscriptionPlanId ?? 'plan-1',
    price: overrides.price ?? 59000,
    smsTotal: overrides.smsTotal ?? 100,
    smsUsed: overrides.smsUsed ?? 0,
    status: overrides.status ?? UserSubscriptionStatus.ACTIVE,
    startDate: overrides.startDate ?? new Date('2026-06-01T00:00:00.000Z'),
    endDate: overrides.endDate ?? new Date('2026-07-01T00:00:00.000Z'),
    freeTrialSmsSentAt: null,
    expiryReminderSmsSentAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    subscriptionPlan: overrides.subscriptionPlan,
    user: undefined,
  } as unknown as UserSubscription;
}

const SMS_PLAN = {
  id: 'plan-1',
  planKey: 'starter',
  name: 'پلن آغاز',
  smsCount: 100,
  price: 59000,
  durationDays: 30,
  description: null,
  isActive: true,
  sortOrder: 1,
  planType: 'sms',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('summarizeSmsSubscriptions', () => {
  it('scenario 1: active in-window subscription with full quota', () => {
    const summary = summarizeSmsSubscriptions(
      [makeSubscription({ subscriptionPlan: SMS_PLAN as any })],
      NOW,
    );

    expect(summary).toMatchObject({
      id: 'sub-1',
      planKey: 'starter',
      planName: 'پلن آغاز',
      price: 59000,
      display: 'active',
      status: 'active',
      smsTotal: 100,
      smsUsed: 0,
      smsRemaining: 100,
      usagePercent: 0,
    });
  });

  it('scenario 2: active subscription with partial usage computes remaining and percent', () => {
    const summary = summarizeSmsSubscriptions(
      [makeSubscription({ smsUsed: 30, subscriptionPlan: SMS_PLAN as any })],
      NOW,
    );

    expect(summary).toMatchObject({
      display: 'active',
      smsTotal: 100,
      smsUsed: 30,
      smsRemaining: 70,
      usagePercent: 30,
    });
  });

  it('scenario 3: fully consumed quota shows 100% and zero remaining', () => {
    const summary = summarizeSmsSubscriptions(
      [makeSubscription({ smsUsed: 100, subscriptionPlan: SMS_PLAN as any })],
      NOW,
    );

    expect(summary).toMatchObject({
      display: 'active',
      smsRemaining: 0,
      usagePercent: 100,
    });
  });

  it('scenario 4: no rows at all means no subscription', () => {
    expect(summarizeSmsSubscriptions([], NOW)).toBeNull();
    expect(summarizeSmsSubscriptions(null, NOW)).toBeNull();
    expect(summarizeSmsSubscriptions(undefined, NOW)).toBeNull();
  });

  it('scenario 5: expired status (or past endDate) shows expired with the real end date', () => {
    // status منقضی‌شده در دیتابیس (کرون انقضا آن را بسته است)
    const expiredStatus = summarizeSmsSubscriptions(
      [
        makeSubscription({
          status: UserSubscriptionStatus.EXPIRED,
          endDate: new Date('2026-06-10T00:00:00.000Z'),
          subscriptionPlan: SMS_PLAN as any,
        }),
      ],
      NOW,
    );
    expect(expiredStatus?.display).toBe('expired');
    expect(expiredStatus?.endDate).toBe('2026-06-10T00:00:00.000Z');

    // کرون هنوز رد نشده اما بازهٔ اعتبار تمام شده — باید منقضی دیده شود
    const staleActive = summarizeSmsSubscriptions(
      [
        makeSubscription({
          status: UserSubscriptionStatus.ACTIVE,
          endDate: new Date('2026-06-14T00:00:00.000Z'),
          subscriptionPlan: SMS_PLAN as any,
        }),
      ],
      NOW,
    );
    expect(staleActive?.display).toBe('expired');
  });

  it('scenario 6: canceled subscription is never treated as active even inside its window', () => {
    const summary = summarizeSmsSubscriptions(
      [
        makeSubscription({
          status: UserSubscriptionStatus.CANCELED,
          smsUsed: 10,
          subscriptionPlan: SMS_PLAN as any,
        }),
      ],
      NOW,
    );

    expect(summary).toMatchObject({
      display: 'canceled',
      status: 'canceled',
      smsRemaining: 90,
    });
  });

  it('scenario 7: among several old subscriptions, the currently active one wins', () => {
    const rows = [
      makeSubscription({
        id: 'old-1',
        status: UserSubscriptionStatus.EXPIRED,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-02-01T00:00:00.000Z'),
        smsUsed: 100,
        subscriptionPlan: SMS_PLAN as any,
      }),
      makeSubscription({
        id: 'old-2',
        status: UserSubscriptionStatus.EXPIRED,
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        endDate: new Date('2026-04-01T00:00:00.000Z'),
        smsUsed: 40,
        subscriptionPlan: SMS_PLAN as any,
      }),
      makeSubscription({
        id: 'current',
        status: UserSubscriptionStatus.ACTIVE,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-07-01T00:00:00.000Z'),
        smsTotal: 300,
        smsUsed: 45,
        subscriptionPlan: SMS_PLAN as any,
      }),
    ];

    const summary = summarizeSmsSubscriptions(rows, NOW);

    expect(summary).toMatchObject({
      id: 'current',
      display: 'active',
      smsTotal: 300,
      smsUsed: 45,
      smsRemaining: 255,
      usagePercent: 15,
    });
  });

  it('scenario 8: a queued renewal that has not started yet shows scheduled', () => {
    const summary = summarizeSmsSubscriptions(
      [
        makeSubscription({
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          endDate: new Date('2026-08-01T00:00:00.000Z'),
          subscriptionPlan: SMS_PLAN as any,
        }),
      ],
      NOW,
    );

    expect(summary?.display).toBe('scheduled');
    expect(summary?.startDate).toBe('2026-07-01T00:00:00.000Z');
  });

  it('numeric columns arriving as strings (decimal/int from DB) are normalized', () => {
    const summary = summarizeSmsSubscriptions(
      [
        makeSubscription({
          smsTotal: '100' as unknown as number,
          smsUsed: '25' as unknown as number,
          price: '169000' as unknown as number,
          subscriptionPlan: SMS_PLAN as any,
        }),
      ],
      NOW,
    );

    expect(summary).toMatchObject({
      price: 169000,
      smsTotal: 100,
      smsUsed: 25,
      smsRemaining: 75,
      usagePercent: 25,
    });
  });

  it('zero quota plans show 0% usage instead of NaN', () => {
    const summary = summarizeSmsSubscriptions(
      [makeSubscription({ smsTotal: 0, smsUsed: 0 })],
      NOW,
    );

    expect(summary?.usagePercent).toBe(0);
    expect(summary?.smsRemaining).toBe(0);
  });

  it('over-consumed bad data clamps remaining to zero and percent to 100', () => {
    const summary = summarizeSmsSubscriptions(
      [makeSubscription({ smsTotal: 10, smsUsed: 15 })],
      NOW,
    );

    expect(summary?.smsRemaining).toBe(0);
    expect(summary?.usagePercent).toBe(100);
  });
});

describe('isSmsSubscriptionInWindow', () => {
  const base = {
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('matches the central rule: ACTIVE status and inside the date window', () => {
    expect(
      isSmsSubscriptionInWindow(
        { status: UserSubscriptionStatus.ACTIVE, ...base },
        NOW,
      ),
    ).toBe(true);

    expect(
      isSmsSubscriptionInWindow(
        { status: UserSubscriptionStatus.EXPIRED, ...base },
        NOW,
      ),
    ).toBe(false);

    expect(
      isSmsSubscriptionInWindow(
        { status: UserSubscriptionStatus.CANCELED, ...base },
        NOW,
      ),
    ).toBe(false);

    // پایان بازه لحظهٔ برابر شامل نمی‌شود (endDate > now)
    expect(
      isSmsSubscriptionInWindow(
        {
          status: UserSubscriptionStatus.ACTIVE,
          startDate: base.startDate,
          endDate: NOW,
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('summarizeSmsSubscriptionsByUser', () => {
  it('groups by userId and never mixes one barber with another', () => {
    const rows = [
      makeSubscription({
        id: 'a-1',
        userId: 1,
        smsUsed: 10,
        subscriptionPlan: SMS_PLAN as any,
      }),
      makeSubscription({
        id: 'b-1',
        userId: 2,
        status: UserSubscriptionStatus.CANCELED,
        subscriptionPlan: SMS_PLAN as any,
      }),
    ];

    const byUser = summarizeSmsSubscriptionsByUser(rows, NOW);

    expect(byUser.get(1)?.display).toBe('active');
    expect(byUser.get(2)?.display).toBe('canceled');
    expect(byUser.size).toBe(2);
  });

  it('skips rows with invalid userId', () => {
    const byUser = summarizeSmsSubscriptionsByUser(
      [makeSubscription({ userId: Number.NaN })],
      NOW,
    );

    expect(byUser.size).toBe(0);
  });
});
