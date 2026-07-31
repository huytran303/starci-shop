import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DbRepository } from './data/db.repository';
import { HealthService } from './domain/health.service';
import { HealthController } from './http/health.controller';

/**
 * Chỗ duy nhất ba tầng gặp nhau. Việc wiring nằm ở đây để bản thân các tầng
 * không phải tự đi tìm nhau.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true })],
  controllers: [HealthController],
  providers: [HealthService, DbRepository],
})
export class AppModule {}
