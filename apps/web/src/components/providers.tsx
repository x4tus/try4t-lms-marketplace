'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { GlobalConfirmDialog } from '@/components/ui/confirm-dialog';
import { Try4TToaster } from '@/components/ui/try4t-toaster';
import { AuthModal } from '@/features/auth/auth-modal';
import { useAuthStore } from '@/features/auth/auth.store';
import { OAuthPopupListener } from '@/features/auth/oauth-popup-listener';
import { ProfileModal } from '@/features/auth/profile-modal';
import { CartDrawer } from '@/features/cart/cart-drawer';
import { useCartStore } from '@/features/cart/cart.store';
import { CheckoutModal } from '@/features/commerce/checkout-modal';
import { useThemePaletteStore } from '@/features/theme/theme-palette.store';

function AppInitializer({ children }: { children: React.ReactNode }) {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrateFromLocal = useThemePaletteStore((s) => s.hydrateFromLocal);
  const hydrateFromUser = useThemePaletteStore((s) => s.hydrateFromUser);
  const syncDomForMode = useThemePaletteStore((s) => s.syncDomForMode);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const syncCartWithServer = useCartStore((s) => s.syncWithServer);
  const { resolvedTheme, setTheme } = useTheme();
  const currentMode: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';

  React.useEffect(() => {
    hydrateFromLocal();
    hydrateCart();
    void bootstrap();
  }, [bootstrap, hydrateFromLocal, hydrateCart]);

  const userId = user?.id ?? null;

  React.useEffect(() => {
    if (!isHydrated) return;
    if (user) {
      const targetMode = user.themeConfig?.mode;
      if (targetMode) {
        setTheme(targetMode);
      }
      const effectiveMode: 'light' | 'dark' =
        targetMode === 'light' || targetMode === 'dark' ? targetMode : currentMode;
      hydrateFromUser(user.themeConfig, effectiveMode);
      // Hợp nhất giỏ hàng tạm (localStorage) vào DB và lọc bỏ khóa đã sở hữu
      void syncCartWithServer();
    } else {
      hydrateFromLocal(currentMode);
      hydrateCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, userId]);

  React.useEffect(() => {
    if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
      syncDomForMode(resolvedTheme);
    }
  }, [resolvedTheme, syncDomForMode]);

  return (
    <>
      {children}
      <OAuthPopupListener />
      <AuthModal />
      <ProfileModal />
      <CartDrawer />
      <CheckoutModal />
      <GlobalConfirmDialog />
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AppInitializer>{children}</AppInitializer>
        <Try4TToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
