import { z } from 'zod';
import { CourseLevel, LessonType, QuizQuestionType } from '../enums';

export const createCourseSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, 'Tiêu đề khóa học tối thiểu 5 ký tự')
      .max(140, 'Tiêu đề khóa học tối đa 140 ký tự'),
    subtitle: z.string().trim().max(240, 'Mô tả ngắn tối đa 240 ký tự').optional().nullable(),
    categoryId: z.string().uuid('Danh mục không hợp lệ').optional().nullable(),
    level: z
      .enum([CourseLevel.BEGINNER, CourseLevel.INTERMEDIATE, CourseLevel.ADVANCED, CourseLevel.ALL])
      .default(CourseLevel.ALL),
    priceVnd: z.coerce.number().int().min(0, 'Giá không được âm').max(50_000_000).default(0),
    salePriceVnd: z.coerce
      .number()
      .int()
      .min(0, 'Giá khuyến mãi không được âm')
      .max(50_000_000)
      .optional()
      .nullable(),
    descriptionMd: z.string().max(20_000).optional().nullable(),
    sequentialLockEnabled: z.boolean().default(false),
    minWatchPercent: z.coerce.number().int().min(50).max(100).default(80),
  })
  .refine(
    (data) =>
      data.salePriceVnd === undefined ||
      data.salePriceVnd === null ||
      data.salePriceVnd <= data.priceVnd,
    {
      message: 'Giá khuyến mãi không được lớn hơn giá gốc',
      path: ['salePriceVnd'],
    },
  );

export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z
  .object({
    title: z.string().trim().min(5, 'Tiêu đề tối thiểu 5 ký tự').max(140).optional(),
    subtitle: z.string().trim().max(240).optional().nullable(),
    categoryId: z.string().uuid('Danh mục không hợp lệ').optional().nullable(),
    level: z
      .enum([CourseLevel.BEGINNER, CourseLevel.INTERMEDIATE, CourseLevel.ADVANCED, CourseLevel.ALL])
      .optional(),
    priceVnd: z.coerce.number().int().min(0).max(50_000_000).optional(),
    salePriceVnd: z.coerce.number().int().min(0).max(50_000_000).optional().nullable(),
    descriptionMd: z.string().max(20_000).optional().nullable(),
    thumbnailUrl: z.string().url('URL ảnh bìa không hợp lệ').optional().nullable(),
    promoVideoKey: z.string().trim().max(500).optional().nullable(),
    sequentialLockEnabled: z.boolean().optional(),
    minWatchPercent: z.coerce.number().int().min(50).max(100).optional(),
  })
  .refine(
    (data) =>
      data.priceVnd === undefined ||
      data.salePriceVnd === undefined ||
      data.salePriceVnd === null ||
      data.salePriceVnd <= data.priceVnd,
    {
      message: 'Giá khuyến mãi không được lớn hơn giá gốc',
      path: ['salePriceVnd'],
    },
  );

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const upsertSectionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Tên chương tối thiểu 2 ký tự')
    .max(140, 'Tên chương tối đa 140 ký tự'),
});

export type UpsertSectionInput = z.infer<typeof upsertSectionSchema>;

export const lessonResourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url(),
});

export const createLessonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Tên bài học tối thiểu 2 ký tự')
    .max(160, 'Tên bài học tối đa 160 ký tự'),
  type: z.enum([LessonType.VIDEO, LessonType.ARTICLE, LessonType.QUIZ]).default(LessonType.VIDEO),
  isFreePreview: z.boolean().default(false),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  type: z.enum([LessonType.VIDEO, LessonType.ARTICLE, LessonType.QUIZ]).optional(),
  isFreePreview: z.boolean().optional(),
  videoStorageKey: z.string().trim().max(1000).optional().nullable(),
  videoDurationSec: z.coerce.number().int().min(0).max(86_400).optional(),
  articleMd: z.string().max(100_000).optional().nullable(),
  resourcesJson: z.array(lessonResourceSchema).max(20).optional(),
});

export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;

export const reorderCurriculumSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
        lessons: z.array(
          z.object({
            id: z.string().uuid(),
            sortOrder: z.number().int().min(0),
          }),
        ),
      }),
    )
    .min(1),
});

export type ReorderCurriculumInput = z.infer<typeof reorderCurriculumSchema>;

export const upsertQuizSchema = z.object({
  passScorePercent: z.coerce.number().int().min(10).max(100).default(70),
  timeLimitSec: z.coerce.number().int().min(30).max(10_800).optional().nullable(),
  shuffleQuestions: z.boolean().default(false),
  questions: z
    .array(
      z.object({
        promptMd: z.string().trim().min(3, 'Nội dung câu hỏi tối thiểu 3 ký tự').max(4000),
        type: z
          .enum([QuizQuestionType.SINGLE_CHOICE, QuizQuestionType.MULTI_CHOICE])
          .default(QuizQuestionType.SINGLE_CHOICE),
        explanationMd: z.string().trim().max(4000).optional().nullable(),
        options: z
          .array(
            z.object({
              content: z.string().trim().min(1, 'Đáp án không được để trống').max(1000),
              isCorrect: z.boolean(),
            }),
          )
          .min(2, 'Mỗi câu hỏi cần ít nhất 2 lựa chọn')
          .max(8)
          .refine((opts) => opts.some((o) => o.isCorrect), {
            message: 'Mỗi câu hỏi phải có ít nhất 1 đáp án đúng',
          }),
      }),
    )
    .min(1, 'Quiz phải có ít nhất 1 câu hỏi')
    .max(100),
});

export type UpsertQuizInput = z.infer<typeof upsertQuizSchema>;

export const moderateCourseSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (data) => data.action === 'APPROVE' || (data.note && data.note.trim().length >= 5),
    {
      message: 'Vui lòng nhập lý do từ chối tối thiểu 5 ký tự để giảng viên chỉnh sửa',
      path: ['note'],
    },
  );

export type ModerateCourseInput = z.infer<typeof moderateCourseSchema>;

export const upsertCategorySchema = z.object({
  name: z.string().trim().min(2, 'Tên danh mục tối thiểu 2 ký tự').max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang')
    .optional(),
  icon: z.string().trim().max(40).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type UpsertCategoryInput = z.infer<typeof upsertCategorySchema>;

export const presignMediaSchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(120),
  fileSizeBytes: z.coerce.number().int().positive(),
});

export type PresignMediaInput = z.infer<typeof presignMediaSchema>;
