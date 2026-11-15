/**
 * فیلتر جنسیت فهرست سالن‌ها — تنها منبع حقیقت در فرانت.
 *
 * ── معنای «جنسیت» اینجا چیست؟ ──────────────────────────────────────────────
 * جنسیتِ **مخاطب سالن** است، نه جنسیت آرایشگر: سالنی با `activityType`
 * برابر `men` یا `both` در فیلتر `male` دیده می‌شود و سالن `women`/`both` در
 * فیلتر `female`. این تعریف باید دقیقاً با سرویس بک‌اند
 * (`BarberService.findAll`) یکی باشد.
 *
 * ── چرا ماژول مشترک؟ ──────────────────────────────────────────────────────
 * `/panel/explore` و `/panel/home` هر دو این فیلتر را می‌فرستند. اگر هر کدام
 * منطق خودش را داشته باشد، دوباره به همان ناهماهنگی‌ای می‌رسیم که باعث شد
 * `?gender=` به API برود ولی در DTO بک‌اند اعلام نشده باشد و کل درخواست با
 * «property gender should not exist» رد شود.
 */

export type BarberGenderFilter = 'male' | 'female';

/** آیا مقدار داده‌شده یک فیلتر جنسیت معتبر است؟ (type guard) */
export function isBarberGenderFilter(
  value: unknown,
): value is BarberGenderFilter {
  return value === 'male' || value === 'female';
}

/**
 * استخراج فیلتر جنسیت از پروفایل کاربر.
 *
 * `undefined` یعنی «جنسیت کاربر را نمی‌دانیم» → فیلتر ارسال نمی‌شود و همهٔ
 * سالن‌ها نمایش داده می‌شوند (رفتار درست برای مهمان یا کاربر بدون جنسیت).
 * هر مقدار ناشناخته (مثلاً `''` یا `'other'`) هم به `undefined` تبدیل می‌شود
 * تا هرگز پارامتر نامعتبر به API نرود.
 */
export function resolveBarberGenderFilter(
  user: { gender?: string | null } | null | undefined,
): BarberGenderFilter | undefined {
  const gender = user?.gender;
  return isBarberGenderFilter(gender) ? gender : undefined;
}
