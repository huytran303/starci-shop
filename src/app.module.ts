import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { LoggingModule } from './logging/logging.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Root module: chỉ lắp ráp các feature module trong `src/modules/`, không tự
 * chứa controller hay service nào.
 *
 * Thêm feature mới = tạo một thư mục trong `src/modules/` (http / domain /
 * data + `*.module.ts`) rồi thêm đúng một dòng vào `imports`. File này không
 * phình ra theo số lượng provider nữa.
 */
@Module({
  imports: [
    // Thứ tự trong mảng này KHÔNG quyết định thứ tự khởi tạo (Nest tự giải
    // dependency graph), nhưng đặt config đầu tiên phản ánh đúng ràng buộc
    // thật: LoggingModule inject EnvService, nên config phải hợp lệ trước khi
    // có logger. Env sai → chết ngay ở bước này, chưa kịp mở cổng nào.
    AppConfigModule,
    LoggingModule,
    HealthModule,
    // ProductsModule,
    // CartModule,
    // OrdersModule,
  ],
})
export class AppModule {}
