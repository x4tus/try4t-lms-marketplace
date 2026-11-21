'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Palette,
  PlayCircle,
  Presentation,
  RotateCcw,
  Save,
  Shield,
  Sliders,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
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
import { ImageCropModal } from '@/components/ui/image-crop-modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  ACCENT_PRESETS,
  DARK_BACKGROUND_PRESETS,
  DEFAULT_ACCENT,
  DEFAULT_DARK_BG,
  DEFAULT_LIGHT_BG,
  isLightColor,
  LIGHT_BACKGROUND_PRESETS,
  resolveActiveBackground,
} from '@/features/theme/theme-palette';
import { useThemePaletteStore } from '@/features/theme/theme-palette.store';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { useAuthStore } from './auth.store';
import { InstructorApplicationForm } from './instructor-application-form';

export type AccountSettingsTab = 'profile' | 'appearance' | 'security' | 'privacy' | 'instructor';

interface ProfileModalState {
  isOpen: boolean;
  tab: AccountSettingsTab;
  open: (tab?: AccountSettingsTab) => void;
  close: () => void;
}

export const useProfileModalStore = create<ProfileModalState>((set) => ({
  isOpen: false,
  tab: 'profile',
  open: (tab = 'profile') => set({ isOpen: true, tab }),
  close: () => set({ isOpen: false }),
}));

interface SecuritySummary {
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  connectedProviders: string[];
  activeSessionsCount: number;
  createdAt: string;
}

const MODE_OPTIONS = [
  { value: 'light' as const, label: 'Sáng', icon: Sun },
  { value: 'dark' as const, label: 'Tối', icon: Moon },
  { value: 'system' as const, label: 'Hệ thống', icon: Monitor },
];

const FONT_SCALE_OPTIONS = [
  { value: 'sm' as const, label: 'Nhỏ gọn', sample: 'Aa' },
  { value: 'md' as const, label: 'Tiêu chuẩn', sample: 'Aa' },
  { value: 'lg' as const, label: 'Chữ lớn', sample: 'Aa' },
];

const DENSITY_OPTIONS = [
  { value: 'compact' as const, label: 'Gọn gàng' },
  { value: 'comfortable' as const, label: 'Tiêu chuẩn' },
  { value: 'spacious' as const, label: 'Thoáng rộng' },
];

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 transition-colors hover:bg-secondary/40">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

export function ProfileModal() {
  const { isOpen, tab, open, close } = useProfileModalStore();
  const { user, setUser, logout } = useAuthStore();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { palette, isSaving: isSavingPalette, setPalette, resetPalette } = useThemePaletteStore();

  const [avatarCropOpen, setAvatarCropOpen] = React.useState(false);
  const [savingAvatar, setSavingAvatar] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  // Security state
  const [security, setSecurity] = React.useState<SecuritySummary | null>(null);
  const [loadingSecurity, setLoadingSecurity] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [changingPassword, setChangingPassword] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const activeTab: AccountSettingsTab = !user ? 'appearance' : tab;

  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: user?.fullName ?? '',
      headline: user?.headline ?? '',
      bio: user?.bio ?? '',
    },
  });

  React.useEffect(() => {
    if (!isOpen || !user || activeTab !== 'security') return;
    let cancelled = false;
    setLoadingSecurity(true);
    api
      .get<SecuritySummary>('/users/me/security')
      .then((res) => {
        if (!cancelled) setSecurity(res);
      })
      .catch(() => {
        // silent fallback
      })
      .finally(() => {
        if (!cancelled) setLoadingSecurity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, activeTab]);

  const currentMode: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';
  const selectedThemeSetting = (theme as 'light' | 'dark' | 'system' | undefined) ?? 'system';
  const activeBg = resolveActiveBackground(palette, currentMode);
  const activeAccent = palette.accentColor ?? null;
  const presets = currentMode === 'dark' ? DARK_BACKGROUND_PRESETS : LIGHT_BACKGROUND_PRESETS;

  const privacy = {
    showPublicProfile: palette.privacy?.showPublicProfile ?? true,
    showLearningActivity: palette.privacy?.showLearningActivity ?? true,
    showCertificatesOnProfile: palette.privacy?.showCertificatesOnProfile ?? true,
  };

  const learningPrefs = {
    defaultPlaybackSpeed: palette.learning?.defaultPlaybackSpeed ?? 1,
    autoPlayNextLesson: palette.learning?.autoPlayNextLesson ?? true,
    theaterModeDefault: palette.learning?.theaterModeDefault ?? false,
  };

  const notifPrefs = {
    emailCourseUpdates: palette.notifications?.emailCourseUpdates ?? true,
    emailQaReplies: palette.notifications?.emailQaReplies ?? true,
    emailMarketing: palette.notifications?.emailMarketing ?? false,
  };

  function handleModeChange(nextMode: 'light' | 'dark' | 'system') {
    setTheme(nextMode);
    const effectiveMode: 'light' | 'dark' =
      nextMode === 'system'
        ? typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : nextMode;

    void setPalette(
      { mode: nextMode },
      {
        resolvedMode: effectiveMode,
        persistToAccount: Boolean(user),
        onUserUpdated: setUser,
      },
    );
  }

  function handleBackgroundChange(hex: string) {
    const isHexLight = isLightColor(hex);
    const targetMode: 'light' | 'dark' = isHexLight ? 'light' : 'dark';
    setTheme(targetMode);

    void setPalette(
      isHexLight
        ? { lightBackground: hex, mode: 'light' }
        : { darkBackground: hex, mode: 'dark' },
      {
        resolvedMode: targetMode,
        persistToAccount: Boolean(user),
        onUserUpdated: setUser,
      },
    );
  }

  function handleAccentChange(hex: string | null) {
    void setPalette(
      { accentColor: hex },
      {
        resolvedMode: currentMode,
        persistToAccount: Boolean(user),
        onUserUpdated: setUser,
      },
    );
  }

  async function handleResetAppearance() {
    setTheme('system');
    const systemMode: 'light' | 'dark' =
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    await resetPalette({
      resolvedMode: systemMode,
      persistToAccount: Boolean(user),
      onUserUpdated: setUser,
      appearanceOnly: true,
    });
    notify.success('Đã khôi phục giao diện mặc định');
  }

  async function handleAvatarUploaded(url: string) {
    if (!user) return;
    setSavingAvatar(true);
    try {
      const updated = await api.patch<AuthUser>('/users/me', { avatarUrl: url });
      setUser(updated);
      notify.success('Đã cập nhật ảnh đại diện mới!');
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Không thể lưu ảnh đại diện');
    } finally {
      setSavingAvatar(false);
    }
  }

  async function onSaveProfile(values: UpdateProfileInput) {
    try {
      const updated = await api.patch<AuthUser>('/users/me', values);
      setUser(updated);
      notify.success('Đã cập nhật hồ sơ cá nhân');
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Cập nhật thất bại');
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      notify.error('Mật khẩu mới phải có tối thiểu 8 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify.error('Mật khẩu xác nhận không khớp');
      return;
    }
    if (security?.hasPassword && !currentPassword) {
      notify.error('Vui lòng nhập mật khẩu hiện tại');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.post<{ message: string }>('/users/me/change-password', {
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      notify.success(res.message || 'Đã cập nhật mật khẩu thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecurity((prev) => (prev ? { ...prev, hasPassword: true } : prev));
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setChangingPassword(false);
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

  const navItems: Array<{
    key: AccountSettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }> = [
    { key: 'profile', label: 'Hồ sơ cá nhân', icon: UserIcon, visible: Boolean(user) },
    { key: 'appearance', label: 'Giao diện & Hiển thị', icon: Palette, visible: true },
    { key: 'security', label: 'Tài khoản & Bảo mật', icon: Shield, visible: Boolean(user) },
    { key: 'privacy', label: 'Riêng tư & Học tập', icon: Sliders, visible: Boolean(user) },
    {
      key: 'instructor',
      label: 'Trở thành Giảng viên',
      icon: Presentation,
      visible: user?.role === Role.STUDENT,
    },
  ];

  const visibleTabs = navItems.filter((item) => item.visible);

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((p) => p[0])
        .slice(-2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={close}
        title={user ? 'Cài đặt tài khoản & Giao diện' : 'Tùy chỉnh giao diện Try4T'}
        description={
          user
            ? `${user.email} • Vai trò: ${user.role} — Mọi tùy chỉnh được đồng bộ riêng theo tài khoản`
            : 'Đăng nhập để đồng bộ bảng màu, cỡ chữ và sở thích học tập trên mọi thiết bị.'
        }
        maxWidthClass="max-w-3xl"
      >
        <div className="flex flex-col gap-5 md:flex-row">
          {/* Left sidebar nav (vertical on desktop, pill row on mobile) */}
          {visibleTabs.length > 1 && (
            <aside className="flex shrink-0 gap-1 overflow-x-auto pb-1 md:w-52 md:flex-col md:overflow-visible md:border-r md:border-border md:pb-0 md:pr-4">
              {visibleTabs.map((item) => {
                const Icon = item.icon;
                const selected = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => open(item.key)}
                    className={cn(
                      'flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}

              {isSavingPalette && (
                <div className="mt-auto hidden items-center gap-1.5 px-3 pt-4 text-[11px] text-muted-foreground md:flex">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Đang đồng bộ...
                </div>
              )}
            </aside>
          )}

          {/* Main settings pane */}
          <div className="min-w-0 flex-1">
            {/* TAB 1: PROFILE */}
            {activeTab === 'profile' && user && (
              <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
                {/* Avatar header card with direct Crop / Re-crop */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-secondary/35 p-4">
                  <div className="flex items-center gap-3.5">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-primary/40 bg-primary/10">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt={user.fullName}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-bold text-primary">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      <Badge variant="success" className="mt-1 font-mono text-[10px]">
                        {user.role}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAvatarCropOpen(true)}
                    disabled={savingAvatar}
                  >
                    {savingAvatar ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    {user.avatarUrl ? 'Cắt lại / Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pm-bio">Giới thiệu bản thân</Label>
                  <RichTextEditor
                    id="pm-bio"
                    rows={4}
                    compact
                    value={profileForm.watch('bio') ?? ''}
                    onChange={(val) => profileForm.setValue('bio', val, { shouldDirty: true })}
                    placeholder="Chia sẻ kinh nghiệm, kỹ năng hoặc mục tiêu học tập của bạn..."
                  />
                </div>

                <div className="flex justify-end border-t border-border pt-3">
                  <Button type="submit" size="sm" disabled={profileForm.formState.isSubmitting}>
                    {profileForm.formState.isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Lưu hồ sơ
                  </Button>
                </div>
              </form>
            )}

            {/* TAB 2: APPEARANCE (Merged ThemePalettePicker + Font Scale + Density + Motion) */}
            {activeTab === 'appearance' && (
              <div className="space-y-5">
                {/* Mode */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Chế độ Sáng / Tối</Label>
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-secondary p-1">
                    {MODE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = mounted && selectedThemeSetting === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleModeChange(opt.value)}
                          className={cn(
                            'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all',
                            active
                              ? 'bg-card text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Background color */}
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      Màu nền ({currentMode === 'dark' ? 'Chế độ Tối' : 'Chế độ Sáng'})
                    </span>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary">
                      <input
                        type="color"
                        aria-label="Chọn màu nền tự do"
                        value={
                          activeBg ?? (currentMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG)
                        }
                        onChange={(e) => handleBackgroundChange(e.target.value)}
                        className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span className="font-mono">{activeBg ?? 'Mặc định'}</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {presets.map((preset) => {
                      const selected =
                        activeBg?.toLowerCase() === preset.hex.toLowerCase() ||
                        (!activeBg &&
                          ((currentMode === 'light' && preset.hex === DEFAULT_LIGHT_BG) ||
                            (currentMode === 'dark' && preset.hex === DEFAULT_DARK_BG)));
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => handleBackgroundChange(preset.hex)}
                          className={cn(
                            'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all',
                            selected
                              ? 'border-primary bg-secondary/70 ring-1 ring-primary'
                              : 'border-border hover:bg-secondary/50',
                          )}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/15"
                            style={{ backgroundColor: preset.hex }}
                          >
                            {selected && (
                              <Check
                                className="h-3.5 w-3.5"
                                style={{
                                  color: isLightColor(preset.hex) ? '#09090b' : '#ffffff',
                                }}
                              />
                            )}
                          </span>
                          <span className="truncate text-xs font-medium">{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Nền Sáng và nền Tối được lưu độc lập cho tài khoản của bạn.
                  </p>
                </div>

                {/* Accent color */}
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Màu nhấn chủ đạo</span>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary">
                      <input
                        type="color"
                        aria-label="Chọn màu nhấn tự do"
                        value={activeAccent ?? DEFAULT_ACCENT}
                        onChange={(e) => handleAccentChange(e.target.value)}
                        className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span className="font-mono">{activeAccent ?? DEFAULT_ACCENT}</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_PRESETS.map((preset) => {
                      const effectiveAccent = activeAccent ?? DEFAULT_ACCENT;
                      const selected = effectiveAccent.toLowerCase() === preset.hex.toLowerCase();
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleAccentChange(preset.hex)}
                          title={preset.name}
                          className={cn(
                            'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-110',
                            selected
                              ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card'
                              : 'border-border',
                          )}
                          style={{ background: preset.hex }}
                        >
                          {selected && (
                            <Check
                              className="h-4 w-4"
                              style={{ color: isLightColor(preset.hex) ? '#09090b' : '#ffffff' }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font scale + Density + Reduced motion */}
                <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <span className="text-xs font-semibold">Cỡ chữ toàn trang</span>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
                      {FONT_SCALE_OPTIONS.map((opt) => {
                        const selected = (palette.fontScale ?? 'md') === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              void setPalette(
                                { fontScale: opt.value },
                                {
                                  resolvedMode: currentMode,
                                  persistToAccount: Boolean(user),
                                  onUserUpdated: setUser,
                                },
                              )
                            }
                            className={cn(
                              'cursor-pointer rounded-lg py-1.5 text-center text-xs font-medium transition-all',
                              selected
                                ? 'bg-card text-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold">Bo góc &amp; Mật độ</span>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
                      {DENSITY_OPTIONS.map((opt) => {
                        const selected = (palette.density ?? 'comfortable') === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              void setPalette(
                                { density: opt.value },
                                {
                                  resolvedMode: currentMode,
                                  persistToAccount: Boolean(user),
                                  onUserUpdated: setUser,
                                },
                              )
                            }
                            className={cn(
                              'cursor-pointer rounded-lg py-1.5 text-center text-xs font-medium transition-all',
                              selected
                                ? 'bg-card text-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <ToggleRow
                  label="Giảm hiệu ứng chuyển động (Reduced Motion)"
                  description="Tắt bớt animation mượt trên toàn hệ thống, giúp phản hồi tức thì và đỡ mỏi mắt."
                  checked={Boolean(palette.reducedMotion)}
                  onChange={(next) =>
                    void setPalette(
                      { reducedMotion: next },
                      {
                        resolvedMode: currentMode,
                        persistToAccount: Boolean(user),
                        onUserUpdated: setUser,
                      },
                    )
                  }
                />

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAppearance}
                    className="gap-1.5 text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Khôi phục mặc định
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {user ? 'Tự động lưu vào tài khoản' : 'Đang lưu cục bộ trên trình duyệt'}
                  </span>
                </div>
              </div>
            )}

            {/* TAB 3: ACCOUNT & SECURITY */}
            {activeTab === 'security' && user && (
              <div className="space-y-5">
                {/* Account Security Status */}
                <div className="rounded-xl border border-border bg-secondary/35 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tổng quan bảo mật
                    </p>
                    {loadingSecurity && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  </div>

                  <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-card p-2.5">
                      <p className="text-[11px] text-muted-foreground">Email xác thực</p>
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        {security
                          ? security.emailVerified
                            ? 'Đã xác thực'
                            : 'Chưa xác thực'
                          : 'Đang kiểm tra...'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-2.5">
                      <p className="text-[11px] text-muted-foreground">Liên kết OAuth</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {security?.connectedProviders && security.connectedProviders.length > 0 ? (
                          security.connectedProviders.map((p) => (
                            <Badge key={p} variant="secondary" className="text-[10px] capitalize">
                              {p}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Email / Mật khẩu</span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-2.5">
                      <p className="text-[11px] text-muted-foreground">Phiên đang hoạt động</p>
                      <p className="mt-1 font-mono text-xs font-semibold">
                        {security?.activeSessionsCount ?? 1} thiết bị
                      </p>
                    </div>
                  </div>
                </div>

                {/* Password form */}
                <form
                  onSubmit={handleChangePassword}
                  className="space-y-3 rounded-xl border border-border bg-card/70 p-4"
                >
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">
                      {security?.hasPassword === false
                        ? 'Thiết lập mật khẩu đăng nhập'
                        : 'Đổi mật khẩu tài khoản'}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {security?.hasPassword === false
                      ? 'Tài khoản của bạn tạo qua Google/GitHub. Bạn có thể tạo mật khẩu riêng để đăng nhập bằng email bất cứ lúc nào.'
                      : 'Nên dùng mật khẩu mạnh tối thiểu 8 ký tự gồm chữ hoa, chữ thường và số.'}
                  </p>

                  {security?.hasPassword !== false && (
                    <div className="space-y-1.5">
                      <Label htmlFor="sec-cur-pw">Mật khẩu hiện tại</Label>
                      <Input
                        id="sec-cur-pw"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="sec-new-pw">Mật khẩu mới</Label>
                      <Input
                        id="sec-new-pw"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Tối thiểu 8 ký tự"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sec-confirm-pw">Xác nhận mật khẩu mới</Label>
                      <Input
                        id="sec-confirm-pw"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu mới"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button type="submit" size="sm" disabled={changingPassword}>
                      {changingPassword ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      {security?.hasPassword === false ? 'Tạo mật khẩu' : 'Cập nhật mật khẩu'}
                    </Button>
                  </div>
                </form>

                {/* Danger / Session revoke */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div>
                    <p className="text-xs font-semibold text-destructive">
                      Thu hồi toàn bộ phiên đăng nhập
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Đăng xuất ngay lập tức khỏi mọi trình duyệt và thiết bị đang dùng tài khoản này.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLogoutAll}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Đăng xuất tất cả
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 4: PRIVACY, LEARNING & NOTIFICATIONS */}
            {activeTab === 'privacy' && user && (
              <div className="space-y-5">
                {/* Privacy */}
                <div className="space-y-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Eye className="h-3.5 w-3.5 text-primary" /> Quyền riêng tư
                  </p>
                  <ToggleRow
                    label="Hiển thị hồ sơ công khai"
                    description="Cho phép học viên & giảng viên khác xem tên, chức danh và phần giới thiệu của bạn."
                    checked={privacy.showPublicProfile}
                    onChange={(next) =>
                      void setPalette(
                        { privacy: { showPublicProfile: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                  <ToggleRow
                    label="Hiển thị tiến độ & hoạt động học tập"
                    description="Cho phép chia sẻ trạng thái hoàn thành bài học và thứ hạng đóng góp trong phần Q&A."
                    checked={privacy.showLearningActivity}
                    onChange={(next) =>
                      void setPalette(
                        { privacy: { showLearningActivity: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                  <ToggleRow
                    label="Công khai chứng chỉ đã đạt trên hồ sơ"
                    description="Chứng chỉ có mã QR xác thực vẫn luôn tra cứu được khi bạn gửi link trực tiếp."
                    checked={privacy.showCertificatesOnProfile}
                    onChange={(next) =>
                      void setPalette(
                        { privacy: { showCertificatesOnProfile: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                </div>

                {/* Learning experience */}
                <div className="space-y-2.5 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <PlayCircle className="h-3.5 w-3.5 text-primary" /> Tùy chọn Phòng học thông minh
                  </p>

                  <div className="rounded-xl border border-border bg-card/70 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Tốc độ phát video mặc định</p>
                        <p className="text-[11px] text-muted-foreground">
                          Tự động áp dụng mỗi khi bạn mở video bài giảng mới.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {SPEED_OPTIONS.map((sp) => {
                          const active = learningPrefs.defaultPlaybackSpeed === sp;
                          return (
                            <button
                              key={sp}
                              type="button"
                              onClick={() =>
                                void setPalette(
                                  { learning: { defaultPlaybackSpeed: sp } },
                                  {
                                    resolvedMode: currentMode,
                                    persistToAccount: true,
                                    onUserUpdated: setUser,
                                  },
                                )
                              }
                              className={cn(
                                'cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors',
                                active
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {sp}x
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <ToggleRow
                    label="Tự động chuyển sang bài học tiếp theo"
                    description="Khi xem xong video hoặc hoàn thành bài học, tự động mở bài kế tiếp (nếu đã mở khóa)."
                    checked={learningPrefs.autoPlayNextLesson}
                    onChange={(next) =>
                      void setPalette(
                        { learning: { autoPlayNextLesson: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                  <ToggleRow
                    label="Mở phòng học ở chế độ Rạp chiếu phim mặc định"
                    description="Mở rộng khung video tối đa để tập trung học, ẩn thanh mục lục sang một bên."
                    checked={learningPrefs.theaterModeDefault}
                    onChange={(next) =>
                      void setPalette(
                        { learning: { theaterModeDefault: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                </div>

                {/* Notifications */}
                <div className="space-y-2.5 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Bell className="h-3.5 w-3.5 text-primary" /> Thông báo qua Email
                  </p>
                  <ToggleRow
                    label="Cập nhật bài giảng & phiên bản mới"
                    description="Nhận thông báo khi giảng viên thêm bài học mới hoặc cập nhật nội dung khóa học đã mua."
                    checked={notifPrefs.emailCourseUpdates}
                    onChange={(next) =>
                      void setPalette(
                        { notifications: { emailCourseUpdates: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                  <ToggleRow
                    label="Phản hồi câu hỏi Q&A"
                    description="Báo ngay khi giảng viên hoặc học viên khác trả lời thắc mắc của bạn."
                    checked={notifPrefs.emailQaReplies}
                    onChange={(next) =>
                      void setPalette(
                        { notifications: { emailQaReplies: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                  <ToggleRow
                    label="Tin tức ưu đãi & mã giảm giá"
                    description="Nhận thông báo các đợt khuyến mãi và khóa học thực chiến mới ra mắt."
                    checked={notifPrefs.emailMarketing}
                    onChange={(next) =>
                      void setPalette(
                        { notifications: { emailMarketing: next } },
                        {
                          resolvedMode: currentMode,
                          persistToAccount: true,
                          onUserUpdated: setUser,
                        },
                      )
                    }
                  />
                </div>
              </div>
            )}

            {/* TAB 5: BECOME INSTRUCTOR */}
            {activeTab === 'instructor' && user && user.role === Role.STUDENT && (
              <InstructorApplicationForm onSubmitted={close} />
            )}
          </div>
        </div>
      </Dialog>

      {/* 1:1 Round Avatar Cropper Modal */}
      {user && (
        <ImageCropModal
          open={avatarCropOpen}
          onClose={() => setAvatarCropOpen(false)}
          currentUrl={user.avatarUrl}
          onUploaded={handleAvatarUploaded}
          aspect={1}
          cropShape="round"
          outputWidth={512}
          outputHeight={512}
          fileName="user-avatar-1x1.webp"
          title="Ảnh đại diện cá nhân (Chuẩn 1:1)"
          description="Cắt lại ảnh hiện tại, tải ảnh mới lên hoặc dán đường dẫn ảnh cá nhân."
          allowUrlMode
        />
      )}
    </>
  );
}
