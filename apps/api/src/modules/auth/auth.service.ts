import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OAuthProvider as PrismaOAuthProvider,
  OtpPurpose,
  Prisma,
  Role as PrismaRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import type {
  AuthResponse,
  AuthUser,
  ForgotPasswordInput,
  InstructorApplicationStatus,
  LoginInput,
  OtpChallengeResponse,
  RegisterInput,
  ResendOtpInput,
  ResetPasswordInput,
  Role,
  ThemeConfig,
  VerifyEmailInput,
} from '@try4t/shared';
import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export const REFRESH_COOKIE_NAME = 'try4t_refresh_token';

const OTP_EXPIRES_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SEC = 60;
const OTP_MAX_ATTEMPTS = 5;
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

const userWithProfileSelect = {
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

type UserWithProfile = Prisma.UserGetPayload<{ select: typeof userWithProfileSelect }>;

function parseDurationToSeconds(raw: string, fallbackSec: number): number {
  const match = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!match) return fallbackSec;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === 's') return value;
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  if (unit === 'd') return value * 86400;
  return fallbackSec;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function mapAuthUser(user: UserWithProfile): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role: user.role as Role,
    headline: user.headline,
    bio: user.bio,
    isActive: user.isActive,
    themeConfig: (user.themeConfig as ThemeConfig | null) ?? null,
    createdAt: user.createdAt.toISOString(),
    instructorProfile: user.instructorProfile
      ? {
          applicationStatus: user.instructorProfile
            .applicationStatus as InstructorApplicationStatus,
          phone: user.instructorProfile.phone,
          yearsOfExperience: user.instructorProfile.yearsOfExperience,
          expertiseTopics: Array.isArray(user.instructorProfile.expertiseTopics)
            ? (user.instructorProfile.expertiseTopics as string[])
            : [],
          portfolioUrl: user.instructorProfile.portfolioUrl,
          demoVideoUrl: user.instructorProfile.demoVideoUrl,
          teachingPlan: user.instructorProfile.teachingPlan,
          reviewNote: user.instructorProfile.reviewNote,
          submittedAt: user.instructorProfile.submittedAt?.toISOString() ?? null,
          reviewedAt: user.instructorProfile.reviewedAt?.toISOString() ?? null,
          bankName: user.instructorProfile.bankName,
          bankAccountNo: user.instructorProfile.bankAccountNo,
          bankAccountName: user.instructorProfile.bankAccountName,
          platformFeeRate: Number(user.instructorProfile.platformFeeRate),
          totalStudents: user.instructorProfile.totalStudents,
          ratingAvg: Number(user.instructorProfile.ratingAvg),
        }
      : null,
  };
}

interface OAuthTicketRecord {
  userId: string;
  provider: 'google' | 'github';
  isNewUser: boolean;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;
  private readonly defaultFeeRate: number;
  private readonly oauthTickets = new Map<string, OAuthTicketRecord>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    configService: ConfigService,
  ) {
    this.accessSecret = configService.get<string>('JWT_ACCESS_SECRET')!;
    this.refreshSecret = configService.get<string>('JWT_REFRESH_SECRET')!;
    this.accessTtlSec = parseDurationToSeconds(
      configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      900,
    );
    this.refreshTtlSec = parseDurationToSeconds(
      configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      604800,
    );
    this.defaultFeeRate = configService.get<number>('PLATFORM_DEFAULT_FEE_RATE') ?? 0.3;
  }

  getRefreshMaxAgeMs(): number {
    return this.refreshTtlSec * 1000;
  }

  async register(input: RegisterInput): Promise<OtpChallengeResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, emailVerifiedAt: true, fullName: true },
    });

    if (existing && existing.emailVerifiedAt) {
      throw new ConflictException('Email này đã được đăng ký tài khoản. Bạn hãy đăng nhập nhé.');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const targetRole =
      input.role === 'INSTRUCTOR' ? PrismaRole.INSTRUCTOR : PrismaRole.STUDENT;

    if (existing && !existing.emailVerifiedAt) {
      // Cho phep dang ky lai neu tai khoan cu chua xac thuc email
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: input.fullName,
          passwordHash,
          role: targetRole,
          ...(targetRole === PrismaRole.INSTRUCTOR
            ? {
                instructorProfile: {
                  upsert: {
                    create: { platformFeeRate: this.defaultFeeRate },
                    update: {},
                  },
                },
              }
            : {}),
        },
      });
    } else {
      await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: targetRole,
          emailVerifiedAt: null,
          ...(targetRole === PrismaRole.INSTRUCTOR
            ? {
                instructorProfile: {
                  create: { platformFeeRate: this.defaultFeeRate },
                },
              }
            : {}),
        },
      });
    }

    return this.createAndSendOtp(input.email, input.fullName, OtpPurpose.REGISTER_VERIFY);
  }

  async verifyEmail(
    input: VerifyEmailInput,
    meta: RequestMeta,
  ): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: userWithProfileSelect,
    });

    if (!user) {
      throw new BadRequestException('Không tìm thấy yêu cầu đăng ký cho email này');
    }

    if (user.emailVerifiedAt) {
      return this.issueTokenPair(user, meta);
    }

    await this.consumeValidOtp(input.email, OtpPurpose.REGISTER_VERIFY, input.code);

    const verifiedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      select: userWithProfileSelect,
    });

    return this.issueTokenPair(verifiedUser, meta);
  }

  async resendOtp(input: ResendOtpInput): Promise<OtpChallengeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, fullName: true, emailVerifiedAt: true, isActive: true },
    });

    if (!user) {
      throw new BadRequestException('Không tìm thấy tài khoản gắn với email này');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản đang bị tạm khóa');
    }

    if (input.purpose === 'REGISTER_VERIFY' && user.emailVerifiedAt) {
      throw new BadRequestException('Tài khoản này đã xác thực email rồi, bạn có thể đăng nhập ngay');
    }

    return this.createAndSendOtp(
      input.email,
      user.fullName,
      input.purpose === 'RESET_PASSWORD'
        ? OtpPurpose.RESET_PASSWORD
        : OtpPurpose.REGISTER_VERIFY,
    );
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<OtpChallengeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, fullName: true, isActive: true },
    });

    if (!user || !user.isActive) {
      // Khong tiet lo ton tai email o production, nhung van cho UX ro rang o dev
      return {
        requiresEmailVerification: true,
        email: input.email,
        cooldownSeconds: OTP_RESEND_COOLDOWN_SEC,
        expiresInMinutes: OTP_EXPIRES_MINUTES,
        deliveryChannel: 'dev',
      };
    }

    return this.createAndSendOtp(input.email, user.fullName, OtpPurpose.RESET_PASSWORD);
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ reset: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new BadRequestException('Không thể đặt lại mật khẩu cho tài khoản này');
    }

    await this.consumeValidOtp(input.email, OtpPurpose.RESET_PASSWORD, input.code);

    const passwordHash = await bcrypt.hash(input.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          emailVerifiedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      // Thu hoi toan bo phien cu tren moi thiet bi de bao mat
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { reset: true };
  }

  async login(
    input: LoginInput,
    meta: RequestMeta,
  ): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const userRecord = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        ...userWithProfileSelect,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!userRecord) {
      throw new UnauthorizedException('Email hoặc mật khẩu chưa chính xác');
    }

    if (!userRecord.isActive) {
      throw new UnauthorizedException(
        'Tài khoản của bạn đã bị tạm khóa bởi quản trị viên. Vui lòng liên hệ hỗ trợ.',
      );
    }

    // Anti-brute-force lock check
    if (userRecord.lockedUntil && userRecord.lockedUntil > new Date()) {
      const remainingSec = Math.ceil((userRecord.lockedUntil.getTime() - Date.now()) / 1000);
      const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: `Tài khoản tạm khóa bảo vệ do nhập sai quá ${LOGIN_MAX_FAILED_ATTEMPTS} lần. Thử lại sau ${remainingMin} phút hoặc dùng Quên mật khẩu.`,
          meta: { retryAfterSec: remainingSec },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!userRecord.passwordHash) {
      throw new UnauthorizedException(
        'Tài khoản này đăng ký qua Google/GitHub và chưa có mật khẩu. Hãy đăng nhập bằng Google/GitHub hoặc chọn "Quên mật khẩu" để tạo mật khẩu mới.',
      );
    }

    const isPasswordValid = await bcrypt.compare(input.password, userRecord.passwordHash);
    if (!isPasswordValid) {
      const nextFailed = userRecord.failedLoginAttempts + 1;
      const shouldLock = nextFailed >= LOGIN_MAX_FAILED_ATTEMPTS;

      await this.prisma.user.update({
        where: { id: userRecord.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : nextFailed,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000)
            : null,
        },
      });

      if (shouldLock) {
        throw new HttpException(
          {
            code: 'ACCOUNT_LOCKED',
            message: `Bạn đã nhập sai mật khẩu ${LOGIN_MAX_FAILED_ATTEMPTS} lần liên tiếp. Tài khoản tạm khóa ${LOGIN_LOCK_MINUTES} phút để bảo vệ.`,
            meta: { retryAfterSec: LOGIN_LOCK_MINUTES * 60 },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const remaining = LOGIN_MAX_FAILED_ATTEMPTS - nextFailed;
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message:
          remaining <= 2
            ? `Email hoặc mật khẩu chưa chính xác (còn ${remaining} lần thử trước khi tạm khóa).`
            : 'Email hoặc mật khẩu chưa chính xác.',
        meta: { remainingAttempts: remaining },
      });
    }

    // Require email verification
    if (!userRecord.emailVerifiedAt) {
      let otpMeta: OtpChallengeResponse | undefined;
      try {
        otpMeta = await this.createAndSendOtp(
          userRecord.email,
          userRecord.fullName,
          OtpPurpose.REGISTER_VERIFY,
        );
      } catch {
        // Dang trong cooldown 60s -> van chuyen nguoi dung sang man nhap OTP
      }

      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email của bạn chưa được xác thực. Vui lòng nhập mã OTP 6 số chúng tôi vừa gửi.',
        meta: {
          email: userRecord.email,
          cooldownSeconds: otpMeta?.cooldownSeconds ?? OTP_RESEND_COOLDOWN_SEC,
          ...(otpMeta?.devOtpHint ? { devOtpHint: otpMeta.devOtpHint } : {}),
        },
      });
    }

    if (userRecord.failedLoginAttempts > 0 || userRecord.lockedUntil) {
      await this.prisma.user.update({
        where: { id: userRecord.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return this.issueTokenPair(userRecord, meta);
  }

  async refresh(
    rawRefreshToken: string | undefined,
    meta: RequestMeta,
  ): Promise<{ auth: AuthResponse; refreshToken: string }> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Không tìm thấy phiên làm việc');
    }

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Token làm mới không hợp lệ');
    }

    const tokenHash = sha256(rawRefreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: userWithProfileSelect },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Phiên đăng nhập không tồn tại');
    }

    if (storedToken.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Phát hiện bất thường phiên đăng nhập. Vui lòng đăng nhập lại.',
      );
    }

    if (storedToken.expiresAt < new Date() || !storedToken.user.isActive) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc tài khoản bị khóa');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(storedToken.user, meta);
  }

  async logout(rawRefreshToken: string | undefined): Promise<{ loggedOut: boolean }> {
    if (rawRefreshToken) {
      const tokenHash = sha256(rawRefreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { loggedOut: true };
  }

  async logoutAll(userId: string): Promise<{ revokedAll: boolean }> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revokedAll: true };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userWithProfileSelect,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Không tìm thấy tài khoản');
    }

    return mapAuthUser(user);
  }

  // ============================================================================
  // OAUTH 2.0 (GOOGLE & GITHUB) — AUTO REGISTER + PROFILE SYNC + SAFE LINKING
  // ============================================================================

  getOAuthProvidersStatus() {
    return {
      google: Boolean(
        process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
      ),
      github: Boolean(
        process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
      ),
    };
  }

  buildOAuthAuthorization(
    provider: 'google' | 'github',
    returnOrigin: string,
    apiBaseOrigin: string,
    isPopup = false,
  ): { authorizeUrl: string; stateToken: string } {
    const nonce = randomBytes(16).toString('hex');
    const payload = Buffer.from(
      JSON.stringify({ nonce, provider, returnOrigin, isPopup, iat: Date.now() }),
    ).toString('base64url');
    const sig = createHmac('sha256', this.refreshSecret).update(payload).digest('base64url');
    const stateToken = `${payload}.${sig}`;
    const callbackUrl = `${apiBaseOrigin}/api/v1/auth/oauth/${provider}/callback`;

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        throw new BadRequestException(
          'Đăng nhập Google chưa được cấu hình (thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trong apps/api/.env).',
        );
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: 'openid email profile',
        state: stateToken,
        access_type: 'online',
        prompt: 'select_account',
      });
      return {
        authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        stateToken,
      };
    }

    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Đăng nhập GitHub chưa được cấu hình (thiếu GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET trong apps/api/.env).',
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'read:user user:email',
      state: stateToken,
      prompt: 'select_account',
    });
    return {
      authorizeUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
      stateToken,
    };
  }

  verifyOAuthState(
    queryState: string | undefined,
    cookieState: string | undefined,
    expectedProvider: 'google' | 'github',
  ): { returnOrigin: string; isPopup: boolean } {
    if (!queryState || !cookieState || queryState !== cookieState) {
      throw new UnauthorizedException('Phiên xác thực OAuth không hợp lệ hoặc đã hết hạn (CSRF check).');
    }

    const [payload, sig] = queryState.split('.');
    if (!payload || !sig) {
      throw new UnauthorizedException('Mã trạng thái OAuth bị lỗi định dạng');
    }

    const expectedSig = createHmac('sha256', this.refreshSecret).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Chữ ký trạng thái OAuth không hợp lệ');
    }

    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      provider: string;
      returnOrigin: string;
      isPopup?: boolean;
      iat: number;
    };

    if (parsed.provider !== expectedProvider || Date.now() - parsed.iat > 10 * 60 * 1000) {
      throw new UnauthorizedException('Phiên xác thực OAuth đã hết hạn, vui lòng thử lại');
    }

    return {
      returnOrigin: parsed.returnOrigin,
      isPopup: Boolean(parsed.isPopup),
    };
  }

  async completeOAuthCallback(params: {
    provider: 'google' | 'github';
    code: string;
    apiBaseOrigin: string;
  }): Promise<{ userId: string; isNewUser: boolean }> {
    const profile =
      params.provider === 'google'
        ? await this.fetchGoogleProfile(params.code, params.apiBaseOrigin)
        : await this.fetchGitHubProfile(params.code, params.apiBaseOrigin);

    const prismaProvider =
      params.provider === 'google' ? PrismaOAuthProvider.GOOGLE : PrismaOAuthProvider.GITHUB;

    // 1. Tim theo lien ket OAuth da ton tai
    const existingOAuth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: prismaProvider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: {
        user: { select: userWithProfileSelect },
      },
    });

    if (existingOAuth) {
      if (!existingOAuth.user.isActive) {
        throw new ForbiddenException('Tài khoản của bạn đã bị tạm khóa bởi quản trị viên.');
      }

      if (!existingOAuth.user.avatarUrl && profile.avatarUrl) {
        await this.prisma.user.update({
          where: { id: existingOAuth.user.id },
          data: { avatarUrl: profile.avatarUrl },
        });
      }

      return { userId: existingOAuth.user.id, isNewUser: false };
    }

    // 2. Kiem tra email da ton tai chua -> Lien ket an toan hoac Tu dong dang ky moi
    const normalizedEmail = profile.email.trim().toLowerCase();
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: userWithProfileSelect,
    });

    if (existingByEmail) {
      if (!existingByEmail.isActive) {
        throw new ForbiddenException('Tài khoản gắn với email này đang bị tạm khóa.');
      }

      await this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          emailVerifiedAt: existingByEmail.emailVerifiedAt ?? new Date(),
          avatarUrl: existingByEmail.avatarUrl ?? profile.avatarUrl,
          oauthAccounts: {
            create: {
              provider: prismaProvider,
              providerAccountId: profile.providerAccountId,
              email: normalizedEmail,
            },
          },
        },
      });

      return { userId: existingByEmail.id, isNewUser: false };
    }

    // 3. Nguoi dung moi 100% -> Tu dong dang ky + set Ten, Avatar & Xac thuc Email theo tai khoan ben thu 3
    const fallbackName = normalizedEmail.split('@')[0] || 'Thành viên Try4T';
    const fullName = profile.fullName?.trim() || fallbackName;

    const newUser = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: null,
        fullName,
        avatarUrl: profile.avatarUrl,
        role: PrismaRole.STUDENT,
        emailVerifiedAt: new Date(),
        oauthAccounts: {
          create: {
            provider: prismaProvider,
            providerAccountId: profile.providerAccountId,
            email: normalizedEmail,
          },
        },
      },
      select: { id: true },
    });

    return { userId: newUser.id, isNewUser: true };
  }

  createOneTimeOAuthTicket(params: {
    userId: string;
    provider: 'google' | 'github';
    isNewUser: boolean;
  }): string {
    // Don cac ticket het han tranh tich tu bo nho
    const now = Date.now();
    for (const [key, rec] of this.oauthTickets.entries()) {
      if (rec.expiresAt <= now) {
        this.oauthTickets.delete(key);
      }
    }

    const ticket = randomBytes(32).toString('base64url');
    this.oauthTickets.set(ticket, {
      ...params,
      expiresAt: now + 60_000, // Hieu luc 60 giay, dung duy nhat 1 lan
    });
    return ticket;
  }

  async exchangeOAuthTicket(
    ticket: string,
    meta: RequestMeta,
  ): Promise<{
    auth: AuthResponse;
    refreshToken: string;
    provider: 'google' | 'github';
    isNewUser: boolean;
  }> {
    const record = this.oauthTickets.get(ticket);
    this.oauthTickets.delete(ticket); // Xoa ngay lap tuc (single-use)

    if (!record || record.expiresAt <= Date.now()) {
      throw new UnauthorizedException(
        'Mã phiên OAuth không hợp lệ hoặc đã hết hạn. Vui lòng thử đăng nhập lại.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: userWithProfileSelect,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị tạm khóa');
    }

    const pair = await this.issueTokenPair(user, meta);
    return {
      ...pair,
      provider: record.provider,
      isNewUser: record.isNewUser,
    };
  }

  private async fetchGoogleProfile(
    code: string,
    apiBaseOrigin: string,
  ): Promise<{ providerAccountId: string; email: string; fullName: string; avatarUrl: string | null }> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
    const redirectUri = `${apiBaseOrigin}/api/v1/auth/oauth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException('Không thể xác thực mã đăng nhập với Google');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException('Google không trả về Access Token');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new UnauthorizedException('Không thể lấy thông tin hồ sơ từ Google');
    }

    const profile = (await userRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!profile.sub || !profile.email || profile.email_verified === false) {
      throw new UnauthorizedException('Tài khoản Google chưa có email hợp lệ đã xác thực');
    }

    return {
      providerAccountId: profile.sub,
      email: profile.email,
      fullName: profile.name ?? '',
      avatarUrl: profile.picture ?? null,
    };
  }

  private async fetchGitHubProfile(
    code: string,
    apiBaseOrigin: string,
  ): Promise<{ providerAccountId: string; email: string; fullName: string; avatarUrl: string | null }> {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim() ?? '';
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() ?? '';
    const redirectUri = `${apiBaseOrigin}/api/v1/auth/oauth/github/callback`;

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException('Không thể xác thực mã đăng nhập với GitHub');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException('GitHub không trả về Access Token');
    }

    const ghHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Try4T-LMS-App',
    };

    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: ghHeaders }),
      fetch('https://api.github.com/user/emails', { headers: ghHeaders }),
    ]);

    if (!userRes.ok) {
      throw new UnauthorizedException('Không thể lấy hồ sơ người dùng từ GitHub');
    }

    const ghUser = (await userRes.json()) as {
      id?: number;
      login?: string;
      name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    };

    let verifiedEmail = ghUser.email ?? null;
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primaryVerified = emails.find((e) => e.primary && e.verified);
      const anyVerified = emails.find((e) => e.verified);
      verifiedEmail = primaryVerified?.email ?? anyVerified?.email ?? verifiedEmail;
    }

    if (!ghUser.id || !verifiedEmail) {
      throw new UnauthorizedException(
        'Tài khoản GitHub chưa có email đã xác thực. Vui lòng bật email đã xác thực trong cài đặt GitHub.',
      );
    }

    return {
      providerAccountId: String(ghUser.id),
      email: verifiedEmail,
      fullName: ghUser.name?.trim() || ghUser.login || '',
      avatarUrl: ghUser.avatar_url ?? null,
    };
  }

  // ============================================================================
  // OTP ENGINE (SHA-256 hashed, 60s cooldown, 5 max attempts, 10m TTL)
  // ============================================================================

  private async createAndSendOtp(
    email: string,
    fullName: string,
    purpose: OtpPurpose,
  ): Promise<OtpChallengeResponse> {
    const latestOtp = await this.prisma.emailOtp.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: 'desc' },
    });

    if (latestOtp) {
      const elapsedSec = Math.floor((Date.now() - latestOtp.createdAt.getTime()) / 1000);
      if (elapsedSec < OTP_RESEND_COOLDOWN_SEC) {
        const waitSec = OTP_RESEND_COOLDOWN_SEC - elapsedSec;
        throw new HttpException(
          {
            code: 'OTP_COOLDOWN',
            message: `Bạn vừa yêu cầu mã xác thực. Chờ ${waitSec} giây nữa để gửi lại nhé.`,
            meta: { retryAfterSec: waitSec },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = sha256(`${email}:${purpose}:${code}`);
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    await this.prisma.$transaction([
      // Vo hieu hoa cac ma OTP cu chua dung
      this.prisma.emailOtp.updateMany({
        where: { email, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailOtp.create({
        data: {
          email,
          purpose,
          codeHash,
          maxAttempts: OTP_MAX_ATTEMPTS,
          expiresAt,
        },
      }),
    ]);

    const delivery = await this.mailService.sendOtpEmail({
      to: email,
      fullName,
      code,
      purpose,
      expiresInMinutes: OTP_EXPIRES_MINUTES,
    });

    return {
      requiresEmailVerification: true,
      email,
      cooldownSeconds: OTP_RESEND_COOLDOWN_SEC,
      expiresInMinutes: OTP_EXPIRES_MINUTES,
      deliveryChannel: delivery.channel,
      ...(delivery.devOtpHint ? { devOtpHint: delivery.devOtpHint } : {}),
    };
  }

  private async consumeValidOtp(email: string, purpose: OtpPurpose, rawCode: string) {
    const otp = await this.prisma.emailOtp.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException(
        'Mã xác thực không tồn tại hoặc đã được sử dụng. Hãy bấm Gửi lại mã mới.',
      );
    }

    if (otp.expiresAt < new Date()) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException('Mã OTP đã hết hạn (10 phút). Hãy bấm Gửi lại mã mới nhé.');
    }

    if (otp.attempts >= otp.maxAttempts) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException(
        'Bạn đã nhập sai mã OTP quá 5 lần. Vui lòng yêu cầu gửi lại mã mới.',
      );
    }

    const expectedHash = sha256(`${email}:${purpose}:${rawCode.trim()}`);
    if (otp.codeHash !== expectedHash) {
      const nextAttempts = otp.attempts + 1;
      const exhausted = nextAttempts >= otp.maxAttempts;
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: {
          attempts: nextAttempts,
          ...(exhausted ? { consumedAt: new Date() } : {}),
        },
      });
      const left = otp.maxAttempts - nextAttempts;
      throw new BadRequestException({
        code: 'INVALID_OTP',
        message: exhausted
          ? 'Bạn đã nhập sai mã OTP quá 5 lần. Hãy yêu cầu gửi lại mã mới.'
          : `Mã OTP chưa chính xác (còn ${left} lần thử).`,
        meta: { remainingAttempts: left },
      });
    }

    await this.prisma.emailOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }

  private async issueTokenPair(
    user: UserWithProfile,
    meta: RequestMeta,
  ): Promise<{ auth: AuthResponse; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role },
        { secret: this.accessSecret, expiresIn: this.accessTtlSec },
      ),
      this.jwtService.signAsync(
        { sub: user.id, jti: randomUUID(), type: 'refresh' },
        { secret: this.refreshSecret, expiresIn: this.refreshTtlSec },
      ),
    ]);

    const expiresAt = new Date(Date.now() + this.refreshTtlSec * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        userAgent: meta.userAgent?.slice(0, 255),
        ipAddress: meta.ipAddress?.slice(0, 64),
        expiresAt,
      },
    });

    return {
      auth: {
        accessToken,
        user: mapAuthUser(user),
      },
      refreshToken,
    };
  }
}
