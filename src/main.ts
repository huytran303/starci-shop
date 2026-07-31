import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const port = config.get<number>('PORT', 3000);
  const host = config.get<string>('HOST', '0.0.0.0');
  const prefix = config.get<string>('API_PREFIX', 'api');

  // Mọi route nghiệp vụ sau này nằm dưới /api. `health` được loại trừ để
  // probe vẫn đúng đường dẫn GET /health mà orchestrator mong đợi.
  app.setGlobalPrefix(prefix, { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Cho phép Nest chạy onModuleDestroy/onApplicationShutdown khi nhận SIGTERM,
  // để pod đóng connection gọn gàng thay vì bị cắt ngang.
  app.enableShutdownHooks();

  await app.listen(port, host);

  Logger.log(`StarCi Shop API đang chạy tại http://${host}:${port}`, 'Bootstrap');
  Logger.log(`Liveness probe: GET http://${host}:${port}/health`, 'Bootstrap');
}

void bootstrap();
