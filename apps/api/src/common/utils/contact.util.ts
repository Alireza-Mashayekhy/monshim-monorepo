// src/common/utils/contact.util.ts
import { toEnglishDigits } from './digits.util';

/**
 * نرمال‌سازی ورودی‌های «راه‌های ارتباطی» و «موقعیت مکانی» پروفایل آرایشگر.
 *
 * قرارداد مشترک همهٔ توابع این فایل:
 *   - `undefined`/`null` دست‌نخورده برمی‌گردد (فیلد در درخواست نیامده).
 *   - رشتهٔ خالی → `null` یعنی «پاک‌کردن مقدار» (clear)؛ DTO هم `null` را
 *     با `@IsOptional()` می‌پذیرد.
 *   - ورودیِ نامعتبر → همان رشته (با ارقام انگلیسی) برمی‌گردد تا
 *     `@Matches` بعدی آن را با پیام فارسی رد کند؛ هرگز بی‌صدا null نمی‌شود.
 */

/** پیام خطای شمارهٔ تماس/واتساپ (تلفن ثابت با کد شهر یا موبایل). */
export const IRANIAN_PHONE_MESSAGE =
  'شماره وارد شده معتبر نیست؛ تلفن ثابت با کد شهر (مثل ۰۲۱۲۲۳۳۴۴۵۵) یا موبایل ۱۱ رقمی (مثل ۰۹۱۲۲۲۳۳۴۴۵۵) وارد کنید';

export const INSTAGRAM_HANDLE_MESSAGE =
  'شناسه اینستاگرام نامعتبر است؛ نام کاربری (مثل my_salon) یا لینک پروفایل (instagram.com/my_salon) وارد کنید';

export const TELEGRAM_HANDLE_MESSAGE =
  'شناسه تلگرام نامعتبر است؛ نام کاربری (مثل my_salon) یا لینک کانال/پروفایل (t.me/my_salon) وارد کنید';

/** الگوی شمارهٔ معتبر ایرانیِ ذخیره‌شده: ۰ + ۹ تا ۱۰ رقم (موبایل ۱۱ یا ثابت ۱۰/۱۱ رقمی). */
export const IRANIAN_PHONE_PATTERN = /^0\d{9,10}$/;

/** شناسهٔ مجاز شبکه‌های اجتماعی: حروف انگلیسی، عدد، نقطه و آندرلاین. */
export const SOCIAL_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,100}$/;

/**
 * نرمال‌سازی شمارهٔ تماس/واتساپ به فرمت رقمی ایرانی:
 *   - ارقام فارسی/عربی → انگلیسی؛ فاصله، خط تیره، پرانتز و نقطه حذف.
 *   - `+98` / `0098` / `98…` / `912…` (بدون صفر) → فرمت `09…`.
 * خروجی فقط رشتهٔ ارقام است؛ اعتبارسنجی نهایی با `IRANIAN_PHONE_PATTERN`
 * در DTO انجام می‌شود.
 */
export function normalizePhoneInput(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return null; // پاک‌کردن فیلد

  let digits = toEnglishDigits(trimmed).replace(/[\s\-()._]/g, '');
  if (digits.startsWith('+98')) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith('0098')) {
    digits = `0${digits.slice(4)}`;
  } else if (digits.startsWith('98') && digits.length >= 12) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = `0${digits}`;
  }
  return digits.replace(/\D/g, '');
}

/** بخش‌هایی از اینستاگرام که شناسهٔ کاربری نیستند (لینک پست/استوری و...). */
const INSTAGRAM_NON_HANDLE_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'direct',
  'share',
]);

/** بخش‌هایی از t.me که شناسهٔ کاربری نیستند (لینک دعوت/اشتراک‌گذاری و...). */
const TELEGRAM_NON_HANDLE_SEGMENTS = new Set([
  'joinchat',
  'share',
  'addstickers',
  'addlist',
  'proxy',
  'socks',
]);

const INSTAGRAM_URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i;
const TELEGRAM_URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/([A-Za-z0-9._]+)/i;

/**
 * استخراج شناسهٔ کاربری اینستاگرام/تلگرام از ورودی کاربر:
 *   - `@foo` یا `foo` → `foo`
 *   - `https://instagram.com/foo` / `https://t.me/foo` → `foo`
 *   - لینک پست/استوری/دعوت → همان ورودی خام برمی‌گردد تا DTO آن را رد کند.
 *   - خالی → `null` (پاک‌کردن).
 */
export function extractSocialHandle(
  value: unknown,
  kind: 'instagram' | 'telegram',
): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    kind === 'instagram' ? INSTAGRAM_URL_PATTERN : TELEGRAM_URL_PATTERN,
  );
  if (urlMatch) {
    const handle = urlMatch[1];
    const blocked =
      kind === 'instagram'
        ? INSTAGRAM_NON_HANDLE_SEGMENTS
        : TELEGRAM_NON_HANDLE_SEGMENTS;
    if (blocked.has(handle.toLowerCase())) return trimmed;
    return handle;
  }

  return trimmed.replace(/^@+/, '');
}

/**
 * نرمال‌سازی عرض/طول جغرافیایی: رشتهٔ عددی (با ارقام فارسی) → number،
 * خالی → null، بقیه (NaN) دست‌نخورده می‌ماند تا `@IsNumber` ردش کند.
 */
export function normalizeCoordinateInput(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number(toEnglishDigits(trimmed));
}
