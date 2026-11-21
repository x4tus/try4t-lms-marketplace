'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';

type NotifyVariant = 'success' | 'error' | 'warning' | 'info';

interface NotifyOptions {
  description?: string;
  duration?: number;
}

const VARIANT_STYLES: Record<
  NotifyVariant,
  { icon: React.ComponentType<{ className?: string }>; badgeClass: string; barClass: string }
> = {
  success: {
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    barClass: 'bg-emerald-500',
  },
  error: {
    icon: XCircle,
    badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    barClass: 'bg-rose-500',
  },
  warning: {
    icon: AlertTriangle,
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    barClass: 'bg-amber-500',
  },
  info: {
    icon: Info,
    badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    barClass: 'bg-sky-500',
  },
};

function DynamicIslandToast({
  id,
  variant,
  title,
  description,
  duration,
}: {
  id: string | number;
  variant: NotifyVariant;
  title: string;
  description?: string;
  duration: number;
}) {
  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        'group pointer-events-auto relative flex w-[min(92vw,420px)] items-center gap-3 overflow-hidden rounded-full border border-border/90 bg-card/95 px-3.5 py-2.5 text-card-foreground shadow-xl backdrop-blur-xl transition-all',
        description && 'rounded-2xl py-3',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          style.badgeClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 pr-1">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => toast.dismiss(id)}
        aria-label="Đóng thông báo"
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Smooth countdown progress line */}
      <span
        className={cn(
          'pointer-events-none absolute bottom-0 left-0 h-[2px] w-full origin-left opacity-80 group-hover:[animation-play-state:paused]',
          style.barClass,
        )}
        style={{
          animation: `try4t-toast-shrink ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

function show(variant: NotifyVariant, title: string, options?: NotifyOptions) {
  const duration = options?.duration ?? (variant === 'error' ? 5000 : 3600);
  return toast.custom(
    (id) => (
      <DynamicIslandToast
        id={id}
        variant={variant}
        title={title}
        description={options?.description}
        duration={duration}
      />
    ),
    { duration },
  );
}

export const notify = {
  success: (title: string, options?: NotifyOptions) => show('success', title, options),
  error: (title: string, options?: NotifyOptions) => show('error', title, options),
  warning: (title: string, options?: NotifyOptions) => show('warning', title, options),
  info: (title: string, options?: NotifyOptions) => show('info', title, options),
};
