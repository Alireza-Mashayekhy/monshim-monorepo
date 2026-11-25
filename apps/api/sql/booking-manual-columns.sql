-- ستون‌های مسیر «ثبت رزرو دستی» روی جدول bookings (لینک بیعانه + پیامک یادآوری)
--
-- اجرای دستی این فایل در production دیگر **الزامی** نیست:
-- `BookingSchemaService` هنگام بالا آمدن بک‌اند، وجودِ ستون‌های این جدول را
-- بررسی و ستون‌های جامانده را از روی متادیتای entity می‌سازد.
-- این فایل برای زمانی نگه داشته شده که بخواهید ستون‌ها را پیش از deploy یا
-- با دسترسی ALTER محدود، دستی اضافه کنید.
--
-- ⚠️ چرا این ستون‌ها حیاتی‌اند؟ `POST /bookings/manual` این ستون‌ها را
-- **صریح** روی ردیف رزرو می‌نویسد؛ اگر هرکدام در production نباشند، INSERT
-- رزرو شکست می‌خورد و آرایشگر با خطای ۵۰۰ مواجه می‌شود — در حالی که رزرو
-- آنلاین (که این فیلدها را ست نمی‌کند) سالم می‌ماند و نقص فقط در «ثبت
-- رزرو دستی» دیده می‌شود. این ستون‌ها در هیچ فایل SQL دیگری پوشش داده
-- نشده بودند.
--
-- ⚠️ نکتهٔ اجرا: MySQL دستور `ADD COLUMN IF NOT EXISTS` ندارد؛ اجرای
-- دوبارهٔ این فایل روی دیتابیسی که ستون‌ها را دارد خطا می‌دهد. پیش از
-- اجرا، وضعیت را با PRE-DEPLOY-CHECK.sql بررسی کنید.

-- ۱) آیا لینک بیعانه برای مشتری ارسال شود
ALTER TABLE bookings
  ADD COLUMN send_deposit_link TINYINT(1) NOT NULL DEFAULT 0;

-- ۲) آیا پیامک یادآوری برای مشتری ارسال شود
ALTER TABLE bookings
  ADD COLUMN send_sms_reminder TINYINT(1) NOT NULL DEFAULT 0;

-- ۳) چند ساعت قبل از نوبت، پیامک یادآوری ارسال شود (۱، ۲، ۴، ۶، ۱۲، ۲۴)
ALTER TABLE bookings
  ADD COLUMN reminder_hours INT NULL;

-- ۴) زمان ارسال پیامک یادآوری (جلوگیری از ارسال تکراری)
ALTER TABLE bookings
  ADD COLUMN reminder_sent_at DATETIME NULL;

-- ۵) توکن تصادفی لینک عمومی پرداخت بیعانه
ALTER TABLE bookings
  ADD COLUMN deposit_token VARCHAR(64) NULL,
  ADD UNIQUE KEY UQ_bookings_deposit_token (deposit_token);

-- ۶) زمان پرداخت موفق بیعانه از طریق لینک
ALTER TABLE bookings
  ADD COLUMN deposit_paid_at DATETIME NULL;
