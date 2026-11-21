'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LogOut, Presentation, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  Role,
  updateProfileSchema,
  type AuthUser,
  type UpdateProfileInput,
} from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/auth.store';
import { InstructorApplicationForm } from '@/features/auth/instructor-application-form';
import { RoleGuard } from '@/features/auth/role-guard';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

function ProfileContent() {
  const router = useRouter();
  const { user, setUser, logout } = useAuthStore();

  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: user?.fullName ?? '',
      headline: user?.headline ?? '',
      bio: user?.bio ?? '',
    },
  });

  async function onSaveProfile(values: UpdateProfileInput) {
    try {
      const updated = await api.patch<AuthUser>('/users/me', values);
      setUser(updated);
      notify.success('Đã cập nhật hồ sơ cá nhân');
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Cập nhật thất bại');
    }
  }

  async function handleLogoutAll() {
    const ok = await confirmAction({
      title: 'Đăng xuất tất cả thiết bị?',
      description: 'Mọi phiên đăng nhập trên trình duyệt khác sẽ bị đăng xuất ngay lập tức.',
      confirmLabel: 'Đăng xuất hết',
      destructive: true,
    });
    if (!ok) return;

    try {
      await api.post('/auth/logout-all');
      await logout();
      notify.success('Đã thu hồi phiên đăng nhập trên mọi thiết bị');
      router.push('/');
    } catch {
      notify.error('Không thể thu hồi phiên');
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hồ sơ cá nhân</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý thông tin hiển thị, vai trò và bảo mật tài khoản Try4T.
          </p>
        </div>
        <Badge className="px-3 py-1 font-mono">{user.role}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin cơ bản</CardTitle>
          <CardDescription>Email đăng nhập: {user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input id="fullName" {...profileForm.register('fullName')} />
                {profileForm.formState.errors.fullName && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.fullName.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="headline">Chức danh / Chuyên môn</Label>
                <Input
                  id="headline"
                  placeholder="VD: Full-Stack TypeScript Engineer"
                  {...profileForm.register('headline')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bio">Giới thiệu ngắn</Label>
              <textarea
                id="bio"
                rows={3}
                className="flex w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Chia sẻ đôi chút về kinh nghiệm hoặc mục tiêu học tập của bạn..."
                {...profileForm.register('bio')}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleLogoutAll}
                className="text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Đăng xuất tất cả thiết bị
              </Button>
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                {profileForm.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {user.role === Role.STUDENT && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Presentation className="h-5 w-5" />
              <CardTitle>Đăng ký trở thành Giảng viên Try4T</CardTitle>
            </div>
            <CardDescription>
              Hồ sơ của bạn sẽ được Quản trị viên xét duyệt kỹ lưỡng để đảm bảo chất lượng khóa học
              trên nền tảng.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InstructorApplicationForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RoleGuard>
      <ProfileContent />
    </RoleGuard>
  );
}
