import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { EnvService } from './config/env.service';
import { AppLogger } from './logging/app-logger.service';

/**
 * BƯỚC 5 — Thứ tự boot.
 *
 * Thứ tự ở đây không phải chuyện thẩm mỹ, nó là hợp đồng:
 *
 *   1. Validate env   → sai thì chết ngay, exit 1 (chạy bên trong `create()`)
 *   2. Dựng logger    → mọi log sau đó có cấu trúc
 *   3. Cấu hình app   → prefix, pipe, shutdown hook
 *   4. Mở cổng lắng nghe
 *
 * Đảo bước 1 xuống dưới = có một khoảng thời gian process đã nhận traffic
 * nhưng config chưa chắc đúng. Đó chính là lỗi mà cả bài này đi diệt.
 */
async function bootstrap(): Promise<void> {
  /**
   * `bufferLogs: true`: Nest giữ lại log của chính nó trong lúc khởi tạo và
   * chỉ xả ra sau khi `useLogger()` được gọi. Không có nó, những dòng đầu tiên
   * in bằng logger mặc định (text màu) rồi mới chuyển sang JSON — log của một
   * lần boot bị lẫn hai định dạng.
   *
   * Nếu chạy tới được dòng này thì env đã hợp lệ: `AppConfigModule` validate
   * ngay lúc module graph được nạp (xem `validateEnvOrExit`), sớm hơn cả đây.
   */
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Từ đây trở đi mọi log — kể cả log nội bộ của Nest — đều là JSON có cấu trúc.
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  const env = app.get(EnvService);
  const port = env.get('PORT'); // number thật, không phải chuỗi "3000"
  const host = env.get('HOST');
  const prefix = env.get('API_PREFIX');

  // Mọi route nghiệp vụ sau này nằm dưới /api. `health` được loại trừ để
  // probe vẫn đúng đường dẫn GET /health mà orchestrator mong đợi.
  app.setGlobalPrefix(prefix, { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Cho phép Nest chạy onModuleDestroy/onApplicationShutdown khi nhận SIGTERM,
  // để pod đóng connection gọn gàng thay vì bị cắt ngang.
  app.enableShutdownHooks();

  await app.listen(port, host);

  logger.log(`StarCi Shop API đang chạy tại http://${host}:${port}`, 'Bootstrap');
  logger.log(`Liveness probe: GET http://${host}:${port}/health`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  /**
   * Lưới an toàn cho mọi lỗi bootstrap KHÁC config: cổng đã bị chiếm, DB từ
   * chối connection... Env sai thì đã thoát từ trước rồi (`validateEnvOrExit`).
   *
   * `console.error` chứ không phải logger: ở nhánh này logger có thể chưa kịp
   * dựng, mà nuốt mất lỗi khởi động là kịch bản tệ nhất.
   */
  console.error('[FATAL] Không khởi động được ứng dụng:', error);
  // Exit code khác 0 để orchestrator biết mà restart / dừng rollout, thay vì
  // coi như process tự nguyện kết thúc thành công.
  process.exit(1);
});
