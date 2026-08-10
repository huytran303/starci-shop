import { randomUUID } from 'node:crypto';

import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { ROOT_LOGGER } from './pino.provider';
import { requestContextStorage } from './request-context';

/** Header chuẩn de-facto để truyền correlation id giữa các service. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * BƯỚC 4 — Correlation id theo từng request.
 *
 * Middleware chạy sớm nhất trong pipeline của Nest (trước guard, interceptor,
 * controller), nên mọi thứ phía sau đều nằm trong context đã mở ở đây.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(@Inject(ROOT_LOGGER) private readonly root: Logger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    /**
     * Ưu tiên id do upstream gửi sang (API gateway, service gọi vào). Nhờ vậy
     * một request đi qua 4 service vẫn chung một id — đó mới là "truy vết từ
     * đầu tới cuối". Tự sinh chỉ khi ta là điểm vào đầu tiên.
     */
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();

    // Trả lại cho client để họ dán vào ticket khi báo lỗi.
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const logger = this.root.child({ requestId });
    const startedAt = process.hrtime.bigint();

    /**
     * `res.on('finish')` chứ không log ngay: lúc này mới biết status code và
     * thời gian xử lý. Một dòng/request với đủ method+url+status+duration là
     * access log tối thiểu nhưng đã đủ để tìm ra request chậm.
     */
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info(
        {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        },
        'request hoàn tất',
      );
    });

    /**
     * `run()` bọc phần còn lại của pipeline: mọi code chạy bên trong `next()`
     * — kể cả sau nhiều tầng `await` — đọc được context này qua
     * `getRequestContext()`. Ra khỏi request thì context tự biến mất, không rò
     * rỉ sang request khác.
     */
    requestContextStorage.run({ requestId, logger }, () => next());
  }
}
