import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

import { PublicPageService } from './public-page.service';

/**
 * ابزار ادمین برای **تکمیل دورهٔ رایگان یک‌ماههٔ صفحهٔ اختصاصی** آرایشگرهایی
 * که پیش از افزوده‌شدن این قابلیت ثبت‌نام کرده‌اند.
 *
 * چرا لازم است؟
 * مسیر اعطا در `registerBarber` است؛ کاربرانِ قدیمی‌تر هیچ ردیف اشتراکی
 * ندارند و صفحهٔ اختصاصی‌شان غیرفعال می‌ماند، در حالی که قاعدهٔ کسب‌وکار
 * («هر ثبت‌نام = یک ماه رایگان») شامل آن‌ها هم می‌شود.
 *
 * این عملیات:
 *   • فقط آرایشگرهایی را برمی‌دارد که **هیچ** اشتراک `public_page` ندارند؛
 *   • idempotent است (اجرای دوباره چیزی نمی‌سازد)؛
 *   • با `dryRun=true` فقط می‌شمارد و هیچ ردیفی نمی‌نویسد.
 *
 * خروجی: `{ candidates, granted, failed, dryRun }`
 */
@ApiTags('PublicPage')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/public-page')
export class PublicPageAdminController {
  constructor(private readonly publicPageService: PublicPageService) {}

  /** فقط شمارش (بدون نوشتن) — برای بررسی پیش از اجرا. */
  @Get('free-trial-backfill/preview')
  previewBackfill() {
    return this.publicPageService.backfillFreePublicPageTrial({
      dryRun: true,
    });
  }

  /** اجرای واقعیِ تکمیل دورهٔ رایگان. */
  @Post('free-trial-backfill')
  backfill(@Body() body?: { dryRun?: boolean }) {
    return this.publicPageService.backfillFreePublicPageTrial({
      dryRun: Boolean(body?.dryRun),
    });
  }
}
