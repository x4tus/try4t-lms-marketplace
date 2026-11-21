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
    },
  ) => Promise<void>;
  resetPalette: (options?: {
    resolvedMode?: 'light' | 'dark';
    persistToAccount?: boolean;
    onUserUpdated?: (user: AuthUser) => void;
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
        themeConfig.mode);
    const resolved: ThemeConfig = hasConfig ? themeConfig : {};
    applyThemePaletteToDom(resolved, resolvedMode ?? detectCurrentMode());
    set({ palette: resolved });
  },

  syncDomForMode: (resolvedMode) => {
    applyThemePaletteToDom(get().palette, resolvedMode);
  },

  setPalette: async (next, options) => {
    const merged: ThemeConfig = {
      ...get().palette,
      ...next,
    };
    if (!options?.persistToAccount) {
      writeLocalPalette(merged);
    }
    applyThemePaletteToDom(merged, options?.resolvedMode ?? detectCurrentMode());
    set({ palette: merged });

    if (options?.persistToAccount) {
      if (saveTimer) clearTimeout(saveTimer);
      set({ isSaving: true });
      saveTimer = setTimeout(async () => {
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
      }, 400);
    }
  },

  resetPalette: async (options) => {
    const empty: ThemeConfig = {
      accentColor: null,
      backgroundColor: null,
      lightBackground: null,
      darkBackground: null,
      mode: 'system',
    };
    if (!options?.persistToAccount) {
      writeLocalPalette(empty);
    }
    applyThemePaletteToDom(null, options?.resolvedMode ?? detectCurrentMode());
    set({ palette: empty });

    if (options?.persistToAccount) {
      if (saveTimer) clearTimeout(saveTimer);
      set({ isSaving: true });
      try {
        const updatedUser = await api.patch<AuthUser>('/users/me', {
          themeConfig: null,
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
