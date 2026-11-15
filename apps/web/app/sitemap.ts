import type { MetadataRoute } from 'next';

import { shouldIndexProfile } from '@/lib/profile-quality';
import { fetchPublicApi } from '@/lib/public-api';
import { siteConfig } from '@/lib/site-config';
import type { PublicPageDirectoryEntry } from '@/services/features/public-page/types';

export const dynamic = 'force-dynamic';

/**
 * تاریخ آخرین تغییرِ محتوای صفحه‌های ثابت.
 *
 * چرا ثابت و دستی؟ چون `lastmod` باید «آخرین تغییر واقعی» باشد. اگر در هر
 * درخواست `new Date()` بگذاریم (یا تاریخ build)، گوگل به‌سرعت یاد می‌گیرد
 * این مقدار را نادیده بگیرد و کل سیگنال `lastmod` بی‌اثر می‌شود.
 * **هر بار محتوای این صفحه‌ها تغییر کرد، این مقدار را به‌روز کنید.**
 */
const STATIC_CONTENT_UPDATED_AT = '2026-11-15';

const staticPaths = [
  '/',
  '/providers',
  '/provider-management',
  '/online-provider-booking',
  '/pricing',
  '/tutorials',
  '/blog',
  '/privacy',
  '/terms',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // توجه: `/explore` و `/cities/[slug]/barbers` قبلاً در sitemap بودند ولی
  // اکنون هر دو صفحهٔ private محسوب می‌شوند (ورود به سامانه لازم است)، پس
  // اینجا اضافه نمی‌شوند تا در نتایج جستجو نمایش داده نشوند.
  //
  // صفحات عمومی آرایشگاه (`/provider/[slug]`) فقط وقتی وارد sitemap می‌شوند که
  // واقعاً فعال باشند و آرایشگر اسلاگ یکتای سالن خود را ثبت کرده باشد. بک‌اند
  // همین فهرست را برمی‌گرداند، بنابراین نه شناسهٔ عددی در URL قرار می‌گیرد و نه
  // صفحه‌ای که قرار است ۴۰۴ بدهد اینجا می‌آید.
  const activeBarbers = await fetchPublicApi<PublicPageDirectoryEntry[]>(
    '/public-page/directory',
  );

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map(path => ({
    url: path === '/' ? siteConfig.url : `${siteConfig.url}${path}`,
    lastModified: STATIC_CONTENT_UPDATED_AT,
  }));

  // `updatedAt` اینجا تاریخ آخرین تغییر محتوای پروفایل است (نه تاریخ رزرو یا
  // خرید پکیج) — به `getActiveDirectory()` در بک‌اند مراجعه کنید.
  const barberEntries: MetadataRoute.Sitemap = (activeBarbers ?? [])
    .filter(
      entry => typeof entry?.slug === 'string' && entry.slug.trim().length > 0,
    )
    // سیاستِ کیفیت (پیش‌فرض خاموش): پروفایلِ noindex نباید در sitemap باشد.
    // همان تابعِ `generateMetadata` صفحهٔ پروفایل، تا این دو ناهماهنگ نشوند.
    .filter(entry => shouldIndexProfile(entry.quality))
    .map(entry => ({
      url: `${siteConfig.url}/provider/${encodeURIComponent(entry.slug.trim())}`,
      ...(entry.updatedAt ? { lastModified: new Date(entry.updatedAt) } : {}),
    }));

  const blogArticles =
    await fetchPublicApi<{ slug: string; updatedAt: string }[]>(
      '/blog/sitemap',
    );
  const blogEntries = (blogArticles ?? [])
    .filter(a => typeof a.slug === 'string' && a.slug.length > 0)
    .map(a => ({
      url: `${siteConfig.url}/blog/${encodeURIComponent(a.slug)}`,
      ...(a.updatedAt ? { lastModified: new Date(a.updatedAt) } : {}),
    }));
  return [...staticEntries, ...barberEntries, ...blogEntries];
}
