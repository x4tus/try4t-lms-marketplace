'use client';

import * as React from 'react';
import { parseVideoSource } from '@try4t/shared';
import { cn } from '@/lib/cn';

interface UniversalVideoPreviewProps {
  url: string;
  className?: string;
  autoPlay?: boolean;
  playbackRate?: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onDirectDurationDetected?: (durationSec: number) => void;
}

/**
 * Trình phát đa nguồn cho Xem trước (Course Builder, Free Preview, Admin Moderation):
 * Tự nhận diện YouTube, Vimeo, Google Drive hoặc Video MP4/Cloudinary/R2 trực tiếp.
 */
export function UniversalVideoPreview({
  url,
  className,
  autoPlay = false,
  playbackRate = 1,
  videoRef,
  onDirectDurationDetected,
}: UniversalVideoPreviewProps) {
  const internalRef = React.useRef<HTMLVideoElement | null>(null);
  const resolvedRef = videoRef ?? internalRef;
  const source = parseVideoSource(url);

  React.useEffect(() => {
    if (source?.provider === 'DIRECT' && resolvedRef.current) {
      resolvedRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, source?.provider, resolvedRef]);

  if (!source) return null;

  if (
    (source.provider === 'YOUTUBE' ||
      source.provider === 'VIMEO' ||
      source.provider === 'GOOGLE_DRIVE') &&
    source.embedUrl
  ) {
    const sep = source.embedUrl.includes('?') ? '&' : '?';
    const iframeSrc =
      autoPlay && source.provider !== 'GOOGLE_DRIVE'
        ? `${source.embedUrl}${sep}autoplay=1`
        : source.embedUrl;

    return (
      <div className={cn('relative aspect-video w-full overflow-hidden bg-black', className)}>
        <iframe
          key={iframeSrc}
          src={iframeSrc}
          title={`Try4T ${source.providerLabel} Video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <video
      ref={resolvedRef}
      key={source.originalUrl}
      src={source.originalUrl}
      controls
      controlsList="nodownload"
      autoPlay={autoPlay}
      preload="metadata"
      playsInline
      onLoadedMetadata={(e) => {
        e.currentTarget.playbackRate = playbackRate;
        const dur = e.currentTarget.duration;
        if (Number.isFinite(dur) && dur > 0) {
          onDirectDurationDetected?.(Math.round(dur));
        }
      }}
      className={cn('aspect-video w-full bg-black', className)}
    />
  );
}
