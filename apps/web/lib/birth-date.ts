import { toEnglishDigits } from '@/lib/digits';
import { FA_MONTHS, jalaliMonthLength, toFa } from '@/lib/jalali';

export type BirthDate = { year: number; month: number; day: number };
export const DEFAULT_BIRTH_DATE: BirthDate = { year: 1375, month: 1, day: 1 };

export function parseBirthDate(value: unknown): BirthDate | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(toEnglishDigits(value));
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y),
    month = Number(m),
    day = Number(d);
  if (year < 1 || year > 3177 || month < 1 || month > 12 || day < 1)
    return null;
  try {
    if (day > jalaliMonthLength(year, month)) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

export function changeBirthDate(
  date: BirthDate,
  change: Partial<BirthDate>,
): BirthDate {
  const next = { ...date, ...change };
  return {
    ...next,
    day: Math.min(next.day, jalaliMonthLength(next.year, next.month)),
  };
}

export function serializeBirthDate({ year, month, day }: BirthDate): string {
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

export function formatBirthDate(value: unknown): string {
  const date = parseBirthDate(value);
  return date
    ? `${toFa(date.day)} ${FA_MONTHS[date.month - 1]} ${toFa(date.year)}`
    : '';
}
