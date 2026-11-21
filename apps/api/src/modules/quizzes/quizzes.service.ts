import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LessonType as PrismaLessonType, Prisma, QuizQuestionType } from '@prisma/client';
import type { SubmitQuizAttemptInput } from '@try4t/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LearningService } from '../learning/learning.service';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learningService: LearningService,
  ) {}

  async getLessonQuiz(user: AuthenticatedUser, lessonId: string) {
    const { lesson } = await this.learningService.assertLessonAccessAndUnlock(user, lessonId);

    if (lesson.type !== PrismaLessonType.QUIZ) {
      throw new BadRequestException('Bài học này không phải dạng bài kiểm tra Quiz.');
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { lessonId },
      select: {
        id: true,
        passScorePercent: true,
        timeLimitSec: true,
        shuffleQuestions: true,
        questions: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            promptMd: true,
            type: true,
            sortOrder: true,
            // TUYỆT ĐỐI KHÔNG TRẢ isCorrect hay explanationMd trước khi nộp bài!
            options: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                content: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Giảng viên chưa cấu hình câu hỏi cho bài Quiz này.');
    }

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId: quiz.id, userId: user.id },
      orderBy: { submittedAt: 'desc' },
      take: 15,
      select: {
        id: true,
        scorePercent: true,
        correctCount: true,
        totalQuestions: true,
        passed: true,
        submittedAt: true,
      },
    });

    const questions = [...quiz.questions];
    if (quiz.shuffleQuestions && questions.length > 1) {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j]!, questions[i]!];
      }
    }

    const bestScorePercent = attempts.reduce(
      (max, a) => Math.max(max, Number(a.scorePercent)),
      0,
    );

    return {
      id: quiz.id,
      lessonId,
      passScorePercent: quiz.passScorePercent,
      timeLimitSec: quiz.timeLimitSec,
      shuffleQuestions: quiz.shuffleQuestions,
      questions,
      attempts: attempts.map((a) => ({
        ...a,
        scorePercent: Number(a.scorePercent),
      })),
      bestScorePercent,
      hasPassed: attempts.some((a) => a.passed),
    };
  }

  async submitQuizAttempt(
    user: AuthenticatedUser,
    lessonId: string,
    input: SubmitQuizAttemptInput,
  ) {
    const { lesson, course, enrollment } = await this.learningService.assertLessonAccessAndUnlock(
      user,
      lessonId,
    );

    if (lesson.type !== PrismaLessonType.QUIZ) {
      throw new BadRequestException('Bài học này không phải dạng bài kiểm tra Quiz.');
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { lessonId },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            options: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!quiz || quiz.questions.length === 0) {
      throw new BadRequestException('Bài Quiz chưa có câu hỏi nào để chấm điểm.');
    }

    const submittedMap = new Map<string, string[]>();
    for (const ans of input.answers) {
      submittedMap.set(ans.questionId, Array.from(new Set(ans.selectedOptionIds)));
    }

    let correctCount = 0;
    const feedback = quiz.questions.map((question) => {
      const validOptionIds = new Set(question.options.map((o) => o.id));
      const selected = (submittedMap.get(question.id) ?? []).filter((id) =>
        validOptionIds.has(id),
      );
      const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);

      let isCorrect = false;
      if (question.type === QuizQuestionType.SINGLE_CHOICE) {
        isCorrect = selected.length === 1 && correctIds.includes(selected[0]!);
      } else {
        // MULTI_CHOICE: khớp chính xác tập hợp đáp án đúng
        const selectedSet = new Set(selected);
        const correctSet = new Set(correctIds);
        isCorrect =
          selectedSet.size === correctSet.size &&
          Array.from(correctSet).every((cid) => selectedSet.has(cid));
      }

      if (isCorrect) correctCount++;

      return {
        questionId: question.id,
        isCorrect,
        selectedOptionIds: selected,
        correctOptionIds: correctIds,
        explanationMd: question.explanationMd,
      };
    });

    const totalQuestions = quiz.questions.length;
    const scorePercent = Number(((correctCount / totalQuestions) * 100).toFixed(2));
    const passed = scorePercent >= quiz.passScorePercent;

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId: quiz.id,
        userId: user.id,
        scorePercent,
        correctCount,
        totalQuestions,
        passed,
        submittedAnswersJson: input.answers as unknown as Prisma.InputJsonValue,
      },
    });

    let enrollmentProgress = null;
    if (passed) {
      enrollmentProgress = await this.learningService.completeLessonFromQuiz(
        user.id,
        enrollment?.id ?? null,
        course.id,
        lesson.id,
      );
    }

    return {
      attempt: {
        id: attempt.id,
        scorePercent,
        correctCount,
        totalQuestions,
        passScorePercent: quiz.passScorePercent,
        passed,
        submittedAt: attempt.submittedAt,
      },
      feedback,
      enrollmentProgress,
      certificate: enrollmentProgress?.certificate ?? null,
    };
  }
}
