-- راه‌های ارتباطی (تماس، اینستاگرام، واتساپ، تلگرام) و مسیریابی (موقعیت
-- جغرافیایی برای گوگل‌مپ و اسنپ) در صفحهٔ اختصاصی آرایشگاه.
-- در production هنگام راه‌اندازی بک‌اند در صورت وجود دسترسی ALTER به‌طور
-- خودکار و idempotent ساخته می‌شود (BarberService.onModuleInit). اگر دسترسی
-- وجود ندارد، پس از بررسی نبود ستون‌ها، همین دستور را اجرا کنید.
-- همهٔ ستون‌ها nullable هستند؛ هیچ رکورد موجودی تغییر نمی‌کند و هیچ
-- حسابی فعال/غیرفعال نمی‌شود. DDL باید هم‌شکلِ `CONTACT_LOCATION_COLUMNS`
-- در `src/barber/barber.service.ts` بماند.
ALTER TABLE `barber_profile`
  ADD COLUMN `contact_phone` VARCHAR(20) NULL,
  ADD COLUMN `instagram` VARCHAR(100) NULL,
  ADD COLUMN `whatsapp` VARCHAR(30) NULL,
  ADD COLUMN `telegram` VARCHAR(100) NULL,
  ADD COLUMN `latitude` DECIMAL(10,7) NULL,
  ADD COLUMN `longitude` DECIMAL(10,7) NULL;
