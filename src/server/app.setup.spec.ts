import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/**
 * Controller mồi chỉ tồn tại trong test này: `/health` bị loại khỏi prefix có
 * chủ đích (probe contract), nên cần một route "nghiệp vụ" thật để chứng minh
 * biên `/api/v1` hoạt động — không thêm route giả vào production chỉ để test.
 */
@Controller('ping')
class PingController {
  @Get()
  ping(): { pong: boolean } {
    return { pong: true };
  }
}

/**
 * Smoke test cho wiring cấp app: dựng đúng `AppModule` + `configureApp` như
 * production (xem lý do ở đầu `app.setup.ts`) rồi bắn HTTP thật qua supertest.
 */
describe('configureApp', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PingController],
    }).compile();

    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('route nghiệp vụ nằm dưới /api/v1, không còn ở gốc', async () => {
    await request(app.getHttpServer()).get('/api/v1/ping').expect(200, { pong: true });
    await request(app.getHttpServer()).get('/ping').expect(404);
  });

  it('/health vẫn ngoài prefix — probe contract không đổi', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('GET /docs trả Swagger UI', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('GET /docs-json trả OpenAPI document khớp route thật', async () => {
    const { body } = await request(app.getHttpServer()).get('/docs-json').expect(200);

    expect(body.openapi).toMatch(/^3\./);
    expect(body.info.title).toBe('StarCi Shop API');
    // Path trong doc phải là đường thật: route thường mang prefix, health thì không.
    expect(Object.keys(body.paths)).toContain('/api/v1/ping');
    expect(Object.keys(body.paths)).toContain('/health');
    // DTO có @ApiProperty nên schema phải hiện trong doc.
    expect(body.components.schemas.HealthResponse).toBeDefined();
  });
});
