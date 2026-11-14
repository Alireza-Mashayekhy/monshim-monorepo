/** گزینه‌های «چند ساعت قبل» برای پیامک یادآوری نوبت (هم‌سو با بک‌اند) */
export const REMINDER_HOUR_CHOICES: readonly {
  value: number;
  label: string;
}[] = [
  { value: 1, label: '۱ ساعت قبل' },
  { value: 2, label: '۲ ساعت قبل' },
  { value: 4, label: '۴ ساعت قبل' },
  { value: 6, label: '۶ ساعت قبل' },
  { value: 12, label: '۱۲ ساعت قبل' },
  { value: 24, label: '۱ روز قبل' },
];

/**
 * آیا زمان ارسالِ یادآوری (نوبت منهای `hours`) هنوز نرسیده است؟
 *
 * ساعت نوبت به وقت تهران (‎+03:30، بدون تغییر ساعت تابستانی) تفسیر می‌شود تا
 * نتیجه به منطقهٔ زمانی دستگاه کاربر وابسته نباشد. ورودی نامعتبر «قابل
 * انتخاب» حساب می‌شود تا گزینه‌ها بی‌دلیل قفل نشوند.
 */
export function isReminderInFuture(
  dateISO: string,
  time: string,
  hours: number,
  now: number = Date.now(),
): boolean {
  const day = dateISO.slice(0, 10);
  const [h = '', m = ''] = time.split(':');
  const start = Date.parse(
    `${day}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00+03:30`,
  );

  if (Number.isNaN(start)) return true;

  return start - hours * 3_600_000 > now;
}
