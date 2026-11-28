import { BarberService } from './barber.service';

/** Production does not use TypeORM synchronize. */
describe('barber public-visibility schema', () => {
  /**
   * ستون‌هایی که در productionِ «قبل از این تغییر» وجود دارند.
   * `updated_at` هم از قبل هست تا تست‌های این فایل فقط روی رفتارِ ستون
   * نمایش عمومی و ستون‌های راه‌های ارتباطی تمرکز کنند؛ ساختِ `updated_at`
   * تستِ جدا دارد.
   */
  const oldColumns = [
    { COLUMN_NAME: 'pending_changes' },
    { COLUMN_NAME: 'pending_status' },
    { COLUMN_NAME: 'pending_rejection_reason' },
    { COLUMN_NAME: 'updated_at' },
  ];

  const visibilityColumn = { COLUMN_NAME: 'is_publicly_visible' };

  /** ستون‌های جدید راه‌های ارتباطی و موقعیت مکانی. */
  const contactColumns = [
    { COLUMN_NAME: 'contact_phone' },
    { COLUMN_NAME: 'instagram' },
    { COLUMN_NAME: 'whatsapp' },
    { COLUMN_NAME: 'telegram' },
    { COLUMN_NAME: 'latitude' },
    { COLUMN_NAME: 'longitude' },
  ];

  function setup(columns = oldColumns, alterError?: Error & { code?: string }) {
    const profileRepo = {
      metadata: { tableName: 'barber_profile' },
      query: jest.fn((sql: string) => {
        if (sql.startsWith('SELECT')) return Promise.resolve(columns);
        if (alterError) return Promise.reject(alterError);
        return Promise.resolve([]);
      }),
    };
    const userRepo = { save: jest.fn(), update: jest.fn() };
    const service = new BarberService(
      userRepo as any,
      profileRepo as any,
      {} as any,
    );
    return { service, profileRepo, userRepo };
  }

  it('adds the missing visibility and contact/location columns, with defaults, without reactivating accounts', async () => {
    const { service, profileRepo, userRepo } = setup();
    await service.onModuleInit();
    // 1 SELECT + افزودن is_publicly_visible + شش ستون راه‌های ارتباطی/موقعیت
    expect(profileRepo.query).toHaveBeenCalledTimes(8);
    expect(profileRepo.query).toHaveBeenCalledWith(
      'ALTER TABLE `barber_profile` ADD COLUMN `is_publicly_visible` TINYINT(1) NOT NULL DEFAULT 1',
    );
    expect(profileRepo.query).toHaveBeenCalledWith(
      'ALTER TABLE `barber_profile` ADD COLUMN `contact_phone` VARCHAR(20) NULL',
    );
    expect(profileRepo.query).toHaveBeenCalledWith(
      'ALTER TABLE `barber_profile` ADD COLUMN `latitude` DECIMAL(10,7) NULL',
    );
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(
      profileRepo.query.mock.calls.some(([sql]) => /^UPDATE/i.test(sql)),
    ).toBe(false);
  });

  it('does not run DDL when all columns already exist', async () => {
    const { service, profileRepo } = setup([
      ...oldColumns,
      visibilityColumn,
      ...contactColumns,
    ]);
    await service.onModuleInit();
    expect(profileRepo.query).toHaveBeenCalledTimes(1);
  });

  it('tolerates a concurrent instance adding the same column', async () => {
    const duplicate = Object.assign(new Error('duplicate column'), {
      code: 'ER_DUP_FIELDNAME',
    });
    const { service } = setup(oldColumns, duplicate);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('fails startup with the original error if the required column cannot be created', async () => {
    const denied = Object.assign(new Error('ALTER permission denied'), {
      code: 'ER_TABLEACCESS_DENIED_ERROR',
    });
    const { service } = setup(oldColumns, denied);
    await expect(service.onModuleInit()).rejects.toBe(denied);
  });

  it('adds contact/location columns with the documented DDL only when missing', async () => {
    const { service, profileRepo } = setup([...oldColumns, visibilityColumn]);
    await service.onModuleInit();

    const addColumnSql = profileRepo.query.mock.calls
      .map(([sql]) => String(sql))
      .filter(sql => sql.includes('ADD COLUMN'));
    expect(addColumnSql).toEqual([
      'ALTER TABLE `barber_profile` ADD COLUMN `contact_phone` VARCHAR(20) NULL',
      'ALTER TABLE `barber_profile` ADD COLUMN `instagram` VARCHAR(100) NULL',
      'ALTER TABLE `barber_profile` ADD COLUMN `whatsapp` VARCHAR(30) NULL',
      'ALTER TABLE `barber_profile` ADD COLUMN `telegram` VARCHAR(100) NULL',
      'ALTER TABLE `barber_profile` ADD COLUMN `latitude` DECIMAL(10,7) NULL',
      'ALTER TABLE `barber_profile` ADD COLUMN `longitude` DECIMAL(10,7) NULL',
    ]);
  });

  it('fails startup pointing at barber-contact-location.sql when contact/location columns cannot be created', async () => {
    const denied = Object.assign(new Error('ALTER permission denied'), {
      code: 'ER_TABLEACCESS_DENIED_ERROR',
    });
    const { service } = setup([...oldColumns, visibilityColumn], denied);
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(service.onModuleInit()).rejects.toBe(denied);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('sql/barber-contact-location.sql'),
    );
    errorSpy.mockRestore();
  });

  it('adds updated_at (lastmod source) and backfills it when missing', async () => {
    const { service, profileRepo } = setup([
      ...oldColumns.filter(column => column.COLUMN_NAME !== 'updated_at'),
      visibilityColumn,
    ]);
    await service.onModuleInit();

    expect(profileRepo.query).toHaveBeenCalledWith(
      'ALTER TABLE `barber_profile` ADD COLUMN `updated_at` DATETIME(6) NULL',
    );
    expect(
      profileRepo.query.mock.calls.some(([sql]) =>
        /^UPDATE `barber_profile` SET `updated_at` = `created_at`/i.test(sql),
      ),
    ).toBe(true);
  });

  it('does not touch updated_at when the column already exists', async () => {
    const { service, profileRepo } = setup([...oldColumns, visibilityColumn]);
    await service.onModuleInit();

    expect(
      profileRepo.query.mock.calls.some(([sql]) =>
        /updated_at/i.test(String(sql)),
      ),
    ).toBe(false);
  });
});
