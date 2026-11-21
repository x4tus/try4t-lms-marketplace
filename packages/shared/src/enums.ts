export const Role = {
  STUDENT: 'STUDENT',
  INSTRUCTOR: 'INSTRUCTOR',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const CourseStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];

export const CourseLevel = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  ALL: 'ALL',
} as const;
export type CourseLevel = (typeof CourseLevel)[keyof typeof CourseLevel];

export const LessonType = {
  VIDEO: 'VIDEO',
  ARTICLE: 'ARTICLE',
  QUIZ: 'QUIZ',
} as const;
export type LessonType = (typeof LessonType)[keyof typeof LessonType];

export const QuizQuestionType = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTI_CHOICE: 'MULTI_CHOICE',
} as const;
export type QuizQuestionType =
  (typeof QuizQuestionType)[keyof typeof QuizQuestionType];

export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  VIETQR: 'VIETQR',
  SANDBOX: 'SANDBOX',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const DiscountType = {
  PERCENT: 'PERCENT',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const WalletTxType = {
  COURSE_SALE: 'COURSE_SALE',
  REFUND_DEBIT: 'REFUND_DEBIT',
  PAYOUT_DEBIT: 'PAYOUT_DEBIT',
} as const;
export type WalletTxType = (typeof WalletTxType)[keyof typeof WalletTxType];

export const PayoutStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export const InstructorApplicationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type InstructorApplicationStatus =
  (typeof InstructorApplicationStatus)[keyof typeof InstructorApplicationStatus];
