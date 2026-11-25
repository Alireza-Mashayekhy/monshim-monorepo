/**
 * تست‌های گارد اسکیمای دفتر مصرف پیامک (`sms_usages`).
 *
 * چرا این گارد حیاتی است؟ تنها نقطهٔ نوشتن در کل محصول، «کسر سهمیهٔ پیامک»
 * هنگام ثبت رزرو دستی است (`deductSms` فقط از `POST /bookings/manual` با پلن
 * پیامکی صدا زده می‌شود). اگر جدول `sms_usages` در production نباشد (این جدول
 * هیچ فایل DDL الزامی و هیچ گارد قبلی نداشت)، همان مسیر با ۵۰۰/۵۰۳ شکست
 * می‌خورد و تراکنشِ کل رزرو رول‌بک می‌شود؛ در حالی که خرید پلن، نمایش اعتبار و
 * مسیر لینک بیعانه همه سالم می‌مانند — دقیقاً نشانهٔ تیکتِ «خطای ۵۰۰ در ثبت
 * رزرو دستی با پلن پیامکی».
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

import { SubscriptionSchemaService } from './subscription-schema.service';

jest.mock('src/common/config/runtime-flags', () => ({
  isRuntimeFlagEnabled: jest.fn().mockReturnValue(true),
}));

jest.mock('src/common/utils/schema-guard.util', () => ({
  ensureEntitySchema: jest.fn().mockResolvedValue({
    table: 'sms_usages',
    created: false,
    addedColumns: [],
    warnings: [],
  }),
}));

const SMS_USAGE_DDL_FILE = 'sql/sms-usage-ledger.sql';

/** ستون‌های entity `SmsUsage` — با خود entity هم‌تراز نگه داشته می‌شود. */
const SMS_USAGE_COLUMNS = [
  'id',
  'user_id',
  'user_subscription_id',
  'count',
  'reason',
  'created_at',
] as const;

describe('SubscriptionSchemaService (sms_usages guard)', () => {
  beforeEach(() => {
    (ensureEntitySchema as jest.Mock).mockClear();
    (ensureEntitySchema as jest.Mock).mockResolvedValue({
      table: 'sms_usages',
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
    return new SubscriptionSchemaService(source);
  }

  it('the manual DDL file covers the whole ledger table and stays additive/idempotent', () => {
    const sql = readFileSync(join(process.cwd(), SMS_USAGE_DDL_FILE), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sms_usages');
    for (const column of SMS_USAGE_COLUMNS) {
      expect(sql).toContain(column);
    }
    // DDL فقط افزودنی است؛ هیچ دستور مخربی در فایل نیست
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });

  it('delegates to ensureEntitySchema for the SmsUsage entity at bootstrap', async () => {
    const service = setup();
    await service.onApplicationBootstrap();

    expect(ensureEntitySchema).toHaveBeenCalledTimes(1);
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
      new Error('CREATE denied'),
    );
    const service = setup();

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('logs created/added-columns/warnings reports without throwing', async () => {
    (ensureEntitySchema as jest.Mock).mockResolvedValue({
      table: 'sms_usages',
      created: true,
      addedColumns: ['some_missing_column'],
      warnings: ['sample warning'],
    });
    const service = setup();

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
