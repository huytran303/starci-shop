import { DbRepository } from '../../../database/db.repository';
import { HealthDbRepository } from './health.db.repository';

describe('HealthDbRepository', () => {
  it('uỷ quyền cho connection dùng chung', async () => {
    const db = { ping: jest.fn().mockResolvedValue(true) } as unknown as DbRepository;

    await expect(new HealthDbRepository(db).ping()).resolves.toBe(true);
    expect(db.ping).toHaveBeenCalledTimes(1);
  });
});
