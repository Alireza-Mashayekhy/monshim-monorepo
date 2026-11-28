import { toEnglishDigits } from './digits';

/**
 * ساخت لینک‌های «راه‌های ارتباطی» و «مسیریابی» صفحهٔ اختصاصی آرایشگاه.
 *
 * همهٔ توابع این فایل خالص و بدون وابستگی به مرورگرند تا هم در صفحهٔ
 * عمومی (Server Component) و هم در داشبورد (Client) قابل استفاده باشند.
 * خروجی رشتهٔ خالی یعنی «چیزی برای ساختن نیست»؛ صفحه باید در این حالت
 * دکمه را اصلاً نشان ندهد (نه اینکه دکمهٔ غیرفعال بسازد).
 */

/**
 * تبدیل شمارهٔ ایرانی به فرمت بین‌المللیِ بدون `+` برای `wa.me`
 * (مثلاً `0912…` → `98912…`، `+98 912…` هم همین‌طور).
 * ورودی نامعتبر → رشتهٔ خالی.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = toEnglishDigits(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0098')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('98')) {
    // بین‌المللی؛ همان‌طور که هست.
  } else if (digits.startsWith('0')) {
    digits = `98${digits.slice(1)}`;
  } else if (digits.startsWith('9')) {
    digits = `98${digits}`;
  }
  return digits;
}

/** لینک گفتگوی واتساپ؛ شمارهٔ خالی/نامعتبر → رشتهٔ خالی. */
export function buildWhatsAppUrl(phone: string | null | undefined): string {
  const digits = toWhatsAppNumber(phone);
  return digits ? `https://wa.me/${digits}` : '';
}

/** لینک پروفایل اینستاگرام (شناسهٔ ذخیره‌شده بدون @ و لینک). */
export function buildInstagramUrl(handle: string | null | undefined): string {
  const trimmed = handle?.trim();
  return trimmed ? `https://www.instagram.com/${trimmed}` : '';
}

/** لینک پروفایل/کانال تلگرام (شناسهٔ ذخیره‌شده بدون @ و لینک). */
export function buildTelegramUrl(handle: string | null | undefined): string {
  const trimmed = handle?.trim();
  return trimmed ? `https://t.me/${trimmed}` : '';
}

type CoordinatesInput = {
  latitude?: number | null;
  longitude?: number | null;
};

function hasCoordinates({ latitude, longitude }: CoordinatesInput): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

/**
 * لینک مسیریابی گوگل‌مپ:
 *   - موقعیت ثبت شده → `maps/dir` با مختصات (دقیق‌ترین حالت).
 *   - فقط آدرس متنی → `maps/search` با آدرس کاملِ رَو‌شده.
 *   - هیچ‌کدام → رشتهٔ خالی.
 */
export function buildGoogleMapsDirectionsUrl(input: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}): string {
  if (hasCoordinates(input)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`;
  }
  const query = input.address?.trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : '';
}

/**
 * لینک درخواست و مسیریابی با اسنپ — فقط وقتی موقعیت ثبت شده باشد
 * (بدون مختصات، اسنپ نمی‌داند مقصد کجاست).
 */
export function buildSnappRideUrl({
  latitude,
  longitude,
}: CoordinatesInput): string {
  if (!hasCoordinates({ latitude, longitude })) return '';
  return `https://app.snapp.taxi/pre-ride?dest_lat=${latitude}&dest_lng=${longitude}`;
}

/**
 * استخراج عرض/طول جغرافیایی از لینک یا متن Google Maps:
 *   - `…/@35.123,51.456,17z` (لینک مکان)
 *   - `?q=35.123,51.456` / `?query=` / `?destination=` / `?origin=`
 *   - متن سادهٔ «35.123, 51.456»
 * خروجی null یعنی مختصاتی در ورودی نیست (لینک کوتاه‌شده یا آدرس متنی).
 */
export function extractLatLngFromMapsInput(
  text: string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!text) return null;
  const raw = text.trim();
  if (!raw) return null;

  const candidates: Array<[string, string]> = [];
  const atMatch = raw.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (atMatch) candidates.push([atMatch[1], atMatch[2]]);

  const paramMatch = raw.match(
    /[?&](?:q|query|destination|origin|center)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i,
  );
  if (paramMatch) candidates.push([paramMatch[1], paramMatch[2]]);

  const pairMatch = raw.match(
    /(-?\d{1,3}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (pairMatch) candidates.push([pairMatch[1], pairMatch[2]]);

  for (const [latitudeRaw, longitudeRaw] of candidates) {
    const latitude = Number(latitudeRaw);
    const longitude = Number(longitudeRaw);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

/** گردکردن مختصات تا ۷ رقم اعشار (همان مقیاس ستون‌های decimal دیتابیس). */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(7));
}
