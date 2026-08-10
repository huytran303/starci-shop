# SPEC: feat-health

> Ví dụ mẫu end-to-end của repo, ghi lại SAU khi code đã ship. Các feature sau
> viết SPEC trước khi code.

## Vấn đề
Orchestrator (Kubernetes, compose healthcheck) cần biết process còn sống
không, mà không kéo theo trạng thái của dependency.

## Hành vi
- `GET /health` → 200 `{"status":"ok"}` — liveness, cố ý KHÔNG chạm DB: DB sập
  mà liveness fail thì cả fleet restart liên tục, biến sự cố DB thành sự cố
  toàn hệ thống.
- `/health` nằm NGOÀI `API_PREFIX` — đường probe luôn là `/health`, không phải
  `/api/health`.
- Response mang `x-request-id` như mọi route khác (LOG-01).

## Acceptance criteria
- [x] `GET /health` trả 200 `{"status":"ok"}` — `http/health.controller.spec.ts`
- [x] Liveness không gọi repository — `domain/health.service.spec.ts`
- [x] Readiness gọi `ping()` của repository — `domain/health.service.spec.ts`,
      `data/health.db.repository.spec.ts`

## Ngoài phạm vi
Endpoint `GET /ready` (readiness probe) — mở khi tầng data có driver Postgres
thật; `HealthService.checkReadiness()` đã chờ sẵn.

## Changelog
- v1.0.0 (2026-08-10) — ghi lại từ code có sẵn
