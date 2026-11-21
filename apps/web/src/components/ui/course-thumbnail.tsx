'use client';

import * as React from 'react';
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CourseThumbnailProps {
  src?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  compact?: boolean;
  children?: React.ReactNode;
}

export function CourseThumbnail({
  src,
  alt,
  className,
  imgClassName,
  compact = false,
  children,
}: CourseThumbnailProps) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImg = Boolean(src && !failed);
  const monogram = React.useMemo(() => {
    const words = alt
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const first = words[0];
    const second = words[1];
    if (!first) return 'T4';
    if (!second) return first.slice(0, 2).toUpperCase();
    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  }, [alt]);

  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden bg-secondary',
        className,
      )}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={alt}
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary/20 via-secondary to-primary/10 px-3 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
              backgroundSize: compact ? '12px 12px' : '18px 18px',
            }}
          />
          <div
            className={cn(
              'relative flex items-center justify-center rounded-xl border border-primary/25 bg-card/85 text-primary shadow-xs backdrop-blur-xs',
              compact ? 'h-8 w-8 rounded-lg' : 'h-12 w-12',
            )}
          >
            <GraduationCap className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
          </div>
          {!compact && (
            <p className="relative mt-2 max-w-[85%] truncate text-[11px] font-semibold tracking-wide text-foreground/75">
              Try4T • {monogram}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
