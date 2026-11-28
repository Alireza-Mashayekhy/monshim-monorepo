/**
 * محاسبهٔ روزهای باقی‌ماندهٔ یک اشتراک بر اساس تاریخ پایان سرور.
 *
 * چرا مشترک است؟
 * داشبورد آرایشگر این عدد را برای نمایش «اعتبار باقی‌مانده» نشان می‌دهد؛
 * هیچ جای دیگری در فرانت نباید همین فرمول را دوباره بسازد (در آن صورت
 * ممکن بود یک‌جا ceil و جای دیگر floor بزند و مقادیر متناقض دیده شود).
 * منبع حقیقت «آیا اشتراک فعال است یا نه» همیشه پاسخ بک‌اند است؛ این تابع
 * فقط «چند روز تا endDate مانده» را حساب می‌کند و هرگز نمی‌تواند وضعیت
 * فعال/غیرفعال را تغییر دهد.
 *
 * - عدد منفی برنمی‌گرداند (حداقل صفر).
 * - اگر endDate نامعتبر باشد ۰ برمی‌گرداند (نه NaN به UI نشت کند).
 * - روزهای کامل: ceil؛ مثلاً ۱ ساعت مانده ⇒ «۱ روز».
 */
export function remainingSubscriptionDays(
  endDate: string | Date | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (endDate == null) return 0;
  const end =
    endDate instanceof Date ? endDate.getTime() : new Date(endDate).getTime();
  if (!Number.isFinite(end)) return 0;
  if (!Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((end - nowMs) / 86_400_000));
}

/** The cached current response must not look active after time or quota runs out. */
export function isSmsSubscriptionUsable(
  subscription:
    | {
        status: string;
        startDate: string;
        endDate: string;
        smsTotal: number;
        smsUsed: number;
      }
    | null
    | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!subscription || subscription.status !== 'active') return false;
  const start = new Date(subscription.startDate).getTime();
  const end = new Date(subscription.endDate).getTime();
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= nowMs &&
    nowMs < end &&
    !(
      Number(subscription.smsTotal) > 0 &&
      Number(subscription.smsUsed) >= Number(subscription.smsTotal)
    )
  );
}
