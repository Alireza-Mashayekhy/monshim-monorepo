import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PUBLIC_PAGE_LEGACY_PLAN_KEY,
  PUBLIC_PAGE_PLAN_TYPE,
  PUBLIC_PAGE_TRIAL_PLAN_KEY,
  SMS_PLAN_TYPE,
  SubscriptionPlanType,
} from 'src/subscription/constants';
import { SubscriptionPlan } from 'src/subscription/entities/subscription-plan.entity';
import { User } from 'src/users/entities/user.entity';
import { EntityManager, Repository } from 'typeorm';

import { SmsUsage } from './entities/sms-usage.entity';
import {
  UserSubscription,
  UserSubscriptionStatus,
} from './entities/user-subscription.entity';
import { SubscriptionService } from './subscription.service';
import { addPlanDuration } from './subscription-dates';

@Injectable()
export class UserSubscriptionService {
  private readonly logger = new Logger(UserSubscriptionService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private readonly userSubscriptionRepo: Repository<UserSubscription>,

    @InjectRepository(SubscriptionPlan)
    private readonly subscriptionPlanRepo: Repository<SubscriptionPlan>,

    @InjectRepository(SmsUsage)
    private readonly smsUsageRepo: Repository<SmsUsage>,

    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * انقضای خودکار اشتراک‌ها.
   *
   * پیش از این وضعیت `expired` فقط وقتی نوشته می‌شد که کاربر صفحهٔ اشتراک را
   * باز می‌کرد؛ یعنی گزارش‌ها و بررسی اعتبار پیامک می‌توانستند اشتراک
   * منقضی‌شده را «فعال» ببینند.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireOverdueSubscriptions(): Promise<number> {
    const result = await this.userSubscriptionRepo
      .createQueryBuilder()
      .update(UserSubscription)
      .set({ status: UserSubscriptionStatus.EXPIRED })
      .where('status = :status', { status: UserSubscriptionStatus.ACTIVE })
      .andWhere('end_date < :now', { now: new Date() })
      .execute();

    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(`${affected} اشتراک منقضی‌شده به‌صورت خودکار بسته شد`);
    }

    return affected;
  }

  /**
   * اشتراک فعال کاربر را بر اساس نوع پلن می‌خواند.
   *
   * پیش‌فرض `sms` است تا رفتار فعلی مسیرهای پیامکی و صفحهٔ «اشتراک»
   * داشبورد بدون تغییر بماند. مسیرهای پروفایل اختصاصی با
   * `planType = 'public_page'` کار می‌کنند.
   */
  async getCurrent(
    userId: number,
    planType: SubscriptionPlanType = SMS_PLAN_TYPE,
  ) {
    const userSubscription = await this.userSubscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
      .where('subscription.userId = :userId', { userId })
      .andWhere('subscription.status = :status', {
        status: UserSubscriptionStatus.ACTIVE,
      })
      .andWhere('plan.planType = :planType', { planType })
      .orderBy('subscription.endDate', 'DESC')
      .getOne();

    if (!userSubscription) {
      return null;
    }

    // اگر منقضی شده
    if (userSubscription.endDate <= new Date()) {
      userSubscription.status = UserSubscriptionStatus.EXPIRED;

      await this.userSubscriptionRepo.save(userSubscription);

      return null;
    }

    return userSubscription;
  }

  /** اشتراک فعال «پروفایل اختصاصی» کاربر (دورهٔ رایگان یا تمدید پولی). */
  async getCurrentPublicPageSubscription(userId: number) {
    return this.getCurrent(userId, PUBLIC_PAGE_PLAN_TYPE);
  }

  /**
   * اشتراک‌های فعال پروفایل اختصاصی برای یک فهرست کاربران.
   * برای فهرست عمومی آرایشگاه‌ها (`/providers`) و sitemap استفاده می‌شود.
   */
  async findActivePublicPageSubscriptionsForUsers(userIds: number[]) {
    if (userIds.length === 0) return [];

    return this.userSubscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
      .where('subscription.userId IN (:...userIds)', { userIds })
      .andWhere('subscription.status = :status', {
        status: UserSubscriptionStatus.ACTIVE,
      })
      .andWhere('plan.planType = :planType', {
        planType: PUBLIC_PAGE_PLAN_TYPE,
      })
      .andWhere('subscription.endDate > :now', { now: new Date() })
      .getMany();
  }

  async findAll(userId: number) {
    return this.userSubscriptionRepo.find({
      where: {
        userId,
      },
      relations: {
        subscriptionPlan: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string, userId: number) {
    const userSubscription = await this.userSubscriptionRepo.findOne({
      where: {
        id,
        userId,
      },
      relations: {
        subscriptionPlan: true,
      },
    });

    if (!userSubscription) {
      throw new NotFoundException('اشتراک کاربر یافت نشد');
    }

    return userSubscription;
  }

  /**
   * پلن‌های فعال اشتراک پیامکی (همان‌هایی که صفحهٔ «اشتراک» داشبورد
   * نمایش می‌دهد). پلن‌های پروفایل اختصاصی اینجا نیستند.
   */
  async getActivePlans() {
    return this.subscriptionPlanRepo.find({
      where: {
        isActive: true,
        planType: SMS_PLAN_TYPE,
      },
      order: {
        sortOrder: 'ASC',
        price: 'ASC',
      },
    });
  }

  /** پلن‌های قابل انتخاب برای خرید/تمدید پروفایل اختصاصی. */
  getPublicPagePlans() {
    return this.subscriptionService.findPublicPagePurchasePlans();
  }

  /**
   * اعطای خودکار دورهٔ رایگان یک‌ماههٔ پروفایل اختصاصی پس از ثبت‌نام آرایشگر.
   *
   * • بدون پرداخت و بدون اقدام ادمین.
   * • تاریخ شروع دقیقاً زمان ثبت‌نام است و پایان یک ماه تقویمی بعد محاسبه
   *   می‌شود.
   * • این متد idempotent است: اگر کاربر از قبل هر اشتراک پروفایل اختصاصی
   *   دیگری داشته باشد، دورهٔ رایگان دوباره اعطا نمی‌شود (جلوگیری از
   *   سوءاستفاده/تکرار).
   *
   * `created = false` یعنی دورهٔ رایگان تکراری نبود و پیامک هم نباید دوباره
   * ارسال شود.
   */
  async grantFreePublicPageTrial(
    userId: number,
    manager?: EntityManager,
  ): Promise<{ subscription: UserSubscription; created: boolean } | null> {
    const subscriptionRepo = manager
      ? manager.getRepository(UserSubscription)
      : this.userSubscriptionRepo;
    const planRepo = manager
      ? manager.getRepository(SubscriptionPlan)
      : this.subscriptionPlanRepo;

    const plan = await planRepo.findOne({
      where: { planKey: PUBLIC_PAGE_TRIAL_PLAN_KEY },
    });

    if (!plan) {
      this.logger.warn(
        `پلن دورهٔ رایگان پروفایل اختصاصی (${PUBLIC_PAGE_TRIAL_PLAN_KEY}) یافت نشد؛ ` +
          'دورهٔ رایگان برای کاربر اعطا نشد. سرور را دوباره بالا بیاورید تا پلن‌ها seed شوند.',
      );
      return null;
    }

    /**
     * بررسی **همه** اشتراک‌های کاربر (نه فقط آخرین اشتراک) تا اگر کاربر
     * پروفایل اختصاصی را یک‌بار استفاده کرده باشد — حتی اگر بعداً اشتراک
     * پیامکی خریده باشد و آخرین اشتراکش sms باشد — دورهٔ رایگان دوباره
     * اعطا نشود.
     */
    const existingSubscriptions = await subscriptionRepo.find({
      where: { userId },
      relations: { subscriptionPlan: true },
      order: { createdAt: 'DESC' },
    });

    const existing = existingSubscriptions.find(
      subscription =>
        subscription.subscriptionPlan?.planType === PUBLIC_PAGE_PLAN_TYPE,
    );

    if (existing) {
      return { subscription: existing, created: false };
    }

    const saved = await this.saveNewSubscription(
      subscriptionRepo,
      userId,
      plan,
    );

    this.logger.log(
      `دورهٔ رایگان یک‌ماههٔ پروفایل اختصاصی برای کاربر ${userId} فعال شد ` +
        `(پایان: ${saved.endDate.toISOString()})`,
    );

    return { subscription: saved, created: true };
  }

  /**
   * تکمیل دورهٔ رایگان برای آرایشگرهایی که **قبل از** افزوده‌شدن این امکان
   * ثبت‌نام کرده‌اند.
   *
   * چرا لازم است؟
   * -------------
   * `grantFreePublicPageTrial` فقط در مسیر `registerBarber` صدا زده می‌شود؛
   * پس هر آرایشگری که پیش از استقرار این قابلیت ثبت‌نام کرده بود، هیچ ردیف
   * اشتراکی ندارد و صفحهٔ اختصاصی‌اش (با وجود اینکه شرط «یک ماه رایگان برای
   * هر ثبت‌نام» درباره‌اش صادق است) غیرفعال می‌ماند.
   *
   * این متد همان قاعده را برای کاربرانِ موجود اعمال می‌کند و کاملاً idempotent
   * است، چون از خودِ `grantFreePublicPageTrial` استفاده می‌کند که اگر کاربر
   * **هر** اشتراک `public_page` داشته باشد (رایگان، پولی یا مهلت انتقالی)
   * چیزی نمی‌سازد. پس اجرای مکرر (هر بوت) هیچ اشتراک تکراری یا تمدید ناخواسته
   * ایجاد نمی‌کند و پرداخت‌ها/مهلت‌های موجود دست‌نخورده می‌مانند.
   *
   * فقط کاربرانی بررسی می‌شوند که:
   *   • نقش `barber` دارند (آرایشگر واقعی، نه مشتری/ادمین)؛
   *   • پروفایل آرایشگر دارند؛
   *   • هنوز هیچ اشتراکی از نوع `public_page` ندارند.
   *
   * `dryRun` فقط می‌شمارد و چیزی نمی‌نویسد (برای بررسیِ پیش از اجرا).
   */
  async backfillFreePublicPageTrialForExistingBarbers(options?: {
    dryRun?: boolean;
  }): Promise<{
    candidates: number;
    granted: number;
    failed: number;
    dryRun: boolean;
  }> {
    const dryRun = Boolean(options?.dryRun);

    /**
     * کاربرانِ واجد شرایط: آرایشگر با پروفایل، که هیچ اشتراکِ `public_page`
     * ندارند. شرط آخر در SQL اعمال می‌شود (نه در حافظه) تا با تعداد زیاد
     * کاربران هم یک کوئری بماند.
     */
    const rows = await this.userSubscriptionRepo.manager
      .createQueryBuilder(User, 'user')
      .innerJoin('user.barberProfile', 'profile')
      .where('user.roles LIKE :roleLower OR user.roles LIKE :roleUpper', {
        roleLower: '%barber%',
        roleUpper: '%Barber%',
      })
      .andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM user_subscriptions subscription
          INNER JOIN subscription_plans plan
            ON plan.id = subscription.subscription_plan_id
          WHERE subscription.user_id = user.id
            AND plan.plan_type = :planType
        )`,
        { planType: PUBLIC_PAGE_PLAN_TYPE },
      )
      .select('user.id', 'id')
      .getRawMany<{ id: number }>();

    const candidates = rows
      .map(row => Number(row.id))
      .filter(id => Number.isInteger(id) && id > 0);

    if (dryRun || candidates.length === 0) {
      return { candidates: candidates.length, granted: 0, failed: 0, dryRun };
    }

    let granted = 0;
    let failed = 0;

    for (const [index, userId] of candidates.entries()) {
      const result = await this.grantFreePublicPageTrial(userId);

      if (result === null) {
        // پلن دورهٔ رایگان seed نشده؛ ادامه‌دادن فقط لاگ تکراری تولید می‌کند.
        failed = candidates.length - index;
        break;
      }

      if (result.created) granted += 1;
    }

    if (granted > 0) {
      this.logger.log(
        `دورهٔ رایگان یک‌ماههٔ پروفایل اختصاصی برای ${granted} آرایشگرِ ` +
          'ثبت‌نام‌کردهٔ قبلی فعال شد',
      );
    }

    if (failed > 0) {
      this.logger.warn(
        'پلن دورهٔ رایگان پروفایل اختصاصی یافت نشد؛ تکمیل آرایشگرهای قبلی ' +
          'انجام نشد. پلن‌ها را seed کنید (ENABLE_STARTUP_DATA_TASKS) و ' +
          'بک‌اند را دوباره بالا بیاورید.',
      );
    }

    return { candidates: candidates.length, granted, failed, dryRun };
  }

  /**
   * اعطای مهلت انتقالی ۶ ماهه به خریداران قبلی پکیج صفحهٔ اختصاصی.
   *
   * این متد idempotent است: اگر کاربر هر اشتراک `public_page` داشته باشد
   * (رایگان، پولی یا خودِ مهلت انتقالی) چیزی ساخته نمی‌شود تا مهلت انتقالی
   * دوباره اعطا نشود. رکورد خرید قبلی دست‌نخورده باقی می‌ماند.
   */
  async grantLegacyPublicPageAccess(
    userId: number,
  ): Promise<{ subscription: UserSubscription; created: boolean } | null> {
    const plan = await this.subscriptionPlanRepo.findOne({
      where: { planKey: PUBLIC_PAGE_LEGACY_PLAN_KEY },
    });

    if (!plan) {
      this.logger.warn(
        `پلن مهلت انتقالی پروفایل اختصاصی (${PUBLIC_PAGE_LEGACY_PLAN_KEY}) یافت نشد؛ ` +
          'انتقال خریداران قبلی انجام نشد.',
      );
      return null;
    }

    const existingSubscriptions = await this.userSubscriptionRepo.find({
      where: { userId },
      relations: { subscriptionPlan: true },
      order: { createdAt: 'DESC' },
    });

    const existing = existingSubscriptions.find(
      subscription =>
        subscription.subscriptionPlan?.planType === PUBLIC_PAGE_PLAN_TYPE,
    );

    if (existing) {
      return { subscription: existing, created: false };
    }

    const saved = await this.saveNewSubscription(
      this.userSubscriptionRepo,
      userId,
      plan,
    );

    this.logger.log(
      `مهلت انتقالی ۶ ماههٔ پروفایل اختصاصی برای کاربر ${userId} فعال شد ` +
        `(پایان: ${saved.endDate.toISOString()})`,
    );

    return { subscription: saved, created: true };
  }

  /**
   * ساخت ردیف اشتراک فعال برای یک پلن.
   *
   * منطق تاریخ در `addPlanDuration` است: پلن‌های `public_page` ماه تقویمی و
   * پلن‌های `sms` روزه‌ای. شروع همیشه زمان فعلی است؛ قاعدهٔ «اضافه‌شدن به
   * اعتبار باقی‌مانده» فقط در `activateSubscriptionAfterPayment` اعمال
   * می‌شود.
   */
  private async saveNewSubscription(
    subscriptionRepo: Repository<UserSubscription>,
    userId: number,
    plan: SubscriptionPlan,
  ): Promise<UserSubscription> {
    const now = new Date();

    return subscriptionRepo.save(
      subscriptionRepo.create({
        userId,
        subscriptionPlanId: plan.id,
        price: plan.price,
        smsTotal: 0,
        smsUsed: 0,
        status: UserSubscriptionStatus.ACTIVE,
        startDate: now,
        endDate: addPlanDuration(now, plan.durationDays, plan.planType),
        freeTrialSmsSentAt: null,
      }),
    );
  }

  /**
   * ثبت اشتراک پس از پرداخت موفق.
   *
   * قاعدهٔ تمدید: اگر اشتراک فعالِ هم‌نوعی قبل از پایان اعتبارش وجود داشته
   * باشد، مدتٔ پلن جدید به **انتهای اعتبار فعلی** اضافه می‌شود و اعتبار
   * پیامکیِ باقی‌مانده هم به پلن جدید منتقل می‌شود. اگر اشتراک منقضی شده
   * باشد (یا اصلاً وجود نداشته باشد)، اعتبار از زمان پرداخت موفق می‌شمارد.
   *
   * برای هر خرید یک رکورد اشتراک جدید ساخته می‌شود تا پلن خریداری‌شده،
   * مبلغ، مدت و تاریخ‌های شروع/پایان هر خرید به‌درستی در سوابق بماند.
   */
  async activateSubscriptionAfterPayment(
    userId: number,
    planId: string,
  ): Promise<UserSubscription | null> {
    const plan = await this.subscriptionPlanRepo.findOne({
      where: { id: planId },
    });

    if (!plan) {
      this.logger.warn(
        `activateSubscriptionAfterPayment: پلن ${planId} یافت نشد для کاربر ${userId}`,
      );
      return null;
    }

    const now = new Date();

    const activeSubscriptions = await this.userSubscriptionRepo.find({
      where: { userId, status: UserSubscriptionStatus.ACTIVE },
      relations: { subscriptionPlan: true },
      order: { endDate: 'DESC' },
    });

    const sameTypeActive = activeSubscriptions.find(
      subscription =>
        subscription.subscriptionPlan?.planType === plan.planType &&
        subscription.endDate > now,
    );

    const startDate = sameTypeActive
      ? new Date(sameTypeActive.endDate)
      : new Date(now);

    const endDate = addPlanDuration(
      startDate,
      plan.durationDays,
      plan.planType,
    );

    // اعتبار پیامکیِ باقی‌ماندهٔ اشتراک فعلی از بین نمی‌رود.
    const carryOverSms = sameTypeActive
      ? Math.max(
          0,
          Number(sameTypeActive.smsTotal ?? 0) -
            Number(sameTypeActive.smsUsed ?? 0),
        )
      : 0;

    // اشتراک‌های فعالِ هم‌نوع قبلی بسته می‌شوند تا فقط یک اشتراک فعال بماند.
    for (const subscription of activeSubscriptions) {
      if (subscription.subscriptionPlan?.planType !== plan.planType) {
        continue;
      }
      if (subscription.id === sameTypeActive?.id) continue;

      subscription.status = UserSubscriptionStatus.EXPIRED;
      await this.userSubscriptionRepo.save(subscription);
    }

    if (sameTypeActive) {
      sameTypeActive.status = UserSubscriptionStatus.EXPIRED;
      await this.userSubscriptionRepo.save(sameTypeActive);
    }

    const userSubscription = this.userSubscriptionRepo.create({
      userId,
      subscriptionPlanId: plan.id,
      price: plan.price,
      smsTotal: Number(plan.smsCount ?? 0) + carryOverSms,
      smsUsed: 0,
      status: UserSubscriptionStatus.ACTIVE,
      startDate,
      endDate,
      freeTrialSmsSentAt: null,
    });

    const saved = await this.userSubscriptionRepo.save(userSubscription);

    this.logger.log(
      `اشتراک کاربر ${userId} با پلن ${plan.planKey} فعال شد ` +
        `(شروع: ${startDate.toISOString()}، پایان: ${endDate.toISOString()})`,
    );

    return saved;
  }

  /**
   * ثبت idempotency پیامک اطلاع‌رسانی دورهٔ رایگان.
   *
   * فقط اولین فراخوان این متد `true` برمی‌گرداند؛ فراخوان‌های بعدی روی همان
   * اشتراک `false` می‌دهند تا پیامک تکراری ارسال نشود.
   */
  async claimFreeTrialSms(subscriptionId: string): Promise<boolean> {
    const result = await this.userSubscriptionRepo
      .createQueryBuilder()
      .update(UserSubscription)
      .set({ freeTrialSmsSentAt: new Date() })
      .where('id = :id', { id: subscriptionId })
      .andWhere('free_trial_sms_sent_at IS NULL')
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async deductSms(
    userId: number,
    count = 1,
    reason = 'ارسال پیامک',
  ): Promise<UserSubscription> {
    if (count < 1) {
      throw new BadRequestException('تعداد پیامک برای کسر باید حداقل ۱ باشد');
    }

    const subscription = await this.getCurrent(userId, SMS_PLAN_TYPE);

    if (!subscription) {
      throw new BadRequestException(
        'برای ارسال پیامک ابتدا باید یکی از پلن‌های اشتراک را خریداری کنید',
      );
    }

    const remaining = subscription.smsTotal - subscription.smsUsed;

    if (remaining < count) {
      throw new BadRequestException(
        `اعتبار پیامک کافی نیست (پیامک باقی‌مانده: ${remaining})`,
      );
    }

    /**
     * کسر اتمیک: شمارنده فقط اگر واقعاً اعتبار کافی باشد زیاد می‌شود.
     *
     * پیش از این مقدار خوانده و بعد ذخیره می‌شد؛ دو درخواست هم‌زمان
     * می‌توانستند هر دو از یک اعتبار عبور کنند و یکی از کسرها از بین برود
     * (اعتبار پیامک بیشتر از واقع مصرف می‌شد).
     */
    const updateResult = await this.userSubscriptionRepo
      .createQueryBuilder()
      .update(UserSubscription)
      .set({ smsUsed: () => 'sms_used + :count' })
      .where('id = :id', { id: subscription.id })
      .andWhere('status = :status', {
        status: UserSubscriptionStatus.ACTIVE,
      })
      .andWhere('sms_used + :count <= sms_total')
      .setParameters({ count })
      .execute();

    if (!updateResult.affected) {
      throw new BadRequestException(
        'اعتبار پیامک کافی نیست یا اشتراک شما تغییر کرده است. صفحه را بازخوانی کنید',
      );
    }

    // ثبت در دفتر مصرف پیامک
    await this.smsUsageRepo.save(
      this.smsUsageRepo.create({
        userId,
        userSubscriptionId: subscription.id,
        count,
        reason,
      }),
    );

    return (
      (await this.userSubscriptionRepo.findOne({
        where: { id: subscription.id },
      })) ?? subscription
    );
  }

  async getSmsUsageHistory(userId: number) {
    return this.smsUsageRepo.find({
      where: {
        userId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 50,
    });
  }
}
