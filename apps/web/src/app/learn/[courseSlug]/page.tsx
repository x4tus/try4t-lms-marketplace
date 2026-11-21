'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Video,
} from 'lucide-react';
import { formatDuration, LessonType } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RoleGuard } from '@/features/auth/role-guard';
import { LessonTabsPanel } from '@/features/learning/lesson-tabs-panel';
import { QuizRunner } from '@/features/learning/quiz-runner';
import { SmartVideoPlayer } from '@/features/learning/smart-video-player';
import type {
  LearningRoomData,
  LessonContentData,
  VideoPlayerHandle,
} from '@/features/learning/types';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

function LearningRoomContent() {
  const params = useParams<{ courseSlug: string }>();
  const slug = params.courseSlug;
  const queryClient = useQueryClient();

  const videoHandleRef = React.useRef<VideoPlayerHandle | null>(null);
  const [activeLessonId, setActiveLessonId] = React.useState<string | null>(null);
  const [theaterMode, setTheaterMode] = React.useState(false);
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});
  const [quickNoteTriggerSec, setQuickNoteTriggerSec] = React.useState<number | null>(null);

  const {
    data: room,
    isLoading: loadingRoom,
    error: roomError,
  } = useQuery({
    queryKey: ['learning-room', slug],
    queryFn: () => api.get<LearningRoomData>(`/learning/courses/${slug}`),
    retry: false,
  });

  // Chọn bài học mặc định và mở toàn bộ chương trong sidebar
  React.useEffect(() => {
    if (!room) return;
    if (!activeLessonId && room.initialLessonId) {
      setActiveLessonId(room.initialLessonId);
    }
    setExpandedSections((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, boolean> = {};
      room.sections.forEach((sec) => {
        next[sec.id] = true;
      });
      return next;
    });
  }, [room, activeLessonId]);

  const {
    data: lessonContent,
    isLoading: loadingLesson,
    error: lessonError,
  } = useQuery({
    queryKey: ['learning-lesson', slug, activeLessonId],
    queryFn: () =>
      api.get<LessonContentData>(`/learning/courses/${slug}/lessons/${activeLessonId}`),
    enabled: Boolean(room && activeLessonId),
    retry: false,
  });

  const completeArticleMutation = useMutation({
    mutationFn: (lessonId: string) =>
      api.post<{
        isCompleted: boolean;
        certificate: { certCode: string; verifyPath: string } | null;
      }>(`/learning/lessons/${lessonId}/complete-article`),
    onSuccess: (res) => {
      notify.success('Đã hoàn thành bài đọc!', {
        description: res.certificate
          ? 'Tuyệt vời! Bạn đã đạt 100% khóa học và nhận được Chứng chỉ QR!'
          : 'Tiến độ học đã được cập nhật.',
      });
      void queryClient.invalidateQueries({ queryKey: ['learning-room', slug] });
      void queryClient.invalidateQueries({ queryKey: ['learning-lesson', slug, activeLessonId] });
      void queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
      void queryClient.invalidateQueries({ queryKey: ['my-certificates'] });
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Không thể đánh dấu hoàn thành');
    },
  });

  const refreshLearningState = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['learning-room', slug] });
    void queryClient.invalidateQueries({ queryKey: ['learning-lesson', slug, activeLessonId] });
    void queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
    void queryClient.invalidateQueries({ queryKey: ['my-certificates'] });
  }, [queryClient, slug, activeLessonId]);

  if (loadingRoom) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 sm:px-6">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-[520px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (roomError || !room) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <ShieldAlert className="mb-3 h-12 w-12 text-amber-500" />
        <h1 className="text-xl font-bold">Chưa có quyền truy cập phòng học</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {roomError instanceof ApiClientError
            ? roomError.message
            : 'Bạn cần đăng ký hoặc mua khóa học này trước khi mở Smart Learning Room.'}
        </p>
        <div className="mt-5 flex gap-2">
          <Link href={`/courses/${slug}`}>
            <Button>Xem trang khóa học</Button>
          </Link>
          <Link href="/my-courses">
            <Button variant="outline">Khóa học của tôi</Button>
          </Link>
        </div>
      </div>
    );
  }

  const lockedMeta =
    lessonError instanceof ApiClientError && lessonError.code === 'LESSON_LOCKED'
      ? (lessonError.meta as { previousLessonId?: string; previousLessonTitle?: string } | undefined)
      : null;

  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6">
      {/* Studio Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xs">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/my-courses">
            <Button size="sm" variant="ghost" className="gap-1.5 px-2.5 text-xs">
              <ArrowLeft className="h-4 w-4" />
              Thoát
            </Button>
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-bold sm:text-base">{room.course.title}</h1>
              {room.isStaffPreview && (
                <Badge variant="outline" className="text-[10px]">
                  Chế độ xem Giảng viên
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {room.enrollment.completedLessonsCount}/{room.course.totalLessons} bài hoàn thành (
              <strong className="font-mono text-primary">
                {Math.round(room.enrollment.progressPercent)}%
              </strong>
              )
              {room.course.sequentialLockEnabled && ' • Học tuần tự đang bật'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Overall Progress Pill */}
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, room.enrollment.progressPercent)}%` }}
              />
            </div>
          </div>

          {room.certificate && (
            <Link href={room.certificate.verifyPath}>
              <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Award className="h-4 w-4" />
                Chứng chỉ PDF + QR
              </Button>
            </Link>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setTheaterMode((v) => !v)}
            className="hidden gap-1.5 text-xs lg:inline-flex"
          >
            {theaterMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" /> Hiện lộ trình
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" /> Chế độ Rạp chiếu
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div
        className={cn(
          'grid items-start gap-6',
          theaterMode ? 'grid-cols-1' : 'lg:grid-cols-[1fr_360px]',
        )}
      >
        {/* LEFT STAGE: LESSON CONTENT + NAVIGATION + BOTTOM TABS */}
        <div className="min-w-0 space-y-5">
          {loadingLesson ? (
            <Skeleton className="aspect-video w-full rounded-2xl" />
          ) : lessonError ? (
            <Card className="border-amber-500/30">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Lock className="mb-3 h-10 w-10 text-amber-500" />
                <h2 className="text-lg font-bold">Bài học đang được khóa tuần tự</h2>
                <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                  {lessonError instanceof ApiClientError
                    ? lessonError.message
                    : 'Vui lòng hoàn thành bài học trước đó để mở khóa bài này.'}
                </p>
                {lockedMeta?.previousLessonId && (
                  <Button
                    className="mt-5"
                    onClick={() => setActiveLessonId(lockedMeta.previousLessonId!)}
                  >
                    Mở bài trước: {lockedMeta.previousLessonTitle || 'Bài học trước'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : lessonContent ? (
            <>
              {/* Lesson Title Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-primary">{lessonContent.sectionTitle}</p>
                  <h2 className="text-xl font-bold tracking-tight">{lessonContent.title}</h2>
                </div>
                {lessonContent.progress.isCompleted && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Đã hoàn thành
                  </Badge>
                )}
              </div>

              {/* Stage Content by LessonType */}
              {lessonContent.type === LessonType.VIDEO && (
                <SmartVideoPlayer
                  ref={videoHandleRef}
                  lessonId={lessonContent.id}
                  playbackUrl={lessonContent.playbackUrl}
                  initialPositionSec={lessonContent.progress.lastPositionSec}
                  initialWatchedPercent={lessonContent.progress.watchedPercent}
                  minWatchPercent={lessonContent.minWatchPercent}
                  isCompletedInitial={lessonContent.progress.isCompleted}
                  onProgressUpdated={(res) => {
                    if (res.justCompleted || res.certificate) {
                      refreshLearningState();
                    }
                  }}
                  onQuickNoteShortcut={(sec) => setQuickNoteTriggerSec(sec)}
                />
              )}

              {lessonContent.type === LessonType.ARTICLE && (
                <Card>
                  <CardContent className="space-y-6 p-6 sm:p-8">
                    <div className="text-sm leading-relaxed text-foreground/95 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3.5 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:text-zinc-100">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                        {lessonContent.articleMd || '_Chưa có nội dung bài đọc._'}
                      </ReactMarkdown>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                      <span className="text-xs text-muted-foreground">
                        {lessonContent.progress.isCompleted
                          ? 'Bạn đã hoàn thành bài đọc này.'
                          : 'Đọc xong nội dung trên và xác nhận hoàn thành để mở bài kế tiếp.'}
                      </span>
                      <Button
                        disabled={
                          lessonContent.progress.isCompleted || completeArticleMutation.isPending
                        }
                        onClick={() => completeArticleMutation.mutate(lessonContent.id)}
                        className="gap-2"
                      >
                        {completeArticleMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {lessonContent.progress.isCompleted
                          ? 'Đã hoàn thành bài đọc'
                          : 'Đánh dấu đã hoàn thành'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {lessonContent.type === LessonType.QUIZ && (
                <QuizRunner
                  lessonId={lessonContent.id}
                  onPassed={() => refreshLearningState()}
                />
              )}

              {/* Prev / Next Navigation Bar */}
              <div className="flex items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!lessonContent.navigation.previousLesson}
                  onClick={() => {
                    if (lessonContent.navigation.previousLesson) {
                      setActiveLessonId(lessonContent.navigation.previousLesson.id);
                    }
                  }}
                  className="gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Bài trước
                </Button>

                <Button
                  size="sm"
                  disabled={!lessonContent.navigation.nextLesson}
                  variant={
                    lessonContent.navigation.nextLesson?.isUnlocked ? 'default' : 'outline'
                  }
                  onClick={() => {
                    const next = lessonContent.navigation.nextLesson;
                    if (!next) return;
                    if (!next.isUnlocked) {
                      notify.info('Hoàn thành bài hiện tại để mở khóa bài kế tiếp nhé!');
                      return;
                    }
                    setActiveLessonId(next.id);
                  }}
                  className="gap-1.5"
                >
                  {lessonContent.navigation.nextLesson &&
                    !lessonContent.navigation.nextLesson.isUnlocked && (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                  Bài tiếp theo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Notes, Q&A & Course Review Tabs */}
              <LessonTabsPanel
                courseId={room.course.id}
                courseInstructorId={room.course.instructor.id}
                lessonId={lessonContent.id}
                lessonType={lessonContent.type}
                progressPercent={room.enrollment.progressPercent}
                isStaffPreview={room.isStaffPreview}
                myReview={room.myReview}
                quickNoteTriggerSec={quickNoteTriggerSec}
                onQuickNoteHandled={() => setQuickNoteTriggerSec(null)}
                onCaptureVideoTimestamp={() => {
                  videoHandleRef.current?.pause();
                  return videoHandleRef.current?.getCurrentTime() ?? 0;
                }}
                onSeekVideo={(sec) => {
                  videoHandleRef.current?.seekTo(sec);
                }}
                onReviewSaved={refreshLearningState}
              />
            </>
          ) : null}
        </div>

        {/* RIGHT CURRICULUM SIDEBAR */}
        {!theaterMode && (
          <aside className="rounded-2xl border border-border bg-card shadow-xs lg:sticky lg:top-20 lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto">
            <div className="border-b border-border px-4 py-3.5">
              <h3 className="text-sm font-bold">Nội dung khóa học</h3>
              <p className="text-[11px] text-muted-foreground">
                {room.sections.length} chương • {room.course.totalLessons} bài học
              </p>
            </div>

            <div className="divide-y divide-border">
              {room.sections.map((section, sIdx) => {
                const isOpen = Boolean(expandedSections[section.id]);
                const doneInSection = section.lessons.filter((l) => l.isCompleted).length;

                return (
                  <div key={section.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          [section.id]: !prev[section.id],
                        }))
                      }
                      className="flex w-full cursor-pointer items-center justify-between gap-2 bg-secondary/35 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">
                          Chương {sIdx + 1}: {section.title}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {doneInSection}/{section.lessons.length} bài hoàn thành
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                          !isOpen && '-rotate-90',
                        )}
                      />
                    </button>

                    {isOpen && (
                      <div className="divide-y divide-border/50">
                        {section.lessons.map((lesson) => {
                          const isActive = lesson.id === activeLessonId;
                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => {
                                if (!lesson.isUnlocked) {
                                  notify.info('Bài học này đang khóa theo lộ trình tuần tự', {
                                    description: 'Hãy hoàn thành bài học liền trước để mở khóa nhé.',
                                  });
                                  return;
                                }
                                setActiveLessonId(lesson.id);
                              }}
                              className={cn(
                                'flex w-full cursor-pointer items-start gap-2.5 px-4 py-3 text-left transition-colors',
                                isActive
                                  ? 'bg-primary/12 text-foreground'
                                  : lesson.isUnlocked
                                    ? 'hover:bg-secondary/40'
                                    : 'opacity-55 hover:bg-secondary/20',
                              )}
                            >
                              <div className="mt-0.5 shrink-0">
                                {lesson.isCompleted ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                ) : !lesson.isUnlocked ? (
                                  <Lock className="h-4 w-4 text-muted-foreground" />
                                ) : lesson.type === LessonType.VIDEO ? (
                                  <Video className="h-4 w-4 text-primary" />
                                ) : lesson.type === LessonType.ARTICLE ? (
                                  <FileText className="h-4 w-4 text-sky-500" />
                                ) : (
                                  <HelpCircle className="h-4 w-4 text-amber-500" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    'line-clamp-2 text-xs leading-snug',
                                    isActive ? 'font-bold text-primary' : 'font-medium',
                                  )}
                                >
                                  {lesson.title}
                                </p>
                                <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                                  <span>
                                    {lesson.type === LessonType.VIDEO
                                      ? formatDuration(lesson.videoDurationSec)
                                      : lesson.type === LessonType.ARTICLE
                                        ? 'Bài đọc'
                                        : `Quiz (${lesson.quizMeta?.questionsCount ?? 0} câu)`}
                                  </span>
                                  {lesson.type === LessonType.VIDEO &&
                                    lesson.watchedPercent > 0 &&
                                    !lesson.isCompleted && (
                                      <span className="text-primary">
                                        • {lesson.watchedPercent}%
                                      </span>
                                    )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function LearnCoursePage() {
  return (
    <RoleGuard>
      <LearningRoomContent />
    </RoleGuard>
  );
}
