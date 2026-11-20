import { ArrowLeft, ArrowRight, Scissors, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import JsonLd from '@/components/marketing/json-ld';
import ProviderCard from '@/components/marketing/providers/provider-card';
import Breadcrumbs from '@/components/marketing/shared/breadcrumbs';
import { Button } from '@/components/ui/button';
import { fetchPublicApi } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';
import { toPersianDigits } from '@/lib/utils';
import type { PublicDirectoryPage } from '@/services/features/public-page/types';

/**
 * فهرست عمومی آرایشگاه‌ها — تنها مسیرِ «کشف» (discovery) که بدون ورود باز است.
 *
 * چرا این صفحه ساخته شد؟
 * ----------------------
 * تا پیش از این، تنها راهِ رسیدن به پروفایل آرایشگرها `sitemap` بود و همهٔ
 * دکمه‌های «پیدا کردن آرایشگاه» در سایت به `/panel/explore` می‌رفتند که برای
 * کاربر مهمان ۳۰۷ به `/login` می‌خورد (و `/login` هم در robots.txt مسدود است).
 * یعنی نه کاربر می‌توانست آرایشگاهی ببیند، نه خزنده مسیری برای رسیدن به
 * پروفایل‌ها داشت. این صفحه همان حلقهٔ گمشده است:
 *
 *   • عمومی و بدون ورود؛
 *   • SSR/ISR (۳۰۰ ثانیه) با همان تگ کشِ دادهٔ عمومی؛
 *   • فقط پروفایل‌هایی که واقعاً رندر می‌شوند (تأییدشده + فعال + اسلاگ +
 *     حداقل یک خدمت فعال) تا هیچ لینکی به ۴۰۴ داده نشود؛
 *   • صفحه‌بندی با آدرس پایدار و canonical مستقل برای هر صفحه.
 *
 * بالا/پایین‌بودن به تصمیم کسب‌وکار بستگی ندارد: این صفحه فقط دادهٔ عمومیِ
 * موجود را نمایش می‌دهد و هیچ صفحهٔ شهر/محله/خدمت تولید نمی‌کند.
 */
export const revalidate = 300;

const PER_PAGE = 12;
const BASE_PATH = '/providers';
const PAGE_TITLE = 'فهرست آرایشگاه‌ها و سالن‌های زیبایی';
const PAGE_DESCRIPTION =
  'آرایشگاه‌ها و سالن‌های زیبایی فعال در منشیم را ببینید؛ خدمات، قیمت‌ها، نمونه‌کارها و امتیاز هر سالن را مقایسه کنید و آنلاین نوبت بگیرید.';

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;
}

/** آدرس canonical هر صفحه؛ صفحهٔ اول بدون کوئری تا با لینک‌های داخلی یکی باشد. */
function pagePath(page: number) {
  return page > 1 ? `${BASE_PATH}?page=${page}` : BASE_PATH;
}

type PageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { page: rawPage } = await searchParams;
  const requestedPage = parsePage(rawPage);

  // canonical باید به صفحهٔ واقعی (پس از clamp بک‌اند به `totalPages`) اشاره
  // کند، نه شمارهٔ درخواستی که ممکن است از آخرین صفحه بزرگ‌تر باشد. در آن
  // حالت محتوای صفحهٔ آخر زیر URLِ `?page=999` با canonicalِ خودش نمایش داده
  // می‌شد — سیگنال محتوای تکراری برای گوگل. fetch کش‌شده است
  // (`revalidate: 300` + تگ مشترک) پس فراخوانی دوم در کامپوننت صفحه هزینه‌ای
  // ندارد. اگر API در دسترس نباشد، به شمارهٔ درخواستی برمی‌گردیم.
  const result = await fetchPublicApi<PublicDirectoryPage>(
    `/public-page/directory/page?page=${requestedPage}&perPage=${PER_PAGE}`,
  );
  const page = result?.pagination?.page ?? requestedPage;

  return buildPageMetadata({
    title: page > 1 ? `${PAGE_TITLE} — صفحهٔ ${toPersianDigits(page)}` : PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    path: pagePath(page),
  });
}

export default async function ProvidersPage({ searchParams }: PageProps) {
  const { page: rawPage } = await searchParams;
  const requestedPage = parsePage(rawPage);

  const result = await fetchPublicApi<PublicDirectoryPage>(
    `/public-page/directory/page?page=${requestedPage}&perPage=${PER_PAGE}`,
  );

  const cards = result?.data ?? [];
  const pagination = result?.pagination;
  const currentPage = pagination?.page ?? requestedPage;
  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total ?? cards.length;

  const pageUrl = `${siteConfig.url}${pagePath(currentPage)}`;

  /**
   * ItemList برای فهرست‌ها مجاز و مفید است (کمک به درک مجموعه)، اما فقط
   * آیتم‌هایی را اعلام می‌کند که واقعاً در همین صفحه دیده می‌شوند. هیچ
   * AggregateRating جعلی یا دادهٔ ساختگی اینجا ساخته نمی‌شود.
   */
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      inLanguage: 'fa-IR',
      isPartOf: { '@id': `${siteConfig.url}/#website` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteConfig.name, item: siteConfig.url },
        { '@type': 'ListItem', position: 2, name: 'فهرست آرایشگاه‌ها', item: `${siteConfig.url}${BASE_PATH}` },
      ],
    },
    ...(cards.length
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: PAGE_TITLE,
            numberOfItems: cards.length,
            itemListElement: cards.map((card, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: `${siteConfig.url}/provider/${encodeURIComponent(card.slug)}`,
              name: card.salonName,
            })),
          },
        ]
      : []),
  ];

  return (
    <>
      <JsonLd data={structuredData} />

      <Breadcrumbs
        items={[
          { href: '/', label: siteConfig.name },
          { href: BASE_PATH, label: 'فهرست آرایشگاه‌ها' },
        ]}
      />

      <section className="custom-container pb-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary-200/60 bg-white px-4 py-1.5 text-xs font-bold text-primary shadow-sm">
            <Search size={14} aria-hidden="true" />
            آرایشگاه‌های تأییدشدهٔ منشیم
          </p>
          <h1 className="text-[1.6rem] font-black leading-[1.7] text-foreground sm:text-3xl sm:leading-[1.6] lg:text-[2.35rem] lg:leading-[1.6]">
            فهرست آرایشگاه‌ها و سالن‌های زیبایی منشیم
          </h1>
          <p className="mx-auto mt-5 max-w-2xl leading-8 text-muted-foreground">
            هر آرایشگاه در منشیم یک صفحهٔ اختصاصی دارد: خدمات و قیمت‌ها،
            نمونه‌کارها، آدرس و امتیاز مشتریان. بدون ثبت‌نام ببینید و مقایسه
            کنید؛ برای قطعی‌کردن نوبت وارد حساب خود می‌شوید.
          </p>
        </div>
      </section>

      <section aria-labelledby="providers-list-heading" className="custom-container pb-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 id="providers-list-heading" className="text-lg font-black text-foreground">
            {total > 0
              ? `${toPersianDigits(total)} آرایشگاه فعال`
              : 'آرایشگاه‌ها'}
          </h2>
          <Link
            href="/provider-signup"
            className="text-sm font-bold text-primary hover:underline"
          >
            سالن دارید؟ صفحهٔ اختصاصی بسازید
          </Link>
        </div>

        {!result && (
          <p className="rounded-2xl border border-border bg-white p-6 text-sm leading-7 text-muted-foreground">
            دریافت فهرست آرایشگاه‌ها موقتاً ممکن نیست. لطفاً چند دقیقهٔ دیگر
            دوباره تلاش کنید.
          </p>
        )}

        {result && cards.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-2 text-primary">
              <Scissors size={26} aria-hidden="true" />
            </div>
            <h2 className="text-base font-black text-foreground">
              هنوز آرایشگاهی در این فهرست نیست
            </h2>
            <p className="max-w-md text-sm leading-7 text-muted-foreground">
              به‌محض فعال‌شدن صفحهٔ اختصاصی هر سالن، همین‌جا نمایش داده می‌شود.
              اگر سالن دارید، صفحهٔ خود را فعال کنید تا مشتری‌ها شما را پیدا
              کنند.
            </p>
            <Button asChild className="mt-2">
              <Link href="/provider-signup">ثبت سالن در منشیم</Link>
            </Button>
          </div>
        )}

        {cards.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => (
              <ProviderCard key={card.id} card={card} />
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="صفحه‌بندی فهرست آرایشگاه‌ها"
            className="mt-10 flex items-center justify-center gap-3"
          >
            {currentPage > 1 ? (
              <Button asChild variant="outline">
                <Link href={pagePath(currentPage - 1)} rel="prev">
                  <ArrowRight size={16} aria-hidden="true" />
                  صفحهٔ قبل
                </Link>
              </Button>
            ) : null}

            <span className="text-sm text-muted-foreground">
              صفحهٔ {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
            </span>

            {currentPage < totalPages ? (
              <Button asChild variant="outline">
                <Link href={pagePath(currentPage + 1)} rel="next">
                  صفحهٔ بعد
                  <ArrowLeft size={16} aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </nav>
        )}
      </section>

      <section className="custom-container pb-14">
        <div className="rounded-3xl border border-border bg-primary-3 p-6 sm:p-8">
          <h2 className="text-lg font-black text-foreground">
            چطور از منشیم نوبت بگیرم؟
          </h2>
          <ol className="mt-4 grid gap-3 text-sm leading-7 text-muted-foreground sm:grid-cols-3">
            <li className="rounded-2xl bg-white p-4">
              <span className="mb-1 block font-bold text-foreground">۱. سالن را انتخاب کنید</span>
              از همین فهرست، صفحهٔ آرایشگاه موردنظرتان را باز کنید.
            </li>
            <li className="rounded-2xl bg-white p-4">
              <span className="mb-1 block font-bold text-foreground">۲. خدمت و ساعت را ببینید</span>
              قیمت، مدت‌زمان و نمونه‌کارها را مقایسه کنید.
            </li>
            <li className="rounded-2xl bg-white p-4">
              <span className="mb-1 block font-bold text-foreground">۳. نوبت را قطعی کنید</span>
              برای نهایی‌کردن رزرو وارد حساب کاربری شوید و پرداخت کنید.
            </li>
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            راهنمای کامل:{' '}
            <Link href="/online-provider-booking" className="font-bold text-primary hover:underline">
              رزرو آنلاین آرایشگاه
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
