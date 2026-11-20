'use client';

/**
 * ردیابیِ رویدادهای محصول در GA4 — لایهٔ واحد و تایپ‌شده.
 *
 * چرا این فایل؟
 * ------------
 * تا پیش از این، تنها چیزی که به GA4 می‌رسید `page_view` خودکارِ `gtag('config')`
 * بود؛ هیچ رویدادِ تجاری‌ای وجود نداشت. یعنی «چند نفر ثبت‌نام کردند؟ چند رزرو
 * کامل شد؟ چند پروفایل منتشر شد؟» از داده قابل پاسخ نبود و در نتیجه هیچ کاری
 * در حوزهٔ سئو قابل اندازه‌گیری نبود.
 *
 * سه قاعدهٔ سخت که این لایه تضمین می‌کند:
 *
 *   ۱. **بدون داده شخصی.** `AnalyticsEventParams` فقط کلیدهای شمارشی/عددی/
 *      بولینِ از پیش تعریف‌شده را می‌پذیرد. تایپ اجازه نمی‌دهد شمارهٔ تلفن،
 *      ایمیل، نام، توکن یا شناسهٔ پرداخت داخل payload برود و هیچ تابعِ
 *      «ارسال هر آبجکتی» وجود ندارد.
 *   ۲. **بدون تکرار.** رویدادهای یک‌باره (مثل «مشاهدهٔ پروفایل») با
 *      `trackEventOnce` در یک کلیدِ یکتا قفل می‌شوند تا رندرِ مجدد ری‌اکت یا
 *      StrictMode رویدادِ تکراری نفرستد.
 *   ۳. **حریم خصوصی اول.** تا وقتی `AnalyticsGate` اجازه نداده، هیچ رویدادی
 *      به شبکه نمی‌رود (فقط در یک صفِ محدود در حافظه می‌ماند). اگر کاربر
 *      DNT/GPC روشن کرده باشد، هیچ‌چیز ارسال نمی‌شود.
 *
 * افزودن رویداد جدید: کلیدش را به `AnalyticsEventMap` اضافه کنید. تایپ اجازه
 * نمی‌دهد پارامترِ تعریف‌نشده یا رشتهٔ آزاد بفرستید.
 */

/** فقط این شکل از پارامترها مجاز است — هیچ فیلد آزادِ متنی. */
export type AnalyticsValue = string | number | boolean;

export interface AnalyticsEventMap {
  /** کاربر فرم ثبت‌نامِ آرایشگر را ارسال کرد (شروع فرایند). */
  provider_registration_started: { source: 'provider_signup' };
  /** ثبت‌نام آرایشگر با موفقیت انجام شد. */
  provider_registration_completed: { source: 'provider_signup' };
  /** کاربر فرم ثبت‌نامِ مشتری را ارسال کرد (شروع فرایند). */
  customer_registration_started: { source: 'register' | 'booking_dialog' };
  /** ثبت‌نام مشتری با موفقیت انجام شد. */
  customer_registration_completed: { source: 'register' | 'booking_dialog' };
  /** صفحهٔ اختصاصی سالن برای اولین بار فعال/منتشر شد. */
  provider_profile_published: {
    activation: 'package' | 'paid_bookings' | 'subscription';
  };
  /** بازدید از صفحهٔ عمومی یک آرایشگر. */
  provider_profile_viewed: { has_portfolio: boolean; has_reviews: boolean };
  /** شروع فرایند رزرو (کلیک روی دکمهٔ رزرو). */
  booking_started: { source: 'profile' | 'dialog' };
  /** رزرو با موفقیت ثبت شد. */
  booking_completed: { has_deposit: boolean };
  /** پرداخت آنلاین با موفقیت انجام شد. */
  payment_completed: { purpose: 'booking' | 'deposit' | 'public_page' };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

/**
 * پاک‌سازیِ آدرس صفحه پیش از ارسال به GA4.
 *
 * چرا لازم است؟ GA4 به‌طور پیش‌فرض `page_location` را با **کل** آدرس، از جمله
 * مسیر و کوئری، می‌فرستد. در منشیم دو جا این آدرس حاملِ راز است:
 *
 *   • `/deposit/[token]` — توکنِ پرداختِ بیعانه؛ هرکس آن را داشته باشد می‌تواند
 *     صفحه را باز کند.
 *   • پارامترهای `callbackUrl`/`token`/`code` در مسیرهای ورود و بازگشت از درگاه.
 *
 * ارسال آن‌ها به گوگل هم نقضِ «بدون دادهٔ پرداخت» است و هم راز را از دستِ ما
 * بیرون می‌برد. این ثابت‌ها تنها منبعِ حقیقت‌اند: هم `AnalyticsGate` (که همین‌ها
 * را در اسکریپتِ `gtag` تزریق می‌کند) و هم تست‌ها از اینجا می‌خوانند.
 */
export const ANALYTICS_PATH_MASKS: ReadonlyArray<{
  pattern: string;
  replacement: string;
}> = [
  { pattern: '^/deposit/[^/]+', replacement: '/deposit/[token]' },
  { pattern: '^/reset-password/[^/]+', replacement: '/reset-password/[token]' },
  { pattern: '^/payment/callback', replacement: '/payment/callback' },
];

/** پارامترهای کوئری که هرگز نباید به GA4 برسند. */
export const ANALYTICS_SECRET_QUERY_PARAMS: readonly string[] = [
  'token',
  'trackId',
  'callbackUrl',
  'code',
  'state',
  'access_token',
  'refresh_token',
];

/**
 * نسخهٔ پاک‌شدهٔ یک URL برای `page_location`.
 *
 * خروجی برای آدرس‌های بی‌خطر عیناً همان ورودی است (جز ترتیبِ نرمال‌شدهٔ
 * پارامترها) تا گزارش‌ها با گذشته قابل مقایسه بمانند.
 */
export function sanitizeAnalyticsUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }

  for (const mask of ANALYTICS_PATH_MASKS) {
    const re = new RegExp(mask.pattern);
    if (re.test(url.pathname)) {
      url.pathname = url.pathname.replace(re, mask.replacement);
      break;
    }
  }

  for (const param of ANALYTICS_SECRET_QUERY_PARAMS) {
    url.searchParams.delete(param);
  }

  return url.toString();
}

interface QueuedEvent {
  name: AnalyticsEventName;
  params: Record<string, AnalyticsValue>;
}

/** صفِ کوچک و محدود؛ اگر گیت هرگز باز نشود، این آرایه دور ریخته می‌شود. */
const MAX_QUEUE_SIZE = 25;
let queue: QueuedEvent[] = [];
let gateReady = false;

/** کلیدهایی که رویداد یک‌باره‌شان قبلاً ثبت شده است (مخصوص همین تب). */
const firedOnceKeys = new Set<string>();

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
};

/**
 * احترام به سیگنال‌های حریم خصوصی مرورگر. اگر کاربر DNT یا Global Privacy
 * Control را روشن کرده باشد، حتی پس از باز شدن گیت هم چیزی ارسال نمی‌شود.
 */
function privacySignalsAllowTracking() {
  if (typeof navigator === 'undefined') return false;

  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };

  if (nav.globalPrivacyControl === true) return false;

  const dnt = nav.doNotTrack ?? nav.msDoNotTrack;
  return dnt !== '1' && dnt !== 'yes';
}

function send(name: AnalyticsEventName, params: Record<string, AnalyticsValue>) {
  if (typeof window === 'undefined') return;
  const gtag = (window as GtagWindow).gtag;
  if (typeof gtag !== 'function') return;
  gtag('event', name, params);
}

/**
 * فراخوانی از `AnalyticsGate` بعد از اجرای `gtag('config', ...)`.
 *
 * اگر `gtag` هنوز واقعاً روی `window` نباشد، صف **دور ریخته نمی‌شود**؛
 * فراخوانی بعدی دوباره تلاش می‌کند. این کار از گم‌شدن رویدادهایی که در فاصلهٔ
 * کوتاهِ بین mount شدن اسکریپت و اجرای آن ثبت شده‌اند جلوگیری می‌کند.
 */
export function markAnalyticsReady() {
  if (gateReady) return;
  if (typeof window === 'undefined') return;
  if (typeof (window as GtagWindow).gtag !== 'function') return;

  gateReady = true;

  const pending = queue;
  queue = [];
  for (const event of pending) send(event.name, event.params);
}

/** فقط برای تست‌ها: بازگرداندن ماژول به حالت اولیه. */
export function resetAnalyticsStateForTests() {
  queue = [];
  gateReady = false;
  firedOnceKeys.clear();
}

export function getQueuedAnalyticsEventsForTests() {
  return [...queue];
}

/**
 * ثبت یک رویداد.
 *
 * @param name نام رویداد (از فهرست بالا)
 * @param params پارامترهای مجاز؛ هیچ داده شخصی مجاز نیست.
 */
export function trackEvent<K extends AnalyticsEventName>(
  name: K,
  params: AnalyticsEventMap[K],
) {
  if (typeof window === 'undefined') return;
  if (!privacySignalsAllowTracking()) return;

  const safeParams = params as Record<string, AnalyticsValue>;

  if (!gateReady) {
    queue.push({ name, params: safeParams });
    if (queue.length > MAX_QUEUE_SIZE) queue.shift();
    return;
  }

  send(name, safeParams);
}

/**
 * ثبت رویدادی که در یک نشست فقط یک بار باید ارسال شود.
 *
 * @param key کلید یکتای منطقی (مثلاً `profile:42`)، نه دادهٔ شخصی.
 */
export function trackEventOnce<K extends AnalyticsEventName>(
  key: string,
  name: K,
  params: AnalyticsEventMap[K],
) {
  if (firedOnceKeys.has(key)) return;
  firedOnceKeys.add(key);
  trackEvent(name, params);
}
