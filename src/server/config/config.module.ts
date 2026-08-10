import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EnvService } from './env.service';
import { validateEnvOrExit } from './env.validation';

/**
 * Module config của ứng dụng.
 *
 * `@Global()` ở đây là hợp lý (khác với việc lạm dụng `@Global` cho mọi thứ,
 * xem `docs/qa/002`): config là hạ tầng cross-cutting, gần như module nào
 * cũng cần, và nó **stateless + immutable** nên không có rủi ro state dùng
 * chung ngoài ý muốn.
 *
 * `validate: validateEnvOrExit` là mấu chốt: Nest gọi nó **một lần** ngay khi
 * module graph được nạp, trước cả `NestFactory.create()`. Env sai = process
 * chết tại đó, không bao giờ lên tới `listen()`. Đây chính là "fail fast" —
 * không có trạng thái "boot nửa vời".
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // Đọc `.env` (và `.env.<NODE_ENV>` nếu có) trước khi validate.
      envFilePath: ['.env.local', `.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validate: validateEnvOrExit,
      // `cache: true` để `ConfigService.get` không đi lại process.env mỗi lần.
      cache: true,
      // Không cần `isGlobal` vì chính module này đã `@Global()` và export
      // `EnvService` — app code nói chuyện với EnvService, không với ConfigService.
    }),
  ],
  providers: [EnvService],
  exports: [EnvService],
})
export class AppConfigModule {}
