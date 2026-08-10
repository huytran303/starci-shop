import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { EnvService } from './config/env.service';
import { AppLogger } from './logging/app-logger.service';
import { RequestIdMiddleware } from './logging/request-id.middleware';

/**
 * Toàn bộ cấu hình cấp app, tách khỏi `main.ts` để **test dùng lại được**.
 *
 * Vì sao cần tồn tại: `main.ts` chỉ chạy ở process thật, còn e2e in-memory
 * dựng app bằng `Test.createTestingModule()`. Nếu wiring nằm hết trong
 * `bootstrap()`, hai đường đi đó trôi khỏi nhau — test xanh trên một app
 * **không giống** app đang chạy production, và đúng thứ nó bỏ sót (ở đây là
 * middleware correlation id) lại là thứ nó lẽ ra phải bảo vệ.
 *
 * Quy tắc: mọi thứ chạm vào `app` đều thuộc về file này. `main.ts` chỉ còn
 * `create` -> `configureApp` -> `listen`.
 */
export function configureApp(app: INestApplication): INestApplication {
  // Từ đây trở đi mọi log — kể cả log nội bộ của Nest — đều là JSON có cấu trúc.
  app.useLogger(app.get(AppLogger));

  /**
   * Correlation id cho **mọi** request, gắn ở cấp Express chứ không qua
   * `MiddlewareConsumer.forRoutes()`.
   *
   * Lý do: middleware đăng ký kiểu Nest bị `setGlobalPrefix` áp tiền tố vào,
   * nên nó bỏ sót mọi thứ ngoài `/api` — `/`, `/favicon.ico`, URL gõ sai. Đăng
   * ký ở đây thì nó chạy trước router, không đường dẫn nào lọt.
   *
   * Phải đứng TRƯỚC `setGlobalPrefix`: Express chạy middleware theo đúng thứ
   * tự đăng ký.
   */
  const requestId = app.get(RequestIdMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) => requestId.use(req, res, next));

  // Mọi route nghiệp vụ nằm dưới /api. `health` được loại trừ để probe vẫn
  // đúng đường dẫn GET /health mà orchestrator mong đợi.
  app.setGlobalPrefix(app.get(EnvService).get('API_PREFIX'), { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Cho phép Nest chạy onModuleDestroy/onApplicationShutdown khi nhận SIGTERM,
  // để pod đóng connection gọn gàng thay vì bị cắt ngang.
  app.enableShutdownHooks();

  return app;
}
