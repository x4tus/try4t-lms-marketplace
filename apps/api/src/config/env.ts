import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  API_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(4000)),
  APP_URL: z.preprocess(emptyToUndefined, z.string().default('http://localhost:3000')),
  API_URL: z.preprocess(emptyToUndefined, z.string().default('http://localhost:4000')),
  CORS_ORIGINS: z.preprocess(emptyToUndefined, z.string().default('http://localhost:3000')),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(16).default('try4t-dev-access-secret-change-in-production-min-32-chars'),
  ),
  JWT_REFRESH_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(16).default('try4t-dev-refresh-secret-change-in-production-min-32-chars'),
  ),
  JWT_ACCESS_EXPIRES_IN: z.preprocess(emptyToUndefined, z.string().default('15m')),
  JWT_REFRESH_EXPIRES_IN: z.preprocess(emptyToUndefined, z.string().default('7d')),
  COOKIE_DOMAIN: z.string().optional().default(''),
  COOKIE_SECURE: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional().default('false'))
    .transform((v) => v === 'true'),
  PLATFORM_DEFAULT_FEE_RATE: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0).max(1).default(0.3),
  ),

  // Hybrid Cloud Storage (100% env-driven)
  STORAGE_IMAGE_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['cloudinary', 'r2']).default('cloudinary'),
  ),
  STORAGE_VIDEO_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['r2', 'cloudinary']).default('cloudinary'),
  ),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET_NAME: z.string().optional().default('try4t-media'),
  R2_PUBLIC_URL: z.string().optional().default(''),

  // Email / OTP Service (Gmail SMTP | Resend | Dev Fallback)
  MAIL_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['smtp', 'resend', 'dev']).default('dev'),
  ),
  MAIL_FROM: z.preprocess(emptyToUndefined, z.string().default('Try4T <no-reply@try4t.dev>')),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().default('smtp.gmail.com')),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(587)),
  SMTP_SECURE: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional().default('false'))
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),

  // OAuth 2.0 Third-Party Sign-In (Google & GitHub)
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GITHUB_CLIENT_ID: z.string().optional().default(''),
  GITHUB_CLIENT_SECRET: z.string().optional().default(''),

  // Payment Gateway (VietQR SePay + Sandbox)
  PAYMENT_SANDBOX_ENABLED: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional().default('true'))
    .transform((v) => v === 'true'),
  SEPAY_API_KEY: z.string().optional().default(''),
  SEPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  VIETQR_BANK_CODE: z.preprocess(emptyToUndefined, z.string().default('MB')),
  VIETQR_ACCOUNT_NO: z.preprocess(emptyToUndefined, z.string().default('090123456789')),
  VIETQR_ACCOUNT_NAME: z.preprocess(emptyToUndefined, z.string().default('TRY4T EDUCATION')),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment variables: ${JSON.stringify(formatted)}`);
  }
  return parsed.data;
}
