// src/barber/dto/update-barber.dto.ts
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ALLOWED_SLOT_INTERVAL_MINUTES } from 'src/booking/slot-intervals';
import {
  extractSocialHandle,
  INSTAGRAM_HANDLE_MESSAGE,
  IRANIAN_PHONE_MESSAGE,
  IRANIAN_PHONE_PATTERN,
  normalizeCoordinateInput,
  normalizePhoneInput,
  SOCIAL_HANDLE_PATTERN,
  TELEGRAM_HANDLE_MESSAGE,
} from 'src/common/utils/contact.util';
import { NormalizeDigits, NormalizeNumber } from 'src/common/utils/digits.util';

import {
  ACTIVITY_TYPE_ERROR_MESSAGE,
  ACTIVITY_TYPE_VALUES,
  type ActivityTypeValue,
} from '../activity-types';

/**
 * قاعده «هر دو با هم یا هر دو null» برای عرض/طول جغرافیایی.
 *
 * روی هر دو فیلد `latitude` و `longitude` نصب می‌شود (متادیتای سطح کلاس در
 * class-validator 0.15 اجرا نمی‌شود). رفتار `@IsOptional` اینجاست به کار
 * می‌آید: وقتی مقدار فیلد null/undefined باشد، کل اعتبارسنجی‌های آن فیلد
 * (از جمله همین قید) skip می‌شود؛ پس:
 *   - هر دو null یا هیچ‌کدام → هیچ قیدی اجرا نمی‌شود ⇐ معتبر.
 *   - فقط یکی از دو فیلد number آمده → قیدِ همان فیلد اجرا می‌شود و
 *     نیمهٔ دیگر را می‌بیند (undefined/null) ⇐ یک خطای فارسی.
 *   - هر دو number → قیدِ هر دو اجرا می‌شود و نیمهٔ دیگر number است ⇐ معتبر
 *     (بازهٔ عددی با `@Min`/`@Max` خودِ فیلدها).
 */
@ValidatorConstraint({ name: 'locationPair', async: false })
class LocationPairConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as UpdateBarberDto;
    const other = args.property === 'latitude' ? dto.longitude : dto.latitude;
    return typeof other === 'number' && Number.isFinite(other);
  }

  defaultMessage(): string {
    return 'طول و عرض جغرافیایی باید همراه هم ارسال شوند (هر دو مقدار یا هر دو null)';
  }
}

export class UpdateBarberDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  birthDate?: string | null;

  @IsOptional()
  @NormalizeDigits()
  @IsString()
  nationalCode?: string | null;

  @IsOptional()
  @IsString()
  salonName?: string;

  /**
   * نوع فعالیت سالن (بانوان/آقایان/هردو)؛ همان گزینه‌ای که آرایشگر در
   * ثبت‌نام انتخاب کرده و می‌تواند در ویرایش پروفایل هم تغییرش دهد.
   * مقدار `null` پذیرفته نمی‌شود چون نوع فعالیت نباید پاک شود.
   */
  @IsOptional()
  @IsIn(ACTIVITY_TYPE_VALUES, { message: ACTIVITY_TYPE_ERROR_MESSAGE })
  activityType?: ActivityTypeValue;

  @IsOptional()
  @NormalizeNumber()
  @IsNumber()
  provinceId?: number | null;

  @IsOptional()
  @NormalizeNumber()
  @IsNumber()
  cityId?: number | null;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  bio?: string | null;

  @IsOptional()
  @IsString()
  workStartTime?: string | null; // HH:mm

  @IsOptional()
  @IsString()
  workEndTime?: string | null;

  @IsOptional()
  @NormalizeNumber()
  @IsInt()
  @IsIn([...ALLOWED_SLOT_INTERVAL_MINUTES], {
    message: 'بازه زمانی رزرو باید یکی از مقادیر ۱۵، ۳۰، ۴۵ یا ۶۰ دقیقه باشد',
  })
  slotIntervalMinutes?: number;

  @IsOptional()
  @IsString()
  profileImage?: string | null;

  // ---- راه‌های ارتباطی و موقعیت مکانی (بدون نیاز به تأیید مجدد) ----

  /** شماره تماس سالن؛ فرمت رقمی ایران (تلفن ثابت با کد شهر یا موبایل). رشتهٔ خالی → null. */
  @IsOptional()
  @Transform(({ value }) => normalizePhoneInput(value))
  @IsString()
  @Matches(IRANIAN_PHONE_PATTERN, { message: IRANIAN_PHONE_MESSAGE })
  contactPhone?: string | null;

  /** واتساپ؛ همان قواعد شمارهٔ تماس. رشتهٔ خالی → null. */
  @IsOptional()
  @Transform(({ value }) => normalizePhoneInput(value))
  @IsString()
  @Matches(IRANIAN_PHONE_PATTERN, { message: IRANIAN_PHONE_MESSAGE })
  whatsapp?: string | null;

  /** اینستاگرام؛ لینک یا `@شناسه` پذیرفته و فقط شناسه ذخیره می‌شود. رشتهٔ خالی → null. */
  @IsOptional()
  @Transform(({ value }) => extractSocialHandle(value, 'instagram'))
  @IsString()
  @Matches(SOCIAL_HANDLE_PATTERN, { message: INSTAGRAM_HANDLE_MESSAGE })
  instagram?: string | null;

  /** تلگرام؛ لینک یا `@شناسه` پذیرفته و فقط شناسه ذخیره می‌شود. رشتهٔ خالی → null. */
  @IsOptional()
  @Transform(({ value }) => extractSocialHandle(value, 'telegram'))
  @IsString()
  @Matches(SOCIAL_HANDLE_PATTERN, { message: TELEGRAM_HANDLE_MESSAGE })
  telegram?: string | null;

  /** عرض جغرافیایی (−۹۰ تا ۹۰)؛ باید همراه longitude بیاید یا هر دو null شوند. */
  @IsOptional()
  @Transform(({ value }) => normalizeCoordinateInput(value))
  @IsNumber({}, { message: 'عرض جغرافیایی باید عدد باشد' })
  @Min(-90, { message: 'عرض جغرافیایی باید بین ۹۰− و ۹۰ باشد' })
  @Max(90, { message: 'عرض جغرافیایی باید بین ۹۰− و ۹۰ باشد' })
  @Validate(LocationPairConstraint)
  latitude?: number | null;

  /** طول جغرافیایی (−۱۸۰ تا ۱۸۰)؛ باید همراه latitude بیاید یا هر دو null شوند. */
  @IsOptional()
  @Transform(({ value }) => normalizeCoordinateInput(value))
  @IsNumber({}, { message: 'طول جغرافیایی باید عدد باشد' })
  @Min(-180, { message: 'طول جغرافیایی باید بین ۱۸۰− و ۱۸۰ باشد' })
  @Max(180, { message: 'طول جغرافیایی باید بین ۱۸۰− و ۱۸۰ باشد' })
  @Validate(LocationPairConstraint)
  longitude?: number | null;

  /**
   * توجه: فیلدهای `isApproved` و `rejectionReason` عمداً از این DTO حذف
   * شده‌اند. این همان DTOای است که آرایشگر برای ویرایش پروفایل خودش
   * (`PATCH /barber/profile/me`) می‌فرستد و قبلاً می‌توانست با
   * `{ "isApproved": true }` بدون بررسی ادمین، خودش را تایید کند.
   * تایید و رد فقط از مسیر ادمین (`PATCH /admin/barber/:id/review`) انجام می‌شود.
   */
}
