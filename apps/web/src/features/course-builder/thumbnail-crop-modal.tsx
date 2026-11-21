'use client';

import * as React from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { ImagePlus, Link2, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { uploadMediaDirect } from './media-upload';

interface ThumbnailCropModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
}

async function renderCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const targetWidth = 1280;
  const targetHeight = 720;
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Không thể xuất ảnh sau khi cắt'));
        else resolve(blob);
      },
      'image/webp',
      0.9,
    );
  });
}

export function ThumbnailCropModal({
  open,
  onClose,
  currentUrl,
  onUploaded,
}: ThumbnailCropModalProps) {
  const [mode, setMode] = React.useState<'upload' | 'url'>('upload');
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [manualUrl, setManualUrl] = React.useState(currentUrl ?? '');

  React.useEffect(() => {
    if (open) {
      setManualUrl(currentUrl ?? '');
      setImageSrc(null);
      setZoom(1);
      setProgress(0);
    }
  }, [open, currentUrl]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify.error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify.error('Ảnh gốc vượt quá 5MB', { description: 'Vui lòng chọn ảnh dung lượng nhẹ hơn.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function handleConfirmCrop() {
    if (!imageSrc || !croppedAreaPixels) return;
    setUploading(true);
    setProgress(5);
    try {
      const blob = await renderCroppedBlob(imageSrc, croppedAreaPixels);
      const croppedFile = new File([blob], 'course-thumbnail-16x9.webp', {
        type: 'image/webp',
      });
      const result = await uploadMediaDirect({
        file: croppedFile,
        kind: 'IMAGE',
        onProgress: setProgress,
      });
      onUploaded(result.publicUrl);
      notify.success(`Đã tải ảnh bìa 16:9 lên ${result.provider.toUpperCase()}!`);
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiClientError || err instanceof Error
          ? err.message
          : 'Không thể tải ảnh lên Cloud';
      notify.error('Tải ảnh thất bại', { description: msg });
    } finally {
      setUploading(false);
    }
  }

  function handleApplyUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = manualUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      notify.error('URL ảnh bìa phải bắt đầu bằng https://');
      return;
    }
    onUploaded(trimmed);
    notify.success('Đã cập nhật ảnh bìa khóa học');
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ảnh bìa khóa học (Chuẩn 16:9)"
      description="Tải ảnh lên Cloud Storage với khung cắt 1280×720 sắc nét hoặc dán URL trực tiếp."
      maxWidthClass="max-w-xl"
    >
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-secondary p-1">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
            mode === 'upload' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
          )}
        >
          <Upload className="h-3.5 w-3.5" /> Tải lên &amp; Crop 16:9
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
            mode === 'url' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
          )}
        >
          <Link2 className="h-3.5 w-3.5" /> Dán URL ảnh
        </button>
      </div>

      {mode === 'upload' ? (
        <div className="space-y-4">
          {!imageSrc ? (
            <label className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/40 p-6 text-center transition-colors hover:border-primary/60 hover:bg-secondary/70">
              <ImagePlus className="h-9 w-9 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Chọn ảnh bìa từ máy tính</p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPG, PNG, WEBP tối đa 5MB • Tự động cắt chuẩn 16:9 (1280×720)
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Phóng to</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImageSrc(null)}
                  disabled={uploading}
                >
                  Đổi ảnh khác
                </Button>
              </div>

              {uploading && (
                <div className="space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-right font-mono text-xs text-muted-foreground">
                    Đang tải lên Cloud... {progress}%
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>
                  Hủy
                </Button>
                <Button type="button" onClick={handleConfirmCrop} disabled={uploading}>
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Cắt &amp; Tải lên Cloud
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleApplyUrl} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="thumb-url">Đường dẫn ảnh bìa (HTTPS)</Label>
            <Input
              id="thumb-url"
              type="url"
              placeholder="https://images.unsplash.com/photo-..."
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
            />
          </div>
          {manualUrl.startsWith('http') && (
            <div className="aspect-video overflow-hidden rounded-xl border border-border bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={manualUrl} alt="Preview" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit">Áp dụng ảnh này</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
