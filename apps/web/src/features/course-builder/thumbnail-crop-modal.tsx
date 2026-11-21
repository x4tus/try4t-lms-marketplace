'use client';

import * as React from 'react';
import { ImageCropModal } from '@/components/ui/image-crop-modal';

interface ThumbnailCropModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
}

export function ThumbnailCropModal({
  open,
  onClose,
  currentUrl,
  onUploaded,
}: ThumbnailCropModalProps) {
  return (
    <ImageCropModal
      open={open}
      onClose={onClose}
      currentUrl={currentUrl}
      onUploaded={onUploaded}
      aspect={16 / 9}
      cropShape="rect"
      outputWidth={1280}
      outputHeight={720}
      fileName="course-thumbnail-16x9.webp"
      title="Ảnh bìa khóa học (Chuẩn 16:9)"
      description="Cắt lại ảnh hiện tại, tải ảnh mới lên Cloud Storage (1280×720) hoặc dán URL trực tiếp."
      allowUrlMode
    />
  );
}
