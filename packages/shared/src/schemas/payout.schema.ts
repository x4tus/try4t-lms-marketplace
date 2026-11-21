import { z } from 'zod';

export const createPayoutRequestSchema = z.object({
  amountVnd: z.coerce
    .number()
    .int('Số tiền rút phải là số nguyên')
    .min(100_000, 'Số tiền rút tối thiểu là 100.000 ₫')
    .max(500_000_000, 'Số tiền rút vượt quá hạn mức mỗi lệnh'),
});

export type CreatePayoutRequestInput = z.infer<typeof createPayoutRequestSchema>;

export const decidePayoutSchema = z
  .object({
    action: z.enum(['PAID', 'REJECTED']),
    adminNote: z.string().trim().max(1000).optional().nullable(),
    transferProofUrl: z
      .string()
      .trim()
      .refine((v) => v === '' || /^https?:\/\/.+/.test(v), 'URL chứng từ không hợp lệ')
      .transform((v) => (v === '' ? null : v))
      .optional()
      .nullable(),
  })
  .refine(
    (d) => d.action === 'PAID' || (d.adminNote && d.adminNote.trim().length >= 5),
    {
      message: 'Vui lòng nhập lý do từ chối tối thiểu 5 ký tự',
      path: ['adminNote'],
    },
  );

export type DecidePayoutInput = z.infer<typeof decidePayoutSchema>;
