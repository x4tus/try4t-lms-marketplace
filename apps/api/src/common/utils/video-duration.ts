import { parseVideoSource } from '@try4t/shared';

/**
 * Tự động đọc thời lượng thực tế (giây) từ:
 * 1. Link YouTube (watch, youtu.be, shorts, embed) — không cần API Key
 * 2. Link Vimeo — dùng official Vimeo oEmbed API
 * 3. Tệp video MP4/MOV/M4V trực tiếp (Cloudinary, R2, S3, CDN) — đọc atom MP4 (moov -> mvhd) qua HTTP Range Request
 * Không phụ thuộc ffmpeg/ffprobe — chạy cực nhẹ trên Render Free & Windows.
 */

function parseMvhdDurationFromBuffer(buf: Buffer): number {
  const len = buf.length;

  const findMvhd = (start: number, end: number): number => {
    let pos = start;
    while (pos + 8 <= end) {
      let boxSize = buf.readUInt32BE(pos);
      const boxType = buf.toString('ascii', pos + 4, pos + 8);
      let headerSize = 8;

      if (boxSize === 1 && pos + 16 <= end) {
        const hi = buf.readUInt32BE(pos + 8);
        const lo = buf.readUInt32BE(pos + 12);
        boxSize = hi * 0x100000000 + lo;
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = end - pos;
      }

      if (boxSize < headerSize || pos + boxSize > end) {
        if (boxType === 'moov') {
          const inner = findMvhd(pos + headerSize, end);
          if (inner > 0) return inner;
        }
        break;
      }

      if (boxType === 'moov') {
        const inner = findMvhd(pos + headerSize, pos + boxSize);
        if (inner > 0) return inner;
      } else if (boxType === 'mvhd') {
        const dataStart = pos + headerSize;
        if (dataStart + 20 <= end) {
          const version = buf.readUInt8(dataStart);
          if (version === 0 && dataStart + 20 <= end) {
            const timescale = buf.readUInt32BE(dataStart + 12);
            const duration = buf.readUInt32BE(dataStart + 16);
            if (timescale > 0 && duration > 0) {
              return Math.round(duration / timescale);
            }
          } else if (version === 1 && dataStart + 32 <= end) {
            const timescale = buf.readUInt32BE(dataStart + 20);
            const durHi = buf.readUInt32BE(dataStart + 24);
            const durLo = buf.readUInt32BE(dataStart + 28);
            const duration = durHi * 0x100000000 + durLo;
            if (timescale > 0 && duration > 0) {
              return Math.round(duration / timescale);
            }
          }
        }
      }

      pos += boxSize;
    }
    return 0;
  };

  const structured = findMvhd(0, len);
  if (structured > 0) return structured;

  const mvhdMarker = Buffer.from('mvhd', 'ascii');
  let searchIdx = 0;
  while (searchIdx < len - 32) {
    const found = buf.indexOf(mvhdMarker, searchIdx);
    if (found === -1 || found < 4) break;
    const dataStart = found + 4;
    const version = buf.readUInt8(dataStart);
    if (version === 0 && dataStart + 20 <= len) {
      const timescale = buf.readUInt32BE(dataStart + 12);
      const duration = buf.readUInt32BE(dataStart + 16);
      if (timescale >= 100 && timescale <= 1_000_000 && duration > 0) {
        const sec = Math.round(duration / timescale);
        if (sec > 0 && sec <= 86_400) return sec;
      }
    } else if (version === 1 && dataStart + 32 <= len) {
      const timescale = buf.readUInt32BE(dataStart + 20);
      const durHi = buf.readUInt32BE(dataStart + 24);
      const durLo = buf.readUInt32BE(dataStart + 28);
      const duration = durHi * 0x100000000 + durLo;
      if (timescale >= 100 && timescale <= 1_000_000 && duration > 0) {
        const sec = Math.round(duration / timescale);
        if (sec > 0 && sec <= 86_400) return sec;
      }
    }
    searchIdx = found + 4;
  }

  return 0;
}

async function fetchRangeBuffer(url: string, rangeHeader: string, timeoutMs = 8000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: rangeHeader },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok && res.status !== 206) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function probeYouTubeDurationSec(videoId: string): Promise<number> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;
    const html = await res.text();

    // 1. Chính xác nhất: "lengthSeconds":"312" trong ytInitialPlayerResponse
    const lenMatch = /"lengthSeconds"\s*:\s*"(\d+)"/.exec(html);
    if (lenMatch?.[1]) {
      const sec = Number(lenMatch[1]);
      if (Number.isFinite(sec) && sec > 0 && sec <= 86_400) return sec;
    }

    // 2. Fallback: "approxDurationMs":"312400"
    const msMatch = /"approxDurationMs"\s*:\s*"(\d+)"/.exec(html);
    if (msMatch?.[1]) {
      const sec = Math.round(Number(msMatch[1]) / 1000);
      if (Number.isFinite(sec) && sec > 0 && sec <= 86_400) return sec;
    }

    // 3. Fallback: ISO 8601 meta duration PT12M34S
    const isoMatch = /itemprop="duration"\s+content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/i.exec(html);
    if (isoMatch) {
      const sec =
        Number(isoMatch[1] ?? 0) * 3600 +
        Number(isoMatch[2] ?? 0) * 60 +
        Number(isoMatch[3] ?? 0);
      if (sec > 0 && sec <= 86_400) return sec;
    }
  } catch {
    return 0;
  }
  return 0;
}

async function probeVimeoDurationSec(originalUrl: string): Promise<number> {
  try {
    const res = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(originalUrl)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return 0;
    const json = (await res.json()) as { duration?: number };
    return typeof json.duration === 'number' && Number.isFinite(json.duration)
      ? Math.round(json.duration)
      : 0;
  } catch {
    return 0;
  }
}

export async function probeRemoteVideoDurationSec(url: string): Promise<number> {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return 0;
  }

  const parsed = parseVideoSource(url);
  if (parsed?.provider === 'YOUTUBE' && parsed.videoId) {
    return probeYouTubeDurationSec(parsed.videoId);
  }
  if (parsed?.provider === 'VIMEO') {
    return probeVimeoDurationSec(parsed.originalUrl);
  }
  if (parsed?.provider === 'GOOGLE_DRIVE') {
    return 0;
  }

  // Direct MP4/MOV/M4V: đọc 512KB đầu (fast-start) hoặc 512KB cuối (non-faststart)
  const headBuf = await fetchRangeBuffer(url, 'bytes=0-524287');
  if (headBuf && headBuf.length > 32) {
    const sec = parseMvhdDurationFromBuffer(headBuf);
    if (sec > 0) return sec;
  }

  const tailBuf = await fetchRangeBuffer(url, 'bytes=-524288');
  if (tailBuf && tailBuf.length > 32) {
    const sec = parseMvhdDurationFromBuffer(tailBuf);
    if (sec > 0) return sec;
  }

  return 0;
}
