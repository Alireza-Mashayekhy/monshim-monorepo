import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { siteConfig } from '@/lib/site-config';

import sitemap from './sitemap';

/**
 * تستِ خروجیِ `sitemap.xml`.
 *
 * چرا؟ `sitemap` تنها کانالِ کشفِ پروفایل‌های آرایشگر است (هیچ صفحهٔ عمومیِ
 * دیگری به آن‌ها لینک نمی‌داد تا پیش از ساخت `/providers`). یک اشتباه در آن
 * مستقیماً یعنی «صفحه‌ای که هیچ‌وقت پیدا نمی‌شود» یا «صفحه‌ای که ۴۰۴ می‌دهد و
 * در sitemap اعلام شده».
 *
 * فراخوانیِ شبکه با یک `fetch` جعلی جایگزین می‌شود؛ هیچ درخواست واقعی به API
 * زده نمی‌شود.
 */

const DIRECTORY = [
  { id: 7, slug: 'roya', updatedAt: '2026-10-22T10:00:00.000Z', quality: { bioLength: 200, portfolioCount: 4 } },
  { id: 9, slug: 'omidftmii', updatedAt: '2026-10-24T10:00:00.000Z', quality: { bioLength: 200, portfolioCount: 2 } },
];

const ARTICLES = [
  { slug: 'beauty-salon-advertising', updatedAt: '2026-11-09T10:00:00.000Z' },
];

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalGate = process.env.PROFILE_QUALITY_GATE;

function stubFetch(routes: { directory?: unknown; blog?: unknown }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/public-page/directory')
      ? routes.directory ?? []
      : url.includes('/blog/sitemap')
        ? routes.blog ?? []
        : null;

    if (body === null) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ status: 200, message: 'success', data: body }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.API_URL = 'http://api.test.local/api';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
  if (originalGate === undefined) delete process.env.PROFILE_QUALITY_GATE;
  else process.env.PROFILE_QUALITY_GATE = originalGate;
});

test('صفحه‌های ثابت با آدرس کانونیکال و lastmod می‌آیند', async () => {
  stubFetch({ directory: DIRECTORY, blog: ARTICLES });
  const entries = await sitemap();
  const urls = entries.map(entry => entry.url);

  for (const path of [
    '/',
    '/providers',
    '/provider-management',
    '/online-provider-booking',
    '/pricing',
    '/tutorials',
    '/blog',
    '/privacy',
    '/terms',
  ]) {
    const expected = path === '/' ? siteConfig.url : `${siteConfig.url}${path}`;
    assert.ok(urls.includes(expected), `در sitemap نیست: ${expected}`);
  }

  const home = entries.find(entry => entry.url === siteConfig.url);
  assert.ok(home?.lastModified, 'lastmod صفحهٔ اصلی خالی است');
});

test('صفحه‌های خصوصی هرگز در sitemap نیستند', async () => {
  stubFetch({ directory: DIRECTORY, blog: ARTICLES });
  const urls = (await sitemap()).map(entry => entry.url);

  for (const privatePath of [
    '/panel',
    '/dashboard',
    '/admin',
    '/login',
    '/register',
    '/provider-signup',
    '/cities',
    '/explore',
  ]) {
    assert.equal(
      urls.some(url => url.startsWith(`${siteConfig.url}${privatePath}`)),
      false,
      `مسیر خصوصی در sitemap: ${privatePath}`,
    );
  }
});

test('پروفایل‌ها با اسلاگ و lastmod می‌آیند، نه با شناسهٔ عددی', async () => {
  stubFetch({ directory: DIRECTORY, blog: ARTICLES });
  const entries = await sitemap();

  const roya = entries.find(entry => entry.url === `${siteConfig.url}/provider/roya`);
  assert.ok(roya, 'پروفایل roya در sitemap نیست');
  assert.equal(
    new Date(String(roya?.lastModified)).toISOString(),
    '2026-10-22T10:00:00.000Z',
  );

  assert.equal(
    entries.some(entry => /\/provider\/\d+$/.test(entry.url)),
    false,
    'آدرس عددی پروفایل در sitemap آمده است',
  );
});

test('مقاله‌ها با آدرس کانونیکال می‌آیند', async () => {
  stubFetch({ directory: DIRECTORY, blog: ARTICLES });
  const urls = (await sitemap()).map(entry => entry.url);
  assert.ok(urls.includes(`${siteConfig.url}/blog/beauty-salon-advertising`));
});

test('وقتی گیت کیفیت روشن است، پروفایل ناقص از sitemap حذف می‌شود', async () => {
  process.env.PROFILE_QUALITY_GATE = '1';
  stubFetch({
    directory: [
      ...DIRECTORY,
      {
        id: 11,
        slug: 'thin-profile',
        updatedAt: null,
        quality: { bioLength: 3, portfolioCount: 0 },
      },
    ],
    blog: ARTICLES,
  });

  const urls = (await sitemap()).map(entry => entry.url);
  assert.equal(urls.includes(`${siteConfig.url}/provider/thin-profile`), false);
  assert.ok(urls.includes(`${siteConfig.url}/provider/roya`));
});

test('پاسخ خرابِ API باعث نمی‌شود sitemap خالی شود', async () => {
  globalThis.fetch = (async () =>
    new Response('boom', { status: 500 })) as typeof fetch;

  const urls = (await sitemap()).map(entry => entry.url);
  assert.ok(urls.includes(siteConfig.url));
  assert.ok(urls.includes(`${siteConfig.url}/providers`));
});
