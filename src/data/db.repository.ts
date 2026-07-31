import { Injectable, Logger } from '@nestjs/common';

/**
 * Tầng DATA — lớp trong cùng.
 *
 * Chỉ biết cách nói chuyện với datasource. Không biết HTTP, không biết
 * nghiệp vụ, không import bất kỳ thứ gì từ `domain/` hay `http/`.
 *
 * Chưa có DB thật nên `ping()` hiện là no-op. Khi gắn Postgres/Prisma/TypeORM,
 * chỉ file này đổi — `domain/` và `http/` không phải sửa một dòng nào.
 */
@Injectable()
export class DbRepository {
  private readonly logger = new Logger(DbRepository.name);

  /**
   * Kiểm tra datasource có phản hồi không.
   *
   * @returns `true` nếu datasource khoẻ HOẶC chưa được cấu hình
   *          (chưa có gì để hỏng), `false` nếu đã cấu hình mà không gọi được.
   */
  async ping(): Promise<boolean> {
    // TODO: thay bằng `SELECT 1` khi có connection thật.
    return true;
  }

  /** Đóng connection pool khi process shutdown. */
  async disconnect(): Promise<void> {
    this.logger.log('Không có datasource nào đang mở — bỏ qua disconnect');
  }
}
