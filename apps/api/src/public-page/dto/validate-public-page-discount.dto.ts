import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

import type { DiscountTarget } from '../constants';
import { DISCOUNT_TARGETS } from '../constants';

export class ValidatePublicPageDiscountDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  code: string;

  /**
   * هدفِ استعلام: قیمتِ واقعیِ همان پلن (و تطبیق `applicable_to`) از روی
   * دیتابیس محاسبه می‌شود؛ فرانت هیچ قیمتی نمی‌فرستد.
   */
  @IsIn(DISCOUNT_TARGETS)
  target: DiscountTarget;

  /** شناسهٔ پلنِ انتخابی (خرید صفحهٔ اختصاصی یا اشتراک پیامکی). */
  @IsString()
  @IsNotEmpty()
  planId: string;
}
