// src/barber/barber.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { isAllowedSlotIntervalMinutes } from 'src/booking/slot-intervals';
import {
  IMAGE_MAX_SIZE_BYTES,
  MAX_BARBER_PORTFOLIO_IMAGES,
} from 'src/common/constants/constants';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { toEnglishDigits, toPersianDigits } from 'src/common/utils/digits.util';
import { FilesService } from 'src/files/files.service';
import { Repository } from 'typeorm';

import { BarberService } from './barber.service';
import { BarberQueryDto } from './dto/barber-query.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { BarberProfile } from './entities/barber.entity';
import { WorkHoursService } from './work-hours.service';

@Controller('barber')
export class BarberController {
  constructor(
    private readonly barberService: BarberService,
    private readonly filesService: FilesService,
    private readonly workHoursService: WorkHoursService,
    @InjectRepository(BarberProfile)
    private barberProfileRepo: Repository<BarberProfile>,
  ) {}

  @Get('public-directory')
  getPublicDirectory() {
    return this.barberService.getPublicDirectory();
  }

  @Get('public/cities/:slug')
  getPublicCity(@Param('slug') slug: string) {
    return this.barberService.findPublicCityBySlug(slug);
  }

  // ---- مسیرهای عمومی ----
  /**
   * فهرست عمومی سالن‌ها.
   *
   * ⚠️ فیلترها **فقط** از `@Query() query` خوانده می‌شوند.
   *
   * قبلاً همین پارامترها دوباره با `@Query('cityId')` و… گرفته و روی مقادیر
   * DTO ترجیح داده می‌شدند. دو مشکل داشت:
   *   ۱. منبع حقیقت دوگانه بود و اعتبارسنجی DTO دور زده می‌شد.
   *   ۲. هر پارامتری که در DTO اعلام نشده بود (مثل `gender`) با
   *      `forbidNonWhitelisted` خطای «property gender should not exist»
   *      می‌داد و کل فهرست برای کاربر عادی بارگذاری نمی‌شد.
   * حالا `gender` در `BarberQueryDto` اعلام و اعتبارسنجی می‌شود و تنها منبع
   * ورودی، همان DTO است.
   */
  @Get()
  findAll(@Req() req: any, @Query() query: BarberQueryDto) {
    return this.barberService.findAll(query, {
      cityId: query.cityId,
      provinceId: query.provinceId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
      /**
       * اولویت: جنسیت کاربر احراز‌هویت‌شده.
       *
       * این endpoint عمومی است و `AuthGuard` ندارد؛ اگر کاربری توکن معتبر
       * کوکی داشته باشد، `req.user` پر می‌شود. وقتی جنسیت کاربر معلوم است،
       * نباید با پارامتر آدرس قابل دور زدن باشد (فهرست همیشه متناسب با
       * جنسیت خودِ کاربر نمایش داده می‌شود). برای کاربر مهمان، پارامتر
       * اعتبارسنجی‌شدهٔ `gender` اعمال می‌شود.
       */
      gender: req.user?.gender ?? query.gender ?? null,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const numericId = Number(toEnglishDigits(id));
    if (!Number.isInteger(numericId) || numericId < 1) {
      throw new NotFoundException('آرایشگاه یافت نشد');
    }
    return this.barberService.findPublicOne(numericId);
  }

  // ---- مسیرهای مربوط به پروفایل کاربر جاری ----
  @Get('profile/me')
  @UseGuards(AuthGuard)
  getMyProfile(@Req() req: any) {
    const user = req.user;
    return this.barberService.findOneByUserId(user.id);
  }

  @Patch('profile/me')
  @UseGuards(AuthGuard)
  updateMyProfile(@Req() req: any, @Body() dto: UpdateBarberDto) {
    const user = req.user;
    return this.barberService.update(user.id, dto);
  }

  @Post('profile/image')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: IMAGE_MAX_SIZE_BYTES },
    }),
  )
  async uploadProfileImage(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = req.user;
    if (!file) {
      throw new BadRequestException('فایل تصویر ارسال نشده است');
    }

    // ذخیره فایل در پوشه profiles
    const imagePath = await this.filesService.saveFile(file, 'profiles');

    /**
     * اگر به‌روزرسانی پروفایل شکست بخورد، فایل تازه باید پاک شود؛ وگرنه هر
     * تلاش ناموفق یک فایل یتیم روی دیسک باقی می‌گذارد (با هزینهٔ فضا و
     * بدون هیچ ارجاعی در دیتابیس).
     */
    try {
      const updatedProfile = await this.barberService.update(user.id, {
        profileImage: imagePath,
      });

      return {
        imageUrl: imagePath,
        pendingStatus: updatedProfile.pendingStatus,
      };
    } catch (error) {
      this.filesService.deleteFiles([imagePath]);
      throw error;
    }
  }

  @Patch('profile/portfolio')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('portfolio', MAX_BARBER_PORTFOLIO_IMAGES, {
      storage: memoryStorage(),
      limits: {
        fileSize: IMAGE_MAX_SIZE_BYTES,
        files: MAX_BARBER_PORTFOLIO_IMAGES,
      },
    }),
  )
  async updatePortfolioImages(
    @Req() req: any,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('existingImages') existingImagesJson: string,
  ) {
    const user = req.user;
    const profile = await this.barberProfileRepo.findOne({
      where: { userId: user.id },
    });
    if (!profile) {
      throw new NotFoundException('پروفایل آرایشگر یافت نشد');
    }

    if (typeof existingImagesJson !== 'string') {
      throw new BadRequestException('فهرست عکس‌های حفظ‌شده نامعتبر است');
    }

    let existingImages: unknown;
    try {
      existingImages = JSON.parse(existingImagesJson);
    } catch {
      throw new BadRequestException('فهرست عکس‌های حفظ‌شده نامعتبر است');
    }

    if (
      !Array.isArray(existingImages) ||
      existingImages.some(image => typeof image !== 'string')
    ) {
      throw new BadRequestException('فهرست عکس‌های حفظ‌شده نامعتبر است');
    }

    const liveImages = profile.portfolioImages ?? [];
    const draftImages = profile.pendingChanges?.portfolioImages ?? [];
    const allowedImages = new Set([...liveImages, ...draftImages]);
    const keptImages = existingImages as string[];
    const uploadedFiles = files ?? [];

    if (
      new Set(keptImages).size !== keptImages.length ||
      keptImages.some(image => !allowedImages.has(image))
    ) {
      throw new BadRequestException(
        'نمی‌توان عکس‌های متعلق به پروفایل دیگر را نگه داشت',
      );
    }

    /**
     * سقف تعداد، بر اساس «تعداد نهایی» سنجیده می‌شود، نه مجموع حفظ‌شده‌ها و
     * فایل‌های تازه.
     *
     * چرا؟ کاربر باید بتواند عکس‌های قبلی را حذف و عکس جدید اضافه کند (یعنی
     * «جایگزینی»). با شرط قبلی (`kept + uploaded <= 5`) وقتی ۵ عکس داشت و
     * یکی را حذف می‌کرد، باز هم نمی‌توانست عکس جدید بفرستد؛ در حالی که
     * پروفایل هرگز بیشتر از ۵ عکس نمی‌گرفت. حالا فقط نتیجهٔ نهایی مهم است.
     */
    if (
      keptImages.length + uploadedFiles.length >
      MAX_BARBER_PORTFOLIO_IMAGES
    ) {
      throw new BadRequestException(
        `حداکثر ${MAX_BARBER_PORTFOLIO_IMAGES} نمونه‌کار مجاز است؛ ` +
          `${keptImages.length} عکس حفظ شده و ${uploadedFiles.length} فایل جدید ارسال شده است`,
      );
    }

    const uploadedPaths: string[] = [];

    try {
      /**
       * هر فایل جداگانه ذخیره و خطایش به همان فایل نسبت داده می‌شود.
       * پیام خطا نام فایل را می‌آورد تا کاربر بداند «کدام» عکس مشکل داشته؛
       * بدون افشای مسیر داخلی سرور یا stack trace.
       */
      for (const [index, file] of uploadedFiles.entries()) {
        try {
          uploadedPaths.push(
            await this.filesService.saveFile(file, 'portfolio'),
          );
        } catch (error) {
          // شمارهٔ فایل با ارقام فارسی نوشته می‌شود تا با بقیهٔ پیام‌های
          // کاربرپسند سایت یک‌دست باشد.
          const fileLabel =
            uploadedFiles.length > 1
              ? `فایل شماره ${toPersianDigits(index + 1)}: `
              : '';
          throw new BadRequestException(
            `${fileLabel}${
              error instanceof Error && error.message
                ? error.message
                : 'فایل ارسالی معتبر نیست'
            }`,
          );
        }
      }

      /**
       * اگر همان لحظه عکسی توسط آرایشگر از تب دیگری حذف شده باشد
       * (`allowedImages` قدیمی شده باشد)، `updatePortfolioImages` خطای
       * «پروفایل یافت نشد»/ناسازگاری می‌دهد. در آن حالت فایل‌های تازه پاک
       * می‌شوند تا فایل یتیم نمانند.
       */
      const nextImages = [...keptImages, ...uploadedPaths];
      const updatedProfile = await this.barberService.updatePortfolioImages(
        user.id,
        nextImages,
      );

      return {
        message: 'نمونه‌کارها با موفقیت به‌روزرسانی شدند',
        data: updatedProfile,
      };
    } catch (error) {
      this.filesService.deleteFiles(uploadedPaths);
      throw error;
    }
  }

  @Post('profile/work-hours')
  @UseGuards(AuthGuard)
  async setWorkHours(
    @Req() req: any,
    @Body()
    dto: {
      hours: { dayOfWeek: number; startTime: string; endTime: string }[];
      slotIntervalMinutes?: number;
    },
  ) {
    const user = req.user;

    // پیدا کردن پروفایل آرایشگر بر اساس userId
    const profile = await this.barberProfileRepo.findOne({
      where: { userId: user.id },
    });
    if (!profile) {
      throw new NotFoundException('پروفایل آرایشگر یافت نشد');
    }

    if (!dto.hours || !Array.isArray(dto.hours)) {
      throw new BadRequestException('فیلد hours باید یک آرایه باشد');
    }

    if (dto.slotIntervalMinutes !== undefined) {
      const interval = Number(dto.slotIntervalMinutes);
      if (!isAllowedSlotIntervalMinutes(interval)) {
        throw new BadRequestException(
          'بازه زمانی رزرو باید یکی از مقادیر ۱۵، ۳۰، ۴۵ یا ۶۰ دقیقه باشد',
        );
      }
      profile.slotIntervalMinutes = interval;
      await this.barberProfileRepo.save(profile);
    }

    // ارسال profile.id (UUID) به سرویس
    return this.workHoursService.setWorkHours(profile.id, dto.hours);
  }

  @Get('profile/work-hours')
  @UseGuards(AuthGuard)
  async getWorkHours(@Req() req: any) {
    const user = req.user;

    const profile = await this.barberProfileRepo.findOne({
      where: { userId: user.id },
    });
    if (!profile) {
      throw new NotFoundException('پروفایل آرایشگر یافت نشد');
    }

    return this.workHoursService.getWorkHours(profile.id);
  }

  // دریافت کد معرف کاربر
  @Get('profile/referral-code')
  @UseGuards(AuthGuard)
  async getMyReferralCode(@Req() req: any) {
    const user = req.user;
    const referralInfo = await this.barberService.getReferralInfo(user.id);
    return {
      message: 'کد معرف با موفقیت دریافت شد',
      data: referralInfo,
    };
  }
}
