import { expect, type Locator, type Page,test } from '@playwright/test';

const api = 'http://127.0.0.1:43101';
const cookieBase =
  process.env.SESSION_E2E_CROSS_HOST === '1'
    ? 'http://api.monshim.test:43101'
    : 'http://127.0.0.1:43100';

async function assertReadable(element: Locator) {
  await expect(element).toBeVisible();
  const result = await element.evaluate(node => {
    const style = getComputedStyle(node);
    // Rendering to canvas normalizes computed CSS colors, including oklch.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const background = rgba(style.backgroundColor);
    const foreground = rgba(style.color);
    const luminance = (color: number[]) =>
      color
        .slice(0, 3)
        .map(channel => {
          const c = channel / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, channel, index) =>
            sum + channel * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const l1 = luminance(background),
      l2 = luminance(foreground);
    return {
      background,
      contrast: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
    };
  });
  expect(result.background[3]).toBe(255);
  expect(result.contrast).toBeGreaterThanOrEqual(4.5);
}

async function mockTickets(page: Page, admin: boolean) {
  const prefix = admin ? '/api/admin/ticket' : '/api/ticket';
  const ticket = {
    id: 'ticket-1',
    userId: 7,
    userName: 'کاربر نمونه',
    userRole: 'barber',
    subject: 'تیکت آزمایشی',
    department: 'GENERAL',
    priority: 'NORMAL',
    status: 'OPEN',
    unreadCount: 3,
    createdAt: '2026-11-25T09:00:00Z',
    updatedAt: '2026-11-25T09:00:00Z',
    messages: [
      {
        id: 'msg-1',
        ticketId: 'ticket-1',
        senderRole: 'USER',
        senderId: 7,
        message: 'متن پیام کاربر',
        createdAt: '2026-11-25T09:00:00Z',
        readByUser: true,
        readByAdmin: true,
      },
      {
        id: 'msg-2',
        ticketId: 'ticket-1',
        senderRole: 'ADMIN',
        senderId: 1,
        message: 'متن پاسخ پشتیبان',
        createdAt: '2026-11-25T10:00:00Z',
        readByUser: false,
        readByAdmin: true,
      },
    ],
  };
  await page.route(`**${prefix}**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === prefix) {
      await route.fulfill({
        json: {
          data: [ticket],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        },
      });
    } else if (path.endsWith('/messages')) {
      // Keep the optimistic bubble visible long enough to verify its contrast.
      await new Promise(resolve => setTimeout(resolve, 800));
      ticket.messages.push({
        ...ticket.messages[0],
        id: 'sent',
        senderRole: admin ? 'ADMIN' : 'USER',
        message: request.postDataJSON().message,
      });
      await route.fulfill({ json: { data: ticket } });
    } else if (path.endsWith('/close')) {
      ticket.status = 'CLOSED';
      await route.fulfill({ json: { data: ticket } });
    } else {
      await route.fulfill({ json: { data: ticket } });
    }
  });
}

for (const admin of [true, false]) {
  test(`${admin ? 'admin' : 'user'} ticket colors remain visible and sending/closing work`, async ({
    page,
    context,
  }) => {
    await fetch(`${api}/__test/reset`, { method: 'POST' });
    await fetch(`${api}/__test/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: [admin ? 'admin' : 'user'] }),
    });
    await context.addCookies([
      { name: 'access_token', value: 'valid', url: cookieBase },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockTickets(page, admin);
    await page.goto(admin ? '/admin/tickets' : '/panel/support');

    await assertReadable(
      page.getByRole('button', { name: 'همه', exact: true }),
    );
    const ticketButton = page.getByRole('button', { name: /تیکت آزمایشی/ });
    await expect(ticketButton).toBeVisible();
    await assertReadable(ticketButton.getByText('3', { exact: true }));
    if (admin)
      await assertReadable(
        ticketButton.getByTitle('فرستندهٔ این تیکت آرایشگر است'),
      );
    await ticketButton.click();
    if (admin) await expect(ticketButton).toHaveClass(/bg-primary-2\/60/);

    const own = page.getByText(admin ? 'متن پاسخ پشتیبان' : 'متن پیام کاربر', {
      exact: true,
    });
    const other = page.getByText(
      admin ? 'متن پیام کاربر' : 'متن پاسخ پشتیبان',
      { exact: true },
    );
    await assertReadable(own);
    await assertReadable(other);
    const composer = page.getByPlaceholder(
      admin ? 'پاسخ خود را بنویسید...' : 'پیام خود را بنویسید...',
    );
    await assertReadable(composer);
    await expect(composer).toHaveClass(/text-gray-900/);
    await expect(composer).toHaveClass(/placeholder:text-gray-400/);
    await composer.fill('پیام جدید قابل مشاهده');
    await page
      .getByRole('button', {
        name: admin ? 'ارسال پاسخ' : 'ارسال پیام',
        exact: true,
      })
      .click();
    const sent = page.getByText('پیام جدید قابل مشاهده', { exact: true });
    await expect(sent.locator('..').locator('.animate-spin')).toBeVisible();
    await assertReadable(sent);
    await expect(sent).toHaveCSS('opacity', '1');
    await expect(sent.locator('..').locator('.animate-spin')).toHaveCount(0);
    await assertReadable(sent);

    await page.getByRole('button', { name: 'عملیات' }).click();
    await page.getByRole('menuitem', { name: 'بستن تیکت' }).click();
    const dialog = page.getByRole('alertdialog');
    const confirm = dialog.getByRole('button', { name: 'بستن تیکت' });
    await assertReadable(confirm);
    await confirm.click();
    await expect(page.getByText(/این تیکت بسته شده است/)).toBeVisible();
  });
}
