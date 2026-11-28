import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import type { DiscountApplicableTo } from '../constants';
import { DISCOUNT_APPLICABLE_TO } from '../constants';

export class UpdatePublicPageDiscountDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  code?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(DISCOUNT_APPLICABLE_TO)
  applicableTo?: DiscountApplicableTo;

  /** برای پاک‌کردن سقفِ کل، مقدار `null` ارسال می‌شود. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalUses?: number | null;

  /** برای پاک‌کردن سقفِ هر کاربر، مقدار `null` ارسال می‌شود. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerUser?: number | null;

  /** شروع اعتبار (null = بدون محدودیت). */
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  startsAt?: string | null;

  /** برای حذف انقضا، مقدار `null` ارسال می‌شود. */
  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  expiresAt?: string | null;
}
