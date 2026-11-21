'use client';

import * as React from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Crop, ImagePlus, Link2, Loader2, RotateCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadMediaDirect } from '@/features/course-builder/media-upload';
import { ApiClientError, getAccessToken, getApiBaseUrl } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

export interface ImageCropModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  aspect?: number;
  cropShape?: 'rect' | 'round';
  outputWidth?: number;
  outputHeight?: number;
  fileName?: string;
  title?: string;
  description?: string;
  allowUrlMode?: boolean;
}

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

async function renderCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không thể tải ảnh vào khung cắt'));
    img.src = imageSrc;
  });

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation,
  );

  // Draw rotated full image on intermediate canvas first so pixelCrop maps 1:1
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = Math.max(1, Math.round(bBoxWidth));
  rotCanvas.height = Math.max(1, Math.round(bBoxHeight));
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D');

  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate(rotRad);
  rotCtx.translate(-image.width / 2, -image.height / 2);
  rotCtx.drawImage(image, 0, 0);

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = targetWidth;
  outputCanvas.height = targetHeight;
  const outCtx = outputCanvas.getContext('2d');
  if (!outCtx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D');

  outCtx.drawImage(
    rotCanvas,
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
    outputCanvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Không thể xuất ảnh sau khi cắt'));
        else resolve(blob);
      },
      'image/webp',
      0.9,
    );
  });
}

async function fetchImageAsObjectUrl(url: string): Promise<string> {
  const token = getAccessToken();
  const proxyUrl = `${getApiBaseUrl()}/media/image-proxy?url=${encodeURIComponent(url)}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(proxyUrl, {
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    throw new Error('Không thể tải ảnh cũ qua máy chủ để cắt lại');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function ImageCropModal({
  open,
  onClose,
  currentUrl,
  onUploaded,
  aspect = 16 / 9,
  cropShape = 'rect',
  outputWidth = 1280,
  outputHeight = 720,
  fileName = 'cropped-image.webp',
  title = 'Cắt & Cập nhật hình ảnh',
  description = 'Cắt lại ảnh hiện tại, tải ảnh mới từ máy hoặc dán URL trực tiếp.',
  allowUrlMode = true,
}: ImageCropModalProps) {
  const hasCurrentUrl = Boolean(currentUrl && /^https?:\/\//i.test(currentUrl));
  const [mode, setMode] = React.useState<'existing' | 'upload' | 'url'>(
    hasCurrentUrl ? 'existing' : 'upload',
  );
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = React.useState(false);
  const [existingError, setExistingError] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [manualUrl, setManualUrl] = React.useState(currentUrl ?? '');
  const objectUrlRef = React.useRef<string | null>(null);

  const revokeObjectUrl = React.useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const loadRemoteUrlIntoCropper = React.useCallback(
    async (targetUrl: string) => {
      setLoadingExisting(true);
      setExistingError(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      revokeObjectUrl();

      try {
        const objUrl = await fetchImageAsObjectUrl(targetUrl);
        objectUrlRef.current = objUrl;
        setImageSrc(objUrl);
      } catch (err) {
        setExistingError(
          err instanceof Error
            ? err.message
            : 'Không thể tải ảnh cũ vào khung cắt. Bạn có thể chọn ảnh mới từ máy.',
        );
        setImageSrc(null);
      } finally {
        setLoadingExisting(false);
      }
    },
    [revokeObjectUrl],
  );

  React.useEffect(() => {
    if (!open) {
      revokeObjectUrl();
      return;
    }

    setManualUrl(currentUrl ?? '');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setProgress(0);
    setExistingError(null);

    if (currentUrl && /^https?:\/\//i.test(currentUrl)) {
      setMode('existing');
      void loadRemoteUrlIntoCropper(currentUrl);
    } else {
      setMode('upload');
      setImageSrc(null);
    }

    return () => {
      revokeObjectUrl();
    };
  }, [open, currentUrl, loadRemoteUrlIntoCropper, revokeObjectUrl]);

  function handleSelectMode(next: 'existing' | 'upload' | 'url') {
    setMode(next);
    if (next === 'existing' && currentUrl) {
      void loadRemoteUrlIntoCropper(currentUrl);
    } else if (next === 'upload') {
      revokeObjectUrl();
      setImageSrc(null);
      setZoom(1);
      setRotation(0);
      setCrop({ x: 0, y: 0 });
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify.error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify.error('Ảnh gốc vượt quá 5MB', {
        description: 'Vui lòng chọn ảnh dung lượng nhẹ hơn.',
      });
      return;
    }
    revokeObjectUrl();
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(String(reader.result));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    };
    reader.readAsDataURL(file);
  }

  async function handleConfirmCrop() {
    if (!imageSrc || !croppedAreaPixels) return;
    setUploading(true);
    setProgress(5);
    try {
      const blob = await renderCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        rotation,
        outputWidth,
        outputHeight,
      );
      const croppedFile = new File([blob], fileName, { type: 'image/webp' });
      const result = await uploadMediaDirect({
        file: croppedFile,
        kind: 'IMAGE',
        onProgress: setProgress,
      });
      onUploaded(result.publicUrl);
      notify.success(`Đã cắt & lưu ảnh lên ${result.provider.toUpperCase()}!`);
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
      notify.error('URL ảnh phải bắt đầu bằng https://');
      return;
    }
    onUploaded(trimmed);
    notify.success('Đã cập nhật đường dẫn hình ảnh');
    onClose();
  }

  const tabsCount = (hasCurrentUrl ? 1 : 0) + 1 + (allowUrlMode ? 1 : 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      maxWidthClass="max-w-xl"
    >
      <div
        className={cn(
          'mb-4 grid rounded-xl bg-secondary p-1',
          tabsCount === 3 ? 'grid-cols-3' : tabsCount === 2 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {hasCurrentUrl && (
          <button
            type="button"
            onClick={() => handleSelectMode('existing')}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
              mode === 'existing' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
            )}
          >
            <Crop className="h-3.5 w-3.5" /> Cắt lại ảnh cũ
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSelectMode('upload')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
            mode === 'upload' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
          )}
        >
          <Upload className="h-3.5 w-3.5" /> Tải ảnh mới
        </button>
        {allowUrlMode && (
          <button
            type="button"
            onClick={() => handleSelectMode('url')}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
              mode === 'url' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
            )}
          >
            <Link2 className="h-3.5 w-3.5" /> Dán URL ảnh
          </button>
        )}
      </div>

      {mode === 'url' ? (
        <form onSubmit={handleApplyUrl} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="icm-url">Đường dẫn hình ảnh (HTTPS)</Label>
            <Input
              id="icm-url"
              type="url"
              placeholder="https://images.unsplash.com/photo-..."
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
            />
          </div>
          {manualUrl.startsWith('http') && (
            <div className="space-y-2">
              <div
                className={cn(
                  'mx-auto overflow-hidden border border-border bg-secondary',
                  cropShape === 'round' ? 'h-40 w-40 rounded-full' : 'aspect-video rounded-xl',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={manualUrl} alt="Preview" className="h-full w-full object-cover" />
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMode('existing');
                    void loadRemoteUrlIntoCropper(manualUrl.trim());
                  }}
                >
                  <Crop className="h-3.5 w-3.5" /> Mở ảnh này trong trình cắt
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit">Áp dụng URL này</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {loadingExisting ? (
            <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-border bg-secondary/40">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">
                Đang tải ảnh hiện tại vào trình cắt...
              </p>
            </div>
          ) : !imageSrc ? (
            <div className="space-y-3">
              {existingError && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                  {existingError}
                </div>
              )}
              <label className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/40 p-6 text-center transition-colors hover:border-primary/60 hover:bg-secondary/70">
                <ImagePlus className="h-9 w-9 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Chọn ảnh từ máy tính</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG, PNG, WEBP tối đa 5MB • Xuất chuẩn {outputWidth}×{outputHeight}
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={aspect}
                  cropShape={cropShape}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-1 items-center gap-2.5">
                  <span className="shrink-0 text-xs text-muted-foreground">Thu phóng</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  disabled={uploading}
                  title="Xoay ảnh 90 độ"
                >
                  <RotateCw className="h-3.5 w-3.5" /> Xoay 90°
                </Button>
                {mode === 'upload' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setImageSrc(null)}
                    disabled={uploading}
                  >
                    Đổi ảnh khác
                  </Button>
                )}
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
                  Cắt &amp; Lưu lên Cloud
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
