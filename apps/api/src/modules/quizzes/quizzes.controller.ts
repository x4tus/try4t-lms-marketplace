import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { submitQuizAttemptSchema, type SubmitQuizAttemptInput } from '@try4t/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QuizzesService } from './quizzes.service';

@ApiTags('Quizzes')
@ApiBearerAuth()
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Get('lessons/:lessonId')
  @ApiOperation({ summary: 'Tải đề bài Quiz (không kèm đáp án đúng) & lịch sử làm bài' })
  getLessonQuiz(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.quizzesService.getLessonQuiz(user, lessonId);
  }

  @Post('lessons/:lessonId/submit')
  @ApiOperation({ summary: 'Nộp bài & chấm điểm Quiz phía server (tự mở bài sau & cấp chứng chỉ nếu 100%)' })
  submitQuiz(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodValidationPipe(submitQuizAttemptSchema)) body: SubmitQuizAttemptInput,
  ) {
    return this.quizzesService.submitQuizAttempt(user, lessonId, body);
  }
}
