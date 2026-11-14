import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isReminderInFuture } from './reminder.ts';

// نوبت: ۱۴:۰۰ تهران = ۱۰:۳۰ UTC
const DATE = '2026-11-20';
const TIME = '14:00';
const at = (iso: string) => Date.parse(iso);

test('یادآوری‌ای که زمانش هنوز نرسیده قابل انتخاب است', () => {
  // ۳ ساعت مانده به نوبت
  const now = at('2026-11-20T07:30:00Z');

  assert.equal(isReminderInFuture(DATE, TIME, 1, now), true);
  assert.equal(isReminderInFuture(DATE, TIME, 2, now), true);
});

test('یادآوری‌ای که زمانش گذشته قابل انتخاب نیست', () => {
  const now = at('2026-11-20T07:30:00Z');

  assert.equal(isReminderInFuture(DATE, TIME, 4, now), false);
  assert.equal(isReminderInFuture(DATE, TIME, 24, now), false);
  // دقیقاً سرِ زمان ارسال هم دیر است
  assert.equal(isReminderInFuture(DATE, TIME, 3, now), false);
});

test('ساعت به وقت تهران تفسیر می‌شود و ورودی ISO کامل هم پذیرفته است', () => {
  const now = at('2026-11-20T09:00:00Z'); // ۱۲:۳۰ تهران

  assert.equal(
    isReminderInFuture(`${DATE}T00:00:00.000Z`, '14:00:00', 1, now),
    true,
  );
  assert.equal(isReminderInFuture(DATE, '9:05', 1, now), false);
});

test('ورودی نامعتبر گزینه‌ها را قفل نمی‌کند', () => {
  assert.equal(isReminderInFuture('', '', 1), true);
});
