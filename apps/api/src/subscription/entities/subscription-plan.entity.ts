import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { SubscriptionPlanType } from '../constants';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    name: 'plan_key',
    length: 50,
    unique: true,
    nullable: true,
  })
  planKey?: string | null;

  @Column({
    length: 100,
  })
  name: string;

  @Column({
    name: 'sms_count',
    type: 'int',
    default: 0,
  })
  smsCount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  price: number;

  @Column({
    type: 'int',
  })
  durationDays: number;

  @Column({
    type: 'text',
    nullable: true,
  })
  description: string | null;

  @Column({
    default: true,
  })
  isActive: boolean;

  /**
   * نوع پلن: اشتراک پیامکی (`sms`) یا اشتراک پروفایل اختصاصی
   * (`public_page`). پیش‌فرض `sms` است تا پلن‌های موجود بدون تغییر
   * رفتار قبلی خود را حفظ کنند.
   */
  @Column({
    name: 'plan_type',
    type: 'varchar',
    length: 20,
    default: 'sms',
  })
  planType: SubscriptionPlanType;

  @Column({
    default: 0,
  })
  sortOrder: number;

  @CreateDateColumn({
    name: 'created_at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
  })
  updatedAt: Date;
}
