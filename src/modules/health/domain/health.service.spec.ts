import { HealthDbRepository } from '../data/health.db.repository';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('liveness không hỏi tầng data', () => {
    const db = { ping: jest.fn() } as unknown as HealthDbRepository;

    expect(new HealthService(db).checkLiveness()).toEqual({ status: 'ok' });
    expect(db.ping).not.toHaveBeenCalled();
  });

  it('readiness uỷ quyền cho repository', async () => {
    const db = { ping: jest.fn().mockResolvedValue(false) } as unknown as HealthDbRepository;

    await expect(new HealthService(db).checkReadiness()).resolves.toBe(false);
    expect(db.ping).toHaveBeenCalledTimes(1);
  });
});
