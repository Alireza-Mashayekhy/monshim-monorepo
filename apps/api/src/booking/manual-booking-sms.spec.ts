import { BadRequestException } from '@nestjs/common';

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_10_MINUTES: '0 */10 * * * *' },
}));

// خودترمیمیِ تنبلِ اسکیما در این تست واحد mock می‌شود؛ رفتار واقعیِ آن
// (ساخت جدول/ستونِ جامانده) در manual-booking-sms.e2e.spec.ts پوشش دارد.
jest.mock('src/common/utils/schema-guard.util', () => ({
  ensureEntitySchema: jest.fn().mockResolvedValue({
    table: 'sms_usages',
    created: false,
    addedColumns: [],
    warnings: [],
  }),
}));

import { UserSubscriptionStatus } from 'src/subscription/entities/user-subscription.entity';

import { BookingsService } from './booking.service';

describe('BookingsService.createManualByBarber (Deposit Link + SMS Reminder)', () => {
  const date = '2099-06-15';

  /**
   * هارنس تست با شبیه‌سازی تراکنش دیتابیس:
   *
   * • کسر سهمیهٔ پیامک (mock شده) بلافاصله `smsUsed` را زیاد می‌کند — مثل
   *   UPDATE اتمیک واقعی.
   * • `startTransaction` از وضعیت فعلی اسنپ‌شات می‌گیرد و
   *   `rollbackTransaction` همان وضعیت را برمی‌گرداند — مثل ROLLBACK واقعی.
   *
   * پس تست‌ها می‌توانند بررسی کنند «ثبت ناموفق رزرو، سهمیه را کسر نکرده».
   */
  function createHarness(
    smsRemaining: number | null,
    options?: { saveError?: Error; existingBookings?: any[] },
  ) {
    const barber = {
      id: 'barber-profile-1',
      userId: 100,
      salonName: 'پیرایش آریا',
      isApproved: true,
    };
    const member = {
      id: 'club-member-1',
      customerId: 200,
      customer: {
        id: 200,
        fullName: 'محمد حسینی',
        phone: '09123456789',
      },
    };
    const services = [
      {
        id: 'service-1',
        barberId: 100,
        name: 'اصلاح مو',
        price: 250000,
        depositPrice: 100000,
        durationMinutes: 30,
        isActive: true,
      },
      {
        id: 'service-2',
        barberId: 100,
        name: 'اصلاح صورت',
        price: 150000,
        depositPrice: 50000,
        durationMinutes: 15,
        isActive: true,
      },
    ];

    const currentSubscription =
      smsRemaining === null
        ? null
        : {
            id: 'sub-1',
            userId: barber.userId,
            planType: 'sms',
            status: UserSubscriptionStatus.ACTIVE,
            smsTotal: 100,
            smsUsed: 100 - smsRemaining,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2099-12-30T00:00:00.000Z'),
          };

    /** وضعیت «دیتابیس» شبیه‌سازی‌شده برای کسر سهمیه. */
    const smsLedger = {
      deduct(count: number) {
        if (!currentSubscription) {
          throw new BadRequestException(
            'برای ارسال پیامک ابتدا باید یکی از پلن‌های اشتراک را خریداری کنید',
          );
        }
        const remaining =
          currentSubscription.smsTotal - currentSubscription.smsUsed;
        if (remaining < count) {
          throw new BadRequestException(
            `اعتبار پیامک کافی نیست (پیامک باقی‌مانده: ${remaining})`,
          );
        }
        currentSubscription.smsUsed += count;
      },
      get smsUsed() {
        return currentSubscription ? currentSubscription.smsUsed : 0;
      },
    };

    /** رزروهای «ذخیره‌شده» شبیه‌سازی‌شده (فقط بعد از commit پابرجا هستند). */
    const persistedBookings: any[] = [];
    let snapshot: { smsUsed: number; bookings: number } | null = null;

    const bookingRepo: any = {
      find: jest.fn().mockResolvedValue(options?.existingBookings ?? []),
      create: jest.fn((input: any) => ({ ...input })),
      save: jest.fn((rows: any) => {
        if (options?.saveError) {
          return Promise.reject(options.saveError);
        }
        const normalized = Array.isArray(rows) ? rows : [rows];
        normalized.forEach(row => persistedBookings.push(row));

        return Promise.resolve(
          Array.isArray(rows)
            ? rows.map((row, idx) => ({
                ...row,
                id: `booking-${idx + 1}`,
              }))
            : { ...rows, id: 'booking-req-1' },
        );
      }),
    };
    const barberProfileRepo: any = {
      findOne: jest.fn().mockResolvedValue(barber),
    };
    const serviceRepo: any = {
      find: jest.fn().mockResolvedValue(services),
      findOne: jest.fn().mockResolvedValue(services[0]),
    };
    const workHoursRepo: any = {
      find: jest.fn().mockResolvedValue([
        {
          barberId: barber.id,
          dayOfWeek: (new Date(date).getDay() + 1) % 7,
          startTime: '08:00',
          endTime: '22:00',
        },
      ]),
    };
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(member.customer),
    };
    const slotHoldRepo: any = {
      find: jest.fn().mockResolvedValue([]),
    };

    const queryRunner: any = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn(() => {
        snapshot = {
          smsUsed: smsLedger.smsUsed,
          bookings: persistedBookings.length,
        };
        queryRunner.isTransactionActive = true;
      }),
      commitTransaction: jest.fn(() => {
        snapshot = null;
        queryRunner.isTransactionActive = false;
      }),
      rollbackTransaction: jest.fn(() => {
        if (snapshot) {
          if (currentSubscription) {
            currentSubscription.smsUsed = snapshot.smsUsed;
          }
          persistedBookings.length = snapshot.bookings;
        }
        snapshot = null;
        queryRunner.isTransactionActive = false;
      }),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: false,
      manager: {
        getRepository: (entity: any) => {
          const name = typeof entity === 'string' ? entity : entity?.name;
          if (name === 'BarberProfile') return barberProfileRepo;
          if (name === 'Booking') return bookingRepo;
          if (name === 'SlotHold') return slotHoldRepo;
          throw new Error(`unexpected repository in tx: ${name}`);
        },
      },
    };

    const dataSource: any = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const userSubscriptionService: any = {
      getCurrent: jest.fn().mockResolvedValue(currentSubscription),
      deductSms: jest.fn((_userId: number, count: number) => {
        smsLedger.deduct(count);
        return Promise.resolve(currentSubscription);
      }),
    };
    const clubService: any = {
      findMemberForBarber: jest.fn().mockResolvedValue(member),
      addFromSuccessfulBooking: jest.fn().mockResolvedValue(undefined),
    };
    const bookingSmsService: any = {
      sendDepositLinkToCustomer: jest.fn().mockResolvedValue(undefined),
      sendBookingSuccessToCustomer: jest.fn().mockResolvedValue(undefined),
      sendNewBookingToBarber: jest.fn().mockResolvedValue(undefined),
      sendBookingRequestReceivedToCustomer: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const baleNotificationService: any = {
      notifyBookingRequestCreated: jest.fn().mockResolvedValue(undefined),
      notifyManualBookingCreated: jest.fn().mockResolvedValue(undefined),
    };

    const service = new BookingsService(
      bookingRepo,
      barberProfileRepo,
      serviceRepo,
      workHoursRepo,
      userRepo,
      slotHoldRepo,
      dataSource,
      {} as any,
      {} as any,
      clubService,
      userSubscriptionService,
      bookingSmsService,
      baleNotificationService,
    );

    return {
      service,
      bookingRepo,
      barberProfileRepo,
      queryRunner,
      dataSource,
      smsLedger,
      persistedBookings,
      userSubscriptionService,
      bookingSmsService,
      baleNotificationService,
      clubService,
    };
  }

  it('allows sendDepositLink=true together with sendSmsReminder=true when barber has >= 2 SMS credits', async () => {
    const {
      service,
      userSubscriptionService,
      bookingSmsService,
      baleNotificationService,
      queryRunner,
    } = createHarness(2);

    const saved = await service.createManualByBarber(100, {
      clubCustomerId: 'club-member-1',
      serviceIds: ['service-1', 'service-2'],
      date,
      time: '10:00',
      sendDepositLink: true,
      sendSmsReminder: true,
      reminderHours: 4,
    });

    expect(userSubscriptionService.deductSms).toHaveBeenCalledWith(
      100,
      2,
      'پیامک یادآوری نوبت دستی',
      queryRunner.manager,
    );
    expect(bookingSmsService.sendDepositLinkToCustomer).toHaveBeenCalledTimes(
      1,
    );
    expect(
      baleNotificationService.notifyManualBookingCreated,
    ).not.toHaveBeenCalled();
    expect(
      baleNotificationService.notifyBookingRequestCreated,
    ).not.toHaveBeenCalled();
    expect(saved.bookings).toHaveLength(2);
    expect(saved.bookings[0]).toMatchObject({
      sendDepositLink: true,
      sendSmsReminder: true,
      reminderHours: 4,
    });
    expect(saved.bookings[1]).toMatchObject({
      sendDepositLink: true,
      sendSmsReminder: false,
      reminderHours: null,
    });
    // تراکنش با موفقیت بسته شده است
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('requires 4 SMS credits when sendDepositLink=false and sendSmsReminder=true', async () => {
    const { service } = createHarness(2);

    await expect(
      service.createManualByBarber(100, {
        clubCustomerId: 'club-member-1',
        serviceIds: ['service-1'],
        date,
        time: '11:00',
        sendDepositLink: false,
        sendSmsReminder: true,
        reminderHours: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the central subscription check with SMS plan type and window', async () => {
    const { service, userSubscriptionService } = createHarness(5);

    await service.createManualByBarber(100, {
      clubCustomerId: 'club-member-1',
      serviceIds: ['service-1'],
      date,
      time: '10:30',
      sendDepositLink: false,
    });

    // منبع تصمیم‌گیری نسخهٔ مرکزی اشتراک است، نه کوئریِ مستقل با شرط‌های متفاوت.
    expect(userSubscriptionService.getCurrent).toHaveBeenCalledWith(100, 'sms');
  });

  it('without an active SMS subscription, the SMS path is blocked but the deposit-link path is allowed', async () => {
    // وضعیتی که آرایشگرِ منقضی‌شدهٔ پیامکی/بدون اشتراک پیامکی دارد (مثلاً فقط
    // اشتراک «پروفایل اختصاصی» فعالش باقی مانده است).
    const { service } = createHarness(null);

    await expect(
      service.createManualByBarber(100, {
        clubCustomerId: 'club-member-1',
        serviceIds: ['service-1'],
        date,
        time: '11:30',
        sendDepositLink: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const saved = await service.createManualByBarber(100, {
      clubCustomerId: 'club-member-1',
      serviceIds: ['service-1'],
      date,
      time: '12:30',
      sendDepositLink: true,
    });

    expect(saved.bookings).toHaveLength(1);
    expect(saved.bookings[0].sendDepositLink).toBe(true);
  });

  it('reports the precise «no subscription» error when there is no active SMS subscription', async () => {
    const { service, userSubscriptionService } = createHarness(null);

    await expect(
      service.createManualByBarber(100, {
        clubCustomerId: 'club-member-1',
        serviceIds: ['service-1'],
        date,
        time: '11:30',
        sendDepositLink: false,
      }),
    ).rejects.toThrow(/پلن‌های اشتراک پیامکی را خریداری کنید/);

    // کسر سهمیه هرگز اتفاق نیفتاده است
    expect(userSubscriptionService.deductSms).not.toHaveBeenCalled();
  });

  it('reports the remaining credit in the error when the quota is insufficient', async () => {
    const { service, userSubscriptionService } = createHarness(1);

    await expect(
      service.createManualByBarber(100, {
        clubCustomerId: 'club-member-1',
        serviceIds: ['service-1'],
        date,
        time: '11:30',
        sendDepositLink: false,
      }),
    ).rejects.toThrow(/اعتبار پیامک کافی نیست.*پیامک باقی‌مانده: 1/);

    expect(userSubscriptionService.deductSms).toHaveBeenCalledTimes(1);
  });

  it('does not consume SMS quota when saving bookings fails (rollback)', async () => {
    const { service, smsLedger, userSubscriptionService, queryRunner } =
      createHarness(5, { saveError: new Error('DB write failed') });

    await expect(
      service.createManualByBarber(100, {
        clubCustomerId: 'club-member-1',
        serviceIds: ['service-1'],
        date,
        time: '10:30',
        sendDepositLink: false,
      }),
    ).rejects.toThrow('DB write failed');

    // کسر داخل تراکنش انجام شده، اما رول‌بک آن را برگردانده است
    expect(userSubscriptionService.deductSms).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(smsLedger.smsUsed).toBe(95); // همان مقدار پیش از کسر (۵ از ۱۰۰ مصرف‌شده)
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back SMS deduction when the slot conflicts with an existing booking', async () => {
    // یک نوبت موجود ۱۰:۰۰ تا ۱۰:۳۰ — درخواست روی ۱۰:۱۵ تداخل دارد
    const {
      service,
      smsLedger,
      persistedBookings,
      userSubscriptionService,
      queryRunner,
    } = createHarness(5, {
      existingBookings: [
        {
          id: 'existing-1',
          barberId: 'barber-profile-1',
          date,
          time: '10:00',
          holdsSlot: true,
          status: 'confirmed',
          service: { durationMinutes: 30 },
        },
      ],
    });

    await expect(
      service.createManualByBarber(100, {
        clubCustomerId: 'club-member-1',
        serviceIds: ['service-1'],
        date,
        time: '10:15',
        sendDepositLink: false,
      }),
    ).rejects.toThrow(/با نوبت دیگری تداخل دارد/);

    // هیچ سهمیه‌ای مصرف نشده و هیچ نوبتی ذخیره نشده است
    expect(userSubscriptionService.deductSms).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(smsLedger.smsUsed).toBe(95);
    expect(persistedBookings).toHaveLength(0);
  });

  it('persists bookings and SMS deduction only after the transaction commits', async () => {
    const { service, smsLedger, persistedBookings, queryRunner } =
      createHarness(5);

    const saved = await service.createManualByBarber(100, {
      clubCustomerId: 'club-member-1',
      serviceIds: ['service-1'],
      date,
      time: '10:30',
      sendDepositLink: false,
    });

    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    // ۲ اعتبار پیامک تأیید کسر شده است
    expect(smsLedger.smsUsed).toBe(97);
    expect(persistedBookings).toHaveLength(1);
    expect(saved.bookings[0].status).toBe('confirmed');
    expect(saved.bookings[0].holdsSlot).toBe(true);
  });

  it('allows sendDepositLink=true together with sendSmsReminder=true even when credits are low for confirmation', async () => {
    // ۲ اعتبار کافی برای یادآوری (۲) — بدون ارسال تأیید پیامکی.
    const { service, userSubscriptionService } = createHarness(2);

    const saved = await service.createManualByBarber(100, {
      clubCustomerId: 'club-member-1',
      serviceIds: ['service-1'],
      date,
      time: '13:00',
      sendDepositLink: true,
      sendSmsReminder: true,
      reminderHours: 2,
    });

    expect(saved.bookings).toHaveLength(1);
    expect(userSubscriptionService.deductSms).toHaveBeenCalledWith(
      100,
      2,
      'پیامک یادآوری نوبت دستی',
      expect.anything(),
    );
  });

  it('rejects sendSmsReminder=true when reminderHours is omitted', async () => {
    const { service, userSubscriptionService } = createHarness(10);

    await expect(
      service.createManualByBarber(100, {
        clubCustomerId: 'club-member-1',
        serviceIds: ['service-1'],
        date,
        time: '12:00',
        sendDepositLink: true,
        sendSmsReminder: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userSubscriptionService.deductSms).not.toHaveBeenCalled();
  });

  it('performs lock, conflict check, SMS deduction and insert inside one transaction', async () => {
    const {
      service,
      bookingRepo,
      barberProfileRepo,
      userSubscriptionService,
      queryRunner,
    } = createHarness(10);

    await service.createManualByBarber(100, {
      clubCustomerId: 'club-member-1',
      serviceIds: ['service-1'],
      date,
      time: '09:00',
      sendDepositLink: false,
    });

    // قفل ردیف آرایشگر داخل تراکنش گرفته شده است تا درخواست‌های هم‌زمان
    // سری شوند (جلوگیری از Race Condition در بررسی تداخل و کسر سهمیه).
    expect(barberProfileRepo.findOne).toHaveBeenLastCalledWith({
      where: { id: 'barber-profile-1' },
      lock: { mode: 'pessimistic_write' },
    });

    // ترتیب داخل تراکنش: شروع ← قفل ← بررسی تداخل ← کسر سهمیه ← درج ← commit
    const txStart = queryRunner.startTransaction.mock.invocationCallOrder[0];
    const lock = barberProfileRepo.findOne.mock.invocationCallOrder.at(-1)!;
    const conflictRead = bookingRepo.find.mock.invocationCallOrder[0];
    const deduct =
      userSubscriptionService.deductSms.mock.invocationCallOrder[0];
    const insert = bookingRepo.save.mock.invocationCallOrder[0];
    const commit = queryRunner.commitTransaction.mock.invocationCallOrder[0];

    expect(txStart).toBeLessThan(lock);
    expect(lock).toBeLessThan(conflictRead);
    expect(conflictRead).toBeLessThan(deduct);
    expect(deduct).toBeLessThan(insert);
    expect(insert).toBeLessThan(commit);
  });

  it('does not fail the booking when club sync fails after commit', async () => {
    const { service, clubService, queryRunner } = createHarness(5);
    // همگام‌سازی باشگاه پس از commit است؛ شکستش نباید نوبتِ ثبت‌شده را
    // به خطای ۵۰۰ تبدیل کند (وگرنه کاربر با تلاش دوباره نوبت تکراری می‌سازد).
    clubService.addFromSuccessfulBooking.mockRejectedValue(
      new Error('club sync down'),
    );

    const saved = await service.createManualByBarber(100, {
      clubCustomerId: 'club-member-1',
      serviceIds: ['service-1'],
      date,
      time: '15:30',
      sendDepositLink: false,
    });

    expect(saved.bookings).toHaveLength(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(clubService.addFromSuccessfulBooking).toHaveBeenCalledTimes(1);
  });

  it('does NOT send any Bale notification when a customer creates an unpaid booking request', async () => {
    const { service, baleNotificationService } = createHarness(10);

    const saved = await service.create(200, {
      barberId: 100,
      serviceId: 'service-1',
      date,
      time: '14:00',
      note: 'تست عدم ارسال پیام بله در رزرو بدون پرداخت',
    });

    expect(saved.id).toBe('booking-req-1');
    expect(
      baleNotificationService.notifyBookingRequestCreated,
    ).not.toHaveBeenCalled();
    expect(
      baleNotificationService.notifyManualBookingCreated,
    ).not.toHaveBeenCalled();
  });
});
