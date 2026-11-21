import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LessonType as PrismaLessonType, Prisma } from '@prisma/client';
import {
  Role,
  type CourseProgressionConfig,
  type CreateAnswerInput,
  type CreateNoteInput,
  type CreateQuestionInput,
  type UpdateNoteInput,
  type VideoHeartbeatInput,
} from '@try4t/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  readCourseProgressionConfig,
  readLessonVersions,
  readLessonVersionsMap,
} from '../../common/utils/course-progression';
import {
  calcUniqueWatchedSeconds,
  mergeWatchIntervals,
  parseWatchRanges,
  validateHeartbeatSegment,
} from '../../common/utils/watch-intervals';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { CertificatesService } from '../certificates/certificates.service';

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certificatesService: CertificatesService,
  ) {}

  private computeMaxReachedSec(rawRanges: unknown, lastPositionSec: number): number {
    const ranges = parseWatchRanges(rawRanges);
    let maxEnd = Math.max(0, lastPositionSec);
    for (const [, end] of ranges) {
      if (end > maxEnd) maxEnd = Math.round(end);
    }
    return maxEnd;
  }

  // ============================================================================
  // ACCESS & CUSTOM PROGRESSION ENGINE (FREE / LESSON_SEQUENTIAL / SECTION_SEQUENTIAL)
  // ============================================================================

  async resolveCourseAccess(user: AuthenticatedUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        instructorId: true,
        sequentialLockEnabled: true,
        minWatchPercent: true,
        totalLessons: true,
        totalDurationSec: true,
        instructor: { select: { id: true, fullName: true, avatarUrl: true, headline: true } },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học.');
    }

    const isStaffPreview = course.instructorId === user.id || user.role === Role.ADMIN;

    const [enrollment, certificate, progressionConfig] = await Promise.all([
      this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
      }),
      this.prisma.certificate.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
      }),
      readCourseProgressionConfig(this.prisma, course.id, course.sequentialLockEnabled),
    ]);

    if (!enrollment && !isStaffPreview) {
      throw new ForbiddenException({
        code: 'NOT_ENROLLED',
        message: 'Bạn chưa đăng ký khóa học này. Vui lòng mua hoặc kích hoạt để vào phòng học.',
      });
    }

    // Học viên đã hoàn thành 100% hoặc đã nhận chứng chỉ -> giữ vĩnh viễn quyền đã hoàn thành!
    const isGraduate = Boolean(enrollment?.completedAt || certificate);

    return { course, enrollment, certificate, isStaffPreview, isGraduate, progressionConfig };
  }

  private async buildLessonOrderAndLocks(
    courseId: string,
    userId: string,
    progressionConfig: CourseProgressionConfig,
    isStaffPreview: boolean,
    isGraduate: boolean,
  ) {
    const [sections, progressRows, versionsMap] = await Promise.all([
      this.prisma.courseSection.findMany({
        where: { courseId },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          lessons: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              sectionId: true,
              title: true,
              type: true,
              sortOrder: true,
              isFreePreview: true,
              videoDurationSec: true,
              quiz: {
                select: {
                  id: true,
                  passScorePercent: true,
                  timeLimitSec: true,
                  _count: { select: { questions: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId, courseId },
      }),
      readLessonVersionsMap(this.prisma, courseId),
    ]);

    const progressMap = new Map(progressRows.map((p) => [p.lessonId, p]));
    const flatLessons = sections.flatMap((sec, sIdx) =>
      sec.lessons.map((l) => ({ ...l, sectionTitle: sec.title, sectionIndex: sIdx })),
    );

    const unlockedSet = new Set<string>();
    const lockedReasonMap = new Map<
      string,
      {
        message: string;
        requiredLessonId: string | null;
        requiredLessonTitle: string | null;
        requiredSectionTitle?: string | null;
      }
    >();
    const sectionLockMap = new Map<
      string,
      {
        isUnlocked: boolean;
        lockedMessage: string | null;
        remainingPrevCount: number;
      }
    >();
    const prevLessonMap = new Map<string, { id: string; title: string } | null>();
    const nextLessonMap = new Map<string, { id: string; title: string } | null>();

    for (let i = 0; i < flatLessons.length; i++) {
      const curr = flatLessons[i]!;
      const prev = i > 0 ? flatLessons[i - 1]! : null;
      const next = i < flatLessons.length - 1 ? flatLessons[i + 1]! : null;
      prevLessonMap.set(curr.id, prev ? { id: prev.id, title: prev.title } : null);
      nextLessonMap.set(curr.id, next ? { id: next.id, title: next.title } : null);
    }

    const bypassLock = isStaffPreview || isGraduate || progressionConfig.mode === 'FREE';

    if (progressionConfig.mode === 'SECTION_SEQUENTIAL' && !bypassLock) {
      // Quy tắc theo Chương: Phải hoàn thành TẤT CẢ bài học trong chương trước mới mở khóa chương kế tiếp
      let allPrevSectionsComplete = true;
      let blockingSectionTitle: string | null = null;
      let blockingFirstIncomplete: { id: string; title: string } | null = null;
      let blockingRemaining = 0;

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sec = sections[sIdx]!;
        const sectionUnlocked = sIdx === 0 || allPrevSectionsComplete;

        sectionLockMap.set(sec.id, {
          isUnlocked: sectionUnlocked,
          lockedMessage: sectionUnlocked
            ? null
            : `Hoàn thành hết "${blockingSectionTitle}" (còn ${blockingRemaining} bài) để mở khóa chương này.`,
          remainingPrevCount: sectionUnlocked ? 0 : blockingRemaining,
        });

        for (const les of sec.lessons) {
          const alreadyDone = Boolean(progressMap.get(les.id)?.isCompleted);
          if (sectionUnlocked || alreadyDone) {
            unlockedSet.add(les.id);
          } else {
            lockedReasonMap.set(les.id, {
              message: `Khóa học yêu cầu hoàn thành toàn bộ "${blockingSectionTitle}" (còn ${blockingRemaining} bài) trước khi học sang "${sec.title}".`,
              requiredLessonId: blockingFirstIncomplete?.id ?? null,
              requiredLessonTitle: blockingFirstIncomplete?.title ?? null,
              requiredSectionTitle: blockingSectionTitle,
            });
          }
        }

        // Kiểm tra xem chương hiện tại đã hoàn thành 100% chưa để quyết định chương tiếp theo
        const incompleteInCurrent = sec.lessons.filter((l) => !progressMap.get(l.id)?.isCompleted);
        if (incompleteInCurrent.length > 0) {
          if (allPrevSectionsComplete) {
            allPrevSectionsComplete = false;
            blockingSectionTitle = sec.title;
            blockingFirstIncomplete = {
              id: incompleteInCurrent[0]!.id,
              title: incompleteInCurrent[0]!.title,
            };
            blockingRemaining = incompleteInCurrent.length;
          }
        }
      }
    } else {
      // FREE hoặc LESSON_SEQUENTIAL
      for (const sec of sections) {
        sectionLockMap.set(sec.id, {
          isUnlocked: true,
          lockedMessage: null,
          remainingPrevCount: 0,
        });
      }

      for (let i = 0; i < flatLessons.length; i++) {
        const curr = flatLessons[i]!;
        const prev = i > 0 ? flatLessons[i - 1]! : null;
        const currProgress = progressMap.get(curr.id);
        const prevCompleted = prev ? Boolean(progressMap.get(prev.id)?.isCompleted) : true;

        const isUnlocked = bypassLock || i === 0 || Boolean(currProgress?.isCompleted) || prevCompleted;
        if (isUnlocked) {
          unlockedSet.add(curr.id);
        } else if (prev) {
          lockedReasonMap.set(curr.id, {
            message: `Bạn cần hoàn thành bài "${prev.title}" trước khi mở khóa bài học này.`,
            requiredLessonId: prev.id,
            requiredLessonTitle: prev.title,
            requiredSectionTitle: null,
          });
        }
      }
    }

    return {
      sections,
      flatLessons,
      progressMap,
      versionsMap,
      unlockedSet,
      lockedReasonMap,
      sectionLockMap,
      prevLessonMap,
      nextLessonMap,
    };
  }

  async assertLessonAccessAndUnlock(user: AuthenticatedUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        courseId: true,
        sectionId: true,
        title: true,
        type: true,
        videoStorageKey: true,
        videoDurationSec: true,
        articleMd: true,
        resourcesJson: true,
        section: { select: { title: true } },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Không tìm thấy bài học.');
    }

    const { course, enrollment, certificate, isStaffPreview, isGraduate, progressionConfig } =
      await this.resolveCourseAccess(user, lesson.courseId);

    const structure = await this.buildLessonOrderAndLocks(
      course.id,
      user.id,
      progressionConfig,
      isStaffPreview,
      isGraduate,
    );

    if (!structure.unlockedSet.has(lesson.id)) {
      const reason = structure.lockedReasonMap.get(lesson.id);
      const prev = structure.prevLessonMap.get(lesson.id);
      throw new ForbiddenException({
        code: 'LESSON_LOCKED',
        message:
          reason?.message ||
          (prev
            ? `Khóa học đang bật khóa lộ trình. Bạn cần hoàn thành bài "${prev.title}" trước khi mở bài này.`
            : 'Bài học này đang bị khóa. Vui lòng hoàn thành các bài học trước đó.'),
        previousLessonId: reason?.requiredLessonId ?? prev?.id ?? null,
        previousLessonTitle: reason?.requiredLessonTitle ?? prev?.title ?? null,
      });
    }

    return { lesson, course, enrollment, certificate, isStaffPreview, isGraduate, progressionConfig, structure };
  }

  /**
   * Tính lại % tiến độ khóa học và tự động cấp chứng chỉ khi đạt 100%.
   * ĐẶC BIỆT: Nếu học viên ĐÃ hoàn thành 100% / đã nhận chứng chỉ trước đó,
   * việc giảng viên thêm bài mới KHÔNG BAO GIỜ hạ trạng thái hoàn thành hoặc chứng chỉ!
   */
  async recalculateEnrollmentProgress(userId: string, courseId: string) {
    const [enrollment, existingCert] = await Promise.all([
      this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      }),
      this.prisma.certificate.findUnique({
        where: { userId_courseId: { userId, courseId } },
      }),
    ]);

    if (!enrollment) {
      return {
        progressPercent: 0,
        completedLessonsCount: 0,
        totalLessons: 0,
        isCertifiedCompleted: false,
        bonusLessonsRemaining: 0,
        certificate: null,
      };
    }

    const [totalLessons, completedLessonsCount] = await Promise.all([
      this.prisma.lesson.count({ where: { courseId } }),
      this.prisma.lessonProgress.count({
        where: {
          userId,
          courseId,
          isCompleted: true,
        },
      }),
    ]);

    const safeCompleted = Math.min(completedLessonsCount, totalLessons);
    const rawPercent =
      totalLessons > 0
        ? Math.min(100, Number(((safeCompleted / totalLessons) * 100).toFixed(2)))
        : 0;

    // Bảo vệ vĩnh viễn trạng thái đã hoàn thành & chứng chỉ khi giảng viên thêm bài bổ sung sau này!
    const wasAlreadyGraduated = Boolean(enrollment.completedAt || existingCert);
    const effectiveProgressPercent = wasAlreadyGraduated ? 100 : rawPercent;
    const effectiveCompletedAt =
      wasAlreadyGraduated
        ? (enrollment.completedAt ?? existingCert?.issuedAt ?? new Date())
        : rawPercent >= 100
          ? new Date()
          : null;

    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        completedLessonsCount: safeCompleted,
        progressPercent: effectiveProgressPercent,
        completedAt: effectiveCompletedAt,
      },
    });

    let certificate = existingCert;
    if (!certificate && effectiveProgressPercent >= 100 && totalLessons > 0) {
      certificate = await this.certificatesService.ensureIssuedForCompletion(userId, courseId);
    }

    const isCertifiedCompleted = Boolean(effectiveCompletedAt || certificate);
    const bonusLessonsRemaining = isCertifiedCompleted
      ? Math.max(0, totalLessons - safeCompleted)
      : 0;

    return {
      progressPercent: effectiveProgressPercent,
      completedLessonsCount: safeCompleted,
      totalLessons,
      isCertifiedCompleted,
      bonusLessonsRemaining,
      certificate: certificate
        ? {
            certCode: certificate.certCode,
            verifyPath: `/verify/${certificate.certCode}`,
            pdfPath: `/api/v1/certificates/${certificate.certCode}/pdf`,
            issuedAt: certificate.issuedAt,
          }
        : null,
    };
  }

  /**
   * Được QuizzesService gọi khi học viên vượt qua bài Quiz.
   */
  async completeLessonFromQuiz(
    userId: string,
    enrollmentId: string | null,
    courseId: string,
    lessonId: string,
  ) {
    if (!enrollmentId) {
      return {
        progressPercent: 0,
        completedLessonsCount: 0,
        totalLessons: 0,
        isCertifiedCompleted: false,
        bonusLessonsRemaining: 0,
        certificate: null,
      };
    }

    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        enrollmentId,
        userId,
        courseId,
        lessonId,
        isCompleted: true,
        completedAt: new Date(),
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    return this.recalculateEnrollmentProgress(userId, courseId);
  }

  // ============================================================================
  // MY ENROLLMENTS & LEARNING ROOM STATE
  // ============================================================================

  async listMyEnrollments(userId: string) {
    const [enrollments, certificates] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId },
        orderBy: { enrolledAt: 'desc' },
        include: {
          lastLesson: { select: { id: true, title: true, type: true } },
          course: {
            select: {
              id: true,
              slug: true,
              title: true,
              status: true,
              thumbnailUrl: true,
              level: true,
              totalLessons: true,
              totalDurationSec: true,
              sequentialLockEnabled: true,
              category: { select: { name: true } },
              instructor: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.prisma.certificate.findMany({
        where: { userId },
        select: { courseId: true, certCode: true, issuedAt: true },
      }),
    ]);

    const certByCourse = new Map(certificates.map((c) => [c.courseId, c]));

    return enrollments.map((enr) => {
      const cert = certByCourse.get(enr.courseId);
      const isCertifiedCompleted = Boolean(enr.completedAt || cert);
      const progressPercent = isCertifiedCompleted ? 100 : Number(enr.progressPercent);
      const bonusLessonsRemaining = isCertifiedCompleted
        ? Math.max(0, enr.course.totalLessons - enr.completedLessonsCount)
        : 0;

      return {
        id: enr.id,
        courseId: enr.courseId,
        progressPercent,
        completedLessonsCount: enr.completedLessonsCount,
        isCertifiedCompleted,
        bonusLessonsRemaining,
        enrolledAt: enr.enrolledAt,
        completedAt: enr.completedAt,
        lastLesson: enr.lastLesson,
        course: enr.course,
        certificate: cert
          ? {
              certCode: cert.certCode,
              issuedAt: cert.issuedAt,
              verifyPath: `/verify/${cert.certCode}`,
              pdfPath: `/api/v1/certificates/${cert.certCode}/pdf`,
            }
          : null,
      };
    });
  }

  async getLearningRoom(user: AuthenticatedUser, slug: string) {
    const courseRecord = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!courseRecord) {
      throw new NotFoundException('Không tìm thấy khóa học.');
    }

    const { course, enrollment, certificate, isStaffPreview, isGraduate, progressionConfig } =
      await this.resolveCourseAccess(user, courseRecord.id);

    const [structure, myReview] = await Promise.all([
      this.buildLessonOrderAndLocks(
        course.id,
        user.id,
        progressionConfig,
        isStaffPreview,
        isGraduate,
      ),
      this.prisma.courseReview.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
        select: {
          id: true,
          rating: true,
          comment: true,
          instructorReply: true,
          repliedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const sections = structure.sections.map((sec) => {
      const secLock = structure.sectionLockMap.get(sec.id);
      return {
        id: sec.id,
        title: sec.title,
        sortOrder: sec.sortOrder,
        isUnlocked: secLock?.isUnlocked ?? true,
        lockedMessage: secLock?.lockedMessage ?? null,
        lessons: sec.lessons.map((l) => {
          const prog = structure.progressMap.get(l.id);
          const versions = structure.versionsMap.get(l.id) ?? [];
          const watchedPercent =
            l.type === PrismaLessonType.VIDEO && l.videoDurationSec > 0
              ? Math.min(100, Math.round(((prog?.uniqueWatchedSec ?? 0) / l.videoDurationSec) * 100))
              : prog?.isCompleted
                ? 100
                : 0;
          const lockInfo = structure.lockedReasonMap.get(l.id);

          return {
            id: l.id,
            title: l.title,
            type: l.type,
            sortOrder: l.sortOrder,
            videoDurationSec: l.videoDurationSec,
            isUnlocked: structure.unlockedSet.has(l.id),
            lockedMessage: lockInfo?.message ?? null,
            isCompleted: Boolean(prog?.isCompleted),
            lastPositionSec: prog?.lastPositionSec ?? 0,
            uniqueWatchedSec: prog?.uniqueWatchedSec ?? 0,
            watchedPercent,
            versionCount: versions.length,
            quizMeta: l.quiz
              ? {
                  passScorePercent: l.quiz.passScorePercent,
                  timeLimitSec: l.quiz.timeLimitSec,
                  questionsCount: l.quiz._count.questions,
                }
              : null,
          };
        }),
      };
    });

    let initialLessonId: string | null = null;
    if (enrollment?.lastLessonId && structure.unlockedSet.has(enrollment.lastLessonId)) {
      initialLessonId = enrollment.lastLessonId;
    } else {
      const firstIncompleteUnlocked = structure.flatLessons.find(
        (l) => structure.unlockedSet.has(l.id) && !structure.progressMap.get(l.id)?.isCompleted,
      );
      initialLessonId = firstIncompleteUnlocked?.id ?? structure.flatLessons[0]?.id ?? null;
    }

    const completedCount = enrollment?.completedLessonsCount ?? structure.flatLessons.length;
    const effectiveProgress = isGraduate
      ? 100
      : Number(enrollment?.progressPercent ?? 100);
    const bonusLessonsRemaining = isGraduate
      ? Math.max(0, structure.flatLessons.length - completedCount)
      : 0;

    return {
      course: {
        id: course.id,
        slug: course.slug,
        title: course.title,
        status: course.status,
        sequentialLockEnabled: progressionConfig.mode !== 'FREE',
        progressionConfig,
        minWatchPercent: course.minWatchPercent,
        totalLessons: structure.flatLessons.length,
        totalDurationSec: course.totalDurationSec,
        instructor: course.instructor,
      },
      isStaffPreview,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            progressPercent: effectiveProgress,
            completedLessonsCount: completedCount,
            isCertifiedCompleted: isGraduate,
            bonusLessonsRemaining,
            lastLessonId: enrollment.lastLessonId,
            enrolledAt: enrollment.enrolledAt,
            completedAt: enrollment.completedAt,
          }
        : {
            id: null,
            progressPercent: 100,
            completedLessonsCount: structure.flatLessons.length,
            isCertifiedCompleted: false,
            bonusLessonsRemaining: 0,
            lastLessonId: initialLessonId,
            enrolledAt: new Date(),
            completedAt: null,
          },
      initialLessonId,
      sections,
      certificate: certificate
        ? {
            certCode: certificate.certCode,
            issuedAt: certificate.issuedAt,
            verifyPath: `/verify/${certificate.certCode}`,
            pdfPath: `/api/v1/certificates/${certificate.certCode}/pdf`,
          }
        : null,
      myReview,
    };
  }

  async getLessonContent(user: AuthenticatedUser, slug: string, lessonId: string) {
    const { lesson, course, enrollment, progressionConfig, structure } =
      await this.assertLessonAccessAndUnlock(user, lessonId);

    if (course.slug !== slug) {
      throw new NotFoundException('Bài học không thuộc khóa học này.');
    }

    if (enrollment) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { lastLessonId: lesson.id },
      });
    }

    const [playbackUrl, rawVersions] = await Promise.all([
      lesson.type === PrismaLessonType.VIDEO
        ? this.storage.resolvePlaybackUrl(lesson.videoStorageKey, 7200)
        : Promise.resolve(null),
      readLessonVersions(this.prisma, lesson.id),
    ]);

    const versions = await Promise.all(
      rawVersions.map(async (v) => ({
        ...v,
        playbackUrl: v.videoStorageKey
          ? await this.storage.resolvePlaybackUrl(v.videoStorageKey, 7200)
          : null,
      })),
    );

    const prog = structure.progressMap.get(lesson.id);
    const prev = structure.prevLessonMap.get(lesson.id) ?? null;
    const next = structure.nextLessonMap.get(lesson.id) ?? null;

    const watchedPercent =
      lesson.type === PrismaLessonType.VIDEO && lesson.videoDurationSec > 0
        ? Math.min(100, Math.round(((prog?.uniqueWatchedSec ?? 0) / lesson.videoDurationSec) * 100))
        : prog?.isCompleted
          ? 100
          : 0;

    const maxReachedSec = this.computeMaxReachedSec(
      prog?.watchedRangesJson,
      prog?.lastPositionSec ?? 0,
    );

    return {
      id: lesson.id,
      courseId: course.id,
      sectionTitle: lesson.section.title,
      title: lesson.title,
      type: lesson.type,
      videoDurationSec: lesson.videoDurationSec,
      minWatchPercent: course.minWatchPercent,
      progressionConfig,
      playbackUrl,
      articleMd: lesson.type === PrismaLessonType.ARTICLE ? lesson.articleMd : null,
      resources: Array.isArray(lesson.resourcesJson) ? lesson.resourcesJson : [],
      versions,
      progress: {
        lastPositionSec: prog?.lastPositionSec ?? 0,
        maxReachedSec,
        uniqueWatchedSec: prog?.uniqueWatchedSec ?? 0,
        watchedPercent,
        isCompleted: Boolean(prog?.isCompleted),
        completedAt: prog?.completedAt ?? null,
      },
      navigation: {
        previousLesson: prev,
        nextLesson: next
          ? {
              ...next,
              isUnlocked: structure.unlockedSet.has(next.id),
            }
          : null,
      },
    };
  }

  // ============================================================================
  // VIDEO HEARTBEAT (HARD ANTI-SEEK + WALL-CLOCK VELOCITY + RESUME)
  // ============================================================================

  async recordVideoHeartbeat(
    user: AuthenticatedUser,
    lessonId: string,
    input: VideoHeartbeatInput,
  ) {
    const { lesson, course, enrollment, isStaffPreview, progressionConfig } =
      await this.assertLessonAccessAndUnlock(user, lessonId);

    if (lesson.type !== PrismaLessonType.VIDEO) {
      throw new BadRequestException('Chỉ bài học dạng Video mới ghi nhận heartbeat.');
    }

    if (!enrollment && isStaffPreview) {
      return {
        acceptedSegment: true,
        cheatDetected: false,
        lastPositionSec: Math.round(input.currentSec),
        maxReachedSec: Math.round(input.currentSec),
        uniqueWatchedSec: 0,
        watchedPercent: 100,
        isCompleted: true,
        enrollmentProgress: null,
        certificate: null,
      };
    }

    const now = new Date();
    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
    });

    const currentRanges = parseWatchRanges(existing?.watchedRangesJson);
    const prevMaxReached = this.computeMaxReachedSec(
      existing?.watchedRangesJson,
      existing?.lastPositionSec ?? 0,
    );

    const validation = validateHeartbeatSegment({
      fromSec: input.fromSec,
      toSec: input.toSec,
      playbackRate: input.playbackRate,
      lastHeartbeatAt: existing?.lastHeartbeatAt ?? null,
      now,
    });

    // Chặn tua quá ngưỡng % cho phép ngay ở phía server nếu bài chưa hoàn thành
    const durationSec = lesson.videoDurationSec;
    const allowedAheadSec =
      durationSec > 0
        ? Math.round((durationSec * progressionConfig.maxSeekAheadPercent) / 100)
        : 0;
    const serverCeiling = prevMaxReached + Math.max(15, allowedAheadSec + 12);
    const jumpedPastUnwatched =
      progressionConfig.blockFastForward &&
      !existing?.isCompleted &&
      validation.clampedFrom > serverCeiling;

    let nextRanges = currentRanges;
    let acceptedSegment = validation.accepted && !jumpedPastUnwatched;

    if (acceptedSegment) {
      nextRanges = mergeWatchIntervals(
        [...currentRanges, [validation.clampedFrom, validation.clampedTo]],
        durationSec > 0 ? durationSec : undefined,
      );
    }

    const uniqueWatchedSec = calcUniqueWatchedSeconds(nextRanges);
    const watchedPercent =
      durationSec > 0
        ? Math.min(100, Math.round((uniqueWatchedSec / durationSec) * 100))
        : Math.min(100, Math.round((uniqueWatchedSec / 15) * 100));

    const reachedCompletion =
      durationSec > 0
        ? (uniqueWatchedSec / durationSec) * 100 >= course.minWatchPercent
        : uniqueWatchedSec >= 15;

    const wasCompleted = Boolean(existing?.isCompleted);
    const isCompleted = wasCompleted || reachedCompletion;

    // Không cho lastPositionSec nhảy vượt quá trần đã xem khi khóa tua đang bật
    const rawClampedPos =
      durationSec > 0
        ? Math.max(0, Math.min(Math.round(input.currentSec), durationSec))
        : Math.max(0, Math.round(input.currentSec));

    const nextMaxReached = this.computeMaxReachedSec(nextRanges, prevMaxReached);
    const safeLastPos =
      progressionConfig.blockFastForward && !isCompleted && jumpedPastUnwatched
        ? prevMaxReached
        : rawClampedPos;

    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      create: {
        enrollmentId: enrollment!.id,
        userId: user.id,
        courseId: course.id,
        lessonId: lesson.id,
        lastPositionSec: safeLastPos,
        watchedRangesJson: nextRanges as unknown as Prisma.InputJsonValue,
        uniqueWatchedSec,
        isCompleted,
        completedAt: isCompleted ? now : null,
        lastHeartbeatAt: now,
      },
      update: {
        lastPositionSec: safeLastPos,
        watchedRangesJson: nextRanges as unknown as Prisma.InputJsonValue,
        uniqueWatchedSec,
        isCompleted,
        completedAt: isCompleted ? (existing?.completedAt ?? now) : null,
        lastHeartbeatAt: now,
      },
    });

    let enrollmentProgress = null;
    if (isCompleted && !wasCompleted) {
      enrollmentProgress = await this.recalculateEnrollmentProgress(user.id, course.id);
    }

    return {
      acceptedSegment,
      cheatDetected: jumpedPastUnwatched || (!validation.accepted && validation.reason !== 'EMPTY_SEGMENT'),
      reason: jumpedPastUnwatched ? 'FAST_FORWARD_BLOCKED' : (validation.reason ?? null),
      lastPositionSec: safeLastPos,
      maxReachedSec: Math.max(nextMaxReached, safeLastPos),
      uniqueWatchedSec,
      watchedPercent,
      minWatchPercent: course.minWatchPercent,
      isCompleted,
      justCompleted: isCompleted && !wasCompleted,
      enrollmentProgress,
      certificate: enrollmentProgress?.certificate ?? null,
    };
  }

  async completeArticle(user: AuthenticatedUser, lessonId: string) {
    const { lesson, course, enrollment, isStaffPreview } = await this.assertLessonAccessAndUnlock(
      user,
      lessonId,
    );

    if (lesson.type !== PrismaLessonType.ARTICLE) {
      throw new BadRequestException(
        'Chỉ bài học dạng Bài đọc Markdown mới được đánh dấu hoàn thành trực tiếp. Video cần xem đủ thời lượng và Quiz cần đạt điểm chuẩn.',
      );
    }

    if (!enrollment && isStaffPreview) {
      return {
        isCompleted: true,
        enrollmentProgress: null,
        certificate: null,
      };
    }

    const now = new Date();
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      create: {
        enrollmentId: enrollment!.id,
        userId: user.id,
        courseId: course.id,
        lessonId: lesson.id,
        isCompleted: true,
        completedAt: now,
      },
      update: {
        isCompleted: true,
        completedAt: now,
      },
    });

    const enrollmentProgress = await this.recalculateEnrollmentProgress(user.id, course.id);

    return {
      isCompleted: true,
      enrollmentProgress,
      certificate: enrollmentProgress.certificate,
    };
  }

  // ============================================================================
  // TIMESTAMPED NOTES (PRIVATE PER USER)
  // ============================================================================

  async listNotes(user: AuthenticatedUser, lessonId: string) {
    await this.assertLessonAccessAndUnlock(user, lessonId);
    return this.prisma.lessonNote.findMany({
      where: { userId: user.id, lessonId },
      orderBy: [{ timestampSec: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createNote(user: AuthenticatedUser, lessonId: string, input: CreateNoteInput) {
    const { lesson } = await this.assertLessonAccessAndUnlock(user, lessonId);
    return this.prisma.lessonNote.create({
      data: {
        userId: user.id,
        courseId: lesson.courseId,
        lessonId: lesson.id,
        timestampSec: Math.max(0, input.timestampSec),
        content: input.content,
      },
    });
  }

  async updateNote(user: AuthenticatedUser, noteId: string, input: UpdateNoteInput) {
    const note = await this.prisma.lessonNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Không tìm thấy ghi chú.');
    if (note.userId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền sửa ghi chú này.');
    }

    return this.prisma.lessonNote.update({
      where: { id: noteId },
      data: { content: input.content },
    });
  }

  async deleteNote(user: AuthenticatedUser, noteId: string) {
    const note = await this.prisma.lessonNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Không tìm thấy ghi chú.');
    if (note.userId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền xóa ghi chú này.');
    }

    await this.prisma.lessonNote.delete({ where: { id: noteId } });
    return { deleted: true };
  }

  // ============================================================================
  // LESSON Q&A (HỎI ĐÁP CÙNG GIẢNG VIÊN)
  // ============================================================================

  async listQuestions(user: AuthenticatedUser, lessonId: string) {
    await this.assertLessonAccessAndUnlock(user, lessonId);
    return this.prisma.lessonQuestion.findMany({
      where: { lessonId },
      orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
      take: 40,
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
        answers: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
          },
        },
      },
    });
  }

  async createQuestion(user: AuthenticatedUser, lessonId: string, input: CreateQuestionInput) {
    const { lesson } = await this.assertLessonAccessAndUnlock(user, lessonId);
    return this.prisma.lessonQuestion.create({
      data: {
        courseId: lesson.courseId,
        lessonId: lesson.id,
        userId: user.id,
        title: input.title,
        contentMd: input.contentMd,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
        answers: true,
      },
    });
  }

  async createAnswer(user: AuthenticatedUser, questionId: string, input: CreateAnswerInput) {
    const question = await this.prisma.lessonQuestion.findUnique({
      where: { id: questionId },
      include: {
        course: { select: { id: true, instructorId: true } },
      },
    });

    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi.');

    await this.resolveCourseAccess(user, question.courseId);

    const isInstructorReply =
      question.course.instructorId === user.id || user.role === Role.ADMIN;

    return this.prisma.$transaction(async (tx) => {
      const answer = await tx.lessonAnswer.create({
        data: {
          questionId: question.id,
          userId: user.id,
          contentMd: input.contentMd,
          isInstructorReply,
        },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
        },
      });

      await tx.lessonQuestion.update({
        where: { id: question.id },
        data: { answersCount: { increment: 1 } },
      });

      return answer;
    });
  }

  async toggleResolveQuestion(user: AuthenticatedUser, questionId: string) {
    const question = await this.prisma.lessonQuestion.findUnique({
      where: { id: questionId },
      include: { course: { select: { instructorId: true } } },
    });

    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi.');

    const canResolve =
      question.userId === user.id ||
      question.course.instructorId === user.id ||
      user.role === Role.ADMIN;

    if (!canResolve) {
      throw new ForbiddenException(
        'Chỉ người đặt câu hỏi hoặc giảng viên mới được đánh dấu đã giải quyết.',
      );
    }

    return this.prisma.lessonQuestion.update({
      where: { id: questionId },
      data: { isResolved: !question.isResolved },
    });
  }
}
