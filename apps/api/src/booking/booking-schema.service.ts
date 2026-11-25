import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isRuntimeFlagEnabled } from 'src/common/config/runtime-flags';
import { ensureEntitySchema } from 'src/common/utils/schema-guard.util';
import { DataSource } from 'typeorm';

import { Booking } from './entities/booking.entity';
import { SlotHold } from './entities/slot-hold.entity';

/**
 * جدول‌ها/ستون‌هایی که در production با `synchronize = false` ممکن است
 * ساخته نشده باشند (چون فقط با فایل‌های `sql/` به‌صورت دستی ساخته
 * می‌شوند).
 *
 * نمونهٔ واقعی: ستون‌های مسیر «ثبت رزرو دستی» روی جدول `bookings`
 * (`send_deposit_link`، `send_sms_reminder`، `reminder_hours`،
 * `reminder_sent_at`، `deposit_token`، `deposit_paid_at`) هیچ فایل DDL
 * کاملی در پوشهٔ `sql/` نداشتند و هیچ گاردی هم نداشتند. چون
 * `createManualByBarber` این ستون‌ها را **صریح** روی ردیف رزرو می‌نویسد،
 * نبودِ هرکدام در production باعث شکستِ INSERT رزرو و خطای ۵۰۰ می‌شد؛
 * در حالی که رزرو آنلاین (که این فیلدها را ست نمی‌کند) سالم می‌ماند و
 * نقص فقط در «ثبت رزرو دستی» دیده می‌شد. جدول `slot_holds` هم همین
 * وضعیت را داشت (فقط در یک فایل SQL دستی پوشش داده شده بود).
 *
 * این گارد (مثل `SubscriptionSchemaService` و `PublicPageSchemaService`)
 * کاملاً idempotent است: اگر جدول و ستون‌ها موجود باشند هیچ نوشتنی
 * انجام نمی‌شود (فقط یک بررسی سبک روی اسکیمای پایگاه داده) و هر خطایی
 * فقط ثبت می‌شود و هرگز مانع بوت‌شدن سرویس نمی‌شود؛ در آن صورت
 * درخواست‌ها مثل قبل با خطای مشخص (و نه ۵۰۰ مبهم) پاسخ می‌گیرند.
 */
const GUARDED_ENTITIES = [Booking, SlotHold];

@Injectable()
export class BookingSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BookingSchemaService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isRuntimeFlagEnabled('ENABLE_SCHEMA_MUTATIONS')) {
      return;
    }

    for (const entity of GUARDED_ENTITIES) {
      try {
        const report = await ensureEntitySchema(this.dataSource, entity);

        if (report.created) {
          this.logger.log(
            `جدول «${report.table}» در پایگاه داده وجود نداشت و به‌صورت خودکار ساخته شد ` +
              `(دیگر نیازی به اجرای دستی فایل‌های پوشهٔ sql/ برای این جدول نیست).`,
          );
        } else if (report.addedColumns.length > 0) {
          this.logger.log(
            `ستون‌های جاماندهٔ جدول «${report.table}» اضافه شد: ${report.addedColumns.join('، ')}`,
          );
        }

        for (const warning of report.warnings) {
          this.logger.warn(warning);
        }
      } catch (error) {
        // شکستِ این گارد نباید سرویس را از کار بیندازد؛ فقط تشخیص خطا را
        // برای اپراتور روشن می‌کنیم.
        this.logger.error(
          `ساخت خودکار جدول مربوط به ${
            typeof entity === 'function' ? entity.name : String(entity)
          } ناموفق بود؛ در صورت نیاز فایل‌های پوشهٔ sql/ را به‌صورت دستی اجرا کنید. جزئیات: ${String(error)}`,
        );
      }
    }
  }
}
