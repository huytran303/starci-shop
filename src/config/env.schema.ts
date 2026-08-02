import { z } from 'zod';

/**
 * BƯỚC 1 — Một schema duy nhất cho toàn bộ biến môi trường.
 *
 * Đây là **nguồn sự thật duy nhất** về config. Sau file này, không chỗ nào
 * trong `src/` được phép đọc `process.env.X` nữa: muốn thêm một biến thì thêm
 * vào đây, tự động có kiểu, có default, có validate.
 *
 * Vì sao `z.coerce.number()` chứ không phải `z.number()`:
 * `process.env` luôn trả về **string**. `PORT=3000` trong `.env` là chuỗi
 * `"3000"`. `z.number()` sẽ báo lỗi ngay, còn `z.coerce.number()` ép về số
 * rồi mới validate — nên phía sau ta cầm đúng `number`, không phải string
 * đội lốt number như `config.get<number>('PORT')` trước đây.
 */
export const envSchema = z.object({
  /**
   * Quyết định format log (pretty ở dev, JSON ở prod) và các nhánh hành vi
   * khác. Không default thành 'production' — mặc định an toàn là dev.
   */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Cổng HTTP. `.int().positive().max(65535)` chặn `PORT=abc` và `PORT=-1`. */
  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  /** 0.0.0.0 để container bên ngoài gọi vào được. */
  HOST: z.string().min(1).default('0.0.0.0'),

  /** Tiền tố route nghiệp vụ. `/health` luôn nằm ngoài tiền tố này. */
  API_PREFIX: z.string().min(1).default('api'),

  /**
   * Connection string tới Postgres.
   *
   * KHÔNG có default: đây chính là ví dụ trong đề bài — thiếu `DATABASE_URL`
   * thì process phải chết ngay lúc boot, chứ không phải làm hỏng một đơn hàng
   * giữa lúc checkout.
   */
  DATABASE_URL: z
    .url({ error: 'DATABASE_URL phải là một URL hợp lệ, ví dụ postgres://user:pass@host:5432/db' })
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      error: 'DATABASE_URL phải bắt đầu bằng postgres:// hoặc postgresql://',
    }),

  /**
   * Khoá ký JWT. `min(32)` không phải trang trí: một secret 8 ký tự là lỗi
   * bảo mật, và ta muốn nó bị chặn lúc boot chứ không phải lúc pentest.
   */
  JWT_SECRET: z.string().min(32, { error: 'JWT_SECRET phải dài tối thiểu 32 ký tự' }),

  /** Ngưỡng log của pino. `silent` tắt hẳn — chỉ dùng trong test. */
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/**
 * Kiểu config đã validate, suy ra thẳng từ schema.
 *
 * Thêm một biến vào `envSchema` là `Env` tự có thêm field — không có file
 * interface thứ hai để quên cập nhật.
 */
export type Env = z.infer<typeof envSchema>;
