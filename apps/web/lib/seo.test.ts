import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Metadata } from 'next';

import { buildPageMetadata, mergeRobotsDecision } from './seo';

/**
 * تستِ رگرسیونِ `robots` مقاله‌ها (P2-3).
 *
 * باگِ اصلی: صفحهٔ مقاله `robots: { index, follow }` می‌نوشت و کلِ آبجکتِ
 * `googleBot` ساخته‌شده در `buildPageMetadata` را دور می‌ریخت؛ یعنی دقیقاً
 * مقاله‌ها — که مهم‌ترین محتوای متنی سایت هستند — `max-image-preview: large` و
 * `max-snippet: -1` را از دست می‌دادند. این تست قفل می‌کند که پیش‌فرض‌های
 * سراسری هرگز در ادغام گم نشوند.
 */

/** دسترسی امن به فیلدهای اختیاریِ googleBot در تست. */
function gb(robots: ReturnType<typeof mergeRobotsDecision>) {
  return robots.googleBot as Record<string, unknown>;
}

function baseRobots(noIndex = false) {
  return buildPageMetadata({
    title: 'نمونه',
    description: 'توضیح',
    path: '/blog/sample',
    type: 'article',
    noIndex,
  }).robots;
}

test('پیش‌فرض‌های googleBot در ادغام حفظ می‌شوند', () => {
  const merged = mergeRobotsDecision(baseRobots(), {
    indexable: true,
    follow: true,
  });

  assert.equal(merged.index, true);
  assert.equal(merged.follow, true);
  assert.equal(merged.googleBot.index, true);
  assert.equal(merged.googleBot.follow, true);
  assert.equal(gb(merged)['max-image-preview'], 'large');
  assert.equal(gb(merged)['max-snippet'], -1);
  assert.equal(gb(merged)['max-video-preview'], -1);
});

test('مقالهٔ noindex فقط index را خاموش می‌کند، نه بقیهٔ پیش‌فرض‌ها', () => {
  const merged = mergeRobotsDecision(baseRobots(), {
    indexable: false,
    follow: true,
  });

  assert.equal(merged.index, false);
  assert.equal(merged.follow, true);
  assert.equal(merged.googleBot.index, false);
  assert.equal(gb(merged)['max-image-preview'], 'large');
});

test('noindex,nofollow هر دو لایه را خاموش می‌کند', () => {
  const merged = mergeRobotsDecision(baseRobots(), {
    indexable: false,
    follow: false,
  });
  assert.equal(merged.index, false);
  assert.equal(merged.follow, false);
  assert.equal(merged.googleBot.index, false);
  assert.equal(merged.googleBot.follow, false);
});

test('مقدار نامشخص (undefined) مقاله را noindex نمی‌کند', () => {
  const merged = mergeRobotsDecision(baseRobots(), {
    indexable: undefined,
    follow: undefined,
  });
  assert.equal(merged.index, true);
  assert.equal(merged.follow, true);
  assert.equal(merged.googleBot.index, true);
});

test('نبودِ robots پایه باعث خطا نمی‌شود', () => {
  const merged = mergeRobotsDecision(undefined as Metadata['robots'], {
    indexable: true,
    follow: true,
  });
  assert.equal(merged.index, true);
  assert.equal(gb(merged)['max-snippet'], undefined);
});

test('آبجکت base بدون googleBot هم قابل ادغام است', () => {
  const merged = mergeRobotsDecision({ index: true, follow: true }, {
    indexable: false,
    follow: true,
  });
  assert.equal(merged.index, false);
  assert.equal(merged.googleBot.index, false);
});
