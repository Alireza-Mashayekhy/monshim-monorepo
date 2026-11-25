import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarberProfile } from 'src/barber/entities/barber.entity';
import { BarberWorkHours } from 'src/barber/entities/barber-work-hours.entity';
import { ClubModule } from 'src/club/club.module';
import { NotificationModule } from 'src/notification/notification.module';
import { Payment } from 'src/payment/entities/payment.entity';
import { ReferralModule } from 'src/referral/referral.module';
import { Service } from 'src/services/entities/service.entity';
import { SubscriptionModule } from 'src/subscription/subscription.module';
import { User } from 'src/users/entities/user.entity';
import { WalletModule } from 'src/wallet/wallet.module';

import { BookingsController } from './booking.controller';
import { BookingsService } from './booking.service';
import { BookingSchemaService } from './booking-schema.service';
import { Booking } from './entities/booking.entity';
import { SlotHold } from './entities/slot-hold.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      BarberProfile,
      Service,
      User,
      BarberWorkHours,
      Payment,
      SlotHold,
    ]),
    WalletModule,
    ReferralModule,
    ClubModule,
    NotificationModule,
    SubscriptionModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    // گارد اسکیمای جدول‌های رزرو (bookings/slot_holds) — در production با
    // synchronize=false، نبودِ ستون‌های مسیر «ثبت رزرو دستی» روی bookings
    // فقط همین مسیر را با 500 می‌شکند؛ جزئیات در خود سرویس.
    BookingSchemaService,
  ],
  exports: [BookingsService],
})
export class BookingModule {}
