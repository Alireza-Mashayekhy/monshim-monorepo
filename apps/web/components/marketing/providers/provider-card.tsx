import { MapPin, Scissors, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { getActivityTypeLabel } from '@/constants/activity-types';
import { publicImageUrlOrPlaceholder } from '@/lib/images';
import { formatFaNumber, toPersianDigits } from '@/lib/utils';
import type { PublicDirectoryCard } from '@/services/features/public-page/types';

/**
 * کارتِ آرایشگاه در فهرست عمومی (`/providers`).
 *
 * Server Component است و هیچ جاوااسکریپتی به کلاینت نمی‌فرستد. تمام کارت یک
 * لینک به آدرس **کانونیکال** پروفایل (`/provider/{slug}`) است تا خزنده و
 * کاربر هر دو یک مقصد داشته باشند؛ اگر روزی پروفایل به `noindex` برود،
 * لینک `follow` می‌ماند و صفحهٔ فهرست معتبر باقی می‌ماند.
 */
export default function ProviderCard({ card }: { card: PublicDirectoryCard }) {
  const location = [card.city?.name, card.province?.name]
    .filter(Boolean)
    .join('، ');
  const activityLabel = card.activityType
    ? getActivityTypeLabel(card.activityType)
    : null;

  return (
    <li className="h-full">
      <Link
        href={`/provider/${encodeURIComponent(card.slug)}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-white transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <Image
            src={publicImageUrlOrPlaceholder(card.profileImage)}
            alt={`تصویر سالن ${card.salonName}${location ? ` در ${location}` : ''}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <span className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-gray-900 shadow-sm backdrop-blur">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              {card.reviewCount > 0
                ? `${toPersianDigits(card.rating.toFixed(1))} (${toPersianDigits(card.reviewCount)})`
                : 'جدید'}
            </span>
            {activityLabel ? (
              <span className="rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                {activityLabel}
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="text-base font-black leading-7 text-foreground">
            {card.salonName}
          </h3>

          {location ? (
            <p className="flex items-start gap-1.5 text-xs leading-6 text-muted-foreground">
              <MapPin size={14} className="mt-1 shrink-0" aria-hidden="true" />
              {location}
            </p>
          ) : null}

          <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Scissors size={13} aria-hidden="true" />
              {toPersianDigits(card.servicesCount)} خدمت فعال
            </span>
            {card.minPrice != null ? (
              <span className="font-bold text-foreground">
                از {formatFaNumber(card.minPrice)} تومان
              </span>
            ) : null}
          </p>
        </div>
      </Link>
    </li>
  );
}
