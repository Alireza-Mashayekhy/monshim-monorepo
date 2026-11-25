/**
 * خلاصهٔ وضعیت اشتراک «پیامکی» — **تابع خالص** بدون وابستگی به Nest، دیتابیس
 * یا cron.
 *
 * چرا جدا؟ همان دلیلِ `public-page-subscription-summary.ts`: منطق تشخیص
 * «اشتراک فعال فعلی» باید یک‌جا و مشترک باشد تا پنل مدیریت، داشبورد و مسیر
 * ثبت رزرو دستی همه یک نتیجه ببینند. این فایل فقط نمایش را از رکوردهای واقعی
 * دیتابیس می‌سازد؛ هیچ دادهٔ ساختگی یا محاسبهٔ فرانت‌اندی در کار نیست.
 *
 * قاعدهٔ تشخیص «فعال»: وضعیت `ACTIVE` **و** داخل بازهٔ startDate تا endDate.
 * صرفِ `active` بودنِ ستون status معنای معتبر بودن نیست — تاریخ هم باید
 * بررسی شود (همان قاعدهٔ `getCurrent`).
 */
import {
  UserSubscription,
  UserSubscriptionStatus,
} from './entities/user-subscription.entity';

/**
 * وضعیت نمایشیِ اشتراک پیامکی:
 *
 * `active`: وضعیت ACTIVE و داخل بازهٔ startDate تا endDate.
 * `scheduled`: وضعیت ACTIVE اما startDate هنوز نرسیده (تمدید صف‌شده).
 * `expired`: منقضی‌شده یا بسته‌شده با انقضای خودکار.
 * `canceled`: لغوشده (هرگز معتبر تلقی نمی‌شود حتی اگر داخل بازه باشد).
 */
export type SmsSubscriptionDisplayStatus =
  'active' | 'scheduled' | 'expired' | 'canceled';

export interface SmsSubscriptionSummary {
  id: string;
  planId: string;
  planKey: string | null;
  planName: string;
  price: number;
  startDate: string;
  endDate: string;
  /** وضعیت خام دیتابیس (`active` | `expired` | `canceled`). */
  status: string;
  /** وضعیت نمایشیِ مشتق از بازهٔ زمانی + وضعیت خام. */
  display: SmsSubscriptionDisplayStatus;
  /** کل سهمیهٔ پیامک این اشتراک (sms_total). */
  smsTotal: number;
  /** سهمیهٔ مصرف‌شده (sms_used). */
  smsUsed: number;
  /** سهمیهٔ باقی‌مانده (sms_total − sms_used؛ هرگز منفی نمی‌شود). */
  smsRemaining: number;
  /** درصد مصرف سهمیه (۰ تا ۱۰۰؛ وقتی سهمیه صفر است ۰). */
  usagePercent: number;
}

function toDateSafe(value: Date | string | null | undefined): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

/** عدد ستون‌های int/decimal ممکن است به‌صورت رشته برسد؛ همیشه Number می‌کنیم. */
function toCountSafe(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * آیا این رکورد «اشتراک معتبر در این لحظه» است؟ همان قاعدهٔ `getCurrent`
 * (status + بازهٔ زمانی) — برای پلن پیامکی هیچ مسیر دیگری نباید تعریف کند.
 */
export function isSmsSubscriptionInWindow(
  subscription: Pick<UserSubscription, 'status' | 'startDate' | 'endDate'>,
  now: Date,
): boolean {
  const start = toDateSafe(subscription.startDate);
  const end = toDateSafe(subscription.endDate);
  return (
    subscription.status === UserSubscriptionStatus.ACTIVE &&
    start <= now &&
    now < end
  );
}

/**
 * خلاصهٔ «مهم‌ترین» اشتراک پیامکی یک کاربر از بین همهٔ رکوردهایش.
 *
 * ترجیح: اشتراک فعالِ در بازه (اگر چندتاست، با پایانِ دیرتر). در غیر این
 * صورت آخرین رکورد بر اساس endDate تا وضعیت «منقضی/لغوشده» با تاریخ واقعی
 * نمایش داده شود. چند اشتراک قدیمی هرگز جای اشتراک فعال فعلی را نمی‌گیرند.
 */
export function summarizeSmsSubscriptions(
  rows: UserSubscription[] | null | undefined,
  now: Date = new Date(),
): SmsSubscriptionSummary | null {
  const valid = (rows ?? []).filter(row => row && row.id != null);
  if (valid.length === 0) return null;

  const active = valid.filter(row => isSmsSubscriptionInWindow(row, now));
  const chosen = (active.length > 0 ? active : valid)
    .slice()
    .sort(
      (a, b) =>
        toDateSafe(b.endDate).getTime() - toDateSafe(a.endDate).getTime(),
    )[0];

  const start = toDateSafe(chosen.startDate);
  const end = toDateSafe(chosen.endDate);

  const display: SmsSubscriptionDisplayStatus =
    chosen.status === UserSubscriptionStatus.CANCELED
      ? 'canceled'
      : active.length > 0 && isSmsSubscriptionInWindow(chosen, now)
        ? 'active'
        : chosen.status === UserSubscriptionStatus.ACTIVE && start > now
          ? 'scheduled'
          : 'expired';

  const smsTotal = Math.max(0, Math.round(toCountSafe(chosen.smsTotal)));
  const smsUsed = Math.max(0, Math.round(toCountSafe(chosen.smsUsed)));

  return {
    id: String(chosen.id),
    planId: String(chosen.subscriptionPlanId),
    planKey: chosen.subscriptionPlan?.planKey ?? null,
    planName: chosen.subscriptionPlan?.name ?? '',
    price: Number(chosen.price ?? 0),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status: String(chosen.status),
    display,
    smsTotal,
    smsUsed,
    smsRemaining: Math.max(0, smsTotal - smsUsed),
    usagePercent:
      smsTotal > 0 ? Math.min(100, Math.round((smsUsed / smsTotal) * 100)) : 0,
  };
}

/** گروه‌بندی رکوردها بر اساس userId و خلاصهٔ هر کاربر. */
export function summarizeSmsSubscriptionsByUser(
  rows: UserSubscription[] | null | undefined,
  now: Date = new Date(),
): Map<number, SmsSubscriptionSummary> {
  const byUser = new Map<number, UserSubscription[]>();
  for (const row of rows ?? []) {
    const userId = Number(row.userId);
    if (!Number.isInteger(userId) || userId < 1) continue;
    const list = byUser.get(userId) ?? [];
    list.push(row);
    byUser.set(userId, list);
  }

  const result = new Map<number, SmsSubscriptionSummary>();
  for (const [userId, list] of byUser) {
    const summary = summarizeSmsSubscriptions(list, now);
    if (summary) result.set(userId, summary);
  }
  return result;
}
