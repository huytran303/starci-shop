import type { NextFunction, Request, Response } from 'express';
import pino, { type Logger } from 'pino';

import { AppLogger } from './app-logger.service';
import { getRequestContext } from './request-context';
import { REQUEST_ID_HEADER, RequestIdMiddleware } from './request-id.middleware';

/** Gom mọi dòng pino ghi ra thành object để assert — không cần đọc stdout. */
function memoryLogger(): { logger: Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'debug', redact: { paths: ['headers.authorization'], censor: '[ĐÃ CHE]' } },
    { write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>) },
  );
  return { logger, lines };
}

function fakeReq(headers: Record<string, string> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/health',
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function fakeRes(): { res: Response; headers: Record<string, string>; finish: () => void } {
  const headers: Record<string, string> = {};
  let onFinish: () => void = () => {};
  const res = {
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    on: (event: string, cb: () => void) => {
      if (event === 'finish') onFinish = cb;
    },
  } as unknown as Response;
  return { res, headers, finish: () => onFinish() };
}

describe('RequestIdMiddleware — ĐẢM BẢO 2: mọi dòng log của một request có cùng id', () => {
  it('sinh requestId, trả về qua header và gắn vào mọi dòng log', () => {
    const { logger, lines } = memoryLogger();
    const middleware = new RequestIdMiddleware(logger);
    const app = new AppLogger(logger);
    const { res, headers, finish } = fakeRes();

    middleware.use(fakeReq(), res, (() => {
      // Đây là "tầng sâu": không nhận req, không nhận logger nào cả.
      app.log('đang xử lý', 'HealthService');
    }) as NextFunction);
    finish();

    const requestId = headers[REQUEST_ID_HEADER];
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

    // Dòng của service + dòng "request hoàn tất" — cùng một id.
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.requestId)).toEqual([requestId, requestId]);
    expect(lines[1]).toMatchObject({ method: 'GET', url: '/health', statusCode: 200 });
  });

  it('dùng lại x-request-id từ upstream để truy vết xuyên service', () => {
    const { logger, lines } = memoryLogger();
    const middleware = new RequestIdMiddleware(logger);
    const { res, headers, finish } = fakeRes();

    middleware.use(
      fakeReq({ [REQUEST_ID_HEADER]: 'tu-api-gateway' }),
      res,
      (() => {}) as NextFunction,
    );
    finish();

    expect(headers[REQUEST_ID_HEADER]).toBe('tu-api-gateway');
    expect(lines[0].requestId).toBe('tu-api-gateway');
  });

  it('context tự dọn khi ra khỏi request — không rò rỉ sang request sau', () => {
    const { logger } = memoryLogger();
    const middleware = new RequestIdMiddleware(logger);
    const { res } = fakeRes();

    let insideId: string | undefined;
    middleware.use(fakeReq(), res, (() => {
      insideId = getRequestContext()?.requestId;
    }) as NextFunction);

    expect(insideId).toBeDefined();
    expect(getRequestContext()).toBeUndefined();
  });

  it('log ngoài request vẫn chạy, chỉ là không có requestId', () => {
    const { logger, lines } = memoryLogger();

    new AppLogger(logger).log('bootstrap xong', 'Bootstrap');

    expect(lines[0]).toMatchObject({ context: 'Bootstrap', msg: 'bootstrap xong' });
    expect(lines[0].requestId).toBeUndefined();
  });

  it('redact che secret thay vì in ra log', () => {
    const { logger, lines } = memoryLogger();

    logger.info({ headers: { authorization: 'Bearer sieu-bi-mat' } }, 'nhận request');

    expect(JSON.stringify(lines[0])).not.toContain('sieu-bi-mat');
    expect(lines[0]).toMatchObject({ headers: { authorization: '[ĐÃ CHE]' } });
  });
});
