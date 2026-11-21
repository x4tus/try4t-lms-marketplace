'use client';

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Role } from '@try4t/shared';
import { useAuthModalStore } from '@/features/auth/auth-modal.store';
import { useAuthStore } from '@/features/auth/auth.store';
import { useProfileModalStore } from '@/features/auth/profile-modal';

export function Footer() {
  const user = useAuthStore((s) => s.user);
  const { openLogin, openRegister } = useAuthModalStore();
  const openProfileModal = useProfileModalStore((s) => s.open);

  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 font-bold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span>
              Try<span className="text-primary">4T</span>
            </span>
          </Link>
          <p className="max-w-md text-sm text-muted-foreground">
            Nền tảng học tập trực tuyến hiện đại — kết hợp phòng học thông minh, Course Builder
            chuyên nghiệp và chứng chỉ điện tử xác thực QR.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Link href="/courses" className="transition-colors hover:text-foreground">
            Khóa học
          </Link>

          {!user ? (
            <>
              <button
                type="button"
                onClick={openRegister}
                className="cursor-pointer transition-colors hover:text-foreground"
              >
                Trở thành Giảng viên
              </button>
              <button
                type="button"
                onClick={openLogin}
                className="cursor-pointer transition-colors hover:text-foreground"
              >
                Đăng nhập
              </button>
            </>
          ) : (
            <>
              {user.role === Role.STUDENT && (
                <button
                  type="button"
                  onClick={() => openProfileModal('instructor')}
                  className="cursor-pointer transition-colors hover:text-foreground"
                >
                  Đăng ký làm Giảng viên
                </button>
              )}
              {user.role === Role.INSTRUCTOR && (
                <Link
                  href="/instructor/dashboard"
                  className="transition-colors hover:text-foreground"
                >
                  Kênh Giảng viên
                </Link>
              )}
              {user.role === Role.ADMIN && (
                <Link href="/admin/dashboard" className="transition-colors hover:text-foreground">
                  Quản trị hệ thống
                </Link>
              )}
              <button
                type="button"
                onClick={() => openProfileModal('profile')}
                className="cursor-pointer transition-colors hover:text-foreground"
              >
                Hồ sơ cá nhân
              </button>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Try4T Education Platform. Built with Next.js, NestJS &amp; Prisma.
      </div>
    </footer>
  );
}
