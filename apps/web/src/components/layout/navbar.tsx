'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  ShoppingCart,
  User as UserIcon,
  X,
} from 'lucide-react';
import { Role } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthModalStore } from '@/features/auth/auth-modal.store';
import { useAuthStore } from '@/features/auth/auth.store';
import { useProfileModalStore } from '@/features/auth/profile-modal';
import { useCartStore } from '@/features/cart/cart.store';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { ThemePalettePicker } from './theme-palette-picker';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isHydrated, logout } = useAuthStore();
  const { openLogin, openRegister } = useAuthModalStore();
  const openProfileModal = useProfileModalStore((s) => s.open);
  const cartItemsCount = useCartStore((s) => s.items.length);
  const openCartDrawer = useCartStore((s) => s.openDrawer);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchTerm.trim();
    router.push(q ? `/courses?search=${encodeURIComponent(q)}` : '/courses');
  }

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await logout();
    notify.info('Đã đăng xuất an toàn', { description: 'Hẹn gặp lại bạn sớm trên Try4T!' });
    router.push('/');
  }

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((part) => part[0])
        .slice(-2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-lg">
              Try<span className="text-primary">4T</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/courses"
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                pathname.startsWith('/courses') && 'bg-secondary text-foreground',
              )}
            >
              Khám phá
            </Link>
            {user && (
              <Link
                href="/my-courses"
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                  pathname.startsWith('/my-courses') && 'bg-secondary text-foreground',
                )}
              >
                Khóa học của tôi
              </Link>
            )}
            {(user?.role === Role.INSTRUCTOR || user?.role === Role.ADMIN) && (
              <Link
                href="/instructor/dashboard"
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                  pathname.startsWith('/instructor') && 'bg-secondary text-foreground',
                )}
              >
                Kênh Giảng viên
              </Link>
            )}
            {user?.role === Role.ADMIN && (
              <Link
                href="/admin/dashboard"
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                  pathname.startsWith('/admin') && 'bg-secondary text-foreground',
                )}
              >
                Quản trị
              </Link>
            )}
          </nav>
        </div>

        {/* Search desktop */}
        <form onSubmit={handleSearchSubmit} className="hidden max-w-sm flex-1 lg:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm khóa học Next.js, Java, System Design..."
              className="h-9 w-full rounded-full border border-border bg-secondary/60 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none"
            />
          </div>
        </form>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <ThemePalettePicker />

          <Button
            variant="ghost"
            size="icon"
            onClick={openCartDrawer}
            aria-label="Mở giỏ hàng"
            className="relative"
          >
            <ShoppingCart className="h-4 w-4" />
            {cartItemsCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground">
                {cartItemsCount}
              </span>
            )}
          </Button>

          {!isHydrated ? (
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm transition-colors hover:bg-secondary"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName}
                    referrerPolicy="no-referrer"
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {initials}
                  </span>
                )}
                <span className="hidden max-w-[120px] truncate font-medium sm:inline">
                  {user.fullName}
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-popover p-2 shadow-lg">
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="truncate text-sm font-semibold">{user.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    <Badge className="mt-2 font-mono text-[10px]">{user.role}</Badge>
                  </div>

                  <div className="mt-1 space-y-0.5">
                    <Link
                      href="/my-courses"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                    >
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      Khóa học của tôi
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        openProfileModal('profile');
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                    >
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                      Hồ sơ cá nhân
                    </button>
                    {(user.role === Role.INSTRUCTOR || user.role === Role.ADMIN) && (
                      <Link
                        href="/instructor/dashboard"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                      >
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                        Instructor Studio
                      </Link>
                    )}
                    {user.role === Role.ADMIN && (
                      <Link
                        href="/admin/dashboard"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                      >
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        Admin Console
                      </Link>
                    )}
                  </div>

                  <div className="mt-1 border-t border-border pt-1">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="ghost" size="sm" onClick={openLogin}>
                Đăng nhập
              </Button>
              <Button size="sm" onClick={openRegister}>
                Bắt đầu miễn phí
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Mở menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-border bg-card px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            <Link
              href="/courses"
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              Khám phá khóa học
            </Link>
            {user ? (
              <>
                <Link
                  href="/my-courses"
                  className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
                >
                  Khóa học của tôi
                </Link>
                {(user.role === Role.INSTRUCTOR || user.role === Role.ADMIN) && (
                  <Link
                    href="/instructor/dashboard"
                    className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    Kênh Giảng viên
                  </Link>
                )}
                {user.role === Role.ADMIN && (
                  <Link
                    href="/admin/dashboard"
                    className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    Quản trị hệ thống
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    openProfileModal('profile');
                  }}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-secondary"
                >
                  Hồ sơ cá nhân
                </button>
              </>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setMobileOpen(false);
                    openLogin();
                  }}
                >
                  Đăng nhập
                </Button>
                <Button
                  className="w-full"
                  onClick={() => {
                    setMobileOpen(false);
                    openRegister();
                  }}
                >
                  Đăng ký tài khoản
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
