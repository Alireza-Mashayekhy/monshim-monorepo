<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Local development (monorepo)

این اپ یکی از اعضای pnpm workspace است. **همهٔ دستورهای نصب و اجرا از ریشهٔ
مخزن** زده می‌شوند؛ `pnpm install` داخل `apps/api` اشتباه است.

```bash
# از ریشهٔ مخزن
pnpm install
pnpm setup      # ساخت apps/api/.env با مقادیر توسعه (PORT=4000)
pnpm db:up      # MySQL روی 3307 + Redis روی 6381
pnpm dev        # بک‌اند روی 4000 (watch) + فرانت روی 3000
```

- `ConfigModule` هیچ `envFilePath` ندارد و `.env` را از **`cwd`** می‌خواند؛
  یعنی وقتی Nest از `apps/api` اجرا می‌شود، همین فایل خوانده می‌شود. اگر
  دستی از ریشه اجرایش کنید (`node apps/api/dist/src/main`) env لود نمی‌شود.
- `synchronize` فقط وقتی `NODE_ENV !== 'production'` روشن است. در توسعه
  جدول‌ها خودکار ساخته می‌شوند؛ در production باید `apps/api/sql/` را اجرا
  کنید.
- بدون Redis و MySQL سرویس در بوت متوقف می‌شود (`ECONNREFUSED`)؛ این خطای
  زیرساخت است، نه خطای کد.

### Scripts

| دستور | کار |
| --- | --- |
| `pnpm dev` (ریشه) یا `pnpm --filter @monshim/api dev` | `nest start --watch` |
| `pnpm --filter @monshim/api start:dev` | همان، با `--poll` (برای bind mount/Docker) |
| `pnpm --filter @monshim/api build` | `nest build` → `dist/src/main.js` |
| `pnpm --filter @monshim/api start:prod` | `node dist/src/main` (بعد از build) |
| `pnpm --filter @monshim/api seed` | درج استان/شهرها (`seed.ts`) |
| `pnpm --filter @monshim/api test` | Jest — بدون نیاز به MySQL/Redis |

> تست e2e این اپ در ساختار فعلی وجود ندارد (پوشهٔ `test/` نیست)؛ اسکریپت
> `test:e2e` هم به همین دلیل حذف شد. تست‌های HTTP در `src/**/*http.spec.ts`
> با Jest اجرا می‌شوند.

## Payment redirect URLs (`APP_URL` / `FRONTEND_URL`)

The payment flow builds two public URLs. Both must be **origins only** — no
path, no trailing slash (the code strips them, but keep `.env` clean):

| Variable       | What it is used for                                              | Production example      |
| -------------- | ---------------------------------------------------------------- | ----------------------- |
| `APP_URL`      | `.../api/payment/callback` given to the Zibal gateway             | `https://monshiim.ir`   |
| `FRONTEND_URL` | Where the user is redirected after paying (`/panel/payment/callback`) | `https://monshiim.ir` |

Wrong values produce broken redirects:

- `FRONTEND_URL=http://localhost:3000` → the customer's browser is sent to its
  own machine ("site can't be reached") after payment.
- `FRONTEND_URL=https://monshiim.ir/panel` → `/panel/panel/payment/callback`.
- `APP_URL=https://monshiim.ir/api` → `/api/api/payment/callback` (404).

`src/common/utils/public-url.util.ts` normalizes both values to their origin and,
if a value is missing/invalid, or still points at `localhost` while
`NODE_ENV=production`, falls back to the origin of the incoming request
(`X-Forwarded-Proto` / `X-Forwarded-Host` aware) and logs a one-time warning
`[PaymentService]`. That keeps payments working even with a half-configured
`.env`, but the warning should still be fixed at the source.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
