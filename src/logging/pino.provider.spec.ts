import type { Env } from '../config/env.schema';
import type { EnvService } from '../config/env.service';
import { createRootLogger } from './pino.provider';

/**
 * ĐẢM BẢO 3: secret không lọt vào log — chứng minh trên **logger thật**.
 *
 * Điểm khác biệt với cách test cũ trong `request-id.middleware.spec.ts`: ở đó
 * test tự dựng một `pino()` với `redact` viết tay, nên nó chỉ chứng minh tính
 * năng redact của pino hoạt động. Xoá sạch khối `redact` khỏi `pino.provider.ts`
 * thì test đó vẫn xanh.
 *
 * File này gọi đúng `createRootLogger` mà `rootLoggerProvider` dùng lúc chạy
 * thật, nên mọi assert dưới đây là assert trên cấu hình production.
 */

/** `EnvService` giả — chỉ cần `get` và `isProduction`. */
function fakeEnv(overrides: Partial<Env> = {}): EnvService {
  const values: Env = {
    NODE_ENV: 'production',
    PORT: 3000,
    HOST: '0.0.0.0',
    API_PREFIX: 'api',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    LOG_LEVEL: 'debug',
    ...overrides,
  };

  return {
    get: <K extends keyof Env>(key: K): Env[K] => values[key],
    get isProduction() {
      return values.NODE_ENV === 'production';
    },
  } as EnvService;
}

/** Dựng logger thật, thu mọi dòng nó ghi ra thành object đã parse. */
function capture(overrides: Partial<Env> = {}): {
  logger: ReturnType<typeof createRootLogger>;
  lines: Record<string, unknown>[];
} {
  const lines: Record<string, unknown>[] = [];
  const logger = createRootLogger(fakeEnv(overrides), {
    write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>),
  });
  return { logger, lines };
}

describe('createRootLogger — ĐẢM BẢO 3: mọi dòng là JSON hợp lệ', () => {
  it('mỗi dòng ghi ra parse được bằng JSON.parse', () => {
    const { logger, lines } = capture();

    // `capture` đã `JSON.parse` từng chunk — dòng nào không phải JSON thì
    // test này ném lỗi ngay tại đây chứ không tới được assert.
    logger.info({ orderId: 'don-1' }, 'tạo đơn hàng');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ orderId: 'don-1', msg: 'tạo đơn hàng' });
  });

  it('gắn sẵn service/env/pid vào mọi dòng, không phải truyền lại mỗi lần', () => {
    const { logger, lines } = capture({ NODE_ENV: 'production' });

    logger.info('bất kỳ');

    expect(lines[0]).toMatchObject({ service: 'starci-shop', env: 'production' });
    expect(lines[0].pid).toBe(process.pid);
  });

  it('level là chữ chứ không phải số — log store query được `level="error"`', () => {
    const { logger, lines } = capture();

    logger.error('hỏng');

    // pino mặc định in `"level":50`; formatter trong provider đổi thành chữ.
    expect(lines[0].level).toBe('error');
  });

  it('time là ISO-8601, không phải epoch millis', () => {
    const { logger, lines } = capture();

    logger.info('bất kỳ');

    expect(lines[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });
});

describe('createRootLogger — ĐẢM BẢO 3: redact che đúng những gì đã hứa', () => {
  /**
   * Bảng này chính là danh sách `redact.paths` trong `pino.provider.ts`.
   * Xoá một path khỏi provider = một dòng ở đây đỏ.
   */
  const secrets: Array<[string, Record<string, unknown>, string]> = [
    [
      'req.headers.authorization',
      { req: { headers: { authorization: 'Bearer SIEU-BI-MAT' } } },
      'SIEU-BI-MAT',
    ],
    ['req.headers.cookie', { req: { headers: { cookie: 'session=BI-MAT' } } }, 'BI-MAT'],
    ['headers.authorization', { headers: { authorization: 'Bearer SIEU-BI-MAT' } }, 'SIEU-BI-MAT'],
    ['headers.cookie', { headers: { cookie: 'session=BI-MAT' } }, 'BI-MAT'],
    ['password', { password: 'mat-khau-that' }, 'mat-khau-that'],
    ['*.password', { user: { password: 'mat-khau-that' } }, 'mat-khau-that'],
    ['JWT_SECRET', { JWT_SECRET: 'khoa-ky-that' }, 'khoa-ky-that'],
    ['*.JWT_SECRET', { config: { JWT_SECRET: 'khoa-ky-that' } }, 'khoa-ky-that'],
    ['DATABASE_URL', { DATABASE_URL: 'postgres://u:mat-khau@h/db' }, 'mat-khau'],
    ['*.DATABASE_URL', { config: { DATABASE_URL: 'postgres://u:mat-khau@h/db' } }, 'mat-khau'],
    ['token', { token: 'gia-tri-token' }, 'gia-tri-token'],
    ['*.token', { session: { token: 'gia-tri-token' } }, 'gia-tri-token'],
  ];

  it.each(secrets)('che %s', (_path, payload, secret) => {
    const { logger, lines } = capture();

    logger.info(payload, 'nhận request');

    // Kiểm cả dòng đã serialize: secret không được xuất hiện ở BẤT KỲ đâu,
    // kể cả bị lồng trong một field khác.
    expect(JSON.stringify(lines[0])).not.toContain(secret);
    expect(JSON.stringify(lines[0])).toContain('[ĐÃ CHE]');
  });

  it('censor chứ không xoá — debug vẫn thấy field đó CÓ tồn tại', () => {
    const { logger, lines } = capture();

    logger.info({ headers: { authorization: 'Bearer x' } }, 'nhận request');

    expect(lines[0]).toMatchObject({ headers: { authorization: '[ĐÃ CHE]' } });
  });

  it('field bình thường không bị che oan', () => {
    const { logger, lines } = capture();

    logger.info({ userId: 'u-1', headers: { 'content-type': 'application/json' } }, 'ok');

    expect(lines[0]).toMatchObject({
      userId: 'u-1',
      headers: { 'content-type': 'application/json' },
    });
  });
});

describe('createRootLogger — LOG_LEVEL là ngưỡng lọc, không phải chọn một mức', () => {
  it('LOG_LEVEL=info nuốt dòng debug, giữ info trở lên', () => {
    const { logger, lines } = capture({ LOG_LEVEL: 'info' });

    logger.debug('chi tiết vụn vặt');
    logger.info('sự kiện đáng chú ý');
    logger.error('có chuyện hỏng');

    expect(lines.map((l) => l.msg)).toEqual(['sự kiện đáng chú ý', 'có chuyện hỏng']);
  });

  it('LOG_LEVEL=debug mở thêm dòng debug — đây là lý do demo phải hạ ngưỡng', () => {
    const { logger, lines } = capture({ LOG_LEVEL: 'debug' });

    logger.debug('kiểm tra liveness');

    expect(lines.map((l) => l.msg)).toEqual(['kiểm tra liveness']);
  });

  it('LOG_LEVEL=silent tắt hẳn — dùng cho test', () => {
    const { logger, lines } = capture({ LOG_LEVEL: 'silent' });

    logger.fatal('kể cả fatal');

    expect(lines).toHaveLength(0);
  });
});
