export const PLAN_DURATION_DAYS = 30;

/** مدت اعتبار مهلت انتقالی خریداران قبلی «پروفایل اختصاصی» (۶ ماه). */
export const PUBLIC_PAGE_LEGACY_DURATION_DAYS = 180;

/**
 * نوع پلن اشتراک.
 *
 *   • `sms`         — اشتراک پیامکی (رفتار فعلی منشیم)؛ مدت اعتبار روزانه
 *                     محاسبه می‌شود و اعتبار پیامک دارد.
 *   • `public_page` — اشتراک «پروفایل اختصاصی» (صفحهٔ عمومی آرایشگاه)؛ مدت
 *                     اعتبار ماه تقویمی است و اعتبار پیامک ندارد.
 */
export const SUBSCRIPTION_PLAN_TYPES = ['sms', 'public_page'] as const;
export type SubscriptionPlanType = (typeof SUBSCRIPTION_PLAN_TYPES)[number];

export const SMS_PLAN_TYPE: SubscriptionPlanType = 'sms';
export const PUBLIC_PAGE_PLAN_TYPE: SubscriptionPlanType = 'public_page';

export interface SubscriptionPlanDefinition {
  planKey: string;
  name: string;
  smsCount: number;
  price: number;
  durationDays: number;
  description: string;
  sortOrder: number;
  planType: SubscriptionPlanType;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanDefinition[] = [
  {
    planKey: 'starter',
    name: 'پلن آغاز',
    smsCount: 100,
    price: 59000,
    durationDays: PLAN_DURATION_DAYS,
    description: 'مناسب سالن‌های تازه‌کار یا سالن‌هایی که رزرو کمی دارند.',
    sortOrder: 1,
    planType: SMS_PLAN_TYPE,
  },
  {
    planKey: 'basic',
    name: 'پلن پایه',
    smsCount: 300,
    price: 169000,
    durationDays: PLAN_DURATION_DAYS,
    description: 'مناسب سالن‌های کم‌رزرو و متوسط.',
    sortOrder: 2,
    planType: SMS_PLAN_TYPE,
  },
  {
    planKey: 'growth',
    name: 'پلن رشد',
    smsCount: 700,
    price: 379000,
    durationDays: PLAN_DURATION_DAYS,
    description: 'مناسب سالن‌هایی که تعداد رزرو روزانه بیشتری دارند.',
    sortOrder: 3,
    planType: SMS_PLAN_TYPE,
  },
  {
    planKey: 'pro',
    name: 'پلن حرفه‌ای',
    smsCount: 1500,
    price: 799000,
    durationDays: PLAN_DURATION_DAYS,
    description: 'پیشنهاد ما برای سالن‌های فعال.',
    sortOrder: 4,
    planType: SMS_PLAN_TYPE,
  },
  {
    planKey: 'premium',
    name: 'پلن ویژه',
    smsCount: 3000,
    price: 1549000,
    durationDays: PLAN_DURATION_DAYS,
    description: 'مناسب سالن‌های پرمشتری و چندنفره.',
    sortOrder: 5,
    planType: SMS_PLAN_TYPE,
  },

  // ── پلن‌های «پروفایل اختصاصی» (صفحهٔ عمومی آرایشگاه) ──────────────────
  // این پلن‌ها اعتبار پیامک ندارند و فقط دسترسی به پروفایل اختصاصی را
  // برای مدت اعتبار خود فراهم می‌کنند. دورهٔ رایگان هم فقط یک‌بار و
  // خودکار پس از ثبت‌نام اعطا می‌شود و در فهرست پلن‌های قابل خرید نیست.
  {
    planKey: 'public_page_trial',
    name: 'پروفایل اختصاصی رایگان',
    smsCount: 0,
    price: 0,
    durationDays: PLAN_DURATION_DAYS,
    description:
      'دورهٔ رایگان یک‌ماههٔ پروفایل اختصاصی که پس از ثبت‌نام آرایشگر اعطا می‌شود.',
    sortOrder: 10,
    planType: PUBLIC_PAGE_PLAN_TYPE,
  },
  {
    planKey: 'public_page_monthly',
    name: 'تمدید یک‌ماههٔ پروفایل اختصاصی',
    smsCount: 0,
    price: 99_000,
    durationDays: PLAN_DURATION_DAYS,
    description: 'تمدید یک‌ماههٔ دسترسی به پروفایل اختصاصی آرایشگاه.',
    sortOrder: 11,
    planType: PUBLIC_PAGE_PLAN_TYPE,
  },
  {
    planKey: 'public_page_quarterly',
    name: 'تمدید سه‌ماههٔ پروفایل اختصاصی',
    smsCount: 0,
    price: 250_000,
    durationDays: 90,
    description: 'تمدید سه‌ماههٔ دسترسی به پروفایل اختصاصی آرایشگاه.',
    sortOrder: 12,
    planType: PUBLIC_PAGE_PLAN_TYPE,
  },

  // ── مهلت انتقالی خریداران قبلی ──────────────────────────────────────
  // خریداران پکیج یک‌بارهٔ سابق ۶ ماه اعتبار می‌گیرند. این پلن قابل خرید
  // نیست (در `PUBLIC_PAGE_PURCHASE_PLAN_KEYS` نیست) و فقط هنگام بوت و به‌صورت
  // خودکار اعطا می‌شود.
  {
    planKey: 'public_page_legacy',
    name: 'مهلت انتقالی خریداران قبلی پروفایل اختصاصی',
    smsCount: 0,
    price: 0,
    durationDays: PUBLIC_PAGE_LEGACY_DURATION_DAYS,
    description:
      'مهلت انتقالی ۶ ماهه برای خریداران قبلی پروفایل اختصاصی (غیرقابل خرید).',
    sortOrder: 13,
    planType: PUBLIC_PAGE_PLAN_TYPE,
  },
];

/** کلید پلن دورهٔ رایگان پروفایل اختصاصی. */
export const PUBLIC_PAGE_TRIAL_PLAN_KEY = 'public_page_trial';

/** کلید پلن مهلت انتقالی خریداران قبلی پروفایل اختصاصی. */
export const PUBLIC_PAGE_LEGACY_PLAN_KEY = 'public_page_legacy';

/** کلیدهای پلن‌هایی که آرایشگر می‌تواند برای خرید/تمدید پروفایل اختصاصی انتخاب کند. */
export const PUBLIC_PAGE_PURCHASE_PLAN_KEYS = [
  'public_page_monthly',
  'public_page_quarterly',
] as const;

/** آیا این پلن قابل انتخاب برای خرید/تمدید پروفایل اختصاصی است؟ */
export function isPublicPagePurchasePlanKey(planKey: string | null): boolean {
  return (
    !!planKey &&
    (PUBLIC_PAGE_PURCHASE_PLAN_KEYS as readonly string[]).includes(planKey)
  );
}
