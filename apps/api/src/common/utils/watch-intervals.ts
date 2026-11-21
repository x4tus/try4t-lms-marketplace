export type WatchRange = [number, number];

/**
 * Chuẩn hóa, sắp xếp và hợp nhất các đoạn thời gian video đã xem (theo giây).
 * Cho phép khoảng hở nhỏ <= 1.5s giữa các nhịp heartbeat để tránh thất thoát do jitter của trình duyệt.
 */
export function parseWatchRanges(raw: unknown): WatchRange[] {
  if (!Array.isArray(raw)) return [];
  const valid: WatchRange[] = [];
  for (const item of raw) {
    if (
      Array.isArray(item) &&
      item.length >= 2 &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number' &&
      Number.isFinite(item[0]) &&
      Number.isFinite(item[1]) &&
      item[1] > item[0]
    ) {
      valid.push([Math.max(0, item[0]), Math.max(0, item[1])]);
    }
  }
  return valid;
}

export function mergeWatchIntervals(
  ranges: WatchRange[],
  maxDurationSec?: number,
  gapToleranceSec = 1.5,
): WatchRange[] {
  const cap = maxDurationSec && maxDurationSec > 0 ? maxDurationSec : Number.POSITIVE_INFINITY;

  const normalized = ranges
    .map(([start, end]): WatchRange => [
      Math.max(0, Math.min(start, cap)),
      Math.max(0, Math.min(end, cap)),
    ])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  if (normalized.length === 0) return [];

  const merged: WatchRange[] = [normalized[0]!];
  for (let i = 1; i < normalized.length; i++) {
    const current = normalized[i]!;
    const last = merged[merged.length - 1]!;
    if (current[0] <= last[1] + gapToleranceSec) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push([current[0], current[1]]);
    }
  }

  return merged.map(([s, e]) => [Number(s.toFixed(1)), Number(e.toFixed(1))]);
}

export function calcUniqueWatchedSeconds(ranges: WatchRange[]): number {
  const total = ranges.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
  return Math.round(total);
}

/**
 * Kiểm tra anti-cheat dựa trên thời gian thực (wall-clock) giữa hai nhịp heartbeat.
 * Chặn hành vi tua thẳng hoặc dùng DevTools sửa currentTime để gian lận tiến độ.
 */
export function validateHeartbeatSegment(params: {
  fromSec: number;
  toSec: number;
  playbackRate: number;
  lastHeartbeatAt: Date | null;
  now: Date;
}): { accepted: boolean; reason?: string; clampedFrom: number; clampedTo: number } {
  const clampedFrom = Math.max(0, params.fromSec);
  const clampedTo = Math.max(0, params.toSec);
  const deltaSec = clampedTo - clampedFrom;

  if (deltaSec <= 0.2) {
    return { accepted: false, reason: 'EMPTY_SEGMENT', clampedFrom, clampedTo };
  }

  // Không chấp nhận 1 đoạn heartbeat quá 45 giây (chuẩn client gửi mỗi ~10s)
  if (deltaSec > 45) {
    return { accepted: false, reason: 'SEGMENT_TOO_LARGE', clampedFrom, clampedTo };
  }

  // Giới hạn tốc độ tối đa phía server là 2.05x kể cả khi client gửi rate giả
  const effectiveRate = Math.min(2.05, Math.max(0.5, params.playbackRate || 1));

  if (!params.lastHeartbeatAt) {
    // Heartbeat đầu tiên: chỉ chấp nhận tối đa 25 giây xem thật
    if (deltaSec > 25) {
      return { accepted: false, reason: 'INITIAL_JUMP_REJECTED', clampedFrom, clampedTo };
    }
    return { accepted: true, clampedFrom, clampedTo };
  }

  const elapsedWallSec = Math.max(0, (params.now.getTime() - params.lastHeartbeatAt.getTime()) / 1000);
  // Công thức dung sai: thời gian thực * max(effectiveRate, 2.05) + 6s buffer mạng/timer
  const maxAllowedDelta = elapsedWallSec * Math.max(effectiveRate, 2.05) + 6;

  if (deltaSec > maxAllowedDelta) {
    return { accepted: false, reason: 'VELOCITY_EXCEEDED', clampedFrom, clampedTo };
  }

  return { accepted: true, clampedFrom, clampedTo };
}
