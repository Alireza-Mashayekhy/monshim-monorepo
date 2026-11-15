import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { QueryDto } from 'src/common/database/query';
import { NormalizeNumber } from 'src/common/utils/digits.util';

/**
 * مقادیر مجاز فیلتر جنسیت.
 *
 * «جنسیت مخاطب سالن» است، نه جنسیت آرایشگر: مقدار `male` یعنی سالن‌هایی که
 * مردها را می‌پذیرند (`activityType` برابر `men` یا `both`).
 */
export const BARBER_GENDER_FILTERS = ['male', 'female'] as const;
export type BarberGenderFilter = (typeof BARBER_GENDER_FILTERS)[number];

export class BarberQueryDto extends QueryDto {
  @IsOptional()
  @NormalizeNumber()
  @IsNumber()
  provinceId?: number;

  @IsOptional()
  @NormalizeNumber()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @NormalizeNumber()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @NormalizeNumber()
  @IsNumber()
  @Min(0)
  minRating?: number;

  /**
   * فیلتر جنسیت مخاطب.
   *
   * چرا اینجا اعلام شده است؟ `ValidationPipe` سراسری با
   * `forbidNonWhitelisted: true` اجرا می‌شود (نگاه کنید به `main.ts`)؛ هر
   * پارامتری که در DTO اعلام نشده باشد با خطای
   * «property gender should not exist» و کد ۴۰۰ رد می‌شد. صفحهٔ
   * `/panel/explore` و صفحهٔ اصلی پنل این پارامتر را می‌فرستند، پس برای
   * کاربر عادی فهرست سالن‌ها هرگز بارگذاری نمی‌شد.
   *
   * مقدار خالی (`?gender=`) به «بدون فیلتر» تبدیل می‌شود (حالت پاک‌کردن
   * فیلتر در UI) و مقدار ناشناخته با `@IsIn` و پیام روشن ۴۰۰ می‌گیرد؛ سرویس
   * هم مستقل از این‌جا فقط `male`/`female` را اعمال می‌کند.
   */
  @IsOptional()
  @Transform(({ value }) =>
    // `?gender=` حالت «فیلتر پاک شده» است؛ باید مثل «بدون فیلتر» رفتار کند
    // نه ۴۰۰. مقدارهای دیگر همان‌طور به `@IsIn` می‌رسند و رد می‌شوند.
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsIn(BARBER_GENDER_FILTERS, {
    message: 'مقدار جنسیت باید male یا female باشد',
  })
  gender?: BarberGenderFilter;
}
