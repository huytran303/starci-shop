import { Injectable } from '@nestjs/common';

import { HealthDbRepository } from '../data/health.db.repository';

/** Kết quả nghiệp vụ thuần — không phải HTTP response. */
export interface HealthStatus {
  readonly status: 'ok';
}

/**
 * Tầng DOMAIN — quy tắc nghiệp vụ.
 *
 * Phụ thuộc vào trong (`data/` của chính module này), không bao giờ ra ngoài:
 * không import `@nestjs/common`'s HttpException, không biết status code, không
 * biết request/response, cũng không cầm trực tiếp connection dùng chung.
 */
@Injectable()
export class HealthService {
  constructor(private readonly db: HealthDbRepository) {}

  /**
   * Liveness: "process này còn sống không?"
   *
   * Cố tình KHÔNG phụ thuộc vào DB. Liveness fail nghĩa là orchestrator sẽ
   * giết và restart pod — nếu DB sập mà ta báo fail, cả fleet sẽ restart vô
   * ích trong khi lỗi nằm ở chỗ khác. Việc kiểm tra dependency là của
   * readiness, xem `checkReadiness()`.
   */
  checkLiveness(): HealthStatus {
    return { status: 'ok' };
  }

  /**
   * Readiness: "instance này nhận traffic được chưa?"
   *
   * Ở đây mới được phép hỏi tầng data. Chưa expose ra HTTP — sẽ có endpoint
   * riêng `/ready` khi DB thật được gắn vào.
   */
  async checkReadiness(): Promise<boolean> {
    return this.db.ping();
  }
}
