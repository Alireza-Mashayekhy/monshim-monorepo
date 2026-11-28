jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { UserSubscriptionController } from './user-subscription.controller';

describe('current SMS subscription response', () => {
  it('keeps the existing entity shape and exposes the trial flag', async () => {
    const current = {
      id: 'sub',
      subscriptionPlanId: 'trial',
      price: 0,
      smsTotal: 50,
      smsUsed: 0,
      status: 'active',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2099-01-01'),
      subscriptionPlan: { planKey: 'sms_trial', name: 'هدیه' },
    };
    const service = { getCurrent: jest.fn().mockResolvedValue(current) };
    const controller = new UserSubscriptionController(service as any);
    expect(await controller.getCurrent({ user: { id: 42 } })).toEqual({
      ...current,
      isFreeTrial: true,
    });
    expect(service.getCurrent).toHaveBeenCalledWith(42);
    service.getCurrent.mockResolvedValueOnce(null);
    expect(await controller.getCurrent({ user: { id: 42 } })).toBeNull();
  });
});
