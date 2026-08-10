import { type Env, envSchema } from './env.schema';

/**
 * Lỗi phát ra khi env không hợp lệ.
 *
 * Có class riêng để `main.ts` phân biệt được "config sai" (lỗi của người vận
 * hành, in message rồi exit 1) với mọi lỗi bootstrap khác (bug, cần stack
 * trace đầy đủ).
 */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * BƯỚC 2 — Validate một lần, fail fast.
 *
 * Hàm này được `ConfigModule.forRoot({ validate })` gọi đúng **một lần** lúc
 * khởi động, với `raw` là `process.env` đã merge với `.env`. Giá trị trả về
 * chính là thứ `ConfigService` phục vụ về sau — nên mọi thứ đi ra từ đây đều
 * đã đúng kiểu và đã coerce.
 *
 * Cố ý KHÔNG `process.exit()` bên trong: hàm thuần thì unit test được. Việc
 * exit là của `main.ts`, xem `bootstrap()`.
 *
 * @throws {EnvValidationError} khi có bất kỳ biến nào thiếu hoặc sai kiểu —
 *         liệt kê **toàn bộ** lỗi một lượt, không dừng ở lỗi đầu tiên.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (result.success) {
    // Đông cứng: không service nào mutate được config lúc runtime.
    return Object.freeze(result.data);
  }

  const details = result.error.issues
    .map((issue) => {
      const key = issue.path.join('.') || '(root)';
      // zod báo 'invalid_type' + received undefined cho biến bị thiếu hẳn.
      const missing = issue.code === 'invalid_type' && !(key in raw);
      return `  - ${key}: ${missing ? 'thiếu biến môi trường bắt buộc' : issue.message}`;
    })
    .join('\n');

  throw new EnvValidationError(
    `Cấu hình môi trường không hợp lệ — không thể khởi động:\n${details}\n` +
      `Xem .env.example để biết danh sách biến bắt buộc.`,
  );
}

/**
 * Bản dùng thật cho `ConfigModule` — in message rồi **kết thúc process**.
 *
 * Vì sao không để lỗi bay lên cho Nest xử lý: Nest bắt lỗi khởi tạo, in stack
 * trace nội bộ của nó (`ExceptionHandler`, `Module._compile`, ...) rồi mới
 * thoát. Người vận hành đang cần đọc đúng một dòng "thiếu DATABASE_URL", chứ
 * không phải 20 dòng stack không liên quan.
 *
 * Ranh giới thiết kế: `validateEnv` thuần và test được; **chỉ** hàm mỏng này
 * biết tới `process.exit`, và nó không được gọi trong test.
 */
export function validateEnvOrExit(raw: Record<string, unknown>): Env {
  try {
    return validateEnv(raw);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(`\n[FATAL] ${error.message}\n`);
      // Khác 0 để orchestrator biết mà dừng rollout / restart, thay vì coi như
      // process tự nguyện kết thúc thành công.
      process.exit(1);
    }
    throw error;
  }
}
