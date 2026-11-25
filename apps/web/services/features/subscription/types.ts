export interface SubscriptionPlan {
  id: string;
  planKey: string | null;
  name: string;
  smsCount: number;
  price: number;
  durationDays: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSubscriptionPlanDto {
  price: number;
  smsCount: number;
}

export type UserSubscriptionStatus = 'active' | 'expired' | 'canceled';

/**
 * وضعیت نمایشیِ اشتراک پیامکی — مقدار از بک‌اند می‌آید (خلاصه‌ساز مرکزی) و
 * بر اساس وضعیت خام + بازهٔ startDate تا endDate محاسبه می‌شود؛ فرانت فقط
 * نمایش می‌دهد و خودش تشخیص «فعال بودن» را از داده‌های قدیمی/کش نمی‌سازد.
 */
export type SmsSubscriptionDisplayStatus =
  | 'active'
  | 'scheduled'
  | 'expired'
  | 'canceled';

/**
 * خلاصهٔ اشتراک پیامکی یک کاربر (فقط در فهرست مدیریت ادمین پر می‌شود).
 * منبع: `summarizeSmsSubscriptions` در بک‌اند — اشتراکِ فعال واقعی
 * (status + بازهٔ تاریخ) همراه با سهمیهٔ پیامک و مصرف آن.
 */
export interface SmsSubscriptionStatus {
  id: string;
  planId: string;
  planKey: string | null;
  planName: string;
  price: number;
  startDate: string;
  endDate: string;
  status: string;
  display: SmsSubscriptionDisplayStatus;
  /** کل سهمیهٔ پیامک (sms_total). */
  smsTotal: number;
  /** پیامک مصرف‌شده (sms_used). */
  smsUsed: number;
  /** پیامک باقی‌مانده (sms_total − sms_used). */
  smsRemaining: number;
  /** درصد مصرف سهمیه (۰ تا ۱۰۰). */
  usagePercent: number;
}

export interface UserSubscription {
  id: string;
  userId: number;
  subscriptionPlanId: string;
  price: number;
  smsTotal: number;
  smsUsed: number;
  status: UserSubscriptionStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  subscriptionPlan: SubscriptionPlan;
}

export interface SmsUsage {
  id: string;
  userId: number;
  userSubscriptionId: string;
  count: number;
  reason: string;
  createdAt: string;
}
