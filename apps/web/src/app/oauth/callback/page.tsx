'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Loader2, XCircle } from 'lucide-react';
import type { AuthResponse } from '@try4t/shared';
import { Button } from '@/components/ui/button';
import { consumePostLoginTarget } from '@/features/auth/auth-redirect';
import { useAuthStore } from '@/features/auth/auth.store';
import { broadcastOAuthResult } from '@/features/auth/oauth-channel';
import { useThemePaletteStore } from '@/features/theme/theme-palette.store';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

interface OAuthExchangeResponse extends AuthResponse {
  provider: 'google' | 'github';
  isNewUser: boolean;
}

function FullscreenLoadingMask({ showManualClose }: { showManualClose?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-4 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <GraduationCap className="h-7 w-7" />
        <Loader2 className="absolute -bottom-1 -right-1 h-5 w-5 animate-spin rounded-full bg-background p-0.5 text-primary" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">Đang đồng bộ phiên đăng nhập...</p>
      <p className="mt-1 text-xs text-muted-foreground">Vui lòng chờ trong giây lát</p>

      {showManualClose && (
        <Button className="mt-5" size="sm" variant="outline" onClick={() => window.close()}>
          Đóng cửa sổ này
        </Button>
      )}
    </div>
  );
}

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const hydrateFromUser = useThemePaletteStore((s) => s.hydrateFromUser);
  const handledRef = React.useRef(false);

  const [viewState, setViewState] = React.useState<'loading' | 'error'>('loading');
  const [showManualClose, setShowManualClose] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const status = searchParams.get('status') === 'success' ? 'success' : 'error';
    const ticket = searchParams.get('ticket') ?? undefined;
    const provider = (searchParams.get('provider') as 'google' | 'github' | null) ?? undefined;
    const isNew = searchParams.get('isNew') === '1';
    const message = searchParams.get('message') ?? undefined;
    const isPopup = searchParams.get('popup') === '1' || Boolean(window.opener);

    // Che do Pop-up: Giu full-screen loading che kin layout, ban ticket ve man chinh va dong ngay lap tuc!
    if (isPopup) {
      broadcastOAuthResult({
        id: ticket || `err-${Date.now()}`,
        status,
        ticket,
        provider,
        isNew,
        message,
      });

      window.close();

      // Du phong neu trinh duyet chan window.close() sau 2 giay
      const timer = window.setTimeout(() => {
        setShowManualClose(true);
      }, 2000);
      return () => window.clearTimeout(timer);
    }

    // Fallback neu mo trong cung 1 tab (trinh duyet chan window.open)
    if (status !== 'success' || !ticket) {
      setViewState('error');
      setErrorMessage(message || 'Không thể hoàn tất xác thực bên thứ 3');
      return;
    }

    void (async () => {
      try {
        const data = await api.post<OAuthExchangeResponse>(
          '/auth/oauth/exchange',
          { ticket },
          { skipAuthRefresh: true },
        );
        setSession({ accessToken: data.accessToken, user: data.user });

        const themeMode = data.user.themeConfig?.mode;
        hydrateFromUser(
          data.user.themeConfig,
          themeMode === 'light' || themeMode === 'dark' ? themeMode : undefined,
        );

        notify.success(
          data.isNewUser
            ? `Chào mừng ${data.user.fullName} gia nhập Try4T!`
            : `Chào mừng quay lại, ${data.user.fullName}!`,
        );

        router.replace(consumePostLoginTarget(data.user.role, '/'));
      } catch (err) {
        setViewState('error');
        setErrorMessage(
          err instanceof ApiClientError ? err.message : 'Đổi phiên đăng nhập thất bại',
        );
      }
    })();
  }, [searchParams, setSession, hydrateFromUser, router]);

  if (viewState === 'loading') {
    return <FullscreenLoadingMask showManualClose={showManualClose} />;
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-4 text-center">
      <XCircle className="h-11 w-11 text-destructive" />
      <h1 className="mt-4 text-base font-semibold">Đăng nhập không thành công</h1>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{errorMessage}</p>
      <Button className="mt-5" size="sm" variant="outline" onClick={() => router.replace('/')}>
        Quay về trang chủ
      </Button>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <React.Suspense fallback={<FullscreenLoadingMask />}>
      <OAuthCallbackInner />
    </React.Suspense>
  );
}
