'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthResponse } from '@try4t/shared';
import { useThemePaletteStore } from '@/features/theme/theme-palette.store';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import { useAuthModalStore } from './auth-modal.store';
import { consumePostLoginTarget } from './auth-redirect';
import { useAuthStore } from './auth.store';
import { subscribeOAuthResult } from './oauth-channel';

interface OAuthExchangeResponse extends AuthResponse {
  provider: 'google' | 'github';
  isNewUser: boolean;
}

export function OAuthPopupListener() {
  const router = useRouter();
  const pathname = usePathname();
  const setSession = useAuthStore((s) => s.setSession);
  const closeModal = useAuthModalStore((s) => s.close);
  const hydrateFromUser = useThemePaletteStore((s) => s.hydrateFromUser);

  const pathnameRef = React.useRef(pathname);
  pathnameRef.current = pathname;

  React.useEffect(() => {
    return subscribeOAuthResult(async (payload) => {
      if (payload.status !== 'success' || !payload.ticket) {
        notify.error('Đăng nhập bên thứ 3 không thành công', {
          description: payload.message || 'Vui lòng thử lại sau.',
        });
        return;
      }

      try {
        const data = await api.post<OAuthExchangeResponse>(
          '/auth/oauth/exchange',
          { ticket: payload.ticket },
          { skipAuthRefresh: true },
        );

        setSession({ accessToken: data.accessToken, user: data.user });

        const themeMode = data.user.themeConfig?.mode;
        hydrateFromUser(
          data.user.themeConfig,
          themeMode === 'light' || themeMode === 'dark' ? themeMode : undefined,
        );

        const providerLabel = data.provider === 'github' ? 'GitHub' : 'Google';
        notify.success(
          data.isNewUser
            ? `Chào mừng ${data.user.fullName} gia nhập Try4T!`
            : `Chào mừng quay lại, ${data.user.fullName}!`,
          {
            description: data.isNewUser
              ? `Đã tự động đăng ký & đồng bộ hồ sơ từ ${providerLabel}.`
              : `Đăng nhập thành công qua ${providerLabel}.`,
          },
        );

        closeModal();
        const target = consumePostLoginTarget(data.user.role, pathnameRef.current);
        if (target !== pathnameRef.current) {
          router.push(target);
        }
      } catch (err) {
        notify.error('Không thể hoàn tất đăng nhập', {
          description:
            err instanceof ApiClientError ? err.message : 'Vui lòng thử đăng nhập lại.',
        });
      }
    });
  }, [setSession, hydrateFromUser, closeModal, router]);

  return null;
}
