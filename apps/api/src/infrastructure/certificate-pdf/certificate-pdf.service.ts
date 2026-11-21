import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

export interface CertificatePdfPayload {
  certCode: string;
  recipientName: string;
  courseTitle: string;
  instructorName: string;
  issuedAt: Date;
  verifyUrl: string;
}

@Injectable()
export class CertificatePdfService {
  private readonly logger = new Logger(CertificatePdfService.name);
  private readonly regularFontPath: string | null;
  private readonly boldFontPath: string | null;

  constructor() {
    this.regularFontPath = this.resolveFontPath([
      path.resolve(process.cwd(), 'assets/fonts/Roboto-Regular.ttf'),
      path.resolve(process.cwd(), 'apps/api/assets/fonts/Roboto-Regular.ttf'),
      path.resolve(__dirname, '../../../assets/fonts/Roboto-Regular.ttf'),
      path.resolve(__dirname, '../../../../assets/fonts/Roboto-Regular.ttf'),
      'C:\\Windows\\Fonts\\segoeui.ttf',
      'C:\\Windows\\Fonts\\arial.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]);

    this.boldFontPath = this.resolveFontPath([
      path.resolve(process.cwd(), 'assets/fonts/Roboto-Bold.ttf'),
      path.resolve(process.cwd(), 'apps/api/assets/fonts/Roboto-Bold.ttf'),
      path.resolve(__dirname, '../../../assets/fonts/Roboto-Bold.ttf'),
      path.resolve(__dirname, '../../../../assets/fonts/Roboto-Bold.ttf'),
      'C:\\Windows\\Fonts\\segoeuib.ttf',
      'C:\\Windows\\Fonts\\arialbd.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ]);

    if (!this.regularFontPath) {
      this.logger.warn('Không tìm thấy font Unicode TTF, PDF sẽ dùng Helvetica mặc định.');
    }
  }

  private resolveFontPath(candidates: string[]): string | null {
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // ignore fs access issues
      }
    }
    return null;
  }

  async generatePdfBuffer(payload: CertificatePdfPayload): Promise<Buffer> {
    const qrBuffer = await QRCode.toBuffer(payload.verifyUrl, {
      type: 'png',
      width: 240,
      margin: 1,
      color: {
        dark: '#064e3b',
        light: '#ffffff',
      },
    });

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 0,
        info: {
          Title: `Chứng chỉ Try4T - ${payload.courseTitle}`,
          Author: 'Try4T Education',
          Subject: `Certificate ${payload.certCode}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const regularFont = this.regularFontPath ? 'Try4T-Regular' : 'Helvetica';
      const boldFont = this.boldFontPath ? 'Try4T-Bold' : 'Helvetica-Bold';

      if (this.regularFontPath) {
        doc.registerFont('Try4T-Regular', this.regularFontPath);
      }
      if (this.boldFontPath) {
        doc.registerFont('Try4T-Bold', this.boldFontPath);
      }

      const W = doc.page.width; // 841.89
      const H = doc.page.height; // 595.28

      // Soft Mint Cream Background
      doc.rect(0, 0, W, H).fill('#f4fbf7');

      // Decorative Left Forest Accent Ribbon
      doc.rect(0, 0, 26, H).fill('#065f46');
      doc.rect(26, 0, 6, H).fill('#10b981');

      // Outer & Inner Luxury Frame
      doc
        .lineWidth(2.5)
        .strokeColor('#065f46')
        .roundedRect(48, 28, W - 76, H - 56, 12)
        .stroke();

      doc
        .lineWidth(0.8)
        .strokeColor('#34d399')
        .roundedRect(56, 36, W - 92, H - 72, 8)
        .stroke();

      // Top Header Brand & Verification Pill
      doc
        .fillColor('#065f46')
        .font(boldFont)
        .fontSize(22)
        .text('Try4T', 82, 58, { continued: true })
        .fillColor('#10b981')
        .font(regularFont)
        .fontSize(12)
        .text('  |  E-LEARNING & PRACTICAL CERTIFICATION');

      doc
        .roundedRect(W - 262, 56, 178, 26, 13)
        .fill('#dcfce7');
      doc
        .fillColor('#065f46')
        .font(boldFont)
        .fontSize(9.5)
        .text(`MÃ XÁC THỰC: ${payload.certCode}`, W - 252, 64, {
          width: 158,
          align: 'center',
        });

      // Certificate Title
      doc
        .fillColor('#047857')
        .font(boldFont)
        .fontSize(12)
        .text('CHỨNG CHỈ HOÀN THÀNH KHÓA HỌC', 82, 118, {
          width: W - 164,
          align: 'center',
          characterSpacing: 2,
        });

      doc
        .fillColor('#0f172a')
        .font(boldFont)
        .fontSize(30)
        .text('CERTIFICATE OF COMPLETION', 82, 138, {
          width: W - 164,
          align: 'center',
        });

      // Divider
      doc
        .moveTo(W / 2 - 90, 182)
        .lineTo(W / 2 + 90, 182)
        .lineWidth(2)
        .strokeColor('#10b981')
        .stroke();

      // Recipient Intro
      doc
        .fillColor('#475569')
        .font(regularFont)
        .fontSize(13)
        .text('Trân trọng trao tặng chứng chỉ này cho học viên', 82, 202, {
          width: W - 164,
          align: 'center',
        });

      // Recipient Name
      doc
        .fillColor('#064e3b')
        .font(boldFont)
        .fontSize(32)
        .text(payload.recipientName, 82, 228, {
          width: W - 164,
          align: 'center',
        });

      // Course Description
      doc
        .fillColor('#475569')
        .font(regularFont)
        .fontSize(13)
        .text('Đã hoàn thành xuất sắc 100% lộ trình bài giảng, thực hành và bài kiểm tra của khóa học', 82, 282, {
          width: W - 164,
          align: 'center',
        });

      // Course Title Box
      doc
        .roundedRect(110, 310, W - 220, 64, 10)
        .fill('#ffffff')
        .lineWidth(1)
        .strokeColor('#a7f3d0')
        .stroke();

      doc
        .fillColor('#0f172a')
        .font(boldFont)
        .fontSize(18)
        .text(payload.courseTitle, 128, 326, {
          width: W - 256,
          align: 'center',
          ellipsis: true,
        });

      // Footer Metadata & Signatures
      const issuedDateStr = new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(payload.issuedAt);

      // Left Block: Instructor Signature
      doc
        .fillColor('#0f172a')
        .font(boldFont)
        .fontSize(13)
        .text(payload.instructorName, 92, 444, { width: 210, align: 'center' });
      doc
        .moveTo(112, 466)
        .lineTo(282, 466)
        .lineWidth(1)
        .strokeColor('#94a3b8')
        .stroke();
      doc
        .fillColor('#64748b')
        .font(regularFont)
        .fontSize(10)
        .text('Giảng viên hướng dẫn', 92, 474, { width: 210, align: 'center' });

      // Center Block: Issue Date & Seal
      doc
        .fillColor('#065f46')
        .font(boldFont)
        .fontSize(12)
        .text(`Ngày cấp: ${issuedDateStr}`, 310, 444, { width: 210, align: 'center' });
      doc
        .moveTo(335, 466)
        .lineTo(495, 466)
        .lineWidth(1)
        .strokeColor('#94a3b8')
        .stroke();
      doc
        .fillColor('#64748b')
        .font(regularFont)
        .fontSize(10)
        .text('Try4T Academic Board • Verified', 310, 474, { width: 210, align: 'center' });

      // Right Block: Scannable QR Code
      const qrBoxX = W - 210;
      const qrBoxY = 402;
      doc
        .roundedRect(qrBoxX - 8, qrBoxY - 8, 122, 134, 10)
        .fill('#ffffff')
        .lineWidth(1)
        .strokeColor('#d1fae5')
        .stroke();
      doc.image(qrBuffer, qrBoxX + 4, qrBoxY, { width: 98, height: 98 });
      doc
        .fillColor('#065f46')
        .font(boldFont)
        .fontSize(8)
        .text('QUÉT QR ĐỂ XÁC THỰC', qrBoxX - 4, qrBoxY + 104, {
          width: 114,
          align: 'center',
        });

      // Bottom Verification Link
      doc
        .fillColor('#64748b')
        .font(regularFont)
        .fontSize(8.5)
        .text(`Xác thực trực tuyến tại: ${payload.verifyUrl}`, 82, H - 56, {
          width: W - 310,
          align: 'left',
        });

      doc.end();
    });
  }
}
