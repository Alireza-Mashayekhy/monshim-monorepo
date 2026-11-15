import type { Metadata } from 'next';

import { siteConfig } from '@/lib/site-config';

interface PageSeoInput {
  /** عنوان صفحه بدون نام برند؛ الگوی نام برند از layout اضافه می‌شود. */
  title: string;
  /** عنوان کامل و مستقل از template، برای نمونه صفحهٔ اصلی. */
  absoluteTitle?: string;
  description: string;
  /** مسیر نسبی صفحه، مثلاً /pricing */
  path: string;
  /** تصویر Open Graph مطلق؛ پیش‌فرض تصویر صفحهٔ اصلی است. */
  imageUrl?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

export const TITLE_TEMPLATE = `%s | ${siteConfig.name}`;

/** Shared canonical, social-card and crawler metadata for public pages. */
export function buildPageMetadata({
  title,
  absoluteTitle,
  description,
  path,
  imageUrl,
  type = 'website',
  noIndex = false,
}: PageSeoInput): Metadata {
  const url = path === '/' ? siteConfig.url : `${siteConfig.url}${path}`;
  const image = imageUrl ?? `${siteConfig.url}/landing/og-home.png`;
  const finalTitle = absoluteTitle ?? `${title} | ${siteConfig.name}`;
  const robots = {
    index: !noIndex,
    follow: true,
    googleBot: {
      index: !noIndex,
      follow: true,
      'max-image-preview': 'large' as const,
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  };

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      siteName: `${siteConfig.name} | ${siteConfig.nameEn}`,
      title: finalTitle,
      description,
      locale: siteConfig.locale,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${title} - ${siteConfig.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: finalTitle,
      description,
      images: [image],
    },
    robots,
  };
}

/**
 * ادغامِ تصمیمِ صفحه با `robots` ساخته‌شده در `buildPageMetadata`.
 *
 * قبلاً صفحهٔ مقاله مستقیم `robots: { index, follow }` می‌نوشت و در نتیجه کلِ
 * آبجکتِ پیش‌فرض — به‌ویژه `googleBot` با `max-image-preview: large` و
 * `max-snippet: -1` — فقط روی مقاله‌ها از بین می‌رفت. این تابع همان ادغام را
 * در یک نقطهٔ تست‌پذیر انجام می‌دهد: پیش‌فرض‌های سراسری حفظ می‌شوند و تنها
 * `index`/`follow` بازنویسی می‌شوند.
 *
 * `undefined` یعنی «داده‌ای نداریم»، نه «نه»؛ در آن حالت پیش‌فرضِ ایمن
 * (ایندکس شود) حفظ می‌شود تا یک فیلدِ جاافتاده در پاسخ API باعث حذف تگ
 * robots از مقالهٔ سالم نشود.
 */
export function mergeRobotsDecision(
  base: Metadata['robots'],
  decision: { indexable?: boolean | null; follow?: boolean | null },
) {
  const baseRobots =
    typeof base === 'object' && base !== null ? base : ({} as Record<string, never>);
  const baseGoogleBot =
    typeof baseRobots.googleBot === 'object' && baseRobots.googleBot !== null
      ? baseRobots.googleBot
      : ({} as Record<string, never>);

  const index = decision.indexable !== false;
  const follow = decision.follow !== false;

  return {
    ...baseRobots,
    index,
    follow,
    googleBot: { ...baseGoogleBot, index, follow },
  };
}

export function faqPageSchema(
  items: readonly { question: string; answer: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export const JSONLD_URLS = {
  home: siteConfig.url,
  management: siteConfig.url + siteConfig.routes.providerManagement,
  booking: siteConfig.url + siteConfig.routes.onlineBooking,
  pricing: siteConfig.url + siteConfig.routes.pricing,
  tutorials: siteConfig.url + siteConfig.routes.tutorials,
};
