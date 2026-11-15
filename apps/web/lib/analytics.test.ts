import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANALYTICS_SECRET_QUERY_PARAMS,
  sanitizeAnalyticsUrl,
} from './analytics';

/**
 * تستِ پاک‌سازیِ آدرس پیش از ارسال به GA4.
 *
 * این تست از یک ریسکِ واقعی محافظت می‌کند: GA4 به‌طور پیش‌فرض آدرس کامل صفحه را
 * می‌فرستد و `/deposit/[token]` توکنِ پرداختِ بیعانه است. اگر روزی کسی
 * `page_location` را دستکاری کند یا مسیرِ تازه‌ای با توکن اضافه شود، اینجا
 * مشخص می‌شود.
 */

test('توکنِ پرداخت بیعانه در مسیر حذف می‌شود', () => {
  const clean = sanitizeAnalyticsUrl(
    'https://monshiim.ir/deposit/8f3ac1d9c7b24e51a0d2',
  );
  assert.equal(new URL(clean).pathname, '/deposit/[token]');
  assert.equal(clean.includes('8f3ac1d9c7b24e51a0d2'), false);
});

test('پارامترهای رازِ کوئری حذف می‌شوند', () => {
  const clean = sanitizeAnalyticsUrl(
    'https://monshiim.ir/login?callbackUrl=%2Fpanel%2Fpayment&token=abc123&code=xyz',
  );
  const url = new URL(clean);
  assert.equal(url.searchParams.has('callbackUrl'), false);
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(url.searchParams.has('code'), false);
  assert.equal(clean.includes('abc123'), false);
});

test('پارامترهای بی‌خطر حفظ می‌شوند تا گزارش‌ها قابل مقایسه بمانند', () => {
  const clean = sanitizeAnalyticsUrl(
    'https://monshiim.ir/providers?page=2&utm_source=google',
  );
  const url = new URL(clean);
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('utm_source'), 'google');
  assert.equal(url.pathname, '/providers');
});

test('مسیرهای عمومی دست‌نخورده می‌مانند', () => {
  for (const href of [
    'https://monshiim.ir/',
    'https://monshiim.ir/providers',
    'https://monshiim.ir/provider/roya',
    'https://monshiim.ir/blog/beauty-salon-advertising',
  ]) {
    assert.equal(sanitizeAnalyticsUrl(href), href);
  }
});

test('آدرس نامعتبر بدون استثنا برگردانده می‌شود', () => {
  assert.equal(sanitizeAnalyticsUrl('not a url'), 'not a url');
});

test('فهرست پارامترهای راز شامل مهم‌ترین‌هاست', () => {
  for (const key of ['token', 'callbackUrl', 'trackId']) {
    assert.ok(ANALYTICS_SECRET_QUERY_PARAMS.includes(key), key);
  }
});
