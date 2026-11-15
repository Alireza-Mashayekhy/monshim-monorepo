import { NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { User } from 'src/users/entities/user.entity';
import { DataSource } from 'typeorm';

import { BarberService } from './barber.service';
import { BarberProfile } from './entities/barber.entity';

/** Build real MySQL-dialect queries without requiring a running DB server. */
describe('barber visibility SQL mapping', () => {
  it('maps the entity flag to the production column in every public query', async () => {
    const source = new DataSource({
      type: 'mysql',
      database: 'test',
      entities: [join(__dirname, '../**/*.entity.ts')],
    });
    await (source as any).buildMetadatas();
    expect(
      source
        .getMetadata(BarberProfile)
        .findColumnWithPropertyName('isPubliclyVisible')?.databaseName,
    ).toBe('is_publicly_visible');

    const sql: string[] = [];
    const userRepo = source.getRepository(User);
    const profileRepo = source.getRepository(BarberProfile);
    const userBuilder = userRepo.createQueryBuilder.bind(userRepo);
    const profileBuilder = profileRepo.createQueryBuilder.bind(profileRepo);
    jest
      .spyOn(userRepo, 'createQueryBuilder')
      .mockImplementation((alias: string) => {
        const qb = userBuilder(alias);
        qb.getManyAndCount = () => {
          sql.push(qb.getQuery());
          return Promise.resolve([[], 0]);
        };
        qb.getOne = () => {
          sql.push(qb.getQuery());
          return Promise.resolve(null);
        };
        return qb;
      });
    jest
      .spyOn(profileRepo, 'createQueryBuilder')
      .mockImplementation((alias: string) => {
        const qb = profileBuilder(alias);
        qb.getRawMany = () => {
          sql.push(qb.getQuery());
          return Promise.resolve([]);
        };
        return qb;
      });

    const service = new BarberService(userRepo, profileRepo, {} as any);
    await service.findAll({});
    await expect(service.findPublicOne(42)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.getPublicDirectory();
    expect(sql).toHaveLength(3);
    for (const statement of sql) {
      expect(statement).toContain(
        '`profile`.`is_publicly_visible` = :isPubliclyVisible',
      );
    }
  });
});

/**
 * فیلتر جنسیت در SQL واقعی (نه mock رشته‌ای).
 *
 * این تست تضمین می‌کند که `gender=male|female` واقعاً یک شرط `activityType`
 * روی کوئری اضافه مي‌کند و مقدار نامعتبر هیچ شرطی اضافه نمی‌کند — یعنی فیلتر
 * «کار می‌کند» و در حالت خالی «سالن‌ها را حذف نمی‌کند».
 */
describe('barber list gender filter SQL', () => {
  async function captureListQueries(
    filters?: Parameters<BarberService['findAll']>[1],
  ) {
    const source = new DataSource({
      type: 'mysql',
      database: 'test',
      entities: [join(__dirname, '../**/*.entity.ts')],
    });
    await (source as any).buildMetadatas();

    const statements: { sql: string; params: Record<string, unknown> }[] = [];
    const userRepo = source.getRepository(User);
    const profileRepo = source.getRepository(BarberProfile);
    const original = userRepo.createQueryBuilder.bind(userRepo);
    jest
      .spyOn(userRepo, 'createQueryBuilder')
      .mockImplementation((alias: string) => {
        const qb = original(alias);
        qb.getManyAndCount = () => {
          statements.push({ sql: qb.getQuery(), params: qb.getParameters() });
          return Promise.resolve([[], 0]);
        };
        return qb;
      });

    const service = new BarberService(userRepo, profileRepo, {} as any);
    await service.findAll({ page: 1, limit: 10 }, filters);

    return statements[0];
  }

  it('gender=male → activityType در (men, both)', async () => {
    const statement = await captureListQueries({ gender: 'male' });
    expect(statement.sql).toContain('`profile`.`activity_type` IN');
    expect(statement.params.activityTypes).toEqual(['men', 'both']);
  });

  it('gender=female → activityType در (women, both)', async () => {
    const statement = await captureListQueries({ gender: 'female' });
    expect(statement.sql).toContain('`profile`.`activity_type` IN');
    expect(statement.params.activityTypes).toEqual(['women', 'both']);
  });

  it('بدون gender → هیچ شرط activityType اضافه نمی‌شود', async () => {
    const statement = await captureListQueries(undefined);
    expect(statement.sql).not.toContain('`profile`.`activity_type` IN');
  });

  it('مقدار نامعتبر (مثل men) مثل «بدون فیلتر» رفتار می‌کند', async () => {
    const statement = await captureListQueries({
      gender: 'men' as unknown as 'male',
    });
    expect(statement.sql).not.toContain('`profile`.`activity_type` IN');
  });
});
