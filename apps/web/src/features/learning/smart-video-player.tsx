'use client';

import * as React from 'react';
import { CheckCircle2, Gauge, Keyboard, Lock, ShieldCheck, Youtube } from 'lucide-react';
import {
  formatDuration,
  parseVideoSource,
  type CourseProgressionConfig,
} from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/features/auth/auth.store';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import type { HeartbeatResponse, VideoPlayerHandle } from './types';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
}

interface YTGlobal {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayerInstance;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTGlobal> | null = null;

function loadYouTubeIframeApi(): Promise<YTGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SSR'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (!ytApiPromise) {
    ytApiPromise = new Promise<YTGlobal>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        if (window.YT) resolve(window.YT);
      };
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
      }
    });
  }
  return ytApiPromise;
}

interface SmartVideoPlayerProps {
  lessonId: string;
  playbackUrl: string | null;
  initialPositionSec: number;
  initialWatchedPercent: number;
  maxReachedSecInitial?: number;
  videoDurationSec?: number;
  minWatchPercent: number;
  progressionConfig?: CourseProgressionConfig;
  isCompletedInitial: boolean;
  isStaffPreview?: boolean;
  readOnlyVersion?: boolean;
  onProgressUpdated: (res: HeartbeatResponse) => void;
  onQuickNoteShortcut: (currentSec: number) => void;
  onVideoEnded?: () => void;
}

export const SmartVideoPlayer = React.forwardRef<VideoPlayerHandle, SmartVideoPlayerProps>(
  function SmartVideoPlayer(
    {
      lessonId,
      playbackUrl,
      initialPositionSec,
      initialWatchedPercent,
      maxReachedSecInitial = 0,
      videoDurationSec = 0,
      minWatchPercent,
      progressionConfig,
      isCompletedInitial,
      isStaffPreview = false,
      readOnlyVersion = false,
      onProgressUpdated,
      onQuickNoteShortcut,
      onVideoEnded,
    },
    ref,
  ) {
    const user = useAuthStore((s) => s.user);
    const preferredSpeed = user?.themeConfig?.learning?.defaultPlaybackSpeed ?? 1;
    const source = React.useMemo(() => parseVideoSource(playbackUrl), [playbackUrl]);

    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const ytHostRef = React.useRef<HTMLDivElement | null>(null);
    const ytPlayerRef = React.useRef<YTPlayerInstance | null>(null);
    const vimeoIframeRef = React.useRef<HTMLIFrameElement | null>(null);

    const initialFrontier = Math.max(initialPositionSec, maxReachedSecInitial);
    const segmentStartRef = React.useRef<number>(initialPositionSec);
    const lastValidTimeRef = React.useRef<number>(initialPositionSec);
    const currentTimeRef = React.useRef<number>(initialPositionSec);
    const maxFrontierRef = React.useRef<number>(initialFrontier);
    const durationRef = React.useRef<number>(videoDurationSec);
    const isPlayingRef = React.useRef<boolean>(false);
    const playbackRateRef = React.useRef<number>(preferredSpeed);
    const resumedForLessonRef = React.useRef<string | null>(null);
    const inFlightRef = React.useRef(false);
    const lastBlockToastAtRef = React.useRef(0);
    const isEnforcingSeekRef = React.useRef(false);
    const enforcingUntilRef = React.useRef(0);

    const [playbackRate, setPlaybackRate] = React.useState(preferredSpeed);
    const [watchedPercent, setWatchedPercent] = React.useState(initialWatchedPercent);
    const [maxFrontierDisplay, setMaxFrontierDisplay] = React.useState(Math.floor(initialFrontier));
    const [isCompleted, setIsCompleted] = React.useState(isCompletedInitial);
    const [resumedNoticeSec, setResumedNoticeSec] = React.useState<number | null>(null);
    const [seekBlockedNotice, setSeekBlockedNotice] = React.useState<string | null>(null);
    const [watermarkPos, setWatermarkPos] = React.useState({ top: 14, left: 10 });

    const blockFastForward = progressionConfig?.blockFastForward ?? true;
    const maxSeekAheadPercent = progressionConfig?.maxSeekAheadPercent ?? 5;
    const seekLockActive = Boolean(
      !readOnlyVersion && !isStaffPreview && !isCompleted && blockFastForward,
    );
    const seekLockActiveRef = React.useRef(seekLockActive);
    seekLockActiveRef.current = seekLockActive;

    const getSeekCeiling = React.useCallback(
      (durationHint?: number) => {
        const dur =
          durationHint && Number.isFinite(durationHint) && durationHint > 0
            ? durationHint
            : durationRef.current || videoDurationSec || 0;
        const aheadSec = dur > 0 ? Math.round((dur * maxSeekAheadPercent) / 100) : 0;
        const rawCeiling = maxFrontierRef.current + aheadSec;
        return dur > 0 ? Math.min(dur, rawCeiling) : rawCeiling;
      },
      [maxSeekAheadPercent, videoDurationSec],
    );

    const getReturnPointBeforeSeek = React.useCallback(
      (ceilingSec: number) => {
        const beforeSeek = Math.max(0, lastValidTimeRef.current);
        return Math.max(0, Math.min(beforeSeek, ceilingSec));
      },
      [],
    );

    const notifySeekBlocked = React.useCallback(
      (returnSec: number, ceilingSec: number) => {
        const now = Date.now();
        const returnLabel = formatDuration(Math.max(0, Math.floor(returnSec)));
        const ceilingLabel = formatDuration(Math.max(0, Math.floor(ceilingSec)));
        const pillText = `Chặn tua nhanh • Đã quay lại ${returnLabel}`;
        setSeekBlockedNotice(pillText);
        window.setTimeout(() => {
          setSeekBlockedNotice((prev) => (prev === pillText ? null : prev));
        }, 2800);

        if (now - lastBlockToastAtRef.current < 2200) return;
        lastBlockToastAtRef.current = now;
        notify.warning('Không thể tua vượt phần chưa xem', {
          description:
            maxSeekAheadPercent > 0
              ? `Bạn chỉ được tua tối đa +${maxSeekAheadPercent}% (giới hạn ${ceilingLabel}). Hệ thống đã đưa video quay lại mốc ${returnLabel} trước khi tua.`
              : `Khóa học bật chặn tua nhanh — đã đưa video quay lại đúng mốc ${returnLabel} trước khi tua.`,
        });
      },
      [maxSeekAheadPercent],
    );

    // Sync state on lesson change
    React.useEffect(() => {
      const frontier = Math.max(initialPositionSec, maxReachedSecInitial);
      setWatchedPercent(initialWatchedPercent);
      setIsCompleted(isCompletedInitial);
      setMaxFrontierDisplay(Math.floor(frontier));
      segmentStartRef.current = initialPositionSec;
      lastValidTimeRef.current = initialPositionSec;
      currentTimeRef.current = initialPositionSec;
      maxFrontierRef.current = frontier;
      durationRef.current = videoDurationSec;
      isPlayingRef.current = false;
      resumedForLessonRef.current = null;
      setResumedNoticeSec(null);
      setSeekBlockedNotice(null);
    }, [
      lessonId,
      playbackUrl,
      initialPositionSec,
      initialWatchedPercent,
      maxReachedSecInitial,
      videoDurationSec,
      isCompletedInitial,
    ]);

    React.useEffect(() => {
      setPlaybackRate(preferredSpeed);
      playbackRateRef.current = preferredSpeed;
    }, [preferredSpeed]);

    // Dynamic Drifting Watermark
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

    const advanceFrontierIfValid = React.useCallback((nextSec: number, maxStep = 2.6) => {
      const delta = nextSec - lastValidTimeRef.current;
      if (delta >= 0 && delta <= maxStep) {
        if (nextSec > maxFrontierRef.current) {
          maxFrontierRef.current = nextSec;
          const floored = Math.floor(nextSec);
          setMaxFrontierDisplay((prev) => (floored > prev ? floored : prev));
        }
        lastValidTimeRef.current = nextSec;
        return true;
      }
      if (delta < 0 && Math.abs(delta) <= maxStep) {
        lastValidTimeRef.current = nextSec;
        return true;
      }
      return false;
    }, []);

    const sendHeartbeatSegment = React.useCallback(
      async (currentSec: number, fromSec: number, toSec: number, rate: number, force = false) => {
        if (readOnlyVersion) return;
        if (inFlightRef.current) return;
        if (!force && toSec - fromSec < 1.5) return;

        const safeFrom = toSec > fromSec ? fromSec : Math.max(0, currentSec - 0.5);
        const safeTo = Math.max(safeFrom, currentSec);
        segmentStartRef.current = currentSec;

        inFlightRef.current = true;
        try {
          const res = await api.post<HeartbeatResponse>(`/learning/lessons/${lessonId}/heartbeat`, {
            currentSec: Math.round(currentSec),
            fromSec: Number(safeFrom.toFixed(1)),
            toSec: Number(safeTo.toFixed(1)),
            playbackRate: rate || 1,
          });

          setWatchedPercent(res.watchedPercent);
          setIsCompleted(res.isCompleted);
          if (typeof res.maxReachedSec === 'number' && res.maxReachedSec > maxFrontierRef.current) {
            maxFrontierRef.current = res.maxReachedSec;
            setMaxFrontierDisplay(Math.floor(res.maxReachedSec));
          }

          if (res.cheatDetected && !seekLockActiveRef.current) {
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
          // Ignore transient network hiccup; next heartbeat retries automatically
        } finally {
          inFlightRef.current = false;
        }
      },
      [lessonId, onProgressUpdated, readOnlyVersion],
    );

    const flushCurrentPlayerHeartbeat = React.useCallback(
      (force = false) => {
        if (readOnlyVersion) return;
        if (source?.provider === 'DIRECT') {
          const v = videoRef.current;
          if (!v) return;
          void sendHeartbeatSegment(
            v.currentTime,
            segmentStartRef.current,
            v.currentTime,
            v.playbackRate || 1,
            force,
          );
          return;
        }

        if (source?.provider === 'YOUTUBE') {
          const p = ytPlayerRef.current;
          if (!p) return;
          const cur = Number(p.getCurrentTime?.() ?? currentTimeRef.current);
          const rate = Number(p.getPlaybackRate?.() ?? playbackRateRef.current);
          void sendHeartbeatSegment(cur, segmentStartRef.current, cur, rate, force);
          return;
        }

        if (source?.provider === 'VIMEO' || source?.provider === 'GOOGLE_DRIVE') {
          const cur = currentTimeRef.current;
          void sendHeartbeatSegment(
            cur,
            segmentStartRef.current,
            cur,
            playbackRateRef.current,
            force,
          );
        }
      },
      [source?.provider, sendHeartbeatSegment, readOnlyVersion],
    );

    // Flush progress cleanly when user switches tab or closes page
    React.useEffect(() => {
      if (readOnlyVersion) return;
      const onVis = () => {
        if (document.visibilityState === 'hidden') {
          flushCurrentPlayerHeartbeat(true);
        }
      };
      document.addEventListener('visibilitychange', onVis);
      return () => document.removeEventListener('visibilitychange', onVis);
    }, [flushCurrentPlayerHeartbeat, readOnlyVersion]);

    // =========================================================================
    // YOUTUBE IFRAME PLAYER API (Instant Anti-Seek + Resume + 5s Heartbeat)
    // =========================================================================
    React.useEffect(() => {
      if (source?.provider !== 'YOUTUBE' || !source.videoId || !ytHostRef.current) return;

      let disposed = false;
      let pollTimer: number | null = null;
      let heartbeatTimer: number | null = null;

      void loadYouTubeIframeApi()
        .then((YT) => {
          if (disposed || !ytHostRef.current) return;
          ytHostRef.current.innerHTML = '';
          const mountNode = document.createElement('div');
          mountNode.style.width = '100%';
          mountNode.style.height = '100%';
          ytHostRef.current.appendChild(mountNode);

          const startSec =
            !readOnlyVersion && initialPositionSec > 2 ? Math.floor(initialPositionSec) : 0;

          const player = new YT.Player(mountNode, {
            videoId: source.videoId!,
            host: 'https://www.youtube-nocookie.com',
            width: '100%',
            height: '100%',
            playerVars: {
              rel: 0,
              modestbranding: 1,
              iv_load_policy: 3,
              playsinline: 1,
              start: startSec,
            },
            events: {
              onReady: () => {
                if (disposed) return;
                const d = Number(player.getDuration?.() ?? 0);
                if (d > 0) durationRef.current = d;
                player.setPlaybackRate(playbackRateRef.current);
                if (startSec > 2 && resumedForLessonRef.current !== lessonId) {
                  resumedForLessonRef.current = lessonId;
                  setResumedNoticeSec(startSec);
                  window.setTimeout(() => setResumedNoticeSec(null), 4000);
                }
              },
              onStateChange: (ev) => {
                if (disposed) return;
                const state = ev.data;
                if (state === YT.PlayerState.PLAYING) {
                  isPlayingRef.current = true;
                  const cur = player.getCurrentTime();
                  const d = Number(player.getDuration?.() ?? 0);
                  if (d > 0) durationRef.current = d;

                  if (seekLockActiveRef.current && Date.now() >= enforcingUntilRef.current) {
                    const ceiling = getSeekCeiling(d);
                    if (cur > ceiling + 1.2) {
                      const backSec = getReturnPointBeforeSeek(ceiling);
                      enforcingUntilRef.current = Date.now() + 900;
                      notifySeekBlocked(backSec, ceiling);
                      player.seekTo(backSec, true);
                      segmentStartRef.current = backSec;
                      lastValidTimeRef.current = backSec;
                      currentTimeRef.current = backSec;
                      return;
                    }
                  }
                  segmentStartRef.current = cur;
                  lastValidTimeRef.current = cur;
                  currentTimeRef.current = cur;
                } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
                  isPlayingRef.current = false;
                  const cur =
                    state === YT.PlayerState.ENDED
                      ? player.getDuration() || player.getCurrentTime()
                      : player.getCurrentTime();
                  currentTimeRef.current = cur;
                  void sendHeartbeatSegment(
                    cur,
                    segmentStartRef.current,
                    cur,
                    player.getPlaybackRate() || 1,
                    true,
                  );
                  if (state === YT.PlayerState.ENDED) {
                    onVideoEnded?.();
                  }
                }
              },
            },
          });

          ytPlayerRef.current = player;

          // Tight 500ms real-time seek guard (catches scrubbing even while paused)
          pollTimer = window.setInterval(() => {
            if (Date.now() < enforcingUntilRef.current) return;
            const cur = Number(player.getCurrentTime?.() ?? 0);
            const d = Number(player.getDuration?.() ?? 0);
            if (d > 0) durationRef.current = d;

            if (seekLockActiveRef.current) {
              const ceiling = getSeekCeiling(d);
              if (cur > ceiling + 1.2) {
                const backSec = getReturnPointBeforeSeek(ceiling);
                enforcingUntilRef.current = Date.now() + 900;
                notifySeekBlocked(backSec, ceiling);
                player.seekTo(backSec, true);
                segmentStartRef.current = backSec;
                lastValidTimeRef.current = backSec;
                currentTimeRef.current = backSec;
                return;
              }
            }

            if (isPlayingRef.current) {
              if (!advanceFrontierIfValid(cur, 3.0)) {
                segmentStartRef.current = cur;
                lastValidTimeRef.current = cur;
              }
            }
            currentTimeRef.current = cur;
          }, 500);

          // Reliable 5s heartbeat while playing
          heartbeatTimer = window.setInterval(() => {
            if (!isPlayingRef.current) return;
            const cur = Number(player.getCurrentTime?.() ?? currentTimeRef.current);
            void sendHeartbeatSegment(
              cur,
              segmentStartRef.current,
              cur,
              player.getPlaybackRate?.() || 1,
              false,
            );
          }, 5000);
        })
        .catch(() => {});

      return () => {
        disposed = true;
        if (pollTimer) window.clearInterval(pollTimer);
        if (heartbeatTimer) window.clearInterval(heartbeatTimer);
        flushCurrentPlayerHeartbeat(true);
        try {
          ytPlayerRef.current?.destroy();
        } catch {
          // ignore youtube destroy races
        }
        ytPlayerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source?.provider, source?.videoId, lessonId, readOnlyVersion]);

    // =========================================================================
    // VIMEO POSTMESSAGE API (Instant Anti-Seek + Resume + 5s Heartbeat)
    // =========================================================================
    const postVimeoCommand = React.useCallback((method: string, value?: unknown) => {
      const win = vimeoIframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        JSON.stringify(value !== undefined ? { method, value } : { method }),
        'https://player.vimeo.com',
      );
    }, []);

    React.useEffect(() => {
      if (source?.provider !== 'VIMEO') return;

      const onMessage = (event: MessageEvent) => {
        if (!event.origin.includes('vimeo.com')) return;
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (!data || typeof data !== 'object') return;

          if (data.event === 'ready') {
            postVimeoCommand('addEventListener', 'play');
            postVimeoCommand('addEventListener', 'pause');
            postVimeoCommand('addEventListener', 'ended');
            postVimeoCommand('addEventListener', 'timeupdate');
            postVimeoCommand('addEventListener', 'seeked');
            postVimeoCommand('setPlaybackRate', playbackRateRef.current);
            if (!readOnlyVersion && initialPositionSec > 2 && resumedForLessonRef.current !== lessonId) {
              resumedForLessonRef.current = lessonId;
              postVimeoCommand('setCurrentTime', initialPositionSec);
              setResumedNoticeSec(initialPositionSec);
              window.setTimeout(() => setResumedNoticeSec(null), 4000);
            }
          } else if (data.event === 'play') {
            isPlayingRef.current = true;
            const sec = Number(data.data?.seconds ?? currentTimeRef.current);
            if (!seekLockActiveRef.current || sec <= getSeekCeiling() + 1.2) {
              segmentStartRef.current = sec;
              lastValidTimeRef.current = sec;
            }
          } else if (data.event === 'timeupdate' || data.event === 'seeked') {
            if (Date.now() < enforcingUntilRef.current) return;
            const sec = Number(data.data?.seconds ?? 0);
            const dur = Number(data.data?.duration ?? durationRef.current);
            if (dur > 0) durationRef.current = dur;

            if (seekLockActiveRef.current) {
              const ceiling = getSeekCeiling(dur);
              if (sec > ceiling + 1.2) {
                const backSec = getReturnPointBeforeSeek(ceiling);
                enforcingUntilRef.current = Date.now() + 900;
                notifySeekBlocked(backSec, ceiling);
                postVimeoCommand('setCurrentTime', backSec);
                segmentStartRef.current = backSec;
                lastValidTimeRef.current = backSec;
                currentTimeRef.current = backSec;
                return;
              }
            }

            if (data.event === 'seeked') {
              segmentStartRef.current = sec;
              lastValidTimeRef.current = sec;
            } else if (!advanceFrontierIfValid(sec, 2.8)) {
              segmentStartRef.current = sec;
              lastValidTimeRef.current = sec;
            }
            currentTimeRef.current = sec;
          } else if (data.event === 'pause' || data.event === 'ended') {
            isPlayingRef.current = false;
            const sec = Number(data.data?.seconds ?? currentTimeRef.current);
            currentTimeRef.current = sec;
            void sendHeartbeatSegment(
              sec,
              segmentStartRef.current,
              sec,
              playbackRateRef.current,
              true,
            );
            if (data.event === 'ended') {
              onVideoEnded?.();
            }
          }
        } catch {
          // ignore unrelated postMessage events
        }
      };

      window.addEventListener('message', onMessage);
      const hb = window.setInterval(() => {
        if (isPlayingRef.current) {
          flushCurrentPlayerHeartbeat(false);
        }
      }, 5000);

      return () => {
        window.removeEventListener('message', onMessage);
        window.clearInterval(hb);
        flushCurrentPlayerHeartbeat(true);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source?.provider, source?.videoId, lessonId, readOnlyVersion]);

    // =========================================================================
    // GOOGLE DRIVE STUDY TIMER
    // =========================================================================
    React.useEffect(() => {
      if (source?.provider !== 'GOOGLE_DRIVE' || readOnlyVersion) return;
      const hb = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const fromSec = currentTimeRef.current;
        const toSec = fromSec + 5;
        currentTimeRef.current = toSec;
        void sendHeartbeatSegment(toSec, fromSec, toSec, 1, false);
      }, 5000);

      return () => window.clearInterval(hb);
    }, [source?.provider, lessonId, sendHeartbeatSegment, readOnlyVersion]);

    // =========================================================================
    // DIRECT VIDEO PERIODIC HEARTBEAT (5s)
    // =========================================================================
    React.useEffect(() => {
      if (source?.provider !== 'DIRECT' || readOnlyVersion) return;
      const interval = window.setInterval(() => {
        const v = videoRef.current;
        if (v && !v.paused && !v.ended) {
          flushCurrentPlayerHeartbeat(false);
        }
      }, 5000);

      return () => {
        window.clearInterval(interval);
        flushCurrentPlayerHeartbeat(true);
      };
    }, [source?.provider, flushCurrentPlayerHeartbeat, readOnlyVersion]);

    // Imperative handle cho Ghi chú mốc thời gian
    React.useImperativeHandle(ref, () => ({
      getCurrentTime: () => {
        if (source?.provider === 'DIRECT') {
          return Math.floor(videoRef.current?.currentTime ?? 0);
        }
        if (source?.provider === 'YOUTUBE') {
          return Math.floor(ytPlayerRef.current?.getCurrentTime?.() ?? currentTimeRef.current);
        }
        return Math.floor(currentTimeRef.current);
      },
      pause: () => {
        if (source?.provider === 'DIRECT') {
          videoRef.current?.pause();
        } else if (source?.provider === 'YOUTUBE') {
          ytPlayerRef.current?.pauseVideo?.();
        } else if (source?.provider === 'VIMEO') {
          postVimeoCommand('pause');
        }
      },
      seekTo: (seconds: number) => {
        let target = Math.max(0, seconds);
        if (seekLockActiveRef.current) {
          const ceiling = getSeekCeiling();
          if (target > ceiling) {
            const backSec = getReturnPointBeforeSeek(ceiling);
            notifySeekBlocked(backSec, ceiling);
            target = backSec;
          }
        }
        segmentStartRef.current = target;
        lastValidTimeRef.current = target;
        currentTimeRef.current = target;

        if (source?.provider === 'DIRECT') {
          const v = videoRef.current;
          if (!v) return;
          v.currentTime = target;
          void v.play().catch(() => {});
        } else if (source?.provider === 'YOUTUBE') {
          ytPlayerRef.current?.seekTo?.(target, true);
          ytPlayerRef.current?.playVideo?.();
        } else if (source?.provider === 'VIMEO') {
          postVimeoCommand('setCurrentTime', target);
          postVimeoCommand('play');
        } else {
          notify.info(
            'Google Drive không hỗ trợ nhảy giây tự động — vui lòng kéo thanh phát thủ công.',
          );
        }
      },
    }));

    // Phím tắt phòng học (Space, ←/→ tôn trọng khóa tua, M, F, N)
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

        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          if (source?.provider === 'DIRECT') videoRef.current?.pause();
          else if (source?.provider === 'YOUTUBE') ytPlayerRef.current?.pauseVideo?.();
          else if (source?.provider === 'VIMEO') postVimeoCommand('pause');

          const cur =
            source?.provider === 'DIRECT'
              ? Math.floor(videoRef.current?.currentTime ?? 0)
              : source?.provider === 'YOUTUBE'
                ? Math.floor(ytPlayerRef.current?.getCurrentTime?.() ?? currentTimeRef.current)
                : Math.floor(currentTimeRef.current);
          onQuickNoteShortcut(cur);
          return;
        }

        if (source?.provider === 'YOUTUBE' && ytPlayerRef.current) {
          const p = ytPlayerRef.current;
          if (e.code === 'Space') {
            e.preventDefault();
            if (p.getPlayerState() === 1) p.pauseVideo();
            else p.playVideo();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = Math.max(0, p.getCurrentTime() - 5);
            p.seekTo(next, true);
            segmentStartRef.current = next;
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const before = p.getCurrentTime();
            let next = Math.min(p.getDuration() || before + 5, before + 5);
            if (seekLockActiveRef.current) {
              const ceiling = getSeekCeiling(p.getDuration());
              if (next > ceiling) {
                const backSec = getReturnPointBeforeSeek(ceiling);
                notifySeekBlocked(backSec, ceiling);
                next = backSec;
              }
            }
            p.seekTo(next, true);
            segmentStartRef.current = next;
          } else if (e.key === 'm' || e.key === 'M') {
            if (p.isMuted()) p.unMute();
            else p.mute();
          }
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
          const before = v.currentTime;
          let next = Math.min(v.duration || before + 5, before + 5);
          if (seekLockActiveRef.current) {
            const ceiling = getSeekCeiling(v.duration);
            if (next > ceiling) {
              const backSec = getReturnPointBeforeSeek(ceiling);
              notifySeekBlocked(backSec, ceiling);
              next = backSec;
            }
          }
          v.currentTime = next;
          segmentStartRef.current = next;
        } else if (e.key === 'm' || e.key === 'M') {
          v.muted = !v.muted;
        } else if (e.key === 'f' || e.key === 'F') {
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          } else {
            void v.requestFullscreen().catch(() => {});
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [
      source?.provider,
      onQuickNoteShortcut,
      postVimeoCommand,
      getSeekCeiling,
      getReturnPointBeforeSeek,
      notifySeekBlocked,
    ]);

    function handleSpeedChange(rate: number) {
      setPlaybackRate(rate);
      playbackRateRef.current = rate;
      if (source?.provider === 'DIRECT' && videoRef.current) {
        videoRef.current.playbackRate = rate;
      } else if (source?.provider === 'YOUTUBE' && ytPlayerRef.current) {
        ytPlayerRef.current.setPlaybackRate(rate);
      } else if (source?.provider === 'VIMEO') {
        postVimeoCommand('setPlaybackRate', rate);
      }
    }

    const watermarkLabel = user ? `${user.email} • #${user.id.slice(0, 8)}` : 'Try4T Protected';
    const vimeoSrc =
      source?.provider === 'VIMEO' && source.embedUrl
        ? `${source.embedUrl}${source.embedUrl.includes('?') ? '&' : '?'}api=1&player_id=try4t-vimeo`
        : null;

    return (
      <div className="space-y-3">
        {/* Dark Cinema Container */}
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-xl">
          {source ? (
            <>
              {source.provider === 'YOUTUBE' && <div ref={ytHostRef} className="h-full w-full" />}

              {source.provider === 'VIMEO' && vimeoSrc && (
                <iframe
                  ref={vimeoIframeRef}
                  key={vimeoSrc}
                  src={vimeoSrc}
                  title="Try4T Vimeo Player"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              )}

              {source.provider === 'GOOGLE_DRIVE' && source.embedUrl && (
                <iframe
                  key={source.embedUrl}
                  src={source.embedUrl}
                  title="Try4T Google Drive Video"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              )}

              {source.provider === 'DIRECT' && (
                <video
                  ref={videoRef}
                  key={source.originalUrl}
                  src={source.originalUrl}
                  controls
                  controlsList="nodownload"
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (v.duration && Number.isFinite(v.duration)) {
                      durationRef.current = v.duration;
                    }
                    v.playbackRate = playbackRateRef.current;
                    if (
                      !readOnlyVersion &&
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
                    isPlayingRef.current = true;
                    const cur = e.currentTarget.currentTime;
                    if (!seekLockActiveRef.current || cur <= getSeekCeiling(e.currentTarget.duration) + 0.8) {
                      segmentStartRef.current = cur;
                      lastValidTimeRef.current = cur;
                    }
                  }}
                  onSeeking={(e) => {
                    if (!seekLockActiveRef.current || isEnforcingSeekRef.current) return;
                    const v = e.currentTarget;
                    const ceiling = getSeekCeiling(v.duration);
                    if (v.currentTime > ceiling + 0.8) {
                      isEnforcingSeekRef.current = true;
                      const backSec = getReturnPointBeforeSeek(ceiling);
                      notifySeekBlocked(backSec, ceiling);
                      v.currentTime = backSec;
                      segmentStartRef.current = backSec;
                      lastValidTimeRef.current = backSec;
                      currentTimeRef.current = backSec;
                      window.setTimeout(() => {
                        isEnforcingSeekRef.current = false;
                      }, 150);
                    }
                  }}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    const nowSec = v.currentTime;

                    if (seekLockActiveRef.current && !isEnforcingSeekRef.current) {
                      const ceiling = getSeekCeiling(v.duration);
                      if (nowSec > ceiling + 0.8) {
                        isEnforcingSeekRef.current = true;
                        const backSec = getReturnPointBeforeSeek(ceiling);
                        notifySeekBlocked(backSec, ceiling);
                        v.currentTime = backSec;
                        segmentStartRef.current = backSec;
                        lastValidTimeRef.current = backSec;
                        currentTimeRef.current = backSec;
                        window.setTimeout(() => {
                          isEnforcingSeekRef.current = false;
                        }, 150);
                        return;
                      }
                    }

                    currentTimeRef.current = nowSec;
                    if (!advanceFrontierIfValid(nowSec, 2.5)) {
                      segmentStartRef.current = nowSec;
                      lastValidTimeRef.current = nowSec;
                    }
                  }}
                  onSeeked={(e) => {
                    if (isEnforcingSeekRef.current) return;
                    segmentStartRef.current = e.currentTarget.currentTime;
                    lastValidTimeRef.current = e.currentTarget.currentTime;
                  }}
                  onPause={() => {
                    isPlayingRef.current = false;
                    flushCurrentPlayerHeartbeat(true);
                  }}
                  onEnded={() => {
                    isPlayingRef.current = false;
                    flushCurrentPlayerHeartbeat(true);
                    onVideoEnded?.();
                  }}
                  className="h-full w-full"
                />
              )}

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

              {/* Real-time Anti-Seek Feedback Pill */}
              {seekBlockedNotice && (
                <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-amber-600/95 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
                  <Lock className="h-3.5 w-3.5" />
                  {seekBlockedNotice}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-zinc-400">
              Video bài giảng đang được xử lý hoặc chưa có tệp phát.
            </div>
          )}
        </div>

        {/* Player Utility Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            {readOnlyVersion ? (
              <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
                Đang xem phiên bản lưu trữ cũ (Tua tự do)
              </Badge>
            ) : isCompleted ? (
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

            {seekLockActive && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                title="Hệ thống chặn tua nhanh ngay khi bạn thao tác kéo thanh phát vượt phần chưa xem"
              >
                <Lock className="h-3 w-3" />
                Khóa tua nhanh ({maxSeekAheadPercent > 0 ? `+${maxSeekAheadPercent}%` : 'Chặn cứng'} • Mốc{' '}
                {formatDuration(maxFrontierDisplay)})
              </Badge>
            )}

            {source && source.provider !== 'DIRECT' && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                {source.provider === 'YOUTUBE' && <Youtube className="h-3 w-3 text-rose-500" />}
                Nguồn: {source.providerLabel}
              </Badge>
            )}

            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground xl:inline-flex">
              <Keyboard className="h-3.5 w-3.5" />
              Space • ←/→ • M • N (Ghi chú)
            </span>
          </div>

          {source?.provider !== 'GOOGLE_DRIVE' && (
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
          )}
        </div>
      </div>
    );
  },
);
