import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/Los_Angeles' });

test('administrator sees Tehran dates, edits and clears validity dates using the Persian calendar', async ({
  page,
  context,
}) => {
  await fetch('http://127.0.0.1:43101/__test/reset', { method: 'POST' });
  await fetch('http://127.0.0.1:43101/__test/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: ['admin'] }),
  });
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: 'http://127.0.0.1:43100' },
  ]);
  const row = {
    id: 'test-1',
    code: 'SPRING37',
    percentOff: 37,
    isActive: true,
    applicableTo: 'BOTH',
    maxTotalUses: null,
    maxUsesPerUser: null,
    usedCount: 0,
    startsAt: '2027-03-20T20:30:00.000Z',
    expiresAt: '2027-03-21T20:29:59.000Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/admin/public-page/discounts**', async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      requests.push(body);
      Object.assign(row, body);
      await route.fulfill({ json: { data: row } });
    } else {
      await route.fulfill({ json: { data: [row] } });
    }
  });
  await page.goto('/admin/settings');
  await expect(page.getByText('SPRING37')).toBeVisible();
  await expect(page.getByText('از: ۱۴۰۶/۰۱/۰۱ · تا: ۱۴۰۶/۰۱/۰۱')).toBeVisible();
  await expect(page.getByText('هنوز شروع نشده')).toBeVisible();
  await page
    .getByRole('button', { name: 'ویرایش', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('button', { name: 'از تاریخ', exact: true }),
  ).toContainText('۱۴۰۶/۰۱/۰۱');
  await page.getByLabel('درصد تخفیف').fill('42');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    percentOff: 42,
    startsAt: '2027-03-20T20:30:00.000Z',
    expiresAt: '2027-03-21T20:29:59.000Z',
  });
  await page
    .getByRole('button', { name: 'ویرایش', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: 'از تاریخ', exact: true }).click();
  await expect(page.locator('.rmdp-calendar')).toBeVisible();
  await page
    .locator('.rmdp-day:not(.rmdp-disabled)')
    .filter({ hasText: /^۲$/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'پاک کردن تا تاریخ' }).click();
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({
    startsAt: '2027-03-22',
    expiresAt: null,
  });
});
