import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CourseLevel as PrismaCourseLevel,
  CourseStatus as PrismaCourseStatus,
  LessonType as PrismaLessonType,
  Prisma,
  QuizQuestionType as PrismaQuizQuestionType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  Role,
  slugify,
  type CreateCourseInput,
  type CreateLessonInput,
  type ReorderCurriculumInput,
  type UpdateCourseInput,
  type UpdateLessonInput,
  type UpsertQuizInput,
  type UpsertSectionInput,
} from '@try4t/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listInstructorCourses(user: AuthenticatedUser, status?: PrismaCourseStatus) {
    const where: Prisma.CourseWhereInput = {
      ...(user.role === Role.ADMIN ? {} : { instructorId: user.id }),
      ...(status ? { status } : {}),
    };

    const courses = await this.prisma.course.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        instructor: { select: { id: true, fullName: true, email: true } },
        reviewLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
          },
        },
        _count: {
          select: { sections: true, lessons: true, enrollments: true },
        },
      },
    });

    return courses.map((c) => ({
      ...c,
      ratingAvg: Number(c.ratingAvg),
      latestReviewLog: c.reviewLogs[0] ?? null,
    }));
  }

  async createCourse(user: AuthenticatedUser, input: CreateCourseInput) {
    const slug = await this.generateUniqueSlug(input.title);

    const course = await this.prisma.course.create({
      data: {
        instructorId: user.id,
        categoryId: input.categoryId ?? null,
        title: input.title,
        slug,
        subtitle: input.subtitle ?? null,
        descriptionMd: input.descriptionMd ?? null,
        level: input.level as PrismaCourseLevel,
        priceVnd: input.priceVnd,
        salePriceVnd: input.salePriceVnd ?? null,
        sequentialLockEnabled: input.sequentialLockEnabled,
        minWatchPercent: input.minWatchPercent,
        status: PrismaCourseStatus.DRAFT,
        sections: {
          create: {
            title: 'Chương 1: Giới thiệu tổng quan',
            sortOrder: 0,
          },
        },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    return {
      ...course,
      ratingAvg: Number(course.ratingAvg),
    };
  }

  async getBuilderCourse(courseId: string, user: AuthenticatedUser) {
    await this.assertCourseOwnership(courseId, user);

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        instructor: { select: { id: true, fullName: true, email: true } },
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              include: {
                quiz: {
                  include: {
                    questions: {
                      orderBy: { sortOrder: 'asc' },
                      include: {
                        options: { orderBy: { sortOrder: 'asc' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        reviewLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            actor: { select: { id: true, fullName: true, role: true } },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    const sectionsWithPlayback = await Promise.all(
      course.sections.map(async (section) => ({
        ...section,
        lessons: await Promise.all(
          section.lessons.map(async (lesson) => ({
            ...lesson,
            playbackUrl: await this.storage.resolvePlaybackUrl(lesson.videoStorageKey),
          })),
        ),
      })),
    );

    return {
      ...course,
      ratingAvg: Number(course.ratingAvg),
      sections: sectionsWithPlayback,
    };
  }

  async updateCourse(courseId: string, user: AuthenticatedUser, input: UpdateCourseInput) {
    const existing = await this.assertCourseOwnership(courseId, user);

    const nextPrice = input.priceVnd ?? existing.priceVnd;
    const nextSalePrice =
      input.salePriceVnd !== undefined ? input.salePriceVnd : existing.salePriceVnd;
    if (nextSalePrice !== null && nextSalePrice > nextPrice) {
      throw new BadRequestException('Giá khuyến mãi không được lớn hơn giá gốc');
    }

    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.level !== undefined ? { level: input.level as PrismaCourseLevel } : {}),
        ...(input.priceVnd !== undefined ? { priceVnd: input.priceVnd } : {}),
        ...(input.salePriceVnd !== undefined ? { salePriceVnd: input.salePriceVnd } : {}),
        ...(input.descriptionMd !== undefined ? { descriptionMd: input.descriptionMd } : {}),
        ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
        ...(input.promoVideoKey !== undefined ? { promoVideoKey: input.promoVideoKey } : {}),
        ...(input.sequentialLockEnabled !== undefined
          ? { sequentialLockEnabled: input.sequentialLockEnabled }
          : {}),
        ...(input.minWatchPercent !== undefined ? { minWatchPercent: input.minWatchPercent } : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    // Clean up replaced thumbnail in background
    if (
      input.thumbnailUrl !== undefined &&
      existing.thumbnailUrl &&
      existing.thumbnailUrl !== input.thumbnailUrl
    ) {
      void this.storage.deleteAsset(existing.thumbnailUrl);
    }

    return {
      ...updated,
      ratingAvg: Number(updated.ratingAvg),
    };
  }

  async deleteCourse(courseId: string, user: AuthenticatedUser) {
    const existing = await this.assertCourseOwnership(courseId, user);

    const enrollmentCount = await this.prisma.enrollment.count({
      where: { courseId },
    });

    if (enrollmentCount > 0) {
      await this.prisma.course.update({
        where: { id: courseId },
        data: { status: PrismaCourseStatus.ARCHIVED },
      });
      return { archived: true, deleted: false };
    }

    await this.prisma.course.delete({ where: { id: courseId } });
    if (existing.thumbnailUrl) {
      void this.storage.deleteAsset(existing.thumbnailUrl);
    }
    return { archived: false, deleted: true };
  }

  // ============================================================================
  // SECTIONS & LESSONS
  // ============================================================================

  async createSection(courseId: string, user: AuthenticatedUser, input: UpsertSectionInput) {
    await this.assertCourseOwnership(courseId, user);

    const maxSection = await this.prisma.courseSection.aggregate({
      where: { courseId },
      _max: { sortOrder: true },
    });
    const nextOrder = (maxSection._max.sortOrder ?? -1) + 1;

    return this.prisma.courseSection.create({
      data: {
        courseId,
        title: input.title,
        sortOrder: nextOrder,
      },
      include: { lessons: true },
    });
  }

  async updateSection(
    courseId: string,
    sectionId: string,
    user: AuthenticatedUser,
    input: UpsertSectionInput,
  ) {
    await this.assertCourseOwnership(courseId, user);

    const section = await this.prisma.courseSection.findFirst({
      where: { id: sectionId, courseId },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('Không tìm thấy chương học');

    return this.prisma.courseSection.update({
      where: { id: sectionId },
      data: { title: input.title },
    });
  }

  async deleteSection(courseId: string, sectionId: string, user: AuthenticatedUser) {
    await this.assertCourseOwnership(courseId, user);

    const section = await this.prisma.courseSection.findFirst({
      where: { id: sectionId, courseId },
      include: { lessons: { select: { videoStorageKey: true } } },
    });
    if (!section) throw new NotFoundException('Không tìm thấy chương học');

    await this.prisma.courseSection.delete({ where: { id: sectionId } });
    await this.recalculateCourseMetrics(courseId);

    for (const lesson of section.lessons) {
      if (lesson.videoStorageKey) {
        void this.storage.deleteAsset(lesson.videoStorageKey);
      }
    }

    return { deleted: true };
  }

  async createLesson(
    courseId: string,
    sectionId: string,
    user: AuthenticatedUser,
    input: CreateLessonInput,
  ) {
    await this.assertCourseOwnership(courseId, user);

    const section = await this.prisma.courseSection.findFirst({
      where: { id: sectionId, courseId },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('Không tìm thấy chương học');

    const maxLesson = await this.prisma.lesson.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const nextOrder = (maxLesson._max.sortOrder ?? -1) + 1;

    const lesson = await this.prisma.lesson.create({
      data: {
        courseId,
        sectionId,
        title: input.title,
        type: input.type as PrismaLessonType,
        isFreePreview: input.isFreePreview,
        sortOrder: nextOrder,
        ...(input.type === 'QUIZ'
          ? {
              quiz: {
                create: {
                  passScorePercent: 70,
                  shuffleQuestions: false,
                },
              },
            }
          : {}),
      },
      include: {
        quiz: {
          include: {
            questions: { include: { options: true } },
          },
        },
      },
    });

    await this.recalculateCourseMetrics(courseId);
    return {
      ...lesson,
      playbackUrl: null,
    };
  }

  async updateLesson(
    courseId: string,
    lessonId: string,
    user: AuthenticatedUser,
    input: UpdateLessonInput,
  ) {
    await this.assertCourseOwnership(courseId, user);

    const existing = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy bài học');

    const nextType = (input.type as PrismaLessonType | undefined) ?? existing.type;
    const nextVideoKey =
      input.videoStorageKey !== undefined ? input.videoStorageKey : existing.videoStorageKey;
    const videoKeyChanged =
      input.videoStorageKey !== undefined && input.videoStorageKey !== existing.videoStorageKey;

    // Tự động đọc thời lượng thực tế từ tệp video nếu chưa có hoặc vừa đổi file/URL video
    let resolvedDurationSec = input.videoDurationSec;
    if (
      nextType === PrismaLessonType.VIDEO &&
      nextVideoKey &&
      (resolvedDurationSec === undefined ||
        resolvedDurationSec <= 0 ||
        (videoKeyChanged && resolvedDurationSec === existing.videoDurationSec))
    ) {
      const probed = await this.storage.probeVideoDurationSec(nextVideoKey);
      if (probed > 0) {
        resolvedDurationSec = probed;
      }
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.type !== undefined ? { type: input.type as PrismaLessonType } : {}),
        ...(input.isFreePreview !== undefined ? { isFreePreview: input.isFreePreview } : {}),
        ...(input.videoStorageKey !== undefined ? { videoStorageKey: input.videoStorageKey } : {}),
        ...(resolvedDurationSec !== undefined ? { videoDurationSec: resolvedDurationSec } : {}),
        ...(input.articleMd !== undefined ? { articleMd: input.articleMd } : {}),
        ...(input.resourcesJson !== undefined
          ? { resourcesJson: input.resourcesJson as Prisma.InputJsonValue }
          : {}),
      },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' },
              include: { options: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });

    if (
      input.videoStorageKey !== undefined &&
      existing.videoStorageKey &&
      existing.videoStorageKey !== input.videoStorageKey
    ) {
      void this.storage.deleteAsset(existing.videoStorageKey);
    }

    await this.recalculateCourseMetrics(courseId);

    return {
      ...updated,
      playbackUrl: await this.storage.resolvePlaybackUrl(updated.videoStorageKey),
    };
  }

  async deleteLesson(courseId: string, lessonId: string, user: AuthenticatedUser) {
    await this.assertCourseOwnership(courseId, user);

    const existing = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy bài học');

    await this.prisma.lesson.delete({ where: { id: lessonId } });
    await this.recalculateCourseMetrics(courseId);

    if (existing.videoStorageKey) {
      void this.storage.deleteAsset(existing.videoStorageKey);
    }

    return { deleted: true };
  }

  async reorderCurriculum(
    courseId: string,
    user: AuthenticatedUser,
    input: ReorderCurriculumInput,
  ) {
    await this.assertCourseOwnership(courseId, user);

    const existingSections = await this.prisma.courseSection.findMany({
      where: { courseId },
      select: { id: true },
    });
    const sectionIdSet = new Set(existingSections.map((s) => s.id));

    const existingLessons = await this.prisma.lesson.findMany({
      where: { courseId },
      select: { id: true },
    });
    const lessonIdSet = new Set(existingLessons.map((l) => l.id));

    for (const sec of input.sections) {
      if (!sectionIdSet.has(sec.id)) {
        throw new BadRequestException(`Chương ${sec.id} không thuộc khóa học này`);
      }
      for (const les of sec.lessons) {
        if (!lessonIdSet.has(les.id)) {
          throw new BadRequestException(`Bài học ${les.id} không thuộc khóa học này`);
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const sec of input.sections) {
        await tx.courseSection.update({
          where: { id: sec.id },
          data: { sortOrder: sec.sortOrder },
        });
        for (const les of sec.lessons) {
          await tx.lesson.update({
            where: { id: les.id },
            data: {
              sectionId: sec.id,
              sortOrder: les.sortOrder,
            },
          });
        }
      }
    });

    return { reordered: true };
  }

  async upsertQuiz(
    courseId: string,
    lessonId: string,
    user: AuthenticatedUser,
    input: UpsertQuizInput,
  ) {
    await this.assertCourseOwnership(courseId, user);

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true, type: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài học');

    const quiz = await this.prisma.$transaction(async (tx) => {
      if (lesson.type !== PrismaLessonType.QUIZ) {
        await tx.lesson.update({
          where: { id: lessonId },
          data: { type: PrismaLessonType.QUIZ },
        });
      }

      const upsertedQuiz = await tx.quiz.upsert({
        where: { lessonId },
        create: {
          lessonId,
          passScorePercent: input.passScorePercent,
          timeLimitSec: input.timeLimitSec ?? null,
          shuffleQuestions: input.shuffleQuestions,
        },
        update: {
          passScorePercent: input.passScorePercent,
          timeLimitSec: input.timeLimitSec ?? null,
          shuffleQuestions: input.shuffleQuestions,
        },
      });

      await tx.quizQuestion.deleteMany({ where: { quizId: upsertedQuiz.id } });

      for (let qIdx = 0; qIdx < input.questions.length; qIdx++) {
        const q = input.questions[qIdx]!;
        await tx.quizQuestion.create({
          data: {
            quizId: upsertedQuiz.id,
            promptMd: q.promptMd,
            type: q.type as PrismaQuizQuestionType,
            explanationMd: q.explanationMd ?? null,
            sortOrder: qIdx,
            options: {
              create: q.options.map((opt, oIdx) => ({
                content: opt.content,
                isCorrect: opt.isCorrect,
                sortOrder: oIdx,
              })),
            },
          },
        });
      }

      return tx.quiz.findUnique({
        where: { id: upsertedQuiz.id },
        include: {
          questions: {
            orderBy: { sortOrder: 'asc' },
            include: { options: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });
    });

    return quiz;
  }

  async submitForReview(courseId: string, user: AuthenticatedUser) {
    const course = await this.assertCourseOwnership(courseId, user);

    if (course.status === PrismaCourseStatus.PENDING_REVIEW) {
      throw new BadRequestException('Khóa học hiện đang ở trạng thái chờ duyệt');
    }
    if (course.status === PrismaCourseStatus.PUBLISHED) {
      throw new BadRequestException('Khóa học này đã được xuất bản');
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      include: { quiz: { include: { _count: { select: { questions: true } } } } },
    });

    if (lessons.length === 0) {
      throw new BadRequestException('Khóa học cần có ít nhất 1 bài học trước khi gửi duyệt');
    }

    const missingContent = lessons.find((l) => {
      if (l.type === 'VIDEO') return !l.videoStorageKey;
      if (l.type === 'ARTICLE') return !l.articleMd || l.articleMd.trim().length < 10;
      if (l.type === 'QUIZ') return !l.quiz || l.quiz._count.questions === 0;
      return false;
    });

    if (missingContent) {
      throw new BadRequestException(
        `Bài học "${missingContent.title}" chưa hoàn thiện nội dung (${missingContent.type}). Vui lòng bổ sung trước khi gửi duyệt.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.course.update({
        where: { id: courseId },
        data: { status: PrismaCourseStatus.PENDING_REVIEW },
      });

      await tx.courseReviewLog.create({
        data: {
          courseId,
          actorId: user.id,
          fromStatus: course.status,
          toStatus: PrismaCourseStatus.PENDING_REVIEW,
          note: 'Giảng viên gửi yêu cầu kiểm duyệt xuất bản khóa học.',
        },
      });

      return next;
    });

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  private async assertCourseOwnership(courseId: string, user: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }
    if (user.role !== Role.ADMIN && course.instructorId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa khóa học này');
    }
    return course;
  }

  private async recalculateCourseMetrics(courseId: string) {
    const agg = await this.prisma.lesson.aggregate({
      where: { courseId },
      _count: { id: true },
      _sum: { videoDurationSec: true },
    });

    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        totalLessons: agg._count.id,
        totalDurationSec: agg._sum.videoDurationSec ?? 0,
      },
    });
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'khoa-hoc';
    const existing = await this.prisma.course.findUnique({
      where: { slug: base },
      select: { id: true },
    });
    if (!existing) return base;

    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }
}
