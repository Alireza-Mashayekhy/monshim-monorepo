import type { Barber } from '@/services/features/barber/types';

/**
 * دلیل فعال‌بودن صفحهٔ عمومی:
 *   • `SUBSCRIPTION` — اشتراک فعال «پروفایل اختصاصی» (دورهٔ رایگان، مهلت
 *                      انتقالی خریداران قبلی یا پلن تمدید پولی).
 *
 * مسیرهای دائمی قبلی (`PACKAGE` و `PAID_BOOKINGS`) حذف شده‌اند و دیگر از
 * بک‌اند تولید نمی‌شوند.
 */
export type PublicPageActivationReason = 'SUBSCRIPTION';

/** پلن اشتراک «پروفایل اختصاصی» قابل خرید/تمدید */
export interface PublicPageSubscriptionPlan {
  id: string;
  planKey: string | null;
  name: string;
  smsCount: number;
  price: number;
  durationDays: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  planType: string;
  createdAt: string;
  updatedAt: string;
}

/** اشتراک فعال «پروفایل اختصاصی» کاربر */
export interface PublicPageSubscriptionStatus {
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
}

export interface PublicPageStatus {
  isActive: boolean;
  reason: PublicPageActivationReason | null;
  /** اسلاگ اختصاصی ثبت‌شده برای آدرس عمومی سالن */
  slug: string | null;
  /**
   * آیا اسلاگ قفل شده است؟ اسلاگ فقط **یک بار** قابل ثبت است و پس از ثبت
   * (به‌دلیل حفظ سئو) از پنل قابل تغییر نیست.
   */
  isSlugLocked: boolean;
  /** آدرس عمومی صفحهٔ آرایشگاه (فقط پس از ثبت اسلاگ) */
  publicUrl: string | null;
  /** آیا پروفایل آرایشگر تایید شده است؟ (بدون تایید، صفحه عمومی نمایش داده نمی‌شود) */
  isApproved: boolean;
  /** وضعیت نمایش عمومی مستقل از فعال‌بودن اشتراک است. */
  isPubliclyVisible?: boolean;
  /** فقط آرایشگرانی که با کد معرف ثبت‌نام کرده‌اند تخفیف ویژهٔ خرید دارند. */
  hasReferralDiscount: boolean;
  /**
   * اشتراک فعال «پروفایل اختصاصی» (دورهٔ رایگان، مهلت انتقالی خریداران قبلی
   * یا پلن تمدید پولی). `null` یعنی صفحه غیرفعال است.
   */
  subscription?: PublicPageSubscriptionStatus | null;
}

export interface PublicPageDiscountQuote {
  code: string | null;
  percentOff: number;
  originalAmount: number;
  discountAmount: number;
  amount: number;
}

export interface SlugAvailabilityResult {
  slug: string;
  valid: boolean;
  available: boolean;
  isCurrentUser: boolean;
  reason: string;
}

export interface PublicBarberProfile extends Barber {
  slug: string | null;
  publicPage: {
    isActive: boolean;
    reason: PublicPageActivationReason | null;
    slug: string;
    url: string;
  };
}

export interface PublicPageDirectoryEntry {
  id: number;
  slug: string;
  updatedAt: string | null;
  /**
   * سیگنال‌های کامل‌بودن محتوا برای سیاستِ کیفیتِ ایندکس
   * (`lib/profile-quality.ts`). اختیاری است تا نسخهٔ قدیمیِ کش‌شدهٔ پاسخ
   * بک‌اند صفحه‌ها را نشکند.
   */
  quality?: { bioLength: number; portfolioCount: number } | null;
}

/**
 * کارتِ فهرست عمومی آرایشگاه‌ها (`/providers`).
 *
 * این ساختار عیناً همان چیزی است که `GET /public-page/directory/page` برمی‌گرداند
 * و فقط شامل فیلدهای عمومیِ پروفایل است — هیچ دادهٔ خصوصی (تلفن، ایمیل، کد ملی،
 * وضعیت پکیج یا اطلاعات پرداخت) در آن نیست.
 */
export interface PublicDirectoryCard {
  id: number;
  slug: string;
  salonName: string;
  activityType: string | null;
  profileImage: string | null;
  rating: number;
  reviewCount: number;
  servicesCount: number;
  minPrice: number | null;
  createdAt: string | null;
  city: { name: string; slug: string } | null;
  province: { name: string; slug: string } | null;
}

export interface PublicDirectoryPage {
  data: PublicDirectoryCard[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
