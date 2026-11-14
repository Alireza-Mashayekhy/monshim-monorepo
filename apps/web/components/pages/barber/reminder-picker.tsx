'use client';

import { BellRing } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { REMINDER_HOUR_CHOICES } from '@/lib/reminder';
import { cn } from '@/lib/utils';

interface ReminderPickerProps {
  enabled: boolean;
  hours: number | null;
  /** گزینه‌هایی که زمان ارسالشان هنوز نگذشته است */
  availableHours: number[];
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onHoursChange: (hours: number) => void;
}

/**
 * انتخاب پیامک یادآوری توسط مشتری هنگام رزرو — همان الگوی فرم «نوبت دستی»
 * در داشبورد آرایشگر (سوییچ + انتخاب «چند ساعت قبل»).
 */
export function ReminderPicker({
  enabled,
  hours,
  availableHours,
  disabled,
  onEnabledChange,
  onHoursChange,
}: ReminderPickerProps) {
  const noneAvailable = availableHours.length === 0;

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-2/60 text-primary">
            <BellRing size={18} aria-hidden />
          </div>

          <div className="min-w-0">
            <p id="reminder-picker-label" className="font-bold text-gray-900">
              پیامک یادآوری
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {noneAvailable
                ? 'زمان این نوبت برای ارسال یادآوری خیلی نزدیک است'
                : 'قبل از نوبت برایتان پیامک می‌فرستیم — رایگان'}
            </p>
          </div>
        </div>

        <Switch
          aria-labelledby="reminder-picker-label"
          checked={enabled && !noneAvailable}
          disabled={disabled || noneAvailable}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && !noneAvailable && (
        <div className="mt-4 space-y-2.5 border-t border-gray-100 pt-4">
          <p className="text-sm font-bold text-gray-600">
            یادآوری چند ساعت قبل ارسال شود؟
          </p>

          <div
            role="radiogroup"
            aria-label="زمان ارسال یادآوری"
            className="grid grid-cols-3 gap-2"
          >
            {REMINDER_HOUR_CHOICES.map(choice => {
              const selected = hours === choice.value;
              const available = availableHours.includes(choice.value);

              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled || !available}
                  onClick={() => onHoursChange(choice.value)}
                  className={cn(
                    'h-11 rounded-xl border text-sm font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    selected
                      ? 'border-primary bg-primary-2 text-primary'
                      : available
                        ? 'border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary'
                        : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300',
                  )}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>

          {hours === null && (
            <p className="text-xs text-amber-700">
              زمان ارسال یادآوری را انتخاب کنید.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
