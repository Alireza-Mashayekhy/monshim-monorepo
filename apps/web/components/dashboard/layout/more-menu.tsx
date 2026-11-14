'use client';

import { ChevronLeft, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

import { isRouteActive, moreMenuGroups, type MoreMenuItem } from './routes';

/** هم‌عرض با breakpoint `lg` که نوار پایین در آن پنهان می‌شود. */
const DESKTOP_QUERY = '(min-width: 1024px)';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * منوی «بیشتر» — Bottom Sheet روی موبایل و تبلت.
 *
 * بستن با کشیدن به پایین، لمس بیرون از شیت، کلید Escape و دکمهٔ بستن؛
 * قفل فوکوس و برگشت فوکوس به دکمهٔ «بیشتر» را خودِ Drawer (vaul) انجام می‌دهد.
 */
export default function MoreMenu({ open, onOpenChange }: Props) {
  const pathname = usePathname();

  // در دسکتاپ نوار پایین وجود ندارد (سایدبار همهٔ مسیرها را دارد)؛ اگر صفحه
  // با شیتِ باز بزرگ شد، شیت را می‌بندیم تا بدون دکمهٔ مرجع روی صفحه نماند.
  useEffect(() => {
    if (!open) return;

    const media = window.matchMedia(DESKTOP_QUERY);
    const closeOnDesktop = () => {
      if (media.matches) onOpenChange(false);
    };

    closeOnDesktop();
    media.addEventListener('change', closeOnDesktop);

    return () => media.removeEventListener('change', closeOnDesktop);
  }, [open, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        id="dashboard-more-menu"
        className={cn(
          'mx-auto sm:max-w-md',
          'data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:border-t-0',
          'shadow-[0_-12px_40px_rgba(15,23,42,0.10)]',
          // دستگیرهٔ پیش‌فرض Drawer برای این شیت ظریف‌تر می‌شود.
          '[&>div:first-child]:mt-2.5 [&>div:first-child]:h-1 [&>div:first-child]:w-10 [&>div:first-child]:bg-slate-200',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white px-5 pt-3 pb-2">
          <div className="min-w-0">
            <DrawerTitle className="text-base font-bold text-slate-900">
              بیشتر
            </DrawerTitle>
            <DrawerDescription className="mt-0.5 text-xs text-slate-500">
              سایر بخش‌های داشبورد
            </DrawerDescription>
          </div>

          <DrawerClose
            aria-label="بستن منو"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-slate-200"
          >
            <X size={18} aria-hidden />
          </DrawerClose>
        </div>

        <nav aria-label="سایر بخش‌های داشبورد" className="px-3 pt-1 pb-5">
          {moreMenuGroups.map((group, index) => {
            const headingId = `more-menu-group-${index}`;

            return (
              <section
                key={group.title}
                aria-labelledby={headingId}
                className={cn(index > 0 && 'mt-4')}
              >
                <h3
                  id={headingId}
                  className="px-3 pb-1.5 text-xs font-medium text-slate-400"
                >
                  {group.title}
                </h3>

                <ul className="space-y-1">
                  {group.items.map(item => (
                    <li key={item.href}>
                      <MoreMenuLink
                        item={item}
                        active={isRouteActive(pathname, item.href)}
                        onNavigate={() => onOpenChange(false)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}

interface MoreMenuLinkProps {
  item: MoreMenuItem;
  active: boolean;
  onNavigate: () => void;
}

function MoreMenuLink({ item, active, onNavigate }: MoreMenuLinkProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 outline-none',
        'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/50',
        active ? 'bg-primary-2' : 'hover:bg-slate-50 active:bg-slate-100',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-150',
          active
            ? 'bg-primary text-white'
            : 'bg-slate-100 text-slate-600 group-hover:bg-white group-hover:text-primary group-hover:ring-1 group-hover:ring-slate-200',
        )}
      >
        <Icon size={20} strokeWidth={2} aria-hidden />
      </span>

      <span className="min-w-0 flex-1 text-right">
        <span
          className={cn(
            'block truncate text-sm font-semibold',
            active ? 'text-primary' : 'text-slate-800',
          )}
        >
          {item.title}
        </span>

        {item.description && (
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {item.description}
          </span>
        )}
      </span>

      <ChevronLeft
        size={16}
        aria-hidden
        className={cn(
          'shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5',
          active ? 'text-primary' : 'text-slate-300',
        )}
      />
    </Link>
  );
}
