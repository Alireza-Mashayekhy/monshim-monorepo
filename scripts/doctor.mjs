#!/usr/bin/env node
/**
 * `pnpm doctor` — چرا پروژه بالا نمی‌آید؟
 *
 * این اسکریپت هیچ چیزی را عوض نمی‌کند؛ فقط چیزهایی را که «سکوت» می‌کنند
 * بررسی و گزارش می‌کند:
 *   • نسخهٔ Node / pnpm
 *   • وجود فایل‌های env
 *   • پورت‌های بک‌اند و فرانت (اشغال بودن = خطای EADDRINUSE یا پروکسی به سرویس اشتباه)
 *   • MySQL و Redis (اتصال TCP + احراز هویت MySQL)
 *   • Docker (اگر دیتابیس بالا نیست)
 *
 * خروجی: کد ۱ اگر مشکل مسدودکننده‌ای پیدا شود.
 */
import net from 'node:net';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const problems = [];
const warn = message => problems.push(message);

const line = () => console.log('─'.repeat(64));
const ok = text => console.log(`  ✅ ${text}`);
const bad = text => console.log(`  ❌ ${text}`);
const note = text => console.log(`  ⚠️  ${text}`);

/** خواندن سادهٔ .env (بدون پشتیبانی از ${VAR} — برای env این پروژه کافی است). */
function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const text = raw.trim();
    if (!text || text.startsWith('#')) continue;
    const index = text.indexOf('=');
    if (index === -1) continue;
    const key = text.slice(0, index).trim();
    let value = text.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function tcpCheck(host, port, timeout = 1500) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    const finish = result => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, reason: 'timeout' }));
    socket.once('error', error => finish({ ok: false, reason: error.code || error.message }));
  });
}

async function mysqlAuthCheck(apiEnv) {
  try {
    const requireFromApi = createRequire(path.join(ROOT, 'apps/api/package.json'));
    const mysql = requireFromApi('mysql2/promise');
    const connection = await mysql.createConnection({
      host: apiEnv.DATABASE_HOST || '127.0.0.1',
      port: Number(apiEnv.DATABASE_PORT || 3306),
      user: apiEnv.DATABASE_USERNAME || 'root',
      password: apiEnv.DATABASE_PASSWORD ?? '',
      database: apiEnv.DATABASE_NAME || 'monshim',
      connectTimeout: 2500,
    });
    await connection.query('SELECT 1');
    await connection.end();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.code || error.message };
  }
}

/** آیا این پورت روی همین ماشین اشغال است؟ */
function isPortInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error =>
      resolve(error.code === 'EADDRINUSE' ? 'busy' : error.code),
    );
    server.once('listening', () => server.close(() => resolve(null)));
    server.listen(port, '127.0.0.1');
  });
}

async function main() {
  console.log('\n🩺 بررسی سلامت محیط توسعهٔ Monshim\n');

  // ---------------------------------------------------------------- Node/pnpm
  line();
  console.log('Node و pnpm');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeMinor = Number(process.versions.node.split('.')[1]);
  if (nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 9)) {
    ok(`Node ${process.versions.node}`);
  } else {
    bad(`Node ${process.versions.node} — حداقل 20.9 لازم است (Next 16)`);
    warn('Node را به ۲۲ ارتقا دهید (nvm install 22 && nvm use 22).');
  }

  if (existsSync(path.join(ROOT, 'node_modules'))) {
    ok('node_modules ریشه هست');
  } else {
    bad('node_modules نیست — اول `pnpm install` را اجرا کنید');
    warn('pnpm install');
  }

  const pnpmVersion = process.env.npm_config_user_agent?.match(/pnpm\/([\d.]+)/)?.[1];
  ok(pnpmVersion ? `pnpm ${pnpmVersion}` : 'pnpm اجرا شد');

  // ------------------------------------------------------------------ env files
  line();
  console.log('فایل‌های env');
  const API_ENV_FILE = path.join(ROOT, 'apps/api/.env');
  const WEB_ENV_FILE = path.join(ROOT, 'apps/web/.env.local');

  const apiEnvExists = existsSync(API_ENV_FILE);
  const webEnvExists = existsSync(WEB_ENV_FILE);

  apiEnvExists ? ok('apps/api/.env') : bad('apps/api/.env نیست');
  webEnvExists ? ok('apps/web/.env.local') : bad('apps/web/.env.local نیست');
  if (!apiEnvExists || !webEnvExists) {
    warn('`pnpm setup` را اجرا کنید تا هر دو فایل ساخته شوند.');
  }

  const apiEnv = parseEnv(API_ENV_FILE);
  const webEnv = parseEnv(WEB_ENV_FILE);

  if (apiEnvExists) {
    if (apiEnv.NODE_ENV === 'production') {
      note('apps/api/.env روی NODE_ENV=production است (synchronize خاموش، Swagger خاموش)');
      warn('برای توسعه: NODE_ENV=development');
    } else {
      ok(`NODE_ENV=${apiEnv.NODE_ENV || '(خالی → development)'}`);
    }

    if (!apiEnv.JWT_ACCESS_SECRET || !apiEnv.JWT_REFRESH_SECRET) {
      bad('JWT_ACCESS_SECRET / JWT_REFRESH_SECRET خالی است');
      warn('`pnpm setup --force` سکرت تصادفی می‌سازد.');
    } else if (apiEnv.JWT_ACCESS_SECRET === apiEnv.JWT_REFRESH_SECRET) {
      note('JWT_ACCESS_SECRET و JWT_REFRESH_SECRET یکسان‌اند (باید متفاوت باشند)');
    } else {
      ok('سکرت‌های JWT تنظیم شده‌اند');
    }
  }

  // ---------------------------------------------------------------------- ports
  line();
  console.log('پورت‌ها');
  const apiPort = Number(apiEnv.PORT || 4000);
  const webPort = 3000;

  for (const [name, port] of [
    ['بک‌اند', apiPort],
    ['فرانت', webPort],
  ]) {
    const state = await isPortInUse(port);
    if (!state) ok(`${name} (${port}) آزاد است`);
    else if (state === 'busy') {
      note(`${name} (${port}) همین حالا اشغال است — یعنی احتمالاً از قبل در حال اجراست`);
    } else bad(`${name} (${port}): ${state}`);
  }

  if (apiPort === webPort) {
    bad(`بک‌اند و فرانت هر دو روی ${apiPort} هستند — یکی از آن‌ها بالا نمی‌آید`);
    warn('در apps/api/.env مقدار PORT=4000 بگذارید.');
  }

  const proxyTarget = webEnv.API_PROXY_TARGET || '';
  const proxyPort = Number(proxyTarget.replace(/\/+$/, '').split(':').pop());
  if (proxyTarget && proxyPort && proxyPort !== apiPort) {
    bad(`PROXY: فرانت به ${proxyTarget} می‌فرستد ولی بک‌اند روی ${apiPort} است`);
    warn('API_PROXY_TARGET (و API_URL) را در apps/web/.env.local با PORT بک‌اند هماهنگ کنید.');
  } else if (proxyTarget) {
    ok(`پروکسی فرانت → ${proxyTarget}`);
  }

  // ------------------------------------------------------------------- database
  line();
  console.log('MySQL');
  const dbHost = apiEnv.DATABASE_HOST || '127.0.0.1';
  const dbPort = Number(apiEnv.DATABASE_PORT || 3306);
  const dbTcp = await tcpCheck(dbHost, dbPort);

  if (!dbTcp.ok) {
    bad(`${dbHost}:${dbPort} پاسخ نمی‌دهد (${dbTcp.reason})`);
    warn('`pnpm db:up` را اجرا کنید (Docker) یا MySQL/Redis محلی را روی همین پورت‌ها بالا بیاورید.');
    warn('اگر پورت‌های دیگری دارید، DATABASE_PORT/REDIS_PORT را در apps/api/.env عوض کنید.');
  } else {
    ok(`${dbHost}:${dbPort} باز است`);
    const auth = await mysqlAuthCheck(apiEnv);
    if (auth.ok) ok(`ورود به دیتابیس «${apiEnv.DATABASE_NAME}» موفق`);
    else {
      bad(`اتصال TCP برقرار شد ولی ورود/پرس‌وجو شکست خورد: ${auth.reason}`);
      warn('DATABASE_USERNAME/PASSWORD/DATABASE_NAME را در apps/api/.env با کانتینر هماهنگ کنید.');
    }
  }

  line();
  console.log('Redis');
  const redisHost = apiEnv.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(apiEnv.REDIS_PORT || 6379);
  const redisTcp = await tcpCheck(redisHost, redisPort);
  if (redisTcp.ok) ok(`${redisHost}:${redisPort} باز است`);
  else {
    bad(`${redisHost}:${redisPort} پاسخ نمی‌دهد (${redisTcp.reason})`);
    warn('بک‌اند بدون Redis در بوت متوقف می‌شود؛ `pnpm db:up` را اجرا کنید.');
  }

  // --------------------------------------------------------------------- verdict
  line();
  if (problems.length === 0) {
    console.log('\n🎉 همه‌چیز آماده است: `pnpm dev`\n');
    process.exit(0);
  }

  console.log(`\n${problems.length} نکته برای رفع:`);
  for (const [index, problem] of problems.entries()) {
    console.log(`  ${index + 1}. ${problem}`);
  }
  console.log('');
  process.exit(1);
}

main().catch(error => {
  console.error('doctor خودش خطا داد:', error);
  process.exit(1);
});
