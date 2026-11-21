import { Module } from '@nestjs/common';
import { CertificatePdfService } from '../../infrastructure/certificate-pdf/certificate-pdf.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  controllers: [CertificatesController],
  providers: [CertificatePdfService, CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
