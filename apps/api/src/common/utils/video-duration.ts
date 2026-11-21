/**
 * Tự động đọc thời lượng thực tế (giây) từ tệp video MP4/MOV/M4V từ xa
 * bằng cách đọc nguyên tử MP4 ISO-BMFF (moov -> mvhd) qua HTTP Range Request.
 * Không phụ thuộc ffmpeg/ffprobe — chạy cực nhẹ (< 512KB RAM) trên Render Free & Windows.
 */

function parseMvhdDurationFromBuffer(buf: Buffer): number {
  let offset = 0;
  const len = buf.length;

  const findMvhd = (start: number, end: number): number => {
    let pos = start;
    while (pos + 8 <= end) {
      let boxSize = buf.readUInt32BE(pos);
      const boxType = buf.toString('ascii', pos + 4, pos + 8);
      let headerSize = 8;

      if (boxSize === 1 && pos + 16 <= end) {
        // 64-bit extended box size
        const hi = buf.readUInt32BE(pos + 8);
        const lo = buf.readUInt32BE(pos + 12);
        boxSize = hi * 0x100000000 + lo;
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = end - pos;
      }

      if (boxSize < headerSize || pos + boxSize > end) {
        // Nếu box `moov` lớn hơn buffer hiện tại, vẫn tiếp tục quét bên trong nó!
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

  // Thử parse chuẩn theo cấu trúc box từ đầu buffer
  const structured = findMvhd(offset, len);
  if (structured > 0) return structured;

  // Fallback quét trực tiếp chữ ký byte "mvhd" (hữu ích khi tải phần đuôi của file non-faststart MP4)
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

export async function probeRemoteVideoDurationSec(url: string): Promise<number> {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return 0;
  }

  // 1. Đọc 512KB đầu (fast-start MP4 — phổ biến trên Cloudinary, R2, S3, GCS)
  const headBuf = await fetchRangeBuffer(url, 'bytes=0-524287');
  if (headBuf && headBuf.length > 32) {
    const sec = parseMvhdDurationFromBuffer(headBuf);
    if (sec > 0) return sec;
  }

  // 2. Nếu moov atom nằm ở cuối file (non-faststart MP4), đọc 512KB cuối
  const tailBuf = await fetchRangeBuffer(url, 'bytes=-524288');
  if (tailBuf && tailBuf.length > 32) {
    const sec = parseMvhdDurationFromBuffer(tailBuf);
    if (sec > 0) return sec;
  }

  return 0;
}
