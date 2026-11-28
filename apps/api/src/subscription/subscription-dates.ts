/**
 * منطق تاریخ اشتراک‌ها.
 *
 * برای «پروفایل اختصاصی» مدت اعتبار به **ماه تقویمی** محاسبه می‌شود، نه
 * به تعداد روز. مثال: ثبت‌نام در ۳۱ ژانویه → پایان دورهٔ یک‌ماهه ۲۸/۲۹
 * فوریه، نه ۳ مارس. همین منطق برای پلن سه‌ماهه استفاده می‌شود.
 *
 * پلن‌های اشتراک پیامکی (SMS) هم همچنان مثل قبل بر اساس روز محاسبه می‌شوند
 * تا رفتار فعلی آن‌ها تغییر نکند.
 */

/** افزودن `months` ماه تقویمی به تاریخ داده‌شده (با حفظ ساعت و دقیقه). */
export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());

  if (!Number.isFinite(months)) return result;

  const wholeMonths = Math.trunc(months);
  if (wholeMonths === 0) return result;

  // ابتدا روز را روی ۱ می‌گذاریم تا افزودن ماه به آخر ماه‌های کوتاه‌تر
  // «سرریز» نکند (۳۱ ژانویه + ۱ ماه نباید ۳ مارس شود).
  const targetDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + wholeMonths);

  // آخرین روز ماه مقصد؛ اگر روز مبدأ در ماه مقصد وجود نداشت (مثل ۳۱)،
  // به آخرین روز همان ماه برمی‌گردیم.
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();

  result.setDate(Math.min(targetDay, lastDayOfTargetMonth));

  return result;
}

/** افزودن `days` روز به تاریخ (رفتار فعلی پلن‌های پیامکی). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * تبدیل مدت اعتبار پلن به تاریخ پایان.
 *
 * پلن‌های `public_page` بر اساس ماه تقویمی هستند؛ `durationDays` آن‌ها
 * مضربی از ۳۰ است (۳۰ = یک ماه، ۹۰ = سه ماه). اگر مضرب ۳۰ نبود،
 * fallback به روز است تا هرگز مدت کوتاه‌تر از مقدار اعلام‌شده نشود.
 */
export function addPlanDuration(
  date: Date,
  durationDays: number,
  planType: 'sms' | 'public_page',
): Date {
  if (planType === 'public_page' && durationDays % 30 === 0) {
    return addCalendarMonths(date, durationDays / 30);
  }
  if (planType === 'sms') {
    // An SMS term is full 24-hour days, regardless of the server timezone/DST.
    return new Date(date.getTime() + durationDays * 86_400_000);
  }

  return addDays(date, durationDays);
}
