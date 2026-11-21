import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { REFRESH_COOKIE_NAME } from '../../modules/auth/auth.service';

@Injectable()
export class GuestOnlyGuard implements CanActivate {
  private readonly accessSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.accessSecret = configService.get<string>('JWT_ACCESS_SECRET')!;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // 1. Check valid Bearer Access Token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        try {
          await this.jwtService.verifyAsync(token, { secret: this.accessSecret });
          throw new ConflictException({
            code: 'ALREADY_AUTHENTICATED',
            message:
              'Bạn đang đăng nhập tài khoản hiện tại. Vui lòng đăng xuất trước khi thực hiện thao tác này.',
          });
        } catch (err) {
          if (err instanceof ConflictException) throw err;
          // Expired/invalid bearer token -> fall through to refresh cookie check
        }
      }
    }

    // 2. Check active HttpOnly Refresh Token cookie
    const refreshCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (refreshCookie) {
      const tokenHash = createHash('sha256').update(refreshCookie).digest('hex');
      const activeSession = await this.prisma.refreshToken.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      if (activeSession) {
        throw new ConflictException({
          code: 'ALREADY_AUTHENTICATED',
          message:
            'Phiên đăng nhập của bạn vẫn đang hoạt động. Vui lòng đăng xuất trước khi đăng nhập hoặc đăng ký tài khoản khác.',
        });
      }
    }

    return true;
  }
}
