import { Test, TestingModule } from '@nestjs/testing';

import { HealthModule } from '../health.module';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    // Dựng qua chính HealthModule thay vì liệt kê tay từng provider — nhờ vậy
    // test fail luôn nếu wiring của module bị hỏng.
    moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
  });

  it('trả về đúng {"status":"ok"}', () => {
    expect(moduleRef.get(HealthController).check()).toEqual({ status: 'ok' });
  });
});
