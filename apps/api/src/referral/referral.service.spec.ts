import { Referral, ReferralStatus } from './entities/referral.entity';
import { ReferralService } from './referral.service';

/**
 * تست‌های پاداش «دعوت آرایشگر».
 *
 * قاعدهٔ محصول: دعوت‌کننده ۳۰۰٬۰۰۰ تومان می‌گیرد **به شرطی که آرایشگر
 * دعوت‌شده** یکی از این دو کار را انجام داده باشد:
 *   ۱. ۳۰ رزرو موفقِ پرداخت‌شده؛
 *   ۲. یا خرید صفحهٔ اختصاصی.
 *
 * باگ قبلی: شمارش رزروها و خرید صفحه برای **دعوت‌کننده** انجام می‌شد و
 * فعالیت آرایشگر دعوت‌شده هیچ نقشی نداشت؛ حتی بلافاصله بعد از ثبت‌نام،
 * پاداش واریز می‌شد. این تست‌ها همان سناریوها را روی رفتار درست قفل می‌کنند.
 */
describe('ReferralService rewards (شرط روی آرایشگر دعوت‌شده)', () => {
  const REQUIRED_PAID_BOOKINGS = 30;
  const REFERRER_USER_ID = 10;
  const REFERRED_USER_ID = 20;
  const REFERRED_PROFILE_ID = 'profile-20';

  interface Setup {
    /** رزروهای موفقِ پرداخت‌شدهٔ **آرایشگر دعوت‌شده** */
    referredPaidBookings?: number;
    /** آیا **آرایشگر دعوت‌شده** صفحهٔ اختصاصی خریده است؟ */
    referredPurchasedPage?: boolean;
    /** رزروهای موفقِ پرداخت‌شدهٔ **دعوت‌کننده** (نباید هیچ نقشی داشته باشد) */
    referrerPaidBookings?: number;
    /** آیا **دعوت‌کننده** صفحهٔ اختصاصی خریده است؟ (نباید نقشی داشته باشد) */
    referrerPurchasedPage?: boolean;
  }

  const createService = ({
    referredPaidBookings = 0,
    referredPurchasedPage = false,
    referrerPaidBookings = 0,
    referrerPurchasedPage = false,
  }: Setup = {}) => {
    const referrals: Referral[] = [
      {
        id: 'ref-1',
        referrerUserId: REFERRER_USER_ID,
        referredUserId: REFERRED_USER_ID,
        referrerProfileId: 'profile-10',
        referredProfileId: REFERRED_PROFILE_ID,
        status: ReferralStatus.PENDING,
        completedBookingsCount: 0,
        rewardPaid: false,
      } as Referral,
    ];

    const referralRepo = {
      // `find` بر اساس همان شرطی که سرویس می‌دهد فیلتر می‌کند تا اگر سرویس
      // به‌جای دعوت‌شده سراغ دعوت‌کننده برود، تست شکست بخورد.
      find: jest.fn(({ where }: any) => {
        const matched = referrals.filter(referral => {
          if (where.status && referral.status !== where.status) return false;
          if (
            where.referredProfileId &&
            referral.referredProfileId !== where.referredProfileId
          ) {
            return false;
          }
          if (
            where.referredUserId &&
            referral.referredUserId !== where.referredUserId
          ) {
            return false;
          }
          if (
            where.referrerProfileId &&
            referral.referrerProfileId !== where.referrerProfileId
          ) {
            return false;
          }
          if (
            where.referrerUserId &&
            referral.referrerUserId !== where.referrerUserId
          ) {
            return false;
          }
          return true;
        });
        return Promise.resolve(matched);
      }),
      save: jest.fn((referral: Referral) => Promise.resolve(referral)),
    };

    const barberProfileRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'profile-10', userId: 10 }),
    };

    const publicPageService = {
      // تفکیک صریح: هر شناسه‌ای که پروفایل دعوت‌شده باشد → آمار دعوت‌شده؛
      // هر شناسهٔ دیگری (پروفایل دعوت‌کننده) → آمار دعوت‌کننده.
      countSuccessfulPaidBookings: jest.fn((profileId: string) =>
        Promise.resolve(
          profileId === REFERRED_PROFILE_ID
            ? referredPaidBookings
            : referrerPaidBookings,
        ),
      ),
      hasPurchasedPackageByUserId: jest.fn((userId: number) =>
        Promise.resolve(
          userId === REFERRED_USER_ID
            ? referredPurchasedPage
            : referrerPurchasedPage,
        ),
      ),
    };

    const managerReferralRepo = {
      findOne: jest.fn(() => Promise.resolve(referrals[0])),
      save: jest.fn((referral: Referral) => Promise.resolve(referral)),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: any) => Promise<void>) =>
        callback({ getRepository: () => managerReferralRepo }),
      ),
    };
    const walletService = {
      depositOnceWithManager: jest.fn().mockResolvedValue({}),
    };

    const service = new ReferralService(
      referralRepo as any,
      barberProfileRepo as any,
      publicPageService as any,
      dataSource as any,
      walletService as any,
    );

    return {
      service,
      referrals,
      referralRepo,
      publicPageService,
      walletService,
      managerReferralRepo,
    };
  };

  describe('باگ گزارش‌شده: پاداش بدون تحقق شرط واریز می‌شد', () => {
    it('بدون هیچ رزرو و بدون خرید صفحه، هیچ پاداشی واریز نمی‌شود', async () => {
      const { service, walletService } = createService();

      await service.onReferredBookingActivity(REFERRED_PROFILE_ID);

      expect(walletService.depositOnceWithManager).not.toHaveBeenCalled();
    });

    it('رزروها و خرید صفحهٔ خودِ دعوت‌کننده هیچ پاداشی ایجاد نمی‌کند', async () => {
      // همان حالتی که باعث باگ بود: دعوت‌کننده شرط را دارد، دعوت‌شده ندارد.
      const { service, walletService } = createService({
        referrerPaidBookings: 100,
        referrerPurchasedPage: true,
        referredPaidBookings: 0,
        referredPurchasedPage: false,
      });

      await service.onReferredBookingActivity(REFERRED_PROFILE_ID);

      expect(walletService.depositOnceWithManager).not.toHaveBeenCalled();
    });

    it('فقط ۲۹ رزرو موفقِ دعوت‌شده کافی نیست', async () => {
      const { service, walletService } = createService({
        referredPaidBookings: REQUIRED_PAID_BOOKINGS - 1,
      });

      await service.onReferredBookingActivity(REFERRED_PROFILE_ID);

      expect(walletService.depositOnceWithManager).not.toHaveBeenCalled();
    });

    it('بلافاصله پس از ثبت‌نام (بدون فعالیت دعوت‌شده) پاداشی واریز نمی‌شود', async () => {
      const { service, walletService } = createService();

      await service.onReferredProgress(REFERRED_USER_ID);

      expect(walletService.depositOnceWithManager).not.toHaveBeenCalled();
    });
  });

  describe('تحقق شرط اول: ۳۰ رزرو موفقِ پرداخت‌شدهٔ دعوت‌شده', () => {
    it('با رسیدن دعوت‌شده به ۳۰ رزرو، پاداش به دعوت‌کننده واریز می‌شود', async () => {
      const { service, referrals, walletService, managerReferralRepo } =
        createService({ referredPaidBookings: REQUIRED_PAID_BOOKINGS });

      await service.onReferredBookingActivity(REFERRED_PROFILE_ID);

      expect(walletService.depositOnceWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          // پاداش به دعوت‌کننده می‌رسد
          userId: REFERRER_USER_ID,
          amount: 300_000,
          paymentId: 'referral-ref-1',
          legacyReference: 'ref-1',
        }),
      );
      expect(referrals[0]).toMatchObject({
        status: ReferralStatus.COMPLETED,
        rewardPaid: true,
        completedBookingsCount: REQUIRED_PAID_BOOKINGS,
      });
      expect(managerReferralRepo.save).toHaveBeenCalled();
    });

    it('شمارش رزرو روی پروفایل دعوت‌شده انجام می‌شود، نه دعوت‌کننده', async () => {
      const { service, publicPageService } = createService({
        referredPaidBookings: REQUIRED_PAID_BOOKINGS,
      });

      await service.onReferredBookingActivity(REFERRED_PROFILE_ID);

      expect(
        publicPageService.countSuccessfulPaidBookings,
      ).toHaveBeenCalledWith(REFERRED_PROFILE_ID);
      expect(
        publicPageService.hasPurchasedPackageByUserId,
      ).toHaveBeenCalledWith(REFERRED_USER_ID);
    });
  });

  describe('تحقق شرط دوم: خرید صفحهٔ اختصاصی توسط دعوت‌شده', () => {
    it('خرید صفحه توسط دعوت‌شده، حتی زیر ۳۰ رزرو، پاداش را واریز می‌کند', async () => {
      const { service, referrals, walletService } = createService({
        referredPaidBookings: 3,
        referredPurchasedPage: true,
      });

      await service.onReferredBookingActivity(REFERRED_PROFILE_ID);

      expect(walletService.depositOnceWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: REFERRER_USER_ID, amount: 300_000 }),
      );
      expect(referrals[0]).toMatchObject({
        status: ReferralStatus.COMPLETED,
        rewardPaid: true,
        completedBookingsCount: 3,
      });
    });

    it('کال‌بک خرید صفحهٔ دعوت‌شده پاداش را واریز می‌کند', async () => {
      const { service, walletService, publicPageService } = createService({
        referredPurchasedPage: true,
      });

      await service.onReferredPublicPagePurchased(REFERRED_USER_ID);

      expect(
        publicPageService.countSuccessfulPaidBookings,
      ).toHaveBeenCalledWith(REFERRED_PROFILE_ID);
      expect(walletService.depositOnceWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: REFERRER_USER_ID, amount: 300_000 }),
      );
    });

    it('خرید صفحهٔ خودِ دعوت‌کننده پاداشی برای دعوت او نمی‌سازد', async () => {
      const { service, walletService } = createService({
        referrerPurchasedPage: true,
      });

      // کال‌بک خرید برای دعوت‌کننده صدا زده می‌شود، ولی او دعوت‌شده نیست.
      await service.onReferredPublicPagePurchased(REFERRER_USER_ID);

      expect(walletService.depositOnceWithManager).not.toHaveBeenCalled();
    });
  });

  describe('ایمنی و idempotency', () => {
    it('آرایشگری که دعوت نشده هیچ ارزیابی‌ای را فعال نمی‌کند', async () => {
      const { service, walletService, publicPageService } = createService();

      await service.onReferredBookingActivity('profile-unknown');

      expect(
        publicPageService.countSuccessfulPaidBookings,
      ).not.toHaveBeenCalled();
      expect(walletService.depositOnceWithManager).not.toHaveBeenCalled();
    });

    it('پاداشِ قبلاً واریزشده دوباره پرداخت نمی‌شود', async () => {
      const { service, referrals, walletService } = createService({
        referredPaidBookings: REQUIRED_PAID_BOOKINGS,
      });
      referrals[0].rewardPaid = true;
      referrals[0].status = ReferralStatus.COMPLETED;

      await service.onReferredBookingActivity(REFERRED_PROFILE_ID);

      // دعوت دیگر PENDING نیست، پس حتی ارزیابی هم نمی‌شود.
      expect(walletService.depositOnceWithManager).not.toHaveBeenCalled();
    });
  });

  describe('گزارش شرایط برای پنل (getMyReferrals)', () => {
    it('پیشرفت هر دعوت بر اساس فعالیت همان دعوت‌شده گزارش می‌شود', async () => {
      const { service } = createService({
        referredPaidBookings: REQUIRED_PAID_BOOKINGS - 1,
        referrerPaidBookings: 500,
      });

      const info = await service.getMyReferrals(REFERRER_USER_ID);

      expect(info.eligibility).toMatchObject({
        // عدد دعوت‌کننده (۵۰۰) نباید نشت کند.
        completedPaidBookingsCount: REQUIRED_PAID_BOOKINGS - 1,
        requiredPaidBookings: REQUIRED_PAID_BOOKINGS,
        hasPurchasedPublicPage: false,
        isEligible: false,
      });
      expect(info.referrals[0].completedBookingsCount).toBe(
        REQUIRED_PAID_BOOKINGS - 1,
      );
      expect(info.referrals[0].hasPurchasedPublicPage).toBe(false);
    });

    it('وضعیت واجد شرایط با تحقق یکی از دو شرط گزارش می‌شود', async () => {
      const byBookings = createService({
        referredPaidBookings: REQUIRED_PAID_BOOKINGS,
      });
      expect(
        (await byBookings.service.getMyReferrals(REFERRER_USER_ID)).eligibility
          .isEligible,
      ).toBe(true);

      const byPurchase = createService({ referredPurchasedPage: true });
      const purchaseInfo =
        await byPurchase.service.getMyReferrals(REFERRER_USER_ID);
      expect(purchaseInfo.eligibility).toMatchObject({
        hasPurchasedPublicPage: true,
        isEligible: true,
      });
    });
  });
});

describe('جمع پاداش‌های گزارش‌شده در getMyReferrals', () => {
  const build = (referrals: Referral[]) => {
    const referralRepo = {
      find: jest.fn().mockResolvedValue(referrals),
      save: jest.fn(),
    };
    const barberProfileRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'profile-10', userId: 10 }),
    };
    const publicPageService = {
      countSuccessfulPaidBookings: jest.fn().mockResolvedValue(0),
      hasPurchasedPackageByUserId: jest.fn().mockResolvedValue(false),
    };
    return new ReferralService(
      referralRepo as any,
      barberProfileRepo as any,
      publicPageService as any,
      {} as any,
      {} as any,
    );
  };

  const referral = (id: string, rewardPaid: boolean): Referral =>
    ({
      id,
      referrerUserId: 10,
      referredUserId: 20,
      referrerProfileId: 'profile-10',
      referredProfileId: `profile-${id}`,
      status: rewardPaid ? ReferralStatus.COMPLETED : ReferralStatus.PENDING,
      completedBookingsCount: 0,
      rewardPaid,
    }) as Referral;

  it('واریزشده و در انتظار، مبلغ کل را می‌سازند', async () => {
    const service = build([
      referral('a', true),
      referral('b', false),
      referral('c', false),
    ]);

    const info = await service.getMyReferrals(10);

    expect(info.eligibility).toMatchObject({
      rewardAmount: 300_000,
      paidRewardAmount: 300_000,
      unpaidRewardAmount: 600_000,
    });
    expect(
      (info.eligibility.paidRewardAmount ?? 0) +
        (info.eligibility.unpaidRewardAmount ?? 0),
    ).toBe(3 * 300_000);
  });

  it('بدون دعوت، همهٔ مبالغ صفرند', async () => {
    const info = await build([]).getMyReferrals(10);

    expect(info.eligibility).toMatchObject({
      paidRewardAmount: 0,
      unpaidRewardAmount: 0,
      isEligible: false,
    });
  });

  it('پیشرفت هر دعوت مستقل گزارش می‌شود', async () => {
    const referrals = [referral('a', false), referral('b', false)];
    const referralRepo = {
      find: jest.fn().mockResolvedValue(referrals),
      save: jest.fn(),
    };
    const publicPageService = {
      // «a» به ۳۰ رزرو رسیده، «b» در ۵ رزرو مانده است.
      countSuccessfulPaidBookings: jest.fn((profileId: string) =>
        Promise.resolve(profileId === 'profile-a' ? 30 : 5),
      ),
      hasPurchasedPackageByUserId: jest.fn().mockResolvedValue(false),
    };
    const service = new ReferralService(
      referralRepo as any,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'profile-10', userId: 10 }),
      } as any,
      publicPageService as any,
      {} as any,
      {} as any,
    );

    const info = await service.getMyReferrals(10);

    expect(info.referrals.map(r => [r.id, r.completedBookingsCount])).toEqual([
      ['a', 30],
      ['b', 5],
    ]);
  });
});
