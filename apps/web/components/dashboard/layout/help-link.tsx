'use client';

import { CircleHelp } from 'lucide-react';
import Link from 'next/link';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { siteConfig } from '@/lib/site-config';
import { cn } from '@/lib/utils';

const HELP_LABEL = 'راهنمای منشیم';

/**
 * آیکون راهنما در هدر داشبورد → صفحهٔ آموزش آرایشگران.
 * Tooltip فقط با hover/فوکوس (دسکتاپ) باز می‌شود؛ در موبایل لمس مستقیماً
 * لینک را باز می‌کند.
 */
export default function HelpLink({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={siteConfig.routes.tutorials}
            aria-label={HELP_LABEL}
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-primary/15',
              className,
            )}
          >
            <CircleHelp size={20} aria-hidden />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {HELP_LABEL}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
