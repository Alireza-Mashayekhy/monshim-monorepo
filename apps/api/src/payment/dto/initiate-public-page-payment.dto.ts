import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class InitiatePublicPagePaymentDto {
  /**
   * شناسهٔ پلن اشتراک «پروفایل اختصاصی» که آرایشگر برای خرید/تمدید انتخاب
   * کرده است. قیمت نهایی در بک‌اند از روی همین پلن محاسبه می‌شود و به
   * مقدار ارسال‌شده از فرانت اعتماد نمی‌شود.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  planId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  discountCode?: string;
}
