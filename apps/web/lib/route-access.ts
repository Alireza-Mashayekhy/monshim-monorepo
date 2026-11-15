import { isPathWithin, isPublicAuthPath, PROVIDER_WELCOME_PATH } from './auth';

/**
 * دسته‌بندی مسیرهای سایت — منبعِ واحدِ تصمیم‌گیری برای `proxy.ts` و
 * `AuthProvider`.
 *
 * چرا این ماژول وجود دارد؟
 * ------------------------
 * قبلاً `proxy.ts` فقط دو حالت می‌شناخت: «مسیر عمومی» یا «نیاز به ورود».
 * هر مسیری که در فهرست عمومی نبود (حتی مسیری که **اصلاً وجود نداشت**) با
 * ۳۰۷ به `/login` فرستاده می‌شد. نتیجه‌اش این بود که کل دامنه عملاً هیچ ۴۰۴
 * واقعی برنمی‌گرداند:
 *
 *   • گوگل هر URL اشتباه/حذف‌شده را «Page with redirect» می‌دید، نه «Not found».
 *   • مقصدِ ریدایرکت (`/login`) در `robots.txt` مسدود است، پس خزنده حتی
 *     `noindex` آن را هم نمی‌خواند → حلقهٔ «Blocked by robots.txt».
 *   • کاربر با کلیک روی یک لینک قدیمی به‌جای پیام «صفحه پیدا نشد» به فرم ورود
 *     می‌رسید.
 *
 * مدل سه‌حالته:
 *   • `public`  → بدون گیت، مستقیم به روتر Next (صفحه ۲۰۰ یا ۴۰۴ خودش).
 *   • `private` → همان گیتِ احراز هویت قبلی، بدون هیچ تغییری.
 *   • `unknown` → هیچ صفحه‌ای برای این مسیر وجود ندارد؛ درخواست را به روتر
 *                 می‌دهیم تا **۴۰۴ واقعی** تولید شود.
 *
 * چرا فهرست «خصوصی» و نه فهرست «عمومی»؟
 * -------------------------------------
 * تصمیم عمداً «fail-closed» است: اگر روزی صفحهٔ خصوصیِ جدیدی اضافه شود و
 * کسی آن را در `PRIVATE_ROUTE_PREFIXES` ثبت نکند، نتیجه ۴۰۴ شدنِ آن است
 * (خرابیِ قابل‌دیدن) نه عمومی‌شدنِ آن (نشتِ امنیتی). برای اینکه این خرابی
 * هرگز به production نرسد، `lib/route-access.test.ts` کل درخت `app/` را از
 * روی فایل‌سیستم می‌خواند و اگر مسیری بدون دسته‌بندی مانده باشد تست را
 * شکست می‌دهد.
 */
export type RouteAccess = 'public' | 'private' | 'unknown';

/**
 * پیشوندهای خصوصی — هر صفحه‌ای که با ورود محافظت می‌شود باید اینجا باشد.
 *
 * این فهرست دقیقاً همان چیزی است که `(panel)`، `(dashboard)`، `(admin)` و
 * `(onboarding)` در ساختار App Router تولید می‌کنند.
 */
export const PRIVATE_ROUTE_PREFIXES = [
  '/admin',
  '/dashboard',
  '/panel',
  PROVIDER_WELCOME_PATH,
] as const;

/**
 * مسیرهایی که بازنشسته شده‌اند و مقصدِ جایگزین دارند (۳۰۱ در `proxy.ts`).
 * فقط برای مستندسازی است؛ منطق ریدایرکت در `proxy.ts` است.
 */
export const RETIRED_ROUTE_REDIRECTS = [
  { from: '/explore', to: '/providers' },
] as const;

export function classifyRoute(pathname: string): RouteAccess {
  // ترتیب مهم است: `/panel/payment/callback` عمومی است و باید قبل از
  // پیشوندِ خصوصیِ `/panel` بررسی شود. `isPublicAuthPath` همین ترتیب را
  // رعایت می‌کند.
  if (isPublicAuthPath(pathname)) return 'public';
  if (PRIVATE_ROUTE_PREFIXES.some(prefix => isPathWithin(pathname, prefix))) {
    return 'private';
  }
  return 'unknown';
}

/** آیا این مسیر باید پشتِ گیتِ ورود برود؟ (فقط مسیرهای خصوصیِ شناخته‌شده) */
export function requiresAuth(pathname: string) {
  return classifyRoute(pathname) === 'private';
}
