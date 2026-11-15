'use client';

import { useEffect } from 'react';

import { trackEventOnce } from '@/lib/analytics';

/**
 * ردیابیِ «بازدید از صفحهٔ عمومی آرایشگر».
 *
 * چرا کامپوننت جدا و کلاینت؟ چون صفحهٔ پروفایل عمداً Server Component است و
 * باید همین‌طور بماند؛ فقط همین سه خط اندازه‌گیری به کلاینت می‌رود.
 *
 * `trackEventOnce` با کلیدِ اسلاگ از ارسال دوباره در رندرِ مجدد ری‌اکت
 * (و دوبار اجرای StrictMode) جلوگیری می‌کند. هیچ داده شخصی ارسال نمی‌شود؛
 * فقط دو بولین دربارهٔ کامل‌بودن پروفایل.
 */
export default function ProfileViewTracker({
  slug,
  hasPortfolio,
  hasReviews,
}: {
  slug: string;
  hasPortfolio: boolean;
  hasReviews: boolean;
}) {
  useEffect(() => {
    trackEventOnce(`profile-view:${slug}`, 'provider_profile_viewed', {
      has_portfolio: hasPortfolio,
      has_reviews: hasReviews,
    });
  }, [slug, hasPortfolio, hasReviews]);

  return null;
}
