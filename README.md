# StarCi Shop — Backend

NestJS API chia ba tầng. Mọi tính năng sau này (sản phẩm, giỏ hàng, đơn hàng,
thanh toán) đều đi theo đúng khuôn này.

## Kiến trúc

**Feature-first, layer-second.** Mỗi feature là một Nest module riêng; bên
trong module mới chia ba tầng.

```
src/
  main.ts               bootstrap: dựng logger -> cấu hình app -> listen
  app.module.ts         chỉ lắp ráp module, không chứa provider nào

  config/               hạ tầng cross-cutting @Global — cấu hình đã validate
    env.schema.ts       zod schema, NGUỒN SỰ THẬT DUY NHẤT về env
    env.validation.ts   validate lúc boot; sai thì exit 1 ngay
    env.service.ts      facade có kiểu: env.get('PORT') là number
    config.module.ts

  logging/              hạ tầng cross-cutting @Global — log JSON + correlation id
    pino.provider.ts          logger gốc, redact secret
    app-logger.service.ts     adapter LoggerService (Nest) -> pino
    request-id.middleware.ts  sinh/nhận x-request-id
    request-context.ts        AsyncLocalStorage giữ id xuyên tầng
    logging.module.ts

  database/             hạ tầng dùng chung, mọi feature đều import
    database.module.ts  exports DbRepository
    db.repository.ts

  modules/              toàn bộ feature nằm ở đây, mỗi thư mục con là 1 module
    health/             một feature = một thư mục = một module
      health.module.ts  đóng gói: khai báo controller + provider, quyết định exports
      http/             health.controller.ts      — chỉ vào/ra HTTP
      domain/           health.service.ts         — nghiệp vụ, không HTTP, không SQL
      data/             health.db.repository.ts   — truy vấn DB của riêng health

    products/           thêm feature mới = thêm đúng một thư mục theo khuôn này
      http/ domain/ data/ + products.module.ts

docs/                   kiến thức tích luỹ — guides/ tra cứu, qa/ hỏi & đáp
```

`config/` và `logging/` là **hạ tầng cross-cutting**, không thuộc tầng nào
trong ba tầng trên: mọi tầng đều được phép inject `EnvService` và `AppLogger`.
Đây là một trong số ít trường hợp `@Global()` đúng — chúng stateless và
immutable nên không có rủi ro chia sẻ state ngoài ý muốn.

Hai tầng data không lẫn nhau: `src/database/` là **hạ tầng** (connection, pool,
transaction) — không thuộc feature nào; `modules/*/data/` là **repository của
feature** — chỗ duy nhất chứa câu truy vấn phục vụ nghiệp vụ đó. `domain/` chỉ
nói chuyện với repository của chính module mình, không cầm trực tiếp
`DbRepository`. Nhờ vậy đổi Postgres sang Prisma chỉ sửa `src/database/`.

Vì sao **không** để phẳng `src/{http,domain,data}` ở cấp gốc: tới feature thứ
tư thì `src/http/` có 4 controller lẫn lộn, `AppModule` gánh 12 provider, và
sửa một thứ về "đơn hàng" phải nhảy qua 3 thư mục. Quan trọng hơn, gom hết vào
`AppModule` thì **mất tính đóng gói của Nest**: provider trong một module vốn
là private trừ khi `exports`. Ví dụ hiện tại `HealthService` không được export
nên không feature nào khác inject được nó — đó là ranh giới thật, do DI
container ép, không phải quy ước.

Chiều phụ thuộc **chỉ đi vào trong**:

```
http  ──▶  domain  ──▶  data
```

- `data` không được import `domain` hay `http`
- `domain` không được import `http`
- `http` không được gọi thẳng `data` — phải qua `domain`

Quy tắc này được **ép bằng ESLint** (`no-restricted-imports` trong
`eslint.config.mjs`), nên `pnpm lint` sẽ fail nếu ai đó vẽ mũi tên ngược —
không phụ thuộc vào việc nhớ hay review thủ công.

## Chạy

```bash
pnpm install
cp .env.example .env
pnpm dev                # watch mode (alias của start:dev)
pnpm start              # chạy một lần
pnpm build && pnpm start:prod
```

> **Cổng 3000 có thể đã bị chiếm.** Nếu gặp `EADDRINUSE`, kiểm tra bằng
> `lsof -nP -iTCP:3000 -sTCP:LISTEN` rồi chạy `PORT=3100 pnpm dev`.

> **`tsBuildInfoFile` phải nằm trong `dist/`.** `nest-cli.json` đặt
> `deleteOutDir: true` nên `dist/` bị xoá mỗi lần build. Nếu file
> `.tsbuildinfo` nằm ngoài `dist/`, nó sống sót qua lần xoá đó và `tsc` sẽ
> tưởng "không có gì thay đổi" nên **không emit gì cả** — build vẫn exit 0
> nhưng `pnpm start` báo `Cannot find module dist/main`. Đừng chuyển nó ra
> ngoài `dist/`.

## Cấu hình

Toàn bộ env được khai báo trong **một** zod schema (`src/config/env.schema.ts`)
và validate **một lần lúc boot**. Thiếu hoặc sai một biến thì process in danh
sách lỗi rồi thoát với exit code 1 — không có trạng thái "chạy với config nửa
vời":

```
[FATAL] Cấu hình môi trường không hợp lệ — không thể khởi động:
  - DATABASE_URL: thiếu biến môi trường bắt buộc
  - JWT_SECRET: thiếu biến môi trường bắt buộc
```

| Biến | Bắt buộc | Mặc định |
|---|---|---|
| `NODE_ENV` | | `development` |
| `PORT` | | `3000` |
| `HOST` | | `0.0.0.0` |
| `API_PREFIX` | | `api` |
| `DATABASE_URL` | ✅ | — |
| `JWT_SECRET` | ✅ (≥32 ký tự) | — |
| `LOG_LEVEL` | | `info` |

Đọc config **chỉ** qua `EnvService` (`env.get('PORT')` trả về `number` thật, gõ
sai tên biến là lỗi compile) — không `process.env.X` ở bất kỳ đâu khác.
`.env.test` được commit sẵn (toàn giá trị giả) để `pnpm test` chạy được trên
clone mới.

Thêm một biến mới: xem checklist trong
[`docs/guides/001-config-va-logging.md`](docs/guides/001-config-va-logging.md).

## Logging

Log JSON có cấu trúc qua pino, mỗi request mang một `x-request-id`:

```json
{"level":"debug","requestId":"abc-123","context":"HealthService","msg":"kiểm tra liveness"}
{"level":"info","requestId":"abc-123","method":"GET","url":"/health","statusCode":200,"durationMs":3.9}
```

- Id lấy từ header `x-request-id` của upstream nếu có, không thì tự sinh UUID —
  nhờ vậy một request đi qua nhiều service vẫn chung một id. Id được trả lại
  client qua response header.
- `AsyncLocalStorage` giữ id xuyên các tầng, nên service ở tầng sâu inject
  `AppLogger` là log ra có id, **không phải nhận `req` làm tham số**.
- `redact` che `authorization`, `cookie`, `password`, `DATABASE_URL`,
  `JWT_SECRET`. Vẫn không được log nguyên `req` hay connection string.
- Ngoài production, `pino-pretty` render lại cho dễ đọc trên terminal.

> **Log boot của Nest đều mang cùng một timestamp.** Đó là do `bufferLogs:
> true` — buffer được xả một lượt sau `useLogger()`, nên timestamp là lúc
> flush. Thứ tự vẫn đúng; đừng dùng nó để đo thời gian khởi động. Chi tiết:
> [`docs/qa/005`](docs/qa/005-vi-sao-log-boot-cua-nest-trong-khac-thuong.md).

## Health check

```
GET /health  ->  200  {"status":"ok"}
```

Đây là **liveness probe**: trả lời câu hỏi "process này còn sống không?".
Nó cố tình **không** kiểm tra database.

Lý do: liveness fail nghĩa là Kubernetes sẽ giết và restart pod. Nếu ta cho
liveness phụ thuộc vào DB, thì lúc DB sập toàn bộ fleet sẽ restart liên tục
trong khi lỗi nằm ở chỗ khác — biến một sự cố DB thành một sự cố toàn hệ thống.

Việc kiểm tra dependency thuộc về **readiness** ("instance này nhận traffic
được chưa?"). `HealthService.checkReadiness()` đã có sẵn và gọi
`HealthDbRepository.ping()`; endpoint `GET /ready` sẽ được mở khi gắn DB thật.

`/health` nằm **ngoài** tiền tố `API_PREFIX`, nên đường dẫn probe luôn là
`/health` chứ không phải `/api/health`.

## Kiểm thử

```bash
pnpm test        # unit — logic từng tầng, chạy cô lập
pnpm test:e2e    # e2e  — bật app thật, gọi HTTP thật
pnpm lint        # gồm cả kiểm tra chiều phụ thuộc giữa các tầng
```

## Thêm một tính năng mới

Ví dụ `products` — tạo `src/modules/products/`, đi từ trong ra ngoài:

1. `data/product.db.repository.ts` — truy vấn DB, trả về dữ liệu thô
2. `domain/product.service.ts` — quy tắc nghiệp vụ (giá, tồn kho, giảm giá)
3. `http/product.controller.ts` — route, DTO + validation, map response
4. `products.module.ts` — `imports: [DatabaseModule]`, khai báo controller +
   provider. Chỉ `exports` thứ mà feature khác thật sự cần
5. Thêm `ProductsModule` vào `imports` của `app.module.ts` — **một dòng**

Rule lint dùng glob `src/**/<layer>/**` nên áp dụng tự động cho mọi feature
mới, không phải khai báo lại.

Feature mới **không** cần khai báo gì cho config và logging: `AppConfigModule`
và `LoggingModule` là `@Global()`, chỉ việc inject `EnvService` / `AppLogger`.

## Tài liệu

[`docs/`](docs/README.md) lưu kiến thức tích luỹ trong quá trình làm dự án:

- [`docs/guides/`](docs/README.md) — tổng hợp theo chủ đề, đọc một file là đủ
  dùng. Hiện có: [Config & Logging](docs/guides/001-config-va-logging.md).
- [`docs/qa/`](docs/README.md) — từng câu hỏi kiến thức kèm câu trả lời đầy đủ
  (khái niệm, pattern, đánh đổi thiết kế, vì sao code làm theo cách này).
