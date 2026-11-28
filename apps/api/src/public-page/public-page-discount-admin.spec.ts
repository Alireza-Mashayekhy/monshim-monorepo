jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { PublicPageDiscount } from './entities/public-page-discount.entity';
import { PublicPageService } from './public-page.service';

/**
 * مخزن ساختگیِ کدهای تخفیف با رفتار واقعی (یونیک بودن `code`) تا مسیر
 * «افزودن کد تخفیف» در پنل ادمین بدون پایگاه داده تست شود.
 */
function createDiscountService(options?: { saveError?: Error }) {
  const rows: PublicPageDiscount[] = [];
  let sequence = 0;

  const discountRepo = {
    find: jest.fn(() => Promise.resolve([...rows])),
    findOne: jest.fn(({ where }: { where: Partial<PublicPageDiscount> }) =>
      Promise.resolve(
        rows.find(row =>
          Object.entries(where).every(
            ([key, value]) =>
              row[key as keyof PublicPageDiscount] === (value as never),
          ),
        ) ?? null,
      ),
    ),
    create: jest.fn((input: Partial<PublicPageDiscount>) => ({ ...input })),
    save: jest.fn((entity: PublicPageDiscount) => {
      if (options?.saveError) return Promise.reject(options.saveError);
      const row = { ...entity, id: entity.id ?? `discount-${++sequence}` };
      const index = rows.findIndex(item => item.id === row.id);
      if (index >= 0) rows[index] = row;
      else rows.push(row);
      return Promise.resolve(row);
    }),
    delete: jest.fn((id: string) => {
      const index = rows.findIndex(row => row.id === id);
      if (index < 0) return Promise.resolve({ affected: 0 });
      rows.splice(index, 1);
      return Promise.resolve({ affected: 1 });
    }),
  };

  // بقیهٔ وابستگی‌ها در این مسیر استفاده نمی‌شوند
  const unused: never = {} as never;
  const service = new PublicPageService(
    unused,
    discountRepo as never,
    unused,
    unused,
    unused,
    unused,
    { get: () => undefined } as never,
    unused,
    unused, // planRepo — فقط برای استعلام/اعتبارسنجی کد تخفیف
    unused, // discountUsageRepo — فقط برای سهمیهٔ استفاده
  );

  return { service, discountRepo, rows };
}

function missingTableError() {
  return new QueryFailedError(
    'INSERT INTO public_page_discounts (...) VALUES (...)',
    [],
    Object.assign(
      new Error("Table 'monshim.public_page_discounts' doesn't exist"),
      { code: 'ER_NO_SUCH_TABLE', errno: 1146 },
    ),
  );
}

describe('مدیریت کدهای تخفیف صفحهٔ عمومی (پنل ادمین)', () => {
  it('کد را نرمال‌سازی و به‌صورت فعال ذخیره می‌کند', async () => {
    const { service, rows } = createDiscountService();

    const created = await service.createDiscountCode({
      code: ' autumn20 ',
      percentOff: 20,
    });

    expect(created).toMatchObject({
      code: 'AUTUMN20',
      percentOff: 20,
      isActive: true,
    });
    expect(rows).toHaveLength(1);
  });

  it('فیلدهای جدید (کاربرد، سقف استفاده، انقضا) هنگام ساخت ذخیره می‌شوند', async () => {
    const { service, rows } = createDiscountService();

    const created = await service.createDiscountCode({
      code: 'SAVE25',
      percentOff: 25,
      applicableTo: 'BOTH',
      maxTotalUses: 10,
      maxUsesPerUser: 1,
      expiresAt: '2027-06-01T00:00:00.000Z',
    });

    expect(created).toMatchObject({
      code: 'SAVE25',
      percentOff: 25,
      isActive: true,
      applicableTo: 'BOTH',
      maxTotalUses: 10,
      maxUsesPerUser: 1,
      usedCount: 0,
    });
    expect(created.expiresAt).toBeInstanceOf(Date);
    expect(rows).toHaveLength(1);

    // بدون فیلتر، پیش‌فرض‌ها رفتار کدهای قدیمی را نگه می‌دارند.
    const legacy = await service.createDiscountCode({
      code: 'LEGACY10',
      percentOff: 10,
    });
    expect(legacy).toMatchObject({
      applicableTo: 'PUBLIC_PAGE',
      maxTotalUses: null,
      maxUsesPerUser: null,
      expiresAt: null,
    });
  });

  it('سقف‌ها و انقضا با مقدار null در ویرایش پاک می‌شوند', async () => {
    const { service } = createDiscountService();
    const created = await service.createDiscountCode({
      code: 'SAVE25',
      percentOff: 25,
      applicableTo: 'SUBSCRIPTION',
      maxTotalUses: 10,
      maxUsesPerUser: 1,
      expiresAt: '2027-06-01T00:00:00.000Z',
    });

    await expect(
      service.updateDiscountCode(created.id, {
        applicableTo: 'PUBLIC_PAGE',
        maxTotalUses: null,
        maxUsesPerUser: null,
        expiresAt: null,
      }),
    ).resolves.toMatchObject({
      applicableTo: 'PUBLIC_PAGE',
      maxTotalUses: null,
      maxUsesPerUser: null,
      expiresAt: null,
    });
  });

  it('stores Tehran day boundaries and validates partial updates against persisted dates', async () => {
    const { service, discountRepo } = createDiscountService();
    const created = await service.createDiscountCode({
      code: 'RANGE',
      percentOff: 37,
      startsAt: '2027-03-21',
      expiresAt: '2027-03-21',
    });
    expect(created.startsAt?.toISOString()).toBe('2027-03-20T20:30:00.000Z');
    expect(created.expiresAt?.toISOString()).toBe('2027-03-21T20:29:59.000Z');
    const saves = discountRepo.save.mock.calls.length;
    await expect(
      service.updateDiscountCode(created.id, { startsAt: '2027-03-22' }),
    ).rejects.toThrow('تاریخ پایان اعتبار باید بعد از تاریخ شروع باشد');
    await expect(
      service.updateDiscountCode(created.id, { expiresAt: '2027-03-20' }),
    ).rejects.toThrow('تاریخ پایان اعتبار باید بعد از تاریخ شروع باشد');
    expect(discountRepo.save).toHaveBeenCalledTimes(saves);
    await expect(
      service.updateDiscountCode(created.id, {
        startsAt: null,
        expiresAt: null,
        percentOff: 100,
      }),
    ).resolves.toMatchObject({
      startsAt: null,
      expiresAt: null,
      percentOff: 100,
    });
  });

  it('rejects inverted/equal instants and invalid dates on creation', async () => {
    const { service } = createDiscountService();
    for (const dates of [
      { startsAt: '2027-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' },
      { startsAt: '2027-01-03', expiresAt: '2027-01-01' },
      { startsAt: '2027-02-30', expiresAt: null },
    ]) {
      await expect(
        service.createDiscountCode({
          code: 'BADDATE',
          percentOff: 1,
          ...dates,
        }),
      ).rejects.toThrow();
    }
  });

  it('کد تکراری را پیش از نوشتن با ۴۰۹ رد می‌کند (نه خطای ۵۰۰)', async () => {
    const { service } = createDiscountService();
    await service.createDiscountCode({ code: 'AUTUMN20', percentOff: 20 });

    await expect(
      service.createDiscountCode({ code: 'autumn20', percentOff: 30 }),
    ).rejects.toThrow(ConflictException);
  });

  it('در ویرایش، کد تکراریِ رکورد دیگر را رد می‌کند اما کد فعلی را می‌پذیرد', async () => {
    const { service } = createDiscountService();
    const first = await service.createDiscountCode({
      code: 'AUTUMN20',
      percentOff: 20,
    });
    await service.createDiscountCode({ code: 'WINTER30', percentOff: 30 });

    await expect(
      service.updateDiscountCode(first.id, { code: 'winter30' }),
    ).rejects.toThrow(ConflictException);

    await expect(
      service.updateDiscountCode(first.id, {
        code: 'AUTUMN20',
        percentOff: 25,
      }),
    ).resolves.toMatchObject({ code: 'AUTUMN20', percentOff: 25 });
  });

  it('غیرفعال‌کردن کد، مقدار درصد را دست نمی‌زند', async () => {
    const { service } = createDiscountService();
    const created = await service.createDiscountCode({
      code: 'AUTUMN20',
      percentOff: 20,
    });

    await expect(
      service.updateDiscountCode(created.id, { isActive: false }),
    ).resolves.toMatchObject({ isActive: false, percentOff: 20 });
  });

  it('حذف کدِ ناموجود ۴۰۴ می‌دهد', async () => {
    const { service } = createDiscountService();

    await expect(service.deleteDiscountCode('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('خطای «جدول وجود ندارد» را به‌عنوان خطای اسکیمای دیتابیس بالا می‌دهد تا فیلتر سراسری ۵۰۳ برگرداند', async () => {
    const { service } = createDiscountService({
      saveError: missingTableError(),
    });

    await expect(
      service.createDiscountCode({ code: 'AUTUMN20', percentOff: 20 }),
    ).rejects.toThrow(/doesn't exist/);
  });
});
