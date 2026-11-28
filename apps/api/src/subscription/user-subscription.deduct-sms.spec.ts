jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_HOUR: '0 0 * * * *' },
}));

import { UserSubscriptionStatus } from './entities/user-subscription.entity';
import { UserSubscriptionService } from './user-subscription.service';

function row(
  id: string,
  status: UserSubscriptionStatus,
  total: number,
  used: number,
  order = 0,
) {
  return {
    id,
    userId: 100,
    subscriptionPlanId: 'plan',
    status,
    smsTotal: total,
    smsUsed: used,
    createdAt: new Date(2026, 1, 1 + order),
    startDate: new Date('2020-01-01T00:00:00Z'),
    endDate: new Date('2099-01-01T00:00:00Z'),
    subscriptionPlan: {
      id: 'plan',
      planType: 'sms',
      durationDays: 30,
      smsCount: 10,
      price: 100,
    },
  };
}

function harness(initial: ReturnType<typeof row>[]) {
  const rows = initial;
  const usages: any[] = [];
  const qb: any = {};
  for (const method of [
    'innerJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'setLock',
  ])
    qb[method] = jest.fn().mockReturnThis();
  qb.getMany = jest.fn(async () =>
    rows
      .filter(item =>
        [
          UserSubscriptionStatus.ACTIVE,
          UserSubscriptionStatus.RESERVED,
        ].includes(item.status),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  );
  const subscriptionRepo: any = {
    createQueryBuilder: jest.fn(() => qb),
    save: jest.fn(async value => value),
  };
  const usageRepo: any = {
    create: (value: any) => value,
    save: jest.fn(async value => {
      usages.push(value);
      return value;
    }),
  };
  const userRepo = { findOne: jest.fn().mockResolvedValue({ id: 100 }) };
  const manager: any = {
    getRepository: jest.fn((entity: any) =>
      entity.name === 'UserSubscription'
        ? subscriptionRepo
        : entity.name === 'SmsUsage'
          ? usageRepo
          : userRepo,
    ),
  };
  subscriptionRepo.manager = { transaction: jest.fn((fn: any) => fn(manager)) };
  const service = new UserSubscriptionService(
    subscriptionRepo,
    {} as any,
    usageRepo,
    {} as any,
  );
  return { rows, usages, service, manager, qb, userRepo, subscriptionRepo };
}

describe('deductSms queue', () => {
  it('rejects no subscription and invalid counts', async () => {
    const h = harness([]);
    await expect(h.service.deductSms(100, 1)).rejects.toThrow(
      'برای ارسال پیامک ابتدا باید یکی از پلن‌های اشتراک را خریداری کنید',
    );
    await expect(h.service.deductSms(100, 0)).rejects.toThrow(
      'تعداد پیامک برای کسر باید حداقل ۱ باشد',
    );
    await expect(h.service.deductSms(100, 1.5)).rejects.toThrow(
      'تعداد پیامک برای کسر باید حداقل ۱ باشد',
    );
  });

  it('debits across FIFO plans and promotes immediately on exact exhaustion', async () => {
    const first = row('first', UserSubscriptionStatus.ACTIVE, 10, 9);
    const next = row('next', UserSubscriptionStatus.RESERVED, 10, 0, 1);
    const third = row('third', UserSubscriptionStatus.RESERVED, 10, 0, 2);
    const h = harness([first, next, third]);
    const before = Date.now();
    await h.service.deductSms(100, 2, 'test');
    expect(first).toMatchObject({
      status: UserSubscriptionStatus.EXPIRED,
      smsUsed: 10,
    });
    expect(next).toMatchObject({
      status: UserSubscriptionStatus.ACTIVE,
      smsUsed: 1,
    });
    expect(third.status).toBe(UserSubscriptionStatus.RESERVED);
    expect(next.startDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(next.endDate.getTime() - next.startDate.getTime()).toBe(
      30 * 86400000,
    );
    expect(h.usages).toEqual([
      expect.objectContaining({ userSubscriptionId: 'first', count: 1 }),
      expect.objectContaining({ userSubscriptionId: 'next', count: 1 }),
    ]);
    expect(h.userRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(h.qb.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('expires at the exact end instant and promotes with a full term', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T00:00:00Z'));
    try {
      const first = row('first', UserSubscriptionStatus.ACTIVE, 10, 0);
      first.endDate = new Date('2026-03-01T00:00:00Z');
      const next = row('next', UserSubscriptionStatus.RESERVED, 10, 0, 1);
      const h = harness([first, next]);
      const result = await h.service.getCurrent(100);
      expect(first.status).toBe(UserSubscriptionStatus.EXPIRED);
      expect(result?.id).toBe('next');
      expect(next.startDate.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(next.endDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('converts a legacy future ACTIVE renewal into the queue rather than blocking promotion', async () => {
    const first = row('first', UserSubscriptionStatus.ACTIVE, 1, 0);
    const legacy = row('legacy', UserSubscriptionStatus.ACTIVE, 10, 0, 1);
    legacy.startDate = new Date('2090-01-01T00:00:00Z');
    const h = harness([first, legacy]);
    await h.service.deductSms(100, 1);
    expect(first.status).toBe(UserSubscriptionStatus.EXPIRED);
    expect(legacy.status).toBe(UserSubscriptionStatus.ACTIVE);
    expect(legacy.startDate.getTime()).toBeLessThan(
      Date.parse('2090-01-01T00:00:00Z'),
    );
  });

  it('does not deduct anything when the whole queue has insufficient quota', async () => {
    const first = row('first', UserSubscriptionStatus.ACTIVE, 10, 9);
    const next = row('next', UserSubscriptionStatus.RESERVED, 3, 2, 1);
    const h = harness([first, next]);
    await expect(h.service.deductSms(100, 3)).rejects.toThrow(
      'اعتبار پیامک کافی نیست (پیامک باقی‌مانده: 2)',
    );
    expect(first.smsUsed).toBe(9);
    expect(next.status).toBe(UserSubscriptionStatus.RESERVED);
    expect(h.usages).toHaveLength(0);
  });

  it('respects the caller transaction manager and does not start a second transaction', async () => {
    const first = row('first', UserSubscriptionStatus.ACTIVE, 10, 2);
    const h = harness([first]);
    await h.service.deductSms(100, 2, 'test', h.manager);
    expect(h.subscriptionRepo.manager.transaction).not.toHaveBeenCalled();
    expect(first.smsUsed).toBe(4);
    expect(h.usages).toEqual([
      expect.objectContaining({ userSubscriptionId: 'first', count: 2 }),
    ]);
  });

  it('promotes the first queued plan even when the final credit is consumed exactly', async () => {
    const first = row('first', UserSubscriptionStatus.ACTIVE, 1, 0);
    const next = row('next', UserSubscriptionStatus.RESERVED, 10, 0, 1);
    const h = harness([first, next]);
    await h.service.deductSms(100, 1);
    expect(first.status).toBe(UserSubscriptionStatus.EXPIRED);
    expect(next.status).toBe(UserSubscriptionStatus.ACTIVE);
    expect(next.smsUsed).toBe(0);
  });
});
