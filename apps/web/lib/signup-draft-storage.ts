/**
 * ذخیره‌سازی پیش‌نویس ثبت‌نام آرایشگر در حافظهٔ مرورگر.
 *
 * ── چرا این فایل لازم شد؟ (ریشهٔ باگ «خطا در خواندن فایل‌ها») ───────────────
 * پیش‌نویس ثبت‌نام (شامل لوگو و نمونه‌کارها به شکل `data:` URL) در
 * `localStorage` نگه داشته می‌شد. ظرفیت `localStorage` حدود ۵ مگابایت در هر
 * origin است و هر تصویر Base64 حدوداً ۱٫۳۳ برابر حجم فایل، فضا می‌گیرد. با
 * انتخاب ۳ تا ۴ عکس (حتی زیر سقف ۳ مگابایتی هر عکس) سهمیه پر می‌شد و
 * `localStorage.setItem` خطای `QuotaExceededError` پرتاب می‌کرد.
 *
 * چون zustand نسخه ۵ خطای `setItem` را به فراخوانندهٔ `set()` منتقل می‌کند،
 * همان `updateData(...)` در `step-3` استثنا می‌داد؛ UI آن را «خطا در خواندن
 * فایل‌ها» تفسیر می‌کرد — در حالی که فایل‌ها کاملاً درست خوانده شده و در state
 * حافظه‌ای هم قرار گرفته بودند (به همین دلیل تصاویر نمایش داده می‌شدند!).
 * نتیجه: پیام خطا + تصاویر موجود = وضعیت متناقض.
 *
 * ── راه‌حل ─────────────────────────────────────────────────────────────────
 *   ۱. `setItem` هرگز خطا پرتاب نمی‌کند؛ خطا فقط لاگ می‌شود. state حافظه‌ای
 *      همیشه منبع حقیقت است و UI با آن هم‌خوان می‌ماند.
 *   ۲. اگر سهمیه پر شود، تصاویر (سنگین‌ترین بخش) از نسخهٔ ذخیره‌شده حذف
 *      می‌شوند تا بقیهٔ پیش‌نویس (نام، شماره، آدرس، خدمات) از دست نرود.
 *   ۳. اگر حتی همین هم جا نشود، پیش‌نویس با خطای واضح ذخیره نمی‌شود و
 *      `onPersistError` فراخوانی می‌شود تا UI یک هشدار (نه خطای مسدودکننده)
 *      نشان دهد.
 *
 * این ماژول هیچ وابستگی‌ای جز `zustand/middleware` ندارد و برای تست‌پذیری،
 * تابع خالص `createQuotaSafeStorage` را هم صادر می‌کند.
 */
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

export interface PersistFailure {
  /** آیا فقط تصاویر حذف شدند (پیش‌نویسِ متنی حفظ شد)؟ */
  imagesDropped: boolean;
  error: unknown;
}

type PersistFailureHandler = (failure: PersistFailure) => void;

let persistFailureHandler: PersistFailureHandler | null = null;

/**
 * ثبت شنوندهٔ خطای ذخیره‌سازی. UI می‌تواند با آن یک هشدار غیرمسدودکننده
 * نشان دهد. مقدار قبلی برگردانده می‌شود تا cleanup ساده باشد.
 */
export function onSignupPersistFailure(
  handler: PersistFailureHandler | null,
): PersistFailureHandler | null {
  const previous = persistFailureHandler;
  persistFailureHandler = handler;
  return previous;
}

function notifyPersistFailure(failure: PersistFailure) {
  if (!persistFailureHandler) return;
  try {
    persistFailureHandler(failure);
  } catch {
    // شنوندهٔ UI هرگز نباید ذخیره‌سازی را بشکند.
  }
}

/** آیا خطا از نوع «سهمیهٔ حافظه پر شد» است؟ (مرورگرها نام‌های متفاوتی دارند) */
export function isStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const code =
    typeof candidate.code === 'number' || typeof candidate.code === 'string'
      ? String(candidate.code)
      : '';
  const message =
    typeof candidate.message === 'string' ? candidate.message : '';
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === '22' ||
    code === '1014' ||
    /quota/i.test(message)
  );
}

/**
 * حذف فیلدهای سنگین تصویری از پیش‌نویس.
 *
 * چرا فقط تصاویر؟ چون آن‌ها ۹۹٪ حجم را می‌سازند و همان‌ها هم در نهایت باید
 * دوباره انتخاب شوند (به‌هرحال `data:` URL دقیقاً همان چیزی است که در پایان
 * به FormData تبدیل می‌شود). بقیهٔ اطلاعات، ورودی دستی کاربر است و نباید از
 * دست برود.
 */
export function stripHeavyImageFields<
  T extends Record<string, unknown>,
>(state: T): T {
  return {
    ...state,
    image: null,
    portfolio: [],
  };
}

export interface QuotaSafeStorageOptions {
  /**
   * ساخت state سبک‌شده (بدون تصاویر) وقتی نوشتنِ کامل ممکن نیست.
   * خروجی `null` یعنی «هیچ نسخهٔ سبکی وجود ندارد».
   */
  toLightweight: (value: unknown) => unknown | null;
  /**
   * سقف حجمِ نسخهٔ «کامل» (شامل تصاویر).
   *
   * چرا از پیش بررسی می‌شود؟ `localStorage` سهمیهٔ مشترکی با بقیهٔ کلیدهای
   * همین دامنه دارد. اگر تا لبهٔ ۵ مگابایت پر شود، بقیهٔ داده‌های اپ (کش
   * صفحه‌ها، تنظیمات) بیرون می‌افتند یا نوشتنشان شکست می‌خورد. پس تصاویر
   * فقط تا این سقف نگه داشته می‌شوند و بعد از آن نسخهٔ سبک نوشته می‌شود.
   */
  maxHeavyBytes?: number;
  onFailure?: PersistFailureHandler;
}

/**
 * یک `StateStorage` که هرگز throw نمی‌کند.
 *
 * `getItem` هم محافظت شده است: مقدار خراب/ناقص در `localStorage` نباید
 * بارگذاری صفحهٔ ثبت‌نام را بشکند (پیش‌تر `JSON.parse` خطا می‌داد و hydrate
 * شکست می‌خورد).
 */
export function createQuotaSafeStorage(
  base: StateStorage,
  options: QuotaSafeStorageOptions,
): StateStorage {
  return {
    getItem: name => {
      try {
        return base.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      /**
       * ساخت نسخهٔ سبک. اگر نسخه‌ای برای سبک‌سازی وجود نداشته باشد، `null`.
       */
      const buildLightweight = (fallbackError: unknown): string | null => {
        try {
          const parsed = JSON.parse(value) as {
            state?: unknown;
            version?: unknown;
          };
          const lightweight = options.toLightweight(parsed?.state);
          if (lightweight === null) return null;
          return JSON.stringify({ ...parsed, state: lightweight });
        } catch (error) {
          options.onFailure?.({ imagesDropped: false, error: fallbackError ?? error });
          return null;
        }
      };

      // ۱) اگر نسخهٔ کامل از سقفِ تعیین‌شده بزرگ‌تر است، از همان ابتدا سبک
      //    می‌نویسیم تا سهمیهٔ بقیهٔ داده‌های اپ را نخوریم.
      const maxHeavyBytes = options.maxHeavyBytes;
      if (typeof maxHeavyBytes === 'number' && value.length > maxHeavyBytes) {
        const lightweight = buildLightweight(null);
        if (lightweight !== null) {
          try {
            base.setItem(name, lightweight);
          } catch (error) {
            options.onFailure?.({ imagesDropped: false, error });
            return;
          }
          options.onFailure?.({ imagesDropped: true, error: null });
          return;
        }
      }

      // ۲) تلاش برای نوشتن کامل (با تصاویر) تا رفتار قبلی حفظ شود.
      try {
        base.setItem(name, value);
        return;
      } catch (error) {
        if (!isStorageQuotaError(error)) {
          // خطای غیرسهمیه (مثلاً حالت private در برخی مرورگرها): بی‌صدا رد
          // می‌شود تا عملیات کاربر شکست نخورد. state حافظه‌ای معتبر است.
          options.onFailure?.({ imagesDropped: false, error });
          return;
        }
      }

      // ۳) سهمیه پر شد: نسخهٔ سبک‌شده (بدون تصاویر) تا بقیهٔ پیش‌نویس حفظ شود.
      const lightweight = buildLightweight(null);
      if (lightweight === null) return;
      try {
        base.setItem(name, lightweight);
        options.onFailure?.({ imagesDropped: true, error: null });
      } catch (error) {
        options.onFailure?.({ imagesDropped: false, error });
      }
    },
    removeItem: name => {
      try {
        base.removeItem(name);
      } catch {
        // پاک‌سازی نباید هیچ جریانی را بشکند.
      }
    },
  };
}

/**
 * استوریج آمادهٔ استفاده برای پیش‌نویس ثبت‌نام.
 * در محیط بدون `window` (SSR) هم بی‌خطر است.
 */
/**
 * سقف حجمی نسخهٔ کامل پیش‌نویس (شامل تصاویر).
 *
 * ۲ مگابایت از سهمیهٔ ۵ مگابایتی را برای اپ نگه می‌دارد؛ بیشتر از این،
 * خطر «پر شدن سهمیه و شکستن بقیهٔ کلیدها» را بالا می‌برد.
 */
export const SIGNUP_DRAFT_MAX_HEAVY_BYTES = 2 * 1024 * 1024;

export function createSignupDraftStorage(): ReturnType<
  typeof createJSONStorage
> {
  return createJSONStorage(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage unavailable');
    }
    return createQuotaSafeStorage(window.localStorage, {
      toLightweight: state =>
        state && typeof state === 'object'
          ? stripHeavyImageFields(state as Record<string, unknown>)
          : null,
      maxHeavyBytes: SIGNUP_DRAFT_MAX_HEAVY_BYTES,
      onFailure: notifyPersistFailure,
    });
  });
}
