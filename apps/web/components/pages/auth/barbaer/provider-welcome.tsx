'use client';

import { ChevronLeft, LayoutDashboard, PlayCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/site-config';
import { useAuthStore } from '@/store/auth.store';

/**
 * خوش‌آمدگویی آرایشگر تازه‌ثبت‌نام‌شده: انتخاب بین آموزش‌ها و داشبورد.
 * ظاهر هم‌خانوادهٔ صفحات ورود/ثبت‌نام (`AuthCardLayout`) است.
 */
export default function ProviderWelcome({
  dashboardHref,
}: {
  dashboardHref: string;
}) {
  // مقصدِ یک‌بارمصرفِ پس از ثبت‌نام کارش را کرده است.
  useEffect(() => {
    useAuthStore.getState().setPostAuthPath(null);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-slate-50/70 text-gray-800">
      <div className="pointer-events-none absolute top-0 right-0 left-0 -z-10 h-80 bg-gradient-to-b from-primary/15 via-teal-500/5 to-transparent" />
      <div className="pointer-events-none absolute -top-24 -right-24 -z-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-6 flex items-center gap-2">
          <Image
            loading="eager"
            src="/logo/logo.png"
            alt=""
            width={48}
            height={48}
          />
          <span className="text-2xl font-black tracking-tight text-gray-900">
            منشیم
          </span>
        </div>

        <div className="w-full rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-xl shadow-gray-200/60 md:p-8">
          <h1 className="text-xl font-black text-gray-900 md:text-2xl">
            به منشیم خوش آمدید!
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-gray-500">
            برای شروع کار با منشیم می‌توانید ابتدا با امکانات آن آشنا شوید یا
            مستقیماً وارد داشبورد خود شوید.
          </p>

          <div className="mt-7 space-y-3">
            <Button
              asChild
              size="lg"
              className="h-13 w-full rounded-2xl text-base font-bold shadow-lg shadow-primary/25 hover:bg-primary/90"
            >
              <Link href={siteConfig.routes.tutorials}>
                <PlayCircle className="size-5" aria-hidden />
                مشاهده آموزش‌ها
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-13 w-full rounded-2xl border-gray-200 text-base font-bold text-gray-700"
            >
              <Link href={dashboardHref}>
                <LayoutDashboard className="size-5" aria-hidden />
                ورود به داشبورد
                <ChevronLeft className="size-4 text-gray-400" aria-hidden />
              </Link>
            </Button>
          </div>

          <p className="mt-5 text-xs leading-6 text-gray-400">
            آموزش‌ها همیشه از آیکون راهنما در بالای داشبورد در دسترس‌اند.
          </p>
        </div>
      </main>

      <footer className="w-full border-t border-gray-100 py-4 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} منشیم — تمامی حقوق محفوظ است.
      </footer>
    </div>
  );
}
