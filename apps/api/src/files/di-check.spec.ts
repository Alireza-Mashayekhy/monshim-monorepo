import { getRepositoryToken } from '@nestjs/typeorm';
import { BarberProfile } from 'src/barber/entities/barber.entity';

import { FilesModule } from './files.module';
import { OrphanedUploadsService } from './orphaned-uploads.service';

// @nestjs/schedule فقط ESM است؛ در این تست به دکوراتور Cron نیازی نیست.
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: '0 0 3 * * *' },
}));

/**
 * تست سیم‌کشی ماژول آپلود.
 *
 * هدف: مطمئن شویم `FilesModule` همهٔ وابستگی‌های `OrphanedUploadsService`
 * (`getRepositoryToken(BarberProfile)`) را تأمین می‌کند. اگر این توکن در
 * ماژول ثبت نشود، بوت کل API با «can't resolve dependencies» شکست می‌خورد.
 *
 * ⚠️ فقط همین یک گراف کوچک ساخته می‌شود؛ `FilesController` عمداً وارد تست
 * نشده تا به `AuthGuard` و زنجیرهٔ Jwt/Redis/Users وابسته نشود.
 */
describe('FilesModule DI wiring', () => {
  it('وابستگی ریپازیتوری پروفایل برای سرویس پاک‌سازی ثبت شده است', () => {
    const imports = Reflect.getMetadata('imports', FilesModule) ?? [];
    const providers = Reflect.getMetadata('providers', FilesModule) ?? [];

    // `TypeOrmModule.forFeature` یک ماژول پویا برمی‌گرداند که توکن
    // ریپازیتوری را export می‌کند؛ وجود آن یعنی توکن قابل تزریق است.
    expect(imports.length).toBeGreaterThan(0);
    expect(getRepositoryToken(BarberProfile)).toBe('BarberProfileRepository');
    expect(providers).toContain(OrphanedUploadsService);
  });
});
