import { ActivityTypeValue } from '@/constants/activity-types';

import { CityResponse, ProvinceResponse } from '../locations/types';
import type { PublicPageSubscriptionStatus } from '../public-page/types';
import type { SmsSubscriptionStatus } from '../subscription/types';

export type BarberPendingStatus = 'none' | 'pending' | 'rejected';

export interface ApprovedProfileSnapshot {
  fullName: string;
  salonName: string;
  activityType: string | null;
  provinceName: string | null;
  cityName: string | null;
  address: string;
  bio: string | null;
  profileImage: string | null;
  portfolioImages: string[];
}

export interface BarberResponse {
  id: number;
  barberProfile?: BarberProfile;
  cityName: string | null;
  citySlug?: string | null;
  provinceName: string | null;
  fullName?: string;
  phone?: string;
  profileImage: string | null;
  salonName: string;
  activityType?: string | null;
  minPrice?: number | null;
  servicesCount?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  isApproved?: boolean;
  /** Public visibility toggle, independent of account login. */
  isActive?: boolean;
  isAccountActive?: boolean;
  isAdminAccount?: boolean;
  slug?: string | null;
  barberProfileId?: string | null;
  publicUrl?: string | null;
  publicPageAvailability?: {
    status: 'NOT_SETUP' | 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
    reason: 'NO_SLUG' | 'ACCOUNT_INACTIVE' | 'NOT_APPROVED' | 'HIDDEN' | 'NO_ACTIVE_SERVICE' | 'SUBSCRIPTION_UNKNOWN' | 'NO_ACTIVE_SUBSCRIPTION' | null;
  };
  createdAt?: string;
  hasPendingChanges?: boolean;
  isEditReview?: boolean;
  /**
   * وضعیت واقعی اشتراک «پروفایل اختصاصی» (فقط در فهرست مدیریت ادمین
   * پر می‌شود؛ از همان منطق مرکزی بک‌اند). `null` یعنی هیچ رکوردی از نوع
   * `public_page` برای این آرایشگر وجود ندارد.
   */
  publicPageSubscription?: PublicPageSubscriptionStatus | null;
  publicPageSubscriptionKnown?: boolean;
  /**
   * وضعیت واقعی اشتراک «پیامکی» با سهمیه و مصرف آن (فقط در فهرست مدیریت
   * ادمین پر می‌شود؛ از همان منطق مرکزی بک‌اند). پلن فعال بر اساس
   * status و بازهٔ startDate تا endDate تشخیص داده می‌شود. `null` یعنی هیچ
   * رکورد اشتراک پیامکی برای این آرایشگر وجود ندارد.
   */
  smsSubscription?: SmsSubscriptionStatus | null;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  depositPrice?: number | null;
  durationMinutes: number;
}

export type SlotIntervalMinutes = 15 | 30 | 45 | 60;

export interface Barber {
  id: number;
  name?: string;
  fullName?: string;
  salonName: string;
  image: string | null;
  profileImage: string | null;
  activityType?: string | null;
  address: string;
  bio: string | null;
  rating: number;
  reviewCount: number;
  slotIntervalMinutes?: SlotIntervalMinutes;
  services: Service[];
  portfolio: string[];
  city: Pick<CityResponse, 'id' | 'name' | 'slug' | 'provinceId'> | null;
  province: Pick<ProvinceResponse, 'id' | 'name' | 'slug'> | null;
  userId?: number;
  // ---- راه‌های ارتباطی و موقعیت مکانی (صفحهٔ اختصاصی) ----
  /** شماره تماس سالن (برای دکمهٔ «تماس»)؛ فقط وقتی ثبت شده باشد. */
  contactPhone?: string | null;
  /** شناسهٔ اینستاگرام بدون @ و لینک. */
  instagram?: string | null;
  /** شماره واتساپ به فرمت `09…`. */
  whatsapp?: string | null;
  /** شناسهٔ تلگرام بدون @ و لینک. */
  telegram?: string | null;
  /** عرض جغرافیایی؛ فقط با longitude (مسیریابی گوگل‌مپ/اسنپ). */
  latitude?: number | null;
  /** طول جغرافیایی؛ فقط با latitude. */
  longitude?: number | null;
}

export interface PublicCityDirectoryEntry {
  slug: string;
  name: string;
  provinceName: string | null;
  activeBarberCount: number;
}

export interface PublicDirectoryResponse {
  barbers: { id: number }[];
  cities: PublicCityDirectoryEntry[];
}

export interface BarberProfile {
  id: number;
  /** شناسهٔ پروفایل (uuid) که مسیرهای ادمین با آن کار می‌کنند. */
  barberProfileId?: string;
  /** اسلاگ صفحهٔ عمومی آرایشگر (`/provider/[slug]`) در صورت فعال بودن. */
  slug?: string | null;
  fullName: string;
  phone: string;
  nationalCode?: string | null;
  email?: string;
  birthDate?: string | null;
  salonName: string;
  activityType?: string | null;
  provinceId?: number | null;
  cityId?: number | null;
  provinceName?: string | null;
  cityName?: string | null;
  city?: CityResponse | null;
  province?: ProvinceResponse | null;
  address: string;
  bio?: string | null;
  profileImage?: string | null;
  portfolioImages?: string[];
  workStartTime?: string | null;
  workEndTime?: string | null;
  slotIntervalMinutes?: SlotIntervalMinutes;
  isApproved: boolean;
  isPubliclyVisible?: boolean;
  rejectionReason?: string | null;
  pendingStatus?: BarberPendingStatus;
  hasPendingChanges?: boolean;
  isEditReview?: boolean;
  pendingRejectionReason?: string | null;
  currentApprovedProfile?: ApprovedProfileSnapshot | null;
  // ---- راه‌های ارتباطی و موقعیت مکانی (برای نمایش ثبت/ثبت‌نشده در داشبورد) ----
  contactPhone?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
}

export interface UpdateBarberProfile {
  fullName?: string;
  birthDate?: string | null;
  nationalCode?: string | null;
  salonName?: string;
  /** نوع فعالیت سالن؛ همان گزینهٔ ثبت‌نام که در ویرایش پروفایل هم قابل تغییر است. */
  activityType?: ActivityTypeValue;
  provinceId?: number | null;
  cityId?: number | null;
  address?: string;
  bio?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  slotIntervalMinutes?: SlotIntervalMinutes;
  profileImage?: string | null;
  isApproved?: boolean;
  rejectionReason?: string | null;
  // ---- راه‌های ارتباطی و موقعیت مکانی (بدون نیاز به تأیید مجدد) ----
  contactPhone?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface MyReferral {
  id: string;
  referredUserId: number;
  referredFullName: string | null;
  referredSalonName: string | null;
  status: 'PENDING' | 'COMPLETED';
  /** رزروهای موفقِ پرداخت‌شدهٔ همان آرایشگر دعوت‌شده */
  completedBookingsCount: number;
  /** آیا همان آرایشگر دعوت‌شده صفحهٔ اختصاصی خریده است؟ */
  hasPurchasedPublicPage?: boolean;
  rewardPaid: boolean;
  createdAt: string;
}

export interface MyReferralsInfo {
  referrals: MyReferral[];
  eligibility: {
    /** بیشترین رزرو موفقِ پرداخت‌شده در میان آرایشگرهای دعوت‌شده */
    completedPaidBookingsCount: number;
    requiredPaidBookings: number;
    /** آیا یکی از آرایشگرهای دعوت‌شده صفحهٔ اختصاصی خریده است؟ */
    hasPurchasedPublicPage: boolean;
    /**
     * تحقق یکی از دو شرط **توسط آرایشگر دعوت‌شده**:
     * ۳۰ رزرو موفق یا خرید صفحهٔ اختصاصی.
     */
    isEligible?: boolean;
    /** مبلغ پاداش هر دعوت (تومان) */
    rewardAmount?: number;
    /** جمع پاداش‌های واریزشده */
    paidRewardAmount?: number;
    /** جمع پاداش‌های در انتظار تحقق شرط */
    unpaidRewardAmount?: number;
  };
  stats: {
    total: number;
    completed: number;
    pending: number;
  };
}

export interface UpdateBarberPortfolio {
  files: File[];
  existingImages: string[];
}

export interface User {
  id: number;
  fullName: string;
  walletBalance: number;
  roles: string[];
  phone: string;
  nationalCode?: string | null;
  birthDate?: string | null;
}

export interface Notification {
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'ERROR';
}

export type PaymentMethod = 'ONLINE' | 'WALLET';

export interface WorkHours {
  id?: string;
  barberId?: string;
  dayOfWeek: number; // 0=شنبه ... 6=جمعه
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface AvailableSlotsResponse {
  slots: string[];
}

export interface ReviewBarberDto {
  isApproved: boolean;
  rejectionReason?: string | null;
}

export type BarberReviewStatus = 'pending' | 'approved' | 'rejected';

export interface BarberReview {
  id: string;
  barberId?: string;
  customerId?: number;
  rating: number;
  comment: string | null;
  status?: BarberReviewStatus;
  adminNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  customer?: {
    id?: number;
    fullName: string;
  };
  barber?: {
    id: string;
    userId: number;
    salonName: string;
  };
}

export interface CreateBarberReviewDto {
  rating: number;
  comment?: string;
}

export interface ModerateBarberReviewDto {
  status: 'approved' | 'rejected';
  adminNote?: string | null;
}

export type ReviewEligibilityReason =
  | 'ELIGIBLE'
  | 'ALREADY_REVIEWED'
  | 'NO_BOOKING'
  | 'BOOKING_NOT_COMPLETED_YET'
  | 'OWN_PROFILE';

export interface MyBarberReviewInfo {
  myReview: BarberReview | null;
  canReview: boolean;
  eligibilityReason: ReviewEligibilityReason;
}
