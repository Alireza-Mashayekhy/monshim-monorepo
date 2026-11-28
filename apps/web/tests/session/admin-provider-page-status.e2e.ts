import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:43101';
const cookieBase =
  process.env.SESSION_E2E_CROSS_HOST === '1'
    ? 'http://api.monshim.test:43101'
    : 'http://127.0.0.1:43100';
async function configure(options: Record<string, unknown>) {
  await fetch(`${api}/__test/reset`, { method: 'POST' });
  await fetch(`${api}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: ['admin'], ...options }),
  });
}
async function signIn(context: import('@playwright/test').BrowserContext) {
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
}

test('unconfigured page explains that an active subscription has no slug', async ({
  page,
  context,
}) => {
  await configure({ managementSlug: null, managementSubscriptionActive: true });
  await signIn(context);
  await page.goto('/admin/providers');
  await expect(page.getByText('راه‌اندازی نشده (بدون اسلاگ)')).toBeVisible();
  await expect(
    page.getByText('اشتراک فعال است ولی آرایشگر هنوز اسلاگ نساخته'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /کپی آدرس/ })).toHaveCount(0);
});

test('active page displays the canonical link and allows copying and opening', async ({
  page,
  context,
}) => {
  await configure({});
  await signIn(context);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/admin/providers');
  await expect(page.getByText('راه‌اندازی شده (فعال)')).toBeVisible();
  await expect(page.getByText('/provider/salon-test')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'باز کردن صفحه سالن آزمایشی' }),
  ).toHaveAttribute('href', 'http://127.0.0.1:43100/provider/salon-test');
  await page.getByRole('button', { name: 'کپی آدرس سالن آزمایشی' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('http://127.0.0.1:43100/provider/salon-test');
});

test('inactive page gives the actual cause and retains the link for copying', async ({
  page,
  context,
}) => {
  await configure({
    managementPageStatus: 'INACTIVE',
    managementPageReason: 'NO_ACTIVE_SERVICE',
  });
  await signIn(context);
  await page.goto('/admin/providers');
  await expect(page.getByText('اسلاگ ثبت‌شده (صفحه غیرفعال)')).toBeVisible();
  await expect(page.getByText('خدمت فعالی ثبت نشده است')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'کپی آدرس سالن آزمایشی' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'باز کردن صفحه سالن آزمایشی' }),
  ).toHaveCount(0);
});

test('administrator can replace and then clear the slug', async ({
  page,
  context,
}) => {
  await configure({});
  await signIn(context);
  await page.goto('/admin/providers');
  await page.getByRole('button', { name: 'ویرایش اسلاگ' }).click();
  let dialog = page.getByRole('dialog', { name: 'ویرایش اسلاگ سالن آزمایشی' });
  await dialog.getByLabel('اسلاگ صفحهٔ اختصاصی').fill('new-salon');
  await dialog.getByRole('button', { name: 'ذخیره اسلاگ' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('/provider/new-salon')).toBeVisible();
  await page.getByRole('button', { name: 'ویرایش اسلاگ' }).click();
  dialog = page.getByRole('dialog', { name: 'ویرایش اسلاگ سالن آزمایشی' });
  await dialog.getByLabel('اسلاگ صفحهٔ اختصاصی').fill('');
  await dialog.getByRole('button', { name: 'ذخیره اسلاگ' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('راه‌اندازی نشده (بدون اسلاگ)')).toBeVisible();
});
