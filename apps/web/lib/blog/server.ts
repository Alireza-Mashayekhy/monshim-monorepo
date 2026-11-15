import 'server-only';

import { cache } from 'react';

import { resolveServerApiBaseUrl } from '@/lib/api-base-url';
import { BLOG_CACHE_TAG } from '@/lib/public-cache-tags';

import type { BlogArticle } from './types';

export interface PublicBarber {
  id: number;
  slug: string;
  salonName: string;
  profileImage: string | null;
  city?: { name: string } | null;
  rating?: number;
}

/**
 * کشِ بلاگ.
 *
 * قبلاً همهٔ fetchها `cache: 'no-store'` بودند و صفحه‌ها هم
 * `dynamic = 'force-dynamic'` داشتند؛ یعنی هر بازدیدِ یک مقاله دو رفت‌وبرگشت
 * همگام به بک‌اند می‌زد، هیچ لایهٔ کشی نداشت و TTFB مقاله‌ها به سلامت لحظه‌ای
 * API گره خورده بود. اکنون:
 *
 *   • داده با تگ `BLOG_CACHE_TAG` و بازهٔ ۳۰۰ ثانیه کش می‌شود (ISR)؛
 *   • انتشار/ویرایش/حذف مقاله از پنل ادمین، همین تگ را از طریق وبهوک
 *     `/api/revalidate` فوراً منقضی می‌کند (بک‌اند → `notifyBlogChanged`)؛
 *   • `cache()` ری‌اکت فراخوانی‌های تکراری در **یک** درخواست را ادغام می‌کند
 *     (`generateMetadata` و خود صفحه هر دو `getArticle` را صدا می‌زنند).
 *
 * `revalidate: 300` برای محتوایی که چند بار در روز عوض نمی‌شود امن است و
 * مسیر «همان لحظه دیده شود» هم با وبهوک تضمین می‌شود.
 */
const BLOG_REVALIDATE_SECONDS = 300;

const blogFetchInit: RequestInit & { next: { revalidate: number; tags: string[] } } =
  {
    next: { revalidate: BLOG_REVALIDATE_SECONDS, tags: [BLOG_CACHE_TAG] },
  };

async function fetchBlog<T>(path: string): Promise<T | null> {
  const base = resolveServerApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, blogFetchInit);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as T;
  } catch {
    return null;
  }
}

/**
 * یک مقاله بر اساس نامک.
 *
 * رفتار ۴۰۴ عیناً حفظ شده است: فقط `404` به `null` تبدیل می‌شود (یعنی «مقاله
 * وجود ندارد» → `notFound()`)، و هر خطای دیگری throw می‌شود تا به‌جای ۴۰۴
 * دروغین، خطای واقعی دیده شود.
 *
 * `cache()` فقط در محدودهٔ یک درخواست dedupe می‌کند؛ کاری با کشِ Next ندارد.
 */
export const getArticle = cache(async function getArticle(
  slug: string,
): Promise<BlogArticle | null> {
  const base = resolveServerApiBaseUrl();
  if (!base) throw new Error('Blog API is not configured');
  const response = await fetch(`${base}/blog/${encodeURIComponent(slug)}`, blogFetchInit);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Blog API returned ${response.status}`);
  const result = await response.json();
  return result.data as BlogArticle;
});

export const getArticles = async (page: number) => {
  const base = resolveServerApiBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/blog?page=${page}`, blogFetchInit);
    if (!response.ok) return null;
    return (await response.json()) as {
      data: BlogArticle[];
      pagination: { page: number; totalPages: number };
    };
  } catch {
    return null;
  }
};

export const getBarber = (id: number) =>
  fetchBlog<PublicBarber>(`/blog/barbers/${id}`);
