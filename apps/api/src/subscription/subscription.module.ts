import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FrontendRevalidationService } from 'src/common/services/frontend-revalidation.service';
import { NotificationModule } from 'src/notification/notification.module';

import { SmsUsage } from './entities/sms-usage.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { PublicPageExpiryReminderService } from './public-page-expiry-reminder.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionSchemaService } from './subscription-schema.service';
import { UserSubscriptionController } from './user-subscription.controller';
import { UserSubscriptionService } from './user-subscription.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionPlan, UserSubscription, SmsUsage]),
    // `BookingSmsService` برای پیامک یادآوری پایان اشتراک صفحهٔ اختصاصی
    NotificationModule,
  ],
  controllers: [SubscriptionController, UserSubscriptionController],
  providers: [
    SubscriptionService,
    UserSubscriptionService,
    PublicPageExpiryReminderService,
    // گارد اسکیمای دفتر مصرف پیامک (sms_usages) — در production با
    // synchronize=false، نبودِ این جدول فقط مسیر «کسر سهمیهٔ پیامکِ ثبت
    // رزرو دستی» را با 500/503 می‌شکند؛ جزئیات در خود سرویس.
    SubscriptionSchemaService,
    // برای پاک‌سازی on-demand کش فرانت پس از انقضای اشتراک پروفایل اختصاصی.
    FrontendRevalidationService,
    // توکنِ صریح برای تزریق اختیاری در `BarberService` بدون import مرزی ماژول
    // (تا زنجیرهٔ @nestjs/schedule وارد آن ماژول نشود).
    {
      provide: 'USER_SUBSCRIPTION_SERVICE',
      useExisting: UserSubscriptionService,
    },
  ],
  exports: [
    SubscriptionService,
    UserSubscriptionService,
    'USER_SUBSCRIPTION_SERVICE',
  ],
})
export class SubscriptionModule {}
