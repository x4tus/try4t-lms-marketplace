'use client';

import * as React from 'react';
import { CheckCircle2, Gauge, Keyboard, ShieldCheck } from 'lucide-react';
import { formatDuration } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/features/auth/auth.store';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import type { HeartbeatResponse, VideoPlayerHandle } from './types';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

interface SmartVideoPlayerProps {
  lessonId: string;
  playbackUrl: string | null;
  initialPositionSec: number;
  initialWatchedPercent: number;
  minWatchPercent: number;
  isCompletedInitial: boolean;
  onProgressUpdated: (res: HeartbeatResponse) => void;
  onQuickNoteShortcut: (currentSec: number) => void;
}

export const SmartVideoPlayer = React.forwardRef<VideoPlayerHandle, SmartVideoPlayerProps>(
  function SmartVideoPlayer(
    {
      lessonId,
      playbackUrl,
      initialPositionSec,
      initialWatchedPercent,
      minWatchPercent,
      isCompletedInitial,
      onProgressUpdated,
      onQuickNoteShortcut,
    },
    ref,
  ) {
    const user = useAuthStore((s) => s.user);
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const segmentStartRef = React.useRef<number>(initialPositionSec);
    const lastValidTimeRef = React.useRef<number>(initialPositionSec);
    const resumedForLessonRef = React.useRef<string | null>(null);
    const inFlightRef = React.useRef(false);

    const [playbackRate, setPlaybackRate] = React.useState(1);
    const [watchedPercent, setWatchedPercent] = React.useState(initialWatchedPercent);
    const [isCompleted, setIsCompleted] = React.useState(isCompletedInitial);
    const [resumedNoticeSec, setResumedNoticeSec] = React.useState<number | null>(null);
    const [watermarkPos, setWatermarkPos] = React.useState({ top: 14, left: 10 });

    // Đồng bộ lại state khi chuyển sang bài học khác
    React.useEffect(() => {
      setWatchedPercent(initialWatchedPercent);
      setIsCompleted(isCompletedInitial);
      segmentStartRef.current = initialPositionSec;
      lastValidTimeRef.current = initialPositionSec;
      resumedForLessonRef.current = null;
      setResumedNoticeSec(null);
    }, [lessonId, initialPositionSec, initialWatchedPercent, isCompletedInitial]);

    // Dynamic Drifting Watermark (chống quay màn hình chia sẻ lậu)
    React.useEffect(() => {
      const moveWatermark = () => {
        const top = 10 + Math.floor(Math.random() * 68);
        const left = 6 + Math.floor(Math.random() * 58);
        setWatermarkPos({ top, left });
      };
      moveWatermark();
      const timer = window.setInterval(moveWatermark, 8000);
      return () => window.clearInterval(timer);
    }, []);

    React.useImperativeHandle(ref, () => ({
      getCurrentTime: () => Math.floor(videoRef.current?.currentTime ?? 0),
      pause: () => {
        videoRef.current?.pause();
      },
      seekTo: (seconds: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, seconds);
        segmentStartRef.current = v.currentTime;
        lastValidTimeRef.current = v.currentTime;
        void v.play().catch(() => {});
      },
    }));

    const flushHeartbeat = React.useCallback(
      async (force = false) => {
        const v = videoRef.current;
        if (!v || inFlightRef.current) return;

        const currentSec = v.currentTime;
        const fromSec = segmentStartRef.current;
        const toSec = currentSec;

        if (!force && toSec - fromSec < 2) {
          return;
        }

        const safeFrom = toSec > fromSec ? fromSec : Math.max(0, currentSec - 0.5);
        const safeTo = Math.max(safeFrom, currentSec);
        segmentStartRef.current = currentSec;

        inFlightRef.current = true;
        try {
          const res = await api.post<HeartbeatResponse>(`/learning/lessons/${lessonId}/heartbeat`, {
            currentSec: Math.round(currentSec),
            fromSec: Number(safeFrom.toFixed(1)),
            toSec: Number(safeTo.toFixed(1)),
            playbackRate: v.playbackRate || 1,
          });

          setWatchedPercent(res.watchedPercent);
          setIsCompleted(res.isCompleted);

          if (res.cheatDetected) {
            notify.warning('Phát hiện tua nhanh bất thường', {
              description: 'Đoạn video bị tua qua sẽ không được tính vào tiến độ hoàn thành.',
            });
          }

          if (res.justCompleted) {
            notify.success('Đã hoàn thành bài học video!', {
              description: res.certificate
                ? 'Bạn đã hoàn thành 100% khóa học và nhận được Chứng chỉ QR!'
                : 'Bài học tiếp theo đã sẵn sàng mở khóa.',
            });
          }

          onProgressUpdated(res);
        } catch {
          // Bỏ qua lỗi mạng tạm thời, nhịp tiếp theo sẽ tiếp tục đồng bộ
        } finally {
          inFlightRef.current = false;
        }
      },
      [lessonId, onProgressUpdated],
    );

    // Gửi heartbeat định kỳ mỗi 10 giây khi video đang phát
    React.useEffect(() => {
      const interval = window.setInterval(() => {
        const v = videoRef.current;
        if (v && !v.paused && !v.ended) {
          void flushHeartbeat(false);
        }
      }, 10_000);

      return () => {
        window.clearInterval(interval);
        void flushHeartbeat(false);
      };
    }, [flushHeartbeat]);

    // Phím tắt phòng học (Space, ←/→, M, F, N)
    React.useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }

        const v = videoRef.current;
        if (!v) return;

        if (e.code === 'Space') {
          e.preventDefault();
          if (v.paused) void v.play().catch(() => {});
          else v.pause();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          segmentStartRef.current = v.currentTime;
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          v.currentTime = Math.min(v.duration || v.currentTime + 5, v.currentTime + 5);
          segmentStartRef.current = v.currentTime;
        } else if (e.key === 'm' || e.key === 'M') {
          v.muted = !v.muted;
        } else if (e.key === 'f' || e.key === 'F') {
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          } else {
            void v.requestFullscreen().catch(() => {});
          }
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          v.pause();
          onQuickNoteShortcut(Math.floor(v.currentTime));
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [onQuickNoteShortcut]);

    function handleSpeedChange(rate: number) {
      setPlaybackRate(rate);
      if (videoRef.current) {
        videoRef.current.playbackRate = rate;
      }
    }

    const watermarkLabel = user ? `${user.email} • #${user.id.slice(0, 8)}` : 'Try4T Protected';

    return (
      <div className="space-y-3">
        {/* Dark Cinema Container */}
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-xl">
          {playbackUrl ? (
            <>
              <video
                ref={videoRef}
                key={playbackUrl}
                src={playbackUrl}
                controls
                controlsList="nodownload"
                playsInline
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  v.playbackRate = playbackRate;
                  if (
                    resumedForLessonRef.current !== lessonId &&
                    initialPositionSec > 2 &&
                    (!v.duration || initialPositionSec < v.duration - 5)
                  ) {
                    resumedForLessonRef.current = lessonId;
                    v.currentTime = initialPositionSec;
                    segmentStartRef.current = initialPositionSec;
                    lastValidTimeRef.current = initialPositionSec;
                    setResumedNoticeSec(initialPositionSec);
                    window.setTimeout(() => setResumedNoticeSec(null), 4000);
                  }
                }}
                onPlay={(e) => {
                  segmentStartRef.current = e.currentTarget.currentTime;
                  lastValidTimeRef.current = e.currentTarget.currentTime;
                }}
                onTimeUpdate={(e) => {
                  const nowSec = e.currentTarget.currentTime;
                  // Nếu người dùng không tua đột ngột (> 2.5s), cập nhật mốc hợp lệ liên tục
                  if (Math.abs(nowSec - lastValidTimeRef.current) <= 2.5) {
                    lastValidTimeRef.current = nowSec;
                  } else {
                    // Phát hiện seek -> reset điểm bắt đầu đoạn mới ngay tại vị trí vừa tua tới
                    segmentStartRef.current = nowSec;
                    lastValidTimeRef.current = nowSec;
                  }
                }}
                onSeeked={(e) => {
                  segmentStartRef.current = e.currentTarget.currentTime;
                  lastValidTimeRef.current = e.currentTarget.currentTime;
                }}
                onPause={() => {
                  void flushHeartbeat(true);
                }}
                onEnded={() => {
                  void flushHeartbeat(true);
                }}
                className="h-full w-full"
              />

              {/* Dynamic Drifting Watermark */}
              <div
                style={{ top: `${watermarkPos.top}%`, left: `${watermarkPos.left}%` }}
                className="pointer-events-none absolute z-20 select-none rounded-md bg-black/30 px-2.5 py-1 font-mono text-[11px] text-white/45 transition-all duration-1000"
              >
                {watermarkLabel}
              </div>

              {/* Resume Playback Toast Overlay */}
              {resumedNoticeSec !== null && (
                <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full bg-emerald-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
                  Tiếp tục phát từ {formatDuration(resumedNoticeSec)}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-zinc-400">
              Video bài giảng đang được xử lý hoặc chưa có tệp phát.
            </div>
          )}
        </div>

        {/* Player Utility Bar: Anti-Cheat Watch Progress + Speed + Shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {isCompleted ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đã hoàn thành video ({watchedPercent}%)
              </Badge>
            ) : (
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">
                  Xem hợp lệ:{' '}
                  <strong className="font-mono text-foreground">{watchedPercent}%</strong> /{' '}
                  <span className="font-mono">{minWatchPercent}%</span>
                </span>
                <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-secondary sm:block">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((watchedPercent / Math.max(1, minWatchPercent)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground xl:inline-flex">
              <Keyboard className="h-3.5 w-3.5" />
              Phím tắt: Space • ←/→ • M • F • N (Ghi chú)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleSpeedChange(rate)}
                className={cn(
                  'cursor-pointer rounded-md px-2 py-0.5 font-mono text-[11px] transition-colors',
                  playbackRate === rate
                    ? 'bg-primary font-bold text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground',
                )}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  },
);
