'use client';

import { CalendarIcon } from 'lucide-react';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import DatePicker, { DateObject } from 'react-multi-date-picker';

import { Button } from '@/components/ui/button';

/** Same calendar and locale as the shared PersianDatePicker, with an explicit clear action. */
export function DiscountDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <DatePicker
          calendar={persian}
          locale={persian_fa}
          value={
            value
              ? new DateObject({
                  calendar: persian,
                  locale: persian_fa,
                  date: value,
                })
              : null
          }
          onOpenPickNewDate={false}
          calendarPosition="bottom-right"
          onChange={date =>
            onChange(
              date
                ? `${date.year}/${String(date.month.number).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`
                : '',
            )
          }
          render={<CalendarButton label={label} />}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange('')}
          disabled={!value}
          aria-label={`پاک کردن ${label}`}
        >
          پاک کردن
        </Button>
      </div>
    </div>
  );
}

function CalendarButton({
  value,
  openCalendar,
  label,
}: {
  value?: string;
  openCalendar?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={openCalendar}
      aria-label={label}
      aria-haspopup="dialog"
      className="flex h-12 items-center gap-2 rounded-lg border border-input px-3 text-sm hover:border-gray-400"
    >
      <CalendarIcon className="size-4 text-gray-400" />
      {value || 'انتخاب تاریخ'}
    </button>
  );
}
