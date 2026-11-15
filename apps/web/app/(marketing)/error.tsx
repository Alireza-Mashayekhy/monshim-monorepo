'use client';

import { AlertTriangle, Compass, Home, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/site-config';

/**
 * مرزِ خطای صفحه‌های عمومی (مارکتینگ/بلاگ/پروفایل).
 *
 * پیش از این فایل، تنها `global-error.tsx` وجود داشت که صفحهٔ پیش‌فرض و
 * انگلیسیِ Next را رندر می‌کرد: بدون RTL، بدون هدر/فوتر و بدون هیچ راهی برای
 * بازگشت. اگر بک‌اند بلاگ در همان لحظه در دسترس نبود، کاربر مقالهٔ موجود را
 * به‌جای محتوا، یک صفحهٔ خطای انگلیسی می‌دید.
 *
 * نکته‌های عمدی:
 *   • کد وضعیت همچنان ۵۰۰ است (خطای موقت) — این برای سئو درست است؛ تبدیل
 *     خطای سرور به ۴۰۴ باعث حذف مقالهٔ سالم از ایندکس می‌شود.
 *   • `noindex` تضمین می‌کند صفحهٔ خطا هرگز ایندکس نشود.
 *   • هیچ SDK سنگینی import نمی‌شود؛ گزارش خطا از loaderِ سبکِ Sentry است.
 *   • دکمهٔ «تلاش دوباره» با `reset()` بدون بارگذاری کل صفحه.
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // گزارش سمت کلاینت؛ شناسهٔ خطا (digest) برای پیگیری در لاگ سرور کافی است.
    void import('@/lib/sentry-client')
      .then(({ captureException }) => captureException(error))
      .catch(() => undefined);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col bg-background">
      <meta name="robots" content="noindex, follow" />
      <main
        id="main-content"
        className="custom-container flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center"
      >
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"
        >
          <AlertTriangle className="size-7" />
        </span>

        <div className="space-y-3">
          <h1 className="text-xl font-black text-foreground sm:text-2xl">
            فعلاً نمی‌توانیم این صفحه را نشان دهیم
          </h1>
          <p className="mx-auto max-w-md text-sm leading-7 text-muted-foreground">
            یک خطای موقت رخ داده است؛ محتوای این صفحه پاک نشده. چند لحظه بعد
            دوباره تلاش کنید. اگر تکرار شد، به پشتیبانی منشیم اطلاع دهید.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => reset()}>
            تلاش دوباره
          </Button>
          <Button asChild variant="outline">
            <Link href="/">صفحهٔ اصلی</Link>
          </Button>
        </div>

        <ul className="grid w-full max-w-2xl gap-3 text-start sm:grid-cols-3">
          {[
            {
              href: '/providers',
              label: 'فهرست آرایشگاه‌ها',
              hint: 'آرایشگاه‌های فعال را ببینید',
              icon: Search,
            },
            {
              href: '/blog',
              label: 'بلاگ منشیم',
              hint: 'راهنماهای مدیریت سالن',
              icon: Compass,
            },
            {
              href: '/online-provider-booking',
              label: 'رزرو آنلاین',
              hint: 'نوبت‌دهی اینترنتی سالن',
              icon: Home,
            },
          ].map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full flex-col gap-1.5 rounded-2xl border border-border bg-white p-4 transition-colors hover:border-primary"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Icon aria-hidden="true" className="size-4 text-primary" />
                  {label}
                </span>
                <span className="text-xs leading-6 text-muted-foreground">
                  {hint}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          پشتیبانی:{' '}
          <a
            href={`mailto:info@${new URL(siteConfig.url).hostname.replace(/^www\./, '')}`}
            className="text-primary underline underline-offset-4"
          >
            info@{new URL(siteConfig.url).hostname.replace(/^www\./, '')}
          </a>
        </p>
      </main>
    </div>
  );
}
