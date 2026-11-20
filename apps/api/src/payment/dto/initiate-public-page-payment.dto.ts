import { IsNotEmpty, IsString } from 'class-validator';

export class InitiatePublicPagePaymentDto {
  /**
   * شناسهٔ پلن اشتراک «پروفایل اختصاصی» که آرایشگر برای خرید/تمدید انتخاب
   * کرده است. قیمت نهایی در بک‌اند از روی همین پلن محاسبه می‌شود و به
   * مقدار ارسال‌شده از فرانت اعتماد نمی‌شود.
   */
  @IsString()
  @IsNotEmpty()
  planId: string;
}
