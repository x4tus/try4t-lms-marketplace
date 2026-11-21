'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  length?: number;
}

export function OtpInput({ value, onChange, disabled, length = 6 }: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, idx) => value[idx] ?? '');

  function updateAt(index: number, nextDigit: string) {
    const arr = [...digits];
    arr[index] = nextDigit;
    onChange(arr.join('').slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      updateAt(index, '');
      return;
    }

    if (clean.length > 1) {
      // User pasted multiple digits into a box
      const merged = clean.slice(0, length);
      onChange(merged);
      const focusIdx = Math.min(length - 1, merged.length - 1);
      inputsRef.current[focusIdx]?.focus();
      return;
    }

    updateAt(index, clean);
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      updateAt(index - 1, '');
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    const focusIdx = Math.min(length - 1, pasted.length - 1);
    inputsRef.current[focusIdx]?.focus();
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputsRef.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          aria-label={`Chữ số OTP thứ ${idx + 1}`}
          className={cn(
            'h-12 w-11 rounded-xl border border-input bg-card text-center font-mono text-xl font-bold text-foreground shadow-xs transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50',
            digit && 'border-primary/70',
          )}
        />
      ))}
    </div>
  );
}
