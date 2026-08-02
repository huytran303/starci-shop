import { Test, TestingModule } from '@nestjs/testing';

import { AppConfigModule } from '../../../config/config.module';
import { LoggingModule } from '../../../logging/logging.module';
import { HealthModule } from '../health.module';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    // Dựng qua chính HealthModule thay vì liệt kê tay từng provider — nhờ vậy
    // test fail luôn nếu wiring của module bị hỏng.
    //
    // Hai module hạ tầng `@Global()` phải có mặt: ở runtime chúng do AppModule
    // nạp, còn ở đây phải khai tường minh. Đây cũng là lời nhắc rằng config và
    // logging là điều kiện cần để bất kỳ phần nào của app dựng lên được.
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, LoggingModule, HealthModule],
    }).compile();
  });

  it('trả về đúng {"status":"ok"}', () => {
    expect(moduleRef.get(HealthController).check()).toEqual({ status: 'ok' });
  });
});
