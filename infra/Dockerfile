# =============================================================================
# ایمیج production بک‌اند Monshim (apps/api)
# =============================================================================
# ساختار: pnpm workspace (monorepo)
#   ریشه    : pnpm-workspace.yaml, pnpm-lock.yaml, package.json
#   اپ      : apps/api
#
# ⚠️ build context باید **ریشهٔ مخزن** باشد، نه `apps/api/`:
#     docker compose -f infra/docker-compose.yml build      (context: ..)
#
# چرا؟ workspace اکنون یک لاک‌فایل واحد در ریشه دارد و `pnpm install
# --frozen-lockfile` باید از ریشه اجرا شود.
#
# ⚠️ وابستگی‌های `workspace:*` (مثل `@monshim/tsconfig`) باید **قبل از**
# `pnpm install` در context باشند، وگرنه pnpm یک symlink شکسته می‌سازد،
# نصب «موفق» به‌نظر می‌رسد و بعد `nest build` با ۱۵۰۰ خطا می‌شکند
# (`File '@monshim/tsconfig/nest.json' not found` → decoratorها خاموش می‌شوند).
# به همین دلیل package.json و محتوای `packages/tsconfig` هم کپی می‌شوند.
#
#  • نسخهٔ pnpm باید با `packageManager` در package.json ریشه یکی باشد
#    (الان pnpm@9.15.9). ناسازگاری → `ERR_PNPM_LOCKFILE_BREAKING_CHANGE`.
#  • `UPLOAD_DIR` صریح تنظیم می‌شود تا آپلودها به `cwd` وابسته نباشند.
#  • تست‌ها این‌جا اجرا نمی‌شوند (نه در CI، نه در ایمیج) — تصویر سبک می‌ماند.
# =============================================================================
FROM node:22-alpine

WORKDIR /app

RUN corepack disable

RUN npm config set registry https://package-mirror.liara.ir/repository/npm/

# باید با "packageManager" در package.json ریشه یکی باشد.
RUN npm install -g pnpm@9.15.9

# ۱. فقط مانیفست‌ها — تا لایهٔ نصب کش شود و با هر تغییر کد بی‌دلیل تکرار نشود
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# ۲. نصب تمام workspace (فقط وابستگی‌های api در عمل استفاده می‌شوند)
RUN pnpm install --frozen-lockfile \
    --registry https://package-mirror.liara.ir/repository/npm/

# ۳. کد اپ + بسته‌های workspace که build به آن‌ها نیاز دارد
COPY packages/tsconfig ./packages/tsconfig
COPY packages/eslint-config ./packages/eslint-config
COPY apps/api ./apps/api

WORKDIR /app/apps/api

RUN pnpm build

EXPOSE 3000

# فایل‌های آپلودی روی volume می‌نشینند (در compose تعریف شده)
ENV UPLOAD_DIR=/backend/uploads

CMD ["pnpm", "start:prod"]
