import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AllExceptionsFilter } from 'src/common/exceptions/all-exceptions.filter';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { FilesService } from 'src/files/files.service';
import { City } from 'src/locations/entities/city.entity';
import { SessionRevocationService } from 'src/redis/session-revocation.service';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import request from 'supertest';

import { BarberController } from './barber.controller';
import { BarberService, normalizeGenderFilter } from './barber.service';
import { BarberQueryDto } from './dto/barber-query.dto';
import { BarberProfile } from './entities/barber.entity';
import { WorkHoursService } from './work-hours.service';

/**
 * تست رگرسیون `GET /api/barber?gender=...`.
 *
 * باگ واقعی (گزارش کاربر عادی):
 *   `https://monshiim.ir/api/barber?page=1&limit=10&sort=createdAt:desc&gender=male`
 *   → ۴۰۰ با پیام «property gender should not exist»
 *
 * علت: `gender` در `BarberQueryDto` اعلام نشده بود و `ValidationPipe` سراسری
 * با `forbidNonWhitelisted: true` هر پارامتر اعلام‌نشده را رد می‌کرد. صفحهٔ
 * `/panel/explore` برای کاربر عادی همیشه این پارامتر را می‌فرستد، پس فهرست
 * سالن‌ها هرگز بارگذاری نمی‌شد.
 *
 * ⚠️ نکتهٔ مهم دربارهٔ این تست: pipe دقیقاً مثل `main.ts` تنظیم شده است
 * (`forbidNonWhitelisted: true`). تست‌های قبلی این گزینه را نداشتند و
 * به همین دلیل این باگ را نمی‌گرفتند.
 */
describe('GET /barber — پارامتر gender و اعتبارسنجی کوئری', () => {
  let app: INestApplication;
  let findAll: jest.Mock;

  beforeAll(async () => {
    findAll = jest.fn(async () => ({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    }));

    const module = await Test.createTestingModule({
      controllers: [BarberController],
      providers: [
        { provide: BarberService, useValue: { findAll } },
        { provide: WorkHoursService, useValue: {} },
        { provide: getRepositoryToken(BarberProfile), useValue: {} },
        { provide: FilesService, useValue: {} },
        // `AuthGuard` در سطح برخی اکشن‌های همین کنترلر است؛ endpoint فهرست
        // گارد ندارد، اما Nest این وابستگی‌ها را هنگام ساخت کنترلر می‌خواهد.
        AuthGuard,
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        {
          provide: SessionRevocationService,
          useValue: { isRevoked: jest.fn() },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    // همان تنظیمات production در `main.ts`.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter(app.getHttpAdapter()));
    await app.init();
  });

  beforeEach(() => {
    findAll.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  const callsOf = () => findAll.mock.calls as unknown as [unknown, any][];

  it('درخواست دقیق گزارش‌شده با gender=male دیگر ۴۰۰ نمی‌دهد', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/barber')
      .query({ page: 1, limit: 10, sort: 'createdAt:desc', gender: 'male' })
      .expect(200);

    expect(response.body).toMatchObject({ status: 200 });
    const filters = callsOf()[0][1];
    expect(filters.gender).toBe('male');
    expect(filters.cityId).toBeUndefined();
  });

  it('gender=female هم پذیرفته و به سرویس منتقل می‌شود', async () => {
    await request(app.getHttpServer())
      .get('/api/barber?gender=female')
      .expect(200);

    expect(callsOf()[0][1].gender).toBe('female');
  });

  it('بدون gender: فیلتر اعمال نمی‌شود (همهٔ سالن‌ها)', async () => {
    await request(app.getHttpServer()).get('/api/barber').expect(200);

    expect(callsOf()[0][1].gender).toBeNull();
  });

  it('مقدار ناشناختهٔ gender به‌جای ۵۰۰/۴۰۰ نادیده گرفته نمی‌شود بلکه ۴۰۰ روشن می‌دهد', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/barber?gender=unknown')
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/male|female/);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('پارامتر ناشناختهٔ دیگر همچنان ۴۰۰ می‌دهد (محافظت حفظ شده)', async () => {
    await request(app.getHttpServer())
      .get('/api/barber?totallyUnknown=1')
      .expect(400);

    expect(findAll).not.toHaveBeenCalled();
  });

  it('فیلترهای عددی همان‌طور که هستند اعمال می‌شوند (بدون دو منبع حقیقت)', async () => {
    await request(app.getHttpServer())
      .get('/api/barber')
      .query({
        cityId: 12,
        provinceId: 3,
        minPrice: 100000,
        maxPrice: 500000,
        minRating: 4,
        gender: 'male',
      })
      .expect(200);

    expect(callsOf()[0][1]).toMatchObject({
      cityId: 12,
      provinceId: 3,
      minPrice: 100000,
      maxPrice: 500000,
      minRating: 4,
      gender: 'male',
    });
  });

  it('شهر خالی/نامعتبر کل درخواست را رد نمی‌کند', async () => {
    // `?cityId=` در حالت‌های واقعی (مثلاً پاک‌کردن فیلتر) رخ می‌دهد.
    await request(app.getHttpServer()).get('/api/barber?cityId=').expect(200);
  });

  it('مقدار عددی فارسی در کوئری پذیرفته می‌شود', async () => {
    await request(app.getHttpServer())
      .get('/api/barber')
      .query({ cityId: '۱۲', page: '۲' })
      .expect(200);

    expect(callsOf()[0][1].cityId).toBe(12);
  });
});

describe('normalizeGenderFilter', () => {
  it('فقط male/female را می‌پذیرد', () => {
    expect(normalizeGenderFilter('male')).toBe('male');
    expect(normalizeGenderFilter('FEMALE')).toBe('female');
    expect(normalizeGenderFilter(' female ')).toBe('female');
  });

  it('مقادیر نامعتبر/خالی/غیررشته‌ای را null می‌کند', () => {
    expect(normalizeGenderFilter('men')).toBeNull();
    expect(normalizeGenderFilter('')).toBeNull();
    expect(normalizeGenderFilter(undefined)).toBeNull();
    expect(normalizeGenderFilter(null)).toBeNull();
    expect(normalizeGenderFilter(42)).toBeNull();
  });
});

describe('BarberQueryDto — قرارداد کوئری', () => {
  it('gender و فیلترهای عددی را می‌پذیرد', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const metadata = {
      type: 'query' as const,
      metatype: BarberQueryDto,
      data: undefined,
    };

    const parsed = (await pipe.transform(
      { page: '2', limit: '5', gender: 'male', cityId: '7' },
      metadata,
    )) as BarberQueryDto;

    expect(parsed).toMatchObject({
      page: 2,
      limit: 5,
      gender: 'male',
      cityId: 7,
    });
  });
});

/**
 * سناریوی کامل واقعی: کنترلر + سرویس واقعی + کوئری‌ساز واقعی روی یک
 * repository در حافظه که شرط `activity_type` را **واقعاً** اعمال می‌کند.
 *
 * چرا لازم است؟ تست قبلی فقط «پذیرش پارامتر» را می‌سنجد. این تست نشان
 * می‌دهد فیلتر جنسیت بعد از عبور از ValidationPipe واقعاً نتایج را محدود
 * می‌کند (نیازمندی کاربر: نمایش نتایج فیلترشده بر اساس جنسیت) و برای مهمان
 * همهٔ سالن‌ها برمی‌گردند.
 */
describe('GET /barber با سرویس واقعی — نتیجهٔ فیلتر جنسیت', () => {
  const salons = [
    { id: 1, barberProfile: { salonName: 'سالن مردانه', activityType: 'men' } },
    {
      id: 2,
      barberProfile: { salonName: 'سالن زنانه', activityType: 'women' },
    },
    { id: 3, barberProfile: { salonName: 'سالن مشترک', activityType: 'both' } },
  ];

  let app: INestApplication;
  let executedSql: string[];

  /** کوئری‌ساز کمینه که شرط‌های پشتیبانی‌شده را در حافظه اعمال می‌کند. */
  function buildRepository() {
    const clauses: string[] = [];
    const params: Record<string, any> = {};
    const qb: any = {
      subQuery: () => ({
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: () => '(SELECT 1)',
      }),
      where: (clause: string, p?: Record<string, any>) => {
        clauses.push(clause);
        Object.assign(params, p);
        return qb;
      },
      andWhere: (clause: string, p?: Record<string, any>) => {
        clauses.push(clause);
        Object.assign(params, p);
        return qb;
      },
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getOne: () => Promise.resolve(null),
      getRawMany: () => Promise.resolve([]),
      getManyAndCount: () => {
        executedSql.push(clauses.join(' AND '));
        const genderClause = clauses.find(c =>
          c.includes('profile.activityType IN'),
        );
        const matched = genderClause
          ? salons.filter(salon =>
              (params.activityTypes as string[]).includes(
                salon.barberProfile.activityType,
              ),
            )
          : salons;
        return Promise.resolve([matched, matched.length]);
      },
    };
    return qb;
  }

  beforeAll(async () => {
    executedSql = [];
    const module = await Test.createTestingModule({
      controllers: [BarberController],
      providers: [
        BarberService,
        {
          provide: getRepositoryToken(User),
          useValue: { createQueryBuilder: () => buildRepository() },
        },
        { provide: getRepositoryToken(BarberProfile), useValue: {} },
        { provide: getRepositoryToken(City), useValue: {} },
        { provide: WorkHoursService, useValue: {} },
        { provide: FilesService, useValue: {} },
        AuthGuard,
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        {
          provide: SessionRevocationService,
          useValue: { isRevoked: jest.fn() },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter(app.getHttpAdapter()));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('کاربر مرد فقط سالن‌های مردانه و مشترک را می‌بیند (۲۰۰، بدون خطای gender)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/barber')
      .query({ page: 1, limit: 10, sort: 'createdAt:desc', gender: 'male' })
      .expect(200);

    expect(
      (response.body.data as { salonName: string }[]).map(
        item => item.salonName,
      ),
    ).toEqual(['سالن مردانه', 'سالن مشترک']);
  });

  it('کاربر زن فقط سالن‌های زنانه و مشترک را می‌بیند', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/barber?gender=female')
      .expect(200);

    expect(
      (response.body.data as { salonName: string }[]).map(
        item => item.salonName,
      ),
    ).toEqual(['سالن زنانه', 'سالن مشترک']);
  });

  it('مهمان (بدون gender) همهٔ سالن‌ها را می‌بیند', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/barber')
      .expect(200);

    expect(response.body.data).toHaveLength(3);
  });
});
