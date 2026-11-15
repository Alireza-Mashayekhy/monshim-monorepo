import type { MetadataRoute } from 'next';

import { siteConfig } from '@/lib/site-config';

const privatePaths = [
  '/admin',
  '/dashboard',
  // همهٔ صفحات پنل کاربر (`/panel/home`، `/panel/explore` و ...) خصوصی‌اند.
  '/panel',
  // توجه: `/cities` عمداً اینجا نیست. مسیرهای `/cities/*` بازنشسته شده‌اند و
  // در `app/cities/[[...rest]]/route.ts` با کد **۴۱۰** پاسخ می‌دهند. اگر
  // خزیدن آن‌ها مسدود بماند، گوگل هرگز ۴۱۰ را نمی‌بیند و URLهای قدیمی
  // برای همیشه «Blocked by robots.txt» می‌مانند. با برداشتن Disallow، حذف
  // قطعی از ایندکس ممکن می‌شود. (اگر روزی صفحهٔ عمومی شهرها ساخته شد، این
  // تصمیم باید بازبینی شود.)
  '/login',
  '/login-otp',
  '/register',
  '/provider-signup',
  '/test',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: privatePaths,
      },
      {
        // Explicitly permit OpenAI's search crawler on public pages. Private
        // account and management routes remain excluded like for other bots.
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: privatePaths,
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
