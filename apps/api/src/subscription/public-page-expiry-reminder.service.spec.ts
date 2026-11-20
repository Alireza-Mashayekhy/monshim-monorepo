jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { PUBLIC_PAGE_EXPIRING_REMINDER_DAYS } from 'src/notification/sms-templates';

import { UserSubscriptionStatus } from './entities/user-subscription.entity';
import {
  isExpiryReminderDue,
  PublicPageExpiryReminderService,
  remainingDaysUntil,
} from './public-page-expiry-reminder.service';

const DAY = 86_400_000;
const NOW = new Date('2026-06-01T10:00:00.000Z');

describe('یادآوری پایان اشتراک صفحهٔ اختصاصی — منطق زمان', () => {
  it('قالب ۹۲۵۸۰۶ برای «۷ روز مانده» استفاده می‌شود', () => {
    expect(PUBLIC_PAGE_EXPIRING_REMINDER_DAYS).toBe(7);
  });

  it('روزهای باقی‌مانده سقف‌گیری می‌شود (۶ روز و ۲۰ ساعت = ۷ روز)', () => {
    expect(remainingDaysUntil(new Date(NOW.getTime() + 6.8 * DAY), NOW)).toBe(
      7,
    );
  });

  it('در ۷ روز آخر یادآوری لازم است', () => {
    expect(isExpiryReminderDue(new Date(NOW.getTime() + 7 * DAY), NOW)).toBe(
      true,
    );
    expect(isExpiryReminderDue(new Date(NOW.getTime() + 1 * DAY), NOW)).toBe(
      true,
    );
  });

  it('بیش از ۷ روز مانده یا منقضی‌شده → یادآوری لازم نیست', () => {
    expect(isExpiryReminderDue(new Date(NOW.getTime() + 8 * DAY), NOW)).toBe(
      false,
    );
    expect(isExpiryReminderDue(new Date(NOW.getTime() - 1 * DAY), NOW)).toBe(
      false,
    );
    // دقیقاً لحظهٔ انقضا
    expect(isExpiryReminderDue(NOW, NOW)).toBe(false);
  });
});

describe('PublicPageExpiryReminderService', () => {
  function createHarness(options?: {
    candidates?: any[];
    hasExtension?: boolean;
    claimAffected?: number;
    sendResult?: boolean;
  }) {
    const candidates = options?.candidates ?? [];
    const updates: Array<{ criteria: any; patch: any }> = [];

    const queryBuilder = (kind: 'candidates' | 'extension') => {
      const qb: any = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => (kind === 'candidates' ? candidates : [])),
        getCount: jest.fn(async () =>
          options?.hasExtension && kind === 'extension' ? 1 : 0,
        ),
      };

      return qb;
    };

    let call = 0;
    const userSubscriptionRepo: any = {
      createQueryBuilder: jest.fn(() => {
        call += 1;
        // اولین فراخوانی = کوئری نامزدها؛ بعد از آن کوئری «تمدید کرده؟»
        return queryBuilder(call === 1 ? 'candidates' : 'extension');
      }),
      update: jest.fn(async (criteria: any, patch: any) => {
        updates.push({ criteria, patch });
        return { affected: options?.claimAffected ?? 1 };
      }),
    };

    const bookingSmsService: any = {
      sendPublicPageExpiringReminderToBarber: jest
        .fn()
        .mockResolvedValue(options?.sendResult ?? true),
    };

    const service = new PublicPageExpiryReminderService(
      userSubscriptionRepo,
      bookingSmsService,
    );

    return { service, updates, bookingSmsService, userSubscriptionRepo };
  }

  function makeSubscription(overrides: any = {}) {
    return {
      id: 'sub-1',
      userId: 42,
      status: UserSubscriptionStatus.ACTIVE,
      endDate: new Date(Date.now() + 3 * DAY),
      expiryReminderSmsSentAt: null,
      user: { id: 42, fullName: 'علی رضایی', phone: '09121234567' },
      subscriptionPlan: { planType: 'public_page' },
      ...overrides,
    };
  }

  it('برای اشتراک در آستانهٔ انقضا یک پیامک با قالب ۹۲۵۸۰۶ می‌فرستد', async () => {
    const { service, bookingSmsService } = createHarness({
      candidates: [makeSubscription()],
    });

    await expect(service.sendExpiryReminders()).resolves.toBe(1);

    expect(
      bookingSmsService.sendPublicPageExpiringReminderToBarber,
    ).toHaveBeenCalledTimes(1);
    expect(
      bookingSmsService.sendPublicPageExpiringReminderToBarber,
    ).toHaveBeenCalledWith('09121234567', { barberName: 'علی رضایی' });
  });

  it('قفل ارسال را قبل از پیامک می‌گیرد (idempotency)', async () => {
    const { service, updates } = createHarness({
      candidates: [makeSubscription()],
    });

    await service.sendExpiryReminders();

    expect(updates).toHaveLength(1);
    expect(updates[0].criteria).toMatchObject({
      id: 'sub-1',
      expiryReminderSmsSentAt: expect.anything(),
    });
    expect(updates[0].patch.expiryReminderSmsSentAt).toBeInstanceOf(Date);
  });

  it('اگر قفل قبلاً گرفته شده باشد، پیامکی نمی‌فرستد', async () => {
    const { service, bookingSmsService } = createHarness({
      candidates: [makeSubscription()],
      claimAffected: 0,
    });

    await expect(service.sendExpiryReminders()).resolves.toBe(0);
    expect(
      bookingSmsService.sendPublicPageExpiringReminderToBarber,
    ).not.toHaveBeenCalled();
  });

  it('اگر کاربر تمدید کرده باشد، پیامک هشدار نمی‌فرستد', async () => {
    const { service, bookingSmsService } = createHarness({
      candidates: [makeSubscription()],
      hasExtension: true,
    });

    await expect(service.sendExpiryReminders()).resolves.toBe(0);
    expect(
      bookingSmsService.sendPublicPageExpiringReminderToBarber,
    ).not.toHaveBeenCalled();
  });

  it('اگر شمارهٔ آرایشگر خالی باشد چیزی فرستاده نمی‌شود', async () => {
    const { service, bookingSmsService } = createHarness({
      candidates: [makeSubscription({ user: { id: 42, fullName: 'علی' } })],
    });

    await expect(service.sendExpiryReminders()).resolves.toBe(0);
    expect(
      bookingSmsService.sendPublicPageExpiringReminderToBarber,
    ).not.toHaveBeenCalled();
  });

  it('اگر ارسال شکست بخورد، قفل آزاد می‌شود تا اجرای بعدی دوباره تلاش کند', async () => {
    const { service, updates } = createHarness({
      candidates: [makeSubscription()],
      sendResult: false,
    });

    await expect(service.sendExpiryReminders()).resolves.toBe(0);

    const release = updates.at(-1);
    expect(release?.patch).toEqual({ expiryReminderSmsSentAt: null });
  });

  it('بدون نامزد هیچ پیامکی نمی‌فرستد و هیچ قفلی نمی‌گیرد', async () => {
    const { service, updates, bookingSmsService } = createHarness({
      candidates: [],
    });

    await expect(service.sendExpiryReminders()).resolves.toBe(0);
    expect(updates).toHaveLength(0);
    expect(
      bookingSmsService.sendPublicPageExpiringReminderToBarber,
    ).not.toHaveBeenCalled();
  });
});
