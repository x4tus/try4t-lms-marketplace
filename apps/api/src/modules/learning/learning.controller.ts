import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createAnswerSchema,
  createNoteSchema,
  createQuestionSchema,
  updateNoteSchema,
  videoHeartbeatSchema,
  type CreateAnswerInput,
  type CreateNoteInput,
  type CreateQuestionInput,
  type UpdateNoteInput,
  type VideoHeartbeatInput,
} from '@try4t/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LearningService } from './learning.service';

@ApiTags('Learning Room')
@ApiBearerAuth()
@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get('enrollments/mine')
  @ApiOperation({ summary: 'Danh sách khóa học học viên đã sở hữu kèm tiến độ & chứng chỉ' })
  listMyEnrollments(@CurrentUser() user: AuthenticatedUser) {
    return this.learningService.listMyEnrollments(user.id);
  }

  @Get('courses/:slug')
  @ApiOperation({ summary: 'Tải toàn bộ dữ liệu phòng học Smart Learning Room theo slug' })
  getLearningRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ) {
    return this.learningService.getLearningRoom(user, slug);
  }

  @Get('courses/:slug/lessons/:lessonId')
  @ApiOperation({ summary: 'Mở nội dung bài học (có kiểm tra khóa tuần tự & ký Signed Playback URL)' })
  getLessonContent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.learningService.getLessonContent(user, slug, lessonId);
  }

  @Post('lessons/:lessonId/heartbeat')
  @ApiOperation({ summary: 'Ghi nhận nhịp xem Video anti-cheat & Resume Playback' })
  recordHeartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodValidationPipe(videoHeartbeatSchema)) body: VideoHeartbeatInput,
  ) {
    return this.learningService.recordVideoHeartbeat(user, lessonId, body);
  }

  @Post('lessons/:lessonId/complete-article')
  @ApiOperation({ summary: 'Đánh dấu hoàn thành bài đọc Markdown' })
  completeArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.learningService.completeArticle(user, lessonId);
  }

  // ---- NOTES ----

  @Get('lessons/:lessonId/notes')
  @ApiOperation({ summary: 'Danh sách ghi chú theo mốc thời gian của bài học' })
  listNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.learningService.listNotes(user, lessonId);
  }

  @Post('lessons/:lessonId/notes')
  @ApiOperation({ summary: 'Tạo ghi chú mới gắn mốc thời gian video' })
  createNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodValidationPipe(createNoteSchema)) body: CreateNoteInput,
  ) {
    return this.learningService.createNote(user, lessonId, body);
  }

  @Patch('notes/:noteId')
  @ApiOperation({ summary: 'Chỉnh sửa ghi chú cá nhân' })
  updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body(new ZodValidationPipe(updateNoteSchema)) body: UpdateNoteInput,
  ) {
    return this.learningService.updateNote(user, noteId, body);
  }

  @Delete('notes/:noteId')
  @ApiOperation({ summary: 'Xóa ghi chú cá nhân' })
  deleteNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.learningService.deleteNote(user, noteId);
  }

  // ---- Q&A ----

  @Get('lessons/:lessonId/questions')
  @ApiOperation({ summary: 'Danh sách câu hỏi Q&A trong bài học' })
  listQuestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.learningService.listQuestions(user, lessonId);
  }

  @Post('lessons/:lessonId/questions')
  @ApiOperation({ summary: 'Đặt câu hỏi mới trong bài học' })
  createQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodValidationPipe(createQuestionSchema)) body: CreateQuestionInput,
  ) {
    return this.learningService.createQuestion(user, lessonId, body);
  }

  @Post('questions/:questionId/answers')
  @ApiOperation({ summary: 'Trả lời câu hỏi Q&A (tự gắn huy hiệu Giảng viên nếu là chủ khóa học)' })
  createAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body(new ZodValidationPipe(createAnswerSchema)) body: CreateAnswerInput,
  ) {
    return this.learningService.createAnswer(user, questionId, body);
  }

  @Patch('questions/:questionId/resolve')
  @ApiOperation({ summary: 'Đánh dấu câu hỏi đã được giải quyết / mở lại' })
  toggleResolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.learningService.toggleResolveQuestion(user, questionId);
  }
}
