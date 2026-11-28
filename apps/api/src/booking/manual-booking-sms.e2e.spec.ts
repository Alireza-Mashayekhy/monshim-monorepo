/**
 * تست یکپارچهٔ واقعی (real-SQL) برای «ثبت رزرو دستی با پلن پیامکی».
 *
 * تفاوت این فایل با `manual-booking-sms.spec.ts`: آنجا لایهٔ دیتابیس mock
 * می‌شود؛ اینجا کوئری‌های واقعی TypeORM روی یک پایگاه دادهٔ SQLite درون‌حافظه‌ای
 * اجرا می‌شوند. دلیل وجودی این تست دقیقاً همین است: باگ‌هایی مثل «نبودِ جدول
 * `sms_usages` در production» یا «SQL بدِ کسر سهمیه» هرگز با mock پیدا
 * نمی‌شوند — همهٔ ۵۲۱ تستِ mockی سبز بود، ولی مسیر پیامکیِ رزرو دستی در
 * production با ۵۰۰ می‌شکست.
 *
 * پوشش سناریوهای تسک (۱۱ سناریو):
 *  ۱) ثبت دستی با پلن فعال و سهمیهٔ کافی ← کسر دقیق + دفتر مصرف + پیامک
 *  ۲) سهمیهٔ باقی‌مانده کمتر از موردنیاز ← خطای دقیق، بدون کسر
 *  ۳) سهمیهٔ تمام‌شده ← خطای دقیق، بدون کسر
 *  ۴) بدون اشتراک پیامکی ← خطای دقیق، بدون کسر
 *  ۵) اشتراک منقضی‌شده ← بلاک
 *  ۶) اشتراک public_page فعال + اشتراک SMS فعال ← انتخاب درست اشتراک SMS
 *  ۷) چند اشتراک تاریخی ← انتخاب اشتراک فعال واقعی
 *  ۸) خطای سرویس ارسال پیامک ← رزرو پابرجا می‌ماند (پیامک پس از commit)
 *  ۹) خطا در ذخیرهٔ رزرو — پوشش‌داده‌شده در manual-booking-sms.spec.ts (rollback)؛
 *     اینجا نسخهٔ «جدول دفتر مصرف ناموجود» را داریم که تراکنش را رول‌بک می‌کند.
 *  ۱۰) درخواست هم‌زمان/تداخلی ← رزرو دوم رد می‌شود و سهمیه دست‌نخورده می‌ماند
 *  ۱۱) ثبت رزرو بدون ارسال پیامک (لینک بیعانه) ← بدون هیچ کسری
 *  ۱۲) نبودِ جدول `sms_usages` بدون اجرای گارد بوت ← خودترمیمیِ تنبلِ مسیر
 *      (`ensureManualBookingSchema`) جدول را می‌سازد و همان درخواست موفق می‌شود
 *  ۱۳) بعد از اجرای گارد اسکیما (`SubscriptionSchemaService`) ← همان درخواست موفق
 *  ۱۴) ستون‌های جاماندهٔ `bookings` (حالت واقعی production) + گارد بوت
 *      (`BookingSchemaService`) ← ستون‌ها اضافه و همان درخواست موفق می‌شود
 *  ۱۵) ستون‌های جاماندهٔ `bookings` + نبودِ `sms_usages` بدون هیچ گاردی ←
 *      خودترمیمیِ تنبل هر دو را می‌سازد و همان درخواست موفق می‌شود
 *
 * نکتهٔ فنی: SQLite دو قابلیت MySQL را ندارد و برای اجرای همان مسیرِ کد، دو
 * پچ محدود در ابتدای فایل انجام می‌شود (بدون تغییر رفتار منطق سرویس):
 *   • `SELECT … FOR UPDATE` و سطح ایزوله‌تراز `READ COMMITTED` پشتیبانی نمی‌شوند؛
 *   • binding مستقیم `Date` در پارامترهای خام ممکن نیست.
 */
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: {
    EVERY_HOUR: '0 0 * * * *',
    EVERY_10_MINUTES: '0 */10 * * * *',
  },
}));

import { BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { BarberProfile } from 'src/barber/entities/barber.entity';
import { BarberWorkHours } from 'src/barber/entities/barber-work-hours.entity';
import { ClubService } from 'src/club/club.service';
import { ClubCustomer } from 'src/club/entities/club-customer.entity';
import { CustomerGroup } from 'src/club/entities/customer-group.entity';
import { ensureEntitySchema } from 'src/common/utils/schema-guard.util';
import { BookingSmsService } from 'src/notification/booking-sms.service';
import { Service } from 'src/services/entities/service.entity';
import { SMS_PLAN_TYPE } from 'src/subscription/constants';
import { SmsUsage } from 'src/subscription/entities/sms-usage.entity';
import { SubscriptionPlan } from 'src/subscription/entities/subscription-plan.entity';
import {
  UserSubscription,
  UserSubscriptionStatus,
} from 'src/subscription/entities/user-subscription.entity';
import { SubscriptionService } from 'src/subscription/subscription.service';
import { UserSubscriptionService } from 'src/subscription/user-subscription.service';
import { User } from 'src/users/entities/user.entity';
import { DataSource, SelectQueryBuilder, Table } from 'typeorm';
import { BetterSqlite3QueryRunner } from 'typeorm/driver/better-sqlite3/BetterSqlite3QueryRunner';
import { AbstractSqliteDriver } from 'typeorm/driver/sqlite-abstract/AbstractSqliteDriver';
import { DateUtils } from 'typeorm/util/DateUtils';

import { BookingsService } from './booking.service';
import { Booking } from './entities/booking.entity';
import { SlotHold } from './entities/slot-hold.entity';

// ─── پچ‌های سازگاری SQLite (فقط برای محیط تست — رفتار منطق تغییر نمی‌کند) ───
// SQLite دو قابلیت MySQL را ندارد؛ همان دو نقطه‌ای که سرویس به MySQL تکیه دارد:
const origStartTx = (BetterSqlite3QueryRunner.prototype as any)
  .startTransaction as (this: unknown, isolation?: string) => Promise<unknown>;
(
  BetterSqlite3QueryRunner.prototype as unknown as Record<string, unknown>
).startTransaction = function (this: unknown, _isolation?: string) {
  // سطح ایزوله‌تراز «READ COMMITTED» در SQLite پشتیبانی نمی‌شود.
  return origStartTx.call(this, undefined);
};
const origQuery = (BetterSqlite3QueryRunner.prototype as any).query as (
  this: unknown,
  sql: string,
  parameters?: unknown[],
  useStructuredResult?: boolean,
) => Promise<unknown>;
(
  BetterSqlite3QueryRunner.prototype as unknown as Record<string, unknown>
).query = function (
  this: unknown,
  sql: string,
  parameters?: unknown[],
  useStructuredResult?: boolean,
) {
  // better-sqlite3 نمی‌تواند `Date` را مستقیم bind کند؛ همان قالبی که
  // preparePersistentValue برای datetime استفاده می‌کند.
  const normalized = (parameters ?? []).map(parameter =>
    parameter instanceof Date
      ? DateUtils.mixedDateToUtcDatetimeString(parameter)
      : parameter,
  );
  return origQuery.call(this, sql, normalized, useStructuredResult);
};
const origNormalizeType = (AbstractSqliteDriver.prototype as any)
  .normalizeType as (
  this: { supportedDataTypes: string[] },
  column: Record<string, unknown>,
) => string;
(
  AbstractSqliteDriver.prototype as unknown as Record<string, unknown>
).normalizeType = function (
  this: { supportedDataTypes: string[] },
  column: Record<string, unknown>,
) {
  let type = origNormalizeType.call(this, column);
  if (type === 'timestamp') type = 'datetime';
  else if (type === 'enum') type = 'varchar';
  else if (type === 'char') type = 'character';
  if (!this.supportedDataTypes.includes(type)) type = 'text';
  return type;
};
// قفل توصیفی (FOR UPDATE) در SQLite معنا ندارد؛ بی‌اثرش می‌کنیم.
(
  SelectQueryBuilder.prototype as unknown as Record<string, unknown>
).createLockExpression = () => '';

/** در نبود درایور (مثلاً محیطی که باینری native ندارد) کل سوئیت skip می‌شود. */
let betterSqlite3: unknown;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  betterSqlite3 = require('better-sqlite3');
} catch {
  betterSqlite3 = null;
}

const maybeDescribe = betterSqlite3 ? describe : describe.skip;

/** تاریخِ آینده تا بررسی‌های «زمان گذشته» همیشه سبز بمانند. */
const DATE = '2099-06-15';

interface SmsGatewayStub {
  calls: Array<{ mobile: string; templateId: number }>;
  failNext: boolean;
}

async function buildWorld() {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    // مسیر صریح برای پنجرهٔ node_modules ایزولهٔ pnpm
    driver: betterSqlite3,
    database: ':memory:',
    entities: [join(__dirname, '../**/*.entity.ts')],
    synchronize: true,
  });
  await dataSource.initialize();

  const smsStub: SmsGatewayStub = { calls: [], failNext: false };

  const userRepo = dataSource.getRepository(User);
  const barberRepo = dataSource.getRepository(BarberProfile);
  const serviceRepo = dataSource.getRepository(Service);
  const workHoursRepo = dataSource.getRepository(BarberWorkHours);
  const bookingRepo = dataSource.getRepository(Booking);
  const slotHoldRepo = dataSource.getRepository(SlotHold);
  const clubCustomerRepo = dataSource.getRepository(ClubCustomer);
  const groupRepo = dataSource.getRepository(CustomerGroup);
  const planRepo = dataSource.getRepository(SubscriptionPlan);
  const subscriptionRepo = dataSource.getRepository(UserSubscription);
  const smsUsageRepo = dataSource.getRepository(SmsUsage);

  const userSubscriptionService = new UserSubscriptionService(
    subscriptionRepo,
    planRepo,
    smsUsageRepo,
    {} as never, // SubscriptionService — در این مسیر استفاده نمی‌شود
    undefined, // FrontendRevalidationService — اختیاری
  );

  const clubService = new ClubService(
    clubCustomerRepo,
    groupRepo,
    barberRepo,
    userRepo,
  );

  const bookingSmsService = new BookingSmsService(
    {
      sendTemplate: async (mobile: string, templateId: number) => {
        if (smsStub.failNext) throw new Error('SMS gateway down');
        smsStub.calls.push({ mobile, templateId });
        return { messageId: '1' };
      },
    } as never, // SmsIrService (stub)
    { get: () => undefined } as never, // ConfigService
  );

  const service = new BookingsService(
    bookingRepo,
    barberRepo,
    serviceRepo,
    workHoursRepo,
    userRepo,
    slotHoldRepo,
    dataSource,
    {} as never, // WalletService — مسیر دستی استفاده نمی‌کند
    {} as never, // ReferralService — مسیر دستی استفاده نمی‌کند
    clubService,
    userSubscriptionService,
    bookingSmsService,
    undefined, // BaleNotificationService — اختیاری
  );

  // ─── دادهٔ پایه: آرایشگر تاییدشده + مشتری باشگاه + خدمت + ساعت کاری ───
  const barberUser = (await userRepo.save(
    userRepo.create({
      fullName: 'آرایشگر تست',
      phone: '09120000000',
      password: 'x',
      roles: ['barber'],
    } as never),
  )) as unknown as User;

  const barber = await barberRepo.save(
    barberRepo.create({
      userId: barberUser.id,
      salonName: 'پیرایش تست',
      address: 'تهران',
      isApproved: true,
    }),
  );

  const customerUser = (await userRepo.save(
    userRepo.create({
      fullName: 'مشتری تست',
      phone: '09130000000',
      password: 'x',
      roles: ['user'],
    } as never),
  )) as unknown as User;

  const member = await clubCustomerRepo.save(
    clubCustomerRepo.create({
      barberId: barber.id,
      customerId: customerUser.id,
      fullName: 'مشتری تست',
      phone: '09130000000',
      groupId: null,
    }),
  );

  const svc = (await serviceRepo.save(
    serviceRepo.create({
      barberId: barberUser.id,
      name: 'اصلاح مو',
      price: 250000,
      durationMinutes: 30,
      isActive: true,
    } as never),
  )) as unknown as Service;

  await workHoursRepo.save(
    workHoursRepo.create({
      barberId: barber.id,
      dayOfWeek: (new Date(`${DATE}T00:00:00Z`).getDay() + 1) % 7,
      startTime: '08:00',
      endTime: '22:00',
      isDayOff: false,
    } as never),
  );

  const smsPlan = await planRepo.save(
    planRepo.create({
      planKey: 'starter',
      name: 'پلن آغاز',
      smsCount: 100,
      price: 59000,
      durationDays: 30,
      description: '',
      isActive: true,
      sortOrder: 1,
      planType: SMS_PLAN_TYPE,
    }),
  );

  const publicPagePlan = await planRepo.save(
    planRepo.create({
      planKey: 'public_page_trial',
      name: 'پروفایل اختصاصی رایگان',
      smsCount: 0,
      price: 0,
      durationDays: 30,
      description: '',
      isActive: true,
      sortOrder: 10,
      planType: 'public_page',
    }),
  );

  return {
    dataSource,
    service,
    userSubscriptionService,
    smsStub,
    repos: { subscriptionRepo, smsUsageRepo, bookingRepo, planRepo },
    ids: {
      barberUserId: barberUser.id,
      customerId: customerUser.id,
      clubMemberId: member.id,
      serviceId: svc.id,
      smsPlanId: smsPlan.id,
      publicPagePlanId: publicPagePlan.id,
    },
    cleanup: () => dataSource.destroy(),
  };
}

type World = Awaited<ReturnType<typeof buildWorld>>;

/** اشتراک پیامکی فعال برای آرایشگر می‌سازد (مثل خروجی activateSubscriptionAfterPayment). */
async function grantSmsPlan(
  world: World,
  opts?: {
    smsTotal?: number;
    smsUsed?: number;
    status?: UserSubscriptionStatus;
    startOffsetDays?: number;
    endOffsetDays?: number;
    /** اشتراک قبلی را منقضی نکن (برای سناریوی چند اشتراک تاریخی) */
    keepOld?: boolean;
  },
) {
  const repo = world.repos.subscriptionRepo;

  if (!opts?.keepOld) {
    // مثل activateSubscriptionAfterPayment: اشتراک فعال قبلی بسته می‌شود.
    await repo
      .createQueryBuilder()
      .update(UserSubscription)
      .set({ status: UserSubscriptionStatus.EXPIRED })
      .where('status = :status', { status: UserSubscriptionStatus.ACTIVE })
      .execute();
  }

  const now = Date.now();
  const day = 24 * 3600 * 1000;

  return repo.save(
    repo.create({
      userId: world.ids.barberUserId,
      subscriptionPlanId: world.ids.smsPlanId,
      price: 59000,
      smsTotal: opts?.smsTotal ?? 100,
      smsUsed: opts?.smsUsed ?? 0,
      status: opts?.status ?? UserSubscriptionStatus.ACTIVE,
      startDate: new Date(now + (opts?.startOffsetDays ?? 0) * day),
      endDate: new Date(now + (opts?.endOffsetDays ?? 30) * day),
      freeTrialSmsSentAt: null,
    }),
  );
}

const baseDto = (world: World, time: string) => ({
  clubCustomerId: world.ids.clubMemberId,
  serviceIds: [world.ids.serviceId],
  date: DATE,
  time,
  sendDepositLink: false,
});

/** ستون‌های مسیر «ثبت رزرو دستی» روی bookings که در production جامانده بودند. */
const BOOKING_MANUAL_COLUMNS = [
  'send_deposit_link',
  'send_sms_reminder',
  'reminder_hours',
  'reminder_sent_at',
  'deposit_token',
  'deposit_paid_at',
] as const;

/**
 * شبیه‌سازی production: حذف ستون‌های مسیر ثبت دستی از جدول bookings.
 *
 * SQLite اجازهٔ DROP COLUMN روی ستونِ دارای UNIQUE (مثل deposit_token)
 * نمی‌دهد؛ پس جدول bookings را از روی متادیتای entity و **بدون** آن
 * ستون‌ها (و ایندکس/محدودیت‌های مربوطه) دوباره می‌سازیم. چون در این
 * سناریوها هنوز رزرو ساخته نشده، حذف جدول داده‌ای از دست نمی‌دهد.
 */
async function dropBookingManualColumns(world: World) {
  const metadata = world.dataSource.getMetadata(Booking);
  const table = Table.create(metadata, world.dataSource.driver);
  const manual = new Set<string>(BOOKING_MANUAL_COLUMNS);
  table.columns = table.columns.filter(column => !manual.has(column.name));
  table.indices = table.indices.filter(index =>
    index.columnNames.every(name => !manual.has(name)),
  );
  table.uniques = table.uniques.filter(unique =>
    unique.columnNames.every(name => !manual.has(name)),
  );
  table.checks = table.checks.filter(
    check => !(check.columnNames ?? []).some(name => manual.has(name)),
  );

  const runner = world.dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('DROP TABLE bookings');
    await runner.createTable(table, false);
  } finally {
    await runner.release();
  }
}

/**
 * شبیه‌سازی «مشتری یتیم» با حالت واقعی production: چون در production قید FK
 * روی `club_customers.customer_id` وجود ندارد، حذفِ hard حساب مشتری رکورد
 * باشگاه را با `customerId` اشاره‌کننده به ردیف حذف‌شدهٔ `user` باقی می‌گذارد.
 * (اگر FK وجود داشت، SQLite خودش رکورد باشگاه را cascade می‌کرد.)
 */
async function orphanClubMember(world: World) {
  const runner = world.dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('PRAGMA foreign_keys = OFF');
    await runner.query('DELETE FROM "user" WHERE id = ?', [
      world.ids.customerId,
    ]);
    await runner.query('PRAGMA foreign_keys = ON');
  } finally {
    await runner.release();
  }
}

maybeDescribe(
  'BookingsService.createManualByBarber — real-SQL e2e (SMS plan)',
  () => {
    it('welcome gift is created in a transaction, usable immediately and queues later purchases', async () => {
      const world = await buildWorld();
      try {
        const gift = await world.dataSource.transaction(manager =>
          world.userSubscriptionService.grantFreeSmsTrial(
            world.ids.barberUserId,
            manager,
          ),
        );
        expect(gift.created).toBe(true);
        expect(gift.subscription).toMatchObject({
          price: 0,
          smsTotal: 50,
          smsUsed: 0,
          status: UserSubscriptionStatus.ACTIVE,
        });
        expect(
          (
            await world.userSubscriptionService.getCurrent(
              world.ids.barberUserId,
            )
          )?.id,
        ).toBe(gift.subscription.id);
        expect(
          (
            await world.userSubscriptionService.grantFreeSmsTrial(
              world.ids.barberUserId,
            )
          ).created,
        ).toBe(false);
        const purchase =
          await world.userSubscriptionService.activateSubscriptionAfterPayment(
            world.ids.barberUserId,
            world.ids.smsPlanId,
          );
        expect(purchase?.status).toBe(UserSubscriptionStatus.RESERVED);
        await world.userSubscriptionService.deductSms(
          world.ids.barberUserId,
          50,
        );
        expect(
          (
            await world.userSubscriptionService.getCurrent(
              world.ids.barberUserId,
            )
          )?.id,
        ).toBe(purchase?.id);
      } finally {
        await world.cleanup();
      }
    });

    it('real SQL lists exclude the trial from purchase plans but retain it for administration', async () => {
      const world = await buildWorld();
      try {
        await world.userSubscriptionService.grantFreeSmsTrial(
          world.ids.barberUserId,
        );
        const plans = new SubscriptionService(world.repos.planRepo);
        const subscriptions = new UserSubscriptionService(
          world.repos.subscriptionRepo,
          world.repos.planRepo,
          world.repos.smsUsageRepo,
          plans,
        );
        expect(
          (await subscriptions.getActivePlans()).map(plan => plan.planKey),
        ).toEqual(['starter']);
        expect(
          (await plans.findActiveSmsPlans()).map(plan => plan.planKey),
        ).toEqual(['starter']);
        expect(
          (await plans.findActive()).map(plan => plan.planKey),
        ).not.toContain('sms_trial');
        expect((await plans.findAll()).map(plan => plan.planKey)).toContain(
          'sms_trial',
        );
      } finally {
        await world.cleanup();
      }
    });

    it('rolls back the user, both grants and a lazily created trial plan together', async () => {
      const world = await buildWorld();
      try {
        await expect(
          world.dataSource.transaction(async manager => {
            const repo = manager.getRepository(User);
            const user = (await repo.save(
              repo.create({
                fullName: 'جدید',
                phone: '09121112222',
                roles: ['barber'],
              } as never),
            )) as unknown as User;
            await world.userSubscriptionService.grantFreePublicPageTrial(
              user.id,
              manager,
            );
            await world.userSubscriptionService.grantFreeSmsTrial(
              user.id,
              manager,
            );
            throw new Error('rollback');
          }),
        ).rejects.toThrow('rollback');
        expect(
          await world.dataSource
            .getRepository(User)
            .findOneBy({ phone: '09121112222' }),
        ).toBeNull();
        expect(await world.repos.subscriptionRepo.count()).toBe(0);
        expect(
          await world.repos.planRepo.findOneBy({ planKey: 'sms_trial' }),
        ).toBeNull();
      } finally {
        await world.cleanup();
      }
    });

    it('۱. پلن فعال Starter (۱۰۰ پیامک) ← رزرو ثبت، ۲ اعتبار کسر و در دفتر مصرف ثبت می‌شود', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100, smsUsed: 0 });

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '10:00'),
      )) as { bookings: Booking[] };

      const subs = await world.repos.subscriptionRepo.find();
      const usages = await world.repos.smsUsageRepo.find();
      const bookings = await world.repos.bookingRepo.find();

      expect(result.bookings).toHaveLength(1);
      expect(bookings).toHaveLength(1);
      expect(bookings[0].status).toBe('confirmed');
      expect(subs[0].smsUsed).toBe(2);
      expect(usages).toHaveLength(1);
      expect(usages[0].count).toBe(2);
      expect(world.smsStub.calls).toHaveLength(1);

      await world.cleanup();
    });

    it('purchase leaves current active, reserves multiple plans and splits booking debit across the FIFO queue', async () => {
      const world = await buildWorld();
      const first = await grantSmsPlan(world, {
        smsTotal: 2,
        smsUsed: 1,
        startOffsetDays: -1,
      });
      const next =
        await world.userSubscriptionService.activateSubscriptionAfterPayment(
          world.ids.barberUserId,
          world.ids.smsPlanId,
        );
      const last =
        await world.userSubscriptionService.activateSubscriptionAfterPayment(
          world.ids.barberUserId,
          world.ids.smsPlanId,
        );
      expect(next?.status).toBe(UserSubscriptionStatus.RESERVED);
      expect(last?.status).toBe(UserSubscriptionStatus.RESERVED);
      expect(
        (await world.repos.subscriptionRepo.findOneByOrFail({ id: first.id }))
          .status,
      ).toBe(UserSubscriptionStatus.ACTIVE);
      // sqlite timestamps have second precision: establish a deterministic FIFO order.
      await world.repos.subscriptionRepo.update(next!.id, {
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      await world.repos.subscriptionRepo.update(last!.id, {
        createdAt: new Date('2026-01-02T00:00:00Z'),
      });
      await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '10:00'),
      );
      const firstAfter = await world.repos.subscriptionRepo.findOneByOrFail({
        id: first.id,
      });
      const nextAfter = await world.repos.subscriptionRepo.findOneByOrFail({
        id: next!.id,
      });
      const lastAfter = await world.repos.subscriptionRepo.findOneByOrFail({
        id: last!.id,
      });
      expect(firstAfter).toMatchObject({
        status: UserSubscriptionStatus.EXPIRED,
        smsUsed: 2,
      });
      expect(nextAfter).toMatchObject({
        status: UserSubscriptionStatus.ACTIVE,
        smsUsed: 1,
        smsTotal: 100,
      });
      expect(lastAfter.status).toBe(UserSubscriptionStatus.RESERVED);
      expect(nextAfter.endDate.getTime() - nextAfter.startDate.getTime()).toBe(
        30 * 86400000,
      );
      const usage = await world.repos.smsUsageRepo.find();
      expect(usage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userSubscriptionId: first.id, count: 1 }),
          expect.objectContaining({ userSubscriptionId: next!.id, count: 1 }),
        ]),
      );
      await world.cleanup();
    });

    it('late on-demand expiry gives the reserved plan a full new duration and list returns it active', async () => {
      const world = await buildWorld();
      const first = await grantSmsPlan(world, { startOffsetDays: -3 });
      const next =
        await world.userSubscriptionService.activateSubscriptionAfterPayment(
          world.ids.barberUserId,
          world.ids.smsPlanId,
        );
      await world.repos.subscriptionRepo.update(first.id, {
        endDate: new Date(Date.now() - 86_400_000),
      });
      const before = Date.now();
      const list = await world.userSubscriptionService.findAll(
        world.ids.barberUserId,
      );
      const promoted = list.find(item => item.id === next!.id)!;
      expect(promoted.status).toBe(UserSubscriptionStatus.ACTIVE);
      // MySQL DATETIME precision is seconds; allow that truncation here too.
      expect(promoted.startDate.getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
      expect(promoted.endDate.getTime() - promoted.startDate.getTime()).toBe(
        30 * 86400000,
      );
      expect(list.find(item => item.id === first.id)?.status).toBe(
        UserSubscriptionStatus.EXPIRED,
      );
      await world.cleanup();
    });

    it('cron expires exhausted SMS subscriptions and promotes the queue', async () => {
      const world = await buildWorld();
      const first = await grantSmsPlan(world, {
        smsTotal: 2,
        smsUsed: 1,
        startOffsetDays: -1,
      });
      const next =
        await world.userSubscriptionService.activateSubscriptionAfterPayment(
          world.ids.barberUserId,
          world.ids.smsPlanId,
        );
      await world.repos.subscriptionRepo.update(first.id, { smsUsed: 2 });
      expect(
        await world.userSubscriptionService.expireOverdueSubscriptions(),
      ).toBe(1);
      expect(
        await world.repos.subscriptionRepo.findOneByOrFail({ id: first.id }),
      ).toMatchObject({ status: UserSubscriptionStatus.EXPIRED });
      expect(
        await world.repos.subscriptionRepo.findOneByOrFail({ id: next!.id }),
      ).toMatchObject({ status: UserSubscriptionStatus.ACTIVE });
      await world.cleanup();
    });

    it('rolls back all cross-plan debits and promotion with its enclosing transaction', async () => {
      const world = await buildWorld();
      const first = await grantSmsPlan(world, {
        smsTotal: 2,
        smsUsed: 1,
        startOffsetDays: -1,
      });
      const next =
        await world.userSubscriptionService.activateSubscriptionAfterPayment(
          world.ids.barberUserId,
          world.ids.smsPlanId,
        );
      await expect(
        world.dataSource.transaction(async manager => {
          await world.userSubscriptionService.deductSms(
            world.ids.barberUserId,
            2,
            'rollback',
            manager,
          );
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(
        await world.repos.subscriptionRepo.findOneByOrFail({ id: first.id }),
      ).toMatchObject({ status: UserSubscriptionStatus.ACTIVE, smsUsed: 1 });
      expect(
        await world.repos.subscriptionRepo.findOneByOrFail({ id: next!.id }),
      ).toMatchObject({ status: UserSubscriptionStatus.RESERVED, smsUsed: 0 });
      expect(await world.repos.smsUsageRepo.count()).toBe(0);
      await world.cleanup();
    });

    it('۲ و ۳. سهمیهٔ کمتر از موردنیاز / تمام‌شده ← خطای دقیق و هیچ کسری', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 2, smsUsed: 1 }); // ۱ باقی‌مانده

      await expect(
        world.service.createManualByBarber(
          world.ids.barberUserId,
          baseDto(world, '10:00'),
        ),
      ).rejects.toThrow(/اعتبار پیامک کافی نیست.*باقی‌مانده: 1/);

      await grantSmsPlan(world, { smsTotal: 2, smsUsed: 2 }); // ۰ باقی‌مانده
      await expect(
        world.service.createManualByBarber(
          world.ids.barberUserId,
          baseDto(world, '11:00'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const subs = await world.repos.subscriptionRepo.find({
        relations: { subscriptionPlan: true },
      });
      const exhausted = subs.find(
        item => item.smsTotal === 2 && item.smsUsed === 2,
      );
      expect(exhausted?.status).toBe(UserSubscriptionStatus.EXPIRED); // هیچ کسر جدیدی انجام نشد

      await world.cleanup();
    });

    it('۴. بدون اشتراک پیامکی ← خطای دقیق و هیچ کسری', async () => {
      const world = await buildWorld();

      await expect(
        world.service.createManualByBarber(
          world.ids.barberUserId,
          baseDto(world, '10:00'),
        ),
      ).rejects.toThrow(/پلن‌های اشتراک پیامکی را خریداری کنید/);

      await world.cleanup();
    });

    it('۵. اشتراک منقضی‌شده ← بلاک با پیام «خرید پلن»', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, {
        smsTotal: 100,
        startOffsetDays: -40,
        endOffsetDays: -10,
      });

      await expect(
        world.service.createManualByBarber(
          world.ids.barberUserId,
          baseDto(world, '10:00'),
        ),
      ).rejects.toThrow(/پلن‌های اشتراک پیامکی را خریداری کنید/);

      await world.cleanup();
    });

    it('۶. اشتراک public_page فعال + اشتراک SMS فعال ← اشتراک SMS استفاده می‌شود', async () => {
      const world = await buildWorld();

      await world.repos.subscriptionRepo.save(
        world.repos.subscriptionRepo.create({
          userId: world.ids.barberUserId,
          subscriptionPlanId: world.ids.publicPagePlanId,
          price: 0,
          smsTotal: 0,
          smsUsed: 0,
          status: UserSubscriptionStatus.ACTIVE,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          freeTrialSmsSentAt: null,
        }),
      );
      await grantSmsPlan(world, { smsTotal: 100, smsUsed: 10 });

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '10:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);

      const subs = await world.repos.subscriptionRepo.find({
        relations: { subscriptionPlan: true },
      });
      const smsSub = subs.find(
        item => item.subscriptionPlan?.planType === SMS_PLAN_TYPE,
      );
      // ۱۰ قبلی + ۲ تأیید این نوبت — اشتراک public_page دست‌نخورده
      expect(smsSub!.smsUsed).toBe(12);
      const publicSub = subs.find(
        item => item.subscriptionPlan?.planType === 'public_page',
      );
      expect(publicSub!.smsUsed).toBe(0);

      await world.cleanup();
    });

    it('۷. چند اشتراک تاریخی ← اشتراک فعال واقعی انتخاب و کسر می‌شود', async () => {
      const world = await buildWorld();
      // اشتراک قدیمیِ تمام‌شده با سهمیهٔ صفر
      await grantSmsPlan(world, {
        smsTotal: 100,
        smsUsed: 100,
        startOffsetDays: -60,
        endOffsetDays: -30,
        keepOld: true,
      });
      // اشتراک فعال فعلی
      await grantSmsPlan(world, { smsTotal: 100, smsUsed: 4, keepOld: true });

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '12:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);

      const subs = await world.repos.subscriptionRepo.find();
      const now = new Date();
      // اشتراکِ «فعال واقعی» = داخل بازهٔ تاریخ (همان قاعدهٔ getCurrent)
      const activeSub = subs
        .filter(
          item =>
            item.status === UserSubscriptionStatus.ACTIVE &&
            item.startDate <= now &&
            item.endDate > now,
        )
        .sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
      expect(activeSub.smsUsed).toBe(6); // ۴ + ۲

      await world.cleanup();
    });

    it('۸. خطای سرویس ارسال پیامک ← رزرو و کسر سهمیه پابرجا می‌مانند', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });
      world.smsStub.failNext = true;

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '10:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);
      const subs = await world.repos.subscriptionRepo.find();
      expect(subs[0].smsUsed).toBe(2);
      expect(await world.repos.smsUsageRepo.find()).toHaveLength(1);

      await world.cleanup();
    });

    it('۱۰. درخواست تداخلی ← رد می‌شود و سهمیه دست‌نخورده می‌ماند (رول‌بک کامل)', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 4, smsUsed: 0 });

      const first = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '10:00'),
      )) as { bookings: Booking[] };
      expect(first.bookings).toHaveLength(1);

      // همان بازهٔ ۱۰:۰۰–۱۰:۳۰ روی ۱۰:۱۵ تداخل دارد
      await expect(
        world.service.createManualByBarber(
          world.ids.barberUserId,
          baseDto(world, '10:15'),
        ),
      ).rejects.toThrow(/تداخل/);

      const subs = await world.repos.subscriptionRepo.find();
      const bookings = await world.repos.bookingRepo.find();
      const usages = await world.repos.smsUsageRepo.find();
      expect(subs[0].smsUsed).toBe(2); // فقط کسر نوبت اول
      expect(bookings).toHaveLength(1);
      expect(usages).toHaveLength(1);

      await world.cleanup();
    });

    it('۱۱. ثبت بدون ارسال پیامک (لینک بیعانه) ← رزرو ثبت و هیچ سهمیه‌ای کسر نمی‌شود', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        { ...baseDto(world, '10:00'), sendDepositLink: true },
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);
      const subs = await world.repos.subscriptionRepo.find();
      expect(subs[0].smsUsed).toBe(0);
      expect(await world.repos.smsUsageRepo.find()).toHaveLength(0);

      await world.cleanup();
    });

    it('۱۲. نبودِ جدول sms_usages بدون گارد بوت ← خودترمیمیِ تنبل جدول را می‌سازد و درخواست موفق می‌شود', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });
      // شبیه‌سازی پایگاه دادهٔ production بدون جدول دفتر مصرف پیامک و
      // بدون اجرای گارد بوت (مثلاً استقرار قدیمی یا شکست DDL هنگام بوت).
      await world.dataSource.query('DROP TABLE sms_usages');

      // خودترمیمیِ تنبلِ `createManualByBarber` (پیش از تراکنش) جدول را
      // می‌سازد؛ دیگر نیازی به اجرای دستی گارد بوت نیست.
      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '14:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);
      const bookings = await world.repos.bookingRepo.find();
      const usages = await world.repos.smsUsageRepo.find();
      const subs = await world.repos.subscriptionRepo.find();
      expect(bookings).toHaveLength(1);
      expect(usages).toHaveLength(1);
      expect(usages[0].count).toBe(2);
      expect(subs[0].smsUsed).toBe(2);

      await world.cleanup();
    });

    it('۱۳. بعد از اجرای گارد اسکیما (SubscriptionSchemaService) ← همان درخواست موفق می‌شود', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });
      await world.dataSource.query('DROP TABLE sms_usages');

      // همان کاری که SubscriptionSchemaService هنگام بوت می‌کند:
      const report = await ensureEntitySchema(world.dataSource, SmsUsage);
      expect(report.created).toBe(true);

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '15:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);
      const subs = await world.repos.subscriptionRepo.find();
      const usages = await world.repos.smsUsageRepo.find();
      expect(subs[0].smsUsed).toBe(2);
      expect(usages).toHaveLength(1);

      await world.cleanup();
    });

    it('۱۴. ستون‌های جاماندهٔ bookings + گارد بوت (BookingSchemaService) ← ستون‌ها اضافه و درخواست موفق می‌شود', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });
      // شبیه‌سازی production: جدول bookings بدون ستون‌های مسیر ثبت دستی
      // (این ستون‌ها هیچ فایل DDL کاملی نداشتند).
      await dropBookingManualColumns(world);

      // همان کاری که BookingSchemaService هنگام بوت می‌کند:
      const report = await ensureEntitySchema(world.dataSource, Booking);
      expect(report.addedColumns).toEqual(
        expect.arrayContaining([...BOOKING_MANUAL_COLUMNS]),
      );

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '16:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);
      const subs = await world.repos.subscriptionRepo.find();
      const usages = await world.repos.smsUsageRepo.find();
      expect(subs[0].smsUsed).toBe(2);
      expect(usages).toHaveLength(1);

      await world.cleanup();
    });

    it('۱۵. ستون‌های جاماندهٔ bookings + نبودِ sms_usages بدون هیچ گاردی ← خودترمیمیِ تنبل هر دو را می‌سازد', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });
      // بدترین حالت production: نه گارد بوت اجرا شده، نه DDL دستی.
      await dropBookingManualColumns(world);
      await world.dataSource.query('DROP TABLE sms_usages');

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '17:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);
      const bookings = await world.repos.bookingRepo.find();
      const subs = await world.repos.subscriptionRepo.find();
      const usages = await world.repos.smsUsageRepo.find();
      expect(bookings).toHaveLength(1);
      expect(subs[0].smsUsed).toBe(2);
      expect(usages).toHaveLength(1);

      await world.cleanup();
    });

    it('۱۶. مشتری یتیم (حساب مشتری حذف شده — حالت واقعی تیکت ۵۰۰) ← ترمیم خودکار و ثبت نوبت', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });

      // بدون ترمیم، INSERT نوبت روی bookings.customer_id با خطای کلید خارجی
      // شکست می‌خورد (خطای واقعی production: FK_8e21b7ae…).
      await orphanClubMember(world);

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '10:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);

      // حساب مشتری از روی اسنپ‌شات رکورد باشگاه بازسازی شده است
      const userRepo = world.dataSource.getRepository(User);
      const rebuilt = await userRepo.findOne({
        where: { phone: '09130000000' },
      });
      expect(rebuilt).toBeTruthy();

      const booking = await world.repos.bookingRepo.findOne({
        where: { id: result.bookings[0].id },
      });
      expect(Number(booking!.customerId)).toBe(Number(rebuilt!.id));

      // رکورد باشگاه به حسابِ تازه‌ساخته وصل شده است
      const member = await world.dataSource
        .getRepository(ClubCustomer)
        .findOne({ where: { id: world.ids.clubMemberId } });
      expect(Number(member!.customerId)).toBe(Number(rebuilt!.id));

      await world.cleanup();
    });

    it('۱۷. مشتری یتیم + حسابِ تازه‌ثبت‌نام‌کردهٔ هم‌شماره ← نوبت به همان حساب وصل می‌شود و حساب دوباره ساخته نمی‌شود', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });

      await orphanClubMember(world);

      const userRepo = world.dataSource.getRepository(User);
      const reRegistered = (await userRepo.save(
        userRepo.create({
          fullName: 'مشتری تازه',
          phone: '09130000000',
          password: 'x',
          roles: ['user'],
        } as never),
      )) as unknown as User;

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '11:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);

      // حساب تکراری برای همین شماره ساخته نشده است
      const samePhoneUsers = await userRepo.find({
        where: { phone: '09130000000' },
      });
      expect(samePhoneUsers).toHaveLength(1);
      expect(Number(samePhoneUsers[0].id)).toBe(Number(reRegistered.id));

      const booking = await world.repos.bookingRepo.findOne({
        where: { id: result.bookings[0].id },
      });
      expect(Number(booking!.customerId)).toBe(Number(reRegistered.id));

      await world.cleanup();
    });

    it('۱۸. مشتری یتیم + رکورد سالمِ تکراری برای همان مشتری ← رکورد یتیم حذف و نوبت روی رکورد سالم ثبت می‌شود', async () => {
      const world = await buildWorld();
      await grantSmsPlan(world, { smsTotal: 100 });

      await orphanClubMember(world);

      const userRepo = world.dataSource.getRepository(User);
      const reRegistered = (await userRepo.save(
        userRepo.create({
          fullName: 'مشتری تازه',
          phone: '09130000000',
          password: 'x',
          roles: ['user'],
        } as never),
      )) as unknown as User;

      const barber = await world.dataSource
        .getRepository(BarberProfile)
        .findOneByOrFail({ userId: world.ids.barberUserId });

      // رکورد دومِ سالم برای همین مشتری (مثل «افزودن دوبارهٔ مشتری پس از
      // ثبت‌نام مجدد»)؛ رکورد اولِ یتیم هنوز به حسابِ حذف‌شده اشاره می‌کند.
      const healthy = await world.dataSource.getRepository(ClubCustomer).save(
        world.dataSource.getRepository(ClubCustomer).create({
          barberId: barber.id,
          customerId: reRegistered.id,
          fullName: 'مشتری تازه',
          phone: '09130000000',
          groupId: null,
        }),
      );

      const result = (await world.service.createManualByBarber(
        world.ids.barberUserId,
        baseDto(world, '12:00'),
      )) as { bookings: Booking[] };

      expect(result.bookings).toHaveLength(1);
      expect(Number(result.bookings[0].customerId)).toBe(
        Number(reRegistered.id),
      );

      // رکورد یتیم حذف شده و فقط رکورد سالم باقی است
      const rows = await world.dataSource
        .getRepository(ClubCustomer)
        .find({ where: { barberId: barber.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(healthy.id);
      expect(rows[0].id).not.toBe(world.ids.clubMemberId);

      await world.cleanup();
    });
  },
);
