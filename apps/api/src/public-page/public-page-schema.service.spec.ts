import { DataSource, Table, TableColumn } from 'typeorm';
import { ConnectionMetadataBuilder } from 'typeorm/connection/ConnectionMetadataBuilder';

import { PublicPageDiscount } from './entities/public-page-discount.entity';
import { PublicPageDiscountUsage } from './entities/public-page-discount-usage.entity';
import { PublicPageSchemaService } from './public-page-schema.service';

type GuardedTable = 'public_page_discounts' | 'discount_usages';

const DISCOUNT_COLUMNS = [
  'id',
  'code',
  'percent_off',
  'is_active',
  'applicable_to',
  'max_total_uses',
  'max_uses_per_user',
  'used_count',
  'starts_at',
  'expires_at',
  'created_at',
  'updated_at',
];

const USAGE_COLUMNS = [
  'id',
  'discount_id',
  'user_id',
  'payment_id',
  'purpose',
  'discount_amount',
  'created_at',
];

/** اسکیمای کاملِ یکی از جدول‌های گارد (با همان ستون‌های entity) */
function buildExistingTable(name: GuardedTable) {
  const columns =
    name === 'public_page_discounts' ? DISCOUNT_COLUMNS : USAGE_COLUMNS;
  return new Table({
    name,
    columns: columns.map(
      columnName =>
        new TableColumn({
          name: columnName,
          type: 'varchar',
          isNullable: true,
        }),
    ),
  });
}

/**
 * اسکیمای قدیمیِ جدول کدها (پیش از ستون‌های سقف استفاده/انقضا) — برای تست
 * «افزودن ستون‌های جامانده» روی جدول موجود در production.
 */
function buildLegacyDiscountTable() {
  return new Table({
    name: 'public_page_discounts',
    columns: [
      'id',
      'code',
      'percent_off',
      'is_active',
      'created_at',
      'updated_at',
    ].map(name => new TableColumn({ name, type: 'varchar', isNullable: true })),
  });
}

/**
 * دیتابیس ساختگی که فقط «اسکیمای موجود» را شبیه‌سازی می‌کند؛ بقیهٔ مسیر
 * (ساخت `Table` از متادیتای entity) واقعی است تا دقیقاً همان چیزی تست شود که
 * در production اجرا می‌شود. گارد حالا دو جدول دارد (کدها + مصرف‌ها).
 */
async function createServiceStub(options?: {
  /** جدول‌هایی که از قبل در دیتابیس هستند (بر اساس نام) */
  existingTables?: Table[];
  broken?: boolean;
}) {
  const template = new DataSource({
    type: 'mysql',
    entities: [PublicPageDiscount, PublicPageDiscountUsage],
  });
  const metadatas = await new ConnectionMetadataBuilder(
    template,
  ).buildEntityMetadatas([PublicPageDiscount, PublicPageDiscountUsage]);
  const metadataByEntity = new Map<any, any>([
    [PublicPageDiscount, metadatas[0]],
    [PublicPageDiscountUsage, metadatas[1]],
  ]);

  const existingTables = options?.existingTables ?? [];
  const runner = {
    connect: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    getTable: jest.fn((name: string) =>
      Promise.resolve(
        existingTables.find(table => table.name === name) ?? null,
      ),
    ),
    createTable: jest.fn().mockResolvedValue(undefined),
    addColumn: jest.fn().mockResolvedValue(undefined),
  };

  const dataSource = options?.broken
    ? ({
        getMetadata: () => {
          throw new Error('connection lost');
        },
      } as unknown as DataSource)
    : ({
        getMetadata: (entity: any) => metadataByEntity.get(entity),
        driver: template.driver,
        createQueryRunner: () => runner,
      } as unknown as DataSource);

  const service = new PublicPageSchemaService(dataSource);
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  Object.defineProperty(service, 'logger', { value: logger });

  return { service, runner, logger };
}

describe('PublicPageSchemaService (گارد اسکیمای کدهای تخفیف)', () => {
  it('اگر جدول‌ها در پایگاه داده نباشند، هنگام بوت هر دو را می‌سازد', async () => {
    const { service, runner, logger } = await createServiceStub();

    await service.onApplicationBootstrap();

    expect(runner.createTable).toHaveBeenCalledTimes(2);
    expect(
      runner.createTable.mock.calls.map(call => (call[0] as Table).name),
    ).toEqual(['public_page_discounts', 'discount_usages']);
    // `ifNotExists = true` تا بالا آمدن هم‌زمان چند نمونه خطا ندهد
    expect(runner.createTable.mock.calls[0][1]).toBe(true);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('public_page_discounts'),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('discount_usages'),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('وقتی هر دو جدول از قبل وجود دارند هیچ کاری نمی‌کند (idempotent)', async () => {
    const { service, runner, logger } = await createServiceStub({
      existingTables: [
        buildExistingTable('public_page_discounts'),
        buildExistingTable('discount_usages'),
      ],
    });

    await service.onApplicationBootstrap();

    expect(runner.createTable).not.toHaveBeenCalled();
    expect(runner.addColumn).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('ستون‌های جدیدِ کد تخفیف روی جدول قدیمی اضافه می‌شوند', async () => {
    const { service, runner, logger } = await createServiceStub({
      existingTables: [
        buildLegacyDiscountTable(),
        buildExistingTable('discount_usages'),
      ],
    });

    await service.onApplicationBootstrap();

    expect(runner.createTable).not.toHaveBeenCalled();
    expect(
      runner.addColumn.mock.calls.map(call => call[1].name).sort(),
    ).toEqual([
      'applicable_to',
      'expires_at',
      'max_total_uses',
      'max_uses_per_user',
      'starts_at',
      'used_count',
    ]);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('public_page_discounts'),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('خطای گارد را می‌بلعد تا بالا آمدن سرویس شکست نخورد', async () => {
    const { service, logger } = await createServiceStub({ broken: true });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('connection lost'),
    );
  });
});
