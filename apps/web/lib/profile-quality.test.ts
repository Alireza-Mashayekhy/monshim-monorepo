import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateProfileIndexability,
  isProfileQualityGateEnabled,
  PROFILE_INDEX_QUALITY_POLICY,
  shouldIndexProfile,
} from './profile-quality';

/**
 * تست‌های سیاستِ کیفیتِ ایندکسِ پروفایل.
 *
 * نکتهٔ مهم: این گیت پیش‌فرض **خاموش** است و روشن‌کردنش یک تصمیم کسب‌وکار
 * است. تست‌ها هم رفتار خاموش (بی‌اثر بودن) و هم رفتار روشن را قفل می‌کنند.
 */

function withGate<T>(enabled: boolean, run: () => T): T {
  const previous = process.env.PROFILE_QUALITY_GATE;
  process.env.PROFILE_QUALITY_GATE = enabled ? '1' : '';
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.PROFILE_QUALITY_GATE;
    else process.env.PROFILE_QUALITY_GATE = previous;
  }
}

test('آستانه‌ها صریح و قابل‌خواندن هستند', () => {
  assert.equal(typeof PROFILE_INDEX_QUALITY_POLICY.minBioLength, 'number');
  assert.equal(typeof PROFILE_INDEX_QUALITY_POLICY.minPortfolioCount, 'number');
  assert.ok(PROFILE_INDEX_QUALITY_POLICY.minBioLength > 0);
});

test('پروفایل کامل ایندکس‌پذیر است', () => {
  const result = evaluateProfileIndexability({
    bioLength: PROFILE_INDEX_QUALITY_POLICY.minBioLength,
    portfolioCount: PROFILE_INDEX_QUALITY_POLICY.minPortfolioCount,
  });
  assert.equal(result.indexable, true);
  assert.deepEqual(result.reasons, []);
});

test('بیوی کوتاه و نمونه‌کارِ صفر هر دو دلیلِ رد هستند', () => {
  const result = evaluateProfileIndexability({ bioLength: 10, portfolioCount: 0 });
  assert.equal(result.indexable, false);
  assert.deepEqual(result.reasons, ['bio_too_short', 'no_portfolio']);
});

test('فقط یکی از شرط‌ها هم کافی است برای رد شدن', () => {
  assert.equal(
    evaluateProfileIndexability({ bioLength: 500, portfolioCount: 0 }).indexable,
    false,
  );
  assert.equal(
    evaluateProfileIndexability({ bioLength: 0, portfolioCount: 3 }).indexable,
    false,
  );
});

test('ورودی نامعتبر به‌صورت محافظه‌کارانه رد می‌شود', () => {
  const result = evaluateProfileIndexability({
    bioLength: Number.NaN,
    portfolioCount: Number.NaN,
  });
  assert.equal(result.indexable, false);
});

test('گیت وقتی خاموش است هیچ پروفایلی را حذف نمی‌کند', () => {
  withGate(false, () => {
    assert.equal(isProfileQualityGateEnabled(), false);
    assert.equal(shouldIndexProfile({ bioLength: 0, portfolioCount: 0 }), true);
    assert.equal(shouldIndexProfile(null), true);
  });
});

test('گیت وقتی روشن است پروفایل ناقص را رد می‌کند', () => {
  withGate(true, () => {
    assert.equal(isProfileQualityGateEnabled(), true);
    assert.equal(shouldIndexProfile({ bioLength: 0, portfolioCount: 0 }), false);
    assert.equal(
      shouldIndexProfile({
        bioLength: PROFILE_INDEX_QUALITY_POLICY.minBioLength,
        portfolioCount: 1,
      }),
      true,
    );
  });
});

test('نبودِ سیگنال کیفیت باعث حذف پروفایل نمی‌شود (سازگاری با کش قدیمی)', () => {
  withGate(true, () => {
    assert.equal(shouldIndexProfile(undefined), true);
    assert.equal(shouldIndexProfile(null), true);
  });
});
