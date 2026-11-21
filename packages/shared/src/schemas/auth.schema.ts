import { z } from 'zod';
import { Role } from '../enums';

const passwordRules = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự')
  .regex(
    /^(?=.*[A-Za-z])(?=.*\d).+$/,
    'Mật khẩu phải chứa ít nhất 1 chữ cái và 1 chữ số',
  );

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Họ tên tối thiểu 2 ký tự')
      .max(80, 'Họ tên tối đa 80 ký tự'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Email không đúng định dạng'),
    password: passwordRules,
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu'),
    role: z
      .enum([Role.STUDENT, Role.INSTRUCTOR])
      .optional()
      .default(Role.STUDENT),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không đúng định dạng'),
  code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm đúng 6 chữ số'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không đúng định dạng'),
  purpose: z.enum(['REGISTER_VERIFY', 'RESET_PASSWORD']).default('REGISTER_VERIFY'),
});

export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không đúng định dạng'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Email không đúng định dạng'),
    code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm đúng 6 chữ số'),
    newPassword: passwordRules,
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu mới'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email không đúng định dạng'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export type LoginInput = z.infer<typeof loginSchema>;

const hexColorRegex = /^#([0-9a-fA-F]{6})$/;

export const themeConfigSchema = z.object({
  accentColor: z.string().regex(hexColorRegex, 'Mã màu nhấn không hợp lệ').nullable().optional(),
  backgroundColor: z.string().regex(hexColorRegex, 'Mã màu nền không hợp lệ').nullable().optional(),
  lightBackground: z
    .string()
    .regex(hexColorRegex, 'Mã màu nền sáng không hợp lệ')
    .nullable()
    .optional(),
  darkBackground: z
    .string()
    .regex(hexColorRegex, 'Mã màu nền tối không hợp lệ')
    .nullable()
    .optional(),
  mode: z.enum(['light', 'dark', 'system']).optional(),
  density: z.enum(['compact', 'comfortable', 'spacious']).optional(),
  fontScale: z.enum(['sm', 'md', 'lg']).optional(),
  reducedMotion: z.boolean().optional(),
  privacy: z
    .object({
      showPublicProfile: z.boolean().optional(),
      showLearningActivity: z.boolean().optional(),
      showCertificatesOnProfile: z.boolean().optional(),
    })
    .optional(),
  learning: z
    .object({
      defaultPlaybackSpeed: z.coerce.number().min(0.75).max(2).optional(),
      autoPlayNextLesson: z.boolean().optional(),
      theaterModeDefault: z.boolean().optional(),
    })
    .optional(),
  notifications: z
    .object({
      emailCourseUpdates: z.boolean().optional(),
      emailQaReplies: z.boolean().optional(),
      emailMarketing: z.boolean().optional(),
    })
    .optional(),
});

export type ThemeConfigInput = z.infer<typeof themeConfigSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional().default(''),
    newPassword: passwordRules,
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu mới'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Họ tên tối thiểu 2 ký tự')
    .max(80, 'Họ tên tối đa 80 ký tự')
    .optional(),
  headline: z.string().trim().max(120, 'Chức danh tối đa 120 ký tự').optional().nullable(),
  bio: z.string().trim().max(1000, 'Giới thiệu tối đa 1000 ký tự').optional().nullable(),
  avatarUrl: z.string().url('URL ảnh đại diện không hợp lệ').optional().nullable(),
  themeConfig: themeConfigSchema.nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => v === '' || /^https?:\/\/.+/.test(v), 'Đường dẫn phải bắt đầu bằng https://')
  .transform((v) => (v === '' ? null : v))
  .optional()
  .nullable();

export const becomeInstructorSchema = z.object({
  headline: z
    .string()
    .trim()
    .min(5, 'Chức danh / chuyên môn tối thiểu 5 ký tự')
    .max(120, 'Chức danh / chuyên môn tối đa 120 ký tự'),
  bio: z
    .string()
    .trim()
    .min(30, 'Giới thiệu kinh nghiệm tối thiểu 30 ký tự để Admin có cơ sở duyệt')
    .max(1500, 'Giới thiệu tối đa 1500 ký tự'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{9,15}$/, 'Số điện thoại không hợp lệ (9–15 chữ số)'),
  yearsOfExperience: z.coerce
    .number()
    .int('Số năm kinh nghiệm phải là số nguyên')
    .min(0, 'Số năm kinh nghiệm không được âm')
    .max(50, 'Số năm kinh nghiệm tối đa 50'),
  expertiseTopics: z
    .array(z.string().trim().min(1).max(40))
    .min(1, 'Chọn hoặc nhập ít nhất 1 lĩnh vực giảng dạy')
    .max(8, 'Tối đa 8 lĩnh vực'),
  portfolioUrl: optionalUrl,
  demoVideoUrl: optionalUrl,
  teachingPlan: z
    .string()
    .trim()
    .min(30, 'Kế hoạch khóa học dự kiến tối thiểu 30 ký tự')
    .max(2000, 'Kế hoạch giảng dạy tối đa 2000 ký tự'),
  bankName: z.string().trim().min(2, 'Vui lòng nhập tên ngân hàng').max(80),
  bankAccountNo: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{6,30}$/, 'Số tài khoản gồm 6–30 ký tự (không chứa khoảng trắng)'),
  bankAccountName: z
    .string()
    .trim()
    .min(2, 'Vui lòng nhập tên chủ tài khoản')
    .max(80),
});

export type BecomeInstructorInput = z.infer<typeof becomeInstructorSchema>;

export const reviewInstructorApplicationSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (data) => data.action === 'APPROVE' || (data.note && data.note.trim().length >= 5),
    {
      message: 'Vui lòng nhập lý do từ chối tối thiểu 5 ký tự để học viên bổ sung hồ sơ',
      path: ['note'],
    },
  );

export type ReviewInstructorApplicationInput = z.infer<
  typeof reviewInstructorApplicationSchema
>;

export const adminUpdateUserSchema = z.object({
  role: z.enum([Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN]).optional(),
  isActive: z.boolean().optional(),
});

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
