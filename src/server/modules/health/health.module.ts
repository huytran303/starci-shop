import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { HealthDbRepository } from './data/health.db.repository';
import { HealthService } from './domain/health.service';
import { HealthController } from './http/health.controller';

/**
 * Feature `health`, đóng gói trọn vẹn: http -> domain -> data nằm gọn trong
 * một thư mục, khai báo ở đúng một file.
 *
 * Ranh giới module là thứ đắt giá nhất ở đây: `HealthService` và
 * `HealthDbRepository` KHÔNG được export, nên không feature nào khác inject
 * được chúng. Muốn chia sẻ thì phải khai báo tường minh ở `exports`.
 *
 * Hạ tầng DB dùng chung tới từ `DatabaseModule` qua `imports`, không phải khai
 * báo lại làm provider.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService, HealthDbRepository],
})
export class HealthModule {}
