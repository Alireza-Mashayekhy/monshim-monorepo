import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import type { DiscountApplicableTo } from '../constants';
import { DISCOUNT_APPLICABLE_TO } from '../constants';

export class CreatePublicPageDiscountDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  code: string;

  @IsInt()
  @Min(1)
  @Max(100)
  percentOff: number;

  /** برای کدام خرید(ها) معتبر باشد (پیش‌فرض: فقط صفحهٔ اختصاصی). */
  @IsOptional()
  @IsIn(DISCOUNT_APPLICABLE_TO)
  applicableTo?: DiscountApplicableTo;

  /** سقف کل استفاده‌های موفق (NULL/حذف‌شده = نامحدود). */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalUses?: number | null;

  /** سقف استفادهٔ هر کاربر (NULL/حذف‌شده = نامحدود). */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerUser?: number | null;

  /** شروع اعتبار (null = بدون محدودیت). */
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  startsAt?: string | null;

  /** تاریخ انقضا (ISO؛ NULL/حذف‌شده = بدون انقضا). */
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  expiresAt?: string | null;
}
