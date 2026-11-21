import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResendOtpInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@try4t/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { GuestOnlyGuard } from '../../common/guards/guest-only.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, REFRESH_COOKIE_NAME } from './auth.service';

export const OAUTH_STATE_COOKIE_NAME = 'try4t_oauth_state';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean;
  private readonly cookieDomain: string;
  private readonly appUrl: string;
  private readonly apiUrl: string;
  private readonly allowedOrigins: string[];

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    this.cookieSecure = configService.get<boolean>('COOKIE_SECURE') ?? false;
    this.cookieDomain = configService.get<string>('COOKIE_DOMAIN') ?? '';
    this.appUrl = (configService.get<string>('APP_URL') ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    this.apiUrl = (configService.get<string>('API_URL') ?? 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
    this.allowedOrigins = (configService.get<string>('CORS_ORIGINS') ?? this.appUrl)
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
  }

  private resolveSafeReturnOrigin(rawOrigin?: string): string {
    if (!rawOrigin) return this.appUrl;
    const clean = rawOrigin.trim().replace(/\/$/, '');
    if (this.allowedOrigins.includes(clean)) return clean;
    if (
      process.env.NODE_ENV !== 'production' &&
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
        clean,
      )
    ) {
      return clean;
    }
    return this.appUrl;
  }

  private resolveApiOrigin(_req: Request): string {
    // Luon dung API_URL (vd: http://localhost:4000 o dev) de khop 100% Redirect URI cua Google/GitHub
    // ke ca khi nguoi dung truy cap frontend qua IP Network (192.168.x.x:3000)
    return this.apiUrl;
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: this.cookieSecure ? 'none' : 'lax',
      path: '/api/v1/auth',
      maxAge: this.authService.getRefreshMaxAgeMs(),
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: this.cookieSecure ? 'none' : 'lax',
      path: '/api/v1/auth',
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    });
  }

  private getMeta(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  @Public()
  @UseGuards(GuestOnlyGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới và gửi mã OTP 6 số xác thực Email' })
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.authService.register(body);
  }

  @Public()
  @UseGuards(GuestOnlyGuard)
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực Email bằng mã OTP 6 số và đăng nhập ngay' })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { auth, refreshToken } = await this.authService.verifyEmail(body, this.getMeta(req));
    this.setRefreshCookie(res, refreshToken);
    return auth;
  }

  @Public()
  @UseGuards(GuestOnlyGuard)
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi lại mã OTP 6 số (có cooldown 60 giây)' })
  resendOtp(@Body(new ZodValidationPipe(resendOtpSchema)) body: ResendOtpInput) {
    return this.authService.resendOtp(body);
  }

  @Public()
  @UseGuards(GuestOnlyGuard)
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu gửi mã OTP 6 số đặt lại mật khẩu' })
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    return this.authService.forgotPassword(body);
  }

  @Public()
  @UseGuards(GuestOnlyGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu mới bằng OTP 6 số & thu hồi toàn bộ phiên cũ' })
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.authService.resetPassword(body);
  }

  @Public()
  @UseGuards(GuestOnlyGuard)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng email & mật khẩu (có chống brute-force)' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { auth, refreshToken } = await this.authService.login(body, this.getMeta(req));
    this.setRefreshCookie(res, refreshToken);
    return auth;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token bằng HttpOnly Refresh Cookie (Rotation)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    try {
      const { auth, refreshToken } = await this.authService.refresh(rawToken, this.getMeta(req));
      this.setRefreshCookie(res, refreshToken);
      return auth;
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất phiên hiện tại' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const result = await this.authService.logout(rawToken);
    this.clearRefreshCookie(res);
    return result;
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Thu hồi tất cả phiên đăng nhập trên mọi thiết bị' })
  async logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(userId);
    this.clearRefreshCookie(res);
    return result;
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
  me(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Public()
  @Get('oauth/providers')
  @ApiOperation({ summary: 'Kiểm tra các nhà cung cấp đăng nhập bên thứ 3 (Google / GitHub) đang bật' })
  oauthProviders() {
    return this.authService.getOAuthProvidersStatus();
  }

  @Public()
  @Get('oauth/:provider/start')
  @ApiOperation({ summary: 'Khởi tạo luồng đăng nhập OAuth 2.0 (Google / GitHub)' })
  startOAuth(
    @Param('provider') provider: string,
    @Query('returnOrigin') returnOrigin: string | undefined,
    @Query('popup') popup: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const safeOrigin = this.resolveSafeReturnOrigin(returnOrigin);
    const isPopup = popup === '1';

    try {
      if (provider !== 'google' && provider !== 'github') {
        throw new BadRequestException('Nhà cung cấp đăng nhập không được hỗ trợ');
      }

      const apiOrigin = this.resolveApiOrigin(req);
      const { authorizeUrl, stateToken } = this.authService.buildOAuthAuthorization(
        provider,
        safeOrigin,
        apiOrigin,
        isPopup,
      );

      res.cookie(OAUTH_STATE_COOKIE_NAME, stateToken, {
        httpOnly: true,
        secure: this.cookieSecure,
        sameSite: 'lax',
        path: '/api/v1/auth/oauth',
        maxAge: 10 * 60 * 1000,
      });

      return res.redirect(authorizeUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể khởi tạo đăng nhập OAuth';
      const target = new URL(`${safeOrigin}/oauth/callback`);
      target.searchParams.set('status', 'error');
      target.searchParams.set('message', message);
      if (isPopup) target.searchParams.set('popup', '1');
      return res.redirect(target.toString());
    }
  }

  @Public()
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'Callback OAuth 2.0 từ Google / GitHub — tự đăng ký & đồng bộ hồ sơ' })
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE_NAME] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      path: '/api/v1/auth/oauth',
    });

    let returnOrigin = this.appUrl;
    let isPopup = false;

    try {
      if (provider !== 'google' && provider !== 'github') {
        throw new BadRequestException('Nhà cung cấp không hợp lệ');
      }

      const verifiedState = this.authService.verifyOAuthState(state, cookieState, provider);
      returnOrigin = verifiedState.returnOrigin;
      isPopup = verifiedState.isPopup;

      if (oauthError) {
        throw new BadRequestException('Bạn đã hủy xác thực đăng nhập');
      }
      if (!code) {
        throw new BadRequestException('Thiếu mã xác thực từ nhà cung cấp');
      }

      const { userId, isNewUser } = await this.authService.completeOAuthCallback({
        provider,
        code,
        apiBaseOrigin: this.resolveApiOrigin(req),
      });

      const ticket = this.authService.createOneTimeOAuthTicket({
        userId,
        provider,
        isNewUser,
      });

      const target = new URL(`${returnOrigin}/oauth/callback`);
      target.searchParams.set('status', 'success');
      target.searchParams.set('ticket', ticket);
      target.searchParams.set('provider', provider);
      target.searchParams.set('isNew', isNewUser ? '1' : '0');
      if (isPopup) target.searchParams.set('popup', '1');
      return res.redirect(target.toString());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Đăng nhập bên thứ 3 thất bại';
      const target = new URL(`${returnOrigin}/oauth/callback`);
      target.searchParams.set('status', 'error');
      target.searchParams.set('message', message);
      if (isPopup) target.searchParams.set('popup', '1');
      return res.redirect(target.toString());
    }
  }

  @Public()
  @UseGuards(GuestOnlyGuard)
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi mã OAuth dùng 1 lần lấy Access Token & HttpOnly Refresh Cookie' })
  async exchangeOAuthTicket(
    @Body() body: { ticket?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.ticket || typeof body.ticket !== 'string') {
      throw new BadRequestException('Thiếu mã xác thực OAuth');
    }
    const { auth, refreshToken, provider, isNewUser } =
      await this.authService.exchangeOAuthTicket(body.ticket, this.getMeta(req));
    this.setRefreshCookie(res, refreshToken);
    return {
      ...auth,
      provider,
      isNewUser,
    };
  }
}
