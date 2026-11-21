'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Gauge,
  HelpCircle,
  Lock,
  Play,
  ShoppingCart,
  Video,
  X,
} from 'lucide-react';
import { formatDuration, formatVnd, LessonType, parseVideoSource } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UniversalVideoPreview } from '@/components/ui/universal-video-preview';
import { useAuthStore } from '@/features/auth/auth.store';
import { useCartStore } from '@/features/cart/cart.store';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import type { FreePreviewResponse } from './types';

interface FreePreviewModalProps {
  courseSlug: string | null;
  initialLessonId: string | null;
  courseThumbnail?: string | null;
  instructorName?: string;
  onClose: () => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

export function FreePreviewModal({
  courseSlug,
  initialLessonId,
  courseThumbnail,
  instructorName = 'Giảng viên Try4T',
  onClose,
}: FreePreviewModalProps) {
  const [activeLessonId, setActiveLessonId] = React.useState<string | null>(initialLessonId);
  const [playbackRate, setPlaybackRate] = React.useState<number>(1);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const user = useAuthStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);
  const openDrawer = useCartStore((s) => s.openDrawer);

  React.useEffect(() => {
    setActiveLessonId(initialLessonId);
    setPlaybackRate(1);
  }, [initialLessonId, courseSlug]);

  React.useEffect(() => {
    if (!courseSlug || !activeLessonId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [courseSlug, activeLessonId, onClose]);

  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeLessonId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['free-preview', courseSlug, activeLessonId],
    queryFn: () =>
      api.get<FreePreviewResponse>(`/catalog/courses/${courseSlug}/preview/${activeLessonId}`, {
        skipAuthRefresh: true,
      }),
    enabled: Boolean(courseSlug && activeLessonId),
    retry: false,
  });

  if (!courseSlug || !activeLessonId) return null;

  async function handleAddToCart() {
    if (!data) return;
    await addItem(
      {
        id: data.course.id,
        slug: data.course.slug,
        title: data.course.title,
        thumbnailUrl: courseThumbnail ?? null,
        instructorName,
        priceVnd: data.course.priceVnd,
        salePriceVnd: data.course.salePriceVnd,
      },
      Boolean(user),
    );
    onClose();
    openDrawer();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Dark Cinema Modal */}
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b1311] text-zinc-100 shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="success" className="text-[10px]">
                HỌC THỬ MIỄN PHÍ
              </Badge>
              <span className="truncate text-xs text-zinc-400">
                {data?.course.title || 'Đang tải bài học thử...'}
              </span>
            </div>
            <h2 className="mt-1 truncate text-base font-semibold text-zinc-50">
              {data?.lesson.title || 'Trình phát học thử Try4T'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng trình học thử"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-4 p-5">
              <Skeleton className="aspect-video w-full rounded-xl bg-zinc-800/80" />
              <Skeleton className="h-24 w-full rounded-xl bg-zinc-800/80" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400">
                <Lock className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold">Không thể phát bài học này</p>
              <p className="mt-1 max-w-md text-xs text-zinc-400">
                {error instanceof ApiClientError
                  ? error.message
                  : 'Bài học này không nằm trong danh sách học thử miễn phí.'}
              </p>
            </div>
          ) : data ? (
            <div>
              {/* VIDEO PREVIEW */}
              {data.lesson.type === LessonType.VIDEO && (
                <div className="bg-black">
                  {data.lesson.playbackUrl ? (
                    <UniversalVideoPreview
                      url={data.lesson.playbackUrl}
                      autoPlay
                      playbackRate={playbackRate}
                      videoRef={videoRef}
                      className="max-h-[55vh]"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm text-zinc-400">
                      Video bài học đang được xử lý.
                    </div>
                  )}

                  {/* Speed Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-y border-zinc-800 bg-zinc-950 px-5 py-2.5 text-xs">
                    <span className="text-zinc-400">
                      {data.lesson.sectionTitle} • {formatDuration(data.lesson.videoDurationSec)}
                      {data.lesson.playbackUrl &&
                        parseVideoSource(data.lesson.playbackUrl)?.provider !== 'DIRECT' &&
                        ` • ${parseVideoSource(data.lesson.playbackUrl)?.providerLabel}`}
                    </span>
                    {parseVideoSource(data.lesson.playbackUrl)?.provider === 'DIRECT' && (
                      <div className="flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="mr-1 text-zinc-400">Tốc độ:</span>
                        {SPEED_OPTIONS.map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => setPlaybackRate(rate)}
                            className={cn(
                              'cursor-pointer rounded px-2 py-0.5 font-mono text-[11px] transition-colors',
                              playbackRate === rate
                                ? 'bg-emerald-500 font-bold text-zinc-950'
                                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800',
                            )}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ARTICLE PREVIEW */}
              {data.lesson.type === LessonType.ARTICLE && (
                <div className="border-b border-zinc-800 bg-[#0e1714] p-6">
                  <div className="prose-sm max-w-none leading-relaxed text-zinc-200 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-emerald-300 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:bg-zinc-950 [&_pre]:p-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                      {data.lesson.articleMd || '*Chưa có nội dung bài đọc*'}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* QUIZ PREVIEW */}
              {data.lesson.type === LessonType.QUIZ && data.lesson.quiz && (
                <div className="space-y-3 border-b border-zinc-800 bg-[#0e1714] p-6">
                  <p className="text-xs text-zinc-400">
                    Xem trước cấu trúc bài kiểm tra ({data.lesson.quiz.questions.length} câu • Điểm
                    đạt ≥ {data.lesson.quiz.passScorePercent}%). Đăng ký khóa học để làm bài &amp;
                    chấm điểm chi tiết.
                  </p>
                  {data.lesson.quiz.questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-sm"
                    >
                      <p className="font-medium text-zinc-100">
                        Câu {idx + 1}: {q.promptMd}
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                        {q.options.map((o) => (
                          <li key={o.id}>• {o.content}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Free Preview Playlist */}
              {data.previewPlaylist.length > 0 && (
                <div className="p-5">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Danh sách bài học thử miễn phí ({data.previewPlaylist.length})
                  </p>
                  <div className="space-y-1.5">
                    {data.previewPlaylist.map((item) => {
                      const active = item.id === data.lesson.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveLessonId(item.id)}
                          className={cn(
                            'flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs transition-colors',
                            active
                              ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                              : 'bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800/80',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            {active ? (
                              <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
                            ) : item.type === LessonType.VIDEO ? (
                              <Video className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            ) : item.type === LessonType.ARTICLE ? (
                              <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            ) : (
                              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            )}
                            <span className="truncate font-medium">{item.title}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-zinc-400">
                            {formatDuration(item.videoDurationSec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer CTA */}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/90 px-5 py-3.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold text-emerald-400">
                {formatVnd(data.course.salePriceVnd ?? data.course.priceVnd)}
              </span>
              {data.course.salePriceVnd !== null &&
                data.course.salePriceVnd < data.course.priceVnd && (
                  <span className="font-mono text-xs text-zinc-500 line-through">
                    {formatVnd(data.course.priceVnd)}
                  </span>
                )}
            </div>
            <Button onClick={handleAddToCart} size="sm" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Thêm vào giỏ để mở khóa toàn bộ
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
