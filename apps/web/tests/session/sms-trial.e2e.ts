import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:43101';
const cookieBase =
  process.env.SESSION_E2E_CROSS_HOST === '1'
    ? 'http://api.monshim.test:43101'
    : 'http://127.0.0.1:43100';
const paid = {
  id: 'paid',
  planKey: 'starter',
  name: 'پلن آغاز',
  smsCount: 100,
  price: 59000,
  durationDays: 30,
  planType: 'sms',
  isActive: true,
  sortOrder: 1,
  description: '',
};
const gift = {
  id: 'gift',
  userId: 7,
  subscriptionPlanId: 'trial',
  subscriptionPlan: {
    ...paid,
    id: 'trial',
    planKey: 'sms_trial',
    name: 'اشتراک هدیهٔ خوش‌آمدگویی',
    smsCount: 50,
    price: 0,
  },
  isFreeTrial: true,
  status: 'active',
  smsTotal: 50,
  smsUsed: 0,
  price: 0,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2099-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

async function signIn(
  context: import('@playwright/test').BrowserContext,
  role: string,
) {
  await fetch(`${api}/__test/reset`, { method: 'POST' });
  await fetch(`${api}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: [role] }),
  });
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
}

test('dashboard identifies the gift as current and only offers paid plans', async ({
  page,
  context,
}) => {
  await signIn(context, 'barber');
  await page.route('**/api/user-subscriptions**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: {
        data: path.endsWith('/plans')
          ? [paid]
          : path.endsWith('/current')
            ? gift
            : [gift],
      },
    });
  });
  let purchasedPlan: string | undefined;
  await page.route('**/api/payment/subscription', async route => {
    purchasedPlan = route.request().postDataJSON().subscriptionPlanId;
    await route.fulfill({ json: { data: { free: true } } });
  });
  await page.goto('/dashboard/subscription');
  await expect(page.getByText('دورهٔ رایگان (۵۰ پیامک)')).toBeVisible();
  await expect(page.getByText('۵۰ پیامک باقی‌مانده از ۵۰')).toBeVisible();
  await expect(
    page.getByText('اشتراک هدیهٔ خوش‌آمدگویی', { exact: false }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'خرید و رزرو در صف' }).click();
  await expect.poll(() => purchasedPlan).toBe('paid');
});

test('public pricing does not advertise the welcome gift as a purchasable plan', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(page.getByText('اشتراک هدیهٔ خوش‌آمدگویی')).toHaveCount(0);
  await expect(page.getByText('پلن آغاز').first()).toBeVisible();
});

test('admin identifies the active SMS subscription as a 50-message trial', async ({
  page,
  context,
}) => {
  await signIn(context, 'admin');
  await page.route('**/api/admin/barber/management**', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data[0].smsSubscription = {
      id: 'gift',
      display: 'active',
      planKey: 'sms_trial',
      planName: 'اشتراک هدیهٔ خوش‌آمدگویی',
      isFreeTrial: true,
      startDate: gift.startDate,
      endDate: gift.endDate,
      price: 0,
      smsTotal: 50,
      smsUsed: 0,
      smsRemaining: 50,
      usagePercent: 0,
      reservedCount: 0,
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/admin/providers');
  await expect(page.getByText('دورهٔ رایگان (۵۰ پیامک)')).toBeVisible();
  await expect(page.getByText('اشتراک هدیهٔ خوش‌آمدگویی')).toBeVisible();
});
