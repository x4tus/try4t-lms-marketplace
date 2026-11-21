import type { InstructorApplicationStatus, Role } from '../enums';

export interface InstructorProfileDto {
  applicationStatus: InstructorApplicationStatus;
  phone: string | null;
  yearsOfExperience: number | null;
  expertiseTopics: string[];
  portfolioUrl: string | null;
  demoVideoUrl: string | null;
  teachingPlan: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  platformFeeRate: number;
  totalStudents: number;
  ratingAvg: number;
}

export interface ThemeConfig {
  accentColor?: string | null;
  backgroundColor?: string | null;
  lightBackground?: string | null;
  darkBackground?: string | null;
  mode?: 'light' | 'dark' | 'system';
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
  headline: string | null;
  bio: string | null;
  isActive: boolean;
  themeConfig: ThemeConfig | null;
  createdAt: string;
  instructorProfile?: InstructorProfileDto | null;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface OtpChallengeResponse {
  requiresEmailVerification: boolean;
  email: string;
  cooldownSeconds: number;
  expiresInMinutes: number;
  deliveryChannel: 'smtp' | 'resend' | 'dev';
  devOtpHint?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  code?: string;
  message: string;
  errors?: Record<string, string[]>;
  meta?: Record<string, unknown>;
  path: string;
  timestamp: string;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
