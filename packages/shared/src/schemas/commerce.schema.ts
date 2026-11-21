import { z } from 'zod';
import { DiscountType, PaymentMethod } from '../enums';

export const cartCourseIdSchema = z.object({
  courseId: z.string().uuid('Mã khóa học không hợp lệ'),
});

export const syncCartSchema = z.object({
  courseIds: z.array(z.string().uuid()).max(30),
});

export type SyncCartInput = z.infer<typeof syncCartSchema>;

export const validateCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Mã giảm giá tối thiểu 2 ký tự')
    .max(32, 'Mã giảm giá tối đa 32 ký tự'),
  courseIds: z.array(z.string().uuid()).min(1, 'Giỏ hàng không được trống').max(20),
});

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;

export const createOrderSchema = z.object({
  courseIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất 1 khóa học').max(20),
  couponCode: z.string().trim().toUpperCase().max(32).optional().nullable(),
  paymentMethod: z.enum([PaymentMethod.VIETQR, PaymentMethod.SANDBOX]).default(PaymentMethod.SANDBOX),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const sandboxPaySchema = z.object({
  outcome: z.enum(['SUCCEED', 'FAIL', 'EXPIRE']).default('SUCCEED'),
});

export type SandboxPayInput = z.infer<typeof sandboxPaySchema>;

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, 'Mã Coupon gồm 3–24 ký tự chữ hoa, số, _ hoặc -'),
    courseId: z.string().uuid().optional().nullable(),
    discountType: z.enum([DiscountType.PERCENT, DiscountType.FIXED_AMOUNT]),
    discountValue: z.coerce.number().int().positive('Giá trị giảm phải lớn hơn 0'),
    maxDiscountVnd: z.coerce.number().int().positive().optional().nullable(),
    usageLimit: z.coerce.number().int().positive().max(100_000).optional().nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (d) => d.discountType !== DiscountType.PERCENT || d.discountValue <= 100,
    { message: 'Giảm theo % không được vượt quá 100%', path: ['discountValue'] },
  )
  .refine(
    (d) => !d.startsAt || !d.expiresAt || new Date(d.expiresAt) > new Date(d.startsAt),
    { message: 'Thời gian hết hạn phải sau thời gian bắt đầu', path: ['expiresAt'] },
  );

export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const toggleCouponSchema = z.object({
  isActive: z.boolean(),
});

export type ToggleCouponInput = z.infer<typeof toggleCouponSchema>;
