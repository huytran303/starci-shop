import type { AppLogger } from '../../../logging/app-logger.service';
import { HealthDbRepository } from '../data/health.db.repository';
import { HealthService } from './health.service';

/** Logger giả — unit test không cần pino thật, chỉ cần gọi được. */
const stubLogger = (): AppLogger =>
  ({ log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) as unknown as AppLogger;

describe('HealthService', () => {
  it('liveness không hỏi tầng data', () => {
    const db = { ping: jest.fn() } as unknown as HealthDbRepository;

    expect(new HealthService(db, stubLogger()).checkLiveness()).toEqual({ status: 'ok' });
    expect(db.ping).not.toHaveBeenCalled();
  });

  it('readiness uỷ quyền cho repository', async () => {
    const db = { ping: jest.fn().mockResolvedValue(false) } as unknown as HealthDbRepository;

    await expect(new HealthService(db, stubLogger()).checkReadiness()).resolves.toBe(false);
    expect(db.ping).toHaveBeenCalledTimes(1);
  });
});
