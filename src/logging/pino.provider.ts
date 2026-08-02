import { type Provider } from '@nestjs/common';
import pino, { type Logger } from 'pino';

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
 */
function createRootLogger(env: EnvService): Logger {
  return pino({
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
     */
    transport: env.isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,service,env',
            messageFormat: '{context} {msg}',
          },
        },
  });
}

export const rootLoggerProvider: Provider = {
  provide: ROOT_LOGGER,
  inject: [EnvService],
  useFactory: createRootLogger,
};
