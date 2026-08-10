import { type Provider } from '@nestjs/common';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

import { EnvService } from '../config/env.service';

/** Token DI cho pino logger gốc. */
export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

/**
 * BƯỚC 3 — Logger JSON có cấu trúc, redact secret.
 *
 * Một dòng log ở production trông như:
 * `{"level":30,"time":...,"service":"starci-shop","requestId":"...","msg":"..."}`
 * — máy đọc được, nên Loki/ELK query `requestId="..."` ra đúng mọi dòng của
 * một request. `console.log` không làm được điều đó ở quy mô lớn.
 *
 * `destination` chỉ dùng cho test: nó cho phép `pino.provider.spec.ts` assert
 * trên **chính cấu hình này** (đúng danh sách `redact`, đúng `base`, đúng ngưỡng
 * `LOG_LEVEL`) thay vì dựng một pino riêng trong test — thứ chỉ chứng minh pino
 * chạy được chứ không chứng minh logger của dự án che đúng secret.
 *
 * Không truyền `destination` khi có `transport` (pino ném lỗi nếu có cả hai);
 * ở production `transport` vốn đã `undefined` nên không xung đột.
 */
export function createRootLogger(env: EnvService, destination?: DestinationStream): Logger {
  // Kiểu tường minh vì `options` bị tách khỏi lời gọi `pino()`: không có nó,
  // `formatters.level` mất kiểu tham số suy ra và tsc báo TS7006.
  const options: LoggerOptions = {
    level: env.get('LOG_LEVEL'),

    // Gắn vào MỌI dòng log, không phải nhớ truyền lại mỗi lần.
    base: {
      service: 'starci-shop',
      env: env.get('NODE_ENV'),
      pid: process.pid,
    },

    /**
     * Chặn secret lọt vào log.
     *
     * Đây không phải phòng xa: `logger.info({ req })` là câu lệnh người ta viết
     * theo phản xạ, và nó in nguyên `authorization: Bearer <token>` vào log —
     * chỗ mà cả team đọc được, và log thường được ship sang bên thứ ba.
     *
     * `censor` thay vì `remove` để lúc debug vẫn thấy field đó CÓ tồn tại.
     */
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        'password',
        '*.password',
        'JWT_SECRET',
        '*.JWT_SECRET',
        'DATABASE_URL',
        '*.DATABASE_URL',
        'token',
        '*.token',
      ],
      censor: '[ĐÃ CHE]',
    },

    // Level dạng chữ ('info') thay vì số (30) — dễ query hơn ở phía log store.
    formatters: {
      level: (label) => ({ level: label }),
    },

    timestamp: pino.stdTimeFunctions.isoTime,

    /**
     * Đánh đổi có chủ đích: JSON thô đúng cho production nhưng khó đọc khi
     * dev đang nhìn terminal. `pino-pretty` chỉ bật ngoài production — cùng
     * một logger, chỉ khác cách render.
     *
     * Có `destination` (tức đang trong test) thì cũng bỏ `transport`: pino
     * không cho phép cả hai, và test cần đọc JSON thô chứ không phải chuỗi đã
     * tô màu.
     */
    transport:
      env.isProduction || destination
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'HH:MM:ss.l',
              // `context` phải nằm trong `ignore`: `messageFormat` đã in nó ra
              // đầu dòng rồi, không có dòng này thì nó hiện HAI lần —
              // `RoutesResolver Mapped ... {"context":"RoutesResolver"}`.
              ignore: 'pid,service,env,context',
              // `{if}...{end}`: dòng nào không có `context` (log từ middleware)
              // thì không bị thừa khoảng trắng ở đầu message.
              messageFormat: '{if context}{context} {end}{msg}',
            },
          },
  };

  return destination ? pino(options, destination) : pino(options);
}

export const rootLoggerProvider: Provider = {
  provide: ROOT_LOGGER,
  inject: [EnvService],
  // Nest chỉ truyền `EnvService`; `destination` bỏ trống nên chạy thật vẫn ghi
  // ra stdout như cũ.
  useFactory: (env: EnvService) => createRootLogger(env),
};
