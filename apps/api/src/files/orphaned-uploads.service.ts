import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { BarberProfile } from 'src/barber/entities/barber.entity';
import { getUploadRoot } from 'src/common/utils/upload-path.util';
import { Repository } from 'typeorm';

/**
 * پاک‌سازی فایل‌های رهاشده (Orphaned Files).
 *
 * چرا لازم است؟
 * هر آپلود چند مرحله دارد: نوشتن روی دیسک، ذخیرهٔ مسیر در دیتابیس، و در
 * مسیرهایی مثل نمونه‌کار/لوگو، ارجاع از `pendingChanges`. اگر بین این
 * مرحله‌ها خطایی رخ دهد (کرش پروسه، قطع اتصال کاربر، خطای دیتابیس) یا مسیر
 * در دیتابیس بازنویسی شود، فایل روی دیسک می‌ماند و هیچ ارجاعی ندارد.
 *
 * این سرویس فقط فایل‌هایی را حذف می‌کند که:
 *   ۱. در پوشه‌های کاربر (`profiles`, `portfolio`) هستند — پوشهٔ `blog`
 *      مدیرمحور است و به‌صورت دستی مدیریت می‌شود؛
 *   ۲. در هیچ رکوردی (پروفایل فعلی یا پیش‌نویس) ارجاع ندارند؛
 *   ۳. از زمان نوشتنشان بیشتر از `MIN_AGE_MS` گذشته است — تا فایلی که همین
 *      حالا آپلود شده ولی هنوز در دیتابیس ثبت نشده، پاک نشود.
 *
 * هیچ فایلی که در دیتابیس ارجاع دارد هرگز حذف نمی‌شود.
 */

/** پنجرهٔ امنیت: فایل‌های تازه‌تر از این مدت دست‌نخورده می‌مانند. */
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** پوشه‌هایی که این سرویس مسئول پاک‌سازی آن‌هاست. */
const MANAGED_FOLDERS = ['profiles', 'portfolio'];

export interface OrphanCleanupResult {
  scanned: number;
  deleted: number;
  kept: number;
  errors: number;
}

@Injectable()
export class OrphanedUploadsService {
  private readonly logger = new Logger(OrphanedUploadsService.name);

  /**
   * ریپازیتوری تزریق می‌شود (نه `DataSource`) تا همان الگوی بقیهٔ پروژه
   * حفظ شود و `FilesModule` فقط با `TypeOrmModule.forFeature` کار کند.
   */
  constructor(
    @InjectRepository(BarberProfile)
    private readonly profileRepository: Repository<BarberProfile>,
  ) {}

  /**
   * اجرای روزانه در ساعت ۳ بامداد.
   *
   * چرا شبانه؟ چون لازم نیست فوری باشد (هزینهٔ فضا)، و در ساعات کم‌بار
   * امن‌تر از اجرای هم‌زمان با ترافیک است.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledCleanup(): Promise<void> {
    try {
      const result = await this.cleanup();
      this.logger.log(
        `orphan upload cleanup: scanned=${result.scanned} deleted=${result.deleted} ` +
          `kept=${result.kept} errors=${result.errors}`,
      );
    } catch (error) {
      // پاک‌سازی یک کار نگهداری است و نباید هیچ جریان کاربری را بشکند.
      this.logger.error(`orphan upload cleanup failed: ${String(error)}`);
    }
  }

  /**
   * اجرای دستی/آزمایشی پاک‌سازی.
   * `now` و `minAgeMs` برای تست تزریق می‌شوند.
   */
  async cleanup(
    options: { now?: number; minAgeMs?: number } = {},
  ): Promise<OrphanCleanupResult> {
    const now = options.now ?? Date.now();
    const minAgeMs = options.minAgeMs ?? MIN_AGE_MS;
    const root = getUploadRoot();
    const referenced = await this.collectReferencedPaths();

    const result: OrphanCleanupResult = {
      scanned: 0,
      deleted: 0,
      kept: 0,
      errors: 0,
    };

    for (const folder of MANAGED_FOLDERS) {
      const dir = path.join(root, folder);
      let entries: string[];
      try {
        entries = await fs.promises.readdir(dir);
      } catch {
        // پوشه هنوز ساخته نشده است؛ چیزی برای پاک‌سازی نیست.
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        result.scanned += 1;

        const publicPath = `/uploads/${folder}/${entry}`;
        if (referenced.has(publicPath)) {
          result.kept += 1;
          continue;
        }

        try {
          const stat = await fs.promises.stat(fullPath);
          if (!stat.isFile()) {
            result.kept += 1;
            continue;
          }
          if (now - stat.mtimeMs < minAgeMs) {
            // ممکن است همین حالا آپلود شده و ثبت دیتابیسش در جریان باشد.
            result.kept += 1;
            continue;
          }
          await fs.promises.unlink(fullPath);
          result.deleted += 1;
        } catch (error) {
          result.errors += 1;
          this.logger.warn(
            `failed to clean orphan upload ${publicPath}: ${String(error)}`,
          );
        }
      }
    }

    return result;
  }

  /** همهٔ مسیرهای فایلی که در دیتابیس ارجاع دارند (پروفایل + پیش‌نویس). */
  private async collectReferencedPaths(): Promise<Set<string>> {
    const profiles = await this.profileRepository.find({
      select: {
        id: true,
        profileImage: true,
        portfolioImages: true,
        pendingChanges: true,
      },
    });

    const referenced = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value === 'string' && value.startsWith('/uploads/')) {
        referenced.add(value);
      }
    };
    const addAll = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(add);
    };

    for (const profile of profiles) {
      add(profile.profileImage);
      addAll(profile.portfolioImages);
      add(profile.pendingChanges?.profileImage);
      addAll(profile.pendingChanges?.portfolioImages);
    }

    return referenced;
  }
}
