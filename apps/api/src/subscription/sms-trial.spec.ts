jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import {
  SMS_PURCHASE_PLAN_KEYS,
  SMS_TRIAL_PLAN_KEY,
  SUBSCRIPTION_PLANS,
} from './constants';
import { UserSubscriptionStatus } from './entities/user-subscription.entity';
import { SubscriptionService } from './subscription.service';
import { UserSubscriptionService } from './user-subscription.service';

function harness(initial: any[] = [], existingPlan?: any) {
  const rows = [...initial];
  let plan = existingPlan ?? null;
  const qb: any = {};
  for (const method of [
    'innerJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'setLock',
  ])
    qb[method] = jest.fn().mockReturnThis();
  qb.getOne = jest.fn(
    async () =>
      rows.find(row => row.subscriptionPlan?.planType === 'sms') ?? null,
  );
  const subscriptions: any = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn(value => value),
    save: jest.fn(async value => {
      const saved = {
        id: `sub-${rows.length + 1}`,
        ...value,
        subscriptionPlan: plan,
      };
      rows.push(saved);
      return saved;
    }),
  };
  const plans: any = {
    findOne: jest.fn(async () => plan),
    create: jest.fn(value => ({ id: 'sms-plan', ...value })),
    save: jest.fn(async value => {
      plan = value;
      return plan;
    }),
  };
  const users = { findOne: jest.fn().mockResolvedValue({ id: 42 }) };
  const manager: any = {
    getRepository: jest.fn(entity =>
      entity.name === 'SubscriptionPlan'
        ? plans
        : entity.name === 'UserSubscription'
          ? subscriptions
          : users,
    ),
    transaction: jest.fn(async callback => callback(manager)),
  };
  subscriptions.manager = manager;
  const service = new UserSubscriptionService(
    subscriptions,
    plans,
    {} as any,
    {} as any,
  );
  return { service, rows, plans, subscriptions, users, manager, qb };
}

describe('welcome SMS trial', () => {
  it('creates a missing plan and grants 50 messages for 30 full days, only once', async () => {
    const h = harness();
    const first = await h.service.grantFreeSmsTrial(42);
    expect(h.manager.transaction).toHaveBeenCalledTimes(1);
    expect(h.users.findOne).toHaveBeenCalledWith({
      where: { id: 42 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(h.qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(h.plans.save).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: SMS_TRIAL_PLAN_KEY,
        smsCount: 50,
        price: 0,
        planType: 'sms',
      }),
    );
    expect(first.created).toBe(true);
    expect(first.subscription).toMatchObject({
      userId: 42,
      price: 0,
      smsTotal: 50,
      smsUsed: 0,
      status: UserSubscriptionStatus.ACTIVE,
    });
    expect(
      first.subscription.endDate.getTime() -
        first.subscription.startDate.getTime(),
    ).toBe(30 * 86400_000);
    const again = await h.service.grantFreeSmsTrial(42, h.manager);
    expect(again).toMatchObject({
      created: false,
      subscription: { id: first.subscription.id },
    });
    expect(h.rows).toHaveLength(1);
    expect(h.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['expired', 'canceled', 'reserved', 'active'])(
    'does not grant when an SMS subscription already exists (%s)',
    async status => {
      const old = {
        id: 'old',
        status,
        subscriptionPlan: { planType: 'sms', planKey: 'starter' },
      };
      const h = harness([old]);
      expect(await h.service.grantFreeSmsTrial(42)).toEqual({
        subscription: old,
        created: false,
      });
      expect(h.subscriptions.save).not.toHaveBeenCalled();
    },
  );

  it('ignores public-page subscriptions and repairs a stale trial plan', async () => {
    const trial = {
      id: 'sms-plan',
      planKey: SMS_TRIAL_PLAN_KEY,
      planType: 'public_page',
      smsCount: 7,
      price: 99,
      durationDays: 2,
    };
    const h = harness(
      [{ id: 'public', subscriptionPlan: { planType: 'public_page' } }],
      trial,
    );
    const result = await h.service.grantFreeSmsTrial(42);
    expect(result.created).toBe(true);
    expect(result.subscription.smsTotal).toBe(50);
    expect(trial).toMatchObject({
      planType: 'sms',
      smsCount: 50,
      price: 0,
      durationDays: 30,
    });
  });

  it('recovers from a concurrent plan insert using a locking reread', async () => {
    const h = harness();
    const winner = {
      id: 'winner',
      ...SUBSCRIPTION_PLANS.find(p => p.planKey === SMS_TRIAL_PLAN_KEY),
    };
    h.plans.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    h.plans.save.mockRejectedValueOnce({
      driverError: { code: 'ER_DUP_ENTRY' },
    });
    const result = await h.service.grantFreeSmsTrial(42);
    expect(result.subscription.subscriptionPlanId).toBe('winner');
    expect(h.plans.findOne).toHaveBeenLastCalledWith({
      where: { planKey: SMS_TRIAL_PLAN_KEY },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('propagates non-duplicate database errors instead of silently losing the grant', async () => {
    const h = harness();
    h.plans.save.mockRejectedValueOnce(new Error('database failure'));
    await expect(h.service.grantFreeSmsTrial(42)).rejects.toThrow(
      'database failure',
    );
    expect(h.subscriptions.save).not.toHaveBeenCalled();
  });

  it('serves only the five positive-priced purchase plans and delegates the user list', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]) };
    const plans = new SubscriptionService(repo as any);
    const userPlans = new UserSubscriptionService(
      {} as any,
      {} as any,
      {} as any,
      plans,
    );
    await userPlans.getActivePlans();
    const query = repo.find.mock.calls[0][0];
    expect(query.where.planType).toBe('sms');
    expect(query.where.planKey.value).toEqual([...SMS_PURCHASE_PLAN_KEYS]);
    expect(query.where.price.value).toBe(0);
    await plans.findActive();
    expect(repo.find.mock.calls[1][0].where[0].planKey.value).toBe(
      SMS_TRIAL_PLAN_KEY,
    );
  });
});
