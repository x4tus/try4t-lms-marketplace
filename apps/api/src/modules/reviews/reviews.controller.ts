import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  replyReviewSchema,
  Role,
  upsertReviewSchema,
  type ReplyReviewInput,
  type UpsertReviewInput,
} from '@try4t/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Danh sách đánh giá của khóa học' })
  listCourseReviews(@Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.reviewsService.listCourseReviews(courseId);
  }

  @Post('courses/:courseId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gửi hoặc chỉnh sửa đánh giá khóa học (yêu cầu tiến độ >= 20%)' })
  upsertReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body(new ZodValidationPipe(upsertReviewSchema)) body: UpsertReviewInput,
  ) {
    return this.reviewsService.upsertReview(user, courseId, body);
  }

  @Post(':reviewId/reply')
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Giảng viên hoặc Admin phản hồi đánh giá của học viên' })
  replyToReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(replyReviewSchema)) body: ReplyReviewInput,
  ) {
    return this.reviewsService.replyToReview(user, reviewId, body);
  }
}
