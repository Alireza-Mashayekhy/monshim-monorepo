jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: new Proxy({}, { get: () => '0 * * * *' }),
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import request from 'supertest';

import { PublicPageService } from './public-page.service';
import { PublicPageDiscountAdminController } from './public-page-discount.admin.controller';

describe('discount admin HTTP validation', () => {
  let app: INestApplication;
  let row: any = null;
  const repo = {
    findOne: jest.fn(({ where }) => Promise.resolve(where.id ? row : null)),
    create: (value: any) => ({ ...value, id: '1' }),
    save: (value: any) => {
      row = { ...value };
      return Promise.resolve(row);
    },
  };
  beforeAll(async () => {
    const unused = {} as never;
    const service = new PublicPageService(
      unused,
      repo as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
    const module = await Test.createTestingModule({
      controllers: [PublicPageDiscountAdminController],
      providers: [{ provide: PublicPageService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());

  it('accepts date-only and validates merged partial updates and integer percentages', async () => {
    const base = '/admin/public-page/discounts';
    const created = await request(app.getHttpServer())
      .post(base)
      .send({
        code: 'RANGE',
        percentOff: 37,
        startsAt: '2027-03-21',
        expiresAt: '2027-03-21',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      startsAt: '2027-03-20T20:30:00.000Z',
      expiresAt: '2027-03-21T20:29:59.000Z',
    });
    await request(app.getHttpServer())
      .patch(`${base}/1`)
      .send({ startsAt: '2027-03-22' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/1`)
      .send({ percentOff: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/1`)
      .send({ percentOff: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/1`)
      .send({ percentOff: 2.5 })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/1`)
      .send({ startsAt: '2027-02-30' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/1`)
      .send({ startsAt: null, expiresAt: null, percentOff: 100 })
      .expect(200);
    expect(row).toMatchObject({
      startsAt: null,
      expiresAt: null,
      percentOff: 100,
    });
  });
});
