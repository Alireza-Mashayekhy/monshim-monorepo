import { CheckCircle2, Clock, XCircle } from 'lucide-react';

import type {
  BarberReview,
  ReviewEligibilityReason,
} from '@/services/features/barber/types';

export function MyReviewStatusBadge({ review }: { review: BarberReview }) {
  if (review.status === 'pending') {
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-700 leading-6"
      >
        <Clock size={15} className="mt-0.5 shrink-0" />
        <span>نظر شما ثبت شد و پس از تایید ادمین نمایش داده می‌شود.</span>
      </div>
    );
  }
  if (review.status === 'rejected') {
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-600 leading-6"
      >
        <XCircle size={15} className="mt-0.5 shrink-0" />
        <span>
          متأسفانه نظر شما تایید نشد.
          {review.adminNote ? ` (دلیل: ${review.adminNote})` : ''}
        </span>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-2xl border border-green-200 bg-green-50 p-3.5 text-xs text-green-700 leading-6"
    >
      <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
      <span>نظر شما تایید شد و در لیست نظرات نمایش داده می‌شود.</span>
    </div>
  );
}

export function ReviewEligibilityMessage({
  reason,
}: {
  reason?: ReviewEligibilityReason;
}) {
  if (reason === 'OWN_PROFILE') return null;
  const text =
    reason === 'BOOKING_NOT_COMPLETED_YET'
      ? 'شما نوبت رزروشده در این سالن دارید؛ پس از انجام نوبت می‌توانید نظر و امتیاز خود را ثبت کنید.'
      : 'امکان ثبت نظر فقط برای مشتریانی فعال است که نوبتشان در این آرایشگاه انجام شده باشد.';
  return (
    <p className="rounded-2xl border border-primary/15 bg-primary-2/40 p-3.5 text-xs leading-6 text-gray-600">
      {text}
    </p>
  );
}
