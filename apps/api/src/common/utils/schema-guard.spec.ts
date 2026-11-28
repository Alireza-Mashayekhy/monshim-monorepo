import { PublicPageDiscount } from 'src/public-page/entities/public-page-discount.entity';
import { PublicPageDiscountUsage } from 'src/public-page/entities/public-page-discount-usage.entity';
import { DataSource, Table, TableColumn } from 'typeorm';
/**
 * `ConnectionMetadataBuilder` همان چیزی است که خودِ TypeORM هنگام `initialize`
 * استفاده می‌کند؛ اینجا فقط برای ساختن متادیتای entity **بدون اتصال به پایگاه
 * داده** به کار می‌رود تا بتوان رفتار گارد اسکیمای production را آفلاین تست کرد.
 */
import { ConnectionMetadataBuilder } from 'typeorm/connection/ConnectionMetadataBuilder';

import { ensureEntitySchema, ensureTableSchema } from './schema-guard.util';

function buildTable(columnNames: string[], name = 'public_page_discounts') {
  return new Table({
    name,
    columns: columnNames.map(
      columnName =>
        new TableColumn({
          name: columnName,
          type: 'varchar',
          isNullable: true,
        }),
    ),
  });
}

function createQueryRunnerStub(existingTable?: Table) {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    getTable: jest.fn().mockResolvedValue(existingTable),
    createTable: jest.fn().mockResolvedValue(undefined),
    addColumn: jest.fn().mockResolvedValue(undefined),
  };
}

/** متادیتای واقعی entity بدون نیاز به دیتابیس (driver: MySQL یعنی production) */
async function buildEntityMetadata(entity: any) {
  const dataSource = new DataSource({
    type: 'mysql',
    entities: [entity],
  });
  const [metadata] = await new ConnectionMetadataBuilder(
    dataSource,
  ).buildEntityMetadatas([entity]);
  return { metadata, driver: dataSource.driver };
}

describe('schema guard (ساخت idempotent جدول جامانده)', () => {
  it('وقتی جدول وجود ندارد، آن را با IF NOT EXISTS می‌سازد', async () => {
    const runner = createQueryRunnerStub(undefined);
    const table = buildTable(['id', 'code']);

    const report = await ensureTableSchema(runner as never, table);

    expect(report).toEqual({
      table: 'public_page_discounts',
      created: true,
      addedColumns: [],
      warnings: [],
    });
    expect(runner.createTable).toHaveBeenCalledTimes(1);
    expect(runner.createTable).toHaveBeenCalledWith(table, true);
    expect(runner.addColumn).not.toHaveBeenCalled();
  });

  it('وقتی جدول کامل است هیچ نوشتنی انجام نمی‌دهد', async () => {
    const runner = createQueryRunnerStub(buildTable(['id', 'code']));

    const report = await ensureTableSchema(
      runner as never,
      buildTable(['id', 'code']),
    );

    expect(report.created).toBe(false);
    expect(report.addedColumns).toEqual([]);
    expect(runner.createTable).not.toHaveBeenCalled();
    expect(runner.addColumn).not.toHaveBeenCalled();
  });

  it('فقط ستون‌های جاماندهٔ جدول موجود را اضافه می‌کند', async () => {
    const runner = createQueryRunnerStub(buildTable(['id', 'code']));
    const desired = buildTable(['id', 'code', 'percent_off', 'is_active']);

    const report = await ensureTableSchema(runner as never, desired);

    expect(report.created).toBe(false);
    expect(report.addedColumns).toEqual(['percent_off', 'is_active']);
    expect(runner.createTable).not.toHaveBeenCalled();
    expect(runner.addColumn).toHaveBeenCalledTimes(2);
    expect(runner.addColumn.mock.calls.map(call => call[1].name)).toEqual([
      'percent_off',
      'is_active',
    ]);
  });

  it('شکست افزودن یک ستون را به warning تبدیل می‌کند و بقیه را ادامه می‌دهد', async () => {
    const runner = createQueryRunnerStub(buildTable(['id']));
    runner.addColumn.mockImplementation(
      (_table: unknown, column: { name: string }) =>
        column.name === 'percent_off'
          ? Promise.reject(new Error("Field doesn't have a default value"))
          : Promise.resolve(),
    );

    const report = await ensureTableSchema(
      runner as never,
      buildTable(['id', 'percent_off', 'is_active']),
    );

    expect(report.addedColumns).toEqual(['is_active']);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('percent_off');
  });

  it('جدولِ entity واقعی را با همان ستون‌ها و کلید یکتای code می‌سازد', async () => {
    const { metadata, driver } = await buildEntityMetadata(PublicPageDiscount);
    const runner = createQueryRunnerStub(undefined);
    const dataSource = {
      getMetadata: () => metadata,
      driver,
      createQueryRunner: () => runner,
    } as unknown as DataSource;

    const report = await ensureEntitySchema(dataSource, PublicPageDiscount);

    expect(report.created).toBe(true);
    expect(runner.release).toHaveBeenCalledTimes(1);

    const table = runner.createTable.mock.calls[0][0] as Table;
    expect(table.name).toBe('public_page_discounts');
    expect(table.columns.map(column => column.name).sort()).toEqual([
      'applicable_to',
      'code',
      'created_at',
      'expires_at',
      'id',
      'is_active',
      'max_total_uses',
      'max_uses_per_user',
      'percent_off',
      'starts_at',
      'updated_at',
      'used_count',
    ]);
    expect(
      table.indices.some(
        index => index.isUnique && index.columnNames.includes('code'),
      ),
    ).toBe(true);
  });

  it('جدولِ مصرف کدها (discount_usages) با payment_id یکتا ساخته می‌شود', async () => {
    const { metadata, driver } = await buildEntityMetadata(
      PublicPageDiscountUsage,
    );
    const runner = createQueryRunnerStub(undefined);
    const dataSource = {
      getMetadata: () => metadata,
      driver,
      createQueryRunner: () => runner,
    } as unknown as DataSource;

    const report = await ensureEntitySchema(
      dataSource,
      PublicPageDiscountUsage,
    );

    expect(report.created).toBe(true);

    const table = runner.createTable.mock.calls[0][0] as Table;
    expect(table.name).toBe('discount_usages');
    expect(table.columns.map(column => column.name).sort()).toEqual([
      'created_at',
      'discount_amount',
      'discount_id',
      'id',
      'payment_id',
      'purpose',
      'user_id',
    ]);
    // `payment_id` یکتا تا تسویهٔ تکراری یک پرداخت، مصرف جدید نسازد.
    expect(
      table.indices.some(
        index => index.isUnique && index.columnNames.includes('payment_id'),
      ),
    ).toBe(true);
  });
});
