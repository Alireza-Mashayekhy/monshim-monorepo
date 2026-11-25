-- دفتر مصرف پیامک (SMS usage ledger)
--
-- اجرای دستی این فایل در production دیگر **الزامی** نیست:
-- `SubscriptionSchemaService` هنگام بالا آمدن بک‌اند، وجودِ جدول `sms_usages`
-- را بررسی و در صورت نبود، آن را از روی متادیتای entity (همین ستون‌ها) می‌سازد.
-- این فایل برای زمانی نگه داشته شده که بخواهید جدول را پیش از deploy یا با
-- دسترسی CREATE محدود، دستی بسازید.
--
-- ⚠️ چرا این جدول حیاتی است؟ تنها نقطهٔ نوشتن در کل محصول، «کسر سهمیهٔ پیامک»
-- هنگام ثبت رزرو دستی است (`POST /bookings/manual` با پلن پیامکی ←
-- `UserSubscriptionService.deductSms`). اگر جدول وجود نداشته باشد، کسر سهمیه
-- شکست می‌خورد، تراکنش کل رزرو رول‌بک می‌شود و آرایشگر با خطای ۵۰۰/۵۰۳ مواجه
-- می‌شود — بدون اینکه هیچ مسیر دیگری از محصول این نقص را نشان دهد.
CREATE TABLE IF NOT EXISTS sms_usages (
  id CHAR(36) NOT NULL,
  user_id int NOT NULL,
  user_subscription_id VARCHAR(36) NOT NULL,
  count int NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY IDX_sms_usages_user (user_id),
  KEY IDX_sms_usages_subscription (user_subscription_id),
  CONSTRAINT FK_sms_usages_subscription FOREIGN KEY (user_subscription_id)
    REFERENCES user_subscriptions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
