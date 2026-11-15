import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarberProfile } from 'src/barber/entities/barber.entity';

import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { OrphanedUploadsService } from './orphaned-uploads.service';

@Module({
  /**
   * `TypeOrmModule.forFeature` فقط برای دسترسی `OrphanedUploadsService` به
   * ریپازیتوری پروفایل آرایشگر لازم است (پاک‌سازی فایل‌های رهاشده). این
   * فراخوانی خودِ DataSource را هم در scope همین ماژول فراهم می‌کند؛ پیش‌تر
   * بدون آن، سرویس قابل ساخت نبود و بوت با «can't resolve DataSource» شکست
   * می‌خورد.
   */
  imports: [TypeOrmModule.forFeature([BarberProfile])],
  controllers: [FilesController],
  providers: [FilesService, OrphanedUploadsService],
  exports: [FilesService],
})
export class FilesModule {}
