/**
 * تست‌های گارد اسکیمای جدول‌های رزرو (`bookings` / `slot_holds`).
 *
 * چرا این گارد حیاتی است؟ `POST /bookings/manual` ستون‌های
 * `send_deposit_link`، `send_sms_reminder`، `reminder_hours`،
 * `reminder_sent_at`، `deposit_token` و `deposit_paid_at` را **صریح** روی
 * ردیف رزرو می‌نویسد، اما این ستون‌ها هیچ فایل DDL کاملی در پوشهٔ `sql/`
 * نداشتند و هیچ گاردی هم نداشتند. اگر در production نباشند، INSERT رزرو
 * شکست می‌خورد و «ثبت رزرو دستی» با ۵۰۰ می‌شکند — در حالی که رزرو آنلاین
 * (که این فیلدها را ست نمی‌کند) سالم می‌ماند. جدول `slot_holds` هم همین
 * وضعیت را داشت (فقط در یک فایل SQL دستی پوشش داده شده بود).
 */
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_HOUR: '0 0 * * * *' },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { isRuntimeFlagEnabled } from 'src/common/config/runtime-flags';
import { ensureEntitySchema } from 'src/common/utils/schema-guard.util';
import { DataSource } from 'typeorm';

import { BookingSchemaService } from './booking-schema.service';

jest.mock('src/common/config/runtime-flags', () => ({
  isRuntimeFlagEnabled: jest.fn().mockReturnValue(true),
}));

jest.mock('src/common/utils/schema-guard.util', () => ({
  ensureEntitySchema: jest.fn().mockResolvedValue({
    table: 'bookings',
    created: false,
    addedColumns: [],
    warnings: [],
  }),
}));

const BOOKING_MANUAL_COLUMNS_SQL = 'sql/booking-manual-columns.sql';

/** ستون‌های مسیر «ثبت رزرو دستی» روی bookings — با خود entity هم‌تراز. */
const BOOKING_MANUAL_COLUMNS = [
  'send_deposit_link',
  'send_sms_reminder',
  'reminder_hours',
  'reminder_sent_at',
  'deposit_token',
  'deposit_paid_at',
] as const;

describe('BookingSchemaService (bookings/slot_holds guard)', () => {
  beforeEach(() => {
    (ensureEntitySchema as jest.Mock).mockClear();
    (ensureEntitySchema as jest.Mock).mockResolvedValue({
      table: 'bookings',
      created: false,
      addedColumns: [],
      warnings: [],
    });
    (isRuntimeFlagEnabled as jest.Mock).mockReturnValue(true);
  });

  function setup() {
    const source = {
      options: { type: 'mysql' },
    } as unknown as DataSource;
    return new BookingSchemaService(source);
  }

  it('the manual DDL file covers every manual-booking column and stays additive', () => {
    const sql = readFileSync(
      join(process.cwd(), BOOKING_MANUAL_COLUMNS_SQL),
      'utf8',
    );

    for (const column of BOOKING_MANUAL_COLUMNS) {
      expect(sql).toContain(column);
    }
    // DDL فقط افزودنی است؛ هیچ دستور مخربی در فایل نیست
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });

  it('delegates to ensureEntitySchema for both Booking and SlotHold at bootstrap', async () => {
    const service = setup();
    await service.onApplicationBootstrap();

    expect(ensureEntitySchema).toHaveBeenCalledTimes(2);
    expect(ensureEntitySchema).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not touch the database when ENABLE_SCHEMA_MUTATIONS is off', async () => {
    (isRuntimeFlagEnabled as jest.Mock).mockReturnValue(false);
    const service = setup();
    await service.onApplicationBootstrap();

    expect(ensureEntitySchema).not.toHaveBeenCalled();
  });

  it('does not crash bootstrap when the guard itself fails', async () => {
    (ensureEntitySchema as jest.Mock).mockRejectedValue(
      new Error('ALTER denied'),
    );
    const service = setup();

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('logs created/added-columns/warnings reports without throwing', async () => {
    (ensureEntitySchema as jest.Mock).mockResolvedValue({
      table: 'bookings',
      created: true,
      addedColumns: ['send_sms_reminder'],
      warnings: ['sample warning'],
    });
    const service = setup();

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
