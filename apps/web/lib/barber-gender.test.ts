import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import axios from 'axios';

import {
  isBarberGenderFilter,
  resolveBarberGenderFilter,
} from '@/lib/barber-gender';

/**
 * تست‌های فیلتر جنسیت فهرست سالن‌ها.
 *
 * سناریوی واقعی: کاربر عادی وارد پنل می‌شود، `/panel/explore` مقدار
 * `gender=male` می‌فرستد و API با «property gender should not exist» پاسخ
 * ۴۰۰ می‌داد. این‌جا تضمین می‌شود فرانت فقط مقادیر معتبر قرارداد را بفرستد
 * و در نبودِ جنسیت، پارامتر را اصلاً نفرستد.
 */

describe('isBarberGenderFilter', () => {
  it('فقط male و female را معتبر می‌داند', () => {
    assert.equal(isBarberGenderFilter('male'), true);
    assert.equal(isBarberGenderFilter('female'), true);
  });

  it('مقادیر دیگر را رد می‌کند', () => {
    for (const value of [
      'men',
      'women',
      'both',
      'Male',
      '',
      ' ',
      null,
      undefined,
      0,
      1,
      {},
      ['male'],
    ]) {
      assert.equal(isBarberGenderFilter(value), false, `مقدار: ${String(value)}`);
    }
  });
});

describe('resolveBarberGenderFilter', () => {
  it('جنسیت معتبر کاربر را برمی‌گرداند', () => {
    assert.equal(resolveBarberGenderFilter({ gender: 'male' }), 'male');
    assert.equal(resolveBarberGenderFilter({ gender: 'female' }), 'female');
  });

  it('برای مهمان (کاربر تعریف‌نشده) undefined است تا پارامتر ارسال نشود', () => {
    assert.equal(resolveBarberGenderFilter(null), undefined);
    assert.equal(resolveBarberGenderFilter(undefined), undefined);
  });

  it('جنسیت خالی/ناشناخته → undefined (بدون فیلتر، بدون خطای ۴۰۰)', () => {
    assert.equal(resolveBarberGenderFilter({}), undefined);
    assert.equal(resolveBarberGenderFilter({ gender: null }), undefined);
    assert.equal(resolveBarberGenderFilter({ gender: '' }), undefined);
    assert.equal(resolveBarberGenderFilter({ gender: 'other' }), undefined);
    assert.equal(resolveBarberGenderFilter({ gender: 'Male' }), undefined);
  });
});

/**
 * قرارداد پارامترهای ارسالی به `GET /api/barber`.
 *
 * همان axios و همان شکل پارامتری که `useBarberList`/`useHomeBarberList` به
 * `barberList` می‌دهند؛ تضمین می‌کند:
 *   ۱. با جنسیت، پارامتر `gender` در URL هست (فیلتر از سمت سرور اعمال شود).
 *   2. بدون جنسیت، پارامتر اصلاً ساخته نمی‌شود (`undefined` حذف می‌شود).
 * URL دقیق گزارش کاربر عادی (`?page=1&limit=10&sort=createdAt:desc&gender=male`)
 * به‌عنوان مرجع استفاده شده است.
 */
describe('پارامترهای gender در درخواست فهرست سالن‌ها', () => {
  const client = axios.create({ baseURL: '/api' });

  const paramsFor = (gender?: 'male' | 'female') => ({
    page: 1,
    limit: 10,
    cityId: undefined,
    provinceId: undefined,
    search: undefined,
    sort: 'createdAt:desc',
    minPrice: undefined,
    maxPrice: undefined,
    minRating: undefined,
    gender,
  });

  it('برای کاربر مرد، gender=male در URL هست', () => {
    assert.equal(
      client.getUri({ url: '/barber', params: paramsFor('male') }),
      '/api/barber?page=1&limit=10&sort=createdAt:desc&gender=male',
    );
  });

  it('برای کاربر زن، gender=female در URL هست', () => {
    assert.match(
      client.getUri({ url: '/barber', params: paramsFor('female') }),
      /[?&]gender=female(&|$)/,
    );
  });

  it('بدون جنسیت (مهمان)، پارامتر gender ساخته نمی‌شود', () => {
    const url = client.getUri({ url: '/barber', params: paramsFor(undefined) });
    assert.equal(url.includes('gender'), false);
  });
});
