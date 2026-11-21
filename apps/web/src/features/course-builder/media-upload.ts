import { api } from '@/lib/api-client';

interface PresignResponse {
  provider: 'r2' | 'cloudinary';
  mode: 'R2_PRESIGNED_PUT' | 'CLOUDINARY_SIGNED_FORM';
  uploadUrl: string;
  storageKey: string;
  publicUrl?: string;
  formFields?: Record<string, string>;
  expiresInSec: number;
}

export interface UploadMediaResult {
  provider: 'r2' | 'cloudinary';
  storageKey: string;
  publicUrl: string;
  durationSec?: number;
}

export function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const timeout = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(0);
    }, 8000);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

export function readVideoDurationFromUrl(videoUrl: string): Promise<number> {
  return new Promise((resolve) => {
    if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
      resolve(0);
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    const timeout = window.setTimeout(() => {
      video.src = '';
      resolve(0);
    }, 8000);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      video.src = '';
      resolve(duration);
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      video.src = '';
      resolve(0);
    };
    video.src = videoUrl;
  });
}

export async function uploadMediaDirect(params: {
  file: File;
  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  onProgress?: (percent: number) => void;
}): Promise<UploadMediaResult> {
  const { file, kind, onProgress } = params;

  const presign = await api.post<PresignResponse>('/media/presign', {
    kind,
    fileName: file.name,
    contentType: file.type || (kind === 'IMAGE' ? 'image/webp' : 'video/mp4'),
    fileSizeBytes: file.size,
  });

  if (presign.mode === 'R2_PRESIGNED_PUT') {
    await xhrUpload({
      method: 'PUT',
      url: presign.uploadUrl,
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      onProgress,
    });

    return {
      provider: 'r2',
      storageKey: presign.storageKey,
      publicUrl: presign.publicUrl ?? presign.storageKey,
    };
  }

  // Cloudinary direct signed FormData upload
  const formData = new FormData();
  if (presign.formFields) {
    for (const [k, v] of Object.entries(presign.formFields)) {
      formData.append(k, v);
    }
  }
  formData.append('file', file);

  const responseText = await xhrUpload({
    method: 'POST',
    url: presign.uploadUrl,
    body: formData,
    onProgress,
  });

  const parsed = JSON.parse(responseText) as { secure_url?: string; duration?: number };
  if (!parsed.secure_url) {
    throw new Error('Cloudinary không trả về URL tệp đã tải lên');
  }

  const durationSec =
    typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)
      ? Math.round(parsed.duration)
      : undefined;

  return {
    provider: 'cloudinary',
    storageKey: parsed.secure_url,
    publicUrl: parsed.secure_url,
    durationSec,
  };
}

function xhrUpload(params: {
  method: 'PUT' | 'POST';
  url: string;
  body: File | FormData;
  headers?: Record<string, string>;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(params.method, params.url, true);

    if (params.headers) {
      for (const [key, val] of Object.entries(params.headers)) {
        xhr.setRequestHeader(key, val);
      }
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && params.onProgress) {
        params.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        params.onProgress?.(100);
        resolve(xhr.responseText);
      } else {
        let detail = `Tải tệp lên Cloud thất bại (HTTP ${xhr.status})`;
        try {
          const parsedErr = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          if (parsedErr?.error?.message) {
            detail = `Cloudinary: ${parsedErr.error.message}`;
          }
        } catch {
          // ignore non-json error bodies
        }
        reject(new Error(detail));
      }
    };

    xhr.onerror = () => reject(new Error('Lỗi kết nối mạng khi tải tệp lên Cloud Storage'));
    xhr.send(params.body);
  });
}
