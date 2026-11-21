import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CourseStatus as PrismaCourseStatus } from '@prisma/client';
import {
  createCourseSchema,
  createLessonSchema,
  reorderCurriculumSchema,
  Role,
  updateCourseSchema,
  updateLessonSchema,
  upsertQuizSchema,
  upsertSectionSchema,
  type CreateCourseInput,
  type CreateLessonInput,
  type ReorderCurriculumInput,
  type UpdateCourseInput,
  type UpdateLessonInput,
  type UpsertQuizInput,
  type UpsertSectionInput,
} from '@try4t/shared';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { z } from 'zod';
import { CoursesService } from './courses.service';

const toggleVisibilitySchema = z.object({
  archived: z.boolean(),
});

@ApiTags('Instructor Course Builder')
@ApiBearerAuth()
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('instructor/courses')
export class InstructorCoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách khóa học của giảng viên' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: PrismaCourseStatus,
  ) {
    return this.coursesService.listInstructorCourses(user, status);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo khóa học mới (trạng thái Nháp)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput,
  ) {
    return this.coursesService.createCourse(user, body);
  }

  @Get(':id/builder')
  @ApiOperation({ summary: 'Lấy chi tiết cây Chương/Bài học/Quiz cho Course Builder' })
  getBuilder(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.getBuilderCourse(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin khóa học, ảnh bìa 16:9, giá & drip lock' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateCourseSchema)) body: UpdateCourseInput,
  ) {
    return this.coursesService.updateCourse(id, user, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa khóa học (hoặc ẩn/lưu trữ vĩnh viễn cho học viên nếu đã có người mua)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.deleteCourse(id, user);
  }

  @Patch(':id/visibility')
  @ApiOperation({ summary: 'Ẩn khóa học khỏi sàn (ARCHIVED) hoặc mở bán lại (PUBLISHED)' })
  toggleVisibility(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(toggleVisibilitySchema)) body: { archived: boolean },
  ) {
    return this.coursesService.toggleCourseVisibility(id, user, body.archived);
  }

  @Post(':id/sections')
  @ApiOperation({ summary: 'Thêm chương học mới' })
  createSection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertSectionSchema)) body: UpsertSectionInput,
  ) {
    return this.coursesService.createSection(id, user, body);
  }

  @Patch(':id/sections/:sectionId')
  @ApiOperation({ summary: 'Đổi tên chương học' })
  updateSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertSectionSchema)) body: UpsertSectionInput,
  ) {
    return this.coursesService.updateSection(id, sectionId, user, body);
  }

  @Delete(':id/sections/:sectionId')
  @ApiOperation({ summary: 'Xóa chương học cùng các bài học bên trong' })
  deleteSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coursesService.deleteSection(id, sectionId, user);
  }

  @Post(':id/sections/:sectionId/lessons')
  @ApiOperation({ summary: 'Thêm bài học (VIDEO / ARTICLE / QUIZ) vào chương' })
  createLesson(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createLessonSchema)) body: CreateLessonInput,
  ) {
    return this.coursesService.createLesson(id, sectionId, user, body);
  }

  @Patch(':id/lessons/:lessonId')
  @ApiOperation({ summary: 'Cập nhật nội dung bài học, video cloud, markdown & học thử' })
  updateLesson(
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateLessonSchema)) body: UpdateLessonInput,
  ) {
    return this.coursesService.updateLesson(id, lessonId, user, body);
  }

  @Delete(':id/lessons/:lessonId')
  @ApiOperation({ summary: 'Xóa bài học' })
  deleteLesson(
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coursesService.deleteLesson(id, lessonId, user);
  }

  @Put(':id/reorder')
  @ApiOperation({ summary: 'Lưu thứ tự kéo thả Chương & Bài học (Atomic transaction)' })
  reorder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reorderCurriculumSchema)) body: ReorderCurriculumInput,
  ) {
    return this.coursesService.reorderCurriculum(id, user, body);
  }

  @Put(':id/lessons/:lessonId/quiz')
  @ApiOperation({ summary: 'Lưu toàn bộ bộ câu hỏi & đáp án cho bài Quiz' })
  upsertQuiz(
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertQuizSchema)) body: UpsertQuizInput,
  ) {
    return this.coursesService.upsertQuiz(id, lessonId, user, body);
  }

  @Post(':id/submit-review')
  @ApiOperation({ summary: 'Gửi khóa học cho Admin duyệt xuất bản (DRAFT/REJECTED -> PENDING_REVIEW)' })
  submitForReview(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.submitForReview(id, user);
  }
}
