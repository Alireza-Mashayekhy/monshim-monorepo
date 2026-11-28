import { type BrowserContext, expect, type Page, test } from '@playwright/test';

const api = 'http://127.0.0.1:43101';
const cookieBase =
  process.env.SESSION_E2E_CROSS_HOST === '1'
    ? 'http://api.monshim.test:43101'
    : 'http://127.0.0.1:43100';

async function signIn(context: BrowserContext, roles: string[]) {
  await fetch(`${api}/__test/reset`, { method: 'POST' });
  await fetch(`${api}/__test/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles }),
  });
  await context.addCookies([
    { name: 'access_token', value: 'valid', url: cookieBase },
  ]);
}

async function openPicker(page: Page) {
  await page.getByRole('button', { name: /^تاریخ تولد(?: \*)?$/ }).click();
  const picker = page.getByRole('dialog', { name: 'انتخاب تاریخ تولد' });
  await expect(picker).toBeVisible();
  return picker;
}

test('profile dialog: cancel, clear, default, keyboard and ISO submission', async ({
  page,
  context,
}) => {
  await signIn(context, ['user']);
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/users/me', async route => {
    if (route.request().method() === 'PATCH') {
      submitted = route.request().postDataJSON();
      await route.fulfill({ json: { data: { fullName: 'کاربر آزمایشی' } } });
    } else await route.continue();
  });
  await page.goto('/panel/profile');
  await page.getByRole('button', { name: 'ویرایش اطلاعات پروفایل' }).click();
  const field = page.getByLabel('تاریخ تولد', { exact: true });
  await expect(field).toContainText('۱۱ دی ۱۳۶۸');
  let picker = await openPicker(page);
  await expect(picker.getByRole('spinbutton', { name: 'سال' })).toHaveAttribute(
    'aria-valuenow',
    '1368',
  );
  await picker.getByRole('spinbutton', { name: 'ماه' }).focus();
  await page.keyboard.press('ArrowDown');
  await picker.getByRole('button', { name: 'انصراف' }).click();
  await expect(field).toContainText('۱۱ دی ۱۳۶۸');
  await page.getByRole('button', { name: 'پاک کردن تاریخ تولد' }).click();
  await expect(field).toContainText('انتخاب تاریخ تولد');
  picker = await openPicker(page);
  await expect(picker.getByRole('spinbutton', { name: 'سال' })).toHaveAttribute(
    'aria-valuenow',
    '1375',
  );
  await picker.getByRole('button', { name: 'انصراف' }).click();
  await expect(field).toContainText('انتخاب تاریخ تولد');
  picker = await openPicker(page);
  await picker.getByRole('button', { name: 'تأیید و ثبت تاریخ تولد' }).click();
  await expect(field).toContainText('۱ فروردین ۱۳۷۵');
  picker = await openPicker(page);
  await picker.getByRole('spinbutton', { name: 'روز' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(picker.getByRole('spinbutton', { name: 'روز' })).toHaveAttribute(
    'aria-valuenow',
    '2',
  );
  await picker.getByRole('button', { name: 'تأیید و ثبت تاریخ تولد' }).click();
  await expect(field).toContainText('۲ فروردین ۱۳۷۵');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect.poll(() => submitted?.birthDate).toBe('1996-03-21');
});

test('mobile nested drawer retains focus and wheel scrolling without closing parent', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(context, ['barber']);
  await page.goto('/dashboard/profile');
  await page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'اطلاعات فردی' }) })
    .filter({ has: page.getByRole('button', { name: 'ویرایش', exact: true }) })
    .last()
    .getByRole('button', { name: 'ویرایش', exact: true })
    .click();
  const picker = await openPicker(page);
  const box = await picker.boundingBox();
  expect(box && Math.abs(box.y + box.height - 844)).toBeLessThan(2);
  const day = picker.getByRole('spinbutton', { name: 'روز' });
  await day.hover();
  await page.mouse.wheel(0, 120);
  await expect(day).toHaveAttribute('aria-valuenow', '14');
  await picker.getByRole('button', { name: 'تأیید و ثبت تاریخ تولد' }).click();
  await expect(
    page.getByRole('dialog', { name: 'ویرایش اطلاعات فردی' }),
  ).toBeVisible();
  await expect(page.getByLabel('تاریخ تولد', { exact: true })).toContainText(
    '۱۴ دی ۱۳۶۸',
  );
  await openPicker(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const dayBox = await day.boundingBox();
  if (!dayBox) throw new Error('wheel is not visible');
  const x = dayBox.x + dayBox.width / 2;
  const y = dayBox.y + dayBox.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: y + 50 }],
  });
  for (let step = 1; step <= 5; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + 50 - step * 20 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(day).not.toHaveAttribute('aria-valuenow', '14');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'ویرایش اطلاعات فردی' }),
  ).toBeVisible();
  await expect(page.getByLabel('تاریخ تولد', { exact: true })).toContainText(
    '۱۴ دی ۱۳۶۸',
  );
  await openPicker(page);
  await page.mouse.click(10, 10);
  await expect(
    page.getByRole('dialog', { name: 'انتخاب تاریخ تولد' }),
  ).toBeHidden();
  await expect(
    page.getByRole('dialog', { name: 'ویرایش اطلاعات فردی' }),
  ).toBeVisible();
});

test('required signup field keeps the default uncommitted until confirmation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  const field = page.getByLabel('تاریخ تولد', { exact: false });
  await expect(field).toContainText('انتخاب تاریخ تولد');
  let picker = await openPicker(page);
  await expect(picker.getByRole('spinbutton', { name: 'سال' })).toHaveAttribute(
    'aria-valuenow',
    '1375',
  );
  await picker.getByRole('button', { name: 'انصراف' }).click();
  await expect(field).toContainText('انتخاب تاریخ تولد');
  await expect(
    page.getByRole('button', { name: 'پاک کردن تاریخ تولد' }),
  ).toHaveCount(0);
  picker = await openPicker(page);
  await picker.getByRole('button', { name: 'تأیید و ثبت تاریخ تولد' }).click();
  await expect(field).toContainText('۱ فروردین ۱۳۷۵');
  await expect(
    page.getByRole('button', { name: 'پاک کردن تاریخ تولد' }),
  ).toHaveCount(0);
  picker = await openPicker(page);
  const day = picker.getByRole('spinbutton', { name: 'روز' });
  await day.focus();
  await page.keyboard.press('End');
  await expect(day).toHaveAttribute('aria-valuenow', '31');
  const month = picker.getByRole('spinbutton', { name: 'ماه' });
  await month.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await expect(month).toHaveAttribute('aria-valuenow', '7');
  await expect(day).toHaveAttribute('aria-valuenow', '30');
  await picker.getByRole('button', { name: 'تأیید و ثبت تاریخ تولد' }).click();
  await expect(field).toContainText('۳۰ مهر ۱۳۷۵');
});
