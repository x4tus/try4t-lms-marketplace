'use client';

import * as React from 'react';
import { Check, Loader2, Monitor, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/auth.store';
import {
  ACCENT_PRESETS,
  DARK_BACKGROUND_PRESETS,
  DEFAULT_ACCENT,
  DEFAULT_DARK_BG,
  DEFAULT_LIGHT_BG,
  isLightColor,
  LIGHT_BACKGROUND_PRESETS,
  resolveActiveBackground,
} from '@/features/theme/theme-palette';
import { useThemePaletteStore } from '@/features/theme/theme-palette.store';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

const MODE_OPTIONS = [
  { value: 'light' as const, label: 'Sáng', icon: Sun },
  { value: 'dark' as const, label: 'Tối', icon: Moon },
  { value: 'system' as const, label: 'Hệ thống', icon: Monitor },
];

export function ThemePalettePicker() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { user, setUser } = useAuthStore();
  const { palette, isSaving, setPalette, resetPalette } = useThemePaletteStore();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const currentMode: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';
  const selectedThemeSetting = (theme as 'light' | 'dark' | 'system' | undefined) ?? 'system';
  const activeBg = resolveActiveBackground(palette, currentMode);
  const activeAccent = palette.accentColor ?? null;
  const presets = currentMode === 'dark' ? DARK_BACKGROUND_PRESETS : LIGHT_BACKGROUND_PRESETS;

  function handleModeChange(nextMode: 'light' | 'dark' | 'system') {
    setTheme(nextMode);
    const effectiveMode: 'light' | 'dark' =
      nextMode === 'system'
        ? typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : nextMode;

    // Giu nguyen ca lightBackground lan darkBackground, chi doi che do!
    void setPalette(
      { mode: nextMode },
      {
        resolvedMode: effectiveMode,
        persistToAccount: Boolean(user),
        onUserUpdated: setUser,
      },
    );
  }

  function handleBackgroundChange(hex: string) {
    const isHexLight = isLightColor(hex);
    const targetMode: 'light' | 'dark' = isHexLight ? 'light' : 'dark';
    setTheme(targetMode);

    void setPalette(
      isHexLight
        ? { lightBackground: hex, mode: 'light' }
        : { darkBackground: hex, mode: 'dark' },
      {
        resolvedMode: targetMode,
        persistToAccount: Boolean(user),
        onUserUpdated: setUser,
      },
    );
  }

  function handleAccentChange(hex: string | null) {
    void setPalette(
      { accentColor: hex },
      {
        resolvedMode: currentMode,
        persistToAccount: Boolean(user),
        onUserUpdated: setUser,
      },
    );
  }

  async function handleReset() {
    setTheme('system');
    const systemMode: 'light' | 'dark' =
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    await resetPalette({
      resolvedMode: systemMode,
      persistToAccount: Boolean(user),
      onUserUpdated: setUser,
    });
    notify.success('Đã đặt lại giao diện mặc định');
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Unified prominent button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Tùy chỉnh giao diện & bảng màu"
        aria-expanded={open}
        className={cn(
          'flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-xs transition-all hover:bg-secondary active:scale-[0.99]',
          open && 'ring-2 ring-ring',
        )}
      >
        <span className="flex items-center gap-1">
          {mounted && currentMode === 'dark' ? (
            <Moon className="h-4 w-4 text-primary" />
          ) : (
            <Sun className="h-4 w-4 text-primary" />
          )}
          <Palette className="h-4 w-4 text-muted-foreground" />
        </span>

        <span className="hidden sm:inline">Giao diện</span>

        <span className="flex items-center -space-x-1">
          <span
            className="h-3.5 w-3.5 rounded-full border border-border shadow-xs"
            style={{
              backgroundColor:
                activeBg ?? (currentMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG),
            }}
          />
          <span
            className="h-3.5 w-3.5 rounded-full border border-border shadow-xs"
            style={{
              backgroundColor: activeAccent ?? DEFAULT_ACCENT,
            }}
          />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2.5 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-sm font-semibold">Tùy chỉnh giao diện</p>
              <p className="text-[11px] text-muted-foreground">
                {user
                  ? 'Tự động lưu riêng màu Sáng & Tối vào tài khoản'
                  : 'Đăng nhập để đồng bộ màu trên mọi thiết bị'}
              </p>
            </div>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* 1. Mode Switcher (Light / Dark / System) */}
          <div className="mt-3.5 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Chế độ hiển thị</span>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-secondary p-1">
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = mounted && selectedThemeSetting === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleModeChange(opt.value)}
                    className={cn(
                      'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all',
                      active
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Background Color (Saved independently for Light & Dark!) */}
          <div className="mt-4 space-y-2 border-t border-border pt-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                Màu nền ({currentMode === 'dark' ? 'Chế độ Tối' : 'Chế độ Sáng'})
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary">
                <input
                  type="color"
                  aria-label="Chọn màu nền tự do"
                  value={activeBg ?? (currentMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG)}
                  onChange={(e) => handleBackgroundChange(e.target.value)}
                  className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="font-mono">{activeBg ?? 'Mặc định'}</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => {
                const selected =
                  activeBg?.toLowerCase() === preset.hex.toLowerCase() ||
                  (!activeBg &&
                    ((currentMode === 'light' && preset.hex === DEFAULT_LIGHT_BG) ||
                      (currentMode === 'dark' && preset.hex === DEFAULT_DARK_BG)));
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => handleBackgroundChange(preset.hex)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all',
                      selected
                        ? 'border-primary bg-secondary/70 ring-1 ring-primary'
                        : 'border-border hover:bg-secondary/50',
                    )}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/15"
                      style={{ backgroundColor: preset.hex }}
                    >
                      {selected && (
                        <Check
                          className="h-3.5 w-3.5"
                          style={{ color: isLightColor(preset.hex) ? '#09090b' : '#ffffff' }}
                        />
                      )}
                    </span>
                    <span className="truncate text-xs font-medium">{preset.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mẹo: Nền Sáng và nền Tối được lưu tách biệt — chuyển qua lại không bị mất màu bạn đã
              chọn.
            </p>
          </div>

          {/* 3. Accent Color */}
          <div className="mt-4 space-y-2 border-t border-border pt-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Màu nhấn (Nút &amp; Điểm sáng)</span>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary">
                <input
                  type="color"
                  aria-label="Chọn màu nhấn tự do"
                  value={activeAccent ?? DEFAULT_ACCENT}
                  onChange={(e) => handleAccentChange(e.target.value)}
                  className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="font-mono">{activeAccent ?? DEFAULT_ACCENT}</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((preset) => {
                const effectiveAccent = activeAccent ?? DEFAULT_ACCENT;
                const selected = effectiveAccent.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleAccentChange(preset.hex)}
                    title={preset.name}
                    className={cn(
                      'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-110',
                      selected
                        ? 'ring-2 ring-foreground ring-offset-2 ring-offset-popover'
                        : 'border-border',
                    )}
                    style={{ background: preset.hex }}
                  >
                    {selected && (
                      <Check
                        className="h-4 w-4"
                        style={{ color: isLightColor(preset.hex) ? '#09090b' : '#ffffff' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Đặt lại mặc định
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">
              Đóng
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
