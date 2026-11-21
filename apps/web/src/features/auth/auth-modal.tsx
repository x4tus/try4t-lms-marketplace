'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  MailCheck,
  Presentation,
  RefreshCw,
  Shield,
  Sparkles,
  User,
  UserCheck,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  Role,
  type AuthResponse,
  type ForgotPasswordInput,
  type LoginInput,
  type OtpChallengeResponse,
  type RegisterInput,
  type ResetPasswordInput,
} from '@try4t/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpInput } from '@/components/ui/otp-input';
import { PasswordInput, PasswordStrengthMeter } from '@/components/ui/password-input';
import { useThemePaletteStore } from '@/features/theme/theme-palette.store';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { useAuthModalStore } from './auth-modal.store';
import { consumePostLoginTarget } from './auth-redirect';
import { useAuthStore } from './auth.store';
import { SocialAuthButtons } from './social-auth-buttons';

type AuthStep = 'login' | 'register' | 'verify-otp' | 'forgot-email' | 'reset-otp';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@try4t.dev', icon: Shield },
  { label: 'Giảng viên', email: 'instructor@try4t.dev', icon: Sparkles },
  { label: 'Học viên', email: 'student@try4t.dev', icon: UserCheck },
];

export function AuthModal() {
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen, tab, setTab, close } = useAuthModalStore();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const hydrateFromUser = useThemePaletteStore((s) => s.hydrateFromUser);

  const [step, setStep] = React.useState<AuthStep>('login');
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = React.useState('');
  const [otpCode, setOtpCode] = React.useState('');
  const [cooldown, setCooldown] = React.useState(0);
  const [devOtpHint, setDevOtpHint] = React.useState<string | null>(null);
  const [verifyingOtp, setVerifyingOtp] = React.useState(false);
  const [resendingOtp, setResendingOtp] = React.useState(false);

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: Role.STUDENT,
    },
  });

  const forgotForm = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const resetForm = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '', code: '', newPassword: '', confirmPassword: '' },
  });

  const selectedRole = registerForm.watch('role');
  const regPassword = registerForm.watch('password') ?? '';
  const regConfirmPassword = registerForm.watch('confirmPassword') ?? '';
  const resetNewPassword = resetForm.watch('newPassword') ?? '';

  React.useEffect(() => {
    if (isOpen) {
      setStep(tab);
      setServerError(null);
    }
  }, [isOpen, tab]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function fillDemo(email: string) {
    loginForm.setValue('email', email, { shouldValidate: true });
    loginForm.setValue('password', 'Try4T@123', { shouldValidate: true });
    setServerError(null);
  }

  function applyAuthSuccess(data: AuthResponse, title: string, desc: string) {
    setSession(data);
    const mode = data.user.themeConfig?.mode;
    hydrateFromUser(
      data.user.themeConfig,
      mode === 'light' || mode === 'dark' ? mode : undefined,
    );
    notify.success(title, { description: desc });
    loginForm.reset();
    registerForm.reset();
    setOtpCode('');
    setDevOtpHint(null);
    close();

    // Quay dung ve trang truoc khi bam login (hoac Dashboard theo Role neu dang o trang chu/auth)
    const target = consumePostLoginTarget(data.user.role, pathname);
    if (target !== pathname) {
      router.push(target);
    }
  }

  async function onLoginSubmit(values: LoginInput) {
    setServerError(null);
    try {
      const data = await api.post<AuthResponse>('/auth/login', values, { skipAuthRefresh: true });
      applyAuthSuccess(
        data,
        `Chào mừng quay lại, ${data.user.fullName}!`,
        'Phiên học tập và bảng màu cá nhân của bạn đã được đồng bộ.',
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'EMAIL_NOT_VERIFIED') {
        const email = String(err.meta?.email ?? values.email);
        const wait = Number(err.meta?.cooldownSeconds ?? 60);
        const hint = err.meta?.devOtpHint ? String(err.meta.devOtpHint) : null;
        setPendingEmail(email);
        setCooldown(wait);
        setDevOtpHint(hint);
        setOtpCode('');
        setStep('verify-otp');
        notify.info('Email chưa được xác thực', {
          description: `Nhập mã OTP 6 số vừa gửi tới ${email} để kích hoạt tài khoản.`,
        });
        return;
      }

      const message =
        err instanceof ApiClientError ? err.message : 'Không thể kết nối máy chủ Try4T';
      setServerError(message);
    }
  }

  async function onRegisterSubmit(values: RegisterInput) {
    setServerError(null);
    try {
      const res = await api.post<OtpChallengeResponse>('/auth/register', values, {
        skipAuthRefresh: true,
      });
      setPendingEmail(res.email);
      setCooldown(res.cooldownSeconds);
      setDevOtpHint(res.devOtpHint ?? null);
      setOtpCode('');
      setStep('verify-otp');
      notify.success('Đã gửi mã xác thực 6 số!', {
        description:
          res.deliveryChannel === 'dev'
            ? 'Đang ở chế độ Dev — xem mã OTP hiển thị ngay trên hộp thoại.'
            : `Kiểm tra hộp thư (hoặc thư rác) của ${res.email}.`,
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Không thể đăng ký lúc này, thử lại sau';
      setServerError(message);
    }
  }

  async function handleVerifyEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setServerError('Vui lòng nhập đủ 6 chữ số OTP');
      return;
    }
    setServerError(null);
    setVerifyingOtp(true);
    try {
      const data = await api.post<AuthResponse>(
        '/auth/verify-email',
        { email: pendingEmail, code: otpCode },
        { skipAuthRefresh: true },
      );
      applyAuthSuccess(
        data,
        'Xác thực email thành công!',
        `Chào mừng ${data.user.fullName} gia nhập nền tảng Try4T.`,
      );
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Xác thực OTP thất bại');
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleResendOtp(purpose: 'REGISTER_VERIFY' | 'RESET_PASSWORD') {
    if (cooldown > 0 || !pendingEmail) return;
    setResendingOtp(true);
    setServerError(null);
    try {
      const res = await api.post<OtpChallengeResponse>(
        '/auth/resend-otp',
        { email: pendingEmail, purpose },
        { skipAuthRefresh: true },
      );
      setCooldown(res.cooldownSeconds);
      setDevOtpHint(res.devOtpHint ?? null);
      notify.success('Đã gửi lại mã OTP mới', {
        description: `Mã mới có hiệu lực trong ${res.expiresInMinutes} phút.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'OTP_COOLDOWN') {
        const wait = Number(err.meta?.retryAfterSec ?? 60);
        setCooldown(wait);
      }
      setServerError(err instanceof ApiClientError ? err.message : 'Không thể gửi lại mã');
    } finally {
      setResendingOtp(false);
    }
  }

  async function onForgotSubmit(values: ForgotPasswordInput) {
    setServerError(null);
    try {
      const res = await api.post<OtpChallengeResponse>('/auth/forgot-password', values, {
        skipAuthRefresh: true,
      });
      setPendingEmail(values.email);
      setCooldown(res.cooldownSeconds);
      setDevOtpHint(res.devOtpHint ?? null);
      resetForm.reset({ email: values.email, code: '', newPassword: '', confirmPassword: '' });
      setStep('reset-otp');
      notify.info('Đã gửi mã khôi phục mật khẩu', {
        description: `Nếu email ${values.email} tồn tại, mã OTP 6 số đã được gửi tới hộp thư.`,
      });
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Gửi yêu cầu thất bại');
    }
  }

  async function onResetSubmit(values: ResetPasswordInput) {
    setServerError(null);
    try {
      await api.post('/auth/reset-password', values, { skipAuthRefresh: true });
      notify.success('Đặt lại mật khẩu thành công!', {
        description: 'Tất cả phiên cũ đã được đăng xuất. Hãy đăng nhập bằng mật khẩu mới.',
      });
      loginForm.setValue('email', values.email);
      loginForm.setValue('password', '');
      setDevOtpHint(null);
      setStep('login');
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Đặt lại mật khẩu thất bại');
    }
  }

  const headerMeta: Record<AuthStep, { title: string; desc: string }> = {
    login: {
      title: 'Đăng nhập Try4T',
      desc: 'Chào mừng quay lại! Đăng nhập ngay mà không làm gián đoạn trang hiện tại.',
    },
    register: {
      title: 'Tạo tài khoản Try4T',
      desc: 'Xác thực email bằng OTP 6 số nhanh gọn để bảo vệ tài khoản học tập.',
    },
    'verify-otp': {
      title: 'Xác thực địa chỉ Email',
      desc: `Nhập mã 6 chữ số đã gửi tới ${pendingEmail}`,
    },
    'forgot-email': {
      title: 'Quên mật khẩu',
      desc: 'Nhập email đăng ký để nhận mã OTP 6 số đặt lại mật khẩu mới.',
    },
    'reset-otp': {
      title: 'Tạo mật khẩu mới',
      desc: `Nhập mã OTP gửi tới ${pendingEmail} cùng mật khẩu mới của bạn.`,
    },
  };

  // Bao ve lop 2: da dang nhap thi tuyet doi khong render Pop-up Login/Register
  if (user) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={close}
      title={headerMeta[step].title}
      description={headerMeta[step].desc}
      maxWidthClass="max-w-md"
    >
      {/* Tabs only for Login / Register */}
      {(step === 'login' || step === 'register') && (
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-secondary p-1">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setStep('login');
              setServerError(null);
            }}
            className={cn(
              'cursor-pointer rounded-lg py-2 text-sm font-medium transition-all',
              step === 'login'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setStep('register');
              setServerError(null);
            }}
            className={cn(
              'cursor-pointer rounded-lg py-2 text-sm font-medium transition-all',
              step === 'register'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Đăng ký
          </button>
        </div>
      )}

      {/* STEP 1: LOGIN */}
      {step === 'login' && (
        <div className="space-y-4">
          <SocialAuthButtons mode="login" />
          <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-3.5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="modal-login-email">Email</Label>
              <Input
                id="modal-login-email"
                type="email"
                placeholder="ban@example.com"
                autoComplete="email"
                {...loginForm.register('email')}
              />
              {loginForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {loginForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="modal-login-password">Mật khẩu</Label>
                <button
                  type="button"
                  onClick={() => {
                    setServerError(null);
                    forgotForm.setValue('email', loginForm.getValues('email') || '');
                    setStep('forgot-email');
                  }}
                  className="cursor-pointer text-xs font-medium text-primary hover:underline"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <PasswordInput
                id="modal-login-password"
                placeholder="Nhập mật khẩu của bạn"
                autoComplete="current-password"
                {...loginForm.register('password')}
              />
              {loginForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {loginForm.formState.errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-2.5 text-xs leading-relaxed text-destructive">
                {serverError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
              {loginForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Đăng nhập
            </Button>
          </form>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-center text-xs text-muted-foreground">
              Điền nhanh tài khoản Demo (<code className="font-mono">Try4T@123</code>)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const Icon = acc.icon;
                return (
                  <Button
                    key={acc.email}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fillDemo(acc.email)}
                    className="h-8 text-xs"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {acc.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: REGISTER */}
      {step === 'register' && (
        <div className="space-y-4">
          <SocialAuthButtons mode="register" />
          <form
            onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
            className="space-y-3.5"
            noValidate
          >
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => registerForm.setValue('role', Role.STUDENT)}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all',
                selectedRole === Role.STUDENT
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-secondary',
              )}
            >
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Học viên</span>
              <span className="text-[11px] text-muted-foreground">Học &amp; nhận chứng chỉ</span>
            </button>

            <button
              type="button"
              onClick={() => registerForm.setValue('role', Role.INSTRUCTOR)}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all',
                selectedRole === Role.INSTRUCTOR
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-secondary',
              )}
            >
              <Presentation className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Giảng viên</span>
              <span className="text-[11px] text-muted-foreground">Bán khóa &amp; chia sẻ 70%</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-reg-name">Họ và tên</Label>
            <Input
              id="modal-reg-name"
              placeholder="Đặng Đình Anh Tú"
              autoComplete="name"
              {...registerForm.register('fullName')}
            />
            {registerForm.formState.errors.fullName && (
              <p className="text-xs text-destructive">
                {registerForm.formState.errors.fullName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-reg-email">Email</Label>
            <Input
              id="modal-reg-email"
              type="email"
              placeholder="ban@example.com"
              autoComplete="email"
              {...registerForm.register('email')}
            />
            {registerForm.formState.errors.email && (
              <p className="text-xs text-destructive">
                {registerForm.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-reg-password">Mật khẩu</Label>
            <PasswordInput
              id="modal-reg-password"
              placeholder="Ít nhất 8 ký tự (gồm chữ & số)"
              autoComplete="new-password"
              {...registerForm.register('password')}
            />
            <PasswordStrengthMeter password={regPassword} />
            {registerForm.formState.errors.password && (
              <p className="text-xs text-destructive">
                {registerForm.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-reg-confirm">Xác nhận mật khẩu</Label>
            <PasswordInput
              id="modal-reg-confirm"
              placeholder="Nhập lại mật khẩu phía trên"
              autoComplete="new-password"
              {...registerForm.register('confirmPassword')}
            />
            {regConfirmPassword && regConfirmPassword === regPassword && (
              <p className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Mật khẩu xác nhận đã khớp
              </p>
            )}
            {registerForm.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {registerForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-2.5 text-xs leading-relaxed text-destructive">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={registerForm.formState.isSubmitting}>
            {registerForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Tiếp tục &amp; Xác thực Email
          </Button>
          </form>
        </div>
      )}

      {/* STEP 3: VERIFY EMAIL OTP */}
      {step === 'verify-otp' && (
        <form onSubmit={handleVerifyEmailOtp} className="space-y-5">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <MailCheck className="h-6 w-6" />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Mã OTP 6 chữ số có hiệu lực trong <strong>10 phút</strong> (nhập sai tối đa 5 lần).
              Bạn có thể dán trực tiếp cả 6 số từ email.
            </p>
          </div>

          {devOtpHint && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <span>
                Chế độ Dev (chưa điền SMTP): Mã OTP là{' '}
                <strong className="font-mono text-sm tracking-widest">{devOtpHint}</strong>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setOtpCode(devOtpHint)}
              >
                Điền nhanh
              </Button>
            </div>
          )}

          <OtpInput value={otpCode} onChange={setOtpCode} disabled={verifyingOtp} />

          {serverError && (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-2.5 text-center text-xs text-destructive">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={verifyingOtp || otpCode.length !== 6}>
            {verifyingOtp && <Loader2 className="h-4 w-4 animate-spin" />}
            Xác thực &amp; Đăng nhập ngay
          </Button>

          <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setServerError(null);
                setStep('register');
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Đổi email khác
            </button>

            <button
              type="button"
              disabled={cooldown > 0 || resendingOtp}
              onClick={() => handleResendOtp('REGISTER_VERIFY')}
              className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', resendingOtp && 'animate-spin')} />
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã OTP'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 4: FORGOT PASSWORD (ENTER EMAIL) */}
      {step === 'forgot-email' && (
        <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="modal-forgot-email">Email tài khoản</Label>
            <Input
              id="modal-forgot-email"
              type="email"
              placeholder="ban@example.com"
              {...forgotForm.register('email')}
            />
            {forgotForm.formState.errors.email && (
              <p className="text-xs text-destructive">
                {forgotForm.formState.errors.email.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={forgotForm.formState.isSubmitting}>
            {forgotForm.formState.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Gửi mã OTP khôi phục
          </Button>

          <button
            type="button"
            onClick={() => {
              setServerError(null);
              setStep('login');
            }}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quay lại đăng nhập
          </button>
        </form>
      )}

      {/* STEP 5: RESET PASSWORD WITH OTP */}
      {step === 'reset-otp' && (
        <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4" noValidate>
          {devOtpHint && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <span>
                Dev OTP: <strong className="font-mono tracking-widest">{devOtpHint}</strong>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => resetForm.setValue('code', devOtpHint, { shouldValidate: true })}
              >
                Điền nhanh
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Mã xác thực 6 chữ số</Label>
            <OtpInput
              value={resetForm.watch('code') ?? ''}
              onChange={(v) => resetForm.setValue('code', v, { shouldValidate: true })}
              disabled={resetForm.formState.isSubmitting}
            />
            {resetForm.formState.errors.code && (
              <p className="text-center text-xs text-destructive">
                {resetForm.formState.errors.code.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-reset-pass">Mật khẩu mới</Label>
            <PasswordInput
              id="modal-reset-pass"
              placeholder="Ít nhất 8 ký tự (gồm chữ & số)"
              autoComplete="new-password"
              {...resetForm.register('newPassword')}
            />
            <PasswordStrengthMeter password={resetNewPassword} />
            {resetForm.formState.errors.newPassword && (
              <p className="text-xs text-destructive">
                {resetForm.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-reset-confirm">Xác nhận mật khẩu mới</Label>
            <PasswordInput
              id="modal-reset-confirm"
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              {...resetForm.register('confirmPassword')}
            />
            {resetForm.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {resetForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={resetForm.formState.isSubmitting}>
            {resetForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Đặt lại mật khẩu
          </Button>

          <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
            <button
              type="button"
              onClick={() => setStep('login')}
              className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Đăng nhập
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || resendingOtp}
              onClick={() => handleResendOtp('RESET_PASSWORD')}
              className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', resendingOtp && 'animate-spin')} />
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
