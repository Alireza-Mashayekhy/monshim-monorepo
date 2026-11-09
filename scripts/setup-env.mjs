#!/usr/bin/env node
/**
 * ساخت فایل‌های env توسعهٔ محلی.
 *
 * چرا این اسکریپت وجود دارد؟
 * `.env` و `.env.local` در گیت نیستند (درست است — نباید باشند)، پس بعد از
 * clone هیچ‌کدام وجود ندارند و `pnpm dev` با خطاهای گمراه‌کننده می‌ایستد:
 *   • بک‌اند: `ECONNREFUSED` روی دیتابیس، یا بدتر: بدون `NODE_ENV` مقدار
 *     `synchronize` روشن می‌شود.
 *   • فرانت: `NEXT_PUBLIC_API_URL` خالی → همهٔ درخواست‌ها به `undefined` می‌رود.
 * کپی کردن دستی `.env.example` هم دو تله دارد: آن فایل برای **production**
 * نوشته شده (`NODE_ENV=production` و `PORT=3000`)، در حالی که فرانت در توسعه
 * API را روی **۴۰۰۰** می‌خواهد و Next خودش ۳۰۰۰ را می‌گیرد.
 *
 * این اسکریپت همان دو فایل را با مقادیر **درستِ توسعه** می‌سازد و
 * سکرت‌های تصادفی تولید می‌کند. روی فایل‌های موجود دست نمی‌گذارد.
 *
 *   pnpm setup           # فقط اگر فایل نباشد می‌سازد
 *   pnpm setup --force   # بازنویسی
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FORCE = process.argv.includes('--force');

const API_ENV = path.join(ROOT, 'apps/api/.env');
const WEB_ENV = path.join(ROOT, 'apps/web/.env.local');

const secret = () => randomBytes(48).toString('hex');
/** یک سکرت مشترک برای وبهوک پاک‌سازی کش فرانت/بک‌اند. */
const REVALIDATE_SECRET = secret();

const API_TEMPLATE = `# ============================================================================
# env توسعهٔ محلی بک‌اند — ساخته‌شده با \`pnpm setup\`
# ============================================================================
# این فایل در گیت نیست (در .gitignore هست) و برای اجرای لوکال است.
# برای production از apps/api/.env.example استفاده کنید (PORT=3000، NODE_ENV=production).
#
# اگر پورت‌های زیر را عوض کردید، همان‌ها را در apps/web/.env.local
# (API_PROXY_TARGET و API_URL) هم عوض کنید.
# ============================================================================

# development ≠ production:
#   • synchronize روشن می‌شود → جدول‌ها خودشان ساخته می‌شوند (نیاز به SQL دستی نیست)
#   • Swagger روی /api/docs فعال می‌شود
# هرگز این را روی سرور محصول نگذارید.
NODE_ENV=development

# ⚠️ ۴۰۰۰، نه ۳۰۰۰: در توسعه Next خودش روی ۳۰۰۰ است.
PORT=4000
APP_VERSION=dev

# --- MySQL (همان چیزی که \`pnpm db:up\` بالا می‌آورد) ---
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3307
DATABASE_USERNAME=root
DATABASE_PASSWORD=root
DATABASE_NAME=monshim

# --- Redis (همان \`pnpm db:up\`) ---
# بدون Redis سرویس در بوت با خطای اتصال متوقف می‌شود.
REDIS_HOST=127.0.0.1
REDIS_PORT=6381

# --- احراز هویت ---
JWT_ACCESS_SECRET=${secret()}
JWT_REFRESH_SECRET=${secret()}

# کد OTP ثابت برای تست محلی. روی سرور محصول باید خالی باشد.
OTP_UNIVERSAL_CODE=123456

# --- آدرس‌ها ---
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:4000
TRUST_PROXY=false
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

# --- سرویس‌های بیرونی: در توسعه خاموش/شبیه‌سازی‌شده ---
# true = درگاه پرداخت شبیه‌سازی می‌شود و پول واقعی جابه‌جا نمی‌شود.
ZIBAL_MOCK=true
ZOHAL_MOCK=true
SMS_IR_API_KEY=
SMS_IR_TEMPLATE_ID=
BALE_ENABLED=false
BALE_BOT_TOKEN=
BALE_CHAT_ID=

# --- پاک‌سازی on-demand کش فرانت ---
# باید با همین مقدار در apps/web/.env.local یکی باشد.
REVALIDATE_SECRET=${REVALIDATE_SECRET}

# --- فایل‌های آپلودی ---
# خالی = uploads/ داخل apps/api (در گیت نیست).
UPLOAD_DIR=
`;

const WEB_TEMPLATE = `# ============================================================================
# env توسعهٔ محلی فرانت — ساخته‌شده با \`pnpm setup\`
# ============================================================================
# Next این فایل را خودکار می‌خواند. در گیت نیست.
# الگوی production: apps/web/.env.example
# ============================================================================

# مرورگر: نسبی، تا درخواست‌ها از خود فرانت پروکسی شوند (کوکی یکسان می‌ماند).
NEXT_PUBLIC_API_URL=/api

# پروکسی Next در توسعه: /api و /uploads را به بک‌اند می‌فرستد.
# باید همان PORT بک‌اند باشد (پیش‌فرض ۴۰۰۰).
API_PROXY_TARGET=http://127.0.0.1:4000

# fetchهای سمت سرورِ Next (SSR). آدرس نسبی برای آن‌ها کار نمی‌کند.
API_URL=http://127.0.0.1:4000/api

# خالی = تصاویر از /uploads روی همین دامنه (پروکسی) خوانده می‌شوند.
NEXT_PUBLIC_IMAGE_URL=

# باید با همین مقدار در apps/api/.env یکی باشد.
REVALIDATE_SECRET=${REVALIDATE_SECRET}

# هماهنگ با سقف آپلود بک‌اند.
NEXT_PUBLIC_BLOG_IMAGE_MAX_MB=5
NEXT_PUBLIC_BLOG_VIDEO_MAX_MB=50
`;

function writeEnv(file, template, label) {
  const exists = existsSync(file);
  const relative = path.relative(ROOT, file);

  if (exists && !FORCE) {
    console.log(`• ${relative} از قبل هست — دست نخورد (برای بازنویسی: pnpm setup --force)`);

    const content = readFileSync(file, 'utf8');
    if (/^\s*NODE_ENV\s*=\s*production\s*$/m.test(content)) {
      console.warn(
        `  ⚠️  ${relative} روی NODE_ENV=production ست شده است.\n` +
          '      برای اجرای محلی این خطا نیست ولی رفتار production می‌گیرید\n' +
          '      (synchronize خاموش، Swagger خاموش). توصیه: NODE_ENV=development.',
      );
    }
    if (/^\s*PORT\s*=\s*3000\s*$/m.test(content) && label === 'api') {
      console.warn(
        `  ⚠️  ${relative}: PORT=3000 است، ولی Next در توسعه هم ۳۰۰۰ را می‌گیرد.\n` +
          '      PORT=4000 بگذارید و API_PROXY_TARGET/API_URL فرانت را همان کنید.',
      );
    }
    return false;
  }

  writeFileSync(file, template, 'utf8');
  console.log(`✓ ${relative} ${exists ? 'بازنویسی شد' : 'ساخته شد'}`);
  return true;
}

console.log('\n🔧 آماده‌سازی env توسعهٔ محلی Monshim\n');

const apiWritten = writeEnv(API_ENV, API_TEMPLATE, 'api');
const webWritten = writeEnv(WEB_ENV, WEB_TEMPLATE, 'web');

if (apiWritten && webWritten) {
  console.log(
    '\n✅ هر دو فایل ساخته شدند.\n' +
      '   اگر بین دو فایل سکرت REVALIDATE_SECRET فرق کرد، یکی را از دیگری کپی کنید.\n',
  );
}

console.log(
  'قدم‌های بعدی:\n' +
    '  1) pnpm db:up      # MySQL روی 3307 و Redis روی 6381 (Docker لازم است)\n' +
    '  2) pnpm dev        # بک‌اند روی 4000، فرانت روی 3000\n' +
    '  3) pnpm doctor     # اگر چیزی بالا نیامد، اول این را اجرا کنید\n',
);
