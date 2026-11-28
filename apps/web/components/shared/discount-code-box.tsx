'use client';

import { Loader2, TicketPercent, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api-error';
import { toPersianDigits } from '@/lib/utils';
import { quotePublicPageDiscount } from '@/services/features/public-page/api';
import { PublicPageDiscountQuote } from '@/services/features/public-page/types';

/** هدفِ خریدی که کد تخفیف برایش اعمال می‌شود */
export type DiscountTarget = 'PUBLIC_PAGE' | 'SUBSCRIPTION';

/** قیمت نهاییِ استعلام‌شدهٔ کد، به‌ازای هر پلن (شناسه پلن → استعلام) */
export type DiscountQuotesByPlan = Record<string, PublicPageDiscountQuote>;

export interface AppliedDiscount {
  code: string;
  percentOff: number;
  quotes: DiscountQuotesByPlan;
}

interface DiscountCodeBoxProps {
  target: DiscountTarget;
  /**
   * همهٔ پلن‌های قابل خریدِ همین هدف. کد هنگام «بررسی و اعمال» برای همهٔ
   * پلن‌ها هم‌زمان استعلام می‌شود تا با تعویض تب/مدت، قیمت نهایی هر پلن
   * از قبل موجود باشد.
   */
  plans: Array<{ id: string }>;
  applied: AppliedDiscount | null;
  onAppliedChange: (applied: AppliedDiscount | null) => void;
}

/**
 * باکس مشترک «کد تخفیف» داشبورد آرایشگر — هم برای خرید صفحهٔ اختصاصی
 * (target=PUBLIC_PAGE) و هم اشتراک پیامکی (target=SUBSCRIPTION).
 *
 * فقط کد + هدف + شناسه پلن به بک‌اند می‌رود؛ قیمت واقعی هر پلن، مبلغ
 * تخفیف و شرط‌های سقف استفاده در بک‌اند سنجیده می‌شود. اگر استعلام یکی از
 * پلن‌ها شکست بخورد (کد نامعتبر/منقضی/سقف تمام)، هیچ تخفیفی اعمال نمی‌شود.
 */
export function DiscountCodeBox({
  target,
  plans,
  applied,
  onAppliedChange,
}: DiscountCodeBoxProps) {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async (event: FormEvent) => {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean || plans.length === 0) return;

    setPending(true);
    setError(null);
    try {
      const results = await Promise.all(
        plans.map(plan =>
          quotePublicPageDiscount({
            code: clean,
            target,
            planId: plan.id,
          }),
        ),
      );
      const quotes: DiscountQuotesByPlan = {};
      plans.forEach((plan, index) => {
        quotes[plan.id] = results[index].data;
      });
      const first = results[0].data;
      onAppliedChange({
        code: first.code,
        percentOff: first.percentOff,
        quotes,
      });
      setCode('');
      toast.success(
        `کد تخفیف ${toPersianDigits(first.percentOff)}٪ روی پلن‌ها اعمال شد`,
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'کد تخفیف نامعتبر است'));
    } finally {
      setPending(false);
    }
  };

  const handleRemove = () => {
    onAppliedChange(null);
    setError(null);
    setCode('');
  };

  return (
    <div
      dir="rtl"
      className="rounded-[28px] border bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-2 text-primary">
          <TicketPercent size={19} />
        </div>
        <div>
          <h3 className="text-sm font-black text-gray-900">کد تخفیف</h3>
          <p className="mt-0.5 text-[11px] font-medium text-gray-400">
            کد را وارد کنید؛ قیمت نهایی پلن‌ها با اعمال تخفیف نمایش داده می‌شود.
          </p>
        </div>
      </div>

      {applied ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary-2 bg-primary-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              dir="ltr"
              className="font-mono text-sm font-black text-gray-900"
            >
              {applied.code}
            </span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black text-white">
              {toPersianDigits(applied.percentOff)}٪ تخفیف
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-gray-500"
            onClick={handleRemove}
          >
            <X size={14} className="ml-1" />
            حذف کد
          </Button>
        </div>
      ) : (
        <form onSubmit={handleApply} className="mt-4 flex gap-2">
          <Input
            dir="ltr"
            value={code}
            maxLength={32}
            autoComplete="off"
            placeholder="مثال: AUTUMN20"
            className="flex-1 font-mono"
            onChange={event => {
              setCode(event.target.value.replace(/\s/g, '').toUpperCase());
              setError(null);
            }}
            aria-label="کد تخفیف"
          />
          <Button
            type="submit"
            disabled={pending || plans.length === 0}
            className="shrink-0"
          >
            {pending && <Loader2 size={16} className="animate-spin" />}
            بررسی و اعمال
          </Button>
        </form>
      )}

      {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
    </div>
  );
}
