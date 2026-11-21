import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseStatus as PrismaCourseStatus, Prisma } from '@prisma/client';
import type { ModerateCourseInput } from '@try4t/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listCourses(query: { status?: PrismaCourseStatus; search?: string }) {
    const where: Prisma.CourseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { instructor: { fullName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, countsRaw] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          category: { select: { id: true, name: true } },
          instructor: { select: { id: true, fullName: true, email: true } },
          _count: { select: { sections: true, lessons: true, enrollments: true } },
          reviewLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { note: true, toStatus: true, createdAt: true },
          },
        },
      }),
      this.prisma.course.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      DRAFT: 0,
      PENDING_REVIEW: 0,
      PUBLISHED: 0,
      REJECTED: 0,
      ARCHIVED: 0,
    };
    for (const row of countsRaw) {
      statusCounts[row.status] = row._count.id;
    }

    return {
      statusCounts,
      items: items.map((c) => ({
        ...c,
        ratingAvg: Number(c.ratingAvg),
        latestReviewLog: c.reviewLogs[0] ?? null,
      })),
    };
  }

  async inspectCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        category: { select: { id: true, name: true } },
        instructor: { select: { id: true, fullName: true, email: true, headline: true } },
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
                      include: { options: { orderBy: { sortOrder: 'asc' } } },
                    },
                  },
                },
              },
            },
          },
        },
        reviewLogs: {
          orderBy: { createdAt: 'desc' },
          take: 15,
          include: {
            actor: { select: { id: true, fullName: true, role: true } },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    const sections = await Promise.all(
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
      sections,
    };
  }

  async decide(courseId: string, adminId: string, input: ModerateCourseInput) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, title: true, totalLessons: true },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    if (input.action === 'APPROVE' && course.totalLessons === 0) {
      throw new BadRequestException('Không thể duyệt xuất bản khóa học chưa có bài học nào');
    }

    const targetStatus =
      input.action === 'APPROVE' ? PrismaCourseStatus.PUBLISHED : PrismaCourseStatus.REJECTED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.course.update({
        where: { id: courseId },
        data: {
          status: targetStatus,
          ...(targetStatus === PrismaCourseStatus.PUBLISHED ? { publishedAt: new Date() } : {}),
        },
      });

      await tx.courseReviewLog.create({
        data: {
          courseId,
          actorId: adminId,
          fromStatus: course.status,
          toStatus: targetStatus,
          note:
            input.note?.trim() ||
            (targetStatus === PrismaCourseStatus.PUBLISHED
              ? 'Admin đã phê duyệt và xuất bản khóa học.'
              : 'Khóa học cần chỉnh sửa lại trước khi xuất bản.'),
        },
      });

      return next;
    });

    return {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt,
    };
  }
}
