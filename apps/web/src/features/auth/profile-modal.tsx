'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LogOut, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { create } from 'zustand';
import {
  Role,
  updateProfileSchema,
  type AuthUser,
  type UpdateProfileInput,
} from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { useAuthStore } from './auth.store';
import { InstructorApplicationForm } from './instructor-application-form';

interface ProfileModalState {
  isOpen: boolean;
  tab: 'profile' | 'instructor';
  open: (tab?: 'profile' | 'instructor') => void;
  close: () => void;
}

export const useProfileModalStore = create<ProfileModalState>((set) => ({
  isOpen: false,
  tab: 'profile',
  open: (tab = 'profile') => set({ isOpen: true, tab }),
  close: () => set({ isOpen: false }),
}));

export function ProfileModal() {
  const { isOpen, tab, open, close } = useProfileModalStore();
  const { user, setUser, logout } = useAuthStore();

  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: user?.fullName ?? '',
      headline: user?.headline ?? '',
      bio: user?.bio ?? '',
    },
  });

  if (!user) return null;

  async function onSaveProfile(values: UpdateProfileInput) {
    try {
      const updated = await api.patch<AuthUser>('/users/me', values);
      setUser(updated);
      notify.success('Đã cập nhật hồ sơ cá nhân');
      close();
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Cập nhật thất bại');
    }
  }

  async function handleLogoutAll() {
    const ok = await confirmAction({
      title: 'Đăng xuất trên mọi thiết bị?',
      description: 'Tất cả phiên đăng nhập khác của bạn sẽ bị thu hồi ngay lập tức.',
      confirmLabel: 'Đăng xuất hết',
      destructive: true,
    });
    if (!ok) return;

    try {
      await api.post('/auth/logout-all');
      await logout();
      notify.success('Đã thu hồi phiên đăng nhập trên mọi thiết bị');
      close();
    } catch {
      notify.error('Không thể thu hồi phiên');
    }
  }

  const isInstructorTab = tab === 'instructor' && user.role === Role.STUDENT;

  return (
    <Dialog
      open={isOpen}
      onClose={close}
      title={isInstructorTab ? 'Đăng ký trở thành Giảng viên Try4T' : 'Hồ sơ cá nhân'}
      description={`${user.email} • Vai trò: ${user.role}`}
      maxWidthClass={isInstructorTab ? 'max-w-2xl' : 'max-w-lg'}
    >
      {user.role === Role.STUDENT && (
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-secondary p-1">
          <button
            type="button"
            onClick={() => open('profile')}
            className={cn(
              'cursor-pointer rounded-lg py-2 text-xs font-medium transition-all',
              tab === 'profile' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
            )}
          >
            Thông tin cá nhân
          </button>
          <button
            type="button"
            onClick={() => open('instructor')}
            className={cn(
              'cursor-pointer rounded-lg py-2 text-xs font-medium transition-all',
              tab === 'instructor' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
            )}
          >
            Trở thành Giảng viên
          </button>
        </div>
      )}

      {!isInstructorTab ? (
        <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Trạng thái tài khoản</span>
            <Badge variant="success" className="font-mono text-[10px]">
              {user.role}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-fullName">Họ và tên</Label>
            <Input id="pm-fullName" {...profileForm.register('fullName')} />
            {profileForm.formState.errors.fullName && (
              <p className="text-xs text-destructive">
                {profileForm.formState.errors.fullName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-headline">Chức danh / Chuyên môn</Label>
            <Input
              id="pm-headline"
              placeholder="VD: Full-Stack Engineer"
              {...profileForm.register('headline')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-bio">Giới thiệu ngắn</Label>
            <textarea
              id="pm-bio"
              rows={3}
              className="flex w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...profileForm.register('bio')}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogoutAll}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất mọi thiết bị
            </Button>
            <Button type="submit" size="sm" disabled={profileForm.formState.isSubmitting}>
              {profileForm.formState.isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Lưu thay đổi
            </Button>
          </div>
        </form>
      ) : (
        <InstructorApplicationForm onSubmitted={close} />
      )}
    </Dialog>
  );
}
