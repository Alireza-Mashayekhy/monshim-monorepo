import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import { bookingWallTimeToUtc } from 'src/booking/booking-time';

export const DISCOUNT_RANGE_ERROR =
  'تاریخ پایان اعتبار باید بعد از تاریخ شروع باشد';

/** Date-only and timezone-less ISO values are Tehran wall time, never host-local. */
export function parseDiscountDate(
  value: string | null,
  boundary: 'start' | 'end',
): Date | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    !isISO8601(value, { strict: true, strictSeparator: true })
  ) {
    throw new BadRequestException('تاریخ اعتبار کد تخفیف نامعتبر است');
  }
  const local =
    /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(
      value,
    );
  if (local) {
    const time = local[2]
      ? `${local[2]}:${local[3] ?? '00'}`
      : boundary === 'end'
        ? '23:59:59'
        : '00:00:00';
    const instant = bookingWallTimeToUtc(local[1], time);
    if (!instant)
      throw new BadRequestException('تاریخ اعتبار کد تخفیف نامعتبر است');
    if (local[4]) instant.setUTCMilliseconds(Number(local[4].padEnd(3, '0')));
    return instant;
  }
  // Explicit offset or UTC suffix is required for all other datetime forms.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))
    throw new BadRequestException('تاریخ اعتبار کد تخفیف نامعتبر است');
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()))
    throw new BadRequestException('تاریخ اعتبار کد تخفیف نامعتبر است');
  return instant;
}

export function assertDiscountDateRange(
  startsAt: Date | null,
  expiresAt: Date | null,
): void {
  if (startsAt && expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
    throw new BadRequestException(DISCOUNT_RANGE_ERROR);
  }
}
