import { expect, type Page, test } from '@playwright/test';

const api = 'http://127.0.0.1:43101';
const cookieBase =
  process.env.SESSION_E2E_CROSS_HOST === '1'
    ? 'http://api.monshim.test:43101'
    : 'http://127.0.0.1:43100';
const plan = {
  id: 'sms-plan',
  planKey: 'starter',
  name: 'پلن نمونه',
  smsCount: 200,
  price: 100000,
  durationDays: 30,
  planType: 'sms',
  isActive: true,
  sortOrder: 1,
  description: '',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const current = {
  id: 'active',
  userId: 7,
  subscriptionPlanId: plan.id,
  subscriptionPlan: plan,
  status: 'active',
  smsTotal: 200,
  smsUsed: 40,
  price: 100000,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2099-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};
const queued = {
  ...current,
  id: 'reserved',
  status: 'reserved',
  smsUsed: 0,
  createdAt: '2026-01-02T00:00:00Z',
};

async function setup(page: Page, options?: { exhausted?: boolean }) {
  const history = options?.exhausted
    ? [{ ...current, status: 'expired', smsUsed: 200 }]
    : [queued, current];
  const requests: unknown[] = [];
  await page.route('**/api/user-subscriptions**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/plans'))
      return route.fulfill({ json: { data: [plan] } });
    if (path.endsWith('/current'))
      return route.fulfill({
        json: { data: options?.exhausted ? null : current },
      });
    return route.fulfill({ json: { data: history } });
  });
  await page.route('**/api/payment/subscription', async route => {
    requests.push(route.request().postDataJSON());
    history.unshift({
      ...queued,
      id: 'new-reserved',
      createdAt: '2026-01-03T00:00:00Z',
    });
    await route.fulfill({ json: { data: { free: true } } });
  });
  return requests;
}

async function configure(context: import('@playwright/test').BrowserContext) {
  await fetch(`${api}/__test/reset`, { method: 'POST' });
  await fetch(`${api}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: ['barber'] }),
  });
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
}

test('shows FIFO reservations and allows the current plan to be purchased again', async ({
  page,
  context,
}) => {
  await configure(context);
  const requests = await setup(page);
  await page.goto('/dashboard/subscription');
  await expect(page.getByText('اشتراک فعلی:', { exact: false })).toBeVisible();
  const queue = page.getByRole('region', { name: 'اشتراک‌های رزروشده' });
  await expect(queue).toContainText('اشتراک رزروشده (در انتظار فعال‌سازی)');
  await expect(queue).toContainText('۲۰۰ پیامک');
  await expect(queue).toContainText('۳۰ روزه');
  await expect(queue).toContainText('تایمر این اشتراک هنوز شروع نشده است');
  await expect(queue.locator('li')).toHaveCount(1);
  const buy = page.getByRole('button', { name: 'تمدید / رزرو مجدد' });
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ subscriptionPlanId: 'sms-plan' });
  await expect(queue.locator('li')).toHaveCount(2);
});

test('shows the exhausted reason when no active or reserved subscription remains', async ({
  page,
  context,
}) => {
  await configure(context);
  await setup(page, { exhausted: true });
  await page.goto('/dashboard/subscription');
  await expect(
    page.getByText('اشتراک شما به دلیل اتمام پیامک منقضی شده است'),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'اشتراک‌های رزروشده' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'خرید و پرداخت آنلاین' }),
  ).toBeEnabled();
});

test('admin sees the active SMS plan and the number of reservations', async ({
  page,
  context,
}) => {
  await fetch(`${api}/__test/reset`, { method: 'POST' });
  await fetch(`${api}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: ['admin'] }),
  });
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
  await page.route('**/api/admin/barber/management**', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data[0].smsSubscription = {
      id: 'active',
      display: 'active',
      planName: 'پلن نمونه',
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2099-01-01T00:00:00Z',
      price: 100000,
      smsTotal: 200,
      smsUsed: 40,
      smsRemaining: 160,
      usagePercent: 20,
      reservedCount: 2,
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/admin/providers');
  await expect(page.getByText('۲ اشتراک رزروشده در صف')).toBeVisible();
  await expect(page.getByText('پلن نمونه')).toBeVisible();
});
