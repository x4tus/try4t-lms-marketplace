import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { InstructorApplicationStatus as PrismaAppStatus } from '@prisma/client';
import {
  adminUpdateUserSchema,
  becomeInstructorSchema,
  reviewInstructorApplicationSchema,
  Role,
  updateProfileSchema,
  type AdminUpdateUserInput,
  type BecomeInstructorInput,
  type ReviewInstructorApplicationInput,
  type UpdateProfileInput,
} from '@try4t/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân & bảng màu giao diện' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.usersService.updateProfile(userId, body);
  }

  @Post('become-instructor')
  @ApiOperation({ summary: 'Gửi hồ sơ đăng ký trở thành Giảng viên Try4T (Chờ Admin duyệt)' })
  becomeInstructor(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(becomeInstructorSchema)) body: BecomeInstructorInput,
  ) {
    return this.usersService.submitInstructorApplication(userId, body);
  }

  @Roles(Role.ADMIN)
  @Get('instructor-applications')
  @ApiOperation({ summary: '[Admin] Danh sách hồ sơ đăng ký Giảng viên chờ kiểm duyệt' })
  listInstructorApplications(@Query('status') status?: PrismaAppStatus) {
    return this.usersService.adminListInstructorApplications(status);
  }

  @Roles(Role.ADMIN)
  @Post('instructor-applications/:userId/decision')
  @ApiOperation({ summary: '[Admin] Duyệt (APPROVE) hoặc Từ chối (REJECT) hồ sơ Giảng viên' })
  decideInstructorApplication(
    @CurrentUser('id') adminId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(reviewInstructorApplicationSchema))
    body: ReviewInstructorApplicationInput,
  ) {
    return this.usersService.adminDecideInstructorApplication(adminId, userId, body);
  }

  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách người dùng có lọc & phân trang' })
  listUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('role') role?: Role,
  ) {
    return this.usersService.adminListUsers({ page, limit, search, role });
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật phân quyền hoặc trạng thái tài khoản' })
  adminUpdateUser(
    @CurrentUser('id') adminId: string,
    @Param('id') targetId: string,
    @Body(new ZodValidationPipe(adminUpdateUserSchema)) body: AdminUpdateUserInput,
  ) {
    return this.usersService.adminUpdateUser(adminId, targetId, body);
  }
}
