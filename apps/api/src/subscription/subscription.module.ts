import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from 'src/notification/notification.module';

import { SmsUsage } from './entities/sms-usage.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { PublicPageExpiryReminderService } from './public-page-expiry-reminder.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
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
  ],
  exports: [SubscriptionService, UserSubscriptionService],
})
export class SubscriptionModule {}
