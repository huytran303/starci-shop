import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
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

  // Toàn bộ wiring nằm ở `configureApp` để e2e dựng được app **giống hệt** app
  // này, thay vì tự chép lại vài dòng rồi trôi khỏi nhau.
  configureApp(app);

  const env = app.get(EnvService);
  const port = env.get('PORT'); // number thật, không phải chuỗi "3000"
  const host = env.get('HOST');

  await app.listen(port, host);

  const logger = app.get(AppLogger);

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
