import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendOtpMailParams {
  to: string;
  fullName: string;
  code: string;
  purpose: 'REGISTER_VERIFY' | 'RESET_PASSWORD';
  expiresInMinutes: number;
}

export interface MailDeliveryResult {
  channel: 'smtp' | 'resend' | 'dev';
  devOtpHint?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: 'smtp' | 'resend' | 'dev';
  private readonly from: string;
  private readonly smtpHost: string;
  private readonly smtpPort: number;
  private readonly smtpSecure: boolean;
  private readonly smtpUser: string;
  private readonly smtpPass: string;
  private readonly resendApiKey: string;
  private readonly isProd: boolean;

  constructor(configService: ConfigService) {
    this.provider = configService.get<'smtp' | 'resend' | 'dev'>('MAIL_PROVIDER') ?? 'dev';
    this.from = configService.get<string>('MAIL_FROM') ?? 'Try4T <no-reply@try4t.dev>';
    this.smtpHost = configService.get<string>('SMTP_HOST') ?? 'smtp.gmail.com';
    this.smtpPort = configService.get<number>('SMTP_PORT') ?? 587;
    this.smtpSecure = configService.get<boolean>('SMTP_SECURE') ?? false;
    this.smtpUser = configService.get<string>('SMTP_USER') ?? '';
    this.smtpPass = configService.get<string>('SMTP_PASS') ?? '';
    this.resendApiKey = configService.get<string>('RESEND_API_KEY') ?? '';
    this.isProd = configService.get<string>('NODE_ENV') === 'production';
  }

  private hasSmtp(): boolean {
    return Boolean(this.smtpHost && this.smtpUser && this.smtpPass);
  }

  private hasResend(): boolean {
    return Boolean(this.resendApiKey);
  }

  private resolveChannel(): 'smtp' | 'resend' | 'dev' {
    if (this.provider === 'smtp' && this.hasSmtp()) return 'smtp';
    if (this.provider === 'resend' && this.hasResend()) return 'resend';
    if (this.hasSmtp()) return 'smtp';
    if (this.hasResend()) return 'resend';
    return 'dev';
  }

  async sendOtpEmail(params: SendOtpMailParams): Promise<MailDeliveryResult> {
    const channel = this.resolveChannel();
    const isReset = params.purpose === 'RESET_PASSWORD';
    const subject = isReset
      ? `[Try4T] Mã OTP đặt lại mật khẩu: ${params.code}`
      : `[Try4T] Mã xác thực tài khoản của bạn: ${params.code}`;

    const html = this.buildOtpHtml(params);

    if (channel === 'smtp') {
      try {
        const transporter = nodemailer.createTransport({
          host: this.smtpHost,
          port: this.smtpPort,
          secure: this.smtpSecure,
          auth: {
            user: this.smtpUser,
            pass: this.smtpPass,
          },
        });

        await transporter.sendMail({
          from: this.from,
          to: params.to,
          subject,
          html,
        });
        this.logger.log(`Sent ${params.purpose} OTP via SMTP to ${params.to}`);
        return { channel: 'smtp' };
      } catch (err) {
        this.logger.error(
          `SMTP send failed (${params.to}): ${err instanceof Error ? err.message : String(err)}`,
        );
        if (this.isProd) throw err;
      }
    }

    if (channel === 'resend') {
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.from,
            to: [params.to],
            subject,
            html,
          }),
        });
        if (!resp.ok) {
          throw new Error(`Resend HTTP ${resp.status}: ${await resp.text()}`);
        }
        this.logger.log(`Sent ${params.purpose} OTP via Resend to ${params.to}`);
        return { channel: 'resend' };
      } catch (err) {
        this.logger.error(
          `Resend send failed (${params.to}): ${err instanceof Error ? err.message : String(err)}`,
        );
        if (this.isProd) throw err;
      }
    }

    // Development fallback when SMTP / Resend not configured
    this.logger.warn(
      `\n================ [Try4T DEV OTP] ================\nTo: ${params.to}\nPurpose: ${params.purpose}\nCode: ${params.code} (Het han sau ${params.expiresInMinutes} phut)\n=================================================\n`,
    );

    return {
      channel: 'dev',
      ...(!this.isProd ? { devOtpHint: params.code } : {}),
    };
  }

  private buildOtpHtml(params: SendOtpMailParams): string {
    const title =
      params.purpose === 'RESET_PASSWORD'
        ? 'Yêu cầu đặt lại mật khẩu'
        : 'Xác thực địa chỉ Email của bạn';
    const desc =
      params.purpose === 'RESET_PASSWORD'
        ? 'Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản Try4T của bạn. Nhập mã gồm 6 chữ số bên dưới để tạo mật khẩu mới:'
        : 'Chào mừng bạn gia nhập nền tảng học tập Try4T! Vui lòng nhập mã gồm 6 chữ số bên dưới để hoàn tất kích hoạt tài khoản:';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #18181b; border: 1px solid #e4e4e7; border-radius: 16px;">
        <div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 20px;">
          Try<span style="color: #4f46e5;">4T</span>
        </div>
        <h2 style="font-size: 18px; margin: 0 0 12px;">${title}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #52525b; margin: 0 0 24px;">
          Xin chào <strong>${params.fullName}</strong>,<br/>${desc}
        </p>
        <div style="background: #f4f4f5; border: 1px dashed #d4d4d8; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.35em; color: #09090b;">
            ${params.code}
          </span>
        </div>
        <p style="font-size: 12px; color: #71717a; line-height: 1.5; margin: 0;">
          Mã xác thực có hiệu lực trong <strong>${params.expiresInMinutes} phút</strong> và chỉ dùng 1 lần.
          Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này để giữ an toàn cho tài khoản.
        </p>
      </div>
    `;
  }
}
