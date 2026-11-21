import type {
  CourseLevel,
  CourseProgressionConfig,
  CourseStatus,
  LessonType,
  QuizQuestionType,
} from '@try4t/shared';

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  _count?: { courses: number };
}

export interface ReviewLogItem {
  id: string;
  fromStatus: CourseStatus;
  toStatus: CourseStatus;
  note: string | null;
  createdAt: string;
  actor?: {
    id: string;
    fullName: string;
    role: string;
  };
}

export interface QuizOptionItem {
  id?: string;
  content: string;
  isCorrect: boolean;
  sortOrder?: number;
}

export interface QuizQuestionItem {
  id?: string;
  promptMd: string;
  type: QuizQuestionType;
  explanationMd: string | null;
  sortOrder?: number;
  options: QuizOptionItem[];
}

export interface BuilderQuiz {
  id: string;
  lessonId: string;
  passScorePercent: number;
  timeLimitSec: number | null;
  shuffleQuestions: boolean;
  questions: QuizQuestionItem[];
}

export interface BuilderLesson {
  id: string;
  sectionId: string;
  courseId: string;
  title: string;
  type: LessonType;
  sortOrder: number;
  isFreePreview: boolean;
  videoStorageKey: string | null;
  playbackUrl?: string | null;
  videoDurationSec: number;
  articleMd: string | null;
  resourcesJson: Array<{ name: string; url: string }>;
  versionCount?: number;
  quiz?: BuilderQuiz | null;
}

export interface BuilderSection {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  lessons: BuilderLesson[];
}

export interface InstructorCourseSummary {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  level: CourseLevel;
  priceVnd: number;
  salePriceVnd: number | null;
  status: CourseStatus;
  totalDurationSec: number;
  totalLessons: number;
  enrollmentCount: number;
  ratingAvg: number;
  updatedAt: string;
  publishedAt: string | null;
  category: { id: string; name: string; slug?: string } | null;
  instructor: { id: string; fullName: string; email: string };
  latestReviewLog: ReviewLogItem | null;
  _count: {
    sections: number;
    lessons: number;
    enrollments: number;
  };
}

export interface BuilderCourse extends Omit<InstructorCourseSummary, 'latestReviewLog' | '_count'> {
  categoryId: string | null;
  descriptionMd: string | null;
  promoVideoKey: string | null;
  sequentialLockEnabled: boolean;
  minWatchPercent: number;
  progressionConfig?: CourseProgressionConfig;
  enrolledStudentsCount?: number;
  sections: BuilderSection[];
  reviewLogs: ReviewLogItem[];
}

export interface MediaStatus {
  cloudinaryConfigured: boolean;
  r2Configured: boolean;
  imageProvider: 'cloudinary' | 'r2';
  videoProvider: 'r2' | 'cloudinary';
}
