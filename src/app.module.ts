import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

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
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    HealthModule,
    // ProductsModule,
    // CartModule,
    // OrdersModule,
  ],
})
export class AppModule {}
