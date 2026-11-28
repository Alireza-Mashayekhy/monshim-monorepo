'use client';

import { Loader2, Pencil, Plus, TicketPercent, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DiscountDatePicker } from '@/components/admin/settings/discount-date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/lib/api-error';
import { isoToJalali, jalaliToIso } from '@/lib/date-utils';
import { toPersianDigits } from '@/lib/utils';
import {
  DiscountApplicableTo,
  PublicPageDiscount,
} from '@/services/features/public-page/admin-api';
import {
  useCreatePublicPageDiscount,
  useDeletePublicPageDiscount,
  usePublicPageDiscounts,
  useUpdatePublicPageDiscount,
} from '@/services/features/public-page/admin-hooks';

/** حالتِ انتخابِ «نوع محدودیت استفاده» در فرم */
type LimitPreset = 'unlimited' | 'per-user-1' | 'single' | 'custom';

const APPLICABLE_OPTIONS: Array<{
  value: DiscountApplicableTo;
  label: string;
}> = [
  { value: 'PUBLIC_PAGE', label: 'فقط صفحهٔ اختصاصی' },
  { value: 'SUBSCRIPTION', label: 'فقط اشتراک پیامکی' },
  { value: 'BOTH', label: 'هر دو (صفحهٔ اختصاصی و اشتراک پیامکی)' },
];

const LIMIT_OPTIONS: Array<{ value: LimitPreset; label: string }> = [
  { value: 'unlimited', label: 'نامحدود' },
  { value: 'per-user-1', label: 'هر کاربر ۱ بار' },
  { value: 'single', label: 'کلاً ۱ بار (تک‌مصرف)' },
  { value: 'custom', label: 'سفارشی' },
];

const APPLICABLE_LABELS: Record<DiscountApplicableTo, string> = {
  PUBLIC_PAGE: 'صفحهٔ اختصاصی',
  SUBSCRIPTION: 'اشتراک پیامکی',
  BOTH: 'هر دو',
};

/** بازسازی حالتِ محدودیت از روی رکورد (برای پرکردن فرمِ ویرایش) */
function limitPresetOf(discount: PublicPageDiscount): LimitPreset {
  if (discount.maxTotalUses == null && discount.maxUsesPerUser == null) {
    return 'unlimited';
  }
  if (discount.maxTotalUses === 1 && discount.maxUsesPerUser === 1) {
    return 'single';
  }
  if (discount.maxTotalUses == null && discount.maxUsesPerUser === 1) {
    return 'per-user-1';
  }
  return 'custom';
}

/** برچسب قانون استفاده؛ مثال‌ها: «نامحدود»، «هر نفر ۱ بار»، «سقف کل ۱۰» */
function usageRuleLabel(discount: PublicPageDiscount): string {
  const parts: string[] = [];
  if (discount.maxUsesPerUser === 1) {
    parts.push('هر نفر ۱ بار');
  } else if (discount.maxUsesPerUser != null) {
    parts.push(`هر نفر ${toPersianDigits(discount.maxUsesPerUser)} بار`);
  }
  if (discount.maxTotalUses != null) {
    parts.push(`سقف کل ${toPersianDigits(discount.maxTotalUses)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'نامحدود';
}

/** برچسب مصرف؛ مثال‌ها: «مصرف‌شده: ۳ از ۱۰»، «تعداد استفاده: ۵ بار» */
function usageCountLabel(discount: PublicPageDiscount): string | null {
  if (discount.maxTotalUses != null) {
    return `مصرف‌شده: ${toPersianDigits(discount.usedCount)} از ${toPersianDigits(discount.maxTotalUses)}`;
  }
  if (discount.usedCount > 0) {
    return `تعداد استفاده: ${toPersianDigits(discount.usedCount)} بار`;
  }
  return null;
}

/** The calendar represents the Tehran civil date regardless of the browser timezone. */
function toJalaliDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (name: string) =>
    parts.find(item => item.type === name)?.value ?? '';
  return isoToJalali(`${part('year')}-${part('month')}-${part('day')}`);
}

export default function PublicPageDiscounts() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);
  const [code, setCode] = useState('');
  const [percentOff, setPercentOff] = useState('');
  const [applicableTo, setApplicableTo] =
    useState<DiscountApplicableTo>('PUBLIC_PAGE');
  const [limitPreset, setLimitPreset] = useState<LimitPreset>('unlimited');
  const [maxTotalUses, setMaxTotalUses] = useState('');
  const [maxUsesPerUser, setMaxUsesPerUser] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [originalDates, setOriginalDates] = useState<{
    startsAt: string | null;
    expiresAt: string | null;
  } | null>(null);
  /** وقتی پر است، فرم در حالت «ویرایش» همین کد است */
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = usePublicPageDiscounts();
  const create = useCreatePublicPageDiscount();
  const update = useUpdatePublicPageDiscount();
  const remove = useDeletePublicPageDiscount();
  const discounts = data?.data ?? [];

  const resetForm = () => {
    setEditingId(null);
    setCode('');
    setPercentOff('');
    setApplicableTo('PUBLIC_PAGE');
    setLimitPreset('unlimited');
    setMaxTotalUses('');
    setMaxUsesPerUser('');
    setStartsAt('');
    setExpiresAt('');
    setOriginalDates(null);
  };

  const startEdit = (discount: PublicPageDiscount) => {
    setEditingId(discount.id);
    setCode(discount.code);
    setPercentOff(String(discount.percentOff));
    setApplicableTo(discount.applicableTo ?? 'PUBLIC_PAGE');
    setLimitPreset(limitPresetOf(discount));
    setMaxTotalUses(
      discount.maxTotalUses != null ? String(discount.maxTotalUses) : '',
    );
    setMaxUsesPerUser(
      discount.maxUsesPerUser != null ? String(discount.maxUsesPerUser) : '',
    );
    setStartsAt(toJalaliDate(discount.startsAt));
    setExpiresAt(toJalaliDate(discount.expiresAt));
    setOriginalDates({
      startsAt: discount.startsAt ?? null,
      expiresAt: discount.expiresAt,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const percent = Number(percentOff);
    if (!/^[A-Z0-9_-]{3,32}$/.test(cleanCode)) {
      toast.error('کد باید ۳ تا ۳۲ حرف انگلیسی، عدد، خط تیره یا زیرخط باشد');
      return;
    }
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      toast.error('درصد تخفیف باید عددی بین ۱ تا ۱۰۰ باشد');
      return;
    }

    // ترجمهٔ «نوع محدودیت» به سقف‌های عددی (null = نامحدود)
    let total: number | null = null;
    let perUser: number | null = null;
    if (limitPreset === 'per-user-1') {
      perUser = 1;
    } else if (limitPreset === 'single') {
      total = 1;
      perUser = 1;
    } else if (limitPreset === 'custom') {
      if (maxTotalUses.trim()) {
        const value = Number(maxTotalUses);
        if (!Number.isInteger(value) || value < 1) {
          toast.error('سقف کل استفاده باید عدد صحیح مثبت باشد');
          return;
        }
        total = value;
      }
      if (maxUsesPerUser.trim()) {
        const value = Number(maxUsesPerUser);
        if (!Number.isInteger(value) || value < 1) {
          toast.error('سقف استفادهٔ هر کاربر باید عدد صحیح مثبت باشد');
          return;
        }
        perUser = value;
      }
      if (total == null && perUser == null) {
        toast.error(
          'در حالت «سفارشی» حداقل یکی از سقف‌ها را وارد کنید یا «نامحدود» را انتخاب کنید',
        );
        return;
      }
    }

    const startDate = startsAt ? jalaliToIso(startsAt) : null;
    const endDate = expiresAt ? jalaliToIso(expiresAt) : null;
    if ((startsAt && !startDate) || (expiresAt && !endDate)) {
      toast.error('تاریخ اعتبار نامعتبر است');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      toast.error('تاریخ پایان اعتبار باید بعد از تاریخ شروع باشد');
      return;
    }

    const payload = {
      code: cleanCode,
      percentOff: percent,
      applicableTo,
      maxTotalUses: total,
      maxUsesPerUser: perUser,
      // Date-only values are interpreted by the API as Tehran day boundaries.
      // Preserve exact instants on unrelated edits of existing records.
      startsAt:
        originalDates && startsAt === toJalaliDate(originalDates.startsAt)
          ? originalDates.startsAt
          : startDate,
      expiresAt:
        originalDates && expiresAt === toJalaliDate(originalDates.expiresAt)
          ? originalDates.expiresAt
          : endDate,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...payload });
        toast.success('کد تخفیف به‌روزرسانی شد');
      } else {
        await create.mutateAsync(payload);
        toast.success('کد تخفیف با موفقیت ساخته شد');
      }
      resetForm();
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          editingId ? 'ویرایش کد تخفیف ناموفق بود' : 'ساخت کد تخفیف ناموفق بود',
        ),
      );
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await update.mutateAsync({ id, isActive: !isActive });
      toast.success(isActive ? 'کد تخفیف غیرفعال شد' : 'کد تخفیف فعال شد');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'تغییر وضعیت کد ناموفق بود'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('این کد تخفیف حذف شود؟')) return;
    try {
      await remove.mutateAsync(id);
      if (editingId === id) resetForm();
      toast.success('کد تخفیف حذف شد');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'حذف کد تخفیف ناموفق بود'));
    }
  };

  return (
    <section
      className="rounded-[28px] border bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]"
      dir="rtl"
    >
      <div className="flex items-center gap-3 border-b border-gray-100 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-2 text-primary">
          <TicketPercent size={18} />
        </div>
        <div>
          <h2 className="text-sm font-black text-gray-900">
            مدیریت کدهای تخفیف
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            ساخت کدهای درصدی برای خرید صفحهٔ اختصاصی و اشتراک پیامکی آرایشگاه
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-3 border-b border-gray-100 p-5 sm:grid-cols-2"
      >
        <Input
          dir="ltr"
          value={code}
          maxLength={32}
          autoComplete="off"
          placeholder="مثال: AUTUMN20"
          onChange={event =>
            setCode(event.target.value.replace(/\s/g, '').toUpperCase())
          }
          aria-label="کد تخفیف"
        />
        <div className="relative">
          <Input
            dir="rtl"
            type="number"
            min={1}
            max={100}
            value={percentOff}
            placeholder="درصد تخفیف"
            onChange={event => setPercentOff(event.target.value)}
            aria-label="درصد تخفیف"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            ٪
          </span>
        </div>

        <Select
          value={applicableTo}
          onValueChange={value =>
            setApplicableTo(value as DiscountApplicableTo)
          }
        >
          <SelectTrigger className="w-full bg-white" aria-label="کاربرد کد">
            <SelectValue placeholder="کاربرد کد" />
          </SelectTrigger>
          <SelectContent>
            {APPLICABLE_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={limitPreset}
          onValueChange={value => setLimitPreset(value as LimitPreset)}
        >
          <SelectTrigger
            className="w-full bg-white"
            aria-label="محدودیت استفاده"
          >
            <SelectValue placeholder="محدودیت استفاده" />
          </SelectTrigger>
          <SelectContent>
            {LIMIT_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {limitPreset === 'custom' && (
          <>
            <Input
              dir="ltr"
              type="number"
              min={1}
              value={maxTotalUses}
              placeholder="سقف کل استفاده (اختیاری)"
              onChange={event => setMaxTotalUses(event.target.value)}
              aria-label="سقف کل استفاده"
            />
            <Input
              dir="ltr"
              type="number"
              min={1}
              value={maxUsesPerUser}
              placeholder="سقف استفادهٔ هر کاربر (اختیاری)"
              onChange={event => setMaxUsesPerUser(event.target.value)}
              aria-label="سقف استفاده هر کاربر"
            />
          </>
        )}

        <DiscountDatePicker
          label="از تاریخ"
          value={startsAt}
          onChange={setStartsAt}
        />
        <DiscountDatePicker
          label="تا تاریخ"
          value={expiresAt}
          onChange={setExpiresAt}
        />
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={create.isPending || update.isPending}
            className="flex-1"
          >
            {create.isPending || update.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : editingId ? (
              <Pencil size={16} />
            ) : (
              <Plus size={16} />
            )}
            {editingId ? 'ذخیره تغییرات' : 'افزودن کد'}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={resetForm}>
              <X size={16} />
              انصراف
            </Button>
          )}
        </div>
      </form>

      <div className="divide-y divide-gray-100 px-3">
        {isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          /**
           * اگر دریافت فهرست کدها شکست بخورد، نباید وضعیت «خالی» نمایش داده شود؛
           * پیش‌تر خطای بک‌اند پشت پیام «هنوز کد تخفیفی ساخته نشده است» پنهان
           * می‌شد و مدیر فقط هنگام «افزودن کد» با خطای ۵۰۰ مواجه می‌شد.
           */
          <div className="p-6 text-center">
            <p className="text-sm font-semibold text-rose-700">
              {getApiErrorMessage(error, 'دریافت کدهای تخفیف ناموفق بود.')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refetch()}
            >
              تلاش دوباره
            </Button>
          </div>
        ) : discounts.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            هنوز کد تخفیفی ساخته نشده است.
          </p>
        ) : (
          discounts.map(discount => {
            const usageLabel = usageCountLabel(discount);
            return (
              <div
                key={discount.id}
                className="flex flex-wrap items-center gap-2 p-4"
              >
                <div className="min-w-36 flex-1">
                  <p
                    dir="ltr"
                    className="w-fit font-mono text-sm font-black text-gray-900"
                  >
                    {discount.code}
                  </p>
                </div>

                {/* درصد تخفیف */}
                <Badge className="bg-primary-2 text-primary hover:bg-primary-2">
                  {toPersianDigits(discount.percentOff)}٪ تخفیف
                </Badge>

                {/* کاربرد (محل استفاده) */}
                <Badge variant="secondary">
                  {APPLICABLE_LABELS[discount.applicableTo ?? 'PUBLIC_PAGE']}
                </Badge>

                {/* قانون استفاده + مصرف فعلی */}
                <Badge
                  variant="outline"
                  className="border-primary/30 text-primary"
                >
                  {usageRuleLabel(discount)}
                </Badge>
                {usageLabel && (
                  <span className="text-[11px] font-bold text-gray-400">
                    {usageLabel}
                  </span>
                )}

                <span className="text-[11px] font-bold text-gray-400">
                  از:{' '}
                  {discount.startsAt
                    ? toPersianDigits(toJalaliDate(discount.startsAt))
                    : 'بدون محدودیت'}{' '}
                  · تا:{' '}
                  {discount.expiresAt
                    ? toPersianDigits(toJalaliDate(discount.expiresAt))
                    : 'بدون انقضا'}
                </span>
                {now !== null &&
                discount.startsAt &&
                new Date(discount.startsAt).getTime() > now ? (
                  <Badge variant="secondary">هنوز شروع نشده</Badge>
                ) : now !== null &&
                  discount.expiresAt &&
                  new Date(discount.expiresAt).getTime() < now ? (
                  <Badge variant="secondary">منقضی‌شده</Badge>
                ) : null}

                {discount.isActive ? (
                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    فعال
                  </Badge>
                ) : (
                  <Badge variant="secondary">غیرفعال</Badge>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    void toggleActive(discount.id, discount.isActive)
                  }
                >
                  {discount.isActive ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(discount)}
                >
                  <Pencil size={14} className="ml-1" />
                  ویرایش
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`حذف ${discount.code}`}
                  disabled={remove.isPending}
                  onClick={() => void handleDelete(discount.id)}
                >
                  <Trash2 size={16} className="text-red-500" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
