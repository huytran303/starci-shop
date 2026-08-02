import { Injectable } from '@nestjs/common';

import { DbRepository } from '../../../database/db.repository';

/**
 * Tầng DATA của riêng feature `health` — lớp trong cùng của module.
 *
 * Khác biệt với `DbRepository` ở `src/database/`: cái kia là hạ tầng dùng
 * chung (connection, transaction, pool), không thuộc feature nào. File này là
 * chỗ duy nhất chứa câu truy vấn phục vụ nghiệp vụ health.
 *
 * Nhờ vậy `domain/` chỉ nói chuyện với repository của chính mình, không cầm
 * trực tiếp connection — đổi Postgres sang Prisma chỉ sửa tầng hạ tầng, đổi
 * cách kiểm tra datasource chỉ sửa file này.
 */
@Injectable()
export class HealthDbRepository {
  constructor(private readonly db: DbRepository) {}

  /**
   * Datasource có phản hồi không.
   *
   * @returns `true` nếu datasource khoẻ HOẶC chưa được cấu hình
   *          (chưa có gì để hỏng), `false` nếu đã cấu hình mà không gọi được.
   */
  async ping(): Promise<boolean> {
    // TODO: thay bằng `SELECT 1` khi có connection thật.
    return this.db.ping();
  }
}
