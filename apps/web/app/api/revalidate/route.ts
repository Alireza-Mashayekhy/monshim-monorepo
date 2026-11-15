import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  isAllowedCacheTag,
  revalidateBarberPublicCache,
  revalidateBlogCache,
  revalidateCacheTag,
} from '@/lib/public-cache';

/**
 * وبهوکِ on-demand revalidation برای بک‌اند.
 *
 * چرا؟ پنل ادمین و پنل آرایشگر (فرانت) پس از هر تغییر خودشان کش را تازه
 * می‌کنند، اما تغییرِ وضعیتِ تایید ممکن است از مسیرهای دیگری هم انجام شود
 * (مثلاً اسکریپت/اپ/ربات مدیریتی که مستقیم با API حرف می‌زند). در آن حالت
 * بک‌اند بعد از ذخیره‌سازی، این وبهوک را صدا می‌زند تا صفحهٔ عمومی آرایشگر
 * فوراً از نو ساخته شود.
 *
 * فعال‌سازی: در هر دو سرویس `REVALIDATE_SECRET` هم‌مقدار باشد. اگر تنظیم
 * نشده باشد این مسیر ۵۰۳ می‌دهد (هرگز بدون احراز هویت کش پاک نمی‌شود).
 *
 * نمونهٔ بدنه‌ها:
 *   پروفایل آرایشگر: { "userId": 42, "slugs": ["salon-royal"] }
 *   بلاگ:            { "paths": ["/blog", "/blog/foo"], "tags": ["blog-api-data"] }
 *
 * `paths` فقط مسیرهای داخلی (`/...`) و `tags` فقط تگ‌های تعریف‌شده در
 * `lib/public-cache-tags.ts` را می‌پذیرد؛ ورودیِ خام هرگز به کش نمی‌رسد.
 */
export const dynamic = 'force-dynamic';

function secretsMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.warn(
      '[revalidate] REVALIDATE_SECRET تنظیم نشده است؛ درخواست پاک‌سازی کش رد شد.',
    );
    return NextResponse.json(
      { revalidated: false, error: 'REVALIDATE_SECRET is not configured' },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get('x-revalidate-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!secretsMatch(provided, secret)) {
    return NextResponse.json(
      { revalidated: false, error: 'invalid secret' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    userId?: number | string | null;
    slugs?: Array<string | null | undefined>;
    paths?: Array<string | null | undefined>;
    tags?: Array<string | null | undefined>;
  } | null;

  const paths = (Array.isArray(body?.paths) ? body.paths : [])
    .filter((path): path is string => typeof path === 'string')
    // مسیرهای داینامیک/خارجی رد می‌شوند؛ فقط مسیر داخلیِ مطلق مجاز است.
    .filter(path => path.startsWith('/') && !path.startsWith('//'))
    .slice(0, 20);

  const tags = (Array.isArray(body?.tags) ? body.tags : [])
    .filter(
      (tag): tag is string =>
        typeof tag === 'string' && isAllowedCacheTag(tag),
    )
    .slice(0, 10);

  const ok = revalidateBarberPublicCache({
    userId: body?.userId ?? null,
    slugs: Array.isArray(body?.slugs) ? body.slugs : [],
    extraPaths: paths,
  });

  const blogOk =
    paths.some(path => path.startsWith('/blog')) || tags.length > 0;
  const blogRevalidated = blogOk
    ? revalidateBlogCache({
        slugs: paths
          .filter(path => path.startsWith('/blog/'))
          .map(path => path.slice('/blog/'.length)),
      })
    : true;

  const tagResults = tags.map(tag => revalidateCacheTag(tag));

  return NextResponse.json({
    revalidated: ok && blogRevalidated && tagResults.every(Boolean),
    paths,
    tags,
    now: Date.now(),
  });
}
