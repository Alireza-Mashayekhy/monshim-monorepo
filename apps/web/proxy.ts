import { NextRequest, NextResponse } from 'next/server';

import { buildAuthHref } from './lib/auth';
import { apiMayUseDifferentCookieHost } from './lib/auth-cookie-origin';
import { classifyRoute, RETIRED_ROUTE_REDIRECTS } from './lib/route-access';

/**
 * مسیرهای قدیمیِ «barber» → «provider».
 *
 * چرا ۳۰۱ و چرا اینجا؟
 * ---------------------
 * نامِ مسیرها عمومی شد تا بعداً بتوان شغل‌های دیگری غیر از آرایشگر هم اضافه
 * کرد. لینک‌های قدیمی در گوگل ایندکس شده‌اند، در پیامک/ربات بله/QR و صفحهٔ
 * اشتراک‌گذاری پخش شده‌اند و `sitemap` قبلی هم به آن‌ها اشاره می‌کرد؛ بدون
 * ریدایرکت، همهٔ آن‌ها ۴۰۴ (یا بدتر: ۳۰۷ به `/login`) می‌شدند و سئوی صفحهٔ
 * عمومی هر آرایشگر از بین می‌رفت.
 *
 * ریدایرکت عمداً در این لایه است و نه `redirects()` در `next.config`: آنجا با
 * `permanent: true` کد **۳۰۸** برمی‌گردد، ولی اینجا ۳۰۱ واقعی ارسال می‌شود و
 * query string هم عیناً حفظ می‌شود. همچنین چون **پیش از** منطقِ احراز هویت
 * اجرا می‌شود، مسیر خصوصیِ قدیمی (مثل `/panel/barber/42`) به‌جای پریدن به
 * صفحهٔ ورود، به مسیر جدید می‌رود و آنجا به‌صورت طبیعی بررسی می‌شود.
 *
 * نکته: `/barber-management` با قاعدهٔ `/barber` اشتباه گرفته نمی‌شود، چون
 * تطبیق فقط روی خودِ مسیر یا زیرمسیرِ آن (`/barber/...`) انجام می‌شود.
 */
const LEGACY_PATH_REDIRECTS = [
  { from: '/panel/barber', to: '/panel/provider' },
  { from: '/admin/barbers', to: '/admin/providers' },
  { from: '/barber-management', to: '/provider-management' },
  { from: '/online-barber-booking', to: '/online-provider-booking' },
  { from: '/barbaer-signup', to: '/provider-signup' },
  { from: '/barber', to: '/provider' },
] as const;

/**
 * مسیرهای بازنشسته‌ای که **جایگزین** دارند و باید ۳۰۱ شوند.
 *
 * `/explore` صفحهٔ فهرستِ عمومیِ قدیمی بود که حذف شد و جایش را `/panel/explore`
 * (خصوصی) گرفت. نتیجه این بود که URL قدیمی برای کاربر مهمان ۳۰۷ به `/login`
 * می‌شد (`/login` هم در robots.txt مسدود است)؛ یعنی یک ریدایرکت به مقصدِ
 * مسدود که هیچ سیگنال تمیزی به گوگل نمی‌دهد. اکنون که صفحهٔ فهرست عمومی
 * (`/providers`) ساخته شده، همان مقصد درست و پایدار است.
 */
function retiredPathRedirect(request: NextRequest, pathname: string) {
  for (const { from, to } of RETIRED_ROUTE_REDIRECTS) {
    if (pathname !== from && !pathname.startsWith(`${from}/`)) continue;
    const url = request.nextUrl.clone();
    url.pathname = to + pathname.slice(from.length);
    return NextResponse.redirect(url, 301);
  }
  return null;
}

function legacyPathRedirect(request: NextRequest, pathname: string) {
  for (const { from, to } of LEGACY_PATH_REDIRECTS) {
    if (pathname !== from && !pathname.startsWith(`${from}/`)) continue;
    const url = request.nextUrl.clone();
    url.pathname = to + pathname.slice(from.length);
    return NextResponse.redirect(url, 301);
  }
  return null;
}

/** هدر هویتِ کلاینت هرگز قابل اعتماد نیست — حتی روی مسیرهای عمومی. */
function nextWithoutIdentityHeader(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete('X-User-Payload');
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const retiredRedirect = retiredPathRedirect(request, pathname);
  if (retiredRedirect) return retiredRedirect;

  const legacyRedirect = legacyPathRedirect(request, pathname);
  if (legacyRedirect) return legacyRedirect;

  const access = classifyRoute(pathname);

  // مسیرهای عمومی (از جمله ورود/ثبت‌نام) بدون گیت عبور می‌کنند.
  // AuthProvider وضعیت نشست را در سمت کلاینت تعیین می‌کند.
  if (access === 'public') return nextWithoutIdentityHeader(request);

  // مسیر ناموجود: درخواست را به روتر Next می‌دهیم تا ۴۰۴ واقعی برگردد.
  // بدون این شاخه، هر URL اشتباه به `/login` می‌رفت (باگ سئوی سراسری).
  if (access === 'unknown') return nextWithoutIdentityHeader(request);

  // ── از این‌جا به بعد فقط مسیرهای خصوصیِ شناخته‌شده ──
  const token = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // Cookie presence is only a hint to try /auth/me, never authentication.
  // The API and the client guard check the current user and roles.
  if (
    !token &&
    !refreshToken &&
    !apiMayUseDifferentCookieHost(
      process.env.NEXT_PUBLIC_API_URL,
      request.headers.get('host'),
    )
  ) {
    const callbackUrl = `${pathname}${request.nextUrl.search}`;
    const loginUrl = new URL(buildAuthHref('/login', callbackUrl), request.url);
    return NextResponse.redirect(loginUrl);
  }
  // If the browser talks to a different API host, its host-only cookies are
  // invisible here. Let the browser verify the session instead of assuming guest.
  return nextWithoutIdentityHeader(request);
}

export const config = {
  matcher: [
    // `monitoring` تونل Sentry است (rewrite در next.config)؛ اگر از proxy رد شود،
    // کاربر مهمان با ۳۰۷ به /login می‌رود و خطاهای سمت کلاینت گم می‌شوند.
    //
    // `/.well-known/*` هم عمداً از این لایه خارج است: این مسیرها استانداردِ
    // discovery هستند (ai-catalog.json، ard.json، security.txt و ...) و
    // ریدایرکت‌شدن‌شان به صفحهٔ لاگین باعث می‌شود ربات‌ها/ایجنت‌ها به‌جای «فایل
    // وجود ندارد» یک صفحهٔ HTML با کد ۳۰۷/۲۰۰ بگیرند — که همان چیزی است که
    // ممیزی «ai-catalog.json schema is valid» در PageSpeed را می‌شکند.
    // با خارج‌بودن از matcher، این درخواست‌ها طبیعی و بدون ریدایرکت ۴۰۴ می‌شوند.
    '/((?!api(?:/|$)|\\.well-known/|_next/|monitoring(?:/|$)|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw\\.js|pwa/offline\\.html|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|mov|mp4|txt)$).*)',
  ],
};
