import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { DiscountTarget } from '../constants';

/**
 * ثبتِ هر «استفادهٔ موفق» از کد تخفیف (یعنی پرداختی که واقعاً با تخفیف
 * تسویه شده است).
 *
 * چرا جدول جدا: سهمیهٔ کدها (سقف کل / سقف هر کاربر) باید فقط با پرداخت
 * موفق پر شود — نه با رفتن کاربر به درگاه. رکوردِ `paymentId` یکتاست تا
 * تسویهٔ دوبارهٔ یک پرداخت، مصرف را دوبار نشمارد (محافظت idempotent).
 *
 * این جدول در `sql/public-page-discounts.sql` هم آمده و مشابه جدول کدها با
 * گارد اسکیمای بوت (`PublicPageSchemaService`) تضمین می‌شود.
 */
@Entity('discount_usages')
@Index(['discountId', 'userId'])
export class PublicPageDiscountUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** شناسهٔ کد تخفیف مصرف‌شده (بدون FK تا حذف کد، تاریخچهٔ مصرف را پاک نکند). */
  @Column({ name: 'discount_id', type: 'char', length: 36 })
  discountId: string;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  /**
   * پرداختی که این مصرف را ساخته است؛ یکتا تا تسویهٔ تکراری یک پرداخت
   * (race در callback/ reconcile) مصرف جدید نسازد. برای مسیر رایگان هم بعد
   * از ذخیرهٔ Payment پر می‌شود.
   */
  @Column({
    name: 'payment_id',
    type: 'char',
    length: 36,
    nullable: true,
    unique: true,
  })
  paymentId: string | null;

  /** هدفی که کد برایش اعمال شده: خرید صفحهٔ اختصاصی یا اشتراک پیامکی. */
  @Column({ type: 'varchar', length: 20 })
  purpose: DiscountTarget;

  /** مبلغ تخفیف اعمال‌شده روی همین پرداخت (تومان). */
  @Column({ name: 'discount_amount', type: 'int', unsigned: true })
  discountAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
