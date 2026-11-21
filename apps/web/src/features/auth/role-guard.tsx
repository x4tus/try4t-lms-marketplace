'use client';

import * as React from 'react';
import Link from 'next/link';
import { Lock, ShieldAlert } from 'lucide-react';
import type { Role } from '@try4t/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthModalStore } from './auth-modal.store';
import { useAuthStore } from './auth.store';
import { useProfileModalStore } from './profile-modal';

interface RoleGuardProps {
  allowedRoles?: Role[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, isHydrated } = useAuthStore();
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const openProfileModal = useProfileModalStore((s) => s.open);

  React.useEffect(() => {
    if (isHydrated && !user) {
      openLogin();
    }
  }, [isHydrated, user, openLogin]);

  if (!isHydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Vui lòng đăng nhập để tiếp tục</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Khu vực này dành cho thành viên Try4T. Bạn có thể đăng nhập ngay qua hộp thoại mà không
          cần rời trang.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link href="/">
            <Button variant="outline">Về trang chủ</Button>
          </Link>
          <Button onClick={openLogin}>Mở hộp thoại đăng nhập</Button>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Không đủ quyền truy cập</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tài khoản hiện tại của bạn đang ở vai trò{' '}
          <span className="font-mono font-semibold text-foreground">{user.role}</span>, chưa có
          quyền vào khu vực này.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link href="/">
            <Button variant="outline">Về trang chủ</Button>
          </Link>
          <Button onClick={() => openProfileModal('profile')}>Quản lý tài khoản</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
