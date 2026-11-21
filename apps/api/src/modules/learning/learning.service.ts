import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LessonType as PrismaLessonType, Prisma } from '@prisma/client';
import {
  Role,
  type CreateAnswerInput,
  type CreateNoteInput,
  type CreateQuestionInput,
  type UpdateNoteInput,
  type VideoHeartbeatInput,
} from '@try4t/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
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

  // ============================================================================
  // ACCESS & SEQUENTIAL DRIP LOCK ENGINE
  // ============================================================================

  async resolveCourseAccess(user: AuthenticatedUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        slug: true,
        title: true,
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

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
    });

    if (!enrollment && !isStaffPreview) {
      throw new ForbiddenException({
        code: 'NOT_ENROLLED',
        message: 'Bạn chưa đăng ký khóa học này. Vui lòng mua hoặc kích hoạt để vào phòng học.',
      });
    }

    return { course, enrollment, isStaffPreview };
  }

  private async buildLessonOrderAndLocks(
    courseId: string,
    userId: string,
    sequentialLockEnabled: boolean,
    isStaffPreview: boolean,
  ) {
    const [sections, progressRows] = await Promise.all([
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
    ]);

    const progressMap = new Map(progressRows.map((p) => [p.lessonId, p]));
    const flatLessons = sections.flatMap((sec) =>
      sec.lessons.map((l) => ({ ...l, sectionTitle: sec.title })),
    );

    const unlockedSet = new Set<string>();
    const prevLessonMap = new Map<string, { id: string; title: string } | null>();
    const nextLessonMap = new Map<string, { id: string; title: string } | null>();

    for (let i = 0; i < flatLessons.length; i++) {
      const curr = flatLessons[i]!;
      const prev = i > 0 ? flatLessons[i - 1]! : null;
      const next = i < flatLessons.length - 1 ? flatLessons[i + 1]! : null;

      prevLessonMap.set(curr.id, prev ? { id: prev.id, title: prev.title } : null);
      nextLessonMap.set(curr.id, next ? { id: next.id, title: next.title } : null);

      const currProgress = progressMap.get(curr.id);
      const prevCompleted = prev ? Boolean(progressMap.get(prev.id)?.isCompleted) : true;

      const isUnlocked =
        !sequentialLockEnabled ||
        isStaffPreview ||
        i === 0 ||
        Boolean(currProgress?.isCompleted) ||
        prevCompleted;

      if (isUnlocked) {
        unlockedSet.add(curr.id);
      }
    }

    return { sections, flatLessons, progressMap, unlockedSet, prevLessonMap, nextLessonMap };
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

    const { course, enrollment, isStaffPreview } = await this.resolveCourseAccess(
      user,
      lesson.courseId,
    );

    const structure = await this.buildLessonOrderAndLocks(
      course.id,
      user.id,
      course.sequentialLockEnabled,
      isStaffPreview,
    );

    if (!structure.unlockedSet.has(lesson.id)) {
      const prev = structure.prevLessonMap.get(lesson.id);
      throw new ForbiddenException({
        code: 'LESSON_LOCKED',
        message: prev
          ? `Khóa học đang bật học tuần tự. Bạn cần hoàn thành bài "${prev.title}" trước khi mở bài này.`
          : 'Bài học này đang bị khóa tuần tự. Vui lòng hoàn thành bài học trước đó.',
        previousLessonId: prev?.id ?? null,
        previousLessonTitle: prev?.title ?? null,
      });
    }

    return { lesson, course, enrollment, isStaffPreview, structure };
  }

  /**
   * Tính lại % tiến độ khóa học và tự động cấp chứng chỉ khi đạt 100%.
   */
  async recalculateEnrollmentProgress(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (!enrollment) {
      return {
        progressPercent: 0,
        completedLessonsCount: 0,
        totalLessons: 0,
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
    const progressPercent =
      totalLessons > 0
        ? Math.min(100, Number(((safeCompleted / totalLessons) * 100).toFixed(2)))
        : 0;

    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        completedLessonsCount: safeCompleted,
        progressPercent,
        completedAt: progressPercent >= 100 ? (enrollment.completedAt ?? new Date()) : null,
      },
    });

    let certificate = null;
    if (progressPercent >= 100 && totalLessons > 0) {
      certificate = await this.certificatesService.ensureIssuedForCompletion(userId, courseId);
    }

    return {
      progressPercent,
      completedLessonsCount: safeCompleted,
      totalLessons,
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
      return {
        id: enr.id,
        courseId: enr.courseId,
        progressPercent: Number(enr.progressPercent),
        completedLessonsCount: enr.completedLessonsCount,
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

    const { course, enrollment, isStaffPreview } = await this.resolveCourseAccess(
      user,
      courseRecord.id,
    );

    const [structure, certificate, myReview] = await Promise.all([
      this.buildLessonOrderAndLocks(
        course.id,
        user.id,
        course.sequentialLockEnabled,
        isStaffPreview,
      ),
      this.prisma.certificate.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
      }),
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

    const sections = structure.sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      sortOrder: sec.sortOrder,
      lessons: sec.lessons.map((l) => {
        const prog = structure.progressMap.get(l.id);
        const watchedPercent =
          l.type === PrismaLessonType.VIDEO && l.videoDurationSec > 0
            ? Math.min(100, Math.round(((prog?.uniqueWatchedSec ?? 0) / l.videoDurationSec) * 100))
            : prog?.isCompleted
              ? 100
              : 0;

        return {
          id: l.id,
          title: l.title,
          type: l.type,
          sortOrder: l.sortOrder,
          videoDurationSec: l.videoDurationSec,
          isUnlocked: structure.unlockedSet.has(l.id),
          isCompleted: Boolean(prog?.isCompleted),
          lastPositionSec: prog?.lastPositionSec ?? 0,
          uniqueWatchedSec: prog?.uniqueWatchedSec ?? 0,
          watchedPercent,
          quizMeta: l.quiz
            ? {
                passScorePercent: l.quiz.passScorePercent,
                timeLimitSec: l.quiz.timeLimitSec,
                questionsCount: l.quiz._count.questions,
              }
            : null,
        };
      }),
    }));

    // Chọn bài học mặc định hợp lý: bài đang xem dở -> bài chưa xong đầu tiên -> bài đầu tiên
    let initialLessonId: string | null = null;
    if (enrollment?.lastLessonId && structure.unlockedSet.has(enrollment.lastLessonId)) {
      initialLessonId = enrollment.lastLessonId;
    } else {
      const firstIncompleteUnlocked = structure.flatLessons.find(
        (l) => structure.unlockedSet.has(l.id) && !structure.progressMap.get(l.id)?.isCompleted,
      );
      initialLessonId = firstIncompleteUnlocked?.id ?? structure.flatLessons[0]?.id ?? null;
    }

    return {
      course: {
        id: course.id,
        slug: course.slug,
        title: course.title,
        sequentialLockEnabled: course.sequentialLockEnabled,
        minWatchPercent: course.minWatchPercent,
        totalLessons: structure.flatLessons.length,
        totalDurationSec: course.totalDurationSec,
        instructor: course.instructor,
      },
      isStaffPreview,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            progressPercent: Number(enrollment.progressPercent),
            completedLessonsCount: enrollment.completedLessonsCount,
            lastLessonId: enrollment.lastLessonId,
            enrolledAt: enrollment.enrolledAt,
            completedAt: enrollment.completedAt,
          }
        : {
            id: null,
            progressPercent: 100,
            completedLessonsCount: structure.flatLessons.length,
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
    const { lesson, course, enrollment, structure } = await this.assertLessonAccessAndUnlock(
      user,
      lessonId,
    );

    if (course.slug !== slug) {
      throw new NotFoundException('Bài học không thuộc khóa học này.');
    }

    if (enrollment) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { lastLessonId: lesson.id },
      });
    }

    const playbackUrl =
      lesson.type === PrismaLessonType.VIDEO
        ? await this.storage.resolvePlaybackUrl(lesson.videoStorageKey, 7200)
        : null;

    const prog = structure.progressMap.get(lesson.id);
    const prev = structure.prevLessonMap.get(lesson.id) ?? null;
    const next = structure.nextLessonMap.get(lesson.id) ?? null;

    const watchedPercent =
      lesson.type === PrismaLessonType.VIDEO && lesson.videoDurationSec > 0
        ? Math.min(100, Math.round(((prog?.uniqueWatchedSec ?? 0) / lesson.videoDurationSec) * 100))
        : prog?.isCompleted
          ? 100
          : 0;

    return {
      id: lesson.id,
      courseId: course.id,
      sectionTitle: lesson.section.title,
      title: lesson.title,
      type: lesson.type,
      videoDurationSec: lesson.videoDurationSec,
      minWatchPercent: course.minWatchPercent,
      playbackUrl,
      articleMd: lesson.type === PrismaLessonType.ARTICLE ? lesson.articleMd : null,
      resources: Array.isArray(lesson.resourcesJson) ? lesson.resourcesJson : [],
      progress: {
        lastPositionSec: prog?.lastPositionSec ?? 0,
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
  // VIDEO HEARTBEAT (ANTI-CHEAT + RESUME) & ARTICLE COMPLETE
  // ============================================================================

  async recordVideoHeartbeat(
    user: AuthenticatedUser,
    lessonId: string,
    input: VideoHeartbeatInput,
  ) {
    const { lesson, course, enrollment, isStaffPreview } = await this.assertLessonAccessAndUnlock(
      user,
      lessonId,
    );

    if (lesson.type !== PrismaLessonType.VIDEO) {
      throw new BadRequestException('Chỉ bài học dạng Video mới ghi nhận heartbeat.');
    }

    // Chế độ xem trước của Giảng viên/Admin không cần ghi vào enrollment
    if (!enrollment && isStaffPreview) {
      return {
        acceptedSegment: true,
        cheatDetected: false,
        lastPositionSec: Math.round(input.currentSec),
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

    const validation = validateHeartbeatSegment({
      fromSec: input.fromSec,
      toSec: input.toSec,
      playbackRate: input.playbackRate,
      lastHeartbeatAt: existing?.lastHeartbeatAt ?? null,
      now,
    });

    const currentRanges = parseWatchRanges(existing?.watchedRangesJson);
    let nextRanges = currentRanges;

    if (validation.accepted) {
      nextRanges = mergeWatchIntervals(
        [...currentRanges, [validation.clampedFrom, validation.clampedTo]],
        lesson.videoDurationSec > 0 ? lesson.videoDurationSec : undefined,
      );
    }

    const uniqueWatchedSec = calcUniqueWatchedSeconds(nextRanges);
    const durationSec = lesson.videoDurationSec;

    // Xử lý an toàn cả trường hợp video chưa lưu duration (videoDurationSec === 0)
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

    const clampedPos =
      durationSec > 0
        ? Math.max(0, Math.min(Math.round(input.currentSec), durationSec))
        : Math.max(0, Math.round(input.currentSec));

    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      create: {
        enrollmentId: enrollment!.id,
        userId: user.id,
        courseId: course.id,
        lessonId: lesson.id,
        lastPositionSec: clampedPos,
        watchedRangesJson: nextRanges as unknown as Prisma.InputJsonValue,
        uniqueWatchedSec,
        isCompleted,
        completedAt: isCompleted ? now : null,
        lastHeartbeatAt: now,
      },
      update: {
        lastPositionSec: clampedPos,
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
      acceptedSegment: validation.accepted,
      cheatDetected: !validation.accepted && validation.reason !== 'EMPTY_SEGMENT',
      reason: validation.reason ?? null,
      lastPositionSec: clampedPos,
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
      throw new ForbiddenException('Chỉ người đặt câu hỏi hoặc giảng viên mới được đánh dấu đã giải quyết.');
    }

    return this.prisma.lessonQuestion.update({
      where: { id: questionId },
      data: { isResolved: !question.isResolved },
    });
  }
}
