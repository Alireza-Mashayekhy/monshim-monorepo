-- Percentage discount codes for the barber public-page / SMS-subscription purchases.
--
-- اگر ENABLE_SCHEMA_MUTATIONS فعال باشد: `PublicPageSchemaService`
-- هنگام بالا آمدن بک‌اند، وجودِ جدول‌های `public_page_discounts` و `discount_usages`
-- را بررسی و در صورت نبود (یا نبودِ ستون‌های جامانده)، آن‌ها را از روی متادیتای
-- entity می‌سازد. این فایل برای زمانی نگه داشته شده که بخواهید جدول‌ها را پیش از
-- deploy یا با دسترسی CREATE محدود، دستی بسازید.
--
-- اگر جدول وجود نداشته باشد، «افزودن کد تخفیف» در پنل ادمین با خطای
-- `ER_NO_SUCH_TABLE` و در نتیجه HTTP 500/503 شکست می‌خورد.
CREATE TABLE IF NOT EXISTS public_page_discounts (
  id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  percent_off TINYINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  -- کاربرد کد: فقط صفحهٔ اختصاصی (پیش‌فرض رفتار کدهای قدیمی) / فقط اشتراک
  -- پیامکی / هر دو
  applicable_to VARCHAR(20) NOT NULL DEFAULT 'PUBLIC_PAGE',
  -- سقف کل استفاده‌های موفق (NULL = نامحدود)
  max_total_uses INT UNSIGNED NULL DEFAULT NULL,
  -- سقف استفادهٔ هر کاربر (NULL = نامحدود)
  max_uses_per_user INT UNSIGNED NULL DEFAULT NULL,
  -- شمارش آینه‌ای مصرف‌های موفق (برای نمایش سریع در پنل ادمین)
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  -- شروع اعتبار (NULL = بدون محدودیت)
  starts_at DATETIME NULL DEFAULT NULL,
  -- انقضای کد (NULL = بدون انقضا)
  expires_at DATETIME(6) NULL DEFAULT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_public_page_discount_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- هر «استفادهٔ موفق» (پرداخت تسویه‌شده با تخفیف) یک ردیف دارد. `payment_id`
-- یکتاست تا تسویهٔ تکراری یک پرداخت، سهمیه را دوبار نشمارد (idempotent).
-- مصرفِ ۱۰۰٪ تخفیف (مسیر رایگان) هم همین‌جا با همان `payment_id` ثبت می‌شود.
CREATE TABLE IF NOT EXISTS discount_usages (
  id CHAR(36) NOT NULL,
  discount_id CHAR(36) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  payment_id CHAR(36) NULL DEFAULT NULL,
  purpose VARCHAR(20) NOT NULL,
  discount_amount INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_discount_usage_payment (payment_id),
  KEY idx_discount_usage_discount_user (discount_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
