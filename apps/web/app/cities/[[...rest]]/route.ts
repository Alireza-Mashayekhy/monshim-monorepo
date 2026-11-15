import { NextResponse } from 'next/server';

/**
 * بازنشستگی مسیرهای `/cities/*`.
 *
 * پیشینه
 * ------
 * `/cities/{slug}/barbers` در گذشته بخشی از صفحه‌های discovery بود و در
 * `sitemap` هم قرار داشت؛ بعداً به «صفحهٔ خصوصی» تبدیل شد: نه روت‌ای برای آن
 * ماند، نه در `sitemap` ماند، ولی در `robots.txt` مسدود شد. نتیجه این شد که
 * هر URL ایندکس‌شدهٔ `/cities/...` برای کاربر مهمان ۳۰۷ به `/login` می‌خورد و
 * `/login` هم مسدود بود → «ریدایرکت به مقصدِ مسدود»، بدون هیچ سیگنال تمیزی
 * برای حذف از ایندکس.
 *
 * تصمیم
 * -----
 * تا زمانی که صفحهٔ شهر به‌صورت عمومی و داده‌محور ساخته نشود (که یک تصمیم
 * کسب‌وکار است)، این مسیرها **۴۱۰ Gone** برمی‌گردانند: هم کاربر پیام روشن
 * می‌بیند، هم خزنده سیگنال حذف قطعی می‌گیرد. `Disallow` مربوط به `/cities` از
 * `robots.txt` برداشته شد تا این ۴۱۰ قابل مشاهده باشد؛ وگرنه گوگل هرگز آن را
 * نمی‌دید.
 *
 * اگر روزی صفحهٔ عمومی شهرها در همین مسیر ساخته شد، این فایل باید حذف شود.
 */
export const dynamic = 'force-static';

const GONE_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>صفحهٔ شهرها بازنشسته شده است | منشیم</title>
</head>
<body style="font-family:system-ui,Vazirmatn,Tahoma,sans-serif;background:#f6fcfd;color:#0f172a;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;padding:24px">
<main style="max-width:32rem;text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:32px">
<h1 style="font-size:1.15rem;margin:0 0 12px">صفحهٔ شهرها دیگر در دسترس نیست</h1>
<p style="font-size:.875rem;line-height:2;color:#475569;margin:0 0 20px">
فهرست شهرهای منشیم بازنشسته شده است. برای دیدن آرایشگاه‌های فعال و رزرو نوبت، از فهرست آرایشگاه‌ها استفاده کنید.
</p>
<p style="margin:0">
<a href="/providers" style="display:inline-block;background:#0b7285;color:#fff;text-decoration:none;border-radius:12px;padding:10px 18px;font-size:.875rem">دیدن آرایشگاه‌ها</a>
<a href="/" style="display:inline-block;margin-inline-start:8px;color:#0b7285;text-decoration:none;border-radius:12px;padding:10px 18px;font-size:.875rem;border:1px solid #99e0ea">صفحهٔ اصلی</a>
</p>
</main>
</body>
</html>`;

export function GET() {
  return new NextResponse(GONE_HTML, {
    status: 410,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, follow',
    },
  });
}
