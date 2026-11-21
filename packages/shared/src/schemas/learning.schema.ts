import { z } from 'zod';

export const videoHeartbeatSchema = z.object({
  currentSec: z.coerce.number().min(0).max(86_400),
  fromSec: z.coerce.number().min(0).max(86_400),
  toSec: z.coerce.number().min(0).max(86_400),
  playbackRate: z.coerce.number().min(0.5).max(2.5).default(1),
});

export type VideoHeartbeatInput = z.infer<typeof videoHeartbeatSchema>;

export const createNoteSchema = z.object({
  timestampSec: z.coerce.number().int().min(0).max(86_400).default(0),
  content: z
    .string()
    .trim()
    .min(1, 'Nội dung ghi chú không được để trống')
    .max(3000, 'Ghi chú tối đa 3000 ký tự'),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Nội dung ghi chú không được để trống')
    .max(3000, 'Ghi chú tối đa 3000 ký tự'),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const createQuestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Tiêu đề câu hỏi tối thiểu 5 ký tự')
    .max(180, 'Tiêu đề tối đa 180 ký tự'),
  contentMd: z
    .string()
    .trim()
    .min(10, 'Mô tả câu hỏi tối thiểu 10 ký tự')
    .max(5000, 'Mô tả tối đa 5000 ký tự'),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const createAnswerSchema = z.object({
  contentMd: z
    .string()
    .trim()
    .min(2, 'Câu trả lời tối thiểu 2 ký tự')
    .max(5000, 'Câu trả lời tối đa 5000 ký tự'),
});

export type CreateAnswerInput = z.infer<typeof createAnswerSchema>;

export const submitQuizAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedOptionIds: z.array(z.string().uuid()),
      }),
    )
    .min(1, 'Vui lòng chọn ít nhất 1 câu trả lời'),
});

export type SubmitQuizAttemptInput = z.infer<typeof submitQuizAttemptSchema>;

export const upsertReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Đánh giá từ 1 đến 5 sao').max(5),
  comment: z
    .string()
    .trim()
    .min(10, 'Nhận xét tối thiểu 10 ký tự để giúp các học viên khác')
    .max(2000, 'Nhận xét tối đa 2000 ký tự'),
});

export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;

export const replyReviewSchema = z.object({
  reply: z
    .string()
    .trim()
    .min(5, 'Phản hồi tối thiểu 5 ký tự')
    .max(1500, 'Phản hồi tối đa 1500 ký tự'),
});

export type ReplyReviewInput = z.infer<typeof replyReviewSchema>;
