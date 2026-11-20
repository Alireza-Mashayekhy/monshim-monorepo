/**
 * خلاصهٔ وضعیت اشتراک «پروفایل اختصاصی» — **تابع خالص** بدون وابستگی به Nest،
 * دیتابیس یا cron.
 *
 * چرا جدا؟ `user-subscription.service.ts` ماژول `@nestjs/schedule` را import
 * می‌کند و برخی تست‌ها (مثلاً تست‌های barber) آن را mock نمی‌کنند؛ منطق
 * خلاصه‌سازی باید بدون کشیدنِ آن زنجیره قابل استفاده و تست باشد تا پنل مدیریت
 * و داشبورد دقیقاً همان نتیجه‌ای را ببینند که این تابع تولید می‌کند.
 */
import { PUBLIC_PAGE_TRIAL_PLAN_KEY } from './constants';
import {
  UserSubscription,
  UserSubscriptionStatus,
} from './entities/user-subscription.entity';

/**
 * وضعیت نمایشیِ اشتراک — مشتق از بازهٔ زمانی، نه فقط `status` خام دیتابیس:
 *
 * `active`: وضعیت ACTIVE و داخل بازهٔ startDate تا endDate.
 * `scheduled`: وضعیت ACTIVE اما startDate هنوز نرسیده (تمدید صف‌شده).
 * `expired`: منقضی‌شده.
 */
export type PublicPageSubscriptionDisplayStatus =
  'active' | 'scheduled' | 'expired';

export interface PublicPageSubscriptionSummary {
  id: string;
  planId: string;
  planKey: string | null;
  planName: string;
  isFreeTrial: boolean;
  price: number;
  startDate: string;
  endDate: string;
  status: string;
  /** وضعیت نمایشیِ مشتق از بازهٔ زمانی (برای نمایش یکپارچه در فرانت). */
  display: PublicPageSubscriptionDisplayStatus;
}

function toDateSafe(value: Date | string | null | undefined): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function isPublicPageSubscriptionInWindow(
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
 * خلاصهٔ «مهم‌ترین» اشتراک پروفایل اختصاصی یک کاربر از بین همهٔ رکوردهایش.
 *
 * ترجیح: اشتراک فعالِ در بازه؛ در غیر این صورت آخرین رکورد بر اساس endDate
 * (نمایش «منقضی‌شده» همراه با تاریخ پایان). اگر هیچ رکوردی نباشد → null.
 */
export function summarizePublicPageSubscriptions(
  rows: UserSubscription[] | null | undefined,
  now: Date = new Date(),
): PublicPageSubscriptionSummary | null {
  const valid = (rows ?? []).filter(row => row && row.id != null);
  if (valid.length === 0) return null;

  const active = valid.filter(row =>
    isPublicPageSubscriptionInWindow(row, now),
  );
  const chosen = (active.length > 0 ? active : valid)
    .slice()
    .sort(
      (a, b) =>
        toDateSafe(b.endDate).getTime() - toDateSafe(a.endDate).getTime(),
    )[0];

  const start = toDateSafe(chosen.startDate);
  const end = toDateSafe(chosen.endDate);
  const display: PublicPageSubscriptionDisplayStatus =
    active.length > 0 && isPublicPageSubscriptionInWindow(chosen, now)
      ? 'active'
      : chosen.status === UserSubscriptionStatus.ACTIVE && start > now
        ? 'scheduled'
        : 'expired';

  return {
    id: String(chosen.id),
    planId: String(chosen.subscriptionPlanId),
    planKey: chosen.subscriptionPlan?.planKey ?? null,
    planName: chosen.subscriptionPlan?.name ?? '',
    // Decimal columns may be returned by MySQL as strings; identify the trial
    // by its stable plan key, not by strict numeric equality.
    isFreeTrial:
      chosen.subscriptionPlan?.planKey === PUBLIC_PAGE_TRIAL_PLAN_KEY,
    price: Number(chosen.price ?? 0),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status: String(chosen.status),
    display,
  };
}

/** گروه‌بندی رکوردها بر اساس userId و خلاصهٔ هر کاربر. */
export function summarizePublicPageSubscriptionsByUser(
  rows: UserSubscription[] | null | undefined,
  now: Date = new Date(),
): Map<number, PublicPageSubscriptionSummary> {
  const byUser = new Map<number, UserSubscription[]>();
  for (const row of rows ?? []) {
    const userId = Number(row.userId);
    if (!Number.isInteger(userId) || userId < 1) continue;
    const list = byUser.get(userId) ?? [];
    list.push(row);
    byUser.set(userId, list);
  }

  const result = new Map<number, PublicPageSubscriptionSummary>();
  for (const [userId, list] of byUser) {
    const summary = summarizePublicPageSubscriptions(list, now);
    if (summary) result.set(userId, summary);
  }
  return result;
}
