import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:43101';
const cookieBase =
  process.env.SESSION_E2E_CROSS_HOST === '1'
    ? 'http://api.monshim.test:43101'
    : 'http://127.0.0.1:43100';

async function configure(options: Record<string, unknown> = {}) {
  await fetch(`${api}/__test/reset`, { method: 'POST' });
  await fetch(`${api}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewScenario: true, roles: ['user'], ...options }),
  });
}

async function signIn(context: import('@playwright/test').BrowserContext) {
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
}

async function loginForReview(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'ثبت نظر', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'ورود برای ثبت نظر' }),
  ).toBeVisible();
  const auth = page.getByRole('dialog');
  await auth.getByLabel('شماره موبایل').fill('09123456789');
  await auth.getByRole('button', { name: 'دریافت کد تأیید' }).click();
  await auth.getByLabel('کد تأیید', { exact: true }).fill('1234');
  await auth.getByRole('button', { name: 'تأیید و ادامه ثبت نظر' }).click();
}

test('approved reviews remain in SSR HTML', async ({ request }) => {
  await configure();
  const response = await request.get(
    'http://127.0.0.1:43100/provider/salon-test',
  );
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('نظر تایید شده مشتری');
});

test('guest logs in and an eligible user immediately opens and submits the review', async ({
  page,
}) => {
  await configure({ reviewReason: 'ELIGIBLE' });
  await page.goto('/provider/salon-test');
  await loginForReview(page);
  const dialog = page.getByRole('dialog', { name: 'ثبت نظر و امتیاز' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('سالن آزمایشی');
  await dialog.getByRole('radio', { name: '۵ از ۵' }).click();
  await dialog.getByLabel('متن نظر (اختیاری)').fill('تجربه عالی');
  await dialog.getByRole('button', { name: 'ثبت نظر', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByText('نظر شما ثبت شد و پس از تایید ادمین نمایش داده می‌شود.')
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'ثبت نظر و امتیاز' }),
  ).toHaveCount(0);
  const log = (await (await fetch(`${api}/__test/events`)).json()).data;
  expect(
    log.find(
      (e: { path: string; phase: string }) =>
        e.path === '/api/barber/73/reviews' && e.phase === 'body',
    ).body,
  ).toEqual({ rating: 5, comment: 'تجربه عالی' });
});

test('guest without an eligible booking sees guidance after login', async ({
  page,
}) => {
  await configure({ reviewReason: 'NO_BOOKING' });
  await page.goto('/provider/salon-test');
  await loginForReview(page);
  await expect(
    page.getByText(
      'امکان ثبت نظر فقط برای مشتریانی فعال است که نوبتشان در این آرایشگاه انجام شده باشد.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'ثبت نظر و امتیاز' }),
  ).toHaveCount(0);
});

test('unfinished appointment and own profile have distinct states', async ({
  page,
  context,
}) => {
  await configure({ reviewReason: 'BOOKING_NOT_COMPLETED_YET' });
  await signIn(context);
  await page.goto('/provider/salon-test');
  await expect(
    page.getByText(
      'شما نوبت رزروشده در این سالن دارید؛ پس از انجام نوبت می‌توانید نظر و امتیاز خود را ثبت کنید.',
    ),
  ).toBeVisible();
  await configure({ reviewReason: 'OWN_PROFILE' });
  await page.reload();
  await expect(page.getByRole('button', { name: /ثبت نظر/ })).toHaveCount(0);
  await expect(
    page.getByText(
      'شما نوبت رزروشده در این سالن دارید؛ پس از انجام نوبت می‌توانید نظر و امتیاز خود را ثبت کنید.',
    ),
  ).toHaveCount(0);
});

test('rejected review displays the reason and panel shows unfinished guidance', async ({
  page,
  context,
}) => {
  await configure({
    myReview: {
      id: 'r',
      rating: 2,
      comment: null,
      status: 'rejected',
      adminNote: 'دلیل آزمایشی',
      createdAt: '2025-01-01',
    },
  });
  await signIn(context);
  await page.goto('/provider/salon-test');
  await expect(page.getByText(/دلیل آزمایشی/)).toBeVisible();
  await configure({ reviewReason: 'BOOKING_NOT_COMPLETED_YET' });
  await page.goto('/panel/provider/73');
  await page.getByRole('tab', { name: /نظرات/ }).click();
  await expect(
    page.getByText(
      'شما نوبت رزروشده در این سالن دارید؛ پس از انجام نوبت می‌توانید نظر و امتیاز خود را ثبت کنید.',
    ),
  ).toBeVisible();
});

test('signed-in eligible user can review from panel with the salon name', async ({
  page,
  context,
}) => {
  await configure({ reviewReason: 'ELIGIBLE' });
  await signIn(context);
  await page.goto('/panel/provider/73');
  await page.getByRole('tab', { name: /نظرات/ }).click();
  await page.getByRole('button', { name: 'ثبت نظر', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'ثبت نظر و امتیاز' });
  await expect(dialog).toContainText('سالن آزمایشی');
  await dialog.getByRole('radio', { name: '۴ از ۵' }).click();
  await dialog.getByRole('button', { name: 'ثبت نظر', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByText('نظر شما ثبت شد و پس از تایید ادمین نمایش داده می‌شود.')
      .first(),
  ).toBeVisible();
});

for (const status of ['pending', 'approved'] as const) {
  test(`public page shows ${status} review status instead of a button`, async ({
    page,
    context,
  }) => {
    await configure({
      myReview: {
        id: 'r',
        rating: 5,
        comment: null,
        status,
        createdAt: '2025-01-01',
      },
    });
    await signIn(context);
    await page.goto('/provider/salon-test');
    await expect(
      page.getByText(
        status === 'pending'
          ? 'نظر شما ثبت شد و پس از تایید ادمین نمایش داده می‌شود.'
          : 'نظر شما تایید شد و در لیست نظرات نمایش داده می‌شود.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /ثبت نظر/ })).toHaveCount(0);
  });
}
