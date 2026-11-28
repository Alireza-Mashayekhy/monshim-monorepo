-- ============================================================================
-- بررسی پیش از deploy — فقط SELECT است، هیچ چیزی را تغییر نمی‌دهد
-- ============================================================================
-- هدف: قبل از اینکه سرویس جدید بالا بیاید، مطمئن شویم همهٔ ستون‌های
-- الزامی وجود دارند. اگر یکی نباشد، سرویس در بوت DDL می‌زند و اگر
-- دیتابیس اجازهٔ ALTER ندهد، **سرویس اصلاً بالا نمی‌آید**.
--
-- اجرا:
--   mysql -u root -p monshim < apps/api/sql/PRE-DEPLOY-CHECK.sql
--
-- خروجی: هر ردیف یک ستون مورد نیاز است و ستون `status` می‌گوید OK یا MISSING.
-- اگر هیچ ردیف MISSING نبود، deploy امن است.
-- ============================================================================

SELECT 'public_page_discounts.starts_at (اجرای migration پیش از deploy)' AS requirement,
       IF(COUNT(*) > 0, 'OK', 'MISSING') AS status
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'public_page_discounts'
  AND COLUMN_NAME = 'starts_at'

UNION ALL
SELECT 'user_subscriptions.status reserved (اجرای migration پیش از deploy)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_subscriptions'
  AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%''reserved''%'

UNION ALL
SELECT 'barber_profile.is_publicly_visible (الزامی — نبودش سرویس را بالا نمی‌آورد)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'is_publicly_visible'

UNION ALL
SELECT 'barber_profile.pending_changes',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'pending_changes'

UNION ALL
SELECT 'barber_profile.pending_status',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'pending_status'

UNION ALL
SELECT 'barber_profile.pending_rejection_reason',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'pending_rejection_reason'

UNION ALL
SELECT 'barber_profile.contact_phone (راه‌های ارتباطی/مسیریابی)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'contact_phone'

UNION ALL
SELECT 'barber_profile.instagram (راه‌های ارتباطی/مسیریابی)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'instagram'

UNION ALL
SELECT 'barber_profile.whatsapp (راه‌های ارتباطی/مسیریابی)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'whatsapp'

UNION ALL
SELECT 'barber_profile.telegram (راه‌های ارتباطی/مسیریابی)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'telegram'

UNION ALL
SELECT 'barber_profile.latitude (موقعیت مکانی برای گوگل‌مپ/اسنپ)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'latitude'

UNION ALL
SELECT 'barber_profile.longitude (موقعیت مکانی برای گوگل‌مپ/اسنپ)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'longitude'

UNION ALL
SELECT 'site_settings.commission_mode',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings'
  AND COLUMN_NAME = 'commission_mode'

UNION ALL
SELECT 'site_settings.commission_tiers',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings'
  AND COLUMN_NAME = 'commission_tiers'

UNION ALL
SELECT 'site_settings.commission_max_amount',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings'
  AND COLUMN_NAME = 'commission_max_amount'

UNION ALL
SELECT 'blog_articles (table)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_articles'

UNION ALL
SELECT 'user.national_code',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user'
  AND COLUMN_NAME = 'national_code'

UNION ALL
SELECT 'barber_profile.slot_interval_minutes',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'
  AND COLUMN_NAME = 'slot_interval_minutes'

UNION ALL
SELECT 'bookings.deposit_token (لینک بیعانه)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'deposit_token'

UNION ALL
SELECT 'barber_profile (table)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barber_profile'

UNION ALL
SELECT 'site_settings (table)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings'

UNION ALL
SELECT 'subscription_plans.plan_type (پروفایل اختصاصی)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_plans'
  AND COLUMN_NAME = 'plan_type'

UNION ALL
SELECT 'user_subscriptions.free_trial_sms_sent_at (idempotency پیامک دورهٔ رایگان)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_subscriptions'
  AND COLUMN_NAME = 'free_trial_sms_sent_at'

UNION ALL
SELECT 'user_subscriptions.expiry_reminder_sms_sent_at (idempotency پیامک ۷ روز مانده)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_subscriptions'
  AND COLUMN_NAME = 'expiry_reminder_sms_sent_at'

UNION ALL
SELECT 'sms_usages (table — دفتر مصرف پیامک؛ نبودش کسر سهمیهٔ پیامکِ ثبت رزرو دستی را می‌شکند)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sms_usages'

UNION ALL
SELECT 'bookings.send_deposit_link (ثبت رزرو دستی — لینک بیعانه)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'send_deposit_link'

UNION ALL
SELECT 'bookings.send_sms_reminder (ثبت رزرو دستی — پیامک یادآوری)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'send_sms_reminder'

UNION ALL
SELECT 'bookings.reminder_hours (ثبت رزرو دستی — ساعت یادآوری)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'reminder_hours'

UNION ALL
SELECT 'bookings.reminder_sent_at (جلوگیری از یادآوری تکراری)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'reminder_sent_at'

UNION ALL
SELECT 'bookings.deposit_paid_at (پرداخت بیعانه از طریق لینک)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'deposit_paid_at'

UNION ALL
SELECT 'slot_holds (table — نگه‌داشتن موقت ساعت هنگام پرداخت آنلاین)',
       IF(COUNT(*) > 0, 'OK', 'MISSING')
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'slot_holds';
