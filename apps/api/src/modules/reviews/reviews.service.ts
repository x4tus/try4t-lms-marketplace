import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type ReplyReviewInput, type UpsertReviewInput } from '@try4t/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const MIN_PROGRESS_FOR_REVIEW = 20;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCourseReviews(courseId: string) {
    const reviews = await this.prisma.courseReview.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        rating: true,
        comment: true,
        instructorReply: true,
        repliedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
    return reviews;
  }

  async upsertReview(user: AuthenticatedUser, courseId: string, input: UpsertReviewInput) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, instructorId: true, status: true },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    if (course.instructorId === user.id) {
      throw new BadRequestException('Giảng viên không thể tự đánh giá khóa học của chính mình.');
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
      select: { progressPercent: true },
    });

    if (!enrollment) {
      throw new ForbiddenException({
        code: 'NOT_ENROLLED',
        message: 'Chỉ học viên đã đăng ký khóa học mới có thể gửi đánh giá.',
      });
    }

    const currentProgress = Number(enrollment.progressPercent);
    if (currentProgress < MIN_PROGRESS_FOR_REVIEW) {
      throw new ForbiddenException({
        code: 'REVIEW_PROGRESS_TOO_LOW',
        message: `Bạn cần hoàn thành tối thiểu ${MIN_PROGRESS_FOR_REVIEW}% khóa học trước khi đánh giá (tiến độ hiện tại: ${Math.round(currentProgress)}%).`,
        currentProgressPercent: currentProgress,
        requiredProgressPercent: MIN_PROGRESS_FOR_REVIEW,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.courseReview.upsert({
        where: { userId_courseId: { userId: user.id, courseId } },
        create: {
          userId: user.id,
          courseId,
          rating: input.rating,
          comment: input.comment,
        },
        update: {
          rating: input.rating,
          comment: input.comment,
        },
        select: {
          id: true,
          rating: true,
          comment: true,
          instructorReply: true,
          repliedAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });

      // Cập nhật lại điểm trung bình khóa học
      const courseAgg = await tx.courseReview.aggregate({
        where: { courseId },
        _avg: { rating: true },
        _count: { id: true },
      });

      await tx.course.update({
        where: { id: courseId },
        data: {
          ratingAvg: Number((courseAgg._avg.rating ?? 0).toFixed(2)),
          ratingCount: courseAgg._count.id,
        },
      });

      // Cập nhật lại điểm trung bình của giảng viên
      const instructorAgg = await tx.courseReview.aggregate({
        where: { course: { instructorId: course.instructorId } },
        _avg: { rating: true },
      });

      await tx.instructorProfile.updateMany({
        where: { userId: course.instructorId },
        data: {
          ratingAvg: Number((instructorAgg._avg.rating ?? 0).toFixed(2)),
        },
      });

      return review;
    });
  }

  async replyToReview(user: AuthenticatedUser, reviewId: string, input: ReplyReviewInput) {
    const review = await this.prisma.courseReview.findUnique({
      where: { id: reviewId },
      include: {
        course: { select: { instructorId: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    if (review.course.instructorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ giảng viên phụ trách khóa học hoặc Quản trị viên mới được phản hồi.');
    }

    return this.prisma.courseReview.update({
      where: { id: reviewId },
      data: {
        instructorReply: input.reply,
        repliedAt: new Date(),
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        instructorReply: true,
        repliedAt: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }
}
