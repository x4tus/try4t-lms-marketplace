import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { presignMediaSchema, Role, type PresignMediaInput } from '@try4t/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StorageService } from './storage.service';

const probeVideoSchema = z.object({
  storageKey: z.string().trim().min(5, 'Đường dẫn hoặc Storage Key video không hợp lệ'),
});

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/i;

@ApiTags('Media Storage')
@ApiBearerAuth()
@Controller('media')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('status')
  @ApiOperation({ summary: 'Kiểm tra trạng thái cấu hình Cloudinary & Cloudflare R2' })
  getStatus() {
    return this.storageService.getStatus();
  }

  @Post('presign')
  @ApiOperation({ summary: 'Cấp chữ ký Direct Upload lên Cloudflare R2 / Cloudinary' })
  presignUpload(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
    @Body(new ZodValidationPipe(presignMediaSchema)) body: PresignMediaInput,
  ) {
    // Học viên chỉ được tải ảnh (Avatar); Giảng viên & Admin tải được cả Video/Tài liệu
    if (body.kind !== 'IMAGE' && role !== Role.INSTRUCTOR && role !== Role.ADMIN) {
      throw new BadRequestException('Chỉ Giảng viên hoặc Quản trị viên mới được tải Video/Tài liệu.');
    }
    return this.storageService.createPresignedUpload(userId, body);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('probe-video-duration')
  @ApiOperation({ summary: 'Tự động đọc thời lượng thực tế (giây) từ tệp video Cloud/MP4/YouTube/Vimeo' })
  async probeVideoDuration(
    @Body(new ZodValidationPipe(probeVideoSchema)) body: z.infer<typeof probeVideoSchema>,
  ) {
    const durationSec = await this.storageService.probeVideoDurationSec(body.storageKey);
    return { durationSec };
  }

  @Get('image-proxy')
  @ApiOperation({ summary: 'Proxy ảnh HTTPS an toàn hỗ trợ cắt (crop) lại ảnh cũ trên Canvas không bị lỗi CORS' })
  async proxyImageForCrop(@Query('url') rawUrl: string | undefined, @Res() res: Response) {
    if (!rawUrl) {
      throw new BadRequestException('Thiếu tham số url ảnh');
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      throw new BadRequestException('URL ảnh không hợp lệ');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Chỉ hỗ trợ đường dẫn HTTP/HTTPS');
    }
    if (PRIVATE_HOST_RE.test(parsed.hostname)) {
      throw new BadRequestException('Không cho phép proxy địa chỉ nội bộ');
    }

    const upstream = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'image/*' },
    }).catch(() => null);

    if (!upstream || !upstream.ok) {
      throw new BadRequestException('Không thể tải ảnh gốc để cắt lại');
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Tệp được chọn không phải hình ảnh hợp lệ');
    }

    const arrayBuf = await upstream.arrayBuffer();
    if (arrayBuf.byteLength > 8 * 1024 * 1024) {
      throw new BadRequestException('Ảnh gốc vượt quá giới hạn 8MB');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(arrayBuf));
  }
}
