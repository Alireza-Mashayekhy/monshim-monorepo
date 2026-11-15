import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getImageUploadError, MAX_IMAGE_SIZE, resolveImageMimeType } from '@/lib/image-upload';
import {
  createQuotaSafeStorage,
  isStorageQuotaError,
  onSignupPersistFailure,
  stripHeavyImageFields,
} from '@/lib/signup-draft-storage';


/**
 * تست‌های باگ «خطا در خواندن فایل‌ها» در ثبت‌نام آرایشگر.
 *
 * سناریوی واقعی: کاربر ۴ عکس انتخاب می‌کند؛ همه درست خوانده و نمایش داده
 * می‌شوند، اما `localStorage` پر می‌شود و `set()` استثنا می‌دهد. UI آن را
 * «خطای خواندن» تفسیر می‌کرد.
 */

function memoryStorage(limitBytes = Number.POSITIVE_INFINITY) {
  const map = new Map<string, string>();
  let writes = 0;
  return {
    map,
    get writes() {
      return writes;
    },
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      writes += 1;
      if (value.length > limitBytes) {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe('signup draft storage', () => {
  it('با پر شدن سهمیه، استثنا پرتاب نمی‌کند و نسخهٔ سبک را می‌نویسد', () => {
    const base = memoryStorage(1200);
    const failures: { imagesDropped: boolean }[] = [];
    const storage = createQuotaSafeStorage(base, {
      toLightweight: state =>
        state && typeof state === 'object'
          ? stripHeavyImageFields(state as Record<string, unknown>)
          : null,
      onFailure: failure => failures.push(failure),
    });

    const payload = JSON.stringify({
      state: {
        step: 3,
        fullName: 'مریم',
        portfolio: [
          'data:image/webp;base64,' + 'A'.repeat(600),
          'data:image/webp;base64,' + 'A'.repeat(600),
        ],
        image: 'data:image/webp;base64,' + 'A'.repeat(600),
      },
      version: 0,
    });

    // نکتهٔ اصلی: هیچ throw ای نباید رخ دهد.
    assert.doesNotThrow(() => storage.setItem('barber-signup-storage', payload));

    const persisted = JSON.parse(base.map.get('barber-signup-storage')!);
    assert.deepEqual(persisted.state.portfolio, []);
    assert.equal(persisted.state.image, null);
    // دادهٔ متنی کاربر حفظ می‌شود.
    assert.equal(persisted.state.fullName, 'مریم');
    assert.equal(persisted.state.step, 3);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].imagesDropped, true);
  });

  it('پیش‌نویس کوچک‌تر از سقف، با تصاویر ذخیره می‌شود (رفتار قبلی حفظ می‌شود)', () => {
    const base = memoryStorage();
    const failures: { imagesDropped: boolean }[] = [];
    const storage = createQuotaSafeStorage(base, {
      toLightweight: () => null,
      maxHeavyBytes: 10_000,
      onFailure: failure => failures.push(failure),
    });

    const payload = JSON.stringify({
      state: { portfolio: ['data:image/webp;base64,AAAA'], image: null },
      version: 0,
    });
    storage.setItem('draft', payload);

    assert.deepEqual(JSON.parse(base.map.get('draft')!), JSON.parse(payload));
    assert.deepEqual(failures, []);
  });

  it('پیش‌نویس بزرگ‌تر از سقف، از ابتدا بدون تصاویر ذخیره می‌شود', () => {
    const base = memoryStorage();
    const failures: { imagesDropped: boolean }[] = [];
    const storage = createQuotaSafeStorage(base, {
      toLightweight: state =>
        stripHeavyImageFields(state as Record<string, unknown>),
      maxHeavyBytes: 200,
      onFailure: failure => failures.push(failure),
    });

    const payload = JSON.stringify({
      state: { fullName: 'مریم', portfolio: ['x'.repeat(500)], image: null },
      version: 0,
    });
    storage.setItem('draft', payload);

    const persisted = JSON.parse(base.map.get('draft')!);
    assert.deepEqual(persisted.state.portfolio, []);
    assert.equal(persisted.state.fullName, 'مریم');
    assert.deepEqual(failures, [{ imagesDropped: true, error: null }]);
  });

  it('خطای غیرسهمیه هم ذخیره‌سازی را نمی‌شکند', () => {
    const storage = createQuotaSafeStorage(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('SecurityError');
        },
        removeItem: () => undefined,
      },
      { toLightweight: state => state ?? null },
    );

    assert.doesNotThrow(() => storage.setItem('x', '{"state":{}}'));
  });

  it('getItem خراب، بارگذاری را نمی‌شکند', () => {
    const storage = createQuotaSafeStorage(
      {
        getItem: () => {
          throw new Error('boom');
        },
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      { toLightweight: state => state ?? null },
    );

    assert.equal(storage.getItem('x'), null);
  });

  it('isStorageQuotaError نام‌های مختلف مرورگرها را می‌شناسد', () => {
    const quota = new Error('quota');
    quota.name = 'QuotaExceededError';
    assert.equal(isStorageQuotaError(quota), true);

    const firefox = new Error('x');
    firefox.name = 'NS_ERROR_DOM_QUOTA_REACHED';
    assert.equal(isStorageQuotaError(firefox), true);

    const code = Object.assign(new Error('x'), { code: 22 });
    assert.equal(isStorageQuotaError(code), true);

    assert.equal(isStorageQuotaError(new Error('something else')), false);
    assert.equal(isStorageQuotaError(null), false);
  });

  it('شنوندهٔ خطا می‌تواند ثبت و برداشته شود', () => {
    const calls: unknown[] = [];
    const previous = onSignupPersistFailure(f => calls.push(f));
    onSignupPersistFailure(previous);
    assert.equal(typeof previous, 'object');
    assert.deepEqual(calls, []);
  });
});

describe('image upload validation', () => {
  // `Blob.size` فقط خواندنی است؛ برای شبیه‌سازی حجم، یک آبجکت ساده می‌سازیم
  // (تابع اعتبارسنجی فقط `size`/`type`/`name` را می‌خواند).
  const makeFile = (name: string, type: string, size: number) =>
    ({ name, type, size }) as unknown as File;

  it('فایل خالی (۰ بایت) را رد می‌کند', () => {
    const file = makeFile('empty.png', 'image/png', 0);
    assert.ok(getImageUploadError(file));
  });

  it('حجم بیش از ۳ مگابایت را رد می‌کند', () => {
    const file = makeFile('big.png', 'image/png', MAX_IMAGE_SIZE + 1);
    assert.match(getImageUploadError(file)!, /۳ مگابایت/);
  });

  it('فرمت غیرمجاز را رد و فرمت مجاز را قبول می‌کند', () => {
    assert.ok(getImageUploadError(makeFile('a.pdf', 'application/pdf', 10)));
    assert.equal(getImageUploadError(makeFile('a.webp', 'image/webp', 10)), null);
    assert.equal(getImageUploadError(makeFile('a.JPG', 'image/jpeg', 10)), null);
  });

  it('نوع MIME گمشده را از پسوند بازیابی می‌کند', () => {
    assert.equal(resolveImageMimeType({ name: 'x.png', type: '' }), 'image/png');
    assert.equal(resolveImageMimeType({ name: 'x.JPG' }), 'image/jpeg');
    assert.equal(resolveImageMimeType({ name: 'x.unknown' }), 'image/webp');
  });
});

describe('multi-file reading (سناریوی ۴ عکس)', () => {
  class FakeFileReader {
    result: string | null = null;
    error: unknown = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;

    readAsDataURL(file: { content?: string; broken?: boolean; type?: string }) {
      queueMicrotask(() => {
        if (file?.broken) {
          this.error = new Error('NotReadableError');
          this.onerror?.();
          return;
        }
        this.result = `data:${file.type ?? 'image/png'};base64,QQ==`;
        this.onload?.();
      });
    }
  }

  function installReader(target: typeof globalThis) {
    (target as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
  }

  const makeFile = (
    name: string,
    options: { broken?: boolean; size?: number; type?: string } = {},
  ) =>
    ({
      name,
      type: options.type ?? 'image/png',
      size: options.size ?? 1024,
      broken: options.broken ?? false,
    }) as unknown as File;

  it('۴ فایل سالم ← ۴ موفق، ۰ ناموفق', async () => {
    installReader(globalThis);
    const { readImageFiles } = await import('@/lib/upload-image-files');
    const files = [
      makeFile('a.png'),
      makeFile('b.png'),
      makeFile('c.png'),
      makeFile('d.png'),
    ];
    const result = await readImageFiles(files);
    assert.equal(result.accepted.length, 4);
    assert.equal(result.rejected.length, 0);
    assert.ok(result.accepted.every(image => image.dataUrl.startsWith('data:')));
  });

  it('۳ سالم + ۱ خراب ← ۳ موفق، ۱ ناموفق (بدون خطای کلی)', async () => {
    installReader(globalThis);
    const { readImageFiles, summarizeFileOutcome } = await import(
      '@/lib/upload-image-files'
    );
    const files = [
      makeFile('a.png'),
      makeFile('broken.png', { broken: true }),
      makeFile('c.png'),
      makeFile('d.png'),
    ];
    const result = await readImageFiles(files);
    assert.equal(result.accepted.length, 3);
    assert.equal(result.rejected.length, 1);
    assert.match(result.rejected[0].message, /خوانده نشد/);
    // موفقیت‌ها حفظ می‌شوند و حفظ نشدن یک فایل، بقیه را از بین نمی‌برد.
    assert.deepEqual(
      result.accepted.map(image => image.file.name),
      ['a.png', 'c.png', 'd.png'],
    );

    const outcome = summarizeFileOutcome(
      result.accepted.length,
      result.rejected,
    );
    assert.equal(outcome?.type, 'warning');
    assert.match(outcome!.message, /۳ تصویر اضافه شد/);
    assert.match(outcome!.message, /۱ فایل پذیرفته نشد/);
  });

  it('فایل غیرمجاز در میان فایل‌ها، بقیه را متوقف نمی‌کند', async () => {
    installReader(globalThis);
    const { readImageFiles } = await import('@/lib/upload-image-files');
    const result = await readImageFiles([
      makeFile('a.png'),
      makeFile('doc.pdf', { type: 'application/pdf' }),
      makeFile('c.webp', { type: 'image/webp' }),
    ]);
    assert.equal(result.accepted.length, 2);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].reason, 'invalid');
  });

  it('سقف تعداد رعایت می‌شود و مازاد با پیام مشخص رد می‌شود', async () => {
    installReader(globalThis);
    const { readImageFiles } = await import('@/lib/upload-image-files');
    const files = Array.from({ length: 7 }, (_, index) =>
      makeFile(`p${index}.png`),
    );
    const result = await readImageFiles(files, { maxCount: 4 });
    assert.equal(result.accepted.length, 4);
    assert.equal(result.rejected.length, 3);
  });

  it('همه خراب ← پیام موفقیت نمایش داده نمی‌شود', async () => {
    installReader(globalThis);
    const { readImageFiles, summarizeFileOutcome } = await import(
      '@/lib/upload-image-files'
    );
    const result = await readImageFiles([
      makeFile('a.png', { broken: true }),
      makeFile('b.png', { broken: true }),
    ]);
    assert.equal(result.accepted.length, 0);
    const outcome = summarizeFileOutcome(result.accepted.length, result.rejected);
    assert.equal(outcome?.type, 'error');
  });

  it('هیچ فایلی انتخاب نشود ← خروجی خالی و بدون پیام', async () => {
    installReader(globalThis);
    const { readImageFiles, summarizeFileOutcome } = await import(
      '@/lib/upload-image-files'
    );
    const result = await readImageFiles([]);
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected.length, 0);
    assert.equal(summarizeFileOutcome(0, []), null);
  });
});
