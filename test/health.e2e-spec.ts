import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { REQUEST_ID_HEADER } from '../src/logging/request-id.middleware';

describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    // Dùng đúng wiring của `main.ts` (prefix, pipe, middleware correlation id)
    // thay vì chép lại vài dòng — chép lại chính là cách test từng xanh trên
    // một app thiếu middleware.
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('trả 200 kèm {"status":"ok"}', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('không bị dính tiền tố /api', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(404);
  });

  it('trả requestId về cho client qua x-request-id', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    // Client dán id này vào ticket là ta grep ra đúng mọi dòng log của họ.
    expect(res.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mỗi request một id khác nhau', async () => {
    const a = await request(app.getHttpServer()).get('/health');
    const b = await request(app.getHttpServer()).get('/health');

    expect(a.headers[REQUEST_ID_HEADER]).not.toBe(b.headers[REQUEST_ID_HEADER]);
  });

  it('giữ nguyên id do upstream truyền sang', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set(REQUEST_ID_HEADER, 'id-tu-gateway');

    expect(res.headers[REQUEST_ID_HEADER]).toBe('id-tu-gateway');
  });
});
