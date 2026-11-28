'use client';

import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BarberResponse } from '@/services/features/barber/types';

import { SlugEditDialog } from './slug-edit-dialog';

export function PublicPageSetup({ barber }: { barber: BarberResponse }) {
  const state = barber.publicPageAvailability;
  const reasons: Record<string, string> = {
    ACCOUNT_INACTIVE: 'حساب غیرفعال است',
    NOT_APPROVED: 'پروفایل تأیید نشده است',
    HIDDEN: 'نمایش عمومی غیرفعال است',
    NO_ACTIVE_SERVICE: 'خدمت فعالی ثبت نشده است',
    NO_ACTIVE_SUBSCRIPTION: 'اشتراک فعال ندارد',
    SUBSCRIPTION_UNKNOWN: 'وضعیت اشتراک قابل بررسی نیست',
  };
  if (!barber.slug) {
    return (
      <div className="mt-2 space-y-1">
        <span className="inline-block rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
          راه‌اندازی نشده (بدون اسلاگ)
        </span>
        {barber.publicPageSubscription?.display === 'active' && (
          <p className="text-xs text-muted-foreground">
            اشتراک فعال است ولی آرایشگر هنوز اسلاگ نساخته
          </p>
        )}
        <SlugEditDialog barber={barber} />
      </div>
    );
  }
  const active = state?.status === 'ACTIVE';
  const unknown = !state || state.status === 'UNKNOWN';
  const copy = async () => {
    if (!barber.publicUrl) return;
    try {
      await navigator.clipboard.writeText(barber.publicUrl);
      toast.success('آدرس صفحه کپی شد.');
    } catch {
      toast.error('کپی آدرس انجام نشد.');
    }
  };
  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          active
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-800',
        )}
      >
        {active
          ? 'راه‌اندازی شده (فعال)'
          : unknown
            ? 'اسلاگ ثبت‌شده (وضعیت نامشخص)'
            : 'اسلاگ ثبت‌شده (صفحه غیرفعال)'}
      </span>
      {state?.reason && reasons[state.reason] && (
        <span className="text-xs text-muted-foreground">
          {reasons[state.reason]}
        </span>
      )}
      <span dir="ltr" className="text-xs break-all">
        /provider/{barber.slug}
      </span>
      {barber.publicUrl && (
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void copy()}
            aria-label={`کپی آدرس ${barber.salonName}`}
          >
            <Copy size={14} /> کپی لینک
          </Button>
          {active && (
            <Button asChild size="sm" variant="outline">
              <a
                href={barber.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`باز کردن صفحه ${barber.salonName}`}
              >
                <ExternalLink size={14} /> باز کردن
              </a>
            </Button>
          )}
        </div>
      )}
      <SlugEditDialog barber={barber} />
    </div>
  );
}
