import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toCallHref } from './tel.ts';

/**
 * تست‌های ساخت لینک تماس (`tel:`) — دکمهٔ تلفن در «نوبت‌ها» و «مشتریان».
 *
 * ریشهٔ باگی که این تست‌ها می‌گیرند: شماره در رابط کاربری با ارقام فارسی
 * نمایش داده می‌شود؛ اگر همان رشتهٔ فارسی داخل `tel:` برود، بعضی
 * مرورگرها/گوشی‌ها شماره‌گیری نمی‌کنند. همچنین جداکننده‌ها و پیش‌شماره‌ها
 * نباید لینک را بشکنند.
 */
describe('ساخت لینک تماس', () => {
  it('شمارهٔ معمولی را بدون تغییر در tel می‌گذارد', () => {
    assert.equal(toCallHref('09121234567'), 'tel:09121234567');
  });

  it('ارقام فارسی را به انگلیسی تبدیل می‌کند', () => {
    assert.equal(toCallHref('۰۹۱۲۱۲۳۴۵۶۷'), 'tel:09121234567');
  });

  it('فاصله، خط تیره و پرانتز را حذف می‌کند', () => {
    assert.equal(toCallHref('0912 123-4567'), 'tel:09121234567');
    assert.equal(toCallHref('(0912) 123 4567'), 'tel:09121234567');
  });

  it('پیش‌شمارهٔ بین‌المللی با علامت مثبت حفظ می‌شود', () => {
    assert.equal(toCallHref('+98 912 123 4567'), 'tel:+989121234567');
  });

  it('شمارهٔ خالی یا بی‌رقم رشتهٔ خالی می‌دهد (دکمه رندر نمی‌شود)', () => {
    assert.equal(toCallHref(''), '');
    assert.equal(toCallHref(null), '');
    assert.equal(toCallHref(undefined), '');
    assert.equal(toCallHref('—'), '');
  });
});
