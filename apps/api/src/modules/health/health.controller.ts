import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái API & kết nối Database' })
  async check() {
    let database: 'connected' | 'disconnected' | 'unconfigured' = 'unconfigured';

    if (process.env.DATABASE_URL) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        database = 'connected';
      } catch {
        database = 'disconnected';
      }
    }

    return {
      service: 'Try4T API',
      status: 'ok',
      database,
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
    };
  }
}
