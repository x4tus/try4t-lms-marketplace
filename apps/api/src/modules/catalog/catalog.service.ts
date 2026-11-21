import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CourseLevel as PrismaCourseLevel,
  CourseStatus as PrismaCourseStatus,
  Prisma,
} from '@prisma/client';
import type { CatalogQueryInput } from '@try4t/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listPublishedCourses(query: CatalogQueryInput) {
    const page = Math.max(1, query.page);
    const limit = Math.min(48, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.CourseWhereInput = {
      status: PrismaCourseStatus.PUBLISHED,
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.level ? { level: query.level as PrismaCourseLevel } : {}),
      ...(query.minRating && query.minRating > 0
        ? { ratingAvg: { gte: query.minRating } }
        : {}),
      ...(query.price === 'FREE'
        ? {
            OR: [
              { salePriceVnd: 0 },
              { AND: [{ salePriceVnd: null }, { priceVnd: 0 }] },
            ],
          }
        : query.price === 'PAID'
          ? {
              OR: [
                { salePriceVnd: { gt: 0 } },
                { AND: [{ salePriceVnd: null }, { priceVnd: { gt: 0 } }] },
              ],
            }
          : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { subtitle: { contains: query.search, mode: 'insensitive' } },
              {
                instructor: {
                  fullName: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CourseOrderByWithRelationInput[] =
      query.sort === 'NEWEST'
        ? [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
        : query.sort === 'RATING'
          ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }]
          : query.sort === 'PRICE_ASC'
            ? [{ priceVnd: 'asc' }]
            : query.sort === 'PRICE_DESC'
              ? [{ priceVnd: 'desc' }]
              : [{ enrollmentCount: 'desc' }, { ratingAvg: 'desc' }, { publishedAt: 'desc' }];

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          subtitle: true,
          thumbnailUrl: true,
          level: true,
          priceVnd: true,
          salePriceVnd: true,
          sequentialLockEnabled: true,
          totalDurationSec: true,
          totalLessons: true,
          ratingAvg: true,
          ratingCount: true,
          enrollmentCount: true,
          publishedAt: true,
          category: { select: { id: true, name: true, slug: true } },
          instructor: {
            select: { id: true, fullName: true, avatarUrl: true, headline: true },
          },
          lessons: {
            where: { isFreePreview: true },
            orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
            take: 1,
            select: { id: true, title: true, type: true },
          },
          _count: {
            select: {
              lessons: { where: { isFreePreview: true } },
            },
          },
        },
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      items: courses.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        subtitle: c.subtitle,
        thumbnailUrl: c.thumbnailUrl,
        level: c.level,
        priceVnd: c.priceVnd,
        salePriceVnd: c.salePriceVnd,
        sequentialLockEnabled: c.sequentialLockEnabled,
        totalDurationSec: c.totalDurationSec,
        totalLessons: c.totalLessons,
        ratingAvg: Number(c.ratingAvg),
        ratingCount: c.ratingCount,
        enrollmentCount: c.enrollmentCount,
        publishedAt: c.publishedAt,
        category: c.category,
        instructor: c.instructor,
        freePreviewCount: c._count.lessons,
        firstPreviewLesson: c.lessons[0] ?? null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getCourseDetailBySlug(slug: string, viewerUserId?: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: PrismaCourseStatus.PUBLISHED,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        subtitle: true,
        descriptionMd: true,
        thumbnailUrl: true,
        level: true,
        priceVnd: true,
        salePriceVnd: true,
        sequentialLockEnabled: true,
        minWatchPercent: true,
        totalDurationSec: true,
        totalLessons: true,
        ratingAvg: true,
        ratingCount: true,
        enrollmentCount: true,
        publishedAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
        instructor: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            headline: true,
            bio: true,
            instructorProfile: {
              select: {
                totalStudents: true,
                ratingAvg: true,
                yearsOfExperience: true,
                expertiseTopics: true,
              },
            },
            _count: {
              select: {
                instructedCourses: { where: { status: PrismaCourseStatus.PUBLISHED } },
              },
            },
          },
        },
        // TUYET DOI KHONG tra videoStorageKey, articleMd hay dap an Quiz o API public detail
        sections: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            sortOrder: true,
            lessons: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                title: true,
                type: true,
                sortOrder: true,
                isFreePreview: true,
                videoDurationSec: true,
                quiz: {
                  select: {
                    passScorePercent: true,
                    timeLimitSec: true,
                    _count: { select: { questions: true } },
                  },
                },
              },
            },
          },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            rating: true,
            comment: true,
            instructorReply: true,
            repliedAt: true,
            createdAt: true,
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học hoặc khóa học chưa được xuất bản');
    }

    let isEnrolled = false;
    if (viewerUserId) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: viewerUserId,
            courseId: course.id,
          },
        },
        select: { id: true },
      });
      isEnrolled = Boolean(enrollment) || course.instructor.id === viewerUserId;
    }

    const freePreviewLessons = course.sections.flatMap((sec) =>
      sec.lessons
        .filter((l) => l.isFreePreview)
        .map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          sectionTitle: sec.title,
          videoDurationSec: l.videoDurationSec,
        })),
    );

    return {
      ...course,
      ratingAvg: Number(course.ratingAvg),
      isEnrolled,
      freePreviewLessons,
      instructor: {
        id: course.instructor.id,
        fullName: course.instructor.fullName,
        avatarUrl: course.instructor.avatarUrl,
        headline: course.instructor.headline,
        bio: course.instructor.bio,
        publishedCoursesCount: course.instructor._count.instructedCourses,
        totalStudents: course.instructor.instructorProfile?.totalStudents ?? 0,
        ratingAvg: Number(course.instructor.instructorProfile?.ratingAvg ?? 0),
        yearsOfExperience: course.instructor.instructorProfile?.yearsOfExperience ?? null,
        expertiseTopics: Array.isArray(course.instructor.instructorProfile?.expertiseTopics)
          ? (course.instructor.instructorProfile?.expertiseTopics as string[])
          : [],
      },
      sections: course.sections.map((sec) => ({
        ...sec,
        totalDurationSec: sec.lessons.reduce((sum, l) => sum + l.videoDurationSec, 0),
        lessons: sec.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          sortOrder: l.sortOrder,
          isFreePreview: l.isFreePreview,
          videoDurationSec: l.videoDurationSec,
          quizMeta: l.quiz
            ? {
                passScorePercent: l.quiz.passScorePercent,
                timeLimitSec: l.quiz.timeLimitSec,
                questionsCount: l.quiz._count.questions,
              }
            : null,
        })),
      })),
    };
  }

  async getFreePreviewLesson(slug: string, lessonId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        slug,
        status: PrismaCourseStatus.PUBLISHED,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        priceVnd: true,
        salePriceVnd: true,
        lessons: {
          where: { isFreePreview: true },
          orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
          select: {
            id: true,
            title: true,
            type: true,
            videoDurationSec: true,
            section: { select: { title: true } },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId: course.id },
      select: {
        id: true,
        title: true,
        type: true,
        isFreePreview: true,
        videoStorageKey: true,
        videoDurationSec: true,
        articleMd: true,
        section: { select: { title: true } },
        quiz: {
          select: {
            id: true,
            passScorePercent: true,
            timeLimitSec: true,
            questions: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                promptMd: true,
                type: true,
                // KHONG TRA isCorrect khi xem truoc!
                options: {
                  orderBy: { sortOrder: 'asc' },
                  select: { id: true, content: true },
                },
              },
            },
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Không tìm thấy bài học');
    }

    // Bao mat nghiem ngat phia Backend: chan bai tra phi
    if (!lesson.isFreePreview) {
      throw new ForbiddenException({
        code: 'PREVIEW_LOCKED',
        message: 'Bài học này nằm trong nội dung trả phí. Vui lòng đăng ký khóa học để mở khóa.',
      });
    }

    const playbackUrl =
      lesson.type === 'VIDEO'
        ? await this.storage.resolvePlaybackUrl(lesson.videoStorageKey, 3600)
        : null;

    return {
      course: {
        id: course.id,
        title: course.title,
        slug: course.slug,
        priceVnd: course.priceVnd,
        salePriceVnd: course.salePriceVnd,
      },
      lesson: {
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        sectionTitle: lesson.section.title,
        videoDurationSec: lesson.videoDurationSec,
        playbackUrl,
        articleMd: lesson.type === 'ARTICLE' ? lesson.articleMd : null,
        quiz: lesson.type === 'QUIZ' ? lesson.quiz : null,
      },
      previewPlaylist: course.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type,
        videoDurationSec: l.videoDurationSec,
        sectionTitle: l.section.title,
      })),
    };
  }
}
