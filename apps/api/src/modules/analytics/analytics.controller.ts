import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@try4t/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('instructor/overview')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Tổng quan doanh thu 6 tháng & hiệu quả khóa học của Giảng viên' })
  instructorOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.getInstructorOverview(user);
  }

  @Get('instructor/courses/:courseId/dropoff')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Biểu đồ phễu tỷ lệ bỏ học (Drop-off Funnel) theo từng bài học' })
  courseDropOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.analyticsService.getCourseDropOff(user, courseId);
  }

  @Get('admin/overview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Báo cáo GMV, doanh thu phí nền tảng & hàng đợi chờ duyệt cho Admin' })
  adminOverview() {
    return this.analyticsService.getAdminOverview();
  }
}
