import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CertificatesService } from './certificates.service';

@ApiTags('Certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách chứng chỉ của học viên hiện tại' })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.certificatesService.listMyCertificates(user.id);
  }

  @Public()
  @Get('verify/:certCode')
  @ApiOperation({ summary: 'Xác thực công khai chứng chỉ bằng mã CERT-YYYY-XXXXXX' })
  verify(@Param('certCode') certCode: string) {
    return this.certificatesService.verifyByCode(certCode);
  }

  @Public()
  @Get(':certCode/pdf')
  @ApiOperation({ summary: 'Tải xuống hoặc xem trực tiếp file PDF chứng chỉ kèm mã QR' })
  async downloadPdf(
    @Param('certCode') certCode: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const { certCode: normalizedCode, buffer } =
      await this.certificatesService.renderPdfByCode(certCode);

    const disposition = download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="Try4T-Certificate-${normalizedCode}.pdf"`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
