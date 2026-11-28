'use client';

import { CalendarIcon, XIcon } from 'lucide-react';
import { Dialog } from 'radix-ui';
import * as React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { FieldError } from '@/components/ui/field';
import {
  type BirthDate,
  changeBirthDate,
  DEFAULT_BIRTH_DATE,
  formatBirthDate,
  parseBirthDate,
  serializeBirthDate,
} from '@/lib/birth-date';
import {
  FA_MONTHS,
  gregorianToJalali,
  jalaliMonthLength,
  toFa,
} from '@/lib/jalali';
import { cn } from '@/lib/utils';

const ITEM_HEIGHT = 40;

function Wheel({
  label,
  values,
  value,
  onChange,
  display,
}: {
  label: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
  display: (value: number) => string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const index = Math.max(0, values.indexOf(value));

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (element && Math.round(element.scrollTop / ITEM_HEIGHT) !== index) {
      element.scrollTop = index * ITEM_HEIGHT;
    }
  }, [index]);

  const select = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(values.length - 1, nextIndex));
    onChange(values[bounded]);
  };

  return (
    <div className="min-w-0 flex-1 text-center">
      <div className="mb-2 text-xs text-gray-500" aria-hidden="true">
        {label}
      </div>
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-20 h-10 rounded-lg border-y border-primary/20 bg-primary/5"
        />
        <div
          ref={ref}
          role="spinbutton"
          aria-label={label}
          aria-valuemin={values[0]}
          aria-valuemax={values[values.length - 1]}
          aria-valuenow={value}
          aria-valuetext={display(value)}
          tabIndex={0}
          className="relative h-[200px] snap-y snap-mandatory overflow-y-auto overscroll-contain touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerDown={event => event.stopPropagation()}
          onScroll={event =>
            select(Math.round(event.currentTarget.scrollTop / ITEM_HEIGHT))
          }
          onKeyDown={event => {
            let next: number | undefined;
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
              next = index + 1;
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
              next = index - 1;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = values.length - 1;
            if (next !== undefined) {
              event.preventDefault();
              select(next);
            }
          }}
        >
          <div aria-hidden="true" className="h-20" />
          {values.map(option => (
            <button
              key={option}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => onChange(option)}
              className={cn(
                'block h-10 w-full snap-center text-sm',
                option === value
                  ? 'font-bold text-foreground'
                  : 'text-gray-400',
              )}
            >
              {display(option)}
            </button>
          ))}
          <div aria-hidden="true" className="h-20" />
        </div>
      </div>
    </div>
  );
}

export function BirthDatePicker({
  name,
  label = 'تاریخ تولد',
  placeholder = 'انتخاب تاریخ تولد',
  required = false,
  className,
}: {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const { control, setValue, formState } = useFormContext();
  const value = useWatch({ control, name });
  const error = formState.errors[name] as { message?: string } | undefined;
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<BirthDate>(DEFAULT_BIRTH_DATE);

  // Vaul and radix-ui can have separate dismissable-layer stacks. Intercept
  // Escape before either stack sees it so only this nested dialog closes.
  React.useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [open]);
  const currentYear = gregorianToJalali(new Date()).jy;
  const minYear = Math.min(1310, draft.year);
  const maxYear = Math.max(currentYear, draft.year);
  const years = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => minYear + i,
  );
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from(
    { length: jalaliMonthLength(draft.year, draft.month) },
    (_, i) => i + 1,
  );
  const setDate = (change: Partial<BirthDate>) =>
    setDraft(previous => changeBirthDate(previous, change));
  const commit = (next: string) =>
    setValue(name, next, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  const onOpenChange = (next: boolean) => {
    if (next) setDraft(parseBirthDate(value) ?? DEFAULT_BIRTH_DATE);
    setOpen(next);
  };

  return (
    <div className={cn('w-full space-y-2', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <div className="relative">
          <Dialog.Trigger asChild>
            <button
              id={id}
              type="button"
              data-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={cn(
                'flex h-12 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-right text-base outline-none transition hover:border-gray-400 focus-visible:ring-2 focus-visible:ring-primary md:text-sm',
                error && 'border-destructive ring-3 ring-destructive/20',
                !required && value && 'pe-10',
              )}
            >
              <CalendarIcon className="size-4 shrink-0 text-gray-400" />
              <span className={cn(value ? 'text-gray-900' : 'text-gray-400')}>
                {formatBirthDate(value) || placeholder}
              </span>
            </button>
          </Dialog.Trigger>
          {!required && value && (
            <button
              type="button"
              aria-label="پاک کردن تاریخ تولد"
              onClick={() => commit('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" />
          <Dialog.Content
            dir="rtl"
            className="fixed inset-x-0 bottom-0 z-[101] max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
            onPointerDown={event => event.stopPropagation()}
          >
            <Dialog.Title className="text-center text-base font-bold">
              انتخاب تاریخ تولد
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-center text-sm text-gray-500">
              روز، ماه و سال تولد خود را انتخاب کنید.
            </Dialog.Description>
            <div className="mt-5 flex gap-2" dir="rtl">
              <Wheel
                label="روز"
                values={days}
                value={draft.day}
                onChange={day => setDate({ day })}
                display={toFa}
              />
              <Wheel
                label="ماه"
                values={months}
                value={draft.month}
                onChange={month => setDate({ month })}
                display={month => FA_MONTHS[month - 1]}
              />
              <Wheel
                label="سال"
                values={years}
                value={draft.year}
                onChange={year => setDate({ year })}
                display={toFa}
              />
            </div>
            <button
              type="button"
              className="mt-5 h-12 w-full rounded-lg bg-primary font-medium text-primary-foreground"
              onClick={() => {
                commit(serializeBirthDate(draft));
                setOpen(false);
              }}
            >
              تأیید و ثبت تاریخ تولد
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="mt-2 h-10 w-full text-sm text-gray-600"
              >
                انصراف
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {error && <FieldError id={`${id}-error`} errors={[error]} />}
    </div>
  );
}
