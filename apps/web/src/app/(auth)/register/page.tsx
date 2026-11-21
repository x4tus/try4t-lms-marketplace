'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthModalStore } from '@/features/auth/auth-modal.store';
import { useAuthStore } from '@/features/auth/auth.store';

export default function RegisterFallbackPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const openRegister = useAuthModalStore((s) => s.openRegister);

  React.useEffect(() => {
    if (user) {
      router.replace('/');
      return;
    }
    openRegister();
  }, [user, router, openRegister]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <GraduationCap className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Đăng ký tài khoản Try4T</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Hộp thoại đăng ký và xác thực email OTP đang sẵn sàng cho bạn.
      </p>
      <Button className="mt-5" onClick={openRegister}>
        Mở hộp thoại đăng ký
      </Button>
    </div>
  );
}
