import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:43101';
const cookieBase =
  process.env.SESSION_E2E_CROSS_HOST === '1'
    ? 'http://api.monshim.test:43101'
    : 'http://127.0.0.1:43100';

type Event = {
  path: string;
  phase: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

async function events(): Promise<Event[]> {
  return (
    (await (await fetch(`${api}/__test/events`)).json()) as { data: Event[] }
  ).data;
}

async function configure(options: Record<string, unknown>) {
  await fetch(`${api}/__test/reset`, { method: 'POST' });
  await fetch(`${api}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cityScenario: true, roles: ['user'], ...options }),
  });
}

test('unregistered city ignores location store, then saving opens the filtered list without a refresh', async ({
  page,
  context,
}) => {
  await configure({});
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user-location-storage',
      JSON.stringify({
        state: {
          cityId: 99,
          cityName: 'شهر دیگر',
          provinceId: 2,
          provinceName: 'استان دیگر',
        },
        version: 0,
      }),
    );
  });
  await page.goto('/panel/home');
  const section = page.getByRole('region', { name: 'آرایشگاه‌های شهر شما' });
  await expect(
    section.getByText('هنوز شهر خود را انتخاب نکرده‌اید'),
  ).toBeVisible();
  await expect(section.getByText('شهر دیگر')).toHaveCount(0);
  expect((await events()).filter(e => e.path === '/api/barber')).toHaveLength(
    0,
  );

  await section
    .getByRole('link', { name: 'انتخاب و ثبت شهر در پروفایل' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'انتخاب استان و شهر' });
  await expect(dialog).toBeVisible();
  const selects = dialog.getByRole('combobox');
  await selects.nth(0).click();
  await page.getByRole('option', { name: 'تهران' }).click();
  await selects.nth(1).click();
  await page.getByRole('option', { name: 'تهران' }).click();
  await dialog.getByRole('button', { name: 'ذخیره استان و شهر' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/panel\/profile$/);
  expect(
    (await events()).find(e => e.path === '/api/users/me' && e.phase === 'body')
      ?.body,
  ).toEqual({ provinceId: 1, cityId: 12 });
  await page.getByRole('link', { name: 'خانه', exact: true }).click();
  await expect(section.getByText('سالن شهر')).toBeVisible();
  await expect(section.getByText('تهران')).toBeVisible();
  const queries = (await events()).filter(
    e => e.path === '/api/barber' && e.phase === 'query',
  );
  expect(queries.length).toBeGreaterThan(0);
  expect(queries.every(e => e.query?.cityId === '12')).toBe(true);
});

test('registered city filters requests and displays the empty state', async ({
  page,
  context,
}) => {
  await configure({ homeCityId: 12, homeEmpty: true });
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
  await page.goto('/panel/home');
  const section = page.getByRole('region', { name: 'آرایشگاه‌های شهر شما' });
  await expect(
    section.getByText('در حال حاضر آرایشگاه فعالی در تهران ثبت نشده است.'),
  ).toBeVisible();
  await expect(
    section.getByRole('link', { name: 'مشاهده همه سالن‌ها' }),
  ).toHaveAttribute('href', '/panel/explore');
  const queries = (await events()).filter(
    e => e.path === '/api/barber' && e.phase === 'query',
  );
  expect(queries.length).toBeGreaterThan(0);
  expect(queries.every(e => e.query?.cityId === '12')).toBe(true);
});

test('closing the auto-opened dialog removes the parameter and permits reopening', async ({
  page,
  context,
}) => {
  await configure({});
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
  await page.goto('/panel/profile?editCity=1');
  const dialog = page.getByRole('dialog', { name: 'انتخاب استان و شهر' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/panel\/profile$/);
  await page.getByRole('button', { name: 'استان و شهر' }).click();
  await expect(dialog).toBeVisible();
});

test('uses city.id when only the city relation contains the ID', async ({
  page,
  context,
}) => {
  await configure({ homeCityId: 12, homeCityRelationOnly: true });
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
  await page.goto('/panel/home');
  const section = page.getByRole('region', { name: 'آرایشگاه‌های شهر شما' });
  await expect(section.getByText('سالن شهر')).toBeVisible();
  await expect(section.getByText('تهران')).toBeVisible();
  const queries = (await events()).filter(
    e => e.path === '/api/barber' && e.phase === 'query',
  );
  expect(queries.length).toBeGreaterThan(0);
  expect(queries.every(e => e.query?.cityId === '12')).toBe(true);
});
