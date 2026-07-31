import { Test, TestingModule } from '@nestjs/testing';

import { DbRepository } from '../data/db.repository';
import { HealthService } from '../domain/health.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, DbRepository],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('trả về đúng {"status":"ok"}', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
