'use client';

import { create } from 'zustand';
import { notify } from '@/lib/notify';
import { rememberReturnPath } from './auth-redirect';
import { useAuthStore } from './auth.store';

export type AuthModalTab = 'login' | 'register';

interface AuthModalState {
  isOpen: boolean;
  tab: AuthModalTab;
  openLogin: () => void;
  openRegister: () => void;
  setTab: (tab: AuthModalTab) => void;
  close: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  tab: 'login',
  openLogin: () => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      notify.info('Bạn đang đăng nhập rồi', {
        description: `Tài khoản hiện tại: ${currentUser.email}. Hãy đăng xuất nếu muốn đổi tài khoản.`,
      });
      return;
    }
    if (typeof window !== 'undefined') {
      rememberReturnPath(window.location.pathname, window.location.search);
    }
    set({ isOpen: true, tab: 'login' });
  },
  openRegister: () => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      notify.info('Bạn đang đăng nhập rồi', {
        description: `Hãy đăng xuất khỏi ${currentUser.email} nếu bạn muốn tạo tài khoản mới.`,
      });
      return;
    }
    if (typeof window !== 'undefined') {
      rememberReturnPath(window.location.pathname, window.location.search);
    }
    set({ isOpen: true, tab: 'register' });
  },
  setTab: (tab) => set({ tab }),
  close: () => set({ isOpen: false }),
}));
