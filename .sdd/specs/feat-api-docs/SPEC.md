# SPEC: feat-api-docs

## Vấn đề
Frontend (và app mobile sau này) phải đọc code server mới biết có endpoint gì.
API cũng chưa có biên version: thêm v2 sau này là phá client đang gọi. Cần API
tự mô tả (OpenAPI sinh từ code, không phải file viết tay sẽ lệch) và một
namespace có version để tiến hóa.

## Hành vi
- Mọi route nghiệp vụ nằm dưới `/api/v1` — `API_PREFIX` đổi default thành
  `api/v1`. `/health` vẫn nằm NGOÀI prefix (giữ probe contract của
  feat-health).
- `GET /docs` → 200, Swagger UI. `GET /docs-json` → OpenAPI document sinh bằng
  introspect route graph lúc boot (`SwaggerModule.createDocument`) — luôn khớp
  code đang chạy.
- Swagger setup chạy SAU `setGlobalPrefix` để path trong doc khớp đường thật.
- Controller có `@ApiTags` / `@ApiOkResponse`; response shape là class có
  `@ApiProperty` để schema hiện trong doc.

## Acceptance criteria
- [x] `GET /docs` trả 200 — `app.setup.spec.ts`
- [x] `GET /docs-json` trả OpenAPI 3.x với title "StarCi Shop API" —
      `app.setup.spec.ts`
- [x] Route controller thường nằm dưới prefix: `GET /api/v1/<route>` 200 còn
      `GET /<route>` 404 — `app.setup.spec.ts`
- [x] `GET /health` vẫn 200 ngoài prefix — `app.setup.spec.ts`
- [x] Doc liệt kê route đã prefix dưới `/api/v1/...` và schema response của
      health — `app.setup.spec.ts`

## Ngoài phạm vi
- `enableVersioning` per-route (`@Version("1")`) — một prefix tĩnh đủ đến khi
  thật sự có v2.
- Auth bảo vệ `/docs` — cân nhắc khi deploy môi trường nhạy cảm.
- Export `/docs-json` vào CI để diff breaking change.
- CLI plugin `@nestjs/swagger` tự suy `@ApiProperty` — thêm khi số DTO đủ nhiều
  để boilerplate thành vấn đề.

## Changelog
- v1.0.0 (2026-08-10) — spec khởi tạo
