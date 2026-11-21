import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({
  imports: [CertificatesModule],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
