-- «پروفایل اختصاصی» — اشتراک دوره‌ای: دورهٔ رایگان پس از ثبت‌نام + تمدید پولی
--
-- هدف:
--   ۱) ستون `plan_type` روی پلن‌ها تا پلن‌های «پروفایل اختصاصی» از پلن‌های
--       پیامکی موجود جدا شوند (پیش‌فرض `sms` است؛ رفتار پلن‌های فعلی
--       تغییر نمی‌کند)؛
--   ۲) ستون `free_trial_sms_sent_at` روی اشتراک‌ها به‌عنوان کلید idempotency
--       پیامک اطلاع‌رسانی دورهٔ رایگان؛
--   ۳) سه پلن اشتراک «پروفایل اختصاصی»:
--       • public_page_trial     — رایگان، ۳۰ روز، فقط یک‌بار و خودکار
--       • public_page_monthly   — ۹۹٫۰۰۰ تومان، ۳۰ روز
--       • public_page_quarterly — ۲۵۰٫۰۰۰ تومان، ۹۰ روز
--
-- این فایل فقط برای محیط production لازم است؛ در بقیهٔ محیط‌ها
-- `synchronize` خود TypeORM ستون‌ها را می‌سازد و پلن‌ها هم در
-- `SubscriptionService.seedPlans` ساخته می‌شوند.
--
-- ⚠️ ترتیب استقرار: این فایل باید **قبل از** استقرار کدِ جدید اجرا شود.
-- هیچ رکورد موجودی تغییر نمی‌کند و هیچ اشتراک/پرداختی دست‌نخورده باقی
-- می‌ماند.

-- ۱) نوع پلن
ALTER TABLE subscription_plans
  ADD COLUMN plan_type VARCHAR(20) NOT NULL DEFAULT 'sms';

-- ۲) کلید idempotency پیامک دورهٔ رایگان
ALTER TABLE user_subscriptions
  ADD COLUMN free_trial_sms_sent_at DATETIME NULL;

-- ۳) پلن‌های اشتراک «پروفایل اختصاصی»
--    `ON DUPLICATE KEY UPDATE` باعث می‌شود اجرای دوبارهٔ این فایل بی‌خطر
--    باشد و فقط مقادیر پلن‌ها را به‌روز کند.
INSERT INTO subscription_plans
  (id, plan_key, name, sms_count, price, duration_days, description,
   is_active, sort_order, plan_type, created_at, updated_at)
VALUES
  (UUID(), 'public_page_trial',
   'پروفایل اختصاصی رایگان', 0, 0.00, 30,
   'دورهٔ رایگان یک‌ماههٔ پروفایل اختصاصی که پس از ثبت‌نام آرایشگر اعطا می‌شود.',
   1, 10, 'public_page', NOW(6), NOW(6)),
  (UUID(), 'public_page_monthly',
   'تمدید یک‌ماههٔ پروفایل اختصاصی', 0, 99000.00, 30,
   'تمدید یک‌ماههٔ دسترسی به پروفایل اختصاصی آرایشگاه.',
   1, 11, 'public_page', NOW(6), NOW(6)),
  (UUID(), 'public_page_quarterly',
   'تمدید سه‌ماههٔ پروفایل اختصاصی', 0, 250000.00, 90,
   'تمدید سه‌ماههٔ دسترسی به پروفایل اختصاصی آرایشگاه.',
   1, 12, 'public_page', NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sms_count = VALUES(sms_count),
  price = VALUES(price),
  duration_days = VALUES(duration_days),
  description = VALUES(description),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order),
  plan_type = VALUES(plan_type);
