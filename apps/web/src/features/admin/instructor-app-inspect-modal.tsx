'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Phone,
  Video,
  XCircle,
} from 'lucide-react';
import type { AuthUser } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MarkdownPreview, RichTextEditor } from '@/components/ui/rich-text-editor';
import { api, ApiClientError } from '@/lib/api-client';
import { notify } from '@/lib/notify';

interface InstructorAppInspectModalProps {
  applicant: AuthUser | null;
  onClose: () => void;
  onDecided: () => void;
}

export function InstructorAppInspectModal({
  applicant,
  onClose,
  onDecided,
}: InstructorAppInspectModalProps) {
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    setNote(applicant?.instructorProfile?.reviewNote ?? '');
  }, [applicant]);

  const decideMutation = useMutation({
    mutationFn: (payload: { action: 'APPROVE' | 'REJECT'; note?: string }) =>
      api.post(`/users/instructor-applications/${applicant!.id}/decision`, payload),
    onSuccess: (_data, vars) => {
      if (vars.action === 'APPROVE') {
        notify.success('Đã phê duyệt Giảng viên mới!', {
          description: `${applicant?.fullName} đã được nâng lên vai trò INSTRUCTOR.`,
        });
      } else {
        notify.info('Đã từ chối hồ sơ đăng ký Giảng viên', {
          description: 'Lý do góp ý đã được gửi lại để ứng viên bổ sung.',
        });
      }
      onDecided();
      onClose();
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Xử lý hồ sơ thất bại');
    },
  });

  if (!applicant) return null;
  const p = applicant.instructorProfile;

  return (
    <Dialog
      open={Boolean(applicant)}
      onClose={onClose}
      title="Kiểm duyệt hồ sơ đăng ký Giảng viên"
      description={`${applicant.fullName} (${applicant.email})`}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-border bg-secondary/35 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ứng viên</p>
            <p className="font-semibold">{applicant.fullName}</p>
            <p className="text-xs text-muted-foreground">{applicant.headline || 'Chưa có chức danh'}</p>
          </div>
          <div className="space-y-1 text-xs">
            <p className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-primary" />
              <span>SĐT: <strong>{p?.phone || 'Chưa cung cấp'}</strong></span>
            </p>
            <p className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              <span>Kinh nghiệm: <strong>{p?.yearsOfExperience ?? 0} năm</strong></span>
            </p>
            <p className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span>
                Ngân hàng:{' '}
                <strong>
                  {p?.bankName ? `${p.bankName} - ${p.bankAccountNo} (${p.bankAccountName})` : 'Chưa có'}
                </strong>
              </span>
            </p>
          </div>
        </div>

        {/* Expertise topics */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Lĩnh vực giảng dạy</p>
          <div className="flex flex-wrap gap-1.5">
            {p?.expertiseTopics && p.expertiseTopics.length > 0 ? (
              p.expertiseTopics.map((topic) => (
                <Badge key={topic} variant="secondary">
                  {topic}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">Chưa chọn lĩnh vực</span>
            )}
          </div>
        </div>

        {/* Verification Links */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3 text-xs">
            <p className="font-semibold text-muted-foreground">Portfolio / GitHub / LinkedIn</p>
            {p?.portfolioUrl ? (
              <a
                href={p.portfolioUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 break-all font-medium text-primary hover:underline"
              >
                {p.portfolioUrl} <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <p className="mt-1 italic text-muted-foreground">Không cung cấp</p>
            )}
          </div>
          <div className="rounded-xl border border-border p-3 text-xs">
            <p className="flex items-center gap-1 font-semibold text-muted-foreground">
              <Video className="h-3.5 w-3.5" /> Video dạy thử
            </p>
            {p?.demoVideoUrl ? (
              <a
                href={p.demoVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 break-all font-medium text-primary hover:underline"
              >
                {p.demoVideoUrl} <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <p className="mt-1 italic text-muted-foreground">Không cung cấp</p>
            )}
          </div>
        </div>

        {/* Bio & Teaching plan */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border p-3.5 text-xs">
            <p className="mb-1.5 font-semibold text-muted-foreground">Giới thiệu kinh nghiệm</p>
            <MarkdownPreview
              content={applicant.bio || ''}
              emptyText="Chưa có mô tả"
              className="text-xs"
            />
          </div>
          <div className="rounded-xl border border-border p-3.5 text-xs">
            <p className="mb-1.5 font-semibold text-muted-foreground">Kế hoạch khóa học dự kiến</p>
            <MarkdownPreview
              content={p?.teachingPlan || ''}
              emptyText="Chưa có kế hoạch"
              className="text-xs"
            />
          </div>
        </div>

        {/* Decision */}
        <div className="space-y-3 border-t border-border pt-4">
          <RichTextEditor
            compact
            rows={3}
            minHeightClass="min-h-[80px]"
            value={note}
            onChange={setNote}
            placeholder="Ghi chú duyệt hoặc lý do cần bổ sung (bắt buộc ≥ 5 ký tự nếu từ chối)..."
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={decideMutation.isPending}>
              Đóng
            </Button>
            <Button
              variant="destructive"
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ action: 'REJECT', note })}
            >
              {decideMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Từ chối
            </Button>
            <Button
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ action: 'APPROVE', note })}
            >
              {decideMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Phê duyệt lên Giảng viên
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
