'use client';

import { create } from 'zustand';
import type { AuthResponse, AuthUser } from '@try4t/shared';
import { api, registerAuthSyncHandler, setAccessToken } from '@/lib/api-client';

interface AuthState {
  user: AuthUser | null;
  isHydrated: boolean;
  setSession: (auth: AuthResponse) => void;
  setUser: (user: AuthUser | null) => void;
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  registerAuthSyncHandler((auth) => {
    if (auth) {
      set({ user: auth.user, isHydrated: true });
    } else {
      set({ user: null, isHydrated: true });
    }
  });

  return {
    user: null,
    isHydrated: false,

    setSession: (auth) => {
      setAccessToken(auth.accessToken);
      set({ user: auth.user, isHydrated: true });
    },

    setUser: (user) => {
      set({ user });
    },

    bootstrap: async () => {
      const refreshed = await api.refreshSession();
      if (refreshed) {
        setAccessToken(refreshed.accessToken);
        set({ user: refreshed.user, isHydrated: true });
      } else {
        setAccessToken(null);
        set({ user: null, isHydrated: true });
      }
    },

    logout: async () => {
      try {
        await api.post('/auth/logout', undefined, { skipAuthRefresh: true });
      } catch {
        // ignore network error on logout
      } finally {
        setAccessToken(null);
        set({ user: null, isHydrated: true });
      }
    },
  };
});
