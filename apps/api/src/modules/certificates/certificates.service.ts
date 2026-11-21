import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { CertificatePdfService } from '../../infrastructure/certificate-pdf/certificate-pdf.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: CertificatePdfService,
    private readonly configService: ConfigService,
  ) {}

  private generateCertCode(): string {
    const year = new Date().getFullYear();
    const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    return `CERT-${year}-${suffix}`;
  }

  buildVerifyUrl(certCode: string, originOverride?: string): string {
    const baseUrl = (originOverride || this.configService.get<string>('APP_URL') || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    return `${baseUrl}/verify/${encodeURIComponent(certCode)}`;
  }

  /**
   * Tự động cấp chứng chỉ 1 lần duy nhất (idempotent) khi học viên hoàn thành 100% khóa học.
   */
  async ensureIssuedForCompletion(userId: string, courseId: string) {
    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) return existing;

    const [enrollment, user, course] = await Promise.all([
      this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: { progressPercent: true, completedLessonsCount: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      }),
      this.prisma.course.findUnique({
        where: { id: courseId },
        select: {
          title: true,
          totalLessons: true,
          instructor: { select: { fullName: true } },
        },
      }),
    ]);

    if (!enrollment || !user || !course || course.totalLessons <= 0) {
      return null;
    }

    if (Number(enrollment.progressPercent) < 100) {
      return null;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const certCode = this.generateCertCode();
      try {
        const created = await this.prisma.certificate.create({
          data: {
            certCode,
            userId,
            courseId,
            recipientNameSnapshot: user.fullName,
            courseTitleSnapshot: course.title,
            instructorNameSnapshot: course.instructor.fullName,
            pdfUrl: `/api/v1/certificates/${certCode}/pdf`,
          },
        });
        this.logger.log(`Đã cấp chứng chỉ ${certCode} cho user ${userId} - khóa ${courseId}`);
        return created;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const raceExisting = await this.prisma.certificate.findUnique({
            where: { userId_courseId: { userId, courseId } },
          });
          if (raceExisting) return raceExisting;
          // Trùng certCode cực hiếm -> thử lại mã mới
          continue;
        }
        throw err;
      }
    }

    return null;
  }

  async listMyCertificates(userId: string) {
    const certs = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            thumbnailUrl: true,
            totalDurationSec: true,
            totalLessons: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    return certs.map((c) => ({
      id: c.id,
      certCode: c.certCode,
      recipientName: c.recipientNameSnapshot,
      courseTitle: c.courseTitleSnapshot,
      instructorName: c.instructorNameSnapshot,
      issuedAt: c.issuedAt,
      pdfPath: `/api/v1/certificates/${c.certCode}/pdf`,
      verifyPath: `/verify/${c.certCode}`,
      course: c.course,
    }));
  }

  async verifyByCode(certCode: string) {
    const normalized = certCode.trim().toUpperCase();
    const cert = await this.prisma.certificate.findUnique({
      where: { certCode: normalized },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            thumbnailUrl: true,
            level: true,
            totalDurationSec: true,
            totalLessons: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    if (!cert) {
      throw new NotFoundException({
        code: 'CERTIFICATE_NOT_FOUND',
        message: 'Không tìm thấy chứng chỉ hợp lệ với mã xác thực này.',
      });
    }

    return {
      verified: true,
      certCode: cert.certCode,
      recipientName: cert.recipientNameSnapshot,
      courseTitle: cert.courseTitleSnapshot,
      instructorName: cert.instructorNameSnapshot,
      issuedAt: cert.issuedAt,
      pdfPath: `/api/v1/certificates/${cert.certCode}/pdf`,
      verifyUrl: this.buildVerifyUrl(cert.certCode),
      course: cert.course,
    };
  }

  async renderPdfByCode(certCode: string, originOverride?: string) {
    const normalized = certCode.trim().toUpperCase();
    const cert = await this.prisma.certificate.findUnique({
      where: { certCode: normalized },
    });

    if (!cert) {
      throw new NotFoundException('Không tìm thấy chứng chỉ');
    }

    const buffer = await this.pdfService.generatePdfBuffer({
      certCode: cert.certCode,
      recipientName: cert.recipientNameSnapshot,
      courseTitle: cert.courseTitleSnapshot,
      instructorName: cert.instructorNameSnapshot,
      issuedAt: cert.issuedAt,
      verifyUrl: this.buildVerifyUrl(cert.certCode, originOverride),
    });

    return {
      certCode: cert.certCode,
      buffer,
    };
  }
}
