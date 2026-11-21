'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookmarkPlus,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  Send,
  ShieldCheck,
  Star,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { formatDuration, LessonType } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/auth.store';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

interface LessonNoteItem {
  id: string;
  timestampSec: number;
  content: string;
  createdAt: string;
}

interface LessonQuestionItem {
  id: string;
  title: string;
  contentMd: string;
  isResolved: boolean;
  answersCount: number;
  createdAt: string;
  user: { id: string; fullName: string; avatarUrl: string | null; role: string };
  answers: Array<{
    id: string;
    contentMd: string;
    isInstructorReply: boolean;
    createdAt: string;
    user: { id: string; fullName: string; avatarUrl: string | null; role: string };
  }>;
}

interface LessonTabsPanelProps {
  courseId: string;
  courseInstructorId: string;
  lessonId: string;
  lessonType: LessonType;
  progressPercent: number;
  isStaffPreview: boolean;
  myReview: {
    id: string;
    rating: number;
    comment: string;
    instructorReply: string | null;
  } | null;
  quickNoteTriggerSec: number | null;
  onQuickNoteHandled: () => void;
  onCaptureVideoTimestamp: () => number;
  onSeekVideo: (seconds: number) => void;
  onReviewSaved: () => void;
}

type BottomTab = 'notes' | 'qa' | 'review';

export function LessonTabsPanel({
  courseId,
  courseInstructorId,
  lessonId,
  lessonType,
  progressPercent,
  isStaffPreview,
  myReview,
  quickNoteTriggerSec,
  onQuickNoteHandled,
  onCaptureVideoTimestamp,
  onSeekVideo,
  onReviewSaved,
}: LessonTabsPanelProps) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<BottomTab>('notes');

  // Notes state
  const [noteContent, setNoteContent] = React.useState('');
  const [noteTimestampSec, setNoteTimestampSec] = React.useState(0);
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = React.useState('');
  const noteTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Q&A state
  const [qTitle, setQTitle] = React.useState('');
  const [qContent, setQContent] = React.useState('');
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});

  // Review state
  const [rating, setRating] = React.useState(myReview?.rating ?? 5);
  const [reviewComment, setReviewComment] = React.useState(myReview?.comment ?? '');

  React.useEffect(() => {
    setRating(myReview?.rating ?? 5);
    setReviewComment(myReview?.comment ?? '');
  }, [myReview?.id, myReview?.rating, myReview?.comment]);

  // Hỗ trợ phím tắt N từ Video Player -> mở tab Ghi chú & focus ngay vào ô nhập
  React.useEffect(() => {
    if (quickNoteTriggerSec !== null) {
      setActiveTab('notes');
      setNoteTimestampSec(quickNoteTriggerSec);
      window.setTimeout(() => noteTextareaRef.current?.focus(), 60);
      onQuickNoteHandled();
    }
  }, [quickNoteTriggerSec, onQuickNoteHandled]);

  const { data: notes, isLoading: loadingNotes } = useQuery({
    queryKey: ['lesson-notes', lessonId],
    queryFn: () => api.get<LessonNoteItem[]>(`/learning/lessons/${lessonId}/notes`),
  });

  const { data: questions, isLoading: loadingQuestions } = useQuery({
    queryKey: ['lesson-questions', lessonId],
    queryFn: () => api.get<LessonQuestionItem[]>(`/learning/lessons/${lessonId}/questions`),
  });

  const createNoteMutation = useMutation({
    mutationFn: () =>
      api.post<LessonNoteItem>(`/learning/lessons/${lessonId}/notes`, {
        timestampSec: noteTimestampSec,
        content: noteContent.trim(),
      }),
    onSuccess: () => {
      setNoteContent('');
      notify.success('Đã lưu ghi chú tại mốc ' + formatDuration(noteTimestampSec));
      void queryClient.invalidateQueries({ queryKey: ['lesson-notes', lessonId] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Lưu ghi chú thất bại');
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.patch(`/learning/notes/${id}`, { content }),
    onSuccess: () => {
      setEditingNoteId(null);
      notify.success('Đã cập nhật ghi chú');
      void queryClient.invalidateQueries({ queryKey: ['lesson-notes', lessonId] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Cập nhật thất bại');
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/learning/notes/${id}`),
    onSuccess: () => {
      notify.success('Đã xóa ghi chú');
      void queryClient.invalidateQueries({ queryKey: ['lesson-notes', lessonId] });
    },
  });

  const createQuestionMutation = useMutation({
    mutationFn: () =>
      api.post(`/learning/lessons/${lessonId}/questions`, {
        title: qTitle.trim(),
        contentMd: qContent.trim(),
      }),
    onSuccess: () => {
      setQTitle('');
      setQContent('');
      notify.success('Đã đăng câu hỏi thảo luận!');
      void queryClient.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Đăng câu hỏi thất bại');
    },
  });

  const createAnswerMutation = useMutation({
    mutationFn: ({ questionId, contentMd }: { questionId: string; contentMd: string }) =>
      api.post(`/learning/questions/${questionId}/answers`, { contentMd }),
    onSuccess: (_data, vars) => {
      setReplyDrafts((prev) => ({ ...prev, [vars.questionId]: '' }));
      notify.success('Đã gửi câu trả lời');
      void queryClient.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Gửi trả lời thất bại');
    },
  });

  const toggleResolveMutation = useMutation({
    mutationFn: (questionId: string) => api.patch(`/learning/questions/${questionId}/resolve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
    },
  });

  const saveReviewMutation = useMutation({
    mutationFn: () =>
      api.post(`/reviews/courses/${courseId}`, {
        rating,
        comment: reviewComment.trim(),
      }),
    onSuccess: () => {
      notify.success('Cảm ơn bạn đã gửi đánh giá khóa học!');
      onReviewSaved();
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Gửi đánh giá thất bại');
    },
  });

  const canReview = !isStaffPreview && progressPercent >= 20;

  return (
    <div className="rounded-2xl border border-border bg-card">
      {/* Tab Headers */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 pt-3">
        {[
          {
            id: 'notes' as const,
            label: `Ghi chú (${notes?.length ?? 0})`,
            icon: StickyNote,
          },
          {
            id: 'qa' as const,
            label: `Hỏi đáp Q&A (${questions?.length ?? 0})`,
            icon: MessageSquare,
          },
          {
            id: 'review' as const,
            label: myReview ? 'Đánh giá của bạn ★' : 'Đánh giá khóa học',
            icon: Star,
          },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 border-b-2 px-3.5 pb-3 pt-1 text-xs font-semibold transition-colors',
                activeTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {/* TAB 1: TIMESTAMPED NOTES */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!noteContent.trim()) return;
                createNoteMutation.mutate();
              }}
              className="space-y-2.5 rounded-xl border border-border bg-secondary/25 p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold">Tạo ghi chú cá nhân</span>
                {lessonType === LessonType.VIDEO && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const sec = onCaptureVideoTimestamp();
                      setNoteTimestampSec(sec);
                      noteTextareaRef.current?.focus();
                    }}
                    className="h-7 gap-1.5 text-xs text-primary"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Gắn mốc đang phát ({formatDuration(noteTimestampSec)})
                  </Button>
                )}
              </div>

              <Textarea
                ref={noteTextareaRef}
                rows={2}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                onFocus={() => {
                  if (lessonType === LessonType.VIDEO && noteTimestampSec === 0) {
                    const sec = onCaptureVideoTimestamp();
                    if (sec > 0) setNoteTimestampSec(sec);
                  }
                }}
                placeholder="Ghi lại ý chính, đoạn code hoặc kiến thức quan trọng tại giây này..."
              />

              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-muted-foreground">
                  Mốc lưu: {formatDuration(noteTimestampSec)}
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!noteContent.trim() || createNoteMutation.isPending}
                >
                  {createNoteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Lưu ghi chú
                </Button>
              </div>
            </form>

            {loadingNotes ? (
              <p className="text-xs text-muted-foreground">Đang tải ghi chú...</p>
            ) : !notes || notes.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Chưa có ghi chú nào cho bài học này. Bấm phím <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono">N</kbd> khi xem video để ghi chú nhanh tại đúng mốc thời gian!
              </p>
            ) : (
              <div className="space-y-2.5">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-xl border border-border bg-card p-3.5 text-sm"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSeekVideo(note.timestampSec)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 font-mono text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground"
                        title="Bấm để nhảy video tới mốc này"
                      >
                        <Clock className="h-3 w-3" />
                        {formatDuration(note.timestampSec)}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditingNoteText(note.content);
                          }}
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          aria-label="Sửa ghi chú"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirmAction({
                              title: 'Xóa ghi chú này?',
                              description: 'Ghi chú sẽ bị xóa vĩnh viễn khỏi bài học.',
                              confirmLabel: 'Xóa',
                              destructive: true,
                            });
                            if (ok) deleteNoteMutation.mutate(note.id);
                          }}
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Xóa ghi chú"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingNoteId(null)}
                          >
                            Hủy
                          </Button>
                          <Button
                            size="sm"
                            disabled={updateNoteMutation.isPending}
                            onClick={() =>
                              updateNoteMutation.mutate({
                                id: note.id,
                                content: editingNoteText.trim(),
                              })
                            }
                          >
                            Lưu
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
                        {note.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LESSON Q&A */}
        {activeTab === 'qa' && (
          <div className="space-y-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (qTitle.trim().length < 5 || qContent.trim().length < 10) {
                  notify.error('Tiêu đề tối thiểu 5 ký tự và nội dung tối thiểu 10 ký tự.');
                  return;
                }
                createQuestionMutation.mutate();
              }}
              className="space-y-2.5 rounded-xl border border-border bg-secondary/25 p-4"
            >
              <p className="text-xs font-semibold">Đặt câu hỏi cho giảng viên &amp; cộng đồng</p>
              <Input
                value={qTitle}
                onChange={(e) => setQTitle(e.target.value)}
                placeholder="Tiêu đề câu hỏi (VD: Lỗi CORS khi gọi API từ Next.js?)"
              />
              <Textarea
                rows={3}
                value={qContent}
                onChange={(e) => setQContent(e.target.value)}
                placeholder="Mô tả chi tiết lỗi hoặc đoạn code bạn đang gặp vướng mắc (hỗ trợ Markdown)..."
              />
              <div className="flex justify-end">
                <Button size="sm" type="submit" disabled={createQuestionMutation.isPending}>
                  {createQuestionMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Gửi câu hỏi
                </Button>
              </div>
            </form>

            {loadingQuestions ? (
              <p className="text-xs text-muted-foreground">Đang tải thảo luận...</p>
            ) : !questions || questions.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Chưa có câu hỏi nào trong bài học này. Hãy là người đầu tiên thảo luận!
              </p>
            ) : (
              <div className="space-y-4">
                {questions.map((q) => {
                  const canResolve =
                    user?.id === q.user.id ||
                    user?.id === courseInstructorId ||
                    user?.role === 'ADMIN';
                  const draft = replyDrafts[q.id] ?? '';

                  return (
                    <div key={q.id} className="space-y-3 rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold">{q.title}</h4>
                            {q.isResolved && (
                              <Badge variant="success" className="gap-1 text-[10px]">
                                <CheckCircle2 className="h-3 w-3" /> Đã giải quyết
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Bởi <strong>{q.user.fullName}</strong> •{' '}
                            {new Date(q.createdAt).toLocaleString('vi-VN')}
                          </p>
                        </div>

                        {canResolve && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => toggleResolveMutation.mutate(q.id)}
                          >
                            {q.isResolved ? 'Mở lại' : 'Đánh dấu đã xong'}
                          </Button>
                        )}
                      </div>

                      <div className="text-xs leading-relaxed text-foreground/90 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-zinc-100">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                          {q.contentMd}
                        </ReactMarkdown>
                      </div>

                      {/* Answers */}
                      {q.answers.length > 0 && (
                        <div className="space-y-2 border-l-2 border-primary/30 pl-3.5">
                          {q.answers.map((ans) => (
                            <div
                              key={ans.id}
                              className={cn(
                                'rounded-xl p-3 text-xs',
                                ans.isInstructorReply
                                  ? 'border border-primary/30 bg-primary/5'
                                  : 'bg-secondary/40',
                              )}
                            >
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{ans.user.fullName}</span>
                                {ans.isInstructorReply && (
                                  <Badge variant="success" className="gap-1 text-[10px]">
                                    <ShieldCheck className="h-3 w-3" /> Giảng viên
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(ans.createdAt).toLocaleString('vi-VN')}
                                </span>
                              </div>
                              <div className="leading-relaxed">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                                  {ans.contentMd}
                                </ReactMarkdown>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply Input */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (draft.trim().length < 2) return;
                          createAnswerMutation.mutate({
                            questionId: q.id,
                            contentMd: draft.trim(),
                          });
                        }}
                        className="flex gap-2 pt-1"
                      >
                        <Input
                          value={draft}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder="Viết câu trả lời của bạn..."
                          className="h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          type="submit"
                          disabled={draft.trim().length < 2 || createAnswerMutation.isPending}
                          className="h-8 shrink-0 gap-1"
                        >
                          <Send className="h-3 w-3" /> Gửi
                        </Button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COURSE REVIEW (GATED >= 20%) */}
        {activeTab === 'review' && (
          <div>
            {isStaffPreview ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Bạn đang xem phòng học với tư cách Giảng viên / Admin nên không thể tự đánh giá khóa
                học này.
              </p>
            ) : !canReview ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8 text-center">
                <Lock className="mb-2.5 h-7 w-7 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Hoàn thành tối thiểu 20% để gửi đánh giá</h4>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  Để đảm bảo mọi đánh giá trên Try4T đều trung thực và chất lượng, hệ thống chỉ mở
                  khóa đánh giá khi bạn học được ít nhất 20% khóa học.
                </p>
                <div className="mt-4 w-56 space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span>Tiến độ hiện tại</span>
                    <span className="font-bold text-primary">{Math.round(progressPercent)}% / 20%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, (progressPercent / 20) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reviewComment.trim().length < 10) {
                    notify.error('Vui lòng viết nhận xét tối thiểu 10 ký tự.');
                    return;
                  }
                  saveReviewMutation.mutate();
                }}
                className="space-y-4"
              >
                <div>
                  <p className="mb-2 text-xs font-semibold">Mức độ hài lòng của bạn:</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="cursor-pointer rounded-md p-1 transition-transform hover:scale-110"
                        aria-label={`${star} sao`}
                      >
                        <Star
                          className={cn(
                            'h-7 w-7',
                            star <= rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground/30',
                          )}
                        />
                      </button>
                    ))}
                    <span className="ml-2 font-mono text-xs font-semibold text-amber-500">
                      {rating}/5 sao
                    </span>
                  </div>
                </div>

                <Textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Chia sẻ cảm nhận chân thực về nội dung, giảng viên và dự án thực chiến của khóa học..."
                />

                {myReview?.instructorReply && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                    <p className="font-semibold text-primary">Phản hồi từ Giảng viên:</p>
                    <p className="mt-1 text-muted-foreground">{myReview.instructorReply}</p>
                  </div>
                )}

                <Button type="submit" disabled={saveReviewMutation.isPending}>
                  {saveReviewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {myReview ? 'Cập nhật đánh giá' : 'Gửi đánh giá xác thực'}
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
