import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BookingStatus } from 'src/booking/entities/booking.entity';

import { BarberReviewService } from './barber-review.service';
import { BarberReviewStatus } from './entities/barber-review.entity';

describe('barber review eligibility', () => {
  const profile = { id: 'profile-1', userId: 11 };
  const review = {
    id: 'review-1',
    barberId: profile.id,
    customerId: 22,
    rating: 5,
    comment: null,
    status: BarberReviewStatus.REJECTED,
    adminNote: 'دلیل رد',
    createdAt: new Date(),
    reviewedAt: new Date(),
  };
  function setup(statuses: BookingStatus[] = [], existing: unknown = null) {
    const profiles = { findOne: jest.fn().mockResolvedValue(profile) };
    const reviews = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn(value => value),
      save: jest.fn(async value => ({ ...value, id: 'new-review' })),
    };
    const bookings = {
      count: jest.fn(
        async ({ where }) =>
          statuses.filter(status => where.status.value.includes(status)).length,
      ),
    };
    const service = new BarberReviewService(
      reviews as never,
      profiles as never,
      bookings as never,
    );
    return { service, profiles, reviews, bookings };
  }

  it.each([BookingStatus.PENDING, BookingStatus.CONFIRMED])(
    'reports unfinished booking (%s) and disallows POST',
    async status => {
      const { service, bookings, reviews } = setup([status]);
      expect((await service.getMyReviewForBarber(22, 11)).data).toMatchObject({
        canReview: false,
        myReview: null,
        eligibilityReason: 'BOOKING_NOT_COMPLETED_YET',
      });
      await expect(
        service.create(22, 11, { rating: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reviews.save).not.toHaveBeenCalled();
      for (const [args] of bookings.count.mock.calls)
        expect(args.where).toMatchObject({
          customerId: 22,
          barberId: profile.id,
        });
    },
  );

  it.each([[[]], [[BookingStatus.CANCELED]], [[BookingStatus.REJECTED]]])(
    'denies bookings that are not completed or active: %p',
    async statuses => {
      const { service } = setup(statuses);
      expect(
        (await service.getMyReviewForBarber(22, 11)).data.eligibilityReason,
      ).toBe('NO_BOOKING');
      await expect(
        service.create(22, 11, { rating: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('permits completed bookings, saves a pending review and applies salon/customer scoping', async () => {
    const { service, bookings, reviews } = setup([
      BookingStatus.COMPLETED,
      BookingStatus.PENDING,
    ]);
    expect((await service.getMyReviewForBarber(22, 11)).data).toMatchObject({
      canReview: true,
      eligibilityReason: 'ELIGIBLE',
    });
    await service.create(22, 11, { rating: 5, comment: ' خوب ' });
    expect(reviews.create).toHaveBeenCalledWith(
      expect.objectContaining({
        barberId: profile.id,
        customerId: 22,
        status: BarberReviewStatus.PENDING,
        comment: 'خوب',
      }),
    );
    for (const [args] of bookings.count.mock.calls)
      expect(args.where).toMatchObject({
        customerId: 22,
        barberId: profile.id,
      });
  });

  it('reports the existing review including the rejected reason and blocks duplicate POST', async () => {
    const { service, bookings } = setup([BookingStatus.COMPLETED], review);
    const result = await service.getMyReviewForBarber(22, 11);
    expect(result.data).toMatchObject({
      canReview: false,
      eligibilityReason: 'ALREADY_REVIEWED',
      myReview: { status: 'rejected', adminNote: 'دلیل رد' },
    });
    expect(bookings.count).not.toHaveBeenCalled();
    await expect(service.create(22, 11, { rating: 5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('never allows the owner to review their own profile', async () => {
    const { service, bookings } = setup([BookingStatus.COMPLETED]);
    expect(
      (await service.getMyReviewForBarber(11, 11)).data.eligibilityReason,
    ).toBe('OWN_PROFILE');
    await expect(service.create(11, 11, { rating: 5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(bookings.count).not.toHaveBeenCalled();
  });
});
