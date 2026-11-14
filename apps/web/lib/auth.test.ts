import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canAccessPath,
  getAuthDestination,
  getDashboardEntryPath,
  getRoleLandingPath,
  isPublicAuthPath,
  PROVIDER_WELCOME_PATH,
} from './auth.ts';

const barber = { id: 1, roles: ['barber'] };
const customer = { id: 2, roles: ['user'] };

test('صفحهٔ خوش‌آمدگویی خصوصی است و فقط آرایشگر به آن دسترسی دارد', () => {
  assert.equal(isPublicAuthPath(PROVIDER_WELCOME_PATH), false);
  assert.equal(canAccessPath(PROVIDER_WELCOME_PATH, barber), true);
  assert.equal(canAccessPath(PROVIDER_WELCOME_PATH, customer), false);
});

test('ورود مجدد هیچ‌وقت به صفحهٔ خوش‌آمدگویی نمی‌رود', () => {
  assert.equal(getRoleLandingPath(barber), '/dashboard');
  assert.equal(
    getAuthDestination(PROVIDER_WELCOME_PATH, getRoleLandingPath(barber)),
    '/dashboard',
  );
  // رفتار قبلی callbackUrl سالم می‌ماند
  assert.equal(
    getAuthDestination('/dashboard/services', '/dashboard'),
    '/dashboard/services',
  );
  assert.equal(getRoleLandingPath(customer), '/panel/home');
});

test('دکمهٔ «ورود به داشبورد» فقط به مسیرهای داخل داشبورد می‌رود', () => {
  assert.equal(getDashboardEntryPath(undefined), '/dashboard');
  assert.equal(
    getDashboardEntryPath('/dashboard/services?tab=1'),
    '/dashboard/services?tab=1',
  );
  assert.equal(getDashboardEntryPath('/panel/home'), '/dashboard');
  assert.equal(getDashboardEntryPath('//evil.example'), '/dashboard');
  assert.equal(getDashboardEntryPath(PROVIDER_WELCOME_PATH), '/dashboard');
});
