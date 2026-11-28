import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isSmsSubscriptionUsable,
  remainingSubscriptionDays,
} from './subscription';

const NOW = Date.parse('2026-11-20T12:00:00.000Z');

test('۳۰ روز کامل باقی‌مانده', () => {
  assert.equal(remainingSubscriptionDays('2026-12-20T12:00:00.000Z', NOW), 30);
});

test('کمتر از یک روز مانده ⇒ ceil به ۱', () => {
  assert.equal(remainingSubscriptionDays('2026-11-21T00:00:00.000Z', NOW), 1);
});

test('اشتراک منقضی‌شده هرگز عدد منفی نمی‌دهد', () => {
  assert.equal(remainingSubscriptionDays('2026-11-01T00:00:00.000Z', NOW), 0);
  assert.equal(remainingSubscriptionDays('2020-01-01T00:00:00.000Z', NOW), 0);
});

test('ورودی نامعتبر به‌جای NaN صفر می‌دهد', () => {
  assert.equal(remainingSubscriptionDays('not-a-date', NOW), 0);
  assert.equal(remainingSubscriptionDays(null, NOW), 0);
  assert.equal(remainingSubscriptionDays(undefined, NOW), 0);
  assert.equal(remainingSubscriptionDays('2026-12-20T12:00:00.000Z', NaN), 0);
});

test('endDate برابر اکنون ⇒ صفر (انقضای دقیق)', () => {
  assert.equal(remainingSubscriptionDays('2026-11-20T12:00:00.000Z', NOW), 0);
});

test('ورودی Date هم پذیرفته می‌شود', () => {
  assert.equal(
    remainingSubscriptionDays(new Date('2026-11-27T12:00:00.000Z'), NOW),
    7,
  );
});

test('SMS active status requires time and unexhausted quota, while zero-total is not auto-expired', () => {
  const active = {
    status: 'active',
    startDate: '2026-11-01T00:00:00Z',
    endDate: '2026-12-01T00:00:00Z',
    smsTotal: 10,
    smsUsed: 9,
  };
  assert.equal(isSmsSubscriptionUsable(active, NOW), true);
  assert.equal(isSmsSubscriptionUsable({ ...active, smsUsed: 10 }, NOW), false);
  assert.equal(
    isSmsSubscriptionUsable({ ...active, smsTotal: 0, smsUsed: 0 }, NOW),
    true,
  );
  assert.equal(
    isSmsSubscriptionUsable({ ...active, status: 'reserved' }, NOW),
    false,
  );
  assert.equal(
    isSmsSubscriptionUsable(
      { ...active, endDate: new Date(NOW).toISOString() },
      NOW,
    ),
    false,
  );
  assert.equal(
    isSmsSubscriptionUsable({ ...active, startDate: 'invalid' }, NOW),
    false,
  );
});
