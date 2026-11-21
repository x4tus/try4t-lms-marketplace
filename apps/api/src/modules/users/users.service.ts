import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InstructorApplicationStatus as PrismaAppStatus,
  Prisma,
  Role as PrismaRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type {
  AdminUpdateUserInput,
  AuthUser,
  BecomeInstructorInput,
  ChangePasswordInput,
  PaginatedResult,
  ReviewInstructorApplicationInput,
  Role,
  UpdateProfileInput,
} from '@try4t/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { mapAuthUser } from '../auth/auth.service';

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  headline: true,
  bio: true,
  themeConfig: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
  instructorProfile: {
    select: {
      applicationStatus: true,
      phone: true,
      yearsOfExperience: true,
      expertiseTopics: true,
      portfolioUrl: true,
      demoVideoUrl: true,
      teachingPlan: true,
      reviewNote: true,
      submittedAt: true,
      reviewedAt: true,
      bankName: true,
      bankAccountNo: true,
      bankAccountName: true,
      platformFeeRate: true,
      totalStudents: true,
      ratingAvg: true,
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly defaultFeeRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    configService: ConfigService,
  ) {
    this.defaultFeeRate = configService.get<number>('PLATFORM_DEFAULT_FEE_RATE') ?? 0.3;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true, themeConfig: true },
    });

    // Merge themeConfig sâu để không bị ghi đè mất các cài đặt riêng tư/học tập khi chỉ đổi màu
    let nextThemeConfig: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined = undefined;
    if (input.themeConfig !== undefined) {
      if (input.themeConfig === null) {
        nextThemeConfig = Prisma.DbNull;
      } else {
        const prev =
          existing?.themeConfig && typeof existing.themeConfig === 'object'
            ? (existing.themeConfig as Record<string, unknown>)
            : {};
        nextThemeConfig = {
          ...prev,
          ...input.themeConfig,
          ...(input.themeConfig.privacy
            ? {
                privacy: {
                  ...((prev.privacy as Record<string, unknown> | undefined) ?? {}),
                  ...input.themeConfig.privacy,
                },
              }
            : {}),
          ...(input.themeConfig.learning
            ? {
                learning: {
                  ...((prev.learning as Record<string, unknown> | undefined) ?? {}),
                  ...input.themeConfig.learning,
                },
              }
            : {}),
          ...(input.themeConfig.notifications
            ? {
                notifications: {
                  ...((prev.notifications as Record<string, unknown> | undefined) ?? {}),
                  ...input.themeConfig.notifications,
                },
              }
            : {}),
        } as Prisma.InputJsonValue;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.headline !== undefined ? { headline: input.headline } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(nextThemeConfig !== undefined ? { themeConfig: nextThemeConfig } : {}),
      },
      select: userSelect,
    });

    if (
      input.avatarUrl !== undefined &&
      existing?.avatarUrl &&
      existing.avatarUrl !== input.avatarUrl
    ) {
      void this.storage.deleteAsset(existing.avatarUrl);
    }

    return mapAuthUser(updated);
  }

  async getAccountSecurity(userId: string) {
    const [user, oauthAccounts, activeSessionsCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, emailVerifiedAt: true, email: true, createdAt: true },
      }),
      this.prisma.oAuthAccount.findMany({
        where: { userId },
        select: { provider: true, email: true, createdAt: true },
      }),
      this.prisma.refreshToken.count({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    return {
      hasPassword: Boolean(user.passwordHash),
      emailVerified: Boolean(user.emailVerifiedAt),
      email: user.email,
      createdAt: user.createdAt,
      connectedProviders: oauthAccounts,
      activeSessionsCount,
    };
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    if (user.passwordHash) {
      if (!input.currentPassword || input.currentPassword.length === 0) {
        throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại');
      }
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new BadRequestException('Mật khẩu hiện tại không chính xác');
      }
      if (input.currentPassword === input.newPassword) {
        throw new BadRequestException('Mật khẩu mới không được trùng mật khẩu cũ');
      }
    }

    const nextHash = await bcrypt.hash(input.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nextHash },
    });

    return { updated: true, hadPasswordBefore: Boolean(user.passwordHash) };
  }

  async submitInstructorApplication(
    userId: string,
    input: BecomeInstructorInput,
  ): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        instructorProfile: { select: { applicationStatus: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    if (
      existing.role === PrismaRole.INSTRUCTOR &&
      existing.instructorProfile?.applicationStatus === PrismaAppStatus.APPROVED
    ) {
      throw new BadRequestException('Tài khoản của bạn đã là Giảng viên được phê duyệt');
    }

    const nextStatus =
      existing.role === PrismaRole.ADMIN ? PrismaAppStatus.APPROVED : PrismaAppStatus.PENDING;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        headline: input.headline,
        bio: input.bio,
        instructorProfile: {
          upsert: {
            create: {
              applicationStatus: nextStatus,
              phone: input.phone,
              yearsOfExperience: input.yearsOfExperience,
              expertiseTopics: input.expertiseTopics as Prisma.InputJsonValue,
              portfolioUrl: input.portfolioUrl ?? null,
              demoVideoUrl: input.demoVideoUrl ?? null,
              teachingPlan: input.teachingPlan,
              bankName: input.bankName,
              bankAccountNo: input.bankAccountNo,
              bankAccountName: input.bankAccountName,
              platformFeeRate: this.defaultFeeRate,
              submittedAt: new Date(),
              reviewNote: null,
            },
            update: {
              applicationStatus: nextStatus,
              phone: input.phone,
              yearsOfExperience: input.yearsOfExperience,
              expertiseTopics: input.expertiseTopics as Prisma.InputJsonValue,
              portfolioUrl: input.portfolioUrl ?? null,
              demoVideoUrl: input.demoVideoUrl ?? null,
              teachingPlan: input.teachingPlan,
              bankName: input.bankName,
              bankAccountNo: input.bankAccountNo,
              bankAccountName: input.bankAccountName,
              submittedAt: new Date(),
              reviewNote: null,
            },
          },
        },
      },
      select: userSelect,
    });

    return mapAuthUser(updated);
  }

  async adminListInstructorApplications(status?: PrismaAppStatus) {
    const [profiles, countsRaw] = await Promise.all([
      this.prisma.instructorProfile.findMany({
        where: status ? { applicationStatus: status } : undefined,
        orderBy: [{ submittedAt: 'desc' }],
        include: {
          user: { select: userSelect },
        },
      }),
      this.prisma.instructorProfile.groupBy({
        by: ['applicationStatus'],
        _count: { userId: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    for (const row of countsRaw) {
      statusCounts[row.applicationStatus] = row._count.userId;
    }

    return {
      statusCounts,
      items: profiles.map((p) => mapAuthUser(p.user)),
    };
  }

  async adminDecideInstructorApplication(
    adminId: string,
    applicantUserId: string,
    input: ReviewInstructorApplicationInput,
  ): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({
      where: { id: applicantUserId },
      include: { instructorProfile: true },
    });

    if (!existing || !existing.instructorProfile) {
      throw new NotFoundException('Không tìm thấy hồ sơ đăng ký giảng viên này');
    }

    const isApprove = input.action === 'APPROVE';
    const nextStatus = isApprove ? PrismaAppStatus.APPROVED : PrismaAppStatus.REJECTED;

    const updated = await this.prisma.user.update({
      where: { id: applicantUserId },
      data: {
        ...(isApprove && existing.role !== PrismaRole.ADMIN
          ? { role: PrismaRole.INSTRUCTOR }
          : {}),
        instructorProfile: {
          update: {
            applicationStatus: nextStatus,
            reviewedByAdminId: adminId,
            reviewedAt: new Date(),
            reviewNote:
              input.note?.trim() ||
              (isApprove
                ? 'Hồ sơ đạt chuẩn chuyên môn. Chào mừng bạn trở thành Giảng viên Try4T!'
                : 'Hồ sơ chưa đáp ứng đủ thông tin yêu cầu.'),
          },
        },
      },
      select: userSelect,
    });

    return mapAuthUser(updated);
  }

  async adminListUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: Role;
  }): Promise<PaginatedResult<AuthUser>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role as PrismaRole } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map(mapAuthUser),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async adminUpdateUser(
    adminId: string,
    targetUserId: string,
    input: AdminUpdateUserInput,
  ): Promise<AuthUser> {
    if (adminId === targetUserId && input.isActive === false) {
      throw new BadRequestException('Không thể tự khóa tài khoản quản trị của chính bạn');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, instructorProfile: { select: { userId: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(input.role ? { role: input.role as PrismaRole } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.role === 'INSTRUCTOR' && !existing.instructorProfile
          ? {
              instructorProfile: {
                create: {
                  applicationStatus: PrismaAppStatus.APPROVED,
                  platformFeeRate: this.defaultFeeRate,
                },
              },
            }
          : {}),
      },
      select: userSelect,
    });

    if (input.isActive === false) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return mapAuthUser(updated);
  }
}
