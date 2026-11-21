import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CourseStatus as PrismaCourseStatus } from '@prisma/client';
import { moderateCourseSchema, Role, type ModerateCourseInput } from '@try4t/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ModerationService } from './moderation.service';

@ApiTags('Admin Moderation')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/moderation/courses')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Hàng đợi kiểm duyệt khóa học' })
  listCourses(
    @Query('status') status?: PrismaCourseStatus,
    @Query('search') search?: string,
  ) {
    return this.moderationService.listCourses({ status, search });
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Xem toàn bộ nội dung khóa học để kiểm duyệt' })
  inspectCourse(@Param('id') id: string) {
    return this.moderationService.inspectCourse(id);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: '[Admin] Duyệt xuất bản (APPROVE) hoặc Từ chối (REJECT) khóa học' })
  decide(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(moderateCourseSchema)) body: ModerateCourseInput,
  ) {
    return this.moderationService.decide(id, adminId, body);
  }
}
