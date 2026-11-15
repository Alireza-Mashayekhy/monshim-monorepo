# گزارش رفع باگ `gender` در `/panel/explore`

> **خلاصهٔ یک‌خطی:** پارامتر `gender` در DTO کوئری بک‌اند اعلام نشده بود و
> `ValidationPipe` سراسری با `forbidNonWhitelisted: true` کل درخواست فهرست
> سالن‌ها را برای کاربر عادی با خطای «property gender should not exist» رد
> می‌کرد. فیلتر جنسیت حفظ شد، خطا حذف شد و یک شکاف تست (pipe تست‌ها بدون
> `forbidNonWhitelisted`) هم بسته شد.

---

## ۱) سناریوی گزارش‌شده

کاربر عادی وارد پنل می‌شود، صفحهٔ `/panel/explore` این درخواست را می‌فرستد:

```
GET /api/barber?page=1&limit=10&sort=createdAt:desc&gender=male
```

و پاسخ می‌گیرد:

```json
{ "statusCode": 400, "message": ["property gender should not exist"], "error": "Bad Request" }
```

نتیجه: فهرست سالن‌ها خالی می‌ماند و اسکرول بی‌نهایت هم شروع نمی‌شود.
فیلتر جنسیت اما **رفتار مورد انتظار محصول** است و باید بماند.

## ۲) ریشه‌یابی (Root cause)

| لایه | وضعیت قبل از اصلاح |
| --- | --- |
| `apps/web/components/pages/explore/explore-client.tsx` | `gender` را از `user.gender` می‌ساخت و به `useBarberList` می‌داد ✅ |
| `apps/web/services/features/barber/hooks.ts` → `api.ts` | `gender` را در query params می‌فرستاد ✅ |
| `apps/api/src/barber/barber.controller.ts` | `@Query('gender') gender?: string` را **جدا از DTO** می‌گرفت ⚠️ |
| `apps/api/src/barber/dto/barber-query.dto.ts` | `gender` اعلام **نشده بود** ❌ |
| `apps/api/src/main.ts` | `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` → هر پارامتر اعلام‌نشده = ۴۰۰ ❌ |
| `apps/api/src/barber/barber.service.ts` | منطق فیلتر `activityType` درست بود و از قبل وجود داشت ✅ |

پس سرویس درست فیلتر می‌کرد؛ فقط «قرارداد ورودی» ناقص بود. نکتهٔ مهم:
`findAll` همان پارامترها را دو بار می‌گرفت (یک‌بار در DTO و یک‌بار با
`@Query('cityId')`، `@Query('gender')` و… و یک تابع `parseOptNum` که مقدار
خام را دوباره پارس می‌کرد). این «منبع حقیقت دوگانه» باعث می‌شد اعتبارسنجی
DTO دور زده شود و مقدار پارس‌شده بر DTO اولویت بگیرد.

### چرا تست‌ها این باگ را نگرفته بودند؟

`apps/api/src/barber/barber-visibility-http.spec.ts` (تنها تست HTTP این
کنترلر) pipe را این‌طور می‌ساخت:

```ts
new ValidationPipe({ whitelist: true, transform: true }); // بدون forbidNonWhitelisted
```

یعنی دقیقاً همان تنظیمی که در production خطا می‌دهد، در تست خاموش بود.
این هم اصلاح شد.

## ۳) اصلاحات انجام‌شده

### بک‌اند

1. **`apps/api/src/barber/dto/barber-query.dto.ts`**
   - افزودن `BARBER_GENDER_FILTERS = ['male','female']` و `BarberGenderFilter`.
   - افزودن `gender?: BarberGenderFilter` با `@IsIn(...)` و پیام فارسی روشن.
   - `?gender=` (رشتهٔ خالی = «فیلتر پاک شد») با `@Transform` به `undefined`
     تبدیل می‌شود، نه ۴۰۰.
   - مقدار ناشناخته (`?gender=other`) → ۴۰۰ با پیام
     «مقدار جنسیت باید male یا female باشد».

2. **`apps/api/src/barber/barber.controller.ts`** — `findAll` ساده شد:
   ```ts
   @Get()
   findAll(@Req() req: any, @Query() query: BarberQueryDto) {
     return this.barberService.findAll(query, {
       cityId: query.cityId,
       provinceId: query.provinceId,
       minPrice: query.minPrice,
       maxPrice: query.maxPrice,
       minRating: query.minRating,
       gender: req.user?.gender ?? query.gender ?? null,
     });
   }
   ```
   حذف شد: پارامترهای تکراری `@Query('...')`، تابع `parseOptNum` و ایمپورت
   بی‌استفادهٔ `normalizeNumberValue`. تنها منبع ورودی، DTO اعتبارسنجی‌شده است.

3. **`apps/api/src/barber/barber.service.ts`** — تابع خالص
   `normalizeGenderFilter(value)` اضافه شد و فیلتر
   `profile.activityType IN ('men','both')` / `('women','both')` فقط برای
   `male` / `female` اعمال می‌شود. مقدار نامعتبر = «بدون فیلتر» (نه فهرست
   خالی، نه خطا).

**اولویت جنسیت:** اگر کاربر احراز‌هویت‌شده `req.user.gender` داشته باشد،
همان اعمال می‌شود و پارامتر آدرس نمی‌تواند آن را دور بزند؛ در غیر این صورت
پارامتر اعتبارسنجی‌شدهٔ `gender` استفاده می‌شود (رفتار قبلی حفظ شد).

### فرانت‌اند

- فایل جدید **`apps/web/lib/barber-gender.ts`**: تنها منبع حقیقت
  `isBarberGenderFilter` و `resolveBarberGenderFilter(user)` — مقدار
  ناشناخته/خالی → `undefined` (پارامتر اصلاً ارسال نمی‌شود).
- `components/pages/explore/explore-client.tsx` و
  `app/(panel)/panel/home/page.tsx` منطق تکراری `user?.gender === 'male' || ...`
  را کنار گذاشتند و از همین helper استفاده می‌کنند (رفع تکرار، بدون ساخت
  hook/service جدید).
- axios پارامترهای `undefined` را از URL حذف می‌کند؛ تأیید شد که URL دقیقاً
  `…&gender=male` ساخته می‌شود و برای مهمان هیچ اثری از `gender` نیست.

### دیتابیس

هیچ تغییر schema/migration لازم نبود؛ `barber_profile.activity_type` و
`user.gender` از قبل وجود دارند.

## ۴) تست‌ها و اعتبارسنجی

### فایل جدید `apps/api/src/barber/barber-list-gender.http.spec.ts` (۱۴ تست)

- **HTTP با pipe واقعی production** (`forbidNonWhitelisted: true`):
  - URL دقیق گزارش‌شده → `200` (قبلاً `400`).
  - `gender=female` → `200` و انتقال درست به سرویس.
  - بدون `gender` → `gender: null` (بدون فیلتر).
  - `gender=unknown` → `400` با پیام روشن، سرویس صدا زده نمی‌شود.
  - `totallyUnknown=1` → همچنان `400` (محافظت `forbidNonWhitelisted` حفظ شد).
  - `cityId/provinceId/minPrice/maxPrice/minRating` بدون تغییر منتقل می‌شوند.
  - `?cityId=` → `200` (رگرسیون ایجاد نشد).
  - ارقام فارسی در کوئری (`cityId=۱۲`) → `12`.
- **کنترلر + سرویس واقعی + کوئری‌ساز واقعی** با سه سالن
  (`men` / `women` / `both`):
  - مرد → `['سالن مردانه','سالن مشترک']`
  - زن → `['سالن زنانه','سالن مشترک']`
  - مهمان → هر سه سالن
- تست واحد `normalizeGenderFilter` و قرارداد DTO.

### `apps/api/src/barber/barber-visibility-sql.spec.ts` (+۴ تست)

روی **SQL تولیدشدهٔ واقعی** (TypeORM + دیالکت MySQL، بدون نیاز به DB):
`activity_type IN` با پارامترهای `['men','both']` / `['women','both']` و
نبودِ این شرط در حالت خالی یا مقدار نامعتبر.

### `apps/web/lib/barber-gender.test.ts` (۸ تست)

معنای `male|female`، رد کردن مقادیر ناشناخته، و **URL واقعی axios**:
`/api/barber?page=1&limit=10&sort=createdAt:desc&gender=male` برای مرد و
نبودِ پارامتر `gender` برای مهمان.

### اصلاح شکاف تست

`barber-visibility-http.spec.ts` حالا pipe را با همان گزینه‌های `main.ts`
می‌سازد.

### نتیجهٔ اجرا

| بررسی | نتیجه |
| --- | --- |
| `jest` در `apps/api` | **402 تست موفق** / 65 suite (+3 skip، 1 suite skip) |
| `npm test` در `apps/web` | **86 تست موفق** (قبلاً 78 + ۸ تست جدید) |
| `tsc --noEmit` (api و web) | پاک |
| `eslint` روی فایل‌های تغییر‌یافته | بدون خطا |

> محدودیت محیط: MySQL و Playwright در این سندباکس در دسترس نیستند، بنابراین
> تست E2E با دیتابیس واقعی و تست مرورگری اجرا نشد. به‌جای آن، سناریوی کامل
> از HTTP تا SQL با سرویس و کوئری‌ساز واقعی پوشش داده شد.

## ۵) اثر روی رفتارهای سالم

| مسیر | قبل | بعد |
| --- | --- | --- |
| `/panel/explore` (کاربر با جنسیت) | ۴۰۰ ❌ | ۲۰۰ + نتایج فیلترشده ✅ |
| `/panel/explore` (مهمان/بدون جنسیت) | ۲۰۰ | ۲۰۰ (بدون تغییر) |
| `/panel/home` (پیشنهاد سالن) | ۴۰۰ ❌ | ۲۰۰ + فیلترشده ✅ |
| `/api/admin/barber` (از `admin.hooks`) | ۲۰۰ | ۲۰۰ (بدون تغییر؛ فیلتر جنسیت ندارد) |
| فیلترهای شهر/استان/قیمت/امتیاز/جستجو/مرتب‌سازی | کار می‌کرد | بدون تغییر + اعتبارسنجی واقعی DTO |
| محافظت `forbidNonWhitelisted` برای پارامتر ناشناخته | ۴۰۰ | ۴۰۰ (حفظ شد) |

## ۶) فایل‌های تغییر‌یافته

```
apps/api/src/barber/dto/barber-query.dto.ts          (gender + اعتبارسنجی)
apps/api/src/barber/barber.controller.ts             (حذف پارامترهای تکراری)
apps/api/src/barber/barber.service.ts                (normalizeGenderFilter)
apps/api/src/barber/barber-list-gender.http.spec.ts  (جدید، ۱۴ تست)
apps/api/src/barber/barber-visibility-sql.spec.ts    (+۴ تست SQL)
apps/api/src/barber/barber-visibility-http.spec.ts   (pipe مطابق production)
apps/web/lib/barber-gender.ts                        (جدید، منبع حقیقت فرانت)
apps/web/lib/barber-gender.test.ts                   (جدید، ۸ تست)
apps/web/components/pages/explore/explore-client.tsx (استفاده از helper)
apps/web/app/(panel)/panel/home/page.tsx             (استفاده از helper)
apps/web/package.json                                (افزودن تست به اسکریپت)
```

کامیت: `f2ed001` روی برنچ `arena/60abadab-monshim-monorepo`.
