import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
