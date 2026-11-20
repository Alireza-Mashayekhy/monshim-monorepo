'use client';

import { Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toCallHref } from '@/lib/tel';
import { cn } from '@/lib/utils';

interface CallButtonProps {
  /** شمارهٔ تماس؛ می‌تواند با ارقام فارسی یا جداکننده باشد. */
  phone?: string | null;
  /** متن کنار آیکون؛ اگر نیاید فقط آیکون تلفن نمایش داده می‌شود. */
  label?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
}

/**
 * دکمهٔ تماس که مستقیماً با لینک `tel:` شماره‌گیری می‌کند.
 *
 * اگر شماره‌ای وجود نداشته باشد چیزی رندر نمی‌شود (به‌جای لینک شکسته)؛
 * تصمیمِ نمایش «بدون شماره تماس» با والد است.
 */
export function CallButton({
  phone,
  label,
  variant = 'outline',
  size = 'sm',
  className,
}: CallButtonProps) {
  const href = toCallHref(phone);
  if (!href) return null;

  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={cn('gap-1', className)}
    >
      <a href={href} aria-label={`تماس با ${phone}`}>
        <Phone size={13} aria-hidden />
        {label ? <span>{label}</span> : null}
      </a>
    </Button>
  );
}
