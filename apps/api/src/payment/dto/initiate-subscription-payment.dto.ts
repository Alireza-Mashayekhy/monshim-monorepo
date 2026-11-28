import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class InitiateSubscriptionPaymentDto {
  @ApiProperty({ description: 'شناسه پلن اشتراک' })
  @IsString()
  @IsNotEmpty()
  subscriptionPlanId: string;

  /**
   * کد تخفیف اختیاری خرید اشتراک پیامکی. فقط **کد** از فرانت می‌آید؛
   * اعتبارسنجی و مبلغ تخفیف در بک‌اند از روی همان پلن محاسبه می‌شود و
   * سهمیهٔ کد فقط هنگام «پرداخت موفق» می‌سوزد.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  discountCode?: string;
}
