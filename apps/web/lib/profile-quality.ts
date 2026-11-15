/**
 * سیاستِ کیفیتِ ایندکسِ پروفایل عمومی آرایشگر.
 *
 * چرا این فایل؟
 * ------------
 * `sitemap` و `meta robots` پیش‌تر هیچ آستانهٔ کیفیتی نداشتند: هر پروفایلِ
 * فعالی که اسلاگ داشت وارد فهرست می‌شد، حتی اگر فقط «نام سالن + دو خدمت»
 * داشت و هیچ محتوای منحصربه‌فردی نه. در مقیاس چند صد پروفایل این یعنی
 * صفحه‌های نازکِ تقریباً یکسان — یک ریسک واقعی برای کیفیت کل سایت.
 *
 * **این گیت عمداً پیش‌فرض خاموش است** (`PROFILE_QUALITY_GATE`). فعال‌سازیِ
 * سراسری بدون شمارش پروفایل‌های تحت‌تأثیر، تصمیم کسب‌وکار است نه فنی:
 *   • ابتدا تعداد پروفایل‌های زیر آستانه را بشمارید؛
 *   • سپس با `PROFILE_QUALITY_GATE=1` روشن کنید (هم‌زمان روی `meta robots` و
 *     `sitemap` اثر می‌گذارد، چون هر دو از همین تابع استفاده می‌کنند).
 *
 * پروفایلِ زیر آستانه حذف نمی‌شود؛ فقط `noindex,follow` می‌گیرد و از sitemap
 * بیرون می‌ماند. قابل مشاهده، قابل اشتراک‌گذاری و قابل رزرو باقی می‌ماند و به
 * آرایشگر انگیزهٔ تکمیل پروفایل داده می‌شود — بدون تولید محتوای مصنوعی.
 *
 * «حداقل یک خدمت فعال» عمداً در این آستانه نیست: بک‌اند
 * (`getPublicDirectory`) از قبل تضمین می‌کند فقط پروفایل‌های دارای خدمت فعال
 * در فهرست باشند.
 */
export const PROFILE_INDEX_QUALITY_POLICY = {
  /** حداقل طولِ بیو (کاراکتر، پس از trim) */
  minBioLength: 60,
  /** حداقل تعداد تصویرِ نمونه‌کار */
  minPortfolioCount: 1,
} as const;

export interface ProfileQualityInput {
  bioLength: number;
  portfolioCount: number;
}

export interface ProfileQualityResult {
  indexable: boolean;
  /** دلیلِ رد شدن؛ برای لاگ/گزارش — به کاربر نمایش داده نمی‌شود. */
  reasons: string[];
}

/** آیا گیتِ کیفیت فعال است؟ پیش‌فرض: خاموش. */
export function isProfileQualityGateEnabled() {
  return process.env.PROFILE_QUALITY_GATE === '1';
}

/**
 * ارزیابیِ خالص (بدون I/O) تا مستقل از Next و به‌سادگی تست‌پذیر باشد.
 */
export function evaluateProfileIndexability(
  input: ProfileQualityInput,
): ProfileQualityResult {
  const reasons: string[] = [];

  const bioLength = Number.isFinite(input.bioLength) ? input.bioLength : 0;
  const portfolioCount = Number.isFinite(input.portfolioCount)
    ? input.portfolioCount
    : 0;

  if (bioLength < PROFILE_INDEX_QUALITY_POLICY.minBioLength) {
    reasons.push('bio_too_short');
  }
  if (portfolioCount < PROFILE_INDEX_QUALITY_POLICY.minPortfolioCount) {
    reasons.push('no_portfolio');
  }

  return { indexable: reasons.length === 0, reasons };
}

/**
 * تصمیمِ نهاییِ «آیا این پروفایل باید ایندکس شود؟».
 *
 * وقتی گیت خاموش است همیشه `true` است (رفتار امروزِ سایت، بدون تغییر).
 * اگر سیگنالِ کیفیت در دسترس نباشد (مثلاً پاسخِ قدیمیِ کش‌شدهٔ بک‌اند)،
 * محافظه‌کارانه ایندکس‌پذیر در نظر گرفته می‌شود تا صفحه‌های سالم بی‌دلیل
 * از ایندکس نیفتند.
 */
export function shouldIndexProfile(quality?: ProfileQualityInput | null) {
  if (!isProfileQualityGateEnabled()) return true;
  if (!quality) return true;
  return evaluateProfileIndexability(quality).indexable;
}
