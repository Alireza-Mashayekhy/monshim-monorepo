// src/referral/referral.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BarberProfile } from 'src/barber/entities/barber.entity';
import { PublicPageService } from 'src/public-page/public-page.service';
import { WalletService } from 'src/wallet/wallet.service';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Referral, ReferralStatus } from './entities/referral.entity';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  /** حد نصاب رزروهای موفقِ پرداخت‌شده برای دریافت پاداش (شرط «یا» با خرید صفحه) */
  private readonly REQUIRED_BOOKINGS = 30;
  private readonly REWARD_AMOUNT = 300_000; // تومان

  constructor(
    @InjectRepository(Referral)
    private referralRepo: Repository<Referral>,
    @InjectRepository(BarberProfile)
    private barberProfileRepo: Repository<BarberProfile>,
    private readonly publicPageService: PublicPageService,
    private readonly dataSource: DataSource,
    private walletService: WalletService,
  ) {}

  /** ثبت دعوت هنگام ثبت‌نام آرایشگر جدید با کد معرف */
  async createReferral(
    referrerUserId: number,
    referredUserId: number,
    manager?: EntityManager,
  ): Promise<Referral | null> {
    const barberProfileRepo = manager
      ? manager.getRepository(BarberProfile)
      : this.barberProfileRepo;
    const referralRepo = manager
      ? manager.getRepository(Referral)
      : this.referralRepo;

    const referrerProfile = await barberProfileRepo.findOne({
      where: { userId: referrerUserId },
    });
    const referredProfile = await barberProfileRepo.findOne({
      where: { userId: referredUserId },
    });

    if (!referrerProfile || !referredProfile) {
      this.logger.warn(
        `Could not create referral: referrer=${referrerUserId}, referred=${referredUserId}`,
      );
      return null;
    }

    const existing = await referralRepo.findOne({
      where: {
        referrerProfileId: referrerProfile.id,
        referredProfileId: referredProfile.id,
      },
    });
    if (existing) return existing;

    const referral = referralRepo.create({
      referrerUserId,
      referredUserId,
      referrerProfileId: referrerProfile.id,
      referredProfileId: referredProfile.id,
      status: ReferralStatus.PENDING,
      completedBookingsCount: 0,
    });

    return referralRepo.save(referral);
  }

  /**
   * شرط پاداش دعوت — **روی آرایشگر دعوت‌شده** سنجیده می‌شود، نه دعوت‌کننده.
   *
   * قاعدهٔ محصول: «وقتی کسی را با کد معرفم دعوت می‌کنم، آن شخص باید ۳۰ رزرو
   * موفقِ پرداخت‌شده داشته باشد یا صفحهٔ اختصاصی بخرد تا ۳۰۰٬۰۰۰ تومان به من
   * داده شود.»
   *
   * پیاده‌سازی قبلی به‌جای این، شمارش رزروها و خرید صفحه را برای
   * **دعوت‌کننده** انجام می‌داد؛ نتیجه این بود که دعوت‌کننده با ۳۰ رزرو خودش
   * یا با خرید صفحهٔ خودش، پاداش هر دعوت را می‌گرفت، در حالی که دعوت‌شده
   * هیچ کاری نکرده بود. (پاداش حتی بلافاصله پس از ثبت‌نام، از طریق
   * `onReferralCreated`، واریز می‌شد.)
   */

  /** رزروهای موفقِ پرداخت‌شدهٔ یک **آرایشگر دعوت‌شده** (بر اساس پروفایل او). */
  private countReferredPaidBookings(referral: Referral) {
    return this.publicPageService.countSuccessfulPaidBookings(
      referral.referredProfileId,
    );
  }

  /** آیا **آرایشگر دعوت‌شده** صفحهٔ اختصاصی خریده است؟ */
  private hasReferredPurchasedPage(referral: Referral) {
    return this.publicPageService.hasPurchasedPackageByUserId(
      referral.referredUserId,
    );
  }

  /**
   * فراخوانی پس از تکمیل رزرو یا پرداخت موفق رزروِ یک آرایشگر.
   *
   * `barberProfileId` پروفایل همان آرایشگری است که رزرو/پرداخت برایش انجام
   * شده. اگر او با کد معرفی ثبت‌نام کرده باشد، دعوتِ مربوط به خودش ارزیابی
   * می‌شود؛ پاداش به **دعوت‌کنندهٔ** او تعلق می‌گیرد.
   */
  async onReferredBookingActivity(barberProfileId: string): Promise<void> {
    try {
      const referrals = await this.referralRepo.find({
        where: {
          referredProfileId: barberProfileId,
          status: ReferralStatus.PENDING,
        },
      });
      if (referrals.length === 0) return;

      const [paidBookingsCount, hasPurchasedPage] = await Promise.all([
        this.countReferredPaidBookings(referrals[0]),
        this.hasReferredPurchasedPage(referrals[0]),
      ]);
      await this.updateProgressAndAward(
        referrals,
        paidBookingsCount,
        hasPurchasedPage,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update referral progress for referred barber profile ${barberProfileId}: ${String(error)}`,
      );
    }
  }

  /**
   * ارزیابی دعوت‌های در انتظارِ یک **آرایشگر دعوت‌شده**، بلافاصله پس از
   * برقراری/بروزرسانی دعوت.
   *
   * لازم است چون دعوت‌شده ممکن است پیش از این لحظه، یکی از دو شرط (۳۰ رزرو
   * موفق یا خرید صفحهٔ اختصاصی) را محقق کرده باشد و پاداش نباید تا فعالیت
   * بعدی‌اش معلق بماند.
   */
  async onReferredProgress(referredUserId: number): Promise<void> {
    try {
      const referrals = await this.referralRepo.find({
        where: { referredUserId, status: ReferralStatus.PENDING },
      });
      if (referrals.length === 0) return;

      const [paidBookingsCount, hasPurchasedPage] = await Promise.all([
        this.countReferredPaidBookings(referrals[0]),
        this.hasReferredPurchasedPage(referrals[0]),
      ]);
      await this.updateProgressAndAward(
        referrals,
        paidBookingsCount,
        hasPurchasedPage,
      );
    } catch (error) {
      this.logger.error(
        `Failed to evaluate referrals after activity for referred user ${referredUserId}: ${String(error)}`,
      );
    }
  }

  /**
   * پس از خرید صفحهٔ اختصاصی توسط یک **آرایشگر دعوت‌شده**: دعوت او ارزیابی
   * می‌شود تا پاداش به معرفش واریز شود (شرط دوم).
   */
  async onReferredPublicPagePurchased(referredUserId: number): Promise<void> {
    try {
      const referrals = await this.referralRepo.find({
        where: { referredUserId, status: ReferralStatus.PENDING },
      });
      if (referrals.length === 0) return;

      const paidBookingsCount = await this.countReferredPaidBookings(
        referrals[0],
      );
      await this.updateProgressAndAward(referrals, paidBookingsCount, true);
    } catch (error) {
      this.logger.error(
        `Failed to award referral after public page purchase by referred user ${referredUserId}: ${String(error)}`,
      );
    }
  }

  /**
   * به‌روزرسانی پیشرفت و واریز پاداش.
   *
   * `paidBookingsCount` و `hasPurchasedPage` هر دو مربوط به **آرایشگر
   * دعوت‌شده** هستند. پاداش فقط زمانی واریز می‌شود که یکی از دو شرط محقق
   * شده باشد؛ در غیر این صورت فقط شمارندهٔ پیشرفت ذخیره می‌شود.
   */
  private async updateProgressAndAward(
    referrals: Referral[],
    paidBookingsCount: number,
    hasPurchasedPage: boolean,
  ) {
    const isEligible =
      paidBookingsCount >= this.REQUIRED_BOOKINGS || hasPurchasedPage;

    for (const referral of referrals) {
      referral.completedBookingsCount = paidBookingsCount;

      if (isEligible && !referral.rewardPaid) {
        await this.awardReward(referral);
      } else {
        await this.referralRepo.save(referral);
      }
    }
  }

  /** واریز پاداش به کیف پول دعوت‌کننده */
  private async awardReward(referral: Referral): Promise<void> {
    try {
      await this.dataSource.transaction(async manager => {
        const referralRepo = manager.getRepository(Referral);
        const lockedReferral = await referralRepo.findOne({
          where: { id: referral.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !lockedReferral ||
          lockedReferral.rewardPaid ||
          lockedReferral.status !== ReferralStatus.PENDING
        ) {
          return;
        }

        await this.walletService.depositOnceWithManager(manager, {
          userId: lockedReferral.referrerUserId,
          amount: this.REWARD_AMOUNT,
          description:
            'پاداش دعوت آرایشگر - ۳۰ رزرو موفق یا خرید صفحهٔ اختصاصی توسط آرایشگر دعوت‌شده',
          paymentId: `referral-${lockedReferral.id}`,
          legacyReference: lockedReferral.id,
        });

        lockedReferral.status = ReferralStatus.COMPLETED;
        lockedReferral.rewardPaid = true;
        await referralRepo.save(lockedReferral);
      });

      this.logger.log(
        `Referral reward of ${this.REWARD_AMOUNT} Tomans awarded to user ${referral.referrerUserId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to award referral reward to user ${referral.referrerUserId}: ${error.message}`,
      );
    }
  }

  /** دریافت دعوت‌های آرایشگر و وضعیت تحقق شرایط پاداش */
  async getMyReferrals(userId: number) {
    const profile = await this.barberProfileRepo.findOne({ where: { userId } });

    if (!profile) {
      return {
        referrals: [],
        stats: { total: 0, completed: 0, pending: 0 },
        eligibility: {
          completedPaidBookingsCount: 0,
          requiredPaidBookings: this.REQUIRED_BOOKINGS,
          hasPurchasedPublicPage: false,
          isEligible: false,
        },
      };
    }

    const referrals = await this.referralRepo.find({
      where: { referrerProfileId: profile.id },
      relations: { referredProfile: { user: true } },
      order: { createdAt: 'DESC' },
    });

    /**
     * پیشرفت هر دعوت بر اساس فعالیت **آرایشگر دعوت‌شدهٔ همان دعوت** سنجیده
     * می‌شود (نه فعالیت خودِ دعوت‌کننده). برای سازگاری با قرارداد قبلی،
     * `eligibility` وضعیت «بهترین» دعوت را نشان می‌دهد: بیشترین رزرو موفق و
     * اینکه هر کدام از دعوت‌شده‌ها صفحهٔ اختصاصی خریده باشد.
     */
    const referredProgress = await Promise.all(
      referrals.map(async referral => {
        const [paidBookings, purchasedPage] = await Promise.all([
          this.countReferredPaidBookings(referral),
          this.hasReferredPurchasedPage(referral),
        ]);
        return { referralId: referral.id, paidBookings, purchasedPage };
      }),
    );
    const completedPaidBookingsCount = referredProgress.reduce(
      (max, item) => Math.max(max, item.paidBookings),
      0,
    );
    const hasPurchasedPublicPage = referredProgress.some(
      item => item.purchasedPage,
    );

    const paidRewards = referrals.filter(r => r.rewardPaid).length;

    const stats = {
      total: referrals.length,
      completed: referrals.filter(r => r.status === ReferralStatus.COMPLETED)
        .length,
      pending: referrals.filter(r => r.status === ReferralStatus.PENDING)
        .length,
    };

    return {
      referrals: referrals.map(r => {
        const progress = referredProgress.find(p => p.referralId === r.id);

        return {
          id: r.id,
          referredUserId: r.referredUserId,
          referredFullName: r.referredProfile?.user?.fullName ?? null,
          referredSalonName: r.referredProfile?.salonName ?? null,
          status: r.status,
          // پیشرفتِ همین دعوت = رزروهای موفقِ همان آرایشگر دعوت‌شده.
          completedBookingsCount: progress?.paidBookings ?? 0,
          hasPurchasedPublicPage: progress?.purchasedPage ?? false,
          rewardPaid: r.rewardPaid,
          createdAt: r.createdAt,
        };
      }),
      stats,
      eligibility: {
        completedPaidBookingsCount,
        requiredPaidBookings: this.REQUIRED_BOOKINGS,
        hasPurchasedPublicPage,
        /**
         * شرط «یا»: تحقق یکی از دو مسیر (۳۰ رزرو موفق یا خرید صفحه) **توسط
         * آرایشگر دعوت‌شده**.
         */
        isEligible:
          completedPaidBookingsCount >= this.REQUIRED_BOOKINGS ||
          hasPurchasedPublicPage,
        /** مبلغ پاداش هر دعوت (تومان) */
        rewardAmount: this.REWARD_AMOUNT,
        /** جمع پاداش‌های واریزشده تا این لحظه */
        paidRewardAmount: paidRewards * this.REWARD_AMOUNT,
        /**
         * جمع پاداش‌هایی که هنوز واریز نشده‌اند (منتظر تحقق شرط توسط
         * آرایشگر دعوت‌شده). همیشه:
         * paidRewardAmount + unpaidRewardAmount = total * rewardAmount
         */
        unpaidRewardAmount:
          (referrals.length - paidRewards) * this.REWARD_AMOUNT,
      },
    };
  }

  /** بررسی ثبت‌نام با کد معرف */
  async isAlreadyReferred(referredUserId: number): Promise<boolean> {
    return (await this.referralRepo.count({ where: { referredUserId } })) > 0;
  }
}
