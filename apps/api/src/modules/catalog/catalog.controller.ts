import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { catalogQuerySchema, type CatalogQueryInput } from '@try4t/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CatalogService } from './catalog.service';

@ApiTags('Public Catalog & Free Preview')
@Controller('catalog')
export class CatalogController {
  private readonly accessSecret: string;

  constructor(
    private readonly catalogService: CatalogService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessSecret = configService.get<string>('JWT_ACCESS_SECRET')!;
  }

  private async extractOptionalUserId(req: Request): Promise<string | undefined> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    const token = authHeader.slice(7).trim();
    if (!token) return undefined;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: string }>(token, {
        secret: this.accessSecret,
      });
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  @Public()
  @Get('courses')
  @ApiOperation({ summary: 'Tìm kiếm & lọc danh sách khóa học đã xuất bản (Public)' })
  listCourses(@Query(new ZodValidationPipe(catalogQuerySchema)) query: CatalogQueryInput) {
    return this.catalogService.listPublishedCourses(query);
  }

  @Public()
  @Get('courses/:slug')
  @ApiOperation({ summary: 'Xem chi tiết khóa học & lộ trình Curriculum công khai' })
  async getCourseDetail(@Param('slug') slug: string, @Req() req: Request) {
    const viewerUserId = await this.extractOptionalUserId(req);
    return this.catalogService.getCourseDetailBySlug(slug, viewerUserId);
  }

  @Public()
  @Get('courses/:slug/preview/:lessonId')
  @ApiOperation({ summary: 'Xem nội dung bài Học thử miễn phí (Chặn 403 với bài trả phí)' })
  getPreviewLesson(@Param('slug') slug: string, @Param('lessonId') lessonId: string) {
    return this.catalogService.getFreePreviewLesson(slug, lessonId);
  }
}
