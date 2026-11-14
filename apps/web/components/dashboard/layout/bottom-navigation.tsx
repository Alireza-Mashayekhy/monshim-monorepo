'use client';

import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { bottomNavRoutes, isRouteActive, moreMenuRoutes } from './routes';

interface Props {
  moreOpen: boolean;
  onMoreClick: () => void;
}

export default function BottomNavigation({ moreOpen, onMoreClick }: Props) {
  const pathname = usePathname();

  // «بیشتر» وقتی روشن است که منو باز باشد یا صفحهٔ فعلی یکی از آیتم‌های آن باشد.
  const moreActive =
    moreOpen || moreMenuRoutes.some(r => isRouteActive(pathname, r.href));

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 px-3 pb-3">
      <div className="h-[68px] rounded-2xl bg-white/95 border shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-5 h-full">
          {bottomNavRoutes.map(item => {
            const Icon = item.icon;

            const active = isRouteActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <div
                  className={cn(
                    'rounded-xl flex items-center justify-center transition-all',
                    active ? 'bg-primary/10' : 'bg-transparent',
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.4 : 2}
                    className={cn(active ? 'text-primary' : 'text-slate-400')}
                  />
                </div>

                <span
                  className={cn(
                    'text-[10px] font-medium',
                    active ? 'text-primary' : 'text-slate-400',
                  )}
                >
                  {item.title}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={onMoreClick}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls="dashboard-more-menu"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <div
              className={cn(
                'rounded-xl flex items-center justify-center transition-all',
                moreActive ? 'bg-primary/10' : 'bg-transparent',
              )}
            >
              <MoreHorizontal
                size={21}
                strokeWidth={moreActive ? 2.4 : 2}
                className={cn(moreActive ? 'text-primary' : 'text-slate-400')}
              />
            </div>

            <span
              className={cn(
                'text-[10px] font-medium',
                moreActive ? 'text-primary' : 'text-slate-400',
              )}
            >
              بیشتر
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}
