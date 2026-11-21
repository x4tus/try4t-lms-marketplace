import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public isConnected = false;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn(
        'DATABASE_URL chua duoc cau hinh trong apps/api/.env. Hay dan Neon PostgreSQL URL de kich hoat Database.',
      );
      return;
    }

    try {
      await this.$connect();
      this.isConnected = true;
      this.logger.log('Connected to PostgreSQL database successfully.');
    } catch (error) {
      this.isConnected = false;
      this.logger.error(
        `Khong the ket noi PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
