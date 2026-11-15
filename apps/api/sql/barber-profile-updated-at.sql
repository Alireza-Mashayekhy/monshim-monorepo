-- آخرین تغییرِ محتواییِ پروفایل آرایشگر (lastmod سئو)
--
-- چرا؟
-- `sitemap.xml` برای صفحهٔ هر آرایشگر (`/provider/[slug]`) باید تاریخِ
-- «آخرین تغییر محتوا» را اعلام کند. پیش‌تر از `MAX(purchase.createdAt)` یا
-- `MAX(booking.updatedAt)` استفاده می‌شد که «فعالیت رزرو» است، نه ویرایش
-- پروفایل؛ نتیجه: سالنی که بیو/نمونه‌کار/خدماتش را بازنویسی می‌کرد هیچ
-- سیگنال تازگی نمی‌گرفت.
--
-- ⚠️ ترتیب استقرار: این فایل باید **قبل از** استقرار کدِ جدید روی پایگاه داده
-- اجرا شود. کد جدید این ستون را در SELECT می‌خواند و اگر وجود نداشته باشد
-- کوئری‌های پروفایل خطا می‌دهند.
--
-- در محیط‌هایی که `synchronize` روشن است (dev/test) TypeORM خودش ستون را
-- می‌سازد و اجرای این فایل لازم نیست. در production با
-- `ENABLE_SCHEMA_MUTATIONS=1` هم سرور به‌صورت idempotent خودش این ستون را
-- اضافه و backfill می‌کند؛ `ALTER` زیر همان کاری است که آن مسیر انجام می‌دهد.

ALTER TABLE barber_profile
  ADD COLUMN updated_at DATETIME(6) NULL;

-- backfill: بهترین تخمینِ موجود برای «آخرین تغییر» در ردیف‌های قدیمی.
UPDATE barber_profile
SET updated_at = created_at
WHERE updated_at IS NULL;

-- از این پس مقدار ستون با هر UPDATE روی ردیف (و هر save از TypeORM) تازه می‌شود.
ALTER TABLE barber_profile
  MODIFY COLUMN updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6);
