import { Injectable } from '@nestjs/common';

import { EnvService } from '../config/env.service';
import { AppLogger } from '../logging/app-logger.service';

/**
 * Tầng DATA — lớp trong cùng.
 *
 * Chỉ biết cách nói chuyện với datasource. Không biết HTTP, không biết
 * nghiệp vụ, không import bất kỳ thứ gì từ `domain/` hay `http/`.
 *
 * Chưa có DB thật nên `ping()` hiện là no-op. Khi gắn Postgres/Prisma/TypeORM,
 * chỉ file này đổi — `domain/` và `http/` không phải sửa một dòng nào.
 *
 * Chú ý hai thứ vừa được inject vào đây:
 * - `EnvService`: connection string đến qua DI, không phải `process.env.DATABASE_URL`
 *   rải rác trong file. Muốn biết ai đọc config nào thì đọc constructor là đủ.
 * - `AppLogger`: log ra từ lớp sâu nhất này vẫn mang `requestId` của request
 *   đang chạy, dù chữ ký hàm không hề nhận `req` — đó là công của
 *   `AsyncLocalStorage`.
 */
@Injectable()
export class DbRepository {
  constructor(
    private readonly env: EnvService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Kiểm tra datasource có phản hồi không.
   *
   * @returns `true` nếu datasource khoẻ HOẶC chưa được cấu hình
   *          (chưa có gì để hỏng), `false` nếu đã cấu hình mà không gọi được.
   */
  async ping(): Promise<boolean> {
    // Log field có cấu trúc, không nối chuỗi: log store query được theo `host`.
    // KHÔNG log nguyên `DATABASE_URL` — nó chứa mật khẩu. (Kể cả lỡ log, pino
    // `redact` cũng đã che, nhưng không dựa vào lưới an toàn để viết ẩu.)
    this.logger.debug(`ping datasource ${this.datasourceHost}`, DbRepository.name);

    // TODO: thay bằng `SELECT 1` khi có connection thật.
    return true;
  }

  /** Đóng connection pool khi process shutdown. */
  async disconnect(): Promise<void> {
    this.logger.log('Không có datasource nào đang mở — bỏ qua disconnect', DbRepository.name);
  }

  /** Chỉ phần host:port của DATABASE_URL — an toàn để log. */
  private get datasourceHost(): string {
    return new URL(this.env.get('DATABASE_URL')).host;
  }
}
