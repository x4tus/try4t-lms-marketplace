export type VideoProviderKind = 'YOUTUBE' | 'VIMEO' | 'GOOGLE_DRIVE' | 'DIRECT';

export interface ParsedVideoSource {
  provider: VideoProviderKind;
  providerLabel: string;
  videoId?: string;
  embedUrl?: string;
  originalUrl: string;
}

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg && YT_ID_RE.test(seg) ? seg : null;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const vParam = url.searchParams.get('v');
      if (vParam && YT_ID_RE.test(vParam)) return vParam;

      const parts = url.pathname.split('/').filter(Boolean);
      const first = parts[0];
      const second = parts[1];
      if (
        (first === 'embed' || first === 'shorts' || first === 'live' || first === 'v') &&
        second &&
        YT_ID_RE.test(second)
      ) {
        return second;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractVimeoVideoInfo(rawUrl: string): { id: string; hash?: string } | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;

    const parts = url.pathname.split('/').filter(Boolean);
    const hashParam = url.searchParams.get('h') || undefined;

    if (host === 'player.vimeo.com' && parts[0] === 'video' && parts[1] && /^\d+$/.test(parts[1])) {
      return { id: parts[1], hash: hashParam };
    }

    if (parts[0] && /^\d+$/.test(parts[0])) {
      const pathHash = parts[1] && /^[a-f0-9]+$/i.test(parts[1]) ? parts[1] : undefined;
      return { id: parts[0], hash: hashParam || pathHash };
    }
  } catch {
    return null;
  }
  return null;
}

export function extractGoogleDriveFileId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'drive.google.com') return null;

    const match = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(url.pathname);
    if (match?.[1]) return match[1];

    const idParam = url.searchParams.get('id');
    if (idParam && /^[A-Za-z0-9_-]{10,}$/.test(idParam)) return idParam;
  } catch {
    return null;
  }
  return null;
}

export function parseVideoSource(rawUrl: string | null | undefined): ParsedVideoSource | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();

  const ytId = extractYouTubeVideoId(trimmed);
  if (ytId) {
    return {
      provider: 'YOUTUBE',
      providerLabel: 'YouTube',
      videoId: ytId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`,
      originalUrl: trimmed,
    };
  }

  const vimeo = extractVimeoVideoInfo(trimmed);
  if (vimeo) {
    const query = vimeo.hash ? `?h=${encodeURIComponent(vimeo.hash)}` : '';
    return {
      provider: 'VIMEO',
      providerLabel: 'Vimeo',
      videoId: vimeo.id,
      embedUrl: `https://player.vimeo.com/video/${vimeo.id}${query}`,
      originalUrl: trimmed,
    };
  }

  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    return {
      provider: 'GOOGLE_DRIVE',
      providerLabel: 'Google Drive',
      videoId: driveId,
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      originalUrl: trimmed,
    };
  }

  return {
    provider: 'DIRECT',
    providerLabel: trimmed.includes('res.cloudinary.com')
      ? 'Cloudinary Video'
      : trimmed.startsWith('r2:')
        ? 'Cloudflare R2'
        : 'Video MP4/HLS',
    originalUrl: trimmed,
  };
}
