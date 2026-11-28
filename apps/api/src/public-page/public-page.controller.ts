import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

import { UpdatePublicPageSlugDto } from './dto/update-public-page-slug.dto';
import { ValidatePublicPageDiscountDto } from './dto/validate-public-page-discount.dto';
import { PublicPageService } from './public-page.service';

/**
 * «صفحهٔ عمومی آرایشگاه» — پروفایل سئوشده با آدرس `/provider/[slug]` در فرانت.
 *
 * این کنترلر مستقل است تا منطقِ فعال‌سازی (خرید پکیج یا حد نصاب رزروهای موفق
 * پرداخت‌شده در درگاه) با بقیهٔ مسیرهای آرایشگر قاطی نشود:
 *   • `GET /public-page/directory`         → آرایشگرهای فعالِ دارای اسلاگ (مبنای sitemap)
 *   • `GET /public-page/barber/:identifier` → پروفایل عمومی بر اساس اسلاگ؛ در غیر این صورت ۴۰۴
 *   • `GET /public-page/me`                → وضعیت صفحهٔ عمومیِ آرایشگرِ جاری
 *   • `GET /public-page/plans`             → پلن‌های خرید/تمدید اشتراک پروفایل اختصاصی
 *   • `GET /public-page/slug/check`        → بررسی معتبر و غیرتکراری بودن اسلاگ
 *   • `PATCH /public-page/me/slug`         → ثبت **یک‌بارهٔ** اسلاگ صفحهٔ عمومی (غیرقابل تغییر)
 */
@ApiTags('PublicPage')
@Controller('public-page')
export class PublicPageController {
  constructor(private readonly publicPageService: PublicPageService) {}

  @Get('directory')
  getDirectory() {
    return this.publicPageService.getActiveDirectory();
  }

  /**
   * صفحه‌بندی‌شدهٔ فهرست عمومی آرایشگاه‌ها (`/providers` در فرانت) — بدون
   * نیاز به ورود، فقط پروفایل‌های تأییدشده/فعال/دارای اسلاگ و حداقل یک خدمت
   * فعال. رشتهٔ جست‌وجو عمداً پذیرفته نمی‌شود تا سطح حمله و هزینهٔ کوئری
   * حداقل بماند.
   */
  @Get('directory/page')
  getDirectoryPage(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.publicPageService.getDirectoryPage(
      Number(page) || 1,
      Number(perPage) || 12,
    );
  }

  @Get('barber/:identifier')
  getPublicBarberPage(@Param('identifier') identifier: string) {
    return this.publicPageService.getPublicBarberPage(identifier);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Barber, Role.Admin)
  @Get('me')
  getMyStatus(@Req() req: any) {
    return this.publicPageService.getStatusByUserId(req.user.id);
  }

  /**
   * پلن‌های قابل انتخاب برای خرید/تمدید پروفایل اختصاصی.
   *
   * قیمت‌ها از بک‌اند می‌آیند و فرانت فقط نمایش می‌دهد؛ مقدار نهایی پرداخت
   * هم در بک‌اند از همین پلن محاسبه می‌شود.
   */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Barber, Role.Admin)
  @Get('plans')
  getPublicPagePlans() {
    return this.publicPageService.getPublicPagePlans();
  }

  /**
   * استعلام/اعتبارسنجی کد تخفیف برای یک پلنِ مشخص.
   *
   * فقط `code`/`target`/`planId` از کلاینت می‌آید؛ قیمتِ واقعیِ پلن، مبلغ
   * تخفیف و شرط‌های سقف استفاده همگی در بک‌اند (از دیتابیس) محاسبه می‌شوند.
   * کاربر هم از JWT خوانده می‌شود تا «سقف هر کاربر» درست سنجیده شود.
   */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Barber, Role.Admin)
  @Post('discount/quote')
  quoteDiscount(@Req() req: any, @Body() dto: ValidatePublicPageDiscountDto) {
    return this.publicPageService.getDiscountQuote({
      userId: req.user.id,
      code: dto.code,
      target: dto.target,
      planId: dto.planId,
    });
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Barber, Role.Admin)
  @Get('slug/check')
  checkSlugAvailability(@Req() req: any, @Query('slug') slug = '') {
    return this.publicPageService.checkSlugAvailability(req.user.id, slug);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Barber, Role.Admin)
  @Patch('me/slug')
  updateMySlug(@Req() req: any, @Body() dto: UpdatePublicPageSlugDto) {
    return this.publicPageService.updateSlugByUserId(req.user.id, dto.slug);
  }
}
