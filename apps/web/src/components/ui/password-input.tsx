'use client';

import * as React from 'react';
import { AlertTriangle, Check, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, onKeyDown, onKeyUp, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const [capsLockOn, setCapsLockOn] = React.useState(false);

    function detectCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
      if (typeof e.getModifierState === 'function') {
        setCapsLockOn(e.getModifierState('CapsLock'));
      }
    }

    return (
      <div className="space-y-1">
        <div className="relative">
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            onKeyDown={(e) => {
              detectCapsLock(e);
              onKeyDown?.(e);
            }}
            onKeyUp={(e) => {
              detectCapsLock(e);
              onKeyUp?.(e);
            }}
            className={cn(
              'flex h-10 w-full rounded-lg border border-input bg-card pl-3.5 pr-10 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((prev) => !prev)}
            aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {capsLockOn && (
          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Phím Caps Lock đang bật
          </p>
        )}
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const hasMinLen = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasStrongMix = /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);

  const score = [hasMinLen, hasLetter, hasDigit, hasStrongMix].filter(Boolean).length;
  const label =
    score <= 1 ? 'Yếu' : score === 2 ? 'Trung bình' : score === 3 ? 'Tốt' : 'Rất mạnh';
  const barColor =
    score <= 1
      ? 'bg-rose-500'
      : score === 2
        ? 'bg-amber-500'
        : score === 3
          ? 'bg-sky-500'
          : 'bg-emerald-500';

  return (
    <div className="space-y-1.5 rounded-lg border border-border/70 bg-secondary/35 p-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Độ mạnh mật khẩu</span>
        <span className="font-semibold">{label}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((idx) => (
          <span
            key={idx}
            className={cn(
              'h-1.5 rounded-full transition-colors',
              score >= idx ? barColor : 'bg-border',
            )}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-[11px] text-muted-foreground">
        <span className={cn('inline-flex items-center gap-1', hasMinLen && 'text-emerald-600 dark:text-emerald-400')}>
          <Check className="h-3 w-3" /> ≥ 8 ký tự
        </span>
        <span className={cn('inline-flex items-center gap-1', hasLetter && 'text-emerald-600 dark:text-emerald-400')}>
          <Check className="h-3 w-3" /> Có chữ cái
        </span>
        <span className={cn('inline-flex items-center gap-1', hasDigit && 'text-emerald-600 dark:text-emerald-400')}>
          <Check className="h-3 w-3" /> Có chữ số
        </span>
        <span className={cn('inline-flex items-center gap-1', hasStrongMix && 'text-emerald-600 dark:text-emerald-400')}>
          <Check className="h-3 w-3" /> Hoa &amp; Ký tự đặc biệt
        </span>
      </div>
    </div>
  );
}
