import type { CourseLevel, LessonType, QuizQuestionType } from '@try4t/shared';

export interface CatalogCourseCardItem {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  level: CourseLevel;
  priceVnd: number;
  salePriceVnd: number | null;
  sequentialLockEnabled: boolean;
  totalDurationSec: number;
  totalLessons: number;
  ratingAvg: number;
  ratingCount: number;
  enrollmentCount: number;
  publishedAt: string | null;
  category: { id: string; name: string; slug: string } | null;
  instructor: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    headline: string | null;
  };
  freePreviewCount: number;
  firstPreviewLesson: { id: string; title: string; type: LessonType } | null;
}

export interface CatalogLessonMeta {
  id: string;
  title: string;
  type: LessonType;
  sortOrder: number;
  isFreePreview: boolean;
  videoDurationSec: number;
  quizMeta: {
    passScorePercent: number;
    timeLimitSec: number | null;
    questionsCount: number;
  } | null;
}

export interface CatalogSectionMeta {
  id: string;
  title: string;
  sortOrder: number;
  totalDurationSec: number;
  lessons: CatalogLessonMeta[];
}

export interface CatalogCourseReview {
  id: string;
  rating: number;
  comment: string;
  instructorReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface CatalogCourseDetail {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  descriptionMd: string | null;
  thumbnailUrl: string | null;
  level: CourseLevel;
  priceVnd: number;
  salePriceVnd: number | null;
  sequentialLockEnabled: boolean;
  minWatchPercent: number;
  totalDurationSec: number;
  totalLessons: number;
  ratingAvg: number;
  ratingCount: number;
  enrollmentCount: number;
  publishedAt: string | null;
  updatedAt: string;
  isEnrolled: boolean;
  category: { id: string; name: string; slug: string } | null;
  instructor: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    headline: string | null;
    bio: string | null;
    publishedCoursesCount: number;
    totalStudents: number;
    ratingAvg: number;
    yearsOfExperience: number | null;
    expertiseTopics: string[];
  };
  freePreviewLessons: Array<{
    id: string;
    title: string;
    type: LessonType;
    sectionTitle: string;
    videoDurationSec: number;
  }>;
  sections: CatalogSectionMeta[];
  reviews: CatalogCourseReview[];
}

export interface FreePreviewResponse {
  course: {
    id: string;
    title: string;
    slug: string;
    priceVnd: number;
    salePriceVnd: number | null;
  };
  lesson: {
    id: string;
    title: string;
    type: LessonType;
    sectionTitle: string;
    videoDurationSec: number;
    playbackUrl: string | null;
    articleMd: string | null;
    quiz: {
      id: string;
      passScorePercent: number;
      timeLimitSec: number | null;
      questions: Array<{
        id: string;
        promptMd: string;
        type: QuizQuestionType;
        options: Array<{ id: string; content: string }>;
      }>;
    } | null;
  };
  previewPlaylist: Array<{
    id: string;
    title: string;
    type: LessonType;
    videoDurationSec: number;
    sectionTitle: string;
  }>;
}
