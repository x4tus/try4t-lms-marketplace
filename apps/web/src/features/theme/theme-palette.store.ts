'use client';

import { create } from 'zustand';
import type { AuthUser, ThemeConfig } from '@try4t/shared';
import { api } from '@/lib/api-client';
import { applyThemePaletteToDom } from './theme-palette';

const LOCAL_STORAGE_KEY = 'try4t_theme_palette';

function readLocalPalette(): ThemeConfig {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ThemeConfig;
  } catch {
    return {};
  }
}

function writeLocalPalette(config: ThemeConfig) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
}

function detectCurrentMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function mergeThemeConfig(current: ThemeConfig, next: Partial<ThemeConfig>): ThemeConfig {
  return {
    ...current,
    ...next,
    privacy:
      next.privacy !== undefined
        ? { ...(current.privacy ?? {}), ...next.privacy }
        : current.privacy,
    learning:
      next.learning !== undefined
        ? { ...(current.learning ?? {}), ...next.learning }
        : current.learning,
    notifications:
      next.notifications !== undefined
        ? { ...(current.notifications ?? {}), ...next.notifications }
        : current.notifications,
  };
}

interface ThemePaletteState {
  palette: ThemeConfig;
  isSaving: boolean;
  hydrateFromLocal: (resolvedMode?: 'light' | 'dark') => void;
  hydrateFromUser: (
    themeConfig: ThemeConfig | null | undefined,
    resolvedMode?: 'light' | 'dark',
  ) => void;
  syncDomForMode: (resolvedMode: 'light' | 'dark') => void;
  setPalette: (
    next: Partial<ThemeConfig>,
    options?: {
      resolvedMode?: 'light' | 'dark';
      persistToAccount?: boolean;
      onUserUpdated?: (user: AuthUser) => void;
      immediate?: boolean;
    },
  ) => Promise<void>;
  resetPalette: (options?: {
    resolvedMode?: 'light' | 'dark';
    persistToAccount?: boolean;
    onUserUpdated?: (user: AuthUser) => void;
    appearanceOnly?: boolean;
  }) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useThemePaletteStore = create<ThemePaletteState>((set, get) => ({
  palette: {},
  isSaving: false,

  hydrateFromLocal: (resolvedMode) => {
    const local = readLocalPalette();
    applyThemePaletteToDom(local, resolvedMode ?? detectCurrentMode());
    set({ palette: local });
  },

  hydrateFromUser: (themeConfig, resolvedMode) => {
    const hasConfig =
      themeConfig &&
      (themeConfig.accentColor ||
        themeConfig.backgroundColor ||
        themeConfig.lightBackground ||
        themeConfig.darkBackground ||
        themeConfig.mode ||
        themeConfig.density ||
        themeConfig.fontScale ||
        themeConfig.reducedMotion !== undefined ||
        themeConfig.privacy ||
        themeConfig.learning ||
        themeConfig.notifications);
    const resolved: ThemeConfig = hasConfig ? themeConfig : {};
    applyThemePaletteToDom(resolved, resolvedMode ?? detectCurrentMode());
    set({ palette: resolved });
  },

  syncDomForMode: (resolvedMode) => {
    applyThemePaletteToDom(get().palette, resolvedMode);
  },

  setPalette: async (next, options) => {
    const merged = mergeThemeConfig(get().palette, next);
    if (!options?.persistToAccount) {
      writeLocalPalette(merged);
    }
    applyThemePaletteToDom(merged, options?.resolvedMode ?? detectCurrentMode());
    set({ palette: merged });

    if (options?.persistToAccount) {
      if (saveTimer) clearTimeout(saveTimer);
      set({ isSaving: true });
      const persist = async () => {
        try {
          const updatedUser = await api.patch<AuthUser>('/users/me', {
            themeConfig: merged,
          });
          options.onUserUpdated?.(updatedUser);
        } catch {
          // silently fail background sync
        } finally {
          set({ isSaving: false });
        }
      };

      if (options.immediate) {
        await persist();
      } else {
        saveTimer = setTimeout(() => {
          void persist();
        }, 350);
      }
    }
  },

  resetPalette: async (options) => {
    const prev = get().palette;
    const nextConfig: ThemeConfig = options?.appearanceOnly
      ? {
          ...prev,
          accentColor: null,
          backgroundColor: null,
          lightBackground: null,
          darkBackground: null,
          mode: 'system',
          density: 'comfortable',
          fontScale: 'md',
          reducedMotion: false,
        }
      : {
          accentColor: null,
          backgroundColor: null,
          lightBackground: null,
          darkBackground: null,
          mode: 'system',
          density: 'comfortable',
          fontScale: 'md',
          reducedMotion: false,
        };

    if (!options?.persistToAccount) {
      writeLocalPalette(nextConfig);
    }
    applyThemePaletteToDom(nextConfig, options?.resolvedMode ?? detectCurrentMode());
    set({ palette: nextConfig });

    if (options?.persistToAccount) {
      if (saveTimer) clearTimeout(saveTimer);
      set({ isSaving: true });
      try {
        const updatedUser = await api.patch<AuthUser>('/users/me', {
          themeConfig: options?.appearanceOnly ? nextConfig : null,
        });
        options.onUserUpdated?.(updatedUser);
      } catch {
        // ignore
      } finally {
        set({ isSaving: false });
      }
    }
  },
}));
