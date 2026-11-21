import { Role } from '@try4t/shared';

const RETURN_PATH_KEY = 'try4t_post_login_path';

export function getDefaultHomeByRole(role: Role): string {
  if (role === Role.ADMIN) return '/admin/dashboard';
  if (role === Role.INSTRUCTOR) return '/instructor/dashboard';
  return '/my-courses';
}

export function rememberReturnPath(pathname: string, search = '') {
  if (typeof window === 'undefined') return;
  const full = search ? `${pathname}${search}` : pathname;
  // Khong luu cac trang auth/callback tam thoi lam trang quay lai
  if (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/oauth/')
  ) {
    return;
  }
  try {
    window.sessionStorage.setItem(RETURN_PATH_KEY, full);
  } catch {
    // ignore storage errors
  }
}

export function consumePostLoginTarget(role: Role, currentPathname: string): string {
  let savedPath: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      savedPath = window.sessionStorage.getItem(RETURN_PATH_KEY);
      window.sessionStorage.removeItem(RETURN_PATH_KEY);
    } catch {
      savedPath = null;
    }
  }

  const candidate = savedPath || currentPathname;

  // Neu nguoi dung dang o trang chu hoac trang dang nhap/callback -> nhay vao Dashboard dung Role
  if (
    !candidate ||
    candidate === '/' ||
    candidate === '/login' ||
    candidate === '/register' ||
    candidate.startsWith('/oauth/')
  ) {
    return getDefaultHomeByRole(role);
  }

  // Nguoc lai, giu dung trang nguoi dung dang xem truoc khi bam login!
  return candidate;
}
