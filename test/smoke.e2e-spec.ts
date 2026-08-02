import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { get } from 'node:http';
import { resolve } from 'node:path';

/**
 * Smoke test trên **process thật**.
 *
 * Khác với `health.e2e-spec.ts` (dựng app trong bộ nhớ bằng `Test.createTestingModule`),
 * file này `spawn` hẳn một tiến trình Node chạy `src/main.ts`, rồi assert trên
 * stdout/stderr và exit code thật.
 *
 * Vì sao cần: những tiêu chí quan trọng nhất của dự án chỉ tồn tại ở mức
 * process, không thể chứng minh bằng test in-memory —
 *
 *   - `process.exit(1)` khi env sai: test in-memory sẽ giết luôn jest.
 *   - Log là JSON parse được: in-memory không đi qua stdout thật.
 *   - Không có server nào listen khi config hỏng.
 *
 * Đây cũng là thứ một người review (hoặc một grader tự động) chạy được để tự
 * xác minh, thay vì phải tin những dòng log dán trong README.
 */

const ROOT = resolve(__dirname, '..');

/** Env tối thiểu hợp lệ. Mỗi test chỉ làm hỏng đúng một biến từ đây. */
function validEnv(port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'production', // JSON thô, không qua pino-pretty
    PORT: String(port),
    HOST: '127.0.0.1',
    API_PREFIX: 'api',
    DATABASE_URL: 'postgres://smoke:smoke@localhost:5432/smoke',
    JWT_SECRET: 'smoke-test-secret-du-32-ky-tu-khong-dung-that',
    LOG_LEVEL: 'debug', // hạ ngưỡng để thấy cả dòng debug của tầng domain
    // Bỏ type-check lúc chạy cho nhanh; `pnpm build` mới là chỗ gác kiểu.
    TS_NODE_TRANSPILE_ONLY: 'true',
  };
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/** Chạy app tới lúc nó tự thoát. Dùng cho nhánh config sai. */
function runUntilExit(env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((done) => {
    const child = spawn('node', ['-r', 'ts-node/register', 'src/main.ts'], { cwd: ROOT, env });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('exit', (exitCode) => done({ stdout, stderr, exitCode }));
  });
}

interface BootedApp {
  child: ChildProcessWithoutNullStreams;
  /** Mọi dòng stdout đã ghi ra tới thời điểm gọi. */
  stdout: () => string;
  stop: () => Promise<void>;
}

/** Chạy app và đợi tới khi nó thật sự listen. Dùng cho nhánh config đúng. */
function boot(env: NodeJS.ProcessEnv): Promise<BootedApp> {
  return new Promise((done, fail) => {
    const child = spawn('node', ['-r', 'ts-node/register', 'src/main.ts'], { cwd: ROOT, env });
    let out = '';
    let err = '';

    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString();
      // `main.ts` in dòng này ngay sau `await app.listen()`, nên nó là tín hiệu
      // "đã sẵn sàng nhận request" đáng tin hơn mọi khoảng `sleep` áng chừng.
      if (out.includes('đang chạy tại')) {
        done({
          child,
          stdout: () => out,
          stop: () =>
            new Promise<void>((closed) => {
              child.on('exit', () => closed());
              child.kill('SIGTERM');
            }),
        });
      }
    });

    child.on('exit', (code) => fail(new Error(`app thoát sớm với code ${code}\n${err}${out}`)));
  });
}

/** GET một đường dẫn, trả về status + headers + body. */
function httpGet(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((done, fail) => {
    const req = get({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () =>
        done({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body,
        }),
      );
    });
    req.on('error', fail);
  });
}

/** Tách stdout thành các object đã parse. Ném lỗi nếu có dòng không phải JSON. */
function parseLines(stdout: string): Record<string, unknown>[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Đợi log của request kịp ghi ra — `res.on('finish')` chạy sau khi client nhận body. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 300));

describe('SMOKE — config sai thì process chết, không có server nào listen', () => {
  jest.setTimeout(60_000);

  it('DATABASE_URL sai scheme + JWT_SECRET ngắn → exit 1, liệt kê CẢ HAI lỗi', async () => {
    const { stdout, stderr, exitCode } = await runUntilExit({
      ...validEnv(3191),
      DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
      JWT_SECRET: 'ngan',
    });

    // Exit code khác 0 để orchestrator dừng rollout thay vì coi là thành công.
    expect(exitCode).toBe(1);

    expect(stderr).toContain('[FATAL]');
    expect(stderr).toContain('DATABASE_URL');
    expect(stderr).toContain('JWT_SECRET');

    // Sửa một vòng là xong, không phải boot-sửa-boot-sửa từng biến.
    expect(stderr.indexOf('DATABASE_URL')).toBeLessThan(stderr.indexOf('JWT_SECRET'));

    // Mấu chốt của fail-fast: chết TRƯỚC khi Nest kịp dựng xong app.
    expect(stdout).not.toContain('Nest application successfully started');
    expect(stdout).not.toContain('đang chạy tại');
  });

  it('PORT không phải số → exit 1, không listen trên rác', async () => {
    const { stdout, stderr, exitCode } = await runUntilExit({
      ...validEnv(3192),
      PORT: 'ba-nghin',
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('PORT');
    expect(stdout).not.toContain('đang chạy tại');
  });

  it('LOG_LEVEL ngoài danh sách cho phép → exit 1', async () => {
    const { stderr, exitCode } = await runUntilExit({
      ...validEnv(3193),
      LOG_LEVEL: 'chi-tiet',
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('LOG_LEVEL');
  });
});

describe('SMOKE — config đúng: log JSON có correlation id', () => {
  jest.setTimeout(60_000);

  const PORT = 3194;
  let app: BootedApp;

  beforeAll(async () => {
    app = await boot(validEnv(PORT));
  });

  afterAll(async () => {
    await app?.stop();
  });

  it('mọi dòng stdout đều là JSON parse được', () => {
    // `parseLines` ném ngay nếu gặp dòng không phải JSON — kể cả log nội bộ
    // của Nest, thứ mặc định in ra text màu nếu quên `app.useLogger()`.
    const lines = parseLines(app.stdout());

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toHaveProperty('level');
      expect(line).toHaveProperty('time');
      expect(line).toHaveProperty('msg');
      expect(line).toMatchObject({ service: 'starci-shop', env: 'production' });
    }
  });

  it('log nội bộ của Nest cũng thành JSON, không phải text màu', () => {
    const lines = parseLines(app.stdout());

    // Dòng này do chính Nest phát ra, không phải code của ta.
    expect(lines.some((l) => l.context === 'RoutesResolver')).toBe(true);
    expect(lines.some((l) => l.msg === 'Nest application successfully started')).toBe(true);
  });

  it('GET /health trả 200 + x-request-id, và id đó có mặt trong log', async () => {
    const before = app.stdout().length;

    const res = await httpGet(PORT, '/health');
    await settle();

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });

    const requestId = res.headers['x-request-id'];
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

    const fresh = parseLines(app.stdout().slice(before));

    // Dòng debug của tầng domain — `HealthService.checkLiveness()` KHÔNG nhận
    // `req`, vậy mà vẫn mang đúng requestId. Đây là bằng chứng AsyncLocalStorage
    // đưa correlation id xuyên tầng.
    const fromDomain = fresh.find((l) => l.context === 'HealthService');
    expect(fromDomain).toBeDefined();
    expect(fromDomain?.requestId).toBe(requestId);

    // Access log: một dòng/request, đủ để tìm ra request chậm.
    const access = fresh.find((l) => l.msg === 'request hoàn tất');
    expect(access).toMatchObject({
      requestId,
      method: 'GET',
      url: '/health',
      statusCode: 200,
    });
    expect(typeof access?.durationMs).toBe('number');
  });

  it('dùng lại x-request-id của upstream thay vì sinh id mới', async () => {
    const before = app.stdout().length;

    const res = await httpGet(PORT, '/health', { 'x-request-id': 'tu-api-gateway-999' });
    await settle();

    expect(res.headers['x-request-id']).toBe('tu-api-gateway-999');

    const fresh = parseLines(app.stdout().slice(before));
    expect(fresh.every((l) => l.requestId === 'tu-api-gateway-999')).toBe(true);
  });

  it('mỗi request một id khác nhau', async () => {
    const a = await httpGet(PORT, '/health');
    const b = await httpGet(PORT, '/health');

    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  it('secret trong header không lọt vào bất kỳ dòng log nào', async () => {
    const before = app.stdout().length;

    await httpGet(PORT, '/health', {
      authorization: 'Bearer SIEU-BI-MAT-KHONG-DUOC-LOG',
      cookie: 'session=CUNG-BI-MAT',
    });
    await settle();

    const fresh = app.stdout().slice(before);
    expect(fresh).not.toContain('SIEU-BI-MAT-KHONG-DUOC-LOG');
    expect(fresh).not.toContain('CUNG-BI-MAT');
  });

  it('DATABASE_URL không xuất hiện trong log, kể cả lúc tầng data ghi log', async () => {
    // `DbRepository.ping()` chỉ log phần host, không log connection string.
    expect(app.stdout()).not.toContain('smoke:smoke@');
  });

  it('/health nằm ngoài API_PREFIX — probe luôn là /health', async () => {
    await expect(httpGet(PORT, '/health')).resolves.toMatchObject({ status: 200 });
    await expect(httpGet(PORT, '/api/health')).resolves.toMatchObject({ status: 404 });

    // Đợi access log của hai request trên ghi xong, nếu không chúng rơi sang
    // cửa sổ stdout của test kế tiếp và làm test đó đọc nhầm dòng.
    await settle();
  });

  /**
   * Khoá lại một lỗi đã từng có thật: middleware đăng ký qua
   * `MiddlewareConsumer.forRoutes('{*path}')` bị `setGlobalPrefix` áp tiền tố,
   * nên chỉ chạy cho `/api/**` và các route trong `exclude`. `/`, `/favicon.ico`,
   * URL gõ sai — đúng loại traffic cần nhìn thấy nhất — không sinh log nào.
   *
   * Sửa bằng cách gắn ở cấp Express trong `main.ts`. Test này fail nếu ai đó
   * chuyển ngược về `forRoutes()`.
   */
  it.each([
    ['/duong-dan-khong-ton-tai', 404],
    ['/', 404],
    ['/favicon.ico', 404],
    ['/api/bat-ky', 404],
  ])('%s vẫn có access log + x-request-id, dù nằm ngoài /api', async (path, status) => {
    const before = app.stdout().length;

    const res = await httpGet(PORT, path);
    await settle();

    expect(res.status).toBe(status);
    // Không có header này nghĩa là request đã lọt qua mà không ai truy vết được.
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    // Lọc theo url thay vì lấy dòng `request hoàn tất` đầu tiên: cửa sổ stdout
    // có thể còn sót log của request khác.
    const fresh = parseLines(app.stdout().slice(before));
    expect(fresh.find((l) => l.url === path)).toMatchObject({
      msg: 'request hoàn tất',
      statusCode: status,
      requestId: res.headers['x-request-id'],
    });
  });
});
