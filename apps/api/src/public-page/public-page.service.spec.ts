jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';

import { PUBLIC_PAGE_DISCOUNT_BASE_PRICE_TOMANS } from './constants';
import {
  PUBLIC_PAGE_SLUG_LOCKED_MESSAGE,
  PublicPageService,
} from './public-page.service';
import { normalizePublicPageSlug, validatePublicPageSlug } from './slug.util';

describe('PublicPage slug utility', () => {
  it('نرمال‌سازی حروف بزرگ و ارقام فارسی/عربی را انجام می‌دهد', () => {
    expect(normalizePublicPageSlug('  Aria-Salon-۱۲۳  ')).toBe(
      'aria-salon-123',
    );
    expect(normalizePublicPageSlug('Salon-٤٥')).toBe('salon-45');
  });

  it('اسلاگ‌های معتبر انگلیسی را می‌پذیرد و موارد نامعتبر را رد می‌کند', () => {
    expect(validatePublicPageSlug('aria-vip-24')).toEqual({
      valid: true,
      slug: 'aria-vip-24',
    });

    // فقط عدد نباید پذیرفته شود (جلوگیری از تداخل با user.id)
    expect(validatePublicPageSlug('12345').valid).toBe(false);

    // کوتاه‌تر از ۳ کاراکتر
    expect(validatePublicPageSlug('ab').valid).toBe(false);

    // خط تیره در ابتدا/انتها یا دو خط تیره متوالی
    expect(validatePublicPageSlug('-aria').valid).toBe(false);
    expect(validatePublicPageSlug('aria-').valid).toBe(false);
    expect(validatePublicPageSlug('aria--salon').valid).toBe(false);

    // حروف غیرانگلیسی و کاراکترهای غیرمجاز
    expect(validatePublicPageSlug('سالن-آریا').valid).toBe(false);
    expect(validatePublicPageSlug('aria_salon').valid).toBe(false);

    // کلمات رزروشده
    expect(validatePublicPageSlug('admin').valid).toBe(false);
    expect(validatePublicPageSlug('directory').valid).toBe(false);
  });
});

describe('PublicPageService', () => {
  it('کد تخفیف را بدون حساسیت به بزرگی حروف اعمال و مبلغ را محاسبه می‌کند', async () => {
    const { service } = createService({
      discount: { code: 'SAVE25', percentOff: 25, isActive: true },
    });

    await expect(service.getDiscountQuote(' save25 ')).resolves.toEqual({
      code: 'SAVE25',
      percentOff: 25,
      originalAmount: PUBLIC_PAGE_DISCOUNT_BASE_PRICE_TOMANS,
      discountAmount: Math.round(
        (PUBLIC_PAGE_DISCOUNT_BASE_PRICE_TOMANS * 25) / 100,
      ),
      amount:
        PUBLIC_PAGE_DISCOUNT_BASE_PRICE_TOMANS -
        Math.round((PUBLIC_PAGE_DISCOUNT_BASE_PRICE_TOMANS * 25) / 100),
    });
  });

  it('به‌صورت پیش‌فرض تخفیف ۵۰٪ی معرفی غیرفعال است و اعمال نمی‌شود', async () => {
    delete process.env.ENABLE_REFERRAL_PUBLIC_PAGE_DISCOUNT;
    const { service } = createService({ hasReferral: true });

    await expect(service.hasReferralDiscount(20)).resolves.toBe(false);
    await expect(service.getReferralDiscountQuote(20)).resolves.toBeNull();
  });

  it('با روشن‌کردن feature flag، تخفیف ۵۰٪ی معرفی برای کاربر دعوت‌شده اعمال می‌شود', async () => {
    process.env.ENABLE_REFERRAL_PUBLIC_PAGE_DISCOUNT = 'true';
    try {
      const { service } = createService({ hasReferral: true });

      await expect(service.getReferralDiscountQuote(20)).resolves.toEqual({
        code: null,
        percentOff: 50,
        originalAmount: PUBLIC_PAGE_DISCOUNT_BASE_PRICE_TOMANS,
        discountAmount: 386_500,
        amount: 386_500,
      });
    } finally {
      delete process.env.ENABLE_REFERRAL_PUBLIC_PAGE_DISCOUNT;
    }
  });

  it('کد تخفیف صددرصدی خرید را رایگان می‌کند و کد نامعتبر رد می‌شود', async () => {
    const { service } = createService({
      discount: { code: 'FREE100', percentOff: 100, isActive: true },
    });
    await expect(service.getDiscountQuote('FREE100')).resolves.toMatchObject({
      amount: 0,
      discountAmount: PUBLIC_PAGE_DISCOUNT_BASE_PRICE_TOMANS,
    });

    const { service: withoutDiscount } = createService();
    await expect(withoutDiscount.getDiscountQuote('MISSING')).rejects.toThrow(
      'کد تخفیف نامعتبر یا غیرفعال است',
    );
  });

  function createMockBookingQb(options?: { count?: number; rawRows?: any[] }) {
    const subQb: any = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest
        .fn()
        .mockReturnValue(
          '(SELECT 1 FROM payments gatewayPayment WHERE gatewayPayment.status = :paidPaymentStatus)',
        ),
    };

    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      subQuery: jest.fn(() => subQb),
      getCount: jest.fn().mockResolvedValue(options?.count ?? 0),
      getRawMany: jest.fn().mockResolvedValue(options?.rawRows ?? []),
      __subQb: subQb,
    };

    return qb;
  }

  function createService(params?: {
    profile?: any;
    profiles?: any[];
    existingSlugOwner?: any;
    purchase?: any;
    paidBookingsCount?: number;
    qualifiedRows?: any[];
    directorySubscriptions?: any[];
    /** رکوردهای «هر وضعیت» برای ساخت `lastSubscription` (فقط وقتی اشتراک فعالی نیست استفاده می‌شود) */
    latestSubscriptions?: any[];
    duplicateDbError?: boolean;
    updateAffected?: number;
    discount?: any;
    hasReferral?: boolean;
    subscription?: any;
    /** ردیف‌های جدول خرید قبلی پکیج (ورودی انتقال خریداران قبلی) */
    legacyPurchases?: Array<{ userId: number }>;
    /** نتیجهٔ اعطای مهلت انتقالی به ازای هر کاربر (null = پلن seed نشده) */
    legacyGrant?: (
      userId: number,
    ) => { created: boolean } | null | Promise<{ created: boolean } | null>;
  }) {
    const bookingQb = createMockBookingQb({
      count: params?.paidBookingsCount ?? 0,
      rawRows: params?.qualifiedRows ?? [],
    });

    const purchaseRepo: any = {
      findOne: jest.fn().mockResolvedValue(params?.purchase ?? null),
      find: jest.fn().mockResolvedValue(params?.legacyPurchases ?? []),
      create: jest.fn(x => x),
      save: jest.fn(x => Promise.resolve(x)),
    };

    const profileRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        if (where?.userId !== undefined) {
          return Promise.resolve(params?.profile ?? null);
        }
        if (where?.slug !== undefined) {
          if (params?.existingSlugOwner !== undefined) {
            return Promise.resolve(params.existingSlugOwner);
          }
          if (params?.profile && params.profile.slug === where.slug) {
            return Promise.resolve(params.profile);
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockResolvedValue(params?.profiles ?? []),
      update: jest.fn(() => {
        if (params?.duplicateDbError) {
          const err = Object.assign(new Error('Duplicate entry'), {
            driverError: { code: 'ER_DUP_ENTRY', errno: 1062 },
          });
          return Promise.reject(err);
        }
        return Promise.resolve({ affected: params?.updateAffected ?? 1 });
      }),
    };

    const bookingRepo: any = {
      createQueryBuilder: jest.fn(() => bookingQb),
    };

    const barberService: any = {
      findPublicOne: jest.fn((userId: number) =>
        Promise.resolve({
          id: userId,
          salonName: 'سالن آریا',
          services: [
            { id: 's-1', name: 'اصلاح', price: 200000, durationMinutes: 30 },
          ],
        }),
      ),
      getPublicDirectory: jest.fn(() =>
        Promise.resolve({
          barbers: (params?.profiles ?? []).map(p => ({ id: p.userId })),
          cities: [],
        }),
      ),
    };

    const configService: any = {
      get: jest.fn((key: string) =>
        key === 'FRONT_URL' ? 'https://monshiim.ir' : undefined,
      ),
    };

    const discountRepo: any = {
      findOne: jest.fn().mockResolvedValue(params?.discount ?? null),
    };
    const referralRepo: any = {
      count: jest.fn().mockResolvedValue(params?.hasReferral ? 1 : 0),
    };
    const userSubscriptionService = {
      getCurrentPublicPageSubscription: jest
        .fn()
        .mockResolvedValue(params?.subscription ?? null),
      findActivePublicPageSubscriptionsForUsers: jest
        .fn()
        .mockResolvedValue(params?.directorySubscriptions ?? []),
      findPublicPageSubscriptionsForUsers: jest
        .fn()
        .mockResolvedValue(params?.latestSubscriptions ?? []),
      grantLegacyPublicPageAccess: jest.fn((userId: number) =>
        Promise.resolve(
          params?.legacyGrant ? params.legacyGrant(userId) : { created: true },
        ),
      ),
      backfillFreePublicPageTrialForExistingBarbers: jest
        .fn()
        .mockResolvedValue({
          candidates: 0,
          granted: 0,
          failed: 0,
          dryRun: false,
        }),
    };

    const service = new PublicPageService(
      purchaseRepo,
      discountRepo,
      profileRepo,
      bookingRepo,
      referralRepo,
      barberService,
      configService,
      userSubscriptionService as never,
    );

    return {
      service,
      bookingQb,
      profileRepo,
      purchaseRepo,
      barberService,
      userSubscriptionService,
    };
  }

  it('بدون اشتراک فعال، صفحه غیرفعال است حتی اگر رزروهای موفق زیاد داشته باشیم', async () => {
    const { service, bookingQb } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      paidBookingsCount: 300,
    });

    const status = await service.getStatusByUserId(42);
    expect(status.lastSubscription).toBeNull();
    expect(status.isActive).toBe(false);
    expect(status.reason).toBeNull();
    expect(status.publicUrl).toBeNull();

    // مسیر رزرو/خرید حذف شده است و دیگر باعث فعال‌شدن نمی‌شود.
    expect(bookingQb.andWhere).not.toHaveBeenCalled();
  });

  it('اشتراک منقضی‌شده: lastSubscription با تاریخ پایان نمایش داده می‌شود ولی صفحه فعال نیست', async () => {
    const { service } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      latestSubscriptions: [
        {
          id: 'sub-old',
          userId: 42,
          subscriptionPlanId: 'plan-trial',
          subscriptionPlan: {
            planKey: 'public_page_trial',
            name: 'پروفایل اختصاصی رایگان',
            price: 0,
            planType: 'public_page',
          },
          price: 0,
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2026-10-01T00:00:00Z'),
          status: 'expired',
        },
      ],
    });

    const status = await service.getStatusByUserId(42);
    expect(status.isActive).toBe(false);
    expect(status.subscription).toBeNull();
    expect(status.lastSubscription).toMatchObject({
      id: 'sub-old',
      display: 'expired',
      isFreeTrial: true,
      planName: 'پروفایل اختصاصی رایگان',
    });
  });

  it('با اشتراک فعال پروفایل اختصاصی، صفحه با دلیل SUBSCRIPTION فعال می‌شود', async () => {
    const { service, bookingQb } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      paidBookingsCount: 300,
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    const status = await service.getStatusByUserId(42);
    expect(status.isActive).toBe(true);
    expect(status.reason).toBe('SUBSCRIPTION');
    expect(status.slug).toBe('aria-salon');
    expect(status.publicUrl).toBe('https://monshiim.ir/provider/aria-salon');
    expect(status.subscription?.isFreeTrial).toBe(true);
    // دیگر فیلدهای مسیر حذف‌شده وجود ندارد.
    expect('paidBookingsCount' in status).toBe(false);
    expect('packagePriceTomans' in status).toBe(false);

    expect(bookingQb.andWhere).not.toHaveBeenCalled();
  });

  it('وقتی صفحه فعال است اما هنوز اسلاگ ثبت نشده، آیدی را در publicUrl نشان نمی‌دهد', async () => {
    const { service } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    const status = await service.getStatusByUserId(42);
    expect(status.isActive).toBe(true);
    expect(status.reason).toBe('SUBSCRIPTION');
    expect(status.slug).toBeNull();
    expect(status.publicUrl).toBeNull();
  });

  it('اجازهٔ ثبت اسلاگ قبل از فعال شدن صفحهٔ اختصاصی را نمی‌دهد', async () => {
    const { service } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      paidBookingsCount: 10,
    });

    await expect(
      service.updateSlugByUserId(42, 'aria-salon'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('اسلاگ تکراری را رد می‌کند و اسلاگ یکتا را ذخیره و در لینک عمومی قرار می‌دهد', async () => {
    const { service: dupService } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      existingSlugOwner: { id: 'prof-other', userId: 99 },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    const availability = await dupService.checkSlugAvailability(
      42,
      'aria-salon',
    );
    expect(availability.valid).toBe(true);
    expect(availability.available).toBe(false);

    await expect(
      dupService.updateSlugByUserId(42, 'aria-salon'),
    ).rejects.toBeInstanceOf(ConflictException);

    const { service: okService, profileRepo } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    const updated = await okService.updateSlugByUserId(42, '  Aria-Salon  ');
    // شرط `slug: IsNull()` نوشتن یک‌باره را تضمین می‌کند.
    expect(profileRepo.update).toHaveBeenCalledWith(
      { id: 'prof-1', slug: IsNull() },
      { slug: 'aria-salon' },
    );
    expect(updated.slug).toBe('aria-salon');
    expect(updated.isSlugLocked).toBe(true);
    expect(updated.publicUrl).toBe('https://monshiim.ir/provider/aria-salon');
  });

  it('پس از ثبت، تغییر اسلاگ را رد می‌کند (اسلاگ یک‌باره و غیرقابل برگشت است)', async () => {
    const { service, profileRepo } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    await expect(
      service.updateSlugByUserId(42, 'aria-salon-2'),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.updateSlugByUserId(42, 'aria-salon-2'),
    ).rejects.toMatchObject({ message: PUBLIC_PAGE_SLUG_LOCKED_MESSAGE });

    expect(profileRepo.update).not.toHaveBeenCalled();
  });

  it('ارسال دوبارهٔ همان اسلاگ، عملیات بی‌اثر (idempotent) است', async () => {
    const { service, profileRepo } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    const status = await service.updateSlugByUserId(42, ' Aria-Salon ');
    expect(status.slug).toBe('aria-salon');
    expect(status.isSlugLocked).toBe(true);
    expect(profileRepo.update).not.toHaveBeenCalled();
  });

  it('اگر نوشتن هم‌زمان اسلاگ شکست بخورد (affected=0) خطای Conflict می‌دهد', async () => {
    const { service } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
      updateAffected: 0,
    });

    await expect(
      service.updateSlugByUserId(42, 'aria-salon'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('برای آرایشگر دارای اسلاگ، بررسی اسلاگ دیگر پیام «قفل» برمی‌گرداند', async () => {
    const { service } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    const availability = await service.checkSlugAvailability(
      42,
      'another-salon',
    );
    expect(availability.available).toBe(false);
    expect(availability.reason).toBe(PUBLIC_PAGE_SLUG_LOCKED_MESSAGE);
  });

  it('در خطای هم‌زمانی یکتایی دیتابیس (ER_DUP_ENTRY) خطای Conflict برمی‌گرداند', async () => {
    const { service } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
      duplicateDbError: true,
    });

    await expect(
      service.updateSlugByUserId(42, 'aria-salon'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('نمایش غیرفعال را مستقل از پکیج و اسلاگ حفظ می‌کند', async () => {
    const { service, profileRepo } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        isPubliclyVisible: false,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });
    const status = await service.getStatusByUserId(42);
    expect(status).toMatchObject({
      isActive: true,
      isApproved: true,
      isPubliclyVisible: false,
      slug: 'aria-salon',
      publicUrl: 'https://monshiim.ir/provider/aria-salon',
    });
    expect(profileRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ isPubliclyVisible: true }),
      }),
    );
  });

  it('صفحه و نقشهٔ سایت به فیلتر نمایش BarberService وابسته‌اند', async () => {
    const { service, barberService, profileRepo } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        isPubliclyVisible: false,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      profiles: [{ id: 'prof-1', userId: 42, slug: 'aria-salon' }],
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });
    barberService.findPublicOne.mockRejectedValue(new NotFoundException());
    barberService.getPublicDirectory.mockResolvedValue({
      barbers: [],
      cities: [],
    });
    await expect(
      service.getPublicBarberPage('aria-salon'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getActiveDirectory()).resolves.toEqual([]);
    expect(profileRepo.find).not.toHaveBeenCalled();
  });

  it('صفحهٔ عمومی را با اسلاگ باز می‌کند و بدون اسلاگ ۴۰۴ برمی‌گرداند', async () => {
    const { service: withoutSlug } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: null,
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    await expect(withoutSlug.getPublicBarberPage('42')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const { service: withSlug } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });

    const page = await withSlug.getPublicBarberPage('aria-salon');
    expect(page.slug).toBe('aria-salon');
    expect(page.publicPage.url).toBe('https://monshiim.ir/provider/aria-salon');
  });

  it('صفحهٔ عمومی بدون هیچ خدمت فعالی ۴۰۴ می‌دهد تا با منطق sitemap/دایرکتوری هم‌سو بماند', async () => {
    const { service, barberService } = createService({
      profile: {
        id: 'prof-1',
        userId: 42,
        isApproved: true,
        salonName: 'سالن آریا',
        slug: 'aria-salon',
      },
      subscription: {
        id: 'sub-1',
        subscriptionPlanId: 'plan-trial',
        subscriptionPlan: {
          planKey: 'public_page_trial',
          name: 'پروفایل اختصاصی رایگان',
          price: 0,
        },
        price: 0,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });
    // `getPublicDirectory()` (مبنای sitemap و /providers) فقط آرایشگرهای دارای
    // حداقل یک خدمت فعال را برمی‌گرداند؛ صفحهٔ عمومی هم نباید برای همان حالت
    // ۲۰۰ بدهد (صفحهٔ نازکِ خارج از sitemap).
    barberService.findPublicOne.mockResolvedValueOnce({
      id: 42,
      salonName: 'سالن آریا',
      services: [],
    });

    await expect(
      service.getPublicBarberPage('aria-salon'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('در دایرکتوری sitemap فقط آرایشگرهای فعالِ دارای اسلاگ را قرار می‌دهد', async () => {
    const { service } = createService({
      profiles: [
        {
          id: 'prof-1',
          userId: 10,
          slug: 'aria-salon',
          // lastmod باید از تاریخ تغییر *محتوا* بیاید، نه از رزرو/خرید.
          updatedAt: '2026-03-05T00:00:00.000Z',
          createdAt: '2025-01-01T00:00:00.000Z',
          bio: 'سالن تخصصی مو و میکاپ با بیست سال سابقه',
          portfolioImages: ['/uploads/portfolio/a.webp'],
        },
        { id: 'prof-2', userId: 20, slug: null },
      ],
      directorySubscriptions: [
        { userId: 10, endDate: new Date('2026-02-01T00:00:00.000Z') },
        { userId: 20, endDate: new Date('2026-02-01T00:00:00.000Z') },
      ],
    });

    const directory = await service.getActiveDirectory();
    expect(directory).toEqual([
      {
        id: 10,
        slug: 'aria-salon',
        updatedAt: '2026-03-05T00:00:00.000Z',
        quality: { bioLength: 39, portfolioCount: 1 },
      },
    ]);
  });

  it('اشتراک رایگان و خریداری‌شده هر دو از یک دایرکتوری فعال استفاده می‌کنند', async () => {
    const { service } = createService({
      profiles: [
        {
          id: 'trial-profile',
          userId: 10,
          slug: 'free-trial-salon',
          updatedAt: '2026-03-05T00:00:00.000Z',
          bio: 'پروفایل کامل آرایشگر',
          portfolioImages: ['/uploads/portfolio/trial.webp'],
        },
        {
          id: 'paid-profile',
          userId: 20,
          slug: 'paid-salon',
          updatedAt: '2026-03-06T00:00:00.000Z',
          bio: 'پروفایل کامل آرایشگر',
          portfolioImages: ['/uploads/portfolio/paid.webp'],
        },
      ],
      directorySubscriptions: [
        {
          userId: 10,
          planKey: 'public_page_trial',
          endDate: new Date('2026-12-01T00:00:00.000Z'),
        },
        {
          userId: 20,
          planKey: 'public_page_monthly',
          endDate: new Date('2026-12-01T00:00:00.000Z'),
        },
      ],
    });

    const directory = await service.getActiveDirectory();
    expect(directory.map(entry => entry.slug)).toEqual([
      'free-trial-salon',
      'paid-salon',
    ]);
  });

  it('lastmodِ پروفایلِ بدون updated_at به createdAt برمی‌گردد (نه تاریخ خرید)', async () => {
    const { service } = createService({
      profiles: [
        {
          id: 'prof-1',
          userId: 10,
          slug: 'aria-salon',
          updatedAt: null,
          createdAt: '2025-06-01T00:00:00.000Z',
        },
      ],
      directorySubscriptions: [
        { userId: 10, endDate: new Date('2026-02-01T00:00:00.000Z') },
      ],
    });

    const directory = await service.getActiveDirectory();
    expect(directory[0].updatedAt).toBe('2025-06-01T00:00:00.000Z');
  });
  describe('انتقال خریداران قبلی پکیج (مهلت انتقالی ۶ ماهه)', () => {
    it('برای هر خریدار قبلی فقط یک‌بار مهلت انتقالی اعطا می‌کند (userIdهای تکراری یکی می‌شوند)', async () => {
      const { service, userSubscriptionService } = createService({
        legacyPurchases: [{ userId: 7 }, { userId: 9 }, { userId: 7 }],
      });

      await expect(service.grantLegacyPublicPageAccess()).resolves.toEqual({
        buyers: 2,
        granted: 2,
        failed: 0,
      });

      expect(
        userSubscriptionService.grantLegacyPublicPageAccess,
      ).toHaveBeenCalledTimes(2);
      expect(
        userSubscriptionService.grantLegacyPublicPageAccess,
      ).toHaveBeenCalledWith(7);
      expect(
        userSubscriptionService.grantLegacyPublicPageAccess,
      ).toHaveBeenCalledWith(9);
    });

    it('اجرای دوباره idempotent است: کاربرانی که قبلاً اشتراک گرفته‌اند شمرده نمی‌شوند', async () => {
      const { service } = createService({
        legacyPurchases: [{ userId: 7 }, { userId: 9 }],
        legacyGrant: userId => ({ created: userId === 9 }),
      });

      await expect(service.grantLegacyPublicPageAccess()).resolves.toEqual({
        buyers: 2,
        granted: 1,
        failed: 0,
      });
    });

    it('بدون خریدار قبلی هیچ تماسی با سرویس اشتراک گرفته نمی‌شود', async () => {
      const { service, userSubscriptionService } = createService();

      await expect(service.grantLegacyPublicPageAccess()).resolves.toEqual({
        buyers: 0,
        granted: 0,
        failed: 0,
      });
      expect(
        userSubscriptionService.grantLegacyPublicPageAccess,
      ).not.toHaveBeenCalled();
    });

    it('اگر پلن مهلت انتقالی seed نشده باشد، در همان کاربر اول متوقف می‌شود و بقیه ناموفق شمرده می‌شوند', async () => {
      const { service, userSubscriptionService } = createService({
        legacyPurchases: [{ userId: 7 }, { userId: 9 }, { userId: 11 }],
        legacyGrant: () => null,
      });

      await expect(service.grantLegacyPublicPageAccess()).resolves.toEqual({
        buyers: 3,
        granted: 0,
        failed: 3,
      });
      expect(
        userSubscriptionService.grantLegacyPublicPageAccess,
      ).toHaveBeenCalledTimes(1);
    });

    it('انتقال legacy به فلگ وابسته است اما backfill ضروری trial همیشه اجرا می‌شود و خطا بوت را متوقف نمی‌کند', async () => {
      const previous = process.env.ENABLE_STARTUP_DATA_TASKS;
      try {
        process.env.ENABLE_STARTUP_DATA_TASKS = 'false';
        const {
          service,
          purchaseRepo,
          userSubscriptionService: disabledSubscriptionService,
        } = createService({
          legacyPurchases: [{ userId: 7 }],
        });
        await service.onModuleInit();
        expect(purchaseRepo.find).not.toHaveBeenCalled();
        expect(
          disabledSubscriptionService.backfillFreePublicPageTrialForExistingBarbers,
        ).toHaveBeenCalledTimes(1);

        process.env.ENABLE_STARTUP_DATA_TASKS = 'true';
        const { service: enabled, userSubscriptionService } = createService({
          legacyPurchases: [{ userId: 7 }],
        });
        await enabled.onModuleInit();
        expect(
          userSubscriptionService.grantLegacyPublicPageAccess,
        ).toHaveBeenCalledWith(7);

        const { service: failing, purchaseRepo: failingRepo } = createService();
        failingRepo.find.mockRejectedValue(new Error('db down'));
        await expect(failing.onModuleInit()).resolves.toBeUndefined();
      } finally {
        if (previous === undefined) {
          delete process.env.ENABLE_STARTUP_DATA_TASKS;
        } else {
          process.env.ENABLE_STARTUP_DATA_TASKS = previous;
        }
      }
    });
  });
});
