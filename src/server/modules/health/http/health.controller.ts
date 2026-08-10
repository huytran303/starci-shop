import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { HealthService } from '../domain/health.service';

/**
 * Hình dạng JSON trả về cho client. Chỉ tầng http được biết đến nó.
 *
 * Là class chứ không phải interface: interface bị xoá lúc compile nên
 * `@nestjs/swagger` không thấy gì để sinh schema — class + `@ApiProperty`
 * mới hiện shape trong `/docs`.
 */
class HealthResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';
}

/**
 * Tầng HTTP — lớp ngoài cùng.
 *
 * Chỉ làm 3 việc: nhận request, gọi domain, map kết quả sang HTTP.
 * Không có `if` nghiệp vụ, không truy cập DB.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health — liveness probe.
   *
   * Trả 200 kèm `{"status":"ok"}` chừng nào event loop còn phục vụ được
   * request. Load balancer / kubelet chỉ cần đọc status code.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe — không chạm DB' })
  @ApiOkResponse({ type: HealthResponse })
  check(): HealthResponse {
    const { status } = this.healthService.checkLiveness();
    return { status };
  }
}
