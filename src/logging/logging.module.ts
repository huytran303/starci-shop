import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AppLogger } from './app-logger.service';
import { rootLoggerProvider, ROOT_LOGGER } from './pino.provider';
import { RequestIdMiddleware } from './request-id.middleware';

/**
 * Hạ tầng logging dùng chung.
 *
 * `@Global()` vì logging là cross-cutting đúng nghĩa: bắt module nào cũng
 * `imports: [LoggingModule]` chỉ tạo nhiễu chứ không tạo ranh giới có ích.
 *
 * `implements NestModule` để đăng ký middleware ngay tại đây, thay vì bắt
 * `AppModule` phải biết logging có middleware. Thêm/bớt middleware của logging
 * chỉ sửa file này.
 */
@Global()
@Module({
  providers: [rootLoggerProvider, AppLogger, RequestIdMiddleware],
  exports: [ROOT_LOGGER, AppLogger],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Mọi route, kể cả /health — probe cũng cần truy vết được khi nó bắt đầu
    // fail. `{*path}` là cú pháp wildcard của path-to-regexp v8 (Express 5 mà
    // Nest 11 dùng); `'*'` kiểu cũ vẫn chạy nhưng in warning deprecation.
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
