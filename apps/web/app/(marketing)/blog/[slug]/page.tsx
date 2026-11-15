import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleContent } from '@/components/blog/article-content';
import JsonLd from '@/components/marketing/json-ld';
import Breadcrumbs from '@/components/marketing/shared/breadcrumbs';
import { getArticle } from '@/lib/blog/server';
import { publicImageUrl } from '@/lib/images';
import { absolutePublicImageUrl } from '@/lib/public-api';
import { buildPageMetadata, mergeRobotsDecision } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';

// ISR: کشِ داده با تگ `BLOG_CACHE_TAG` و پاک‌سازی on-demand از پنل ادمین.
// پیش‌تر `force-dynamic` بود و هر بازدید دو رفت‌وبرگشت همگام به API می‌زد.
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: 'مقاله یافت نشد', robots: { index: false } };

  const base = buildPageMetadata({
    title: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt,
    path: `/blog/${encodeURIComponent(article.slug)}`,
    imageUrl: publicImageUrl(article.cover),
    type: 'article',
    noIndex: article.indexable === false,
  });

  /**
   * ادغام به‌جای جایگزینی.
   *
   * قبلاً اینجا `robots: { index, follow }` کلِ آبجکتِ `robots` ساخته‌شده در
   * `buildPageMetadata` را دور می‌ریخت و در نتیجه `googleBot`
   * (`max-image-preview: large`، `max-snippet: -1`، `max-video-preview: -1`)
   * فقط روی مقاله‌ها گم می‌شد. اکنون پیش‌فرض‌های سراسری حفظ می‌شوند و تنها
   * تصمیمِ مخصوصِ مقاله (index/follow) بازنویسی می‌شود.
   */
  return {
    ...base,
    robots: mergeRobotsDecision(base.robots, {
      indexable: article.indexable,
      follow: article.follow,
    }),
  };
}

/** تاریخ ISO معتبر یا `null`. مقادیر نامعتبر نباید JSON-LD را خراب کنند. */
function isoDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function faDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fa-IR');
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const articlePath = `/blog/${encodeURIComponent(article.slug)}`;
  const articleUrl = `${siteConfig.url}${articlePath}`;
  const publishedAt = isoDate(article.publishedAt ?? article.createdAt);
  const modifiedAt = isoDate(article.updatedAt);

  const publishedLabel = faDate(article.publishedAt ?? article.createdAt);
  // تاریخ «آخرین به‌روزرسانی» فقط وقتی نمایش داده می‌شود که واقعاً جدیدتر باشد
  // (اختلاف بیش از یک روز)، وگرنه نویز است.
  const showsModified =
    modifiedAt &&
    publishedAt &&
    +new Date(modifiedAt) - +new Date(publishedAt) > 24 * 60 * 60 * 1000;
  const modifiedLabel = showsModified ? faDate(modifiedAt) : null;

  const coverUrl = absolutePublicImageUrl(article.cover);
  const cover = publicImageUrl(article.cover);

  /**
   * ساختار دادهٔ مقاله.
   *
   * نکته‌های صداقت داده:
   *   • `author` یک انسانِ ساختگی نیست: بلاگ منشیم نویسندهٔ شخصی ثبت‌شده ندارد
   *     و ناشرِ محتوا خودِ سرویس است، پس `author` به همان `Organization` سایت
   *     (`#organization`) اشاره می‌کند.
   *   • `dateModified` فقط وقتی می‌آید که واقعاً مقدار داشته باشد.
   *   • `image` فقط وقتی می‌آید که مقاله کاور داشته باشد.
   *   • `mainEntityOfPage` به همان canonical اشاره می‌کنند (بدون پارامتر).
   */
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${articleUrl}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${articleUrl}#webpage` },
    headline: article.title.slice(0, 110),
    description: (article.metaDescription || article.excerpt || '').slice(0, 300),
    url: articleUrl,
    inLanguage: 'fa-IR',
    ...(coverUrl ? { image: [coverUrl] } : {}),
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    ...(modifiedAt ? { dateModified: modifiedAt } : {}),
    author: { '@id': `${siteConfig.url}/#organization` },
    publisher: { '@id': `${siteConfig.url}/#organization` },
    isPartOf: { '@id': `${siteConfig.url}/#website` },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: siteConfig.name,
        item: siteConfig.url,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'بلاگ',
        item: `${siteConfig.url}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.title,
        item: articleUrl,
      },
    ],
  };

  return (
    <>
      <JsonLd data={[articleSchema, breadcrumbSchema]} />

      <Breadcrumbs
        items={[
          { href: '/', label: siteConfig.name },
          { href: '/blog', label: 'بلاگ' },
          { href: articlePath, label: article.title },
        ]}
      />

      <article dir="rtl" className="custom-container mx-auto max-w-4xl pb-14">
        <h1 className="text-3xl font-bold leading-relaxed">{article.title}</h1>

        {article.excerpt && (
          <p className="mt-4 leading-8 text-muted-foreground">{article.excerpt}</p>
        )}

        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {publishedLabel ? <span>انتشار: {publishedLabel}</span> : null}
          {modifiedLabel ? <span>آخرین به‌روزرسانی: {modifiedLabel}</span> : null}
        </p>

        {cover && (
          /*
           * نسبت ابعاد ثابت، CLS را حذف می‌کند بدون نیاز به دانستن اندازهٔ
           * واقعی تصویر؛ `alt` هم برای تصویرِ محتوایی (نه تزئینی) پر می‌شود.
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={`تصویر شاخص مقالهٔ ${article.title}`}
            className="mt-8 aspect-[16/9] w-full rounded-xl object-cover"
          />
        )}

        <div className="mt-8">
          <ArticleContent doc={article.content} />
        </div>

        <nav
          aria-label="بازگشت"
          className="mt-10 border-t border-border pt-6 text-sm"
        >
          <Link href="/blog" className="text-primary hover:underline">
            ← همهٔ مقاله‌های بلاگ
          </Link>
          <span className="mx-3 text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <Link href="/providers" className="text-primary hover:underline">
            فهرست آرایشگاه‌ها
          </Link>
        </nav>
      </article>
    </>
  );
}
