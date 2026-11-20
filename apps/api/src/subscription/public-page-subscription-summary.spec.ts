jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { UserSubscriptionStatus } from './entities/user-subscription.entity';
import {
  summarizePublicPageSubscriptions,
  summarizePublicPageSubscriptionsByUser,
} from './public-page-subscription-summary';

const NOW = new Date('2026-11-20T12:00:00.000Z');

const trialPlan = {
  id: 'plan-trial',
  planKey: 'public_page_trial',
  name: 'پروفایل اختصاصی رایگان',
  price: 0,
  planType: 'public_page',
};
const monthlyPlan = {
  id: 'plan-monthly',
  planKey: 'public_page_monthly',
  name: 'پروفایل اختصاصی ماهانه',
  price: 250_000,
  planType: 'public_page',
};

function sub(partial: Partial<any>): any {
  return {
    id: 'sub-x',
    userId: 42,
    subscriptionPlanId: 'plan-monthly',
    subscriptionPlan: monthlyPlan,
    price: 250_000,
    status: UserSubscriptionStatus.ACTIVE,
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    endDate: new Date('2026-12-01T00:00:00.000Z'),
    ...partial,
  };
}

describe('خلاصهٔ اشتراک پروفایل اختصاصی (منطق مرکزی نمایش وضعیت)', () => {
  it('اشتراک فعال رایگان: display=active و isFreeTrial=true', () => {
    const summary = summarizePublicPageSubscriptions(
      [
        sub({
          subscriptionPlanId: 'plan-trial',
          subscriptionPlan: trialPlan,
          price: 0,
        }),
      ],
      NOW,
    );

    expect(summary).toMatchObject({
      isFreeTrial: true,
      display: 'active',
      status: UserSubscriptionStatus.ACTIVE,
    });
  });

  it('اشتراک فعال پولی: display=active و isFreeTrial=false', () => {
    const summary = summarizePublicPageSubscriptions([sub({})], NOW);
    expect(summary).toMatchObject({ isFreeTrial: false, display: 'active' });
  });

  it('اشتراک منقضی‌شده: display=expired، آخرین endDate انتخاب می‌شود', () => {
    const summary = summarizePublicPageSubscriptions(
      [
        sub({
          id: 'old',
          status: UserSubscriptionStatus.EXPIRED,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-10-01T00:00:00.000Z'),
        }),
        sub({
          id: 'newer',
          status: UserSubscriptionStatus.EXPIRED,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-11-01T00:00:00.000Z'),
        }),
      ],
      NOW,
    );

    expect(summary?.display).toBe('expired');
    expect(summary?.id).toBe('newer');
  });

  it('چند رکورد هم‌زمان (تمدید صف‌شده): رکورد فعالِ در بازه بر رکورد آینده ترجیح دارد', () => {
    const summary = summarizePublicPageSubscriptions(
      [
        sub({
          id: 'current',
          status: UserSubscriptionStatus.ACTIVE,
          startDate: new Date('2026-11-01T00:00:00.000Z'),
          endDate: new Date('2026-12-01T00:00:00.000Z'),
        }),
        sub({
          id: 'queued',
          status: UserSubscriptionStatus.ACTIVE,
          startDate: new Date('2026-12-01T00:00:00.000Z'),
          endDate: new Date('2027-01-01T00:00:00.000Z'),
        }),
      ],
      NOW,
    );

    expect(summary?.id).toBe('current');
    expect(summary?.display).toBe('active');
  });

  it('شروعِ آیندهٔ تمدید صف‌شده بدون اشتراک فعلی: display=scheduled', () => {
    const summary = summarizePublicPageSubscriptions(
      [
        sub({
          id: 'queued',
          status: UserSubscriptionStatus.ACTIVE,
          startDate: new Date('2026-12-01T00:00:00.000Z'),
          endDate: new Date('2027-01-01T00:00:00.000Z'),
        }),
      ],
      NOW,
    );

    expect(summary?.display).toBe('scheduled');
  });

  it('endDate دقیقاً برابر اکنون است ⇒ دیگر فعال نیست (مرز بازهٔ زمانی)', () => {
    const summary = summarizePublicPageSubscriptions(
      [
        sub({
          status: UserSubscriptionStatus.ACTIVE,
          startDate: new Date('2026-10-20T12:00:00.000Z'),
          endDate: new Date('2026-11-20T12:00:00.000Z'),
        }),
      ],
      NOW,
    );

    expect(summary?.display).toBe('expired');
  });

  it('بدون هیچ رکوردی → null (نه active و نه expired)', () => {
    expect(summarizePublicPageSubscriptions([], NOW)).toBeNull();
    expect(summarizePublicPageSubscriptions(null, NOW)).toBeNull();
  });

  it('رکوردهای گروه‌بندی‌شده بر اساس کاربر درست خلاصه می‌شوند', () => {
    const result = summarizePublicPageSubscriptionsByUser(
      [
        sub({
          userId: 7,
          id: 'u7-expired',
          status: UserSubscriptionStatus.EXPIRED,
          endDate: new Date('2026-10-01T00:00:00.000Z'),
          startDate: new Date('2026-09-01T00:00:00.000Z'),
        }),
        sub({ userId: 9, id: 'u9-active' }),
        sub({
          userId: 9,
          id: 'u9-expired',
          status: UserSubscriptionStatus.EXPIRED,
          endDate: new Date('2026-10-01T00:00:00.000Z'),
          startDate: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ],
      NOW,
    );

    expect(result.get(7)?.display).toBe('expired');
    expect(result.get(9)?.id).toBe('u9-active');
    expect(result.get(9)?.display).toBe('active');
    expect(result.size).toBe(2);
  });
});
