import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { presignMediaSchema, Role, type PresignMediaInput } from '@try4t/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StorageService } from './storage.service';

const probeVideoSchema = z.object({
  storageKey: z.string().trim().min(5, 'Đường dẫn hoặc Storage Key video không hợp lệ'),
});

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

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('presign')
  @ApiOperation({ summary: 'Cấp chữ ký Direct Upload lên Cloudflare R2 / Cloudinary' })
  presignUpload(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(presignMediaSchema)) body: PresignMediaInput,
  ) {
    return this.storageService.createPresignedUpload(userId, body);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('probe-video-duration')
  @ApiOperation({ summary: 'Tự động đọc thời lượng thực tế (giây) từ tệp video Cloud/MP4' })
  async probeVideoDuration(
    @Body(new ZodValidationPipe(probeVideoSchema)) body: z.infer<typeof probeVideoSchema>,
  ) {
    const durationSec = await this.storageService.probeVideoDurationSec(body.storageKey);
    return { durationSec };
  }
}
