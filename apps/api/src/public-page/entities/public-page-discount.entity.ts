import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { DiscountApplicableTo } from '../constants';

@Entity('public_page_discounts')
export class PublicPageDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ name: 'percent_off', type: 'tinyint', unsigned: true })
  percentOff: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * کد برای کدام خرید(ها) معتبر است:
   *   • `PUBLIC_PAGE`  — فقط خرید/تمدید «صفحهٔ اختصاصی» (رفتار کدهای قدیمی)
   *   • `SUBSCRIPTION` — فقط خرید «اشتراک پیامکی»
   *   • `BOTH`        — هر دو
   */
  @Column({
    name: 'applicable_to',
    type: 'varchar',
    length: 20,
    default: 'PUBLIC_PAGE',
  })
  applicableTo: DiscountApplicableTo;

  /**
   * سقف کلِ استفاده‌های موفق از کد (NULL = نامحدود). فقط زمانِ «پرداخت
   * موفق» شمرده می‌شود؛ رفتن به درگاه (PENDING) سهمیه نمی‌سوزاند.
   */
  @Column({
    name: 'max_total_uses',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  maxTotalUses: number | null;

  /** سقف استفادهٔ هر کاربر (NULL = نامحدود). */
  @Column({
    name: 'max_uses_per_user',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  maxUsesPerUser: number | null;

  /**
   * تعداد استفاده‌های موفق ثبت‌شده (آینه‌ای از شمار ردیف‌های
   * `discount_usages` برای نمایش سریع در پنل ادمین).
   */
  @Column({ name: 'used_count', type: 'int', unsigned: true, default: 0 })
  usedCount: number;

  /** شروع اعتبار (NULL = بدون محدودیت شروع). */
  @Column({ name: 'starts_at', type: 'datetime', nullable: true })
  startsAt: Date | null;

  /** تاریخ انقضای کد (NULL = بدون انقضا). */
  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
