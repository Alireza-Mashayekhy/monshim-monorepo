import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingSmsService } from 'src/notification/booking-sms.service';
import { PUBLIC_PAGE_EXPIRING_REMINDER_DAYS } from 'src/notification/sms-templates';
import { PUBLIC_PAGE_PLAN_TYPE } from 'src/subscription/constants';
import {
  UserSubscription,
  UserSubscriptionStatus,
} from 'src/subscription/entities/user-subscription.entity';
import { IsNull, Repository } from 'typeorm';

/**
 * روزهای باقی‌مانده تا پایان اشتراک (به‌صورت سقف‌گیری‌شده).
 *
 * مثال: اگر ۶ روز و ۲۰ ساعت مانده باشد، مقدار ۷ برمی‌گردد؛ یعنی «۷ روز
 * مانده» — همان چیزی که متن قالب اعلام می‌کند.
 */
export function remainingDaysUntil(endDate: Date, now = new Date()): number {
  return Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000);
}

/**
 * آیا الان زمان ارسال یادآوری «۷ روز مانده» است؟
 *
 * شرط: اشتراک هنوز منقضی نشده باشد و روزهای باقی‌مانده از سقف اعلام‌شده
 * بیشتر نباشد. یادآوری برای اشتراکی که همین حالا منقضی شده معنا ندارد
 * (برای آن‌ها مسیر تمدید/فعال‌سازی در داشبورد هست).
 */
export function isExpiryReminderDue(
  endDate: Date,
  now = new Date(),
  reminderDays = PUBLIC_PAGE_EXPIRING_REMINDER_DAYS,
): boolean {
  if (endDate.getTime() <= now.getTime()) return false;

  return remainingDaysUntil(endDate, now) <= reminderDays;
}

/**
 * یادآوری پیامکی پایان اشتراک «صفحهٔ اختصاصی» (قالب ۹۲۵۸۰۶).
 *
 * چرا لازم است؟
 * با پایان اشتراک، صفحهٔ عمومی آرایشگاه از دسترس عموم خارج می‌شود و آدرس
 * ایندکس‌شده در گوگل ۴۰۴ می‌دهد — همان چیزی که متن پیامک دربارهٔ «آسیب به
 * سئو» هشدار می‌دهد. این سرویس ۷ روز قبل هشدار می‌دهد تا آرایشگر فرصت
 * تمدید داشته باشد.
 *
 * قواعد مهم:
 *   • فقط اشتراک‌های `public_page` (نه پیامکی) بررسی می‌شوند؛
 *   • فقط اشتراک **فعال** و **منقضی‌نشده** که تا ۷ روز دیگر تمام می‌شود؛
 *   • هر اشتراک حداکثر **یک** پیامک می‌گیرد
 *     (`expiry_reminder_sms_sent_at` به‌عنوان قفل اتمیک)؛
 *   • اگر کاربر قبلاً تمدید کرده باشد (اشتراک فعال دیگری با پایان دیرتر
 *     دارد)، پیامک «تمدید کنید» فرستاده نمی‌شود؛
 *   • شکست ارسال قفل را آزاد می‌کند تا اجرای بعدی دوباره تلاش کند.
 *
 * پیامک از «اعتبار پیامک» آرایشگر کسر نمی‌شود؛ این یک پیامک سیستمیِ
 * اطلاع‌رسانی از سمت منشیم است (مثل پیامک تأیید پروفایل).
 */
@Injectable()
export class PublicPageExpiryReminderService {
  private readonly logger = new Logger(PublicPageExpiryReminderService.name);

  /** حداکثر تعداد اشتراکی که در هر اجرا بررسی می‌شود. */
  private static readonly BATCH_LIMIT = 200;

  constructor(
    @InjectRepository(UserSubscription)
    private readonly userSubscriptionRepo: Repository<UserSubscription>,

    private readonly bookingSmsService: BookingSmsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendExpiryReminders(): Promise<number> {
    const now = new Date();
    const threshold = new Date(
      now.getTime() + PUBLIC_PAGE_EXPIRING_REMINDER_DAYS * 86_400_000,
    );

    /**
     * نامزدها: اشتراک فعالِ صفحهٔ اختصاصی که پایانش بین «الان» و «۷ روز
     * بعد» است و هنوز یادآوری نگرفته است. شرطِ «تمدید نکرده باشد» با
     * `EXISTS` در همان کوئری اعمال می‌شود تا برای هر ردیف کوئری اضافه نزنیم.
     */
    const candidates = await this.userSubscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
      .innerJoinAndSelect('subscription.user', 'user')
      .where('plan.plan_type = :planType', { planType: PUBLIC_PAGE_PLAN_TYPE })
      .andWhere('subscription.status = :status', {
        status: UserSubscriptionStatus.ACTIVE,
      })
      .andWhere('subscription.expiry_reminder_sms_sent_at IS NULL')
      .andWhere('subscription.end_date > :now', { now })
      .andWhere('subscription.end_date <= :threshold', { threshold })
      .orderBy('subscription.end_date', 'ASC')
      .take(PublicPageExpiryReminderService.BATCH_LIMIT)
      .getMany();

    if (candidates.length === 0) return 0;

    let sent = 0;

    for (const subscription of candidates) {
      const phone = subscription.user?.phone;

      if (!phone) {
        this.logger.warn(
          `یادآوری پایان اشتراک (${subscription.id}): شمارهٔ آرایشگر خالی است`,
        );

        continue;
      }

      // کاربر همین حالا تمدید کرده → نیازی به هشدار نیست، فقط علامت بزن.
      const hasExtension = await this.userSubscriptionRepo
        .createQueryBuilder('other')
        .innerJoin('other.subscriptionPlan', 'otherPlan')
        .where('other.userId = :userId', { userId: subscription.userId })
        .andWhere('other.id != :id', { id: subscription.id })
        .andWhere('otherPlan.plan_type = :planType', {
          planType: PUBLIC_PAGE_PLAN_TYPE,
        })
        .andWhere('other.status = :status', {
          status: UserSubscriptionStatus.ACTIVE,
        })
        .andWhere('other.end_date > :endDate', {
          endDate: subscription.endDate,
        })
        .getCount();

      if (hasExtension > 0) {
        await this.claimReminder(subscription.id, now);
        continue;
      }

      /**
       * قفل اتمیک: فقط اگر هنوز `NULL` است پر می‌شود. اگر دو نمونه هم‌زمان
       * همین ردیف را ببینند، تنها یکی می‌تواند قفل را بگیرد و پیامک بفرستد.
       */
      const claimed = await this.claimReminder(subscription.id, now);
      if (!claimed) continue;

      const ok =
        await this.bookingSmsService.sendPublicPageExpiringReminderToBarber(
          phone,
          { barberName: subscription.user?.fullName },
        );

      if (ok) {
        sent += 1;
        continue;
      }

      // ارسال نشد → قفل آزاد می‌شود تا اجرای بعدی دوباره تلاش کند.
      await this.userSubscriptionRepo
        .update(
          { id: subscription.id, expiryReminderSmsSentAt: now },
          { expiryReminderSmsSentAt: null },
        )
        .catch(() => undefined);
    }

    if (sent > 0) {
      this.logger.log(
        `یادآوری پایان اشتراک صفحهٔ اختصاصی برای ${sent} آرایشگر ارسال شد`,
      );
    }

    return sent;
  }

  /** گرفتن اتمیک قفل ارسال؛ `true` یعنی این اجرا مجاز به ارسال است. */
  private async claimReminder(id: string, at: Date): Promise<boolean> {
    const result = await this.userSubscriptionRepo.update(
      { id, expiryReminderSmsSentAt: IsNull() },
      { expiryReminderSmsSentAt: at },
    );

    return Boolean(result.affected);
  }
}
