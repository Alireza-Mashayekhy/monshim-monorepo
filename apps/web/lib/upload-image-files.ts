/**
 * خواندن فایل‌های انتخاب‌شده توسط کاربر + اعتبارسنجی.
 *
 * چرا این فایل؟
 * ─────────────
 * پیش‌تر هر بخش (ثبت‌نام، پروفایل، نمونه‌کارها) خودش `FileReader` را صدا
 * می‌زد و با یک `try/catch` عمومی هر خطایی را «خطا در خواندن فایل‌ها» نشان
 * می‌داد. این باعث می‌شد فایل خراب، فایل بدون مجوز، و حتی «پر شدن حافظهٔ
 * مرورگر» همه یک پیام مبهم بگیرند — و بدتر: موفقیت/شکست هر فایل از هم تفکیک
 * نمی‌شد.
 *
 * این ماژول:
 *   • هر فایل را **جدا** اعتبارسنجی و می‌خواند، پس یک فایل خراب بقیه را خراب
 *     نمی‌کند؛
 *   • نتیجه را به صورت «موفق‌ها» و «ناموفق‌ها» برمی‌گرداند تا UI دقیقاً همان
 *     چیزی را نشان دهد که واقعاً اتفاق افتاده؛
 *   • خطای خواندن را با پیام فارسی مشخص می‌کند (نه یک متن عمومی).
 */
import { getImageUploadError, IMAGE_READ_ERROR } from '@/lib/image-upload';
import { toPersianDigits } from '@/lib/utils';

export type ImageRejectionReason = 'invalid' | 'read-failed';

export interface RejectedImage {
  file: File;
  /** پیام قابل نمایش به کاربر. */
  message: string;
  reason: ImageRejectionReason;
}

export interface AcceptedImage {
  file: File;
  /** `data:` URL — برای پیش‌نمایش فوری در UI. */
  dataUrl: string;
  /**
   * همان فایل به شکل Blob. عملاً خود `file` است؛ جدا نگه داشته می‌شود تا
   * محل‌های استفاده صریح باشند که این Blob است که به FormData می‌رود.
   */
  blob: Blob;
}

export interface ReadImagesResult {
  accepted: AcceptedImage[];
  rejected: RejectedImage[];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result) {
        resolve(reader.result);
      } else {
        reject(new Error('empty-file-read'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('file-read-error'));
    reader.onabort = () => reject(new Error('file-read-aborted'));
    try {
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });
}

/** خواندن یک فایل با اعتبارسنجی؛ هرگز خطا پرتاب نمی‌کند. */
export async function readImageFile(
  file: File,
): Promise<{ ok: true; image: AcceptedImage } | { ok: false; rejected: RejectedImage }> {
  const validationError = getImageUploadError(file);
  if (validationError) {
    return {
      ok: false,
      rejected: { file, message: validationError, reason: 'invalid' },
    };
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    return { ok: true, image: { file, dataUrl, blob: file } };
  } catch {
    return {
      ok: false,
      rejected: { file, message: IMAGE_READ_ERROR, reason: 'read-failed' },
    };
  }
}

/**
 * خواندن مجموعه‌ای از فایل‌ها به‌صورت مستقل.
 *
 * `maxCount` (اختیاری) سقف تعداد فایل‌های پذیرفته‌شده است؛ فایل‌های اضافه با
 * پیام مشخص رد می‌شوند (نه با حذف بی‌صدا).
 */
export async function readImageFiles(
  files: Iterable<File>,
  options: { maxCount?: number } = {},
): Promise<ReadImagesResult> {
  const list = Array.from(files);
  const accepted: AcceptedImage[] = [];
  const rejected: RejectedImage[] = [];
  const maxCount = options.maxCount ?? Number.POSITIVE_INFINITY;

  // برای کنترل فشار حافظه، فایل‌ها را دسته‌ای (۴تایی) می‌خوانیم؛ نتیجهٔ هر
  // فایل مستقل است، پس یک فایل کند/خراب بقیه را متوقف نمی‌کند.
  const CHUNK = 4;
  for (let index = 0; index < list.length; index += CHUNK) {
    const chunk = list.slice(index, index + CHUNK);
    const results = await Promise.all(
      chunk.map(async file => {
        const hasRoom = accepted.length < maxCount;
        if (!hasRoom) {
          return {
            ok: false as const,
            rejected: {
              file,
              message: 'تعداد تصاویر از حد مجاز بیشتر است.',
              reason: 'invalid' as const,
            },
          };
        }
        const result = await readImageFile(file);
        if (result.ok) accepted.push(result.image);
        return result;
      }),
    );

    for (const result of results) {
      if (!result.ok) rejected.push(result.rejected);
    }
  }

  return { accepted: accepted.slice(0, maxCount), rejected };
}

/**
 * توست استاندارد نتیجهٔ آپلود چندفایلی.
 *
 * قاعده: پیام موفقیت فقط وقتی نمایش داده می‌شود که **همه** فایل‌ها موفق
 * باشند؛ اگر حتی یکی شکست بخورد، فقط خطای همان فایل(ها) گزارش می‌شود. این از
 * پیام‌های متناقض («موفق» + «خطا») جلوگیری می‌کند.
 */
export function summarizeFileOutcome(
  successCount: number,
  failures: { message: string }[],
): { type: 'success' | 'warning' | 'error'; message: string } | null {
  if (successCount === 0 && failures.length === 0) return null;

  if (failures.length === 0) {
    return {
      type: 'success',
      message:
        successCount === 1
          ? 'تصویر با موفقیت اضافه شد.'
          : `${toPersianDigits(successCount)} تصویر با موفقیت اضافه شد.`,
    };
  }

  const first = failures[0]?.message;
  const unique = Array.from(new Set(failures.map(f => f.message)));
  const detail = unique.length === 1 ? unique[0] : first;

  if (successCount === 0) {
    return {
      type: 'error',
      message:
        failures.length === 1
          ? detail
          : `${toPersianDigits(failures.length)} فایل اضافه نشد. ${detail}`,
    };
  }

  return {
    type: 'warning',
    message: `${toPersianDigits(successCount)} تصویر اضافه شد؛ ${toPersianDigits(
      failures.length,
    )} فایل پذیرفته نشد. ${detail}`,
  };
}
