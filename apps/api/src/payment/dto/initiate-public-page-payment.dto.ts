import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class InitiatePublicPagePaymentDto {
  /**
   * شناسهٔ پلن اشتراک «پروفایل اختصاصی» که آرایشگر برای خرید/تمدید انتخاب
   * کرده است. قیمت نهایی در بک‌اند از روی همین پلن محاسبه می‌شود و به
   * مقدار ارسال‌شده از فرانت اعتماد نمی‌شود.
   */
  @IsString()
  @IsNotEmpty()
  planId: string;

  /**
   * کد تخفیف اختیاری. فقط **کد** از فرانت می‌آید؛ اعتبارسنجی (فعال بودن،
   * انقضا، کاربرد، سقف استفاده) و مبلغ تخفیف همگی در بک‌اند و از روی همان
   * پلن محاسبه می‌شوند. سهمیهٔ کد فقط هنگام «پرداخت موفق» می‌سوزد.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  discountCode?: string;
}
