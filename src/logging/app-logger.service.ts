import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';

import { getRequestContext } from './request-context';
import { ROOT_LOGGER } from './pino.provider';

/**
 * Adapter: `LoggerService` của Nest -> pino.
 *
 * Hai vai trò trong một class:
 *
 * 1. Truyền vào `app.useLogger()` ở `main.ts` → log nội bộ của Nest
 *    ("Nest application successfully started", route mapping, lỗi DI...)
 *    cũng ra JSON thay vì text màu mè không parse được.
 * 2. Inject vào service/controller → thay cho `new Logger(Foo.name)` của Nest.
 *
 * Điểm mấu chốt: `logger` getter đọc từ `AsyncLocalStorage`. Đang trong một
 * request thì trả child logger có `requestId`; ngoài request (lúc bootstrap,
 * lúc chạy cron) thì trả logger gốc. Nơi gọi không phải biết mình đang ở đâu.
 */
@Injectable()
export class AppLogger implements LoggerService {
  constructor(@Inject(ROOT_LOGGER) private readonly root: Logger) {}

  /** Logger đúng cho thời điểm hiện tại — có requestId nếu đang trong request. */
  private get logger(): Logger {
    return getRequestContext()?.logger ?? this.root;
  }

  /**
   * Nest gọi log theo kiểu `log(message, context)` — tham số cuối là chuỗi
   * context ('NestFactory', 'RoutesResolver'...). Tách nó ra thành field
   * `context` để log vẫn có cấu trúc thay vì bị nối vào message.
   */
  private split(params: unknown[]): { context?: string; extra: unknown[] } {
    if (params.length > 0 && typeof params[params.length - 1] === 'string') {
      return { context: params[params.length - 1] as string, extra: params.slice(0, -1) };
    }
    return { extra: params };
  }

  log(message: unknown, ...params: unknown[]): void {
    const { context, extra } = this.split(params);
    this.logger.info({ context, extra: extra.length ? extra : undefined }, String(message));
  }

  error(message: unknown, ...params: unknown[]): void {
    const { context, extra } = this.split(params);
    // Với error, phần tử còn lại thường là stack trace.
    this.logger.error({ context, stack: extra.length ? extra : undefined }, String(message));
  }

  warn(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.warn({ context }, String(message));
  }

  debug(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.debug({ context }, String(message));
  }

  verbose(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.trace({ context }, String(message));
  }

  fatal(message: unknown, ...params: unknown[]): void {
    const { context } = this.split(params);
    this.logger.fatal({ context }, String(message));
  }

  /** Tạo logger con gắn thêm field cố định, ví dụ `{ orderId }`. */
  child(bindings: Record<string, unknown>): Logger {
    return this.logger.child(bindings);
  }
}
