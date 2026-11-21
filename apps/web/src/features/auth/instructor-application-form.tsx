'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Clock,
  Loader2,
  Plus,
  Presentation,
  Send,
  X,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  becomeInstructorSchema,
  InstructorApplicationStatus,
  type AuthUser,
  type BecomeInstructorInput,
} from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { useAuthStore } from './auth.store';

const SUGGESTED_TOPICS = [
  'Next.js / React',
  'Node.js / NestJS',
  'Java Spring Boot',
  'TypeScript',
  'PostgreSQL / SQL',
  'DevOps / Docker',
  'UI/UX Design',
  'AI / Data',
];

interface InstructorApplicationFormProps {
  onSubmitted?: () => void;
}

export function InstructorApplicationForm({ onSubmitted }: InstructorApplicationFormProps) {
  const { user, setUser } = useAuthStore();
  const profile = user?.instructorProfile;
  const [topicInput, setTopicInput] = React.useState('');

  const form = useForm<z.input<typeof becomeInstructorSchema>, unknown, BecomeInstructorInput>({
    resolver: zodResolver(becomeInstructorSchema),
    defaultValues: {
      headline: user?.headline ?? '',
      bio: user?.bio ?? '',
      phone: profile?.phone ?? '',
      yearsOfExperience: profile?.yearsOfExperience ?? 1,
      expertiseTopics:
        profile?.expertiseTopics && profile.expertiseTopics.length > 0
          ? profile.expertiseTopics
          : [],
      portfolioUrl: profile?.portfolioUrl ?? '',
      demoVideoUrl: profile?.demoVideoUrl ?? '',
      teachingPlan: profile?.teachingPlan ?? '',
      bankName: profile?.bankName ?? '',
      bankAccountNo: profile?.bankAccountNo ?? '',
      bankAccountName: profile?.bankAccountName ?? '',
    },
  });

  const topics = form.watch('expertiseTopics') ?? [];
  const isPendingReview = profile?.applicationStatus === InstructorApplicationStatus.PENDING;
  const isRejected = profile?.applicationStatus === InstructorApplicationStatus.REJECTED;

  function toggleTopic(topic: string) {
    const exists = topics.includes(topic);
    if (exists) {
      form.setValue(
        'expertiseTopics',
        topics.filter((t) => t !== topic),
        { shouldValidate: true },
      );
    } else if (topics.length < 8) {
      form.setValue('expertiseTopics', [...topics, topic], { shouldValidate: true });
    }
  }

  function addCustomTopic() {
    const clean = topicInput.trim();
    if (!clean || topics.includes(clean) || topics.length >= 8) return;
    form.setValue('expertiseTopics', [...topics, clean], { shouldValidate: true });
    setTopicInput('');
  }

  async function onSubmit(values: BecomeInstructorInput) {
    try {
      const updated = await api.post<AuthUser>('/users/become-instructor', values);
      setUser(updated);
      notify.success('Đã gửi hồ sơ đăng ký Giảng viên!', {
        description: 'Quản trị viên Try4T sẽ xem xét và phản hồi trong thời gian sớm nhất.',
      });
      onSubmitted?.();
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Gửi hồ sơ thất bại');
    }
  }

  return (
    <div className="space-y-4">
      {isPendingReview && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Hồ sơ của bạn đang chờ Admin xét duyệt</p>
            <p className="mt-0.5 opacity-90">
              Bạn vẫn có thể cập nhật bổ sung thông tin bên dưới nếu cần. Khi được duyệt, tài khoản
              sẽ tự động mở khóa Kênh Giảng viên.
            </p>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Hồ sơ trước đây cần bổ sung thêm thông tin</p>
            {profile?.reviewNote && <p className="mt-0.5">Lý do từ Admin: {profile.reviewNote}</p>}
          </div>
        </div>
      )}

      {!isPendingReview && !isRejected && (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/45 p-3 text-xs text-muted-foreground">
          <Presentation className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Điền đầy đủ hồ sơ chuyên môn để Admin duyệt nhanh — nhận <strong>70% doanh thu</strong>{' '}
            &amp; mở khóa Course Builder kéo thả.
          </span>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* 1. Professional Identity */}
        <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            1. Thông tin chuyên môn &amp; Liên hệ
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ia-headline">Chức danh / Chuyên môn chính *</Label>
            <Input
              id="ia-headline"
              placeholder="VD: Senior Full-Stack Engineer • 5 năm kinh nghiệm sản phẩm"
              {...form.register('headline')}
            />
            {form.formState.errors.headline && (
              <p className="text-xs text-destructive">{form.formState.errors.headline.message}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ia-phone">Số điện thoại liên hệ *</Label>
              <Input id="ia-phone" placeholder="0912345678" {...form.register('phone')} />
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ia-years">Số năm kinh nghiệm *</Label>
              <Input
                id="ia-years"
                type="number"
                min={0}
                max={50}
                step={1}
                {...form.register('yearsOfExperience', {
                  setValueAs: (v) => (v === '' ? 0 : Number(v)),
                })}
              />
              {form.formState.errors.yearsOfExperience && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.yearsOfExperience.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lĩnh vực giảng dạy (chọn 1–8 chủ đề) *</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TOPICS.map((topic) => {
                const active = topics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    className={cn(
                      'cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>

            {topics.some((t) => !SUGGESTED_TOPICS.includes(t)) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {topics
                  .filter((t) => !SUGGESTED_TOPICS.includes(t))
                  .map((custom) => (
                    <Badge key={custom} className="gap-1">
                      {custom}
                      <button
                        type="button"
                        onClick={() => toggleTopic(custom)}
                        className="cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomTopic();
                  }
                }}
                placeholder="Thêm kỹ năng khác (VD: Golang, Flutter)..."
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addCustomTopic}
                className="h-8 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm
              </Button>
            </div>
            {form.formState.errors.expertiseTopics && (
              <p className="text-xs text-destructive">
                {form.formState.errors.expertiseTopics.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ia-bio">Kinh nghiệm làm việc &amp; Giảng dạy (tối thiểu 30 ký tự) *</Label>
            <RichTextEditor
              id="ia-bio"
              rows={3}
              compact
              value={form.watch('bio') ?? ''}
              onChange={(val) => form.setValue('bio', val, { shouldValidate: true })}
              placeholder="Các dự án thực tế bạn đã làm, vị trí từng đảm nhiệm, kinh nghiệm mentoring/chia sẻ..."
            />
            {form.formState.errors.bio && (
              <p className="text-xs text-destructive">{form.formState.errors.bio.message}</p>
            )}
          </div>
        </div>

        {/* 2. Verification Links & Teaching Plan */}
        <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            2. Hồ sơ năng lực &amp; Kế hoạch khóa học
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ia-portfolio">Link GitHub / LinkedIn / Portfolio</Label>
              <Input
                id="ia-portfolio"
                placeholder="https://github.com/username"
                {...form.register('portfolioUrl')}
              />
              {form.formState.errors.portfolioUrl && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.portfolioUrl.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ia-demo">Link Video dạy thử (2–5 phút)</Label>
              <Input
                id="ia-demo"
                placeholder="https://youtube.com/watch?v=... hoặc Drive"
                {...form.register('demoVideoUrl')}
              />
              {form.formState.errors.demoVideoUrl && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.demoVideoUrl.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ia-plan">
              Kế hoạch khóa học đầu tiên dự định xuất bản (tối thiểu 30 ký tự) *
            </Label>
            <RichTextEditor
              id="ia-plan"
              rows={3}
              compact
              value={form.watch('teachingPlan') ?? ''}
              onChange={(val) => form.setValue('teachingPlan', val, { shouldValidate: true })}
              placeholder="Tên khóa dự kiến, đối tượng học viên, kết quả đầu ra và số chương dự kiến..."
            />
            {form.formState.errors.teachingPlan && (
              <p className="text-xs text-destructive">
                {form.formState.errors.teachingPlan.message}
              </p>
            )}
          </div>
        </div>

        {/* 3. Bank Info */}
        <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            3. Tài khoản ngân hàng nhận doanh thu chia sẻ
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="ia-bankName" className="text-xs">
                Ngân hàng *
              </Label>
              <Input id="ia-bankName" placeholder="MB Bank" {...form.register('bankName')} />
              {form.formState.errors.bankName && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.bankName.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ia-bankNo" className="text-xs">
                Số tài khoản *
              </Label>
              <Input id="ia-bankNo" placeholder="0123456789" {...form.register('bankAccountNo')} />
              {form.formState.errors.bankAccountNo && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.bankAccountNo.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ia-bankOwner" className="text-xs">
                Tên chủ tài khoản *
              </Label>
              <Input
                id="ia-bankOwner"
                placeholder="NGUYEN VAN A"
                {...form.register('bankAccountName')}
              />
              {form.formState.errors.bankAccountName && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.bankAccountName.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isPendingReview ? 'Cập nhật lại hồ sơ đang chờ duyệt' : 'Gửi hồ sơ xét duyệt Giảng viên'}
        </Button>
      </form>
    </div>
  );
}
