import { toEnglishDigits } from './digits';

/**
 * ساخت لینک تماس (`tel:`) از شماره‌ای که کاربر/سرور داده است.
 *
 * چرا لازم است؟
 *  - شماره‌ها در رابط کاربری با ارقام فارسی نمایش داده می‌شوند و بعضی
 *    مرورگرها/گوشی‌ها `tel:` با ارقام فارسی را نمی‌شمارند.
 *  - شماره ممکن است با فاصله، خط تیره یا پرانتز ذخیره شده باشد.
 *
 * خروجی همیشه یا رشتهٔ `tel:...` است یا رشتهٔ خالی (وقتی هیچ رقمی وجود ندارد)
 * تا فراخوان‌ها بتوانند به‌جای لینک شکسته، دکمه را غیرفعال/پنهان کنند.
 */
export function toCallHref(phone: string | null | undefined): string {
  if (!phone) return '';

  const raw = toEnglishDigits(phone).trim();
  const digits = raw.replace(/\D/g, '');

  if (!digits) return '';

  // فقط علامت مثبتِ ابتدای شماره (پیش‌شمارهٔ بین‌المللی) حفظ می‌شود.
  return `tel:${raw.startsWith('+') ? `+${digits}` : digits}`;
}
