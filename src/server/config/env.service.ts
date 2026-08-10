import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * Facade có kiểu trên `ConfigService`.
 *
 * Vì sao không dùng thẳng `ConfigService`:
 * `config.get<number>('PORT')` nhận **magic string** và generic `<number>`
 * ở đó chỉ là type assertion — gõ sai `'PROT'` vẫn compile, và kiểu trả về là
 * thứ ta tự khai chứ không phải sự thật.
 *
 * Ở đây `key` bị ràng vào `keyof Env` nên gõ sai là **lỗi compile**, còn kiểu
 * trả về suy ra từ schema: `env.get('PORT')` là `number`, `env.get('HOST')`
 * là `string`, không phải do ai đó nhớ đúng.
 */
@Injectable()
export class EnvService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Đọc một biến đã validate. Không bao giờ `undefined` — schema đã bảo đảm. */
  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  /** `true` khi NODE_ENV=production. Dùng để chọn format log, bật/tắt pretty. */
  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}
