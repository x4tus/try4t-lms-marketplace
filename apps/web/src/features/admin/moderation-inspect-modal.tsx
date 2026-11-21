'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Eye,
  FileText,
  HelpCircle,
  Loader2,
  Video,
  XCircle,
} from 'lucide-react';
import { formatDuration, formatVnd, LessonType } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { UniversalVideoPreview } from '@/components/ui/universal-video-preview';
import type { BuilderCourse, BuilderLesson } from '@/features/course-builder/types';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

interface ModerationInspectModalProps {
  courseId: string | null;
  onClose: () => void;
  onDecided: () => void;
}

export function ModerationInspectModal({
  courseId,
  onClose,
  onDecided,
}: ModerationInspectModalProps) {
  const [note, setNote] = React.useState('');
  const [selectedLesson, setSelectedLesson] = React.useState<BuilderLesson | null>(null);

  const { data: course, isLoading } = useQuery({
    queryKey: ['admin-inspect-course', courseId],
    queryFn: () => api.get<BuilderCourse>(`/admin/moderation/courses/${courseId}`),
    enabled: Boolean(courseId),
  });

  React.useEffect(() => {
    setNote('');
    if (course?.sections[0]?.lessons[0]) {
      setSelectedLesson(course.sections[0].lessons[0]);
    } else {
      setSelectedLesson(null);
    }
  }, [course]);

  const decideMutation = useMutation({
    mutationFn: (payload: { action: 'APPROVE' | 'REJECT'; note?: string }) =>
      api.post(`/admin/moderation/courses/${courseId}/decision`, payload),
    onSuccess: (_data, variables) => {
      if (variables.action === 'APPROVE') {
        notify.success('Đã duyệt & xuất bản khóa học!', {
          description: 'Khóa học hiện đã hiển thị công khai trên hệ thống Try4T.',
        });
      } else {
        notify.info('Đã trả khóa học về cho Giảng viên', {
          description: 'Góp ý của bạn đã được ghi nhận vào lịch sử kiểm duyệt.',
        });
      }
      onDecided();
      onClose();
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Không thể xử lý duyệt');
    },
  });

  return (
    <Dialog
      open={Boolean(courseId)}
      onClose={onClose}
      title="Kiểm duyệt nội dung khóa học"
      description="Kiểm tra giáo trình, video, bài đọc, quiz và lịch sử duyệt trước khi xuất bản."
      maxWidthClass="max-w-5xl"
    >
      {isLoading || !course ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Course Summary */}
          <div className="grid gap-4 rounded-xl border border-border bg-secondary/30 p-4 md:grid-cols-[220px_1fr]">
            <div className="aspect-video overflow-hidden rounded-lg border border-border bg-muted">
              {course.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.thumbnailUrl}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Chưa có ảnh bìa
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold">{course.title}</h3>
                <Badge variant="outline">{course.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Giảng viên: <strong className="text-foreground">{course.instructor.fullName}</strong>{' '}
                ({course.instructor.email})
              </p>
              <p className="text-xs text-muted-foreground">
                Học phí:{' '}
                <strong className="font-mono text-foreground">
                  {formatVnd(course.salePriceVnd ?? course.priceVnd)}
                </strong>{' '}
                • {course.totalLessons} bài học • {formatDuration(course.totalDurationSec)} •{' '}
                {course.sequentialLockEnabled
                  ? `Khóa tuần tự ≥ ${course.minWatchPercent}%`
                  : 'Học tự do'}
              </p>
              {course.subtitle && (
                <p className="pt-1 text-xs text-muted-foreground">{course.subtitle}</p>
              )}
            </div>
          </div>

          {/* Curriculum + Preview */}
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <div className="max-h-[340px] space-y-3 overflow-y-auto rounded-xl border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Giáo trình ({course.sections.length} chương)
              </p>
              {course.sections.map((sec, sIdx) => (
                <div key={sec.id} className="space-y-1">
                  <p className="text-xs font-semibold">
                    {sIdx + 1}. {sec.title}
                  </p>
                  <div className="space-y-1 pl-2">
                    {sec.lessons.map((les) => (
                      <button
                        key={les.id}
                        type="button"
                        onClick={() => setSelectedLesson(les)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                          selectedLesson?.id === les.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-secondary',
                        )}
                      >
                        {les.type === LessonType.VIDEO ? (
                          <Video className="h-3.5 w-3.5 shrink-0" />
                        ) : les.type === LessonType.ARTICLE ? (
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">{les.title}</span>
                        {les.isFreePreview && <Eye className="ml-auto h-3 w-3 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              {!selectedLesson ? (
                <p className="py-12 text-center text-xs text-muted-foreground">
                  Chọn một bài học bên trái để xem trước nội dung.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                    <p className="text-sm font-semibold">{selectedLesson.title}</p>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {selectedLesson.type}
                    </Badge>
                  </div>

                  {selectedLesson.type === LessonType.VIDEO &&
                    (selectedLesson.playbackUrl ? (
                      <UniversalVideoPreview
                        url={selectedLesson.playbackUrl}
                        className="max-h-[260px] rounded-lg"
                      />
                    ) : (
                      <p className="text-xs text-destructive">Bài học chưa có video.</p>
                    ))}

                  {selectedLesson.type === LessonType.ARTICLE && (
                    <div className="max-h-[260px] overflow-y-auto text-sm leading-relaxed [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_pre]:rounded-lg [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-zinc-100">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                        {selectedLesson.articleMd || '*Chưa có nội dung Markdown*'}
                      </ReactMarkdown>
                    </div>
                  )}

                  {selectedLesson.type === LessonType.QUIZ && (
                    <div className="max-h-[260px] space-y-2.5 overflow-y-auto text-xs">
                      <p className="text-muted-foreground">
                        Điểm đạt: <strong>{selectedLesson.quiz?.passScorePercent ?? 70}%</strong> •{' '}
                        {selectedLesson.quiz?.questions.length ?? 0} câu hỏi
                      </p>
                      {selectedLesson.quiz?.questions.map((q, idx) => (
                        <div key={idx} className="rounded-lg border border-border p-2.5">
                          <p className="font-medium">
                            Câu {idx + 1}: {q.promptMd}
                          </p>
                          <ul className="mt-1 space-y-0.5 pl-4">
                            {q.options.map((o, oIdx) => (
                              <li
                                key={oIdx}
                                className={
                                  o.isCorrect
                                    ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                    : 'text-muted-foreground'
                                }
                              >
                                {o.isCorrect ? '✓ ' : '• '}
                                {o.content}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Decision Box */}
          <div className="space-y-3 border-t border-border pt-4">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú kiểm duyệt (bắt buộc nhập lý do tối thiểu 5 ký tự nếu Từ chối)..."
              className="flex w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                Từ chối &amp; Yêu cầu sửa
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
                Duyệt &amp; Xuất bản ngay
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
