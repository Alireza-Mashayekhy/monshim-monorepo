import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { FrontendRevalidationService } from 'src/common/services/frontend-revalidation.service';
import { isDuplicateEntryError } from 'src/common/utils/db-error.util';
import {
  PUBLIC_PAGE_LEGACY_PLAN_KEY,
  PUBLIC_PAGE_PLAN_TYPE,
  PUBLIC_PAGE_TRIAL_PLAN_KEY,
  SMS_PLAN_TYPE,
  SMS_TRIAL_PLAN_KEY,
  SUBSCRIPTION_PLANS,
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

    // اختیاری تا تست‌های این سرویس بدون این وابستگی ساخته شوند و نبود آن
    // رفتار اصلی (انقضا در دیتابیس) را متوقف نکند.
    @Optional()
    private readonly frontendRevalidationService?: FrontendRevalidationService,
  ) {}

  /** Serialize queue changes across purchases, consumption and readers on the user row. */
  private async lockSubscriptionUser(userId: number, manager: EntityManager) {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
  }

  /** Caller must hold the user lock. Reserved rows have placeholder dates until promotion. */
  private async syncSmsQueueLocked(
    userId: number,
    manager: EntityManager,
    now: Date,
  ) {
    const repo = manager.getRepository(UserSubscription);
    // A locking read is essential under MySQL REPEATABLE READ: an enclosing
    // booking transaction may already have established an older snapshot.
    const rows = await repo
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
      .where('subscription.userId = :userId', { userId })
      .andWhere('subscription.status IN (:...statuses)', {
        statuses: [
          UserSubscriptionStatus.ACTIVE,
          UserSubscriptionStatus.RESERVED,
        ],
      })
      .andWhere('plan.planType = :planType', { planType: SMS_PLAN_TYPE })
      .orderBy('subscription.createdAt', 'ASC')
      .addOrderBy('subscription.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
    let expired = 0;
    for (const row of rows) {
      if (row.status !== UserSubscriptionStatus.ACTIVE) continue;
      // Old renewals were stored ACTIVE with a future start, often leaving no
      // usable current plan. Treat those as queued purchases instead.
      if (new Date(row.startDate).getTime() > now.getTime()) {
        row.status = UserSubscriptionStatus.RESERVED;
        await repo.save(row);
        continue;
      }
      const exhausted =
        Number(row.smsTotal) > 0 && Number(row.smsUsed) >= Number(row.smsTotal);
      if (new Date(row.endDate).getTime() <= now.getTime() || exhausted) {
        row.status = UserSubscriptionStatus.EXPIRED;
        await repo.save(row);
        expired++;
      }
    }
    let active =
      rows.find(row => row.status === UserSubscriptionStatus.ACTIVE) ?? null;
    while (!active) {
      const next = rows.find(
        row => row.status === UserSubscriptionStatus.RESERVED,
      );
      if (!next) break;
      next.status = UserSubscriptionStatus.ACTIVE;
      next.startDate = new Date(now);
      next.endDate = addPlanDuration(
        next.startDate,
        next.subscriptionPlan.durationDays,
        SMS_PLAN_TYPE,
      );
      if (
        next.endDate.getTime() <= now.getTime() ||
        (Number(next.smsTotal) > 0 &&
          Number(next.smsUsed) >= Number(next.smsTotal))
      ) {
        next.status = UserSubscriptionStatus.EXPIRED;
        expired++;
      } else {
        active = next;
      }
      await repo.save(next);
    }
    return { active, rows, expired };
  }

  /** On-demand promotion starts at actual activation; a delayed cron never burns a reserved term. */
  async syncAndPromoteUserSubscriptions(
    userId: number,
    manager?: EntityManager,
  ) {
    if (!manager)
      return this.userSubscriptionRepo.manager.transaction(tx =>
        this.syncAndPromoteUserSubscriptions(userId, tx),
      );
    await this.lockSubscriptionUser(userId, manager);
    return this.syncSmsQueueLocked(userId, manager, new Date());
  }

  /**
   * انقضای خودکار اشتراک‌ها.
   *
   * پیش از این وضعیت `expired` فقط وقتی نوشته می‌شد که کاربر صفحهٔ اشتراک را
   * باز می‌کرد؛ یعنی گزارش‌ها و بررسی اعتبار پیامک می‌توانستند اشتراک
   * منقضی‌شده را «فعال» ببینند.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireOverdueSubscriptions(): Promise<number> {
    const now = new Date();

    // شناسهٔ آرایشگرهایی که اشتراک «پروفایل اختصاصی»شان همین الان منقضی
    // می‌شود، پیش از آپدیت انبوه خوانده می‌شود تا بتوان کش صفحهٔ عمومی و
    // sitemap در فرانت را پاک کرد؛ بدون این، صفحه/اسلاگِ کاربرِ منقضی‌شده
    // تا پایان بازهٔ کش فرانت (۵ دقیقه) هم در Providers دیده می‌شد و هم
    // sitemap آن را اعلام می‌کرد (پذیرش/خروج از شمول باید همان لحظه باشد).
    // فقط پلن‌های public_page اطلاع‌رسانی می‌شوند؛ انقضای پیامکی ربطی به
    // کش عمومی ندارد. فراخوانی webhook عمداً fire-and-forget است تا کندی
    // یا خطای فرانت، انقضای دیتابیس را متوقف نکند.
    const expiringPublicPageUsers = await this.userSubscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoin('subscription.subscriptionPlan', 'plan')
      .select('DISTINCT subscription.userId', 'userId')
      .where('subscription.status = :status', {
        status: UserSubscriptionStatus.ACTIVE,
      })
      .andWhere('subscription.endDate < :now', { now })
      .andWhere('plan.planType = :planType', {
        planType: PUBLIC_PAGE_PLAN_TYPE,
      })
      .getRawMany<{ userId: string | number }>()
      .catch((error: unknown) => {
        // اگر خواندن این فهرست خطا بدهد، انقضای اصلی همچنان اجرا می‌شود؛
        // فقط کش فرانت دیرتر (با بازهٔ زمانی) تازه می‌شود.
        this.logger.warn(
          `خواندن فهرست اشتراک‌های منقضی‌شدهٔ پروفایل اختصاصی ناموفق بود: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [] as Array<{ userId: string | number }>;
      });

    const result = await this.userSubscriptionRepo
      .createQueryBuilder()
      .update(UserSubscription)
      .set({ status: UserSubscriptionStatus.EXPIRED })
      .where('status = :status', { status: UserSubscriptionStatus.ACTIVE })
      .andWhere('end_date <= :now', { now })
      .andWhere(
        'subscription_plan_id IN (SELECT id FROM subscription_plans WHERE plan_type = :planType)',
        { planType: PUBLIC_PAGE_PLAN_TYPE },
      )
      .execute();

    const smsUsers = await this.userSubscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoin('subscription.subscriptionPlan', 'plan')
      .select('DISTINCT subscription.userId', 'userId')
      .where('plan.planType = :planType', { planType: SMS_PLAN_TYPE })
      .andWhere('subscription.status IN (:...statuses)', {
        statuses: [
          UserSubscriptionStatus.ACTIVE,
          UserSubscriptionStatus.RESERVED,
        ],
      })
      .getRawMany<{ userId: string | number }>();
    let smsExpired = 0;
    for (const row of smsUsers) {
      const userId = Number(row.userId);
      if (!Number.isInteger(userId) || userId < 1) continue;
      try {
        smsExpired += (await this.syncAndPromoteUserSubscriptions(userId))
          .expired;
      } catch (error) {
        this.logger.error(
          `همگام‌سازی اشتراک پیامکی کاربر ${userId} ناموفق بود: ${String(error)}`,
        );
      }
    }
    const affected = (result.affected ?? 0) + smsExpired;
    if (affected > 0) {
      this.logger.log(`${affected} اشتراک منقضی‌شده به‌صورت خودکار بسته شد`);
    }

    for (const row of expiringPublicPageUsers) {
      const userId = Number(row.userId);
      if (!Number.isInteger(userId) || userId < 1) continue;
      // اسلاگ معلوم نیست؛ پاک‌سازی با userId + تگ مشترک `public-api-data`
      // همهٔ صفحهٔ عمومی/فهرست/sitemap را پوشش می‌دهد.
      this.frontendRevalidationService?.notifyBarberProfileChanged({ userId });
    }

    return affected;
  }

  /**
   * اشتراک فعال کاربر را بر اساس نوع پلن می‌خواند.
   *
   * پیش‌فرض `sms` است تا رفتار فعلی مسیرهای پیامکی و صفحهٔ «اشتراک»
   * داشبورد بدون تغییر بماند. مسیرهای پروفایل اختصاصی با
   * `planType = 'public_page'` کار می‌کنند.
   *
   * `manager` وقتی داده می‌شود، خوانش از **درون همان تراکنش** انجام می‌شود
   * (مثلاً مسیر ثبت رزرو دستی که بررسی اشتراک و کسر سهمیه باید با ثبت نوبت
   * یک‌جا commit یا rollback شوند). بدون آن، رفتار قبلی حفظ می‌شود.
   */
  async getCurrent(
    userId: number,
    planType: SubscriptionPlanType = SMS_PLAN_TYPE,
    manager?: EntityManager,
  ) {
    if (planType === SMS_PLAN_TYPE) {
      return (await this.syncAndPromoteUserSubscriptions(userId, manager))
        .active;
    }
    const repo = manager
      ? manager.getRepository(UserSubscription)
      : this.userSubscriptionRepo;
    const now = new Date();
    return (
      (await repo
        .createQueryBuilder('subscription')
        .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
        .where('subscription.userId = :userId', { userId })
        .andWhere('subscription.status = :status', {
          status: UserSubscriptionStatus.ACTIVE,
        })
        .andWhere('plan.planType = :planType', { planType })
        // A paid renewal can be queued after the current term. Do not make it
        // active before its start, and use the same interval predicate as the
        // public directory/sitemap.
        .andWhere('subscription.startDate <= :now', { now })
        .andWhere('subscription.endDate > :now', { now })
        .orderBy('subscription.endDate', 'DESC')
        .getOne()) ?? null
    );
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
    const now = new Date();

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
      .andWhere('subscription.startDate <= :now', { now })
      .andWhere('subscription.endDate > :now', { now })
      .getMany();
  }

  /**
   * همهٔ اشتراک‌های «پروفایل اختصاصی» یک فهرست کاربران (هر وضعیت و هر دوره)،
   * به تفکیک جدیدترین اول.
   *
   * تفاوت با `findActivePublicPageSubscriptionsForUsers`: آن یکی فقط اشتراکِ
   * فعالِ در بازه را می‌دهد (برای Providers/Sitemap کافی است)، اما داشبورد
   * آرایشگر و پنل مدیریت باید «آخرین اشتراک حتی اگر منقضی شده» را هم ببینند
   * تا وضعیت غیرفعال را با تاریخ پایان و پلن نمایش دهند، نه با یک Badge خالی.
   * `summarizePublicPageSubscriptionsByUser` روی این خروجی اعمال می‌شود.
   */
  async findPublicPageSubscriptionsForUsers(userIds: number[]) {
    if (userIds.length === 0) return [];

    return this.userSubscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
      .where('subscription.userId IN (:...userIds)', { userIds })
      .andWhere('plan.planType = :planType', {
        planType: PUBLIC_PAGE_PLAN_TYPE,
      })
      .orderBy('subscription.endDate', 'DESC')
      .getMany();
  }

  /**
   * همهٔ اشتراک‌های «پیامکی» یک فهرست کاربران (هر وضعیت و هر دوره).
   *
   * برای «لیست پلن‌های کاربران» در پنل مدیریت استفاده می‌شود؛ خروجی با
   * `summarizeSmsSubscriptionsByUser` خلاصه می‌شود تا برای هر آرایشگر
   * اشتراکِ فعالِ واقعی (status + بازهٔ زمانی) همراه با سهمیهٔ پیامک
   * (کل/مصرف‌شده/باقی‌مانده/درصد) به‌دست بیاید و اشتراک‌های قدیمی با
   * اشتراک فعال اشتباه نشوند.
   */
  async findSmsSubscriptionsForUsers(userIds: number[]) {
    if (userIds.length === 0) return [];
    for (const userId of [...new Set(userIds)])
      await this.syncAndPromoteUserSubscriptions(userId);

    return this.userSubscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
      .where('subscription.userId IN (:...userIds)', { userIds })
      .andWhere('plan.planType = :planType', {
        planType: SMS_PLAN_TYPE,
      })
      .orderBy('subscription.endDate', 'DESC')
      .getMany();
  }

  async findAll(userId: number) {
    await this.syncAndPromoteUserSubscriptions(userId);
    return this.userSubscriptionRepo.find({
      where: {
        userId,
      },
      relations: {
        subscriptionPlan: true,
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
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
    return this.subscriptionService.findActiveSmsPlans();
  }

  /** پلن‌های قابل انتخاب برای خرید/تمدید پروفایل اختصاصی. */
  getPublicPagePlans() {
    return this.subscriptionService.findPublicPagePurchasePlans();
  }

  /** One welcome gift per user, serialized with SMS purchases and consumption. */
  async grantFreeSmsTrial(
    userId: number,
    manager?: EntityManager,
  ): Promise<{ subscription: UserSubscription; created: boolean }> {
    if (!manager) {
      return this.userSubscriptionRepo.manager.transaction(tx =>
        this.grantFreeSmsTrial(userId, tx),
      );
    }

    await this.lockSubscriptionUser(userId, manager);
    const planRepo = manager.getRepository(SubscriptionPlan);
    const subscriptionRepo = manager.getRepository(UserSubscription);
    const definition = SUBSCRIPTION_PLANS.find(
      item => item.planKey === SMS_TRIAL_PLAN_KEY,
    );
    if (!definition)
      throw new Error(`Missing ${SMS_TRIAL_PLAN_KEY} plan definition`);
    let plan = await planRepo.findOne({
      where: { planKey: SMS_TRIAL_PLAN_KEY },
    });

    if (!plan) {
      try {
        plan = await planRepo.save(
          planRepo.create({ ...definition, isActive: true }),
        );
      } catch (error) {
        if (!isDuplicateEntryError(error)) throw error;
        // A locking read sees the winning insert even if the signup transaction
        // already established a REPEATABLE READ snapshot before the conflict.
        plan = await planRepo.findOne({
          where: { planKey: SMS_TRIAL_PLAN_KEY },
          lock: { mode: 'pessimistic_write' },
        });
      }
      if (!plan) throw new Error(`Unable to create ${SMS_TRIAL_PLAN_KEY} plan`);
    }

    // Unlike purchasable plans, the gift has a fixed entitlement. Correct a
    // stale or accidentally edited row before deriving the new subscription.
    if (
      plan.planType !== SMS_PLAN_TYPE ||
      Number(plan.smsCount) !== definition.smsCount ||
      Number(plan.price) !== 0 ||
      plan.durationDays !== definition.durationDays
    ) {
      plan.planType = SMS_PLAN_TYPE;
      plan.smsCount = definition.smsCount;
      plan.price = 0;
      plan.durationDays = definition.durationDays;
      plan = await planRepo.save(plan);
    }

    // Locking read, not a snapshot read: another transaction may have committed
    // an SMS subscription while this transaction waited for the user lock.
    const existing = await subscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.subscriptionPlan', 'plan')
      .where('subscription.userId = :userId', { userId })
      .andWhere('plan.planType = :planType', { planType: SMS_PLAN_TYPE })
      .orderBy('subscription.createdAt', 'DESC')
      .setLock('pessimistic_write')
      .getOne();
    if (existing) return { subscription: existing, created: false };

    const now = new Date();
    const saved = await subscriptionRepo.save(
      subscriptionRepo.create({
        userId,
        subscriptionPlanId: plan.id,
        price: 0,
        smsTotal: Number(plan.smsCount),
        smsUsed: 0,
        status: UserSubscriptionStatus.ACTIVE,
        startDate: now,
        endDate: addPlanDuration(now, plan.durationDays, SMS_PLAN_TYPE),
        freeTrialSmsSentAt: null,
      }),
    );
    return { subscription: saved, created: true };
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
    // For backfill/admin calls, create a transaction and serialize grants on
    // the user's row. Signup already passes its transaction manager. This
    // closes the check-then-insert race when two instances backfill together.
    if (!manager) {
      return this.userSubscriptionRepo.manager.transaction(transactionManager =>
        this.grantFreePublicPageTrial(userId, transactionManager),
      );
    }

    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) return null;

    const subscriptionRepo = manager.getRepository(UserSubscription);
    const planRepo = manager.getRepository(SubscriptionPlan);

    let plan = await planRepo.findOne({
      where: { planKey: PUBLIC_PAGE_TRIAL_PLAN_KEY },
    });

    // ثبت‌نام نباید به‌طور خاموش بدون اشتراک موفق شود فقط چون seed عمومی
    // (که در production ممکن است با feature flag غیرفعال باشد) اجرا نشده است.
    // این پلنِ غیرقابل‌خرید را به‌صورت حداقلی و idempotent ایجاد می‌کنیم.
    if (!plan) {
      const definition = SUBSCRIPTION_PLANS.find(
        item => item.planKey === PUBLIC_PAGE_TRIAL_PLAN_KEY,
      );
      if (!definition) {
        this.logger.error(
          `تعریف پلن ${PUBLIC_PAGE_TRIAL_PLAN_KEY} در کد موجود نیست.`,
        );
        return null;
      }

      try {
        plan = await planRepo.save(
          planRepo.create({
            planKey: definition.planKey,
            name: definition.name,
            smsCount: definition.smsCount,
            price: definition.price,
            durationDays: definition.durationDays,
            description: definition.description,
            isActive: true,
            sortOrder: definition.sortOrder,
            planType: definition.planType,
          }),
        );
      } catch (error) {
        // اگر چند ثبت‌نام هم‌زمان اولین ردیف را بسازند، کلید یکتای plan_key
        // برنده را تعیین می‌کند و درخواست دیگر همان ردیف را دوباره می‌خواند.
        if (!isDuplicateEntryError(error)) throw error;
        plan = await planRepo.findOne({
          where: { planKey: PUBLIC_PAGE_TRIAL_PLAN_KEY },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (!plan) {
        this.logger.error(
          `پلن ${PUBLIC_PAGE_TRIAL_PLAN_KEY} پس از ایجاد مجدد خوانده نشد.`,
        );
        return null;
      }
    }

    // اگر پلن از نسخهٔ قدیمی یا seed ناقص با نوع پیش‌فرض sms ثبت شده باشد،
    // رابطهٔ اشتراک از Queryهای public_page پنهان می‌ماند. این پلن فقط
    // برای صفحهٔ اختصاصی تعریف شده و نوع آن باید حتماً اصلاح شود.
    if (plan.planType !== PUBLIC_PAGE_PLAN_TYPE) {
      plan.planType = PUBLIC_PAGE_PLAN_TYPE;
      plan = await planRepo.save(plan);
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
        // دیگر کاندیدها هم در صورت نبود کاربر/پلن قابل اعطا نیستند.
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

  /** SMS purchases are serialized and queued until activation; public-page renewals retain their existing behavior. */
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

    if (plan.planType === SMS_PLAN_TYPE) {
      return this.userSubscriptionRepo.manager.transaction(async manager => {
        await this.lockSubscriptionUser(userId, manager);
        const now = new Date();
        const { active, rows } = await this.syncSmsQueueLocked(
          userId,
          manager,
          now,
        );
        const queued =
          active ||
          rows.some(
            row =>
              row.status === UserSubscriptionStatus.ACTIVE ||
              row.status === UserSubscriptionStatus.RESERVED,
          );
        const repo = manager.getRepository(UserSubscription);
        return repo.save(
          repo.create({
            userId,
            subscriptionPlanId: plan.id,
            price: plan.price,
            smsTotal: Number(plan.smsCount ?? 0),
            smsUsed: 0,
            status: queued
              ? UserSubscriptionStatus.RESERVED
              : UserSubscriptionStatus.ACTIVE,
            // Non-null schema: dates are placeholders only while RESERVED.
            startDate: now,
            endDate: addPlanDuration(now, plan.durationDays, SMS_PLAN_TYPE),
            freeTrialSmsSentAt: null,
          }),
        );
      });
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

  /**
   * Atomically debit the active plan and, if necessary, subsequent reserved
   * plans. The user-row lock serializes purchases, promotion and consumption;
   * the supplied manager makes the entire operation part of the caller's transaction.
   */
  async deductSms(
    userId: number,
    count = 1,
    reason = 'ارسال پیامک',
    manager?: EntityManager,
  ): Promise<UserSubscription> {
    if (!Number.isInteger(count) || count < 1) {
      throw new BadRequestException('تعداد پیامک برای کسر باید حداقل ۱ باشد');
    }
    if (!manager)
      return this.userSubscriptionRepo.manager.transaction(tx =>
        this.deductSms(userId, count, reason, tx),
      );
    await this.lockSubscriptionUser(userId, manager);
    const repo = manager.getRepository(UserSubscription);
    const usageRepo = manager.getRepository(SmsUsage);
    const now = new Date();
    let { active, rows } = await this.syncSmsQueueLocked(userId, manager, now);
    if (!active)
      throw new BadRequestException(
        'برای ارسال پیامک ابتدا باید یکی از پلن‌های اشتراک را خریداری کنید',
      );
    const available = rows
      .filter(
        row =>
          row.id === active!.id ||
          row.status === UserSubscriptionStatus.RESERVED,
      )
      .reduce(
        (sum, row) =>
          sum + Math.max(0, Number(row.smsTotal) - Number(row.smsUsed)),
        0,
      );
    if (available < count)
      throw new BadRequestException(
        `اعتبار پیامک کافی نیست (پیامک باقی‌مانده: ${available})`,
      );
    let left = count;
    let last = active;
    while (left > 0 && active) {
      const remaining = Math.max(
        0,
        Number(active.smsTotal) - Number(active.smsUsed),
      );
      const used = Math.min(left, remaining);
      if (!used)
        throw new BadRequestException(
          'اعتبار پیامک کافی نیست یا اشتراک شما تغییر کرده است. صفحه را بازخوانی کنید',
        );
      active.smsUsed = Number(active.smsUsed) + used;
      await repo.save(active);
      await usageRepo.save(
        usageRepo.create({
          userId,
          userSubscriptionId: active.id,
          count: used,
          reason,
        }),
      );
      last = active;
      left -= used;
      if (active.smsTotal > 0 && active.smsUsed >= active.smsTotal) {
        ({ active, rows } = await this.syncSmsQueueLocked(
          userId,
          manager,
          now,
        ));
      }
    }
    if (left > 0)
      throw new BadRequestException(
        'اعتبار پیامک کافی نیست یا اشتراک شما تغییر کرده است. صفحه را بازخوانی کنید',
      );
    return active ?? last;
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
