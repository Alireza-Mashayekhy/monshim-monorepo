import { Compass, Home, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/site-config';

/**
 * ۴۰۴ سراسری سایت.
 *
 * قبل از این فایل، هیچ `not-found.tsx` در ریشهٔ `app/` نبود و در عمل هیچ ۴۰۴
 * واقعی به کاربر/خزنده نمی‌رسید: `proxy.ts` هر مسیر ناشناس را با ۳۰۷ به
 * `/login` می‌فرستاد. اکنون مسیرهای ناموجود به روتر Next می‌رسند و این صفحه با
 * **کد وضعیت ۴۰۴ واقعی** رندر می‌شود (Server Component، بدون جاوااسکریپت
 * اضافی).
 *
 * `robots: index: false` هم صریح گذاشته شده تا حتی اگر روزی این صفحه از مسیری
 * غیر از ۴۰۴ رندر شود، هرگز ایندکس نشود.
 */
export const metadata: Metadata = {
  title: 'صفحه پیدا نشد',
  description:
    'صفحه‌ای که به دنبال آن بودید در منشیم پیدا نشد. از صفحهٔ اصلی یا فهرست آرایشگاه‌ها ادامه دهید.',
  robots: { index: false, follow: true },
};

const QUICK_LINKS = [
  {
    href: '/providers',
    label: 'فهرست آرایشگاه‌ها',
    hint: 'آرایشگاه‌های فعال را ببینید و نوبت بگیرید',
    icon: Search,
  },
  {
    href: '/blog',
    label: 'بلاگ منشیم',
    hint: 'مقاله‌ها و راهنماهای مدیریت سالن',
    icon: Compass,
  },
  {
    href: '/',
    label: 'صفحهٔ اصلی',
    hint: 'معرفی منشیم و امکانات آن',
    icon: Home,
  },
] as const;

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main
        id="main-content"
        className="custom-container flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center"
      >
        <p
          aria-hidden="true"
          className="text-6xl font-black leading-none text-primary/25 sm:text-7xl"
        >
          ۴۰۴
        </p>

        <div className="space-y-3">
          <h1 className="text-xl font-black text-foreground sm:text-2xl">
            این صفحه پیدا نشد
          </h1>
          <p className="mx-auto max-w-md text-sm leading-7 text-muted-foreground">
            نشانی واردشده وجود ندارد یا این صفحه جابه‌جا شده است. می‌توانید از
            یکی از مسیرهای زیر ادامه دهید.
          </p>
        </div>

        <ul className="grid w-full max-w-2xl gap-3 text-start sm:grid-cols-3">
          {QUICK_LINKS.map(({ href, label, hint, icon: Icon }) => (
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

        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/providers">دیدن آرایشگاه‌ها</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">بازگشت به صفحهٔ اصلی</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          اگر فکر می‌کنید این یک خطاست، به{' '}
          <a
            href={`mailto:info@${new URL(siteConfig.url).hostname.replace(/^www\./, '')}`}
            className="text-primary underline underline-offset-4"
          >
            پشتیبانی منشیم
          </a>{' '}
          اطلاع دهید.
        </p>
      </main>
    </div>
  );
}
