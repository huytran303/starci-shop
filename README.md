# StarCi Shop

Fullstack: `src/server` là API NestJS + Postgres, `src/client` giữ chỗ cho
frontend. Dự án chạy theo quy trình spec-driven (SDD) — xem
[`.sdd/constitution.md`](.sdd/constitution.md).

## Kiến trúc

**Feature-first, layer-second.** Mỗi feature là một Nest module riêng; bên
trong module mới chia ba tầng. Quyết định này ghi ở
[`.sdd/rfcs/ADR-001`](.sdd/rfcs/ADR-001-ba-tang-feature-first.md).

```
src/
  client/               chỗ dành cho frontend — hiện là placeholder, chưa có code
  server/               toàn bộ backend NestJS
    main.ts             bootstrap: create -> configureApp -> listen
    app.setup.ts        mọi cấu hình cấp app, một chỗ duy nhất
    app.module.ts       chỉ lắp ráp module, không chứa provider nào

    config/             hạ tầng cross-cutting @Global — cấu hình đã validate
      env.schema.ts     zod schema, NGUỒN SỰ THẬT DUY NHẤT về env
      env.validation.ts validate lúc boot; sai thì exit 1 ngay
      env.service.ts    facade có kiểu: env.get('PORT') là number
      config.module.ts

    logging/            hạ tầng cross-cutting @Global — log JSON + correlation id
      pino.provider.ts          logger gốc, redact secret
      app-logger.service.ts     adapter LoggerService (Nest) -> pino
      request-id.middleware.ts  sinh/nhận x-request-id
      request-context.ts        AsyncLocalStorage giữ id xuyên tầng
      logging.module.ts

    database/           hạ tầng dùng chung, mọi feature đều import
      database.module.ts  exports DbRepository
      db.repository.ts

    modules/            toàn bộ feature nằm ở đây, mỗi thư mục con là 1 module
      health/           một feature = một thư mục = một module
        health.module.ts  đóng gói: khai báo controller + provider, quyết định exports
        http/           health.controller.ts      — chỉ vào/ra HTTP
        domain/         health.service.ts         — nghiệp vụ, không HTTP, không SQL
        data/           health.db.repository.ts   — truy vấn DB của riêng health

.sdd/                   quy trình SDD: constitution, specs, ADR
scripts/                check-constitution.sh — máy kiểm gate L3
docs/                   kiến thức tích luỹ — guides/ tra cứu, qa/ hỏi & đáp
```

`config/` và `logging/` là **hạ tầng cross-cutting**, không thuộc tầng nào
trong ba tầng trên: mọi tầng đều được phép inject `EnvService` và `AppLogger`.
Đây là một trong số ít trường hợp `@Global()` đúng — chúng stateless và
immutable nên không có rủi ro chia sẻ state ngoài ý muốn.

Hai tầng data không lẫn nhau: `src/server/database/` là **hạ tầng** (connection,
pool, transaction) — không thuộc feature nào; `modules/*/data/` là **repository
của feature** — chỗ duy nhất chứa câu truy vấn phục vụ nghiệp vụ đó. `domain/`
chỉ nói chuyện với repository của chính module mình, không cầm trực tiếp
`DbRepository`. Nhờ vậy đổi cách truy cập Postgres chỉ sửa
`src/server/database/`.

Vì sao **không** để phẳng `src/server/{http,domain,data}` ở cấp gốc: tới
feature thứ tư thì `http/` có 4 controller lẫn lộn, `AppModule` gánh 12
provider, và sửa một thứ về "đơn hàng" phải nhảy qua 3 thư mục. Quan trọng hơn,
gom hết vào `AppModule` thì **mất tính đóng gói của Nest**: provider trong một
module vốn là private trừ khi `exports`. Ví dụ hiện tại `HealthService` không
được export nên không feature nào khác inject được nó — đó là ranh giới thật,
do DI container ép, không phải quy ước.

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

## Quy trình SDD

Luật dự án nằm ở [`.sdd/constitution.md`](.sdd/constitution.md) — nguyên tắc:
**rule không có máy kiểm thì chỉ là lời khuyên.** Rule máy kiểm được chạy trong
một lệnh:

```bash
pnpm check    # = check-constitution.sh + lint + test — Definition of Done
```

- Feature mới: copy `.sdd/specs/_template.md` thành
  `.sdd/specs/feat-{name}/SPEC.md` + `TASKS.md` **trước khi code**. Mỗi
  acceptance criterion trong SPEC phải có một test. Ví dụ mẫu:
  [`feat-health`](.sdd/specs/feat-health/SPEC.md).
- Quyết định kiến trúc: `.sdd/rfcs/ADR-NNN-*.md` — viết một lần, không sửa
  lịch sử.
- CI (`.github/workflows/ci.yml`) chạy gitleaks + `pnpm check` + `pnpm build`
  trên mọi PR. Job check **cố ý không có Postgres**: test "unit" nào chạm DB
  sẽ fail ở đó theo cấu tạo.

## Chạy

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres   # Postgres 17, đợi pg_isready mới healthy
pnpm dev                        # watch mode (alias của start:dev)
pnpm build && pnpm start:prod   # chạy bản build
```

Chạy cả app lẫn DB trong Docker (multi-stage build, chi tiết ở
[`docs/qa/010`](docs/qa/010-dockerfile-va-compose-cho-app-nestjs.md)):

```bash
docker compose up --build
```

> **Cổng 3000 có thể đã bị chiếm.** Nếu gặp `EADDRINUSE`, kiểm tra bằng
> `lsof -nP -iTCP:3000 -sTCP:LISTEN` rồi chạy `PORT=3100 pnpm dev`.

> **`dist/` không được tự xoá khi build.** Repo không còn `nest-cli.json`
> (`nest build` chạy bằng default) nên không có `deleteOutDir` — đổi cấu trúc
> thư mục xong `dist/` có thể còn file cũ; lạ lạ thì `rm -rf dist` rồi build
> lại. `tsBuildInfoFile` phải nằm **trong** `dist/` để bị xoá cùng: nếu nó
> sống sót một mình, `tsc` tưởng "không có gì thay đổi" nên không emit gì cả —
> build exit 0 nhưng `pnpm start:prod` báo `Cannot find module dist/main`.

## Cấu hình

Toàn bộ env được khai báo trong **một** zod schema
(`src/server/config/env.schema.ts`) và validate **một lần lúc boot**. Thiếu
hoặc sai một biến thì process in danh sách lỗi rồi thoát với exit code 1 —
không có trạng thái "chạy với config nửa vời".

Chạy `DATABASE_URL=mysql://user:pass@localhost:3306/db JWT_SECRET=ngan pnpm start`:

```
[FATAL] Cấu hình môi trường không hợp lệ — không thể khởi động:
  - DATABASE_URL: DATABASE_URL phải bắt đầu bằng postgres:// hoặc postgresql://
  - JWT_SECRET: JWT_SECRET phải dài tối thiểu 32 ký tự
Xem .env.example để biết danh sách biến bắt buộc.
```

`echo $?` ra `1`. Không có dòng `Starting Nest application` nào phía trên — mọi
lỗi được liệt kê một lượt để sửa một vòng là xong, thay vì boot-sửa-boot-sửa
từng biến. Luồng: `config.module.ts` (`validate: validateEnvOrExit`) →
`env.validation.ts` (`process.exit(1)`). Nó **không** nằm trong `main.ts`:
Nest gọi lúc nạp `ConfigModule`, tức trước cả `NestFactory.create()`.

| Biến | Bắt buộc | Mặc định |
|---|---|---|
| `NODE_ENV` | | `development` |
| `PORT` | | `3000` |
| `HOST` | | `0.0.0.0` |
| `API_PREFIX` | | `api/v1` |
| `DATABASE_URL` | ✅ | — |
| `JWT_SECRET` | ✅ (≥32 ký tự) | — |
| `LOG_LEVEL` | | `info` |

Đọc config **chỉ** qua `EnvService` (`env.get('PORT')` trả về `number` thật, gõ
sai tên biến là lỗi compile) — không `process.env.X` ở bất kỳ đâu khác
(SEC-04, máy kiểm trong `check-constitution.sh`). `.env.test` được commit sẵn
(toàn giá trị giả) để `pnpm test` chạy được trên clone mới.

Thêm một biến mới: xem checklist trong
[`docs/guides/001-config-va-logging.md`](docs/guides/001-config-va-logging.md).

## Logging

Log JSON có cấu trúc qua pino, mỗi request mang một `x-request-id`.

Output thật, chạy `NODE_ENV=production PORT=3198 LOG_LEVEL=debug pnpm start` rồi
`curl -D - -H 'authorization: Bearer SIEU-BI-MAT' http://127.0.0.1:3198/health`:

```
HTTP/1.1 200 OK
x-request-id: 9e16ede4-c5a1-4ad6-bf8b-a7335627802e
```

```json
{"level":"debug","time":"2026-08-02T10:07:55.934Z","service":"starci-shop","env":"production","pid":53805,"requestId":"9e16ede4-c5a1-4ad6-bf8b-a7335627802e","context":"HealthService","msg":"kiểm tra liveness"}
{"level":"info","time":"2026-08-02T10:07:55.935Z","service":"starci-shop","env":"production","pid":53805,"requestId":"9e16ede4-c5a1-4ad6-bf8b-a7335627802e","method":"GET","url":"/health","statusCode":200,"durationMs":1.67,"msg":"request hoàn tất"}
```

Ba thứ đáng chú ý trong hai dòng trên: `requestId` khớp header trả về cho
client; `HealthService.checkLiveness()` **không nhận `req`** mà dòng log của nó
vẫn có id; và chuỗi `SIEU-BI-MAT` không xuất hiện ở bất kỳ đâu.

- Id lấy từ header `x-request-id` của upstream nếu có, không thì tự sinh UUID —
  nhờ vậy một request đi qua nhiều service vẫn chung một id. Id được trả lại
  client qua response header.
- `AsyncLocalStorage` giữ id xuyên các tầng, nên service ở tầng sâu inject
  `AppLogger` là log ra có id, **không phải nhận `req` làm tham số**.
- `redact` che `authorization`, `cookie`, `password`, `DATABASE_URL`,
  `JWT_SECRET`, `token`. Vẫn không được log nguyên `req` hay connection string.
- Ngoài production, `pino-pretty` render lại cho dễ đọc trên terminal.

> **Middleware correlation id gắn bằng `app.use()` trong
> [`src/server/app.setup.ts`](src/server/app.setup.ts), không phải
> `MiddlewareConsumer.forRoutes()`.** Nest áp `setGlobalPrefix` lên cả
> middleware đăng ký kiểu Nest, nên `forRoutes('{*path}')` chỉ khớp `/api/v1/**`
> và các route trong `exclude` — `/`, `/favicon.ico`, URL gõ sai đều không có
> log lẫn `x-request-id`. Đây từng là lỗi thật trong repo này; bộ smoke test
> từng khoá nó đã gỡ cùng `test/` — cẩn trọng khi đụng `app.setup.ts` (LOG-01
> chỉ còn máy kiểm mức grep).

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
`/health` chứ không phải `/api/v1/health`.

## Tài liệu API

```
GET /docs       ->  Swagger UI
GET /docs-json  ->  OpenAPI document (JSON)
```

Sinh từ code lúc boot (`@nestjs/swagger` introspect route graph trong
[`src/server/app.setup.ts`](src/server/app.setup.ts)) nên không có file spec
viết tay để lệch. Mọi route nghiệp vụ nằm dưới `/api/v1` (`API_PREFIX`) — thêm
`v2` sau này không phá client đang gọi `v1`. Endpoint đổi thì decorator swagger
cập nhật trong cùng PR (ARCH-03).

## Kiểm thử

```bash
pnpm test     # unit — *.spec.ts cạnh source, không DB, không network
pnpm lint     # gồm cả kiểm tra chiều phụ thuộc giữa các tầng
pnpm check    # constitution + lint + test — Definition of Done
```

Phân tầng test theo STD-02 trong constitution: unit chạy không cần gì ngoài
`.env.test`; integration (`*.integration.spec.ts`, chạy với Postgres thật) sẽ
thêm khi tầng data có driver thật; bộ e2e/smoke trong `test/` đã gỡ — các đảm
bảo mức process (exit code, stdout JSON thật, middleware chạy mọi route) hiện
**không còn test khoá**, sẽ khoá lại khi `test/` hồi sinh.

## Bằng chứng

Mỗi đảm bảo dưới đây trỏ tới code thi hành nó và test/máy kiểm khoá nó lại.
Chạy `pnpm check` để tự xác minh, không phải tin những dòng log dán trong
README này.

| Đảm bảo | Thi hành ở | Khoá bởi |
|---|---|---|
| zod validate **một lần** lúc boot, không nuốt lỗi | `config/env.schema.ts`, `config/env.validation.ts` | `config/env.validation.spec.ts` (7 test) |
| `GET /health` trả 200 `{"status":"ok"}`, không chạm DB | `modules/health/` | `health.controller.spec.ts`, `health.service.spec.ts` |
| `requestId` đi xuyên tầng qua child logger + ALS | `logging/request-id.middleware.ts`, `logging/request-context.ts` | `logging/request-id.middleware.spec.ts` |
| Nhận lại `x-request-id` của upstream, không sinh mới | `logging/request-id.middleware.ts` | `logging/request-id.middleware.spec.ts` |
| Secret bị che, không lọt vào log | `logging/pino.provider.ts` (`redact`) | `logging/pino.provider.spec.ts` — 12 test, mỗi path một test |
| `LOG_LEVEL` lọc output theo ngưỡng | `logging/pino.provider.ts` | `logging/pino.provider.spec.ts` (3 test) |
| Chiều phụ thuộc `http → domain → data` | `eslint.config.mjs` (`no-restricted-imports`) | `pnpm lint` |
| `process.env` chỉ trong `config/`; `console.*` chỉ ở đường boot-fatal | quy ước SEC-04 / ARCH-01 | `scripts/check-constitution.sh` |
| Middleware requestId mount cho **mọi** route (`app.use`) | `app.setup.ts` | `check-constitution.sh` (grep — khoá hành vi đầy đủ chờ e2e hồi sinh) |

Đảm bảo "env sai → exit 1, không listen" và "mọi dòng log là JSON parse được"
từng được khoá bằng smoke test spawn process thật — đã gỡ cùng `test/`, xem
mục Kiểm thử.

## Thêm một tính năng mới

Ví dụ `products` — theo SDD, đi từ spec vào trong rồi ra ngoài:

0. Viết `.sdd/specs/feat-products/SPEC.md` + `TASKS.md` (copy từ
   `_template.md`) — hành vi, edge case, acceptance criteria **trước khi code**
1. `data/product.db.repository.ts` — truy vấn DB, trả về dữ liệu thô
2. `domain/product.service.ts` — quy tắc nghiệp vụ (giá, tồn kho, giảm giá)
3. `http/product.controller.ts` — route, DTO + validation, map response
4. `products.module.ts` — `imports: [DatabaseModule]`, khai báo controller +
   provider. Chỉ `exports` thứ mà feature khác thật sự cần
5. Thêm `ProductsModule` vào `imports` của `app.module.ts` — **một dòng**
6. Mỗi acceptance criterion một test; `pnpm check` xanh là Done

Rule lint dùng glob `src/server/**/<layer>/**` nên áp dụng tự động cho mọi
feature mới, không phải khai báo lại.

Feature mới **không** cần khai báo gì cho config và logging: `AppConfigModule`
và `LoggingModule` là `@Global()`, chỉ việc inject `EnvService` / `AppLogger`.

## Tài liệu

- [`.sdd/`](.sdd/constitution.md) — luật dự án, specs từng feature, ADR.
- [`docs/guides/`](docs/README.md) — tổng hợp theo chủ đề, đọc một file là đủ
  dùng. Hiện có: [Config & Logging](docs/guides/001-config-va-logging.md).
- [`docs/qa/`](docs/README.md) — từng câu hỏi kiến thức kèm câu trả lời đầy đủ
  (khái niệm, pattern, đánh đổi thiết kế, vì sao code làm theo cách này).
