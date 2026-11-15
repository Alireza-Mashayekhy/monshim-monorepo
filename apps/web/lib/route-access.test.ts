import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { classifyRoute, PRIVATE_ROUTE_PREFIXES, requiresAuth } from './route-access';

/**
 * تست‌های «دسترسی مسیرها».
 *
 * این فایل دو کار می‌کند:
 *   ۱. رفتار `classifyRoute` را برای مسیرهای شناخته‌شده قفل می‌کند.
 *   ۲. **کل درخت `app/` را از روی فایل‌سیستم می‌خواند** و مطمئن می‌شود هیچ
 *      صفحه‌ای بدون دسته‌بندی نمانده است.
 *
 * چرا شمارهٔ ۲ مهم است؟ `proxy.ts` برای مسیرهای `unknown` گیت را برداشته و
 * درخواست را به روتر می‌دهد. اگر روزی یک صفحهٔ خصوصی اضافه شود و در
 * `PRIVATE_ROUTE_PREFIXES` ثبت نشود، آن صفحه بی‌سروصدا از پشت گیت خارج
 * می‌شود. این تست همان لحظه در CI می‌شکند.
 */

const APP_DIR = path.resolve(import.meta.dirname, '..', 'app');

/** همهٔ URLهای صفحه‌ها (بدون route groupها) را از ساختار پوشه‌ها می‌سازد. */
function listPageRoutes(dir: string, prefix = ''): string[] {
  const routes: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // `(marketing)` و مانند آن روی URL اثری ندارند.
      const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
      routes.push(...listPageRoutes(full, prefix + segment));
      continue;
    }

    if (entry.name !== 'page.tsx') continue;
    routes.push(prefix || '/');
  }

  return [...new Set(routes)].sort();
}

/** `[id]` / `[[...rest]]` را با یک مقدار نمونه جایگزین می‌کند. */
function sampleUrl(route: string) {
  return route
    .replace(/\/\[\[\.\.\.[^\]]+\]\]/g, '')
    .replace(/\[\.\.\.[^\]]+\]/g, 'sample')
    .replace(/\[[^\]]+\]/g, 'sample');
}

const pageRoutes = listPageRoutes(APP_DIR);

test('ساختار مسیرها خوانده می‌شود (تست خودش خالی نباشد)', () => {
  assert.ok(pageRoutes.length > 30, `فقط ${pageRoutes.length} مسیر پیدا شد`);
  assert.ok(pageRoutes.includes('/'), 'صفحهٔ اصلی پیدا نشد');
  assert.ok(pageRoutes.includes('/provider/[id]'), 'مسیر پروفایل پیدا نشد');
});

test('هیچ صفحه‌ای بدون دسته‌بندی (unknown) نمی‌ماند', () => {
  const unclassified = pageRoutes.filter(
    route => classifyRoute(sampleUrl(route)) === 'unknown',
  );

  assert.deepEqual(
    unclassified,
    [],
    'این صفحه‌ها در PRIVATE_ROUTE_PREFIXES یا فهرست عمومی نیستند؛ ' +
      'یا دسته‌بندی‌شان را اضافه کنید یا `proxy.ts` آن‌ها را ۴۰۴ می‌کند.',
  );
});

test('همهٔ پیشوندهای خصوصی واقعاً صفحه دارند', () => {
  for (const prefix of PRIVATE_ROUTE_PREFIXES) {
    const hasPage = pageRoutes.some(route => sampleUrl(route).startsWith(prefix));
    assert.ok(hasPage, `پیشوند خصوصیِ بدون صفحه: ${prefix}`);
  }
});

test('صفحه‌های خصوصی هرگز عمومی نیستند', () => {
  for (const route of pageRoutes) {
    const url = sampleUrl(route);
    if (!PRIVATE_ROUTE_PREFIXES.some(prefix => url.startsWith(prefix))) continue;
    // استثنای مستند: بازگشت از درگاه پرداخت باید برای مهمان کار کند.
    if (url.startsWith('/panel/payment/callback')) continue;
    assert.equal(
      classifyRoute(url),
      'private',
      `مسیر خصوصی به‌اشتباه عمومی است: ${url}`,
    );
  }
});

test('صفحه‌های عمومیِ سئو در دستهٔ public هستند', () => {
  for (const url of [
    '/',
    '/providers',
    '/provider/sample',
    '/blog',
    '/blog/sample',
    '/pricing',
    '/provider-management',
    '/online-provider-booking',
    '/tutorials',
    '/privacy',
    '/terms',
    '/login',
    '/register',
    '/provider-signup',
    '/deposit/sample',
  ]) {
    assert.equal(classifyRoute(url), 'public', `باید public باشد: ${url}`);
  }
});

test('صفحه‌های خصوصی در دستهٔ private هستند', () => {
  for (const url of [
    '/admin',
    '/admin/approvals',
    '/dashboard',
    '/dashboard/public-page',
    '/panel/home',
    '/panel/explore',
    '/panel/provider/12',
    '/provider-welcome',
  ]) {
    assert.equal(classifyRoute(url), 'private', `باید private باشد: ${url}`);
  }
});

test('بازگشت از درگاه پرداخت برای مهمان عمومی می‌ماند', () => {
  assert.equal(classifyRoute('/panel/payment/callback'), 'public');
  assert.equal(requiresAuth('/panel/payment/callback'), false);
});

test('مسیرهای ناموجود ۴۰۴ می‌شوند، نه ریدایرکت به ورود', () => {
  for (const url of [
    '/this-page-does-not-exist-123456',
    '/explore',
    '/cities/tabriz/barbers',
    '/old-campaign-2024',
  ]) {
    assert.equal(classifyRoute(url), 'unknown', `باید unknown باشد: ${url}`);
    assert.equal(requiresAuth(url), false, `نباید گیت شود: ${url}`);
  }
});

test('مرز پیشوندها دقیق است (`/providers` با `/provider` قاطی نمی‌شود)', () => {
  assert.equal(classifyRoute('/providers'), 'public');
  assert.equal(classifyRoute('/provider-dashboard'), 'unknown');
  assert.equal(classifyRoute('/administrator'), 'unknown');
  assert.equal(classifyRoute('/panelish'), 'unknown');
});
