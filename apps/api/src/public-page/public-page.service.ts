import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { BarberService } from 'src/barber/barber.service';
import { BarberProfile } from 'src/barber/entities/barber.entity';
import {
  ACTIVE_BOOKING_STATUSES,
  Booking,
} from 'src/booking/entities/booking.entity';
import { isRuntimeFlagEnabled } from 'src/common/config/runtime-flags';
import { isDuplicateEntryError } from 'src/common/utils/db-error.util';
import {
  DEFAULT_FRONT_ORIGIN,
  resolvePublicOrigin,
} from 'src/common/utils/public-url.util';
import {
  Payment,
  PaymentPurpose,
  PaymentStatus,
} from 'src/payment/entities/payment.entity';
import {
  NOT_REFUNDED_PARAMS,
  notRefundedCondition,
} from 'src/payment/payment-ledger';
import { Referral } from 'src/referral/entities/referral.entity';
import { UserSubscription } from 'src/subscription/entities/user-subscription.entity';
import { UserSubscriptionService } from 'src/subscription/user-subscription.service';
import { Brackets, In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';

import {
  PUBLIC_PAGE_PACKAGE_PRICE_TOMANS,
  PUBLIC_PAGE_REQUIRED_PAID_BOOKINGS,
  PublicPageActivationReason,
  REFERRAL_PUBLIC_PAGE_DISCOUNT_PERCENT,
} from './constants';
import { CreatePublicPageDiscountDto } from './dto/create-public-page-discount.dto';
import { UpdatePublicPageDiscountDto } from './dto/update-public-page-discount.dto';
import { BarberPublicPagePurchase } from './entities/barber-public-page-purchase.entity';
import { PublicPageDiscount } from './entities/public-page-discount.entity';
import { validatePublicPageSlug } from './slug.util';

export interface PublicPageStatus {
  isActive: boolean;
  reason: PublicPageActivationReason | null;
  /** تعداد رزروهای موفقی که در درگاه پرداخت شده و لغو/برگشت نشده‌اند */
  paidBookingsCount: number;
  /** حد نصاب رزروهای موفق برای فعال‌سازی رایگان */
  requiredPaidBookings: number;
  /** قیمت پکیج به تومان */
  packagePriceTomans: number;
  /** زمان خرید پکیج (در صورت خرید) */
  purchasedAt: string | null;
  /** اسلاگ یکتای انتخاب‌شده توسط آرایشگر */
  slug: string | null;
  /**
   * آیا اسلاگ قفل شده است؟ (اسلاگ فقط **یک بار** قابل ثبت است و پس از ثبت
   * به‌دلیل حفظ آدرس و رتبهٔ سئو قابل تغییر نیست)
   */
  isSlugLocked: boolean;
  /** آدرس صفحهٔ عمومی آرایشگر در سایت؛ فقط پس از فعال‌سازی و ثبت اسلاگ مقدار دارد */
  publicUrl: string | null;
  /**
   * آیا پروفایل آرایشگر تایید شده است؟ صفحهٔ عمومی حتی با خرید پکیج هم تا
   * زمانی که پروفایل تایید نشده باشد در دسترس عموم نیست (۴۰۴ می‌دهد).
   */
  isApproved: boolean;
  /** وضعیت نمایش عمومی مستقل از خرید صفحه و تأیید پروفایل است. */
  isPubliclyVisible: boolean;
  /** آیا خرید صفحه برای این آرایشگر مشمول تخفیف ویژهٔ ثبت‌نام با کد معرف است؟ */
  hasReferralDiscount: boolean;
  /**
   * اشتراک فعال «پروفایل اختصاصی» (دورهٔ رایگان یا پلن تمدید پولی).
   * `null` یعنی صفحه فقط با خرید یک‌باره یا حد نصاب رزرو فعال است.
   */
  subscription: {
    id: string;
    planId: string;
    planKey: string | null;
    planName: string;
    /** آیا این اشتراک، دورهٔ رایگان پس از ثبت‌نام است؟ */
    isFreeTrial: boolean;
    price: number;
    startDate: string;
    endDate: string;
    status: string;
  } | null;
}

export interface SlugAvailabilityResult {
  slug: string;
  valid: boolean;
  available: boolean;
  isCurrentUser: boolean;
  reason: string;
}

interface ActivationState {
  isActive: boolean;
  reason: PublicPageActivationReason | null;
  purchase: BarberPublicPagePurchase | null;
  paidBookingsCount: number;
  subscription: UserSubscription | null;
}

interface DirectoryRow {
  barberProfileId: string;
  updatedAt: Date | string | null;
}

/**
 * پیام خطای مشترکِ «اسلاگ فقط یک بار» — هم در API و هم در متن خطای فرانت
 * استفاده می‌شود تا پیام یکسان بماند.
 */
export const PUBLIC_PAGE_SLUG_LOCKED_MESSAGE =
  'آدرس اختصاصی (اسلاگ) صفحهٔ شما قبلاً ثبت شده و قابل تغییر نیست؛ اسلاگ فقط یک بار قابل انتخاب است و تغییر آن به رتبهٔ سئوی صفحه آسیب می‌زند. در صورت نیاز به اصلاح، با پشتیبانی تماس بگیرید.';

type PublicPageProfileRow = Pick<
  BarberProfile,
  'id' | 'userId' | 'isApproved' | 'isPubliclyVisible' | 'salonName' | 'slug'
>;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

@Injectable()
export class PublicPageService {
  private readonly logger = new Logger(PublicPageService.name);

  constructor(
    @InjectRepository(BarberPublicPagePurchase)
    private readonly purchaseRepo: Repository<BarberPublicPagePurchase>,

    @InjectRepository(PublicPageDiscount)
    private readonly discountRepo: Repository<PublicPageDiscount>,

    @InjectRepository(BarberProfile)
    private readonly profileRepo: Repository<BarberProfile>,

    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,

    @InjectRepository(Referral)
    private readonly referralRepo: Repository<Referral>,

    private readonly barberService: BarberService,
    private readonly configService: ConfigService,
    private readonly userSubscriptionService: UserSubscriptionService,
  ) {}

  private publicUrl(slug: string) {
    // فقط origin استفاده می‌شود تا مقدار اضافه‌ای مثل `/panel` در FRONTEND_URL
    // باعث تولید لینک اشتباه نشود.
    const frontUrl = resolvePublicOrigin({
      configured: this.configService.get<string>('FRONT_URL'),
      fallback: DEFAULT_FRONT_ORIGIN,
      isProduction: process.env.NODE_ENV === 'production',
    }).origin;

    // آدرس **کانونیکال** صفحهٔ عمومی آرایشگر: `/provider/[slug]`.
    //
    // پیش‌تر اینجا `/barber/{slug}` ساخته می‌شد؛ مسیرِ بازنشسته‌ای که
    // `proxy.ts` در فرانت با ۳۰۱ به `/provider` می‌فرستد. یعنی همان لینکی که
    // آرایشگر از داشبورد کپی می‌کرد (و طبق آموزش سایت در بایوی اینستاگرام
    // می‌گذاشت) یک ریدایرکت بود، نه آدرس کانونیکال. اکنون رشتهٔ تولیدشده
    // با canonical و sitemap یکی است.
    return `${frontUrl}/provider/${encodeURIComponent(slug)}`;
  }

  /** پروفایل آرایشگر را بر اساس شناسهٔ کاربری پیدا می‌کند. */
  private async findProfileByUserId(
    userId: number,
  ): Promise<PublicPageProfileRow | null> {
    return this.profileRepo.findOne({
      where: { userId },
      select: {
        id: true,
        userId: true,
        isApproved: true,
        isPubliclyVisible: true,
        salonName: true,
        slug: true,
      },
    });
  }

  /** پروفایل آرایشگر را بر اساس اسلاگ پیدا می‌کند. */
  private async findProfileBySlug(
    slug: string,
  ): Promise<PublicPageProfileRow | null> {
    return this.profileRepo.findOne({
      where: { slug },
      select: {
        id: true,
        userId: true,
        isApproved: true,
        isPubliclyVisible: true,
        salonName: true,
        slug: true,
      },
    });
  }

  /** آیا پکیج برای این پروفایل خریده شده است؟ */
  private async findPurchase(barberProfileId: string) {
    return this.purchaseRepo.findOne({
      where: { barberProfileId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * شرط واحد «رزرو موفقِ پرداخت‌شده در درگاه» (هم‌راستا با امور مالی):
   *  ۱. وضعیت نوبت لغو یا رد نشده باشد (`ACTIVE_BOOKING_STATUSES`)؛
   *  ۲. پرداخت آنلاین یا بیعانه روی نوبت ثبت شده باشد؛
   *  ۳. یک رکورد `Payment` موفق (`PAID`) و برگشت‌نخورده برای این نوبت در درگاه
   *     ثبت شده باشد (`notRefundedCondition`).
   */
  private applySuccessfulGatewayPaidBookingsFilter(
    qb: SelectQueryBuilder<Booking>,
  ): SelectQueryBuilder<Booking> {
    const paidGatewaySubQuery = qb
      .subQuery()
      .select('1')
      .from(Payment, 'gatewayPayment')
      .where('gatewayPayment.purpose = :bookingPaymentPurpose')
      .andWhere('gatewayPayment.status = :paidPaymentStatus')
      .andWhere(
        "(gatewayPayment.purposeId = booking.id OR gatewayPayment.metadata LIKE CONCAT('%', booking.id, '%'))",
      )
      .andWhere(
        notRefundedCondition('gatewayPayment.id', 'gatewayPayment.metadata'),
      )
      .getQuery();

    return qb
      .andWhere('booking.status IN (:...activeBookingStatuses)', {
        activeBookingStatuses: ACTIVE_BOOKING_STATUSES,
      })
      .andWhere(
        new Brackets(paidQb => {
          paidQb
            .where('booking.depositPaidAt IS NOT NULL')
            .orWhere('booking.onlinePaidAt IS NOT NULL');
        }),
      )
      .andWhere(`EXISTS ${paidGatewaySubQuery}`, {
        bookingPaymentPurpose: PaymentPurpose.BOOKING,
        paidPaymentStatus: PaymentStatus.PAID,
        ...NOT_REFUNDED_PARAMS,
      });
  }

  /** تعداد رزروهای موفقِ پرداخت‌شده در درگاه برای یک آرایشگر (تجمعی). */
  /** تعداد رزروهای موفقِ پرداخت‌شده برای مصرف در منطق پاداش معرف نیز استفاده می‌شود. */
  async countSuccessfulPaidBookings(barberProfileId: string) {
    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .where('booking.barberId = :barberProfileId', { barberProfileId });

    return this.applySuccessfulGatewayPaidBookingsFilter(qb).getCount();
  }

  private countPaidBookings(barberProfileId: string) {
    return this.countSuccessfulPaidBookings(barberProfileId);
  }

  /** صفحه باید واقعاً خریداری شده باشد؛ فعال‌شدن رایگان با رزرو جای خرید را نمی‌گیرد. */
  async hasPurchasedPackageByUserId(userId: number): Promise<boolean> {
    const profile = await this.profileRepo.findOne({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return false;

    return Boolean(
      await this.purchaseRepo.findOne({
        where: { barberProfileId: profile.id },
        select: { id: true },
      }),
    );
  }

  /**
   * تخفیف ۵۰٪ی خرید صفحهٔ اختصاصی برای کاربران دعوت‌شده.
   *
   * این تخفیف به‌صورت موقت غیرفعال است و فقط با feature flag
   * `ENABLE_REFERRAL_PUBLIC_PAGE_DISCOUNT` می‌تواند روشن شود. حتی در حالت
   * روشن هم فقط حساب‌هایی که واقعاً با کد معرف ثبت شده‌اند مشمول تخفیف
   * هستند.
   */
  async hasReferralDiscount(userId: number): Promise<boolean> {
    if (!isRuntimeFlagEnabled('ENABLE_REFERRAL_PUBLIC_PAGE_DISCOUNT', false)) {
      return false;
    }

    return (
      (await this.referralRepo.count({ where: { referredUserId: userId } })) > 0
    );
  }

  async getReferralDiscountQuote(userId: number) {
    if (!(await this.hasReferralDiscount(userId))) return null;

    const discountAmount = Math.round(
      (PUBLIC_PAGE_PACKAGE_PRICE_TOMANS *
        REFERRAL_PUBLIC_PAGE_DISCOUNT_PERCENT) /
        100,
    );
    return {
      code: null,
      percentOff: REFERRAL_PUBLIC_PAGE_DISCOUNT_PERCENT,
      originalAmount: PUBLIC_PAGE_PACKAGE_PRICE_TOMANS,
      discountAmount,
      amount: PUBLIC_PAGE_PACKAGE_PRICE_TOMANS - discountAmount,
    };
  }

  /**
   * شرط فعال‌بودن: خرید پکیج **یا** رسیدن به حد نصاب رزروهای موفقِ پرداخت‌شده.
   * همیشه هر دو را می‌خوانیم چون پنل آرایشگر باید تعداد رزروهای موفق را
   * (حتی پس از خرید پکیج) نمایش بدهد.
   */
  private async computeState(
    barberProfileId: string,
    userId?: number,
  ): Promise<ActivationState> {
    const purchase = await this.findPurchase(barberProfileId);
    const paidBookingsCount = await this.countPaidBookings(barberProfileId);
    const reachedThreshold =
      paidBookingsCount >= PUBLIC_PAGE_REQUIRED_PAID_BOOKINGS;

    /**
     * اشتراک فعال «پروفایل اختصاصی» (دورهٔ رایگان پس از ثبت‌نام یا پلن
     * تمدید پولی). فقط وقتی صفحه از قبل با خرید یک‌باره/حد نصاب رزرو
     * فعال نیست، دلیل فعالیت `SUBSCRIPTION` می‌شود تا پنل بتواند وضعیت
     * اشتراک و تاریخ انقضا را نشان دهد.
     */
    const subscription =
      !purchase && !reachedThreshold && userId
        ? await this.userSubscriptionService.getCurrentPublicPageSubscription(
            userId,
          )
        : null;

    return {
      isActive: Boolean(purchase) || reachedThreshold || Boolean(subscription),
      reason: purchase
        ? 'PACKAGE'
        : reachedThreshold
          ? 'PAID_BOOKINGS'
          : subscription
            ? 'SUBSCRIPTION'
            : null,
      purchase,
      paidBookingsCount,
      subscription,
    };
  }

  /** وضعیت صفحهٔ عمومی برای آرایشگرِ جاری (از روی شناسهٔ کاربری). */
  async getStatusByUserId(userId: number): Promise<PublicPageStatus> {
    const profile = await this.findProfileByUserId(userId);
    return this.buildStatus(profile);
  }

  /** پلن‌های قابل انتخاب برای خرید/تمدید پروفایل اختصاصی. */
  getPublicPagePlans() {
    return this.userSubscriptionService.getPublicPagePlans();
  }

  private async buildStatus(
    profile: PublicPageProfileRow | null,
    precomputedState?: ActivationState,
  ): Promise<PublicPageStatus> {
    const base: PublicPageStatus = {
      isActive: false,
      reason: null,
      paidBookingsCount: 0,
      requiredPaidBookings: PUBLIC_PAGE_REQUIRED_PAID_BOOKINGS,
      packagePriceTomans: PUBLIC_PAGE_PACKAGE_PRICE_TOMANS,
      purchasedAt: null,
      slug: null,
      isSlugLocked: false,
      publicUrl: null,
      isApproved: false,
      isPubliclyVisible: true,
      hasReferralDiscount: false,
      subscription: null,
    };

    if (!profile) return base;

    const [state, hasReferralDiscount] = await Promise.all([
      precomputedState ?? this.computeState(profile.id, profile.userId),
      this.hasReferralDiscount(profile.userId),
    ]);
    const slug = profile.slug?.trim() || null;
    const subscription = state.subscription;

    return {
      ...base,
      isActive: state.isActive,
      reason: state.reason,
      paidBookingsCount: state.paidBookingsCount,
      purchasedAt: state.purchase?.createdAt
        ? state.purchase.createdAt.toISOString()
        : null,
      slug,
      isSlugLocked: Boolean(slug),
      publicUrl: state.isActive && slug ? this.publicUrl(slug) : null,
      isApproved: Boolean(profile.isApproved),
      isPubliclyVisible: profile.isPubliclyVisible !== false,
      hasReferralDiscount,
      subscription: subscription
        ? {
            id: subscription.id,
            planId: subscription.subscriptionPlanId,
            planKey: subscription.subscriptionPlan?.planKey ?? null,
            planName: subscription.subscriptionPlan?.name ?? '',
            isFreeTrial:
              subscription.subscriptionPlan?.price === 0 &&
              subscription.price === 0,
            price: Number(subscription.price),
            startDate: subscription.startDate.toISOString(),
            endDate: subscription.endDate.toISOString(),
            status: subscription.status,
          }
        : null,
    };
  }

  /** بررسی آزاد و معتبر بودن اسلاگ پیشنهادی برای آرایشگر جاری. */
  async checkSlugAvailability(
    userId: number,
    rawSlug: string,
  ): Promise<SlugAvailabilityResult> {
    const validation = validatePublicPageSlug(rawSlug);
    if (!validation.valid) {
      return {
        slug: validation.slug,
        valid: false,
        available: false,
        isCurrentUser: false,
        reason: validation.reason,
      };
    }

    const [myProfile, existing] = await Promise.all([
      this.findProfileByUserId(userId),
      this.profileRepo.findOne({
        where: { slug: validation.slug },
        select: { id: true, userId: true },
      }),
    ]);

    // آرایشگری که اسلاگش را ثبت کرده دیگر نمی‌تواند اسلاگ دیگری بردارد.
    const myCurrentSlug = myProfile?.slug?.trim() || null;
    if (myCurrentSlug && myCurrentSlug !== validation.slug) {
      return {
        slug: validation.slug,
        valid: true,
        available: false,
        isCurrentUser: false,
        reason: PUBLIC_PAGE_SLUG_LOCKED_MESSAGE,
      };
    }

    if (existing) {
      if (myProfile && existing.id === myProfile.id) {
        return {
          slug: validation.slug,
          valid: true,
          available: true,
          isCurrentUser: true,
          reason: 'این اسلاگ هم‌اکنون برای سالن شما ثبت شده است',
        };
      }

      return {
        slug: validation.slug,
        valid: true,
        available: false,
        isCurrentUser: false,
        reason: 'این اسلاگ قبلاً توسط سالن دیگری انتخاب شده است',
      };
    }

    return {
      slug: validation.slug,
      valid: true,
      available: true,
      isCurrentUser: false,
      reason: 'این اسلاگ آزاد و قابل ثبت است',
    };
  }

  /**
   * ثبت **یک‌بارهٔ** اسلاگ یکتا پس از فعال‌سازی صفحهٔ اختصاصی آرایشگر.
   *
   * چرا یک‌باره؟ آدرس عمومی `/provider/[slug]` مبنای ایندکس گوگل و لینک‌های
   * خارجی است؛ تغییر آن باعث از دست رفتن رتبهٔ سئو و ۴۰۴ شدن لینک‌های قبلی
   * می‌شود. بنابراین بعد از ثبت، تغییر اسلاگ از مسیر پنل ممکن نیست.
   * ثبت دوبارهٔ همان اسلاگ، عملیات بی‌اثر (idempotent) است.
   */
  async updateSlugByUserId(
    userId: number,
    rawSlug: string,
  ): Promise<PublicPageStatus> {
    const profile = await this.findProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundException('پروفایل آرایشگر یافت نشد');
    }

    const state = await this.computeState(profile.id, profile.userId);
    if (!state.isActive) {
      throw new BadRequestException(
        'صفحهٔ اختصاصی شما هنوز فعال نشده است؛ پس از فعال‌سازی می‌توانید اسلاگ ثبت کنید',
      );
    }

    const validation = validatePublicPageSlug(rawSlug);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason);
    }

    const currentSlug = profile.slug?.trim() || null;

    // اسلاگ قبلاً ثبت شده است: فقط همان مقدار پذیرفته می‌شود (no-op) و هر
    // مقدار دیگری با خطای صریح رد می‌شود.
    if (currentSlug) {
      if (currentSlug === validation.slug) {
        return this.buildStatus(profile, state);
      }

      this.logger.warn(
        `Rejected public page slug change for barber user ${userId} ("${currentSlug}" -> "${validation.slug}")`,
      );
      throw new ConflictException(PUBLIC_PAGE_SLUG_LOCKED_MESSAGE);
    }

    const existing = await this.profileRepo.findOne({
      where: { slug: validation.slug },
      select: { id: true },
    });
    if (existing && existing.id !== profile.id) {
      throw new ConflictException(
        'این اسلاگ تکراری است و قبلاً توسط آرایشگر دیگری انتخاب شده است',
      );
    }

    try {
      // شرط `slug IS NULL` تضمین می‌کند حتی در درخواست‌های هم‌زمان هم اسلاگ
      // فقط یک بار نوشته شود (نوشتن دوم هیچ ردیفی را تغییر نمی‌دهد).
      const result = await this.profileRepo.update(
        { id: profile.id, slug: IsNull() },
        { slug: validation.slug },
      );

      if (result?.affected === 0) {
        throw new ConflictException(PUBLIC_PAGE_SLUG_LOCKED_MESSAGE);
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          'این اسلاگ تکراری است و قبلاً توسط آرایشگر دیگری انتخاب شده است',
        );
      }
      throw error;
    }

    profile.slug = validation.slug;
    this.logger.log(
      `Public page slug set to "${validation.slug}" (one-time) for barber user ${userId}`,
    );

    return this.buildStatus(profile, state);
  }

  private async resolveActivePublicPage(profile: PublicPageProfileRow) {
    const slug = profile.slug?.trim();
    if (!slug) {
      throw new NotFoundException('صفحهٔ اختصاصی این آرایشگاه فعال نیست');
    }

    // `findPublicOne` خودش شرط‌های تأیید/فعال‌بودن/خدمت را اعمال می‌کند و در
    // صورت عدم احراز، ۴۰۴ پرتاب می‌کند.
    const barber = await this.barberService.findPublicOne(profile.userId);

    // خرید پکیج اول بررسی می‌شود: در این صورت نیازی به شمارش نوبت‌ها نیست.
    const purchase = await this.findPurchase(profile.id);
    let reason: PublicPageActivationReason = purchase
      ? 'PACKAGE'
      : 'PAID_BOOKINGS';

    if (!purchase) {
      const paidBookingsCount = await this.countPaidBookings(profile.id);
      if (paidBookingsCount < PUBLIC_PAGE_REQUIRED_PAID_BOOKINGS) {
        // نه خرید یک‌باره و نه حد نصاب رزرو: اشتراک فعال پروفایل اختصاصی
        // (دورهٔ رایگان یا پلن تمدید پولی) آخرین مسیر است.
        const subscription =
          await this.userSubscriptionService.getCurrentPublicPageSubscription(
            profile.userId,
          );

        if (!subscription) {
          throw new NotFoundException('صفحهٔ اختصاصی این آرایشگاه فعال نیست');
        }

        reason = 'SUBSCRIPTION';
      }
    }

    return {
      ...barber,
      slug,
      publicPage: {
        isActive: true,
        reason,
        slug,
        url: this.publicUrl(slug),
      },
    };
  }

  /**
   * پروفایل عمومی آرایشگر بر اساس اسلاگ (یا شناسهٔ عددی برای ریدایرکت به اسلاگ)؛
   * فقط در صورتی که هم واجد شرایطِ نمایش عمومی باشد، هم صفحهٔ عمومی‌اش فعال
   * شده باشد و هم آرایشگر اسلاگ ثبت کرده باشد. در غیر این صورت ۴۰۴ می‌دهد.
   */
  async getPublicBarberPage(identifier: string) {
    const trimmed = String(identifier ?? '').trim();
    if (!trimmed) {
      throw new NotFoundException('آرایشگاه یافت نشد');
    }

    if (/^\d+$/.test(trimmed)) {
      const numericId = Number(trimmed);
      if (!Number.isSafeInteger(numericId) || numericId < 1) {
        throw new NotFoundException('آرایشگاه یافت نشد');
      }
      const profile = await this.findProfileByUserId(numericId);
      if (!profile) {
        throw new NotFoundException('آرایشگاه یافت نشد');
      }
      return this.resolveActivePublicPage(profile);
    }

    const validation = validatePublicPageSlug(trimmed);
    if (!validation.valid) {
      throw new NotFoundException('آرایشگاه یافت نشد');
    }

    const profile = await this.findProfileBySlug(validation.slug);
    if (!profile) {
      throw new NotFoundException('آرایشگاه یافت نشد');
    }

    return this.resolveActivePublicPage(profile);
  }

  /**
   * فهرست اسلاگِ آرایشگرهایی که صفحهٔ عمومی‌شان فعال است و اسلاگ ثبت کرده‌اند
   * (مبنای sitemap و صفحهٔ `/providers`). خروجی با فهرستِ آرایشگرهای واجد
   * شرایطِ نمایش عمومی تلاقی می‌خورد تا صفحه‌ای که قرار است ۴۰۴ بدهد وارد
   * sitemap نشود.
   *
   * `updatedAt` = تاریخ آخرین تغییر محتوای پروفایل (`barber_profile.updated_at`،
   * با fallback به `created_at`). پیش‌تر این مقدار از
   * `MAX(purchase.createdAt)`/`MAX(booking.updatedAt)` می‌آمد که فعالیت رزرو
   * بود، نه تغییر محتوا.
   */
  async getActiveDirectory(): Promise<
    {
      id: number;
      slug: string;
      updatedAt: string | null;
      /**
       * سیگنال‌های «کامل‌بودنِ محتوا» برای سیاستِ کیفیتِ ایندکس در فرانت
       * (`apps/web/lib/profile-quality.ts`). فقط طولِ بیو و تعداد
       * نمونه‌کارها لازم است؛ «حداقل یک خدمت فعال» از قبل در
       * `getPublicDirectory()` تضمین شده است.
       */
      quality: { bioLength: number; portfolioCount: number };
    }[]
  > {
    const { barbers } = await this.barberService.getPublicDirectory();
    const eligibleUserIds = [
      ...new Set(barbers.map(item => Number(item.id)).filter(Number.isInteger)),
    ];
    if (eligibleUserIds.length === 0) return [];

    const profiles = await this.profileRepo.find({
      where: { userId: In(eligibleUserIds) },
      select: {
        id: true,
        userId: true,
        slug: true,
        bio: true,
        portfolioImages: true,
        // مبنای `lastmod`: آخرین تغییر محتوای پروفایل. `createdAt` فقط
        // fallbackِ ردیف‌های قدیمی است (پیش از اجرای
        // sql/barber-profile-updated-at.sql).
        updatedAt: true,
        createdAt: true,
      },
    });
    if (profiles.length === 0) return [];

    const profileMetaById = new Map<
      string,
      {
        userId: number;
        slug: string;
        contentUpdatedAt: Date | null;
        quality: { bioLength: number; portfolioCount: number };
      }
    >();
    for (const profile of profiles) {
      const slug = profile.slug?.trim();
      if (!slug) continue;
      profileMetaById.set(profile.id, {
        userId: profile.userId,
        slug,
        contentUpdatedAt: profile.updatedAt ?? profile.createdAt ?? null,
        quality: {
          bioLength: (profile.bio ?? '').trim().length,
          portfolioCount: Array.isArray(profile.portfolioImages)
            ? profile.portfolioImages.filter(Boolean).length
            : 0,
        },
      });
    }
    const profileIds = [...profileMetaById.keys()];
    if (profileIds.length === 0) return [];

    const purchases = await this.purchaseRepo
      .createQueryBuilder('purchase')
      .select('purchase.barberProfileId', 'barberProfileId')
      .addSelect('MAX(purchase.createdAt)', 'updatedAt')
      .where('purchase.barberProfileId IN (:...profileIds)', { profileIds })
      .groupBy('purchase.barberProfileId')
      .getRawMany<DirectoryRow>();

    const qualifiedQb = this.bookingRepo
      .createQueryBuilder('booking')
      .select('booking.barberId', 'barberProfileId')
      .addSelect('MAX(booking.updatedAt)', 'updatedAt')
      .where('booking.barberId IN (:...profileIds)', { profileIds });

    const qualified = await this.applySuccessfulGatewayPaidBookingsFilter(
      qualifiedQb,
    )
      .groupBy('booking.barberId')
      .having('COUNT(booking.id) >= :required', {
        required: PUBLIC_PAGE_REQUIRED_PAID_BOOKINGS,
      })
      .getRawMany<DirectoryRow>();

    // اشتراک فعال پروفایل اختصاصی (دورهٔ رایگان یا پلن تمدید پولی) هم
    // شرط نمایش است. `userId` را به `barberProfileId` نگاشت می‌کنیم تا
    // همان `updatedAtByProfileId` مشترک باقی بماند.
    const profileIdByUserId = new Map<number, string>();
    for (const profile of profiles) {
      profileIdByUserId.set(profile.userId, profile.id);
    }

    const subscriptions =
      await this.userSubscriptionService.findActivePublicPageSubscriptionsForUsers(
        eligibleUserIds,
      );
    const subscriptionRows: DirectoryRow[] = subscriptions.flatMap(
      subscription => {
        const barberProfileId = profileIdByUserId.get(subscription.userId);

        return barberProfileId
          ? [
              {
                barberProfileId,
                updatedAt: subscription.endDate,
              },
            ]
          : [];
      },
    );

    const updatedAtByProfileId = new Map<string, Date | null>();
    const register = (rows: DirectoryRow[]) => {
      for (const row of rows) {
        if (!row?.barberProfileId) continue;
        if (!profileMetaById.has(row.barberProfileId)) continue;
        const date = toDate(row.updatedAt);
        const current = updatedAtByProfileId.get(row.barberProfileId) ?? null;
        if (date && (!current || date > current)) {
          updatedAtByProfileId.set(row.barberProfileId, date);
        } else if (!updatedAtByProfileId.has(row.barberProfileId)) {
          updatedAtByProfileId.set(row.barberProfileId, null);
        }
      }
    };
    register(purchases);
    register(qualified);
    register(subscriptionRows);

    // توجه: `updatedAtByProfileId` فقط برای تعیین **واجد شرایط بودن** (خرید
    // پکیج یا ۳۰۰ رزرو پرداخت‌شده) استفاده می‌شود، نه برای `lastmod`.
    // `lastmod` را از `contentUpdatedAt` می‌گیریم تا رزروهای جدید باعث
    // «تازه‌شدن» بی‌دلیل صفحه در sitemap نشوند.
    return [...updatedAtByProfileId.entries()]
      .map(([barberProfileId]) => {
        const meta = profileMetaById.get(barberProfileId)!;
        // ممکن است mock/درایور رشته برگرداند؛ `toDate` هر دو حالت را پوشش می‌دهد.
        const lastModified = toDate(meta.contentUpdatedAt);
        return {
          id: meta.userId,
          slug: meta.slug,
          updatedAt: lastModified ? lastModified.toISOString() : null,
          quality: meta.quality,
        };
      })
      .filter(
        entry =>
          Number.isInteger(entry.id) && entry.id > 0 && Boolean(entry.slug),
      )
      .sort((a, b) => a.id - b.id);
  }

  /**
   * یک صفحه از فهرست عمومی آرایشگاه‌ها برای صفحهٔ `/providers`.
   *
   * منبعِ «چه کسی واجد شرایط است» عمداً همان `getActiveDirectory()` است که
   * sitemap هم از آن می‌خورد. اگر این دو از هم جدا می‌شدند، ممکن بود فهرست
   * به پروفایلی لینک بدهد که ۴۰۴ می‌دهد (و sitemap هم آن را اعلام کند) —
   * یعنی دقیقاً همان ناسازگاری‌ای که باید از آن پرهیز کنیم.
   *
   * ترتیب پایدار است (شناسهٔ کاربر صعودی) تا شمارهٔ صفحه‌ها بین درخواست‌ها
   * جابه‌جا نشود؛ صفحه‌بندیِ ناپایدار باعث می‌شود یک پروفایل در دو صفحه تکرار
   * یا از هر دو حذف شود.
   */
  async getDirectoryPage(
    page = 1,
    perPage = 12,
  ): Promise<{
    data: Awaited<ReturnType<BarberService['findPublicCards']>>;
    pagination: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
    };
  }> {
    const safePerPage = Math.min(Math.max(Math.trunc(perPage) || 12, 1), 48);
    const entries = await this.getActiveDirectory();
    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / safePerPage));
    const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages);

    const slice = entries.slice(
      (safePage - 1) * safePerPage,
      safePage * safePerPage,
    );
    if (slice.length === 0) {
      return {
        data: [],
        pagination: { page: safePage, perPage: safePerPage, total, totalPages },
      };
    }

    const cards = await this.barberService.findPublicCards(
      slice.map(entry => entry.id),
    );
    const cardsById = new Map(cards.map(card => [card.id, card]));

    // ترتیب را از `entries` نگه می‌داریم، نه از خروجی کوئری.
    const data = slice
      .map(entry => {
        const card = cardsById.get(entry.id);
        return card ? { ...card, slug: entry.slug } : null;
      })
      .filter((card): card is NonNullable<typeof card> => card !== null);

    return {
      data,
      pagination: { page: safePage, perPage: safePerPage, total, totalPages },
    };
  }

  private normalizeDiscountCode(code: string) {
    return code.trim().toUpperCase();
  }

  async listDiscountCodes() {
    return this.discountRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * بررسی تکراری نبودن کد تخفیف **پیش از** نوشتن در پایگاه داده.
   *
   * این بررسی باعث می‌شود پاسخِ «کد تکراری» همیشه یک ۴۰۹ با پیام فارسی باشد،
   * حتی اگر ایندکس یکتای `code` در پایگاه داده وجود نداشته باشد (جدولی که دستی
   * و بدون آن فایل SQL ساخته شده باشد). قفل یکتایی دیتابیس هم سر جایش می‌ماند
   * تا شرط رقابتی (race) پوشش داده شود.
   */
  private async assertDiscountCodeIsFree(
    code: string,
    ignoreId?: string,
  ): Promise<void> {
    const existing = await this.discountRepo.findOne({
      where: { code },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('این کد تخفیف از قبل ثبت شده است');
    }
  }

  async createDiscountCode(dto: CreatePublicPageDiscountDto) {
    const code = this.normalizeDiscountCode(dto.code);
    await this.assertDiscountCodeIsFree(code);

    const discount = this.discountRepo.create({
      code,
      percentOff: dto.percentOff,
      isActive: true,
    });
    try {
      return await this.discountRepo.save(discount);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('این کد تخفیف از قبل ثبت شده است');
      }
      throw error;
    }
  }

  async updateDiscountCode(id: string, dto: UpdatePublicPageDiscountDto) {
    const discount = await this.discountRepo.findOne({ where: { id } });
    if (!discount) throw new NotFoundException('کد تخفیف یافت نشد');
    if (dto.code !== undefined) {
      const code = this.normalizeDiscountCode(dto.code);
      if (code !== discount.code) {
        await this.assertDiscountCodeIsFree(code, discount.id);
      }
      discount.code = code;
    }
    if (dto.percentOff !== undefined) discount.percentOff = dto.percentOff;
    if (dto.isActive !== undefined) discount.isActive = dto.isActive;
    try {
      return await this.discountRepo.save(discount);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('این کد تخفیف از قبل ثبت شده است');
      }
      throw error;
    }
  }

  async deleteDiscountCode(id: string) {
    const result = await this.discountRepo.delete(id);
    if (!result.affected) throw new NotFoundException('کد تخفیف یافت نشد');
    return { id };
  }

  async getDiscountQuote(rawCode: string) {
    const code = this.normalizeDiscountCode(rawCode);
    const discount = await this.discountRepo.findOne({
      where: { code, isActive: true },
    });
    if (!discount)
      throw new BadRequestException('کد تخفیف نامعتبر یا غیرفعال است');

    const discountAmount = Math.round(
      (PUBLIC_PAGE_PACKAGE_PRICE_TOMANS * discount.percentOff) / 100,
    );
    return {
      code: discount.code,
      percentOff: discount.percentOff,
      originalAmount: PUBLIC_PAGE_PACKAGE_PRICE_TOMANS,
      discountAmount,
      amount: PUBLIC_PAGE_PACKAGE_PRICE_TOMANS - discountAmount,
    };
  }

  /**
   * فعال‌سازی صفحهٔ عمومی پس از پرداخت موفق پکیج.
   * نسبت به کال‌بک‌های تکراریِ درگاه باید idempotent باشد.
   */
  async activateAfterPayment(payment: Payment) {
    const existing = payment.id
      ? await this.purchaseRepo.findOne({
          where: { paymentId: payment.id },
        })
      : null;
    if (existing) return existing;

    const profile = await this.findProfileByUserId(payment.userId);
    if (!profile) {
      throw new NotFoundException('پروفایل آرایشگر برای خرید صفحه یافت نشد');
    }

    const purchase = this.purchaseRepo.create({
      userId: payment.userId,
      barberProfileId: profile.id,
      amount: Number(payment.amount ?? PUBLIC_PAGE_PACKAGE_PRICE_TOMANS),
      paymentId: payment.id ?? null,
    });

    const saved = await this.purchaseRepo.save(purchase);
    this.logger.log(
      `Public page activated for barber user ${payment.userId} (payment ${payment.orderId})`,
    );
    return saved;
  }
}
