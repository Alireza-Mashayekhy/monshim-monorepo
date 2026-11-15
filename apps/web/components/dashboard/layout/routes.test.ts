import assert from 'node:assert/strict';
import { test } from 'node:test';

import { siteConfig } from '@/lib/site-config';

import {
  bottomNavRoutes,
  dashboardRoutes,
  isRouteActive,
  moreMenuGroups,
  moreMenuRoutes,
} from './routes';

const flatItems = moreMenuGroups.flatMap(group => group.items);
const hrefs = flatItems.map(item => item.href);

/**
 * تست‌های منوی «بیشتر» داشبورد آرایشگر.
 *
 * ریشهٔ باگ‌هایی که این تست‌ها می‌گیرند: `moreMenuGroups` از
 * `dashboardRoutes` ساخته می‌شود و آیتمی که در `MORE_MENU_LAYOUT` آمده ولی
 * در `dashboardRoutes` ثبت نشده باشد، **بی‌صدا** حذف می‌شد. لینک آموزش
 * (`/tutorials`) هم بخشی از داشبورد نیست، پس باید از مسیر مجاز خودش
 * (فهرست standalone) بیاید.
 */

test('آیتم «آموزش» در منوی «بیشتر» هست', () => {
  const tutorial = flatItems.find(item => item.href === '/tutorials');

  assert.ok(tutorial, 'آیتم آموزش در منوی بیشتر پیدا نشد');
  assert.equal(tutorial.title, 'آموزش');
  assert.ok(tutorial.icon, 'آیتم آموزش آیکون دارد');
});

test('لینک آموزش به همان صفحهٔ عمومی آموزش اشاره می‌کند', () => {
  const tutorial = flatItems.find(item => item.href === '/tutorials');

  assert.equal(tutorial?.href, siteConfig.routes.tutorials);
  assert.equal(siteConfig.routes.tutorials, '/tutorials');
});

test('صفحهٔ آموزش در گروه «حساب و پشتیبانی» و کنار پشتیبانی است', () => {
  const group = moreMenuGroups.find(g =>
    g.items.some(item => item.href === '/tutorials'),
  );

  assert.equal(group?.title, 'حساب و پشتیبانی');
  assert.deepEqual(
    group?.items.map(item => item.href),
    [
      '/dashboard/profile',
      '/dashboard/subscription',
      '/dashboard/support',
      '/tutorials',
    ],
  );
  assert.equal(
    group?.items.at(-2)?.href,
    '/dashboard/support',
    'آموزش باید بلافاصله بعد از پشتیبانی بیاید',
  );
});

test('آموزش توضیح کوتاه دارد (زیرنویس آیتم در شیت)', () => {
  const tutorial = flatItems.find(item => item.href === '/tutorials');

  assert.ok(tutorial?.description);
});

test('باز بودن صفحهٔ آموزش، دکمهٔ «بیشتر» را فعال نشان می‌دهد', () => {
  assert.equal(isRouteActive('/tutorials', '/tutorials'), true);
  assert.equal(
    moreMenuRoutes.some(route => isRouteActive('/tutorials', route.href)),
    true,
  );
  // و روی صفحه‌های دیگر، آموزش به‌اشتباه فعال نیست.
  assert.equal(isRouteActive('/dashboard', '/tutorials'), false);
});

test('آموزش به نوار پایین (۵ دکمه) اضافه نشده است', () => {
  assert.equal(bottomNavRoutes.length, 4);
  assert.equal(
    bottomNavRoutes.some(route => route.href === '/tutorials'),
    false,
  );
});

test('آموزش به سایدبار دسکتاپ اضافه نشده است', () => {
  // سایدبار همان `dashboardRoutes` است؛ مسیر عمومی آموزش نباید آن را تغییر دهد.
  assert.equal(
    dashboardRoutes.some(route => route.href === '/tutorials'),
    false,
  );
});

test('هیچ آیتمی از منو حذف نمی‌شود: داشبورد + آموزش', () => {
  const dashboardOnly = dashboardRoutes
    .filter(route => !bottomNavRoutes.some(b => b.href === route.href))
    .map(route => route.href);

  assert.deepEqual([...hrefs].sort(), [...dashboardOnly, '/tutorials'].sort());
  assert.equal(new Set(hrefs).size, hrefs.length, 'لینک تکراری وجود ندارد');
});
