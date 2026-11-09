# Monshim — Monorepo

سامانهٔ رزرو آنلاین و مدیریت سالن (بک‌اند NestJS + فرانت Next.js) در قالب یک
pnpm workspace با Turborepo.

---

## ۱. ساختار

```
.
├── apps/
│   ├── api/            @monshim/api   — NestJS  (توسعه: پورت 4000)
│   └── web/            @monshim/web   — Next.js (توسعه: پورت 3000)
├── packages/
│   ├── contracts/      بردارهای مرجع مشترک (تست هم‌سانی قیمت/متن)
│   ├── eslint-config/  قواعد مشترک ESLint
│   └── tsconfig/       پیکربندی مشترک TypeScript
├── infra/              Dockerfile + docker-compose (توسعه و محصول)
├── scripts/            setup-env · doctor · مولدهای بردار
└── docs/               معماری، ممیزی و راهنمای deploy
```

برای اجرا **فقط از ریشهٔ مخزن** دستور بزنید؛ `pnpm` خودش app مربوطه را پیدا
می‌کند. اجرای `pnpm install` داخل `apps/api` یا `apps/web` اشتباه است.

---

## ۲. پیش‌نیازها

| مورد | نسخه | چرا |
| --- | --- | --- |
| Node.js | **22** (حداقل 20.9) | Next 16 |
| pnpm | **9.15.9** | `packageManager` ریشه؛ با `corepack` خودکار ست می‌شود |
| Docker | هر نسخه‌ای | فقط برای بالا آوردن MySQL و Redis (اختیاری اگر خودتان نصب دارید) |

```bash
node -v          # باید v22.x باشد
corepack enable  # pnpm را از packageManager می‌سازد
pnpm -v          # باید 9.15.9 چاپ شود
```

> اگر `corepack` ندارید: `npm i -g pnpm@9.15.9`

---

## ۳. اجرا در ۵ قدم

```bash
# ۱) نصب وابستگی‌های کل workspace
pnpm install

# ۲) ساخت فایل‌های env توسعه (apps/api/.env و apps/web/.env.local)
#    سکرت‌های JWT تصادفی ساخته می‌شوند و پورت‌ها از قبل درست تنظیم‌اند.
pnpm setup

# ۳) بالا آوردن MySQL (پورت 3307) و Redis (پورت 6381)
pnpm db:up

# ۴) بررسی اینکه همه‌چیز سر جایش است (توصیه می‌شود)
pnpm doctor

# ۵) اجرای هم‌زمان بک‌اند و فرانت
pnpm dev
```

بعد از `pnpm dev`:

| سرویس | آدرس |
| --- | --- |
| فرانت | <http://localhost:3000> |
| بک‌اند | <http://localhost:4000/api> |
| سلامت بک‌اند | <http://localhost:4000/api/health> |
| سلامت کامل (DB + Redis) | <http://localhost:4000/api/health/ready> |
| Swagger (فقط توسعه) | <http://localhost:4000/api/docs> |

نکته‌ها:

- **بدون `pnpm db:up` بالا نمی‌آید.** بک‌اند بدون MySQL و Redis در بوت متوقف
  می‌شود (`ECONNREFUSED`) — این خطا یعنی «دیتابیس نیست»، نه «کد خراب است».
- اولین بار که MySQL بالا می‌آید ۲۰–۳۰ ثانیه طول می‌کشد. `pnpm db:logs` را
  ببینید یا `docker compose -f infra/docker-compose.dev.yml ps` بزنید تا
  `healthy` شود.
- جدول‌های دیتابیس در محیط توسعه **خودکار** ساخته می‌شوند
  (`NODE_ENV=development` → `synchronize`). فایل‌های `apps/api/sql/` فقط برای
  production و تغییرات دستی‌اند.
- داده‌های اولیه (استان/شهر) اختیاری است: `pnpm seed`.

### ۳.۱ اگر Docker ندارید

MySQL 8 و Redis 7 را خودتان نصب کنید و `apps/api/.env` را با آن‌ها هماهنگ کنید:

```ini
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306      # ← پورت MySQL خودتان
DATABASE_USERNAME=root
DATABASE_PASSWORD=...
DATABASE_NAME=monshim
REDIS_HOST=127.0.0.1
REDIS_PORT=6379         # ← پورت Redis خودتان
```

```bash
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS monshim CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

اگر پورت بک‌اند را عوض کردید، `API_PROXY_TARGET` و `API_URL` را در
`apps/web/.env.local` هم عوض کنید (پیش‌فرض `4000`).

---

## ۴. اسکریپت‌ها

| دستور | کار |
| --- | --- |
| `pnpm dev` | هر دو اپ با watch (Turborepo) |
| `pnpm dev:api` / `pnpm dev:web` | فقط یکی از اپ‌ها |
| `pnpm setup` | ساخت `apps/api/.env` و `apps/web/.env.local` (روی فایل موجود دست نمی‌زند؛ `--force` برای بازنویسی) |
| `pnpm doctor` | عیب‌یابی: نسخه‌ها، env، پورت‌ها، MySQL/Redis |
| `pnpm db:up` / `db:down` / `db:logs` | MySQL روی 3307 + Redis روی 6381 |
| `pnpm seed` | درج استان/شهرهای اولیه |
| `pnpm build` | build هر دو اپ (`apps/api/dist/src/main.js` و `apps/web/.next`) |
| `pnpm lint` / `typecheck` / `test` | gateهای کیفیت (همان‌هایی که CI اجرا می‌کند) |
| `pnpm format` | Prettier روی کل مخزن |
| `pnpm --filter @monshim/api start:prod` | اجرای build بک‌اند (`node dist/src/main`) |

---

## ۵. env

| فایل | از کجا | برای |
| --- | --- | --- |
| `apps/api/.env` | `pnpm setup` | توسعهٔ محلی بک‌اند (`NODE_ENV=development`, `PORT=4000`) |
| `apps/api/.env.example` | در گیت | مرجع **production** (`NODE_ENV=production`, `PORT=3000`) |
| `apps/web/.env.local` | `pnpm setup` | توسعهٔ محلی فرانت |

هیچ‌کدام از `.env`/`.env.local` در گیت نیستند (pre-commit hook هم جلوی commit
آن‌ها را می‌گیرد).

سه خطای رایج env:

1. کپی کردن `.env.example` به‌جای `pnpm setup` → `NODE_ENV=production` و
   `PORT=3000`؛ آن‌وقت بک‌اند می‌خواهد روی همان پورتی بنشیند که Next گرفته و
   با `EADDRINUSE` می‌میرد.
2. `API_PROXY_TARGET` فرانت با `PORT` بک‌اند یکی نیست → همهٔ درخواست‌های
   `/api` با `502` برمی‌گردند.
3. `JWT_ACCESS_SECRET` و `JWT_REFRESH_SECRET` خالی یا یکسان.

---

## ۶. عیب‌یابی

اول `pnpm doctor`؛ بیشتر موارد زیر را خودش پیدا می‌کند.

| نشانه | علت رایج | رفع |
| --- | --- | --- |
| `EADDRINUSE :3000` | Next از قبل در حال اجراست (یا نسخهٔ قبلی kill نشده) | `lsof -ti:3000 \| xargs kill -9` |
| `EADDRINUSE :4000` | بک‌اند قبلی باز است | `lsof -ti:4000 \| xargs kill -9` |
| `connect ECONNREFUSED 127.0.0.1:3307` | MySQL بالا نیست | `pnpm db:up` و صبر تا `healthy` |
| `connect ECONNREFUSED 127.0.0.1:6381` | Redis بالا نیست | `pnpm db:up` |
| `Access denied for user 'root'@...` | رمز دیتابیس با `.env` فرق دارد | `docker compose -f infra/docker-compose.dev.yml down -v && pnpm db:up` |
| `Unknown database 'monshim'` | دیتابیس ساخته نشده | `pnpm setup` → `MYSQL_DATABASE=monshim`؛ یا دستی بسازید |
| `ERR_PNPM_LOCKFILE_BREAKING_CHANGE` یا corepack نسخهٔ pnpm ۸ می‌خواهد | نسخهٔ pnpm با `packageManager` ریشه یکی نیست | `corepack enable` و اگر لازم شد `corepack prepare pnpm@9.15.9 --activate` |
| `Cannot find module '@monshim/tsconfig/nest.json'` (با ۱۰۰۰+ خطای decorator) | نصب ناقص workspace | `pnpm install` از **ریشه** |
| `next: not found` بعد از `pnpm install` | نصب از پوشهٔ اپ انجام شده | از ریشه `pnpm install` |
| صفحه بالا می‌آید ولی داده‌ها خالی/`502` است | پروکسی `/api` به بک‌اند نمی‌رسد | `API_PROXY_TARGET` و `PORT` را یکی کنید |
| عکس‌های آپلودی ۴۰۴ | `UPLOAD_DIR`/پروکسی `uploads` | در توسعه `UPLOAD_DIR` خالی بگذارید |
| ورود کار نمی‌کند و کوکی ست نمی‌شود | `FRONTEND_URL`/`CORS_ORIGIN` اشتباه | `FRONTEND_URL=http://localhost:3000`، `CORS_ORIGIN=http://localhost:3000` |
| `Slow filesystem detected` در Next | `.next` روی دیسک کند/شبکه است | نادیده بگیرید یا مخزن را به دیسک محلی ببرید |

---

## ۷. تست و build

```bash
pnpm typecheck   # tsc --noEmit در هر دو اپ
pnpm lint        # ESLint (۰ خطا؛ چند warning از <img> از قبل هست)
pnpm test        # api: 352 تست + web: 54 تست
pnpm build       # Turborepo ترتیب ساخت را رعایت می‌کند
```

`pnpm test` برای بک‌اند به MySQL **وصل نمی‌شود** (همه‌جا mock است) و برای
فرانت بردارهای `packages/contracts` را می‌خواند؛ پس بدون `pnpm db:up` هم
می‌گذرد.

---

## ۸. deploy

راهنمای کامل: [`DEPLOY-CHECKLIST.md`](DEPLOY-CHECKLIST.md) و
[`docs/architecture/`](docs/architecture).

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
```

نکته‌هایی که بعد از monorepo شدن ساختار **حتماً** باید در سرور بررسی شوند:

- `cwd` پروسهٔ PM2 باید `apps/api` باشد (نه `back/`)؛ وگرنه `.env` لود نمی‌شود
  و `NODE_ENV=undefined` یعنی `synchronize=true` روی دیتابیس production.
- مسیر volume آپلود را مطلق کنید: `UPLOADS_HOST_PATH=/var/lib/monshim/uploads`.
- پورت محصول بک‌اند همان `3000` بماند (nginx روی آن تنظیم است). تفاوت
  ۴۰۰۰ فقط مربوط به توسعه است.

---

## ۹. تغییرات اصلاحی این بازبینی

باگ‌هایی که اجرا (نه فقط بازبینی چشمی) پیدا کرد و رفع شد:

| # | مشکل | اثر | رفع |
| --- | --- | --- | --- |
| ۱ | `apps/api` اسکریپت `dev` نداشت | `pnpm dev` فقط فرانت را بالا می‌آورد؛ بک‌اند هیچ‌وقت اجرا نمی‌شد | `"dev": "nest start --watch"` + `dev:api` |
| ۲ | `packageManager: pnpm@8.15.4` داخل `apps/api` | corepack داخل پوشهٔ api نسخهٔ ۸ را دانلود/اجرا می‌کرد و با لاک‌فایل ۹ ناسازگار بود | حذف؛ فقط نسخهٔ ریشه (9.15.9) مرجع است |
| ۳ | `infra/Dockerfile` بسته‌های `workspace:*` را کپی نمی‌کرد | `pnpm install` موفق می‌شد ولی `pnpm build` با ~۱۵۰۰ خطای decorator می‌شکست (`File '@monshim/tsconfig/nest.json' not found` → decoratorها خاموش) | کپی `packages/tsconfig` و `packages/eslint-config` قبل از install |
| ۴ | `docker-compose.dev.yml` فقط Redis داشت | `pnpm db:up` دیتابیس نمی‌آورد | MySQL 8 روی 3307 + Redis روی 6381 با healthcheck |
| ۵ | `.env.example` بک‌اند برای production نوشته شده بود (`NODE_ENV=production`, `PORT=3000`) | کپی ساده‌اش در توسعه باعث `EADDRINUSE` و رفتار production می‌شد | `pnpm setup` فایل‌های توسعه را با مقادیر درست می‌سازد |
| ۶ | `.github/dependabot.yml` به `/back` و `/front` اشاره می‌کرد | Dependabot هیچ PR نمی‌ساخت | یک ورودی روی ریشهٔ workspace |
| ۷ | `pnpm.onlyBuiltDependencies` داخل `apps/web` | pnpm هشدار می‌داد «بی‌اثر است» (native buildها تأیید نمی‌شدند) | به `package.json` ریشه منتقل شد |
| ۸ | اسکریپت‌های `test:e2e`، `format` و `lint` بک‌اند به پوشهٔ `test/` حذف‌شده اشاره می‌کردند | دستورهای شکست‌خورده/گمراه‌کننده | حذف `test:e2e`، محدود کردن globها به `src` |
| ۹ | `apps/api/Dockerfile.dev` از ساختار قبل از monorepo بود | build آن قطعاً شکست می‌خورد | بازنویسی با context ریشه |
