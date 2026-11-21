import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';
import type { PresignMediaInput } from '@try4t/shared';
import { probeRemoteVideoDurationSec } from '../../common/utils/video-duration';

export interface PresignedUploadResult {
  provider: 'r2' | 'cloudinary';
  mode: 'R2_PRESIGNED_PUT' | 'CLOUDINARY_SIGNED_FORM';
  uploadUrl: string;
  storageKey: string;
  publicUrl?: string;
  formFields?: Record<string, string>;
  expiresInSec: number;
}

const LIMITS: Record<PresignMediaInput['kind'], { maxBytes: number; mimes: string[] }> = {
  IMAGE: {
    maxBytes: 5 * 1024 * 1024, // 5MB
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  VIDEO: {
    maxBytes: 500 * 1024 * 1024, // 500MB
    mimes: ['video/mp4', 'video/webm', 'video/quicktime', 'application/x-mpegURL'],
  },
  DOCUMENT: {
    maxBytes: 25 * 1024 * 1024, // 25MB
    mimes: [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'text/markdown',
      'text/plain',
    ],
  },
};

function sanitizeExtension(fileName: string): string {
  const parts = fileName.split('.');
  const raw = parts.length > 1 ? parts[parts.length - 1] : '';
  const clean = (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean ? `.${clean.slice(0, 8)}` : '';
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly imageProvider: 'cloudinary' | 'r2';
  private readonly videoProvider: 'r2' | 'cloudinary';

  private readonly cloudinaryCloudName: string;
  private readonly cloudinaryApiKey: string;
  private readonly cloudinaryApiSecret: string;

  private readonly r2AccountId: string;
  private readonly r2AccessKeyId: string;
  private readonly r2SecretAccessKey: string;
  private readonly r2BucketName: string;
  private readonly r2PublicUrl: string;
  private readonly r2Client: S3Client | null;

  constructor(configService: ConfigService) {
    this.imageProvider = configService.get<'cloudinary' | 'r2'>('STORAGE_IMAGE_PROVIDER') ?? 'cloudinary';
    this.videoProvider = configService.get<'r2' | 'cloudinary'>('STORAGE_VIDEO_PROVIDER') ?? 'cloudinary';

    this.cloudinaryCloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
    this.cloudinaryApiKey = configService.get<string>('CLOUDINARY_API_KEY') ?? '';
    this.cloudinaryApiSecret = configService.get<string>('CLOUDINARY_API_SECRET') ?? '';

    this.r2AccountId = configService.get<string>('R2_ACCOUNT_ID') ?? '';
    this.r2AccessKeyId = configService.get<string>('R2_ACCESS_KEY_ID') ?? '';
    this.r2SecretAccessKey = configService.get<string>('R2_SECRET_ACCESS_KEY') ?? '';
    this.r2BucketName = configService.get<string>('R2_BUCKET_NAME') ?? 'try4t-media';
    this.r2PublicUrl = (configService.get<string>('R2_PUBLIC_URL') ?? '').replace(/\/$/, '');

    if (this.isR2Configured()) {
      this.r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${this.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.r2AccessKeyId,
          secretAccessKey: this.r2SecretAccessKey,
        },
      });
    } else {
      this.r2Client = null;
    }
  }

  isCloudinaryConfigured(): boolean {
    return Boolean(this.cloudinaryCloudName && this.cloudinaryApiKey && this.cloudinaryApiSecret);
  }

  isR2Configured(): boolean {
    return Boolean(this.r2AccountId && this.r2AccessKeyId && this.r2SecretAccessKey && this.r2BucketName);
  }

  getStatus() {
    return {
      cloudinaryConfigured: this.isCloudinaryConfigured(),
      r2Configured: this.isR2Configured(),
      imageProvider: this.imageProvider,
      videoProvider: this.videoProvider,
    };
  }

  async createPresignedUpload(userId: string, input: PresignMediaInput): Promise<PresignedUploadResult> {
    const rule = LIMITS[input.kind];
    if (input.fileSizeBytes > rule.maxBytes) {
      throw new BadRequestException(
        `Dung lượng tệp vượt quá giới hạn ${Math.round(rule.maxBytes / (1024 * 1024))}MB`,
      );
    }
    if (!rule.mimes.includes(input.contentType)) {
      throw new BadRequestException(
        `Định dạng ${input.contentType} không được hỗ trợ cho loại ${input.kind}`,
      );
    }

    const preferred = input.kind === 'IMAGE' ? this.imageProvider : this.videoProvider;
    const provider = this.resolveAvailableProvider(preferred);

    if (!provider) {
      throw new BadRequestException(
        'Chưa cấu hình khóa Cloud Storage (Cloudinary hoặc Cloudflare R2) trong apps/api/.env. Bạn vẫn có thể dán URL trực tiếp để thử nghiệm nhanh.',
      );
    }

    if (provider === 'r2') {
      return this.presignR2Put(userId, input);
    }
    return this.signCloudinaryUpload(userId, input);
  }

  async resolvePlaybackUrl(storageKey: string | null | undefined, expiresInSec = 7200): Promise<string | null> {
    if (!storageKey) return null;

    // External URL or Cloudinary HTTPS URL
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      return storageKey;
    }

    // R2 key prefixed with "r2:"
    if (storageKey.startsWith('r2:')) {
      const objectKey = storageKey.slice(3);
      if (!this.r2Client) {
        return this.r2PublicUrl ? `${this.r2PublicUrl}/${objectKey}` : null;
      }
      const command = new GetObjectCommand({
        Bucket: this.r2BucketName,
        Key: objectKey,
      });
      return getSignedUrl(this.r2Client, command, { expiresIn: expiresInSec });
    }

    return storageKey;
  }

  /**
   * Tự động đọc thời lượng thực tế (giây) từ tệp video trên Cloudinary / R2 / URL MP4.
   */
  async probeVideoDurationSec(storageKey: string | null | undefined): Promise<number> {
    if (!storageKey) return 0;

    // 1. Ưu tiên đọc metadata trực tiếp từ Cloudinary Admin API nếu là video Cloudinary
    if (storageKey.includes('res.cloudinary.com') && this.isCloudinaryConfigured()) {
      const cloudDuration = await this.fetchCloudinaryVideoDuration(storageKey);
      if (cloudDuration > 0) return cloudDuration;
    }

    // 2. Đọc trực tiếp MP4 mvhd atom qua HTTP Range Request (áp dụng mọi URL / R2 / Cloudinary)
    const playbackUrl = await this.resolvePlaybackUrl(storageKey, 900);
    if (!playbackUrl) return 0;
    return probeRemoteVideoDurationSec(playbackUrl);
  }

  private async fetchCloudinaryVideoDuration(url: string): Promise<number> {
    const match = /res\.cloudinary\.com\/[^/]+\/video\/upload\/(?:[^/]*,[^/]*\/)?(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?(?:\?.*)?$/i.exec(
      url,
    );
    const publicId = match?.[1];
    if (!publicId) return 0;

    try {
      const auth = Buffer.from(`${this.cloudinaryApiKey}:${this.cloudinaryApiSecret}`).toString(
        'base64',
      );
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudinaryCloudName}/resources/video/upload/${encodeURIComponent(publicId)}?image_metadata=true`,
        {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(6000),
        },
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

  async deleteAsset(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;

    try {
      if (storageKey.startsWith('r2:') && this.r2Client) {
        const objectKey = storageKey.slice(3);
        await this.r2Client.send(
          new DeleteObjectCommand({
            Bucket: this.r2BucketName,
            Key: objectKey,
          }),
        );
        return;
      }

      if (storageKey.includes('res.cloudinary.com') && this.isCloudinaryConfigured()) {
        await this.deleteCloudinaryByUrl(storageKey);
      }
    } catch (err) {
      this.logger.warn(
        `Khong the xoa tep cloud (${storageKey}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private resolveAvailableProvider(preferred: 'r2' | 'cloudinary'): 'r2' | 'cloudinary' | null {
    if (preferred === 'r2') {
      if (this.isR2Configured()) return 'r2';
      if (this.isCloudinaryConfigured()) return 'cloudinary';
      return null;
    }
    if (this.isCloudinaryConfigured()) return 'cloudinary';
    if (this.isR2Configured()) return 'r2';
    return null;
  }

  private async presignR2Put(userId: string, input: PresignMediaInput): Promise<PresignedUploadResult> {
    const folder = input.kind === 'IMAGE' ? 'thumbnails' : input.kind === 'VIDEO' ? 'videos' : 'docs';
    const ext = sanitizeExtension(input.fileName);
    const objectKey = `try4t/${folder}/${userId}/${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.r2BucketName,
      Key: objectKey,
      ContentType: input.contentType,
    });

    const uploadUrl = await getSignedUrl(this.r2Client!, command, { expiresIn: 900 });
    const isPublicImage = input.kind === 'IMAGE' && Boolean(this.r2PublicUrl);

    return {
      provider: 'r2',
      mode: 'R2_PRESIGNED_PUT',
      uploadUrl,
      storageKey: isPublicImage ? `${this.r2PublicUrl}/${objectKey}` : `r2:${objectKey}`,
      ...(isPublicImage ? { publicUrl: `${this.r2PublicUrl}/${objectKey}` } : {}),
      expiresInSec: 900,
    };
  }

  private signCloudinaryUpload(userId: string, input: PresignMediaInput): PresignedUploadResult {
    const resourceType =
      input.kind === 'IMAGE' ? 'image' : input.kind === 'VIDEO' ? 'video' : 'raw';
    const folder = `try4t/${input.kind.toLowerCase()}s/${userId}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const publicId = randomUUID();

    // Cloudinary SHA-1 signature requires alphabetical param sorting
    const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = createHash('sha1')
      .update(`${paramsToSign}${this.cloudinaryApiSecret}`)
      .digest('hex');

    return {
      provider: 'cloudinary',
      mode: 'CLOUDINARY_SIGNED_FORM',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudinaryCloudName}/${resourceType}/upload`,
      storageKey: `cloudinary:${resourceType}:${folder}/${publicId}`,
      formFields: {
        api_key: this.cloudinaryApiKey,
        timestamp,
        folder,
        public_id: publicId,
        signature,
      },
      expiresInSec: 900,
    };
  }

  private async deleteCloudinaryByUrl(url: string) {
    const match = /res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i.exec(
      url,
    );
    if (!match) return;
    const resourceType = match[1];
    const publicId = match[2];
    if (!resourceType || !publicId) return;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${this.cloudinaryApiSecret}`)
      .digest('hex');

    const body = new URLSearchParams({
      public_id: publicId,
      api_key: this.cloudinaryApiKey,
      timestamp,
      signature,
    });

    await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudinaryCloudName}/${resourceType}/destroy`,
      {
        method: 'POST',
        body,
      },
    );
  }
}
