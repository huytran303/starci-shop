import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { HealthService } from './domain/health.service';
import { HealthController } from './http/health.controller';

/**
 * Feature `health`, đóng gói trọn vẹn.
 *
 * Bên trong vẫn giữ nguyên chiều http -> domain -> data. Cái thêm vào là ranh
 * giới module: `HealthService` KHÔNG được export, nên không feature nào khác
 * inject được nó. Muốn dùng thì phải khai báo tường minh ở `exports`.
 *
 * `DbRepository` không nằm ở đây — nó tới từ `DatabaseModule` qua `imports`.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
