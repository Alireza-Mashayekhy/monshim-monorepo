# گزارش اجرای رفع ایرادهای سئو — منشیم (monshiim.ir)

تاریخ: ۲۰۲۶-۱۱-۱۵ · شاخه: `arena/16d48ec8-monshim-monorepo` · مرجع: `docs/audit/SEO-AUDIT-2026-11-15.md`

این سند **گزارش اجرا** است، نه گزارش بازبینی: هر مورد در کد بررسی، اصلاح، و با
تست/بیلد/درخواست واقعی تأیید شده است. هیچ ادعای تأیید‌نشده‌ای در بخش D نیست.

> محدودیت محیط: در این sandbox دسترسی شبکه به `monshiim.ir` وجود ندارد و
> MySQL/NestJS قابل اجرا نیست. بنابراین بک‌اند با `jest` (۴۱۵ تست) و `tsc`
> تأیید شده و لایهٔ Next با **یک API ساختگیِ محلی** (قراردادِ همان endpointهای
> واقعی) روی بیلدِ production اجرا و با `curl` بررسی شده است. این روش در بخش D
> صریحاً مشخص شده تا با «تأیید روی دادهٔ production» اشتباه نشود.

---

## A. ایرادهای رفع‌شده

### P1-1 — ۴۰۴ واقعی + مرزبندی مسیرهای عمومی/خصوصی/ناموجود

**ریشهٔ ایراد (تأیید‌شده در کد):** `apps/web/proxy.ts` فقط دو حالت می‌شناخت.
هر مسیری که در فهرست «عمومی» نبود — از جمله مسیرهایی که **اصلاً وجود نداشتند** —
با `307` به `/login?callbackUrl=…` فرستاده می‌شد. `/login` هم در `robots.txt`
مسدود است. نتیجه: کل دامنه هیچ ۴۰۴ واقعی برنمی‌گرداند؛ گوگل همهٔ URLهای اشتباه
را «Page with redirect» می‌دید که مقصدش با robots مسدود است.

**فایل‌ها:**

- `apps/web/lib/route-access.ts` (+ `route-access.test.ts`) — جدید
- `apps/web/proxy.ts` — بازنویسی‌شده
- `apps/web/providers/auth.provider.tsx`, `apps/web/lib/auth.ts`

**راه‌حل:** مدل سه‌حالتهٔ `classifyRoute()`:
`public` (بدون گیت) / `private` (همان گیتِ قبلیِ احراز هویت) / `unknown`
(به روتر Next سپرده می‌شود تا ۴۰۴ واقعی بدهد).
تصمیم عمداً **fail-closed** است: مسیر خصوصیِ ثبت‌نشده ۴۰۴ می‌شود (خرابیِ
قابل‌دیدن)، نه عمومی (نشت امنیتی). `route-access.test.ts` درخت `app/` را از
فایل‌سیستم می‌خواند و اگر مسیری بدون دسته‌بندی بماند تست را شکست می‌دهد.

**تأیید:** `/this-page-does-not-exist-123456` → **404** واقعی (قبلاً 307 به
`/login`)؛ `/panel/explore` و `/admin` → `307 → /login?callbackUrl=…`
(همان رفتار امن قبلی، بدون تغییر). تست: ۹ مورد در `lib/route-access.test.ts`.

---

### P1-2 — ۴۰۴ برندشده فارسی/RTL

**ریشهٔ ایراد:** هیچ `not-found.tsx` در ریشهٔ `app/` وجود نداشت. تنها فایل
موجود `app/(public-barber)/provider/[id]/not-found.tsx` بود که برای کاربر
ناشناس به دیوارِ ورود `/panel/explore` لینک می‌داد.

**فایل:** `apps/web/app/not-found.tsx` (جدید)،
`app/(marketing)/error.tsx` (جدید، مکمل)

**راه‌حل:** صفحهٔ Server Component (بدون JS اضافه)، هم‌خوان با design system
(`custom-container`, `Button`, `lucide-react`)، `h1` + متن فارسی + سه مسیر
بازیابی (`/providers`, `/blog`, `/`) + راه ارتباط با پشتیبانی.
`robots: { index: false, follow: true }` صریح. `main#main-content` برای
پرش صفحه‌کلید.

**بررسی جانبیِ مرتبط:** تنها مرز خطای موجود `app/global-error.tsx` بود که صفحهٔ
پیش‌فرض **انگلیسی و بدون RTL** Next را رندر می‌کرد. `app/(marketing)/error.tsx`
افزوده شد: کد وضعیت همچنان ۵۰۰ می‌ماند (درست برای سئو؛ ۴۰۴ کردنِ خطای موقت
باعث حذف مقالهٔ سالم از ایندکس می‌شود)، صفحه `noindex` است، و کاربر دکمهٔ
«تلاش دوباره» دارد.

**تأیید:** پاسخ ۴۰۴ شامل `<title>صفحه پیدا نشد | منشیم</title>` و
`<meta name="robots" content="noindex, follow">` و `dir` سراسری RTL است.

---

### P1-3 — URL عمومی `/barber/{slug}` → `/provider/{slug}`

**ریشهٔ ایراد:** `public-page.service.ts` در تابع `publicUrl()` آدرس
`/barber/{slug}` می‌ساخت و همان در پنل به‌عنوان «لینک صفحهٔ شما» کپی/همرسانی
می‌شد؛ در حالی که مسیر واقعیِ اپ `/provider/[id]` است و `/barber/*` فقط با
۳۰۱ قدیمی به آن می‌رسید. یعنی هر لینکِ تولیدشده یک ریدایرکت اضافه داشت.

**فایل‌ها:** `apps/api/src/public-page/public-page.service.ts` (+ spec)،
`apps/web/proxy.ts` (جدول ۳۰۱ قدیمی حفظ شد)

**راه‌حل:** `publicUrl()` → `/provider/{slug}`. جدول `LEGACY_PATH_REDIRECTS`
(`/barber` → `/provider`) دست‌نخورده ماند تا لینک‌های قدیمی و پارامترهای کوئری
کار کنند. جست‌وجوی کل مخزن نشان داد هیچ تولیدکنندهٔ دیگرِ `/barber/` در کد نیست.

**تأیید:** سه انتظارِ تست بک‌اند به‌روزرسانی شد
(`https://monshiim.ir/provider/aria-salon`). تست‌های بک‌اند سبز. ۳۰۱ قدیمی در
`proxy.ts` فعال است.

---

### P1-4 — `/explore` و `/cities/*`

**ریشهٔ ایراد:** `/explore` یک صفحهٔ خصوصی بود که در `sitemap.xml` هم اعلام
می‌شد، و هر دو مسیر (و هر URL ناشناس) به `/login` می‌رفتند — مقصدی که
`robots.txt` آن را مسدود می‌کند.

**فایل‌ها:** `apps/web/lib/route-access.ts` (`RETIRED_ROUTE_REDIRECTS`),
`apps/web/app/cities/[[...rest]]/route.ts` (جدید), `apps/web/app/robots.ts`

**راه‌حل:** `/explore` → **۳۰۱ تک‌مرحله‌ای** به `/providers` (مقصد عمومی و
ایندکس‌پذیر؛ هیچ زنجیره‌ای به صفحهٔ مسدود وجود ندارد). هر `/cities/*` →
Route Handler استاتیک با **۴۱۰** و هدر `x-robots-tag: noindex, follow`.
`/cities` از `Disallow` در robots حذف شد (وگرنه خزنده دلیل ۴۱۰ را نمی‌دید).
هیچ صفحهٔ شهر/استان/محله ساخته نشد (بدون تأیید صریح).

**تأیید:** `/explore` → `301 /providers`؛ `/cities/tabriz/barbers` →
`410` + `noindex`؛ هیچ‌کدام در sitemap نیستند.

---

### P1-5 — Google Search Console

**وضعیت یافته‌شده:** هیچ سرنخ تأییدی در کد نبود. `apps/web/public/23065741.txt`
وجود دارد ولی **۰ بایت** است و چیزی تأیید نمی‌کند. هیچ توکنی حدس زده نشد.

**فایل‌ها:** `apps/web/app/layout.tsx`, `apps/web/.env.example`

**راه‌حل (نقطهٔ اتصال دقیق):**

```ts
...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
  ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
  : {})
```

اگر متغیر تنظیم نشود، **هیچ تگ خالی‌ای رندر نمی‌شود**.

**کارهای مالک (بدون تغییر کد لازم):**

1. گزینهٔ توصیه‌شده: رکورد `TXT` در DNS دامنه — مستقل از هر deploy.
2. یا توکن HTML را در `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` بگذارید.
3. یا فایل `public/23065741.txt` را با محتوای واقعی جایگزین کنید (فایل فعلی
   خالی است و کار نمی‌کند).
4. سپس `https://monshiim.ir/sitemap.xml` را در GSC ثبت کنید (آدرس در
   `robots.txt` هم اعلام شده است).

**تأیید:** سئو-متای `verification` در نبودِ متغیر محیطی رندر نمی‌شود (بیلد و
HTML بررسی شد). **تأیید GSC انجام نشده و ادعا نمی‌شود.**

---

### P1-6 — GA4 تایپ‌شده، بدون PII

**ریشهٔ ایراد:** تنها چیزی که به GA4 می‌رسید `page_view` خودکار بود؛ هیچ رویداد
تجاری تعریف نشده بود و رویدادی هم وجود نداشت که بتواند «ثبت‌نام»، «رزرو» یا
«انتشار پروفایل» را اندازه بگیرد.

**فایل‌ها:** `apps/web/lib/analytics.ts` (جدید)،
`services/features/auth/hooks.ts`, `services/features/booking/hooks.ts`,
`components/public-barber/booking-gate.tsx`, `booking-auth-dialog.tsx`,
`components/public-barber/profile-view-tracker.tsx` (جدید),
`app/(dashboard)/dashboard/public-page/page.tsx`,
`app/(panel)/panel/payment/callback/page.tsx`,
`app/(public-barber)/provider/[id]/page.tsx`

**رویدادها:** `provider_registration_started/completed`،
`customer_registration_started/completed`، `provider_profile_published`،
`provider_profile_viewed`، `booking_started`، `booking_completed`،
`payment_completed`.

**سه قاعدهٔ سخت که در تایپ اعمال شده‌اند:**

1. **بدون PII:** پارامترها فقط از `AnalyticsEventMap` می‌آیند (بولین/عدد/رشتهٔ
   محدود به union). هیچ تابع «ارسال هر آبجکتی» وجود ندارد، پس تلفن/ایمیل/نام/
   JWT/دادهٔ پرداخت از مسیر تایپ رد نمی‌شود.
2. **بدون تکرار:** `trackEventOnce(key, …)` برای رویدادهای یک‌باره (بازدید
   پروفایل، پرداخت با کلید `trackId`). ردیابی در لایهٔ hook انجام می‌شود نه در
   فرم، تا هر مسیری که به همان mutation می‌رسد یک رویداد بفرستد.
3. **فقط بعد از موفقیت:** همهٔ `*_completed` در `onSuccess` می‌آیند.

**بهبود حریم خصوصی (یافتهٔ حین اجرا):** GA4 به‌طور پیش‌فرض `page_location` را
با **کل** آدرس می‌فرستد؛ `/deposit/[token]` توکنِ پرداختِ بیعانه است. اکنون
`send_page_view: false` + `page_location` پاک‌شده ارسال می‌شود
(`ANALYTICS_PATH_MASKS` و `ANALYTICS_SECRET_QUERY_PARAMS` در
`lib/analytics.ts`، مصرف‌شده در همان اسکریپت `gtag`، با تست).

**تأیید:** ۶ تست واحد روی پاک‌سازی آدرس؛ ۱۲۳+ تست وب سبز؛ در HTML اولیه هیچ
صفحه‌ای اسکریپت GA وجود ندارد (فقط `dns-prefetch` از قبل). **DebugView
تأیید نشده** (نیازمند محیط واقعی) — روش تأیید در بخش E آمده است.

---

### P1-7 — گیتِ آنالیتیکس (۲۰ ثانیه/تعامل)

**ریشهٔ ایراد:** `AnalyticsGate` **همهٔ** ابزارها را پشت «اولین تعامل یا ۲۰
ثانیه» قفل می‌کرد. بازدیدکنندهٔ ارگانیک که صفحه را می‌خواند و می‌رفت (بدون
کلیک/اسکرول) هیچ‌جا شمرده نمی‌شد — یعنی دقیقاً همان ترافیکی که ارزش سئو را
می‌سازد. دلیلِ اصلیِ گیت هم معتبر بود: Clarity بلافاصله از DOM اسنپ‌شات
می‌گیرد.

**فایل:** `apps/web/components/analytics/AnalyticsGate.tsx`

**راه‌حل:** سیاست دوگانه — GA4 (فقط شمارش) روی صفحهٔ عمومی پس از **۳ ثانیه**
بدون نیاز به تعامل؛ روی صفحهٔ خصوصی همان ۲۰ ثانیه/تعامل. Clarity (ضبط نشست)
**هرگز** روی مسیر خصوصی بارگذاری نمی‌شود. رفتار DNT/GPC حفظ شد.

**تأیید:** HTML اولیه فاقد اسکریپت GA/Clarity است؛ تصمیم مسیر خصوصی از
`requiresAuth()` می‌آید که تست واحد دارد.

---

### P2-1 — `BlogPosting` + `BreadcrumbList`

**فایل:** `apps/web/app/(marketing)/blog/[slug]/page.tsx`

**راه‌حل:** `BlogPosting` با `@id`, `mainEntityOfPage`, `headline` (≤۱۱۰
کاراکتر), `datePublished`, و `dateModified`/`image` **فقط وقتی دادهٔ واقعی
وجود دارد**. `author` و `publisher` به `Organization` سایت
(`https://monshiim.ir/#organization`) اشاره می‌کنند — چون نویسندهٔ شخصی ثبت
نشده است؛ هیچ نویسنده/تاریخ ساختگی ساخته نشد. `BreadcrumbList` با همان سه
گامِ دیداری. تاریخ‌ها با `new Date()` معتبرسازی می‌شوند تا مقدار نامعتبر
JSON-LD را نشکند.

**تأیید:** استخراج JSON-LD از HTML بیلد production (بخش D).

---

### P2-2 — کش بلاگ و revalidation

**ریشهٔ ایراد:** `getArticle`/`getArticles` با `cache: 'no-store'` و صفحه‌ها با
`dynamic = 'force-dynamic'` کار می‌کردند: هر بازدید مقاله دو رفت‌وبرگشت همگام
به بک‌اند می‌زد، هیچ لایهٔ کشی نبود و TTFB مقاله به سلامت لحظه‌ای API گره
خورده بود.

**فایل‌ها:** `lib/blog/server.ts`, `lib/public-cache-tags.ts`,
`lib/public-cache.ts`, `app/api/revalidate/route.ts`,
`apps/api/src/common/services/frontend-revalidation.service.ts`,
`apps/api/src/blog/blog.service.ts`, `apps/api/src/blog/blog.module.ts`,
`app/(marketing)/blog/page.tsx`, `.../[slug]/page.tsx`

**راه‌حل:**

- `revalidate = 300` + تگ `blog-api-data`؛ حذف `force-dynamic`.
- `getArticle` با `cache()` ری‌اکت → یک فراخوانی برای `generateMetadata` و
  بدنهٔ صفحه در هر درخواست.
- **۴۰۴ حفظ شد**: تنها `404` به `null` تبدیل می‌شود؛ خطاهای دیگر throw
  می‌شوند تا مقالهٔ سالم به‌خاطر قطعیِ موقت ۴۰۴ نشود.
- انتشار/ویرایش/حذف در پنل ادمین → `notifyBlogChanged({slug})` → وبهوک
  محافظت‌شدهٔ `/api/revalidate` → `revalidateTag('blog-api-data')`.
- وبهوک اکنون `paths` (باید با `/` شروع شود، حداکثر ۲۰) و `tags` (فقط
  whitelist، حداکثر ۱۰) را هم می‌پذیرد.

**تأیید:** متادیتا پس از ویرایش در همان درخواست بعدی تازه می‌شود (تگ
منقضی می‌شود)؛ ۴۰۴ مقالهٔ ناموجود در تست درخواستی تأیید شد.

---

### P2-3 — `robots` مقاله

**ریشهٔ ایراد:** صفحهٔ مقاله مستقیماً `robots: { index, follow }` می‌نوشت و کل
آبجکتِ `buildPageMetadata` (به‌ویژه `googleBot` با `max-image-preview: large`،
`max-snippet: -1`، `max-video-preview: -1`) را دور می‌ریخت — و این باگ **فقط**
روی مقاله‌ها رخ می‌داد.

**فایل‌ها:** `lib/seo.ts` (`mergeRobotsDecision`), `lib/seo.test.ts` (جدید),
`app/(marketing)/blog/[slug]/page.tsx`

**راه‌حل:** ادغام در یک تابع خالص و تست‌پذیر؛ فقط `index`/`follow` بازنویسی
می‌شوند. `undefined` (فیلدِ جاافتاده در پاسخ API) به‌معنای «بله» است، نه
noindex.

**تأیید:** ۶ تست رگرسیون؛ و در HTML واقعی: `robots: index, follow` **و**
`googlebot: index, follow, max-video-preview:-1, max-image-preview:large,
max-snippet:-1`.

---

### P2-4 — `lastModified` در sitemap

**ریشهٔ ایراد:** `lastmod` پروفایل‌ها از `MAX(purchase.createdAt)` /
`MAX(booking.updatedAt)` می‌آمد؛ یعنی «فعالیت تجاری»، نه ویرایش محتوا. سالنی
که بیو/نمونه‌کار/خدماتش را بازنویسی می‌کرد هیچ سیگنال تازگی نمی‌گرفت.

**فایل‌ها:** `apps/api/src/barber/entities/barber.entity.ts`,
`apps/api/sql/barber-profile-updated-at.sql` (جدید),
`apps/api/src/public-page/public-page.service.ts` (+ spec),
`apps/web/app/sitemap.ts`, `app/sitemap.test.ts` (جدید)

**راه‌حل:** ستون `updated_at` روی `barber_profile` + بازگشت به `created_at` برای
ردیف‌های قدیمی؛ مسیر idempotent در `onModuleInit` برای محیط‌هایی که
`ENABLE_SCHEMA_MUTATIONS=1` دارند. صفحه‌های ثابت از ثابتِ دستی
`STATIC_CONTENT_UPDATED_AT` استفاده می‌کنند (**هرگز `now()` در هر درخواست**).
یک sitemap واحد (بدون index) و `/providers` اضافه شد.

**تأیید:** ۶ تست sitemap (شامل «مسیر خصوصی نباشد»، «آدرس عددی نباشد»، «API خراب
sitemap را خالی نکند»)؛ XML واقعی: ۱۳ URL با `lastmod`، از جمله
`/provider/roya → 2026-11-09T10:00:00.000Z` از `updated_at`.

---

### P2-5 — صفحهٔ عمومی `/providers`

**فایل‌ها:** `apps/api/src/barber/barber.service.ts`
(`findPublicCards`), `public-page.service.ts` (`getDirectoryPage`),
`public-page.controller.ts` (`GET /public-page/directory/page`),
`apps/web/services/features/public-page/types.ts`,
`components/marketing/providers/provider-card.tsx` (جدید),
`app/(marketing)/providers/page.tsx` (جدید), `lib/site-config.ts`,
`lib/public-cache.ts`

**راه‌حل:** ISR ۳۰۰ ثانیه، فقط آرایشگرهای تأییدشده/نمایش‌عمومی که خدمت فعال
دارند (همان منبع `getActiveDirectory()` که sitemap استفاده می‌کند → بدون لینک
مرده)، صفحه‌بندی با canonical خودارجاع و عنوان یکتا برای هر صفحه، JSON-LD
(`CollectionPage` + `BreadcrumbList` + `ItemList`)، متن معرفی فارسی، کارت‌های
دسترس‌پذیر (`a` + `aria`)، حالت خالی، و **صفر دادهٔ خصوصی** (تلفن/ایمیل/کد
ملی/وضعیت پکیج در payload نیست — تایپ فقط فیلدهای عمومی دارد).

**تأیید:** `/providers` → ۲۰۰، `/providers?page=2` → ۲۰۰ با
`canonical=/providers?page=2` و عنوان «— صفحهٔ ۲»؛ کارت‌ها به
`/provider/roya` و `/provider/omidftmii` لینک می‌دهند.

---

### P2-6 — لینک‌سازی داخلی

**راه‌حل:** `/providers` در ناوبری و فوتر (`marketing-links.tsx`), CTAهای
`/online-provider-booking`, هیرو/کارت‌های صفحهٔ اصلی، و ۴ نقطهٔ دیگر که
کاربر ناشناس را به `/panel/explore` (دیوار ورود) می‌فرستادند به `/providers`
تغییر کردند. صفحهٔ مقاله یک CTA واقعی به `/providers` دارد. breadcrumb پروفایل
گام میانی `/providers` گرفت (هم دیداری، هم JSON-LD).

**باربر اسلایدر داخل مقاله:** بلوک `barberSlider` از قبل در ادیتور و رندر
وجود دارد؛ **نمی‌توانم محتوای مقاله را جعل کنم**، پس درج آن در مقاله‌ها یک
کار تحریریه است (بخش B).

**تأیید:** grep کل مخزن: هیچ CTA ناشناسی به `/panel/explore` باقی نمانده.

---

### P2-7 — تفکیک قصد صفحهٔ اصلی vs `/online-provider-booking`

**وضعیت:** عنوان/توضیح/OG صفحهٔ اصلی به «نرم افزار مدیریت آرایشگاه و نوبت‌دهی
آنلاین» تغییر کرد و با `title.default` لایوت همراستا شد؛ `/online-provider-booking`
عنوان «رزرو آنلاین آرایشگاه | نوبت دهی اینترنتی» را نگه می‌دارد.
**H1 صفحهٔ اصلی عمداً دست نخورد**، چون تغییر آن یک تصمیم جایگاه‌یابی است نه
اصلاح فنی. فرضِ پیش‌فرض («صفحهٔ اصلی = مالکان سالن») با شواهد فعلی متناقض است
(H1 دو مخاطبی، CTAهای هم‌زمان به provider-signup و رزرو) — بخش B.

---

### P2-8 — دادهٔ ساختاریافتهٔ پروفایل

**ریشهٔ ایراد:** همهٔ پروفایل‌ها `HairSalon` اعلام می‌شدند — حتی سالن میکاپ و
ناخن‌کاری. `HairSalon` تعهدِ معنایی «آرایشگاه مو» است.

**فایل:** `app/(public-barber)/provider/[id]/page.tsx`

**راه‌حل:**

- نوع: `HealthAndBeautyBusiness` — والدِ درستِ `HairSalon`/`BeautySalon` که
  برای همهٔ حرفه‌های زیبایی صادق است. (دستهٔ کسب‌وکار در مدل داده وجود ندارد؛
  `activityType` مخاطبِ جنسیتی است نه نوع خدمات — انتخاب نوعِ دقیق‌تر تصمیم
  کسب‌وکار است، بخش B.)
- `@id` یکتا (`#business`)، `image` از کاور + نمونه‌کارهای **واقعی**،
  `priceRange` فقط از قیمت خدمات واقعی، `address` فقط از فیلدهای پر،
  `aggregateRating` از امتیاز و تعداد نظرِ نمایش‌داده‌شده.
- `openingHoursSpecification` و `geo` **اضافه نشدند**: دادهٔ ساختاریافتهٔ
  ساعت کاری و مختصات در دسترس/قابل‌نمایش نیست (جعل ممنوع).
- `description` تکراری‌زدایی شد (قبلاً «مراغه، خیابان اصلی، مراغه، آذربایجان
  شرقی» تولید می‌شد).

**تأیید:** JSON-LD استخراج‌شده از HTML بیلد production (بخش D).

---

### P2-9 — سیاست کیفیت ایندکس پروفایل (پیاده‌سازی، پیش‌فرض خاموش)

**فایل‌ها:** `apps/web/lib/profile-quality.ts` (+ test)،
`app/(public-barber)/provider/[id]/page.tsx`, `app/sitemap.ts`,
`apps/api/src/public-page/public-page.service.ts` (سیگنال کیفیت)

**راه‌حل:** آستانهٔ قابل‌تنظیم (بیو ≥ ۶۰ کاراکتر **و** ≥ ۱ نمونه‌کار)،
`PROFILE_QUALITY_GATE=1` برای فعال‌سازی. پروفایل زیر آستانه: قابل مشاهده،
قابل رزرو، `noindex,follow`، و حذف از sitemap — با **همان تابع** در هر دو جا
تا هرگز ناهماهنگ نشوند. هیچ تغییری در شرایط تجاری/قیمت‌گذاری ایجاد نشد.
پیش‌فرض **خاموش** است؛ فعال‌سازیِ سراسری منتظر شمارش واقعی است (بخش B).

**تأیید:** ۸ تست واحد (رفتار خاموش/روشن/دادهٔ نامعتبر) + ۱ تست sitemap
(حذف پروفایل زیر آستانه وقتی گیت روشن است).

---

## B. باقی‌مانده و مسدودها

### تصمیم‌های کسب‌وکار (نیازمند تأیید مالک)

| #   | موضوع                                 | وضعیت                                                                                         |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| F-1 | آیا کشفِ آرایشگر برای مهمان مجاز است؟ | **انجام شد** (`/providers` ساخته شد)؛ اگر مدل کسب‌وکار مخالف است، همان یک مسیر باید بسته شود. |
| F-2 | مخاطب صفحهٔ اصلی: مالک سالن یا مشتری؟ | H1 دو مخاطبی است. عنوان/توضیح به سمت مالک سالن رفت؛ **H1 دست نخورد**. نیاز به تصمیم.          |
| F-3 | صفحه‌های خدمات (میکاپ، کاشت ناخن…)    | ساخته نشد — بدون تأیید ممنوع.                                                                 |
| F-4 | صفحه‌های شهر/استان (حد نصاب موجودی)   | ساخته نشد؛ `/cities/*` به ۴۱۰ بازنشسته شد.                                                    |
| F-5 | آستانهٔ ایندکس پروفایل                | پیاده‌سازی شد، **خاموش**.                                                                     |
| F-6 | ایندکس‌شدن صفحهٔ ثبت‌نام              | دست نخورد (خارج از دامنه).                                                                    |
| F-7 | سئو در مقابل paywall پروفایل          | دست نخورد.                                                                                    |
| F-8 | استفادهٔ خارجی از `/barber/`          | ۳۰۱ حفظ شد؛ نیاز به بررسی بک‌لینک‌ها/شبکه‌های اجتماعی.                                        |
| F-9 | تضعیف گیت آنالیتیکس                   | انجام شد (۳ ثانیه برای GA روی عمومی).                                                         |

### دسترسی خارجی / اعتبارنامهٔ مالک

- **GSC:** توکن تأیید + ثبت sitemap (نقطهٔ اتصال آماده است؛ بخش A/P1-5).
- **GA4 DebugView:** نیازمند مرورگر واقعی روی دامنه.
- **CrUX/PSI/Lighthouse:** در این محیط در دسترس نیست؛ هیچ عدد سرعت ادعا نمی‌شود.
- **`www.monshiim.ir`:** مشاهده شد که محتوای یکسان با URLهای apex سرو می‌کند؛
  اینکه ۳۰۱ است یا محتوای تکراریِ ۲۰۰ **تأیید نشد** (دسترسی شبکه نبود).
  تصمیم canonical برای www نیاز به بررسی DNS/سرور دارد.

### مسدودکننده‌های فنی

- **شمارش پروفایل‌های تحت تأثیر P2-9** بدون دسترسی به DB ممکن نیست. کوئری
  آمادهٔ اجرا توسط مالک:
  ```sql
  SELECT COUNT(*) AS affected
  FROM barber_profile
  WHERE slug IS NOT NULL AND slug <> ''
    AND is_approved = 1 AND is_publicly_visible = 1
    AND (CHAR_LENGTH(TRIM(COALESCE(bio, ''))) < 60
         OR portfolio_images IS NULL OR portfolio_images = '');
  ```
  (پیش از اجرا نام ستون‌ها را با `SHOW COLUMNS FROM barber_profile` تأیید کنید.)
  تا وقتی این عدد را نداریم، گیت روشن نمی‌شود.
- **درج `barberSlider` در مقاله‌ها:** محتوا در DB است؛ تولید محتوا وظیفهٔ
  تحریریه است، نه کد.
- **بازبینی SERP واقعی:** بدون دسترسی به مونشیم ممکن نیست.

---

## C. فایل‌های تغییر‌یافته

**جدید (۱۵):**
`apps/web/lib/route-access.ts` + `.test.ts` · `apps/web/lib/profile-quality.ts`

- `.test.ts` · `apps/web/lib/analytics.ts` + `.test.ts` · `apps/web/lib/seo.test.ts`
  · `apps/web/app/not-found.tsx` · `apps/web/app/(marketing)/error.tsx` ·
  `apps/web/app/(marketing)/providers/page.tsx` ·
  `apps/web/components/marketing/providers/provider-card.tsx` ·
  `apps/web/components/public-barber/profile-view-tracker.tsx` ·
  `apps/web/app/cities/[[...rest]]/route.ts` · `apps/web/app/sitemap.test.ts` ·
  `apps/api/sql/barber-profile-updated-at.sql`

**تغییر‌یافته (۴۲):**

- **مسیر/دسترسی:** `apps/web/proxy.ts`, `lib/auth.ts`, `providers/auth.provider.tsx`
- **SEO/متادیتا:** `app/layout.tsx`, `app/sitemap.ts`, `app/robots.ts`,
  `lib/seo.ts`, `lib/site-config.ts`, `app/deposit/[token]/page.tsx`,
  `app/(marketing)/page.tsx`, `.../online-provider-booking/page.tsx`
- **پروفایل/فهرست:** `app/(public-barber)/provider/[id]/page.tsx`,
  `.../not-found.tsx`, `services/features/public-page/types.ts`,
  `lib/images`… (بدون تغییر)
- **بلاگ:** `lib/blog/server.ts`, `app/(marketing)/blog/page.tsx`,
  `app/(marketing)/blog/[slug]/page.tsx`
- **کش/وبهوک:** `lib/public-cache.ts`, `lib/public-cache-tags.ts`,
  `app/api/revalidate/route.ts`
- **آنالیتیکس:** `components/analytics/AnalyticsGate.tsx`,
  `services/features/auth/hooks.ts`, `services/features/booking/hooks.ts`,
  `components/public-barber/booking-gate.tsx`, `booking-auth-dialog.tsx`,
  `app/(dashboard)/dashboard/public-page/page.tsx`,
  `app/(panel)/panel/payment/callback/page.tsx`
- **لینک‌سازی:** `components/marketing/layout/marketing-links.tsx`,
  `components/marketing/home/*` (۳ فایل)
- **بک‌اند:** `src/public-page/public-page.service.ts` (+spec),
  `public-page.controller.ts`, `src/barber/barber.service.ts`,
  `entities/barber.entity.ts`, `barber-visibility-schema.spec.ts`,
  `src/blog/blog.service.ts`, `blog.module.ts`,
  `src/common/services/frontend-revalidation.service.ts`
- **پیکربندی:** `apps/web/.env.example`, `apps/web/package.json` (فهرست تست‌ها)

---

## D. نتایج واقعی تست‌ها

| بررسی       | دستور                         | نتیجه                                                   |
| ----------- | ----------------------------- | ------------------------------------------------------- |
| تایپ‌چک وب  | `npx tsc --noEmit` (apps/web) | ✅ صفر خطا                                              |
| لینت وب     | `npx eslint .`                | ✅ ۰ خطا (۱۹ هشدارِ از قبل موجود: `<img>`/`no-console`) |
| تست وب      | `npm run test` (apps/web)     | ✅ **۱۲۹ pass / ۰ fail** (خط پایه: ۹۴)                  |
| تایپ‌چک API | `npx tsc --noEmit` (apps/api) | ✅ صفر خطا                                              |
| لینت API    | `npm run lint`                | ✅ صفر خطا                                              |
| تست API     | `npx jest`                    | ✅ **۴۱۵ pass / ۳ skip / ۰ fail** (۶۵ سوئیت)            |
| بیلد وب     | `npx next build`              | ✅ موفق، ۴۸ صفحه، بدون هشدار                            |

**تست‌های جدید:** `lib/route-access.test.ts` (۹)، `lib/profile-quality.test.ts`
(۸)، `lib/analytics.test.ts` (۶)، `lib/seo.test.ts` (۶)، `app/sitemap.test.ts` (۶).

### ماتریس مسیرها — روی بیلد production (`next start`)

| مسیر                               | کد      | توضیح                              |
| ---------------------------------- | ------- | ---------------------------------- |
| `/`                                | 200     | `index, follow`                    |
| `/providers`                       | 200     | کارت‌ها → `/provider/{slug}`       |
| `/provider/roya`                   | 200     | `index, follow`، JSON-LD کامل      |
| `/provider/omidftmii`              | 200     | پروفایل نازک، همچنان ۲۰۰           |
| `/blog`                            | 200     | ISR                                |
| `/blog/beauty-salon-advertising`   | 200     | `BlogPosting` + `BreadcrumbList`   |
| `/online-provider-booking`         | 200     | `index, follow`                    |
| `/provider-management`             | 200     | `index, follow`                    |
| `/pricing`                         | 200     | `index, follow`                    |
| `/this-page-does-not-exist-123456` | **404** | `noindex` (قبلاً 307→login)        |
| `/explore`                         | **301** | → `/providers`                     |
| `/panel/explore`                   | **307** | → `/login?callbackUrl=…`           |
| `/admin`                           | **307** | → `/login?callbackUrl=…`           |
| `/login`                           | 200     | `noindex, nofollow`                |
| `/deposit/{token}`                 | 200     | `noindex, nofollow`، عنوان تک‌برند |
| `/cities/tabriz/barbers`           | **410** | `noindex, follow`                  |
| `/robots.txt`                      | 200     | `Allow: /` + ۹ Disallow + Sitemap  |
| `/sitemap.xml`                     | 200     | ۱۳ URL با `lastmod`                |

### خروجی sitemap (XML واقعی)

```
https://monshiim.ir                                    2026-11-15
https://monshiim.ir/providers                          2026-11-15
https://monshiim.ir/provider-management                2026-11-15
https://monshiim.ir/online-provider-booking            2026-11-15
https://monshiim.ir/pricing                            2026-11-15
https://monshiim.ir/tutorials                          2026-11-15
https://monshiim.ir/blog                               2026-11-15
https://monshiim.ir/privacy                            2026-11-15
https://monshiim.ir/terms                              2026-11-15
https://monshiim.ir/provider/roya                      2026-11-09T10:00:00.000Z
https://monshiim.ir/provider/omidftmii                 (بدون lastmod در دادهٔ تستی)
https://monshiim.ir/blog/beauty-salon-advertising      2026-11-10T09:30:00.000Z
https://monshiim.ir/blog/wedding-season-booking        2026-10-20T08:00:00.000Z
```

### JSON-LD تأییدشده (استخراج از HTML بیلد)

- **پروفایل:** `ProfilePage` + `HealthAndBeautyBusiness` با `@id`
  `…/provider/roya#business`, `image` (۳ تصویر واقعی)،
  `priceRange: «۷۰۰٬۰۰۰ تا ۳٬۵۰۰٬۰۰۰ تومان»`, `address`, `aggregateRating`,
  `hasOfferCatalog` + `BreadcrumbList` سه‌سطحی.
- **مقاله:** `BlogPosting` با `author`/`publisher` = `#organization`،
  `datePublished`/`dateModified` واقعی، بدون `image` وقتی کاور نیست،
  `BreadcrumbList` سه‌سطحی.
- **`/providers`:** `CollectionPage` + `BreadcrumbList` + `ItemList`.

### آنالیتیکس

- اسکریپت GA/Clarity در **HTML اولیه هیچ صفحه‌ای** نیست (فقط `dns-prefetch`
  از قبل موجود). یعنی بارگذاری واقعاً پس از گیت انجام می‌شود.
- ۶ تست واحد روی پاک‌سازی `page_location` (توکن بیعانه و پارامترهای راز).

> **آنچه تأیید نشده:** DebugView، CrUX، Lighthouse، SERP واقعی، تأیید GSC،
> و رفتار روی `www`. هیچ‌کدام ادعا نمی‌شوند.

---

## E. دستورهای استقرار (اجرا نشده)

```bash
# ۱) ابتدا مهاجرت DB — پیش‌نیاز کد جدید API
mysql -u <user> -p <db> < apps/api/sql/barber-profile-updated-at.sql

# ۲) بک‌اند
pnpm --filter @monshim/api build
# سپس سرویس API را با همان متغیرهای محیطی ری‌استارت کنید:
#   FRONTEND_URL, REVALIDATE_SECRET (همان مقدار در فرانت)

# ۳) فرانت
pnpm --filter web build
# متغیرهای تازه (اختیاری):
#   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<توکن GSC>
#   PROFILE_QUALITY_GATE=          # خالی = خاموش (توصیه‌شده تا شمارش جمعیت)

# ۴) پس از deploy
curl -sI https://monshiim.ir/this-page-does-not-exist-123456 | head -1   # انتظار: 404
curl -sI https://monshiim.ir/explore | head -3                          # انتظار: 301 → /providers
curl -sI https://monshiim.ir/cities/tabriz/barbers | head -1            # انتظار: 410
curl -s https://monshiim.ir/sitemap.xml | head -20
curl -s https://monshiim.ir/provider/<slug> | grep -o '"@type":"[^"]*"'
```

**بازگشت (rollback):** کد قابل برگشت با revert commit است؛ ستون `updated_at`
افزایشی و nullable است و حذف آن لازم نیست.

**تأیید DebugView (پس از deploy):** `GA4 → Admin → DebugView` را باز کنید،
`?debug_mode=1` به URL اضافه کنید و این مسیرها را ببینید:
ثبت‌نام مشتری → `customer_registration_started/completed`؛ انتشار صفحهٔ عمومی →
`provider_profile_published`؛ بازدید پروفایل → `provider_profile_viewed` (فقط
یک‌بار)؛ رزرو → `booking_started` سپس `booking_completed`؛ پرداخت →
`payment_completed`. در همان DebugView مطمئن شوید `page_location` صفحهٔ
`/deposit/...` شکل `/deposit/[token]` دارد.

---

## F. سئو: قبل و بعد

| موضوع                    | قبل                                                     | بعد                                                          |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| URLهای ناموجود           | ۳۰۷ → `/login` (مسدود در robots) = «Page with redirect» | **۴۰۴ واقعی** با صفحهٔ برندشده                               |
| `/explore`               | خصوصی + در sitemap                                      | **۳۰۱** به `/providers`، خارج از sitemap                     |
| `/cities/*`              | ریدایرکت به ورود                                        | **۴۱۰** + `noindex`                                          |
| کشف آرایشگر              | فقط از sitemap؛ CTAها به `/panel/explore`               | **`/providers`** عمومی + لینک از ناوبری/فوتر/صفحهٔ اصلی/بلاگ |
| لینک صفحهٔ سالن در پنل   | `/barber/{slug}` (۳۰۱ اضافه)                            | **`/provider/{slug}`** (بدون ریدایرکت)                       |
| `lastmod` پروفایل        | تاریخ خرید/رزرو                                         | **تاریخ تغییر محتوا** (`updated_at`)                         |
| `lastmod` صفحه‌های ثابت  | نداشت                                                   | تاریخ محتوای دستیِ قابل‌کنترل                                |
| مقاله: کش                | `no-store` + `force-dynamic`                            | **ISR ۳۰۰s + تگ + وبهوک**                                    |
| مقاله: دادهٔ ساختاریافته | هیچ                                                     | **`BlogPosting` + `BreadcrumbList`**                         |
| مقاله: `googleBot`       | از دست می‌رفت                                           | **حفظ می‌شود** (تست رگرسیون)                                 |
| پروفایل: نوع schema      | `HairSalon` برای همه                                    | **`HealthAndBeautyBusiness`** + `@id`, `priceRange`, `image` |
| ترافیک ارگانیک در GA4    | فقط با تعامل شمرده می‌شد                                | **GA4 پس از ۳ ثانیه روی صفحهٔ عمومی**                        |
| رویدادهای تجاری          | هیچ                                                     | **۹ رویداد تایپ‌شده، بدون PII، بدون تکرار**                  |
| نشت توکن پرداخت          | `page_location` خام به GA4                              | **پاک‌سازی‌شده** (`/deposit/[token]`)                        |
| صفحهٔ خطا                | صفحهٔ پیش‌فرض انگلیسی Next                              | **خطای برندشدهٔ فارسی/RTL با ۵۰۰ درست**                      |
| تأیید GSC                | فایل ۰ بایتی                                            | **نقطهٔ اتصال آماده؛ منتظر توکن مالک**                       |

**آنچه عمداً انجام نشد:** صفحهٔ شهر/استان/محله/خدمت، تغییر H1 صفحهٔ اصلی،
تغییر شرایط تجاری، تولید محتوا/نظر/دادهٔ ساختاریافتهٔ ساختگی، ایندکس کردن هر
صفحهٔ خصوصی.
