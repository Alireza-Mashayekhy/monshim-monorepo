/**
 * قواعد مشترک آپلود تصویر در فرانت.
 *
 * این فایل تنها منبع حقیقت برای «چه تصویری مجاز است؟» و «چطور خطایش را به
 * کاربر بگوییم؟» است تا همهٔ بخش‌ها (ثبت‌نام آرایشگر، پروفایل، نمونه‌کارها و
 * بلاگ) یک رفتار واحد داشته باشند.
 *
 * ⚠️ این محدودیت‌ها فقط برای بازخورد سریع به کاربر هستند؛ اعتبارسنجی واقعی
 * (محتوا/MIME/ابعاد) در بک‌اند انجام می‌شود. مقدار `MAX_IMAGE_SIZE` باید با
 * `IMAGE_MAX_SIZE_BYTES` در `apps/api/src/common/constants/constants.ts` هم‌خوان
 * بماند.
 */
export const MAX_IMAGE_SIZE = 1024 * 1024 * 3;
export const MAX_PORTFOLIO_IMAGES = 5;

export const IMAGE_SIZE_ERROR = 'حداکثر حجم هر عکس ۳ مگابایت است.';
export const IMAGE_FORMAT_ERROR =
  'فقط فرمت‌های jpeg، jpg، png، gif و webp مجاز هستند.';
export const IMAGE_READ_ERROR =
  'این فایل به‌درستی خوانده نشد. ممکن است خراب یا نیمه‌دانلود شده باشد؛ فایل را باز کنید و دوباره انتخاب کنید.';

export const IMAGE_DROPZONE_ACCEPT: Record<string, string[]> = {
  'image/jpeg': ['.jpeg', '.jpg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

export const IMAGE_ACCEPT = Object.entries(IMAGE_DROPZONE_ACCEPT)
  .flatMap(([type, extensions]) => [type, ...extensions])
  .join(',');

/** پیام خطای فایل انتخاب‌شده؛ `null` یعنی فایل از نظر فرانت مجاز است. */
export function getImageUploadError(
  file: Blob & { name?: string },
): string | null {
  if (file.size === 0) return IMAGE_READ_ERROR;
  if (file.size > MAX_IMAGE_SIZE) return IMAGE_SIZE_ERROR;
  const extensions = IMAGE_DROPZONE_ACCEPT[file.type];
  const extension = file.name?.split('.').pop()?.toLowerCase();
  if (
    !extensions ||
    (file.name !== undefined && !extensions.includes(`.${extension}`))
  ) {
    return IMAGE_FORMAT_ERROR;
  }
  return null;
}

/** نوع MIME قابل اعتماد برای یک تصویر مجاز (در صورت نبود، از پسوند). */
export function resolveImageMimeType(file: {
  name?: string;
  type?: string;
}): string {
  if (file.type && IMAGE_DROPZONE_ACCEPT[file.type]) return file.type;
  const extension = file.name?.split('.').pop()?.toLowerCase() ?? '';
  for (const [mime, extensions] of Object.entries(IMAGE_DROPZONE_ACCEPT)) {
    if (extensions.includes(`.${extension}`)) return mime;
  }
  return 'image/webp';
}

/** نام فایل امن برای ارسال در multipart (بدون کاراکترهای مشکل‌ساز مسیر). */
export function safeUploadFileName(name: string, fallback = 'image'): string {
  const cleaned = (name || '')
    .replace(/[\\/]/g, '-')
    .replace(/[^\w.\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-120);
  return cleaned && cleaned.includes('.') ? cleaned : `${fallback}.webp`;
}
