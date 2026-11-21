'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthModalStore } from '@/features/auth/auth-modal.store';
import { useAuthStore } from '@/features/auth/auth.store';

export default function LoginFallbackPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const openLogin = useAuthModalStore((s) => s.openLogin);

  React.useEffect(() => {
    if (user) {
      router.replace('/');
      return;
    }
    openLogin();
  }, [user, router, openLogin]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <GraduationCap className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Đăng nhập Try4T</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Hộp thoại đăng nhập đang mở ngay trên màn hình để bạn thao tác nhanh gọn.
      </p>
      <Button className="mt-5" onClick={openLogin}>
        Mở hộp thoại đăng nhập
      </Button>
    </div>
  );
}
