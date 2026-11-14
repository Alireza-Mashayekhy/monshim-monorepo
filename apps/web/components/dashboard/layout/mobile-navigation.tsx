'use client';

import { Store } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { getFullImageUrl } from '@/lib/utils';
import { useMyBarberProfile } from '@/services/features/barber/hooks';
import { useAuthStore } from '@/store/auth.store';

import BottomNavigation from './bottom-navigation';
import HelpLink from './help-link';
import MoreMenu from './more-menu';

export default function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const { user } = useAuthStore();

  const { data: barberProfile } = useMyBarberProfile();
  const salonName = barberProfile?.data?.salonName;

  /**
   * عکس پروفایل آرایشگر (همان «عکس کاربر» که در صفحهٔ پروفایل آپلود می‌شود).
   *
   * `unoptimized`: این تصویر ۴۰ پیکسلی است و بهینه‌ساز تصویر Next هیچ سودی
   * برایش ندارد؛ در عوض اگر هاست تصویر در `images.remotePatterns` نباشد،
   * بهینه‌ساز پاسخ ۴۰۰ می‌دهد و آواتار خالی می‌ماند. با `unoptimized` درخواست
   * مستقیم به همان origin بک‌اند می‌رود.
   */
  const uploadedImage = getFullImageUrl(barberProfile?.data?.profileImage);

  // آدرسی که بارگذاری‌اش شکست خورده؛ نگه‌داشتن «خودِ آدرس» (نه یک boolean)
  // باعث می‌شود بعد از آپلود عکس جدید، به‌طور خودکار دوباره تلاش شود.
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const salonImage =
    uploadedImage && uploadedImage !== failedImageSrc ? uploadedImage : null;

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 h-16 bg-primary-3/90 backdrop-blur-xl border-b border-primary/10">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative w-10 h-10 shrink-0 rounded-full bg-primary-2 text-primary flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-primary/20 overflow-hidden">
              {salonImage ? (
                <Image
                  src={salonImage}
                  alt={salonName || 'سالن'}
                  fill
                  sizes="40px"
                  unoptimized
                  className="object-cover"
                  onError={() => setFailedImageSrc(salonImage)}
                />
              ) : (
                <Store size={18} />
              )}
            </div>
            <div className="min-w-0 text-right">
              <p className="text-sm font-black text-gray-900 tracking-tight truncate">
                {salonName || 'داشبورد آرایشگر'}
              </p>

              <p className="text-[11px] text-gray-400 font-medium truncate">
                {user?.fullName ? `سلام ${user.fullName} 👋` : 'سلام 👋'}
              </p>
            </div>
          </div>

          <HelpLink />
        </div>
      </header>

      <MoreMenu open={open} onOpenChange={setOpen} />

      <BottomNavigation moreOpen={open} onMoreClick={() => setOpen(true)} />
    </>
  );
}
