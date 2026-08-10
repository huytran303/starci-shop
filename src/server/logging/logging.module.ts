import { Global, Module } from '@nestjs/common';

import { AppLogger } from './app-logger.service';
import { rootLoggerProvider, ROOT_LOGGER } from './pino.provider';
import { RequestIdMiddleware } from './request-id.middleware';

/**
 * Hạ tầng logging dùng chung.
 *
 * `@Global()` vì logging là cross-cutting đúng nghĩa: bắt module nào cũng
 * `imports: [LoggingModule]` chỉ tạo nhiễu chứ không tạo ranh giới có ích.
 *
 * VÌ SAO KHÔNG `implements NestModule` + `consumer.apply(...).forRoutes('{*path}')`:
 *
 * Nest áp `setGlobalPrefix` lên **cả middleware** đăng ký qua `forRoutes`, nên
 * `'{*path}'` thực chất chỉ khớp `/api/**` cộng các route nằm trong `exclude`.
 * Request tới `/`, `/favicon.ico`, hay bất kỳ URL gõ nhầm nào đều **không** đi
 * qua middleware: không có `requestId`, không có access log, response cũng
 * không có header `x-request-id`. Đúng loại traffic (quét lỗ hổng, client sai
 * đường dẫn) mà ta cần nhìn thấy nhất lại thành vô hình.
 *
 * Nên `RequestIdMiddleware` được gắn bằng `app.use()` ở `main.ts` — cấp Express,
 * chạy trước router nên không dính global prefix. Đổi lại `main.ts` phải biết
 * tới nó; `test/smoke.e2e-spec.ts` khoá hành vi này để nó không lặng lẽ hỏng.
 */
@Global()
@Module({
  providers: [rootLoggerProvider, AppLogger, RequestIdMiddleware],
  // `RequestIdMiddleware` phải nằm trong `exports` để `main.ts` lấy được qua
  // `app.get()`.
  exports: [ROOT_LOGGER, AppLogger, RequestIdMiddleware],
})
export class LoggingModule {}
