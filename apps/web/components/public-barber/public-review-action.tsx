'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { RateBarberDialog } from '@/components/pages/barber/rate-barber-dialog';
import {
  MyReviewStatusBadge,
  ReviewEligibilityMessage,
} from '@/components/pages/barber/review-status';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api-error';
import { authKeys } from '@/lib/auth';
import { fetchMe } from '@/services/features/auth/api';
import { useCurrentUser } from '@/services/features/auth/hooks';
import { getMyBarberReview } from '@/services/features/barber/api';
import { useMyBarberReview } from '@/services/features/barber/hooks';

import BookingAuthDialog from './booking-auth-dialog';

export function PublicReviewAction({
  barberId,
  barberName,
}: {
  barberId: number | string;
  barberName: string;
}) {
  const queryClient = useQueryClient();
  const {
    user,
    isLoading: userLoading,
    isError: userError,
    refetch: refetchUser,
  } = useCurrentUser();
  const { data, isLoading, isError, refetch } = useMyBarberReview(
    barberId,
    Boolean(user),
  );
  const [authOpen, setAuthOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const afterLogin = async () => {
    setAuthOpen(false);
    setChecking(true);
    try {
      // Login synchronizes the shared session cache. Verify it again in case
      // that synchronization encountered a transient error, then fetch a fresh
      // eligibility result before opening the rating dialog.
      const session = await queryClient.fetchQuery({
        queryKey: authKeys.me,
        queryFn: ({ signal }) => fetchMe(signal),
        staleTime: 0,
        retry: false,
      });
      if (!session.data) throw new Error('Session unavailable');
      const result = await queryClient.fetchQuery({
        queryKey: ['my-barber-review', barberId],
        queryFn: () => getMyBarberReview(barberId),
        staleTime: 0,
        retry: false,
      });
      if (result.data.canReview) setRateOpen(true);
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          'بررسی امکان ثبت نظر انجام نشد. دوباره تلاش کنید.',
        ),
      );
    } finally {
      setChecking(false);
    }
  };

  const info = data?.data;
  return (
    <div className="mt-4 space-y-3">
      {userLoading || checking || (user && isLoading) ? (
        <p className="text-xs text-gray-500" role="status">
          در حال بررسی امکان ثبت نظر...
        </p>
      ) : userError ? (
        <div className="text-xs text-gray-600">
          بررسی حساب انجام نشد.{' '}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => void refetchUser()}
          >
            تلاش دوباره
          </button>
        </div>
      ) : !user ? (
        <Button onClick={() => setAuthOpen(true)}>
          <Star size={16} />
          ثبت نظر
        </Button>
      ) : isError ? (
        <div className="text-xs text-gray-600">
          بررسی امکان ثبت نظر انجام نشد.{' '}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => void refetch()}
          >
            تلاش دوباره
          </button>
        </div>
      ) : info?.myReview ? (
        <MyReviewStatusBadge review={info.myReview} />
      ) : info?.canReview ? (
        <Button onClick={() => setRateOpen(true)}>
          <Star size={16} />
          ثبت نظر و امتیاز
        </Button>
      ) : info ? (
        <ReviewEligibilityMessage reason={info.eligibilityReason} />
      ) : null}
      {authOpen && (
        <BookingAuthDialog
          open={authOpen}
          onOpenChange={setAuthOpen}
          salonName={barberName}
          purpose="review"
          onComplete={() => void afterLogin()}
        />
      )}
      <RateBarberDialog
        barberId={barberId}
        barberName={barberName}
        open={rateOpen}
        onOpenChange={setRateOpen}
      />
    </div>
  );
}
