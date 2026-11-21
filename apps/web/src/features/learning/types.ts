import type {
  CourseProgressionConfig,
  CourseStatus,
  LessonType,
  LessonVersionSnapshot,
} from '@try4t/shared';

export interface LearningRoomData {
  course: {
    id: string;
    slug: string;
    title: string;
    status?: CourseStatus;
    sequentialLockEnabled: boolean;
    minWatchPercent: number;
    progressionConfig?: CourseProgressionConfig;
    totalLessons: number;
    totalDurationSec: number;
    instructor: {
      id: string;
      fullName: string;
      avatarUrl: string | null;
      headline: string | null;
    };
  };
  isStaffPreview: boolean;
  enrollment: {
    id: string | null;
    progressPercent: number;
    completedLessonsCount: number;
    lastLessonId: string | null;
    enrolledAt: string;
    completedAt: string | null;
    isCertifiedCompleted?: boolean;
    bonusLessonsRemaining?: number;
  };
  initialLessonId: string | null;
  sections: Array<{
    id: string;
    title: string;
    sortOrder: number;
    isUnlocked?: boolean;
    lockedMessage?: string | null;
    lessons: Array<{
      id: string;
      title: string;
      type: LessonType;
      sortOrder: number;
      videoDurationSec: number;
      isUnlocked: boolean;
      lockedMessage?: string | null;
      isCompleted: boolean;
      lastPositionSec: number;
      uniqueWatchedSec: number;
      watchedPercent: number;
      versionCount?: number;
      quizMeta: {
        passScorePercent: number;
        timeLimitSec: number | null;
        questionsCount: number;
      } | null;
    }>;
  }>;
  certificate: {
    certCode: string;
    issuedAt: string;
    verifyPath: string;
    pdfPath: string;
  } | null;
  myReview: {
    id: string;
    rating: number;
    comment: string;
    instructorReply: string | null;
    repliedAt: string | null;
    updatedAt: string;
  } | null;
}

export interface LessonVersionView extends LessonVersionSnapshot {
  playbackUrl?: string | null;
}

export interface LessonContentData {
  id: string;
  courseId: string;
  sectionTitle: string;
  title: string;
  type: LessonType;
  videoDurationSec: number;
  minWatchPercent: number;
  progressionConfig?: CourseProgressionConfig;
  playbackUrl: string | null;
  articleMd: string | null;
  resources: Array<{ title?: string; url?: string }>;
  versions?: LessonVersionView[];
  progress: {
    lastPositionSec: number;
    uniqueWatchedSec: number;
    watchedPercent: number;
    maxReachedSec?: number;
    isCompleted: boolean;
    completedAt: string | null;
  };
  navigation: {
    previousLesson: { id: string; title: string } | null;
    nextLesson: { id: string; title: string; isUnlocked: boolean } | null;
  };
}

export interface HeartbeatResponse {
  acceptedSegment: boolean;
  cheatDetected: boolean;
  reason: string | null;
  lastPositionSec: number;
  uniqueWatchedSec: number;
  watchedPercent: number;
  maxReachedSec?: number;
  minWatchPercent?: number;
  isCompleted: boolean;
  justCompleted?: boolean;
  enrollmentProgress: {
    progressPercent: number;
    completedLessonsCount: number;
    totalLessons: number;
    certificate: {
      certCode: string;
      verifyPath: string;
      pdfPath: string;
      issuedAt: string;
    } | null;
  } | null;
  certificate: {
    certCode: string;
    verifyPath: string;
    pdfPath: string;
    issuedAt: string;
  } | null;
}

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  pause: () => void;
  seekTo: (seconds: number) => void;
}
