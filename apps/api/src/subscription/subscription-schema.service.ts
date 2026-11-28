import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isRuntimeFlagEnabled } from 'src/common/config/runtime-flags';
import { ensureEntitySchema } from 'src/common/utils/schema-guard.util';
import { DataSource } from 'typeorm';

import { SmsUsage } from './entities/sms-usage.entity';

/**
 * جدول‌هایی که در production با `synchronize = false` ممکن است ساخته نشده باشند
 * (چون فقط با فایل‌های `sql/` به‌صورت دستی ساخته می‌شوند).
 *
 * نمونهٔ واقعی: جدول `sms_usages` — «دفتر مصرف پیامک». این جدول:
 *   • هیچ فایل DDL در پوشهٔ `sql/` نداشت؛
 *   • هیچ گارد اسکیمایی هم نداشت؛
 *   • و **تنها** نقطهٔ نوشتن در کل محصول، کسر سهمیهٔ پیامک در ثبت رزرو دستی است
 *     (`UserSubscriptionService.deductSms` ← فقط از مسیر `POST /bookings/manual`
 *     با پلن پیامکی فراخوانی می‌شود).
 *
 * نتیجهٔ این ترکیب دقیقاً همان تیکتِ «خطای 500 هنگام ثبت رزرو دستی با پلن
 * پیامکی» بود: خرید پلن، نمایش اعتبار در داشبورد (`/user-subscriptions/current`
 * فقط از `user_subscriptions` می‌خواند) و مسیر لینک بیعانه همه سالم بودند؛ ولی
 * هر ثبت رزروی که از مسیر پیامک می‌رفت، روی INSERT دفتر مصرف شکست می‌خورد و
 * تراکنش کل رزرو را رول‌بک می‌کرد. صفحهٔ «سابقهٔ مصرف پیامک» هم در فرانت‌اند
 * هیچ‌جا استفاده نمی‌شود، پس این شکست هیچ‌وقت از مسیر دیگری دیده نمی‌شد.
 *
 * این گارد (مثل `PublicPageSchemaService`) کاملاً idempotent است: اگر جدول و
 * ستون‌ها موجود باشند هیچ نوشتنی انجام نمی‌شود (فقط یک بررسی سبک روی اسکیمای
 * پایگاه داده) و هر خطایی فقط ثبت می‌شود و هرگز مانع بوت‌شدن سرویس نمی‌شود؛
 * در آن صورت درخواست‌ها مثل قبل با خطای مشخص (و نه ۵۰۰ مبهم) پاسخ می‌گیرند.
 */
const GUARDED_ENTITIES = [SmsUsage];

@Injectable()
export class SubscriptionSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionSchemaService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isRuntimeFlagEnabled('ENABLE_SCHEMA_MUTATIONS')) {
      return;
    }

    // synchronize=false in production: adding an enum member requires an explicit ALTER.
    try {
      const columns = await this.dataSource.query(
        `SELECT COLUMN_TYPE AS columnType FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_subscriptions' AND COLUMN_NAME = 'status'`,
      );
      const type = columns[0]?.columnType;
      if (!type) throw new Error('user_subscriptions.status not found');
      if (!/'reserved'/i.test(type)) {
        // Avoid silently discarding custom enum values when modifying the column.
        const values = [...type.matchAll(/'([^']+)'/g)].map(match => match[1]);
        if (
          !/^enum\(/i.test(type) ||
          values.some(
            value => !['active', 'expired', 'canceled'].includes(value),
          )
        ) {
          throw new Error(`unexpected status type: ${type}`);
        }
        await this.dataSource.query(
          `ALTER TABLE user_subscriptions MODIFY COLUMN status ENUM('active','reserved','expired','canceled') NOT NULL DEFAULT 'active'`,
        );
        this.logger.log('مقدار reserved به وضعیت اشتراک اضافه شد');
      }
    } catch (error) {
      this.logger.error(
        `ارتقای enum اشتراک ناموفق بود؛ پیش از استفاده فایل sql/user-subscription-reserved.sql را اجرا کنید: ${String(error)}`,
      );
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
