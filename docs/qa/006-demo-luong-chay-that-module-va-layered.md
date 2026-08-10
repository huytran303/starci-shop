# 006 — Demo luồng chạy thật: logging, module pattern, layered pattern

**Ngày:** 2026-08-02
**Từ khoá:** demo, logging, correlation id, module pattern, layered pattern, exports, fail-fast

## Câu hỏi

demo luồng hoạt động của dự án để tôi hiểu hơn về logging và phân chia theo
module pattern và layered pattern

## Trả lời

Khác với [003](003-luong-code-tu-main-den-response.md) (đọc code theo từng
dòng), bài này chạy app thật và đối chiếu output với thiết kế. Mọi đoạn log
dưới đây là output thật, không phải ví dụ bịa.

---

### 1. Boot — thứ tự không thể đảo

```
validate env  →  dựng logger  →  config app  →  listen()
   ↓ sai
 exit 1
```

Chạy `PORT=ba-nghin`:

```
[FATAL] Cấu hình môi trường không hợp lệ — không thể khởi động:
  - PORT: Invalid input: expected number, received NaN
Xem .env.example để biết danh sách biến bắt buộc.
```

Không có dòng `Starting Nest application` nào phía trên. Process chết **trước
khi** module graph dựng xong, vì `validate: validateEnvOrExit`
(`src/config/config.module.ts`) được Nest gọi lúc nạp `ConfigModule` — sớm hơn
cả `NestFactory.create()`. Không tồn tại trạng thái "đã mở cổng nhưng config
sai".

Tương tự với `DATABASE_URL=mysql://a/b`:

```
  - DATABASE_URL: DATABASE_URL phải bắt đầu bằng postgres:// hoặc postgresql://
```

Log boot khi env hợp lệ:

```
[07:35:19.567] INFO: NestFactory Starting Nest application...
[07:35:19.567] INFO: InstanceLoader AppConfigModule dependencies initialized
[07:35:19.567] INFO: InstanceLoader LoggingModule dependencies initialized
[07:35:19.567] INFO: InstanceLoader DatabaseModule dependencies initialized
[07:35:19.567] INFO: InstanceLoader HealthModule dependencies initialized
[07:35:19.567] INFO: RoutesResolver HealthController {/api/health}:
[07:35:19.567] INFO: RouterExplorer Mapped {/health, GET} route
[07:35:19.567] INFO: Bootstrap StarCi Shop API đang chạy tại http://0.0.0.0:3055
```

13 dòng **cùng một timestamp** — đó là `bufferLogs: true`: Nest giữ log nội bộ
trong buffer, tới khi `app.useLogger()` chạy mới xả một lượt qua pino. Đổi lại
log boot không lẫn hai định dạng, nhưng timestamp là lúc *flush* chứ không phải
lúc *xảy ra*. Xem [005](005-vi-sao-log-boot-cua-nest-trong-khac-thuong.md).

Thứ tự init cũng đúng như `imports` mô tả: config → logging → database → health.

---

### 2. Logging

#### 2a. Correlation id đi xuyên tầng mà không luồn tham số

```
$ curl -D - http://127.0.0.1:3055/health
HTTP/1.1 200 OK
x-request-id: 503aa621-2314-488c-8e14-af694d96cacf
{"status":"ok"}
```

```
DEBUG: HealthService kiểm tra liveness  {"requestId":"503aa621-2314-488c-8e14-af694d96cacf"}
INFO:  request hoàn tất  {"requestId":"503aa621-...","method":"GET","url":"/health","statusCode":200,"durationMs":2.35}
```

Điểm mấu chốt — `HealthService.checkLiveness()` **không nhận `req`**, chữ ký
hoàn toàn thuần nghiệp vụ, nhưng dòng log của nó vẫn có `requestId`:

```
RequestIdMiddleware
  └─ requestContextStorage.run({ requestId, logger }, () => next())
       │  AsyncLocalStorage — giữ context xuyên await/promise/setTimeout
       ↓
     HealthController → HealthService → HealthDbRepository → DbRepository
                                                    ↑
              AppLogger.logger getter:
              getRequestContext()?.logger ?? this.root
```

Nếu thay bằng `req.log`, mọi hàm từ controller xuống data đều phải thêm một
tham số. Quên một chỗ = dòng log đó mất correlation, và chỉ phát hiện lúc đang
chữa cháy sự cố.

#### 2b. Nhận id từ upstream

```
$ curl -H 'x-request-id: trace-tu-gateway-abc123' \
       -H 'authorization: Bearer SIEU-BI-MAT' http://127.0.0.1:3055/health
x-request-id: trace-tu-gateway-abc123      ← trả lại nguyên, không sinh mới
```

```
DEBUG: HealthService kiểm tra liveness  {"requestId":"trace-tu-gateway-abc123"}
INFO:  request hoàn tất  {"requestId":"trace-tu-gateway-abc123",...,"durationMs":0.25}
```

Middleware ưu tiên header đến, chỉ `randomUUID()` khi ta là điểm vào đầu tiên
— nhờ vậy một request đi qua 4 service vẫn chung một id.

Chuỗi `SIEU-BI-MAT` **không xuất hiện ở bất kỳ dòng log nào**: middleware chỉ
log field đã chọn lọc, và `redact` trong `pino.provider.ts` là lưới thứ hai.

#### 2c. Cùng một logger, hai cách render

Dev (`pino-pretty`):
```
[07:35:53.061] DEBUG: HealthService kiểm tra liveness {"requestId":"503aa621-..."}
```

Production (`NODE_ENV=production`):
```json
{"level":"debug","time":"2026-08-02T07:36:18.410Z","service":"starci-shop","env":"production","pid":45361,"requestId":"prod-demo-1","context":"HealthService","msg":"kiểm tra liveness"}
{"level":"info","time":"2026-08-02T07:36:18.413Z","service":"starci-shop","env":"production","pid":45361,"requestId":"prod-demo-1","method":"GET","url":"/health","statusCode":200,"durationMs":3.79,"msg":"request hoàn tất"}
```

`service`/`env`/`pid` đến từ `base` — gắn tự động vào mọi dòng. Ở Loki/ELK,
`requestId="prod-demo-1"` trả về đúng toàn bộ vòng đời của một request.

Log **nội bộ của Nest** cũng thành JSON (`"context":"RoutesResolver"`) — công
của `app.useLogger(AppLogger)` cộng với `AppLogger.split()` tách tham số context
cuối cùng thành field thay vì nối vào message.

---

### 3. Module pattern — ranh giới theo *tính năng*

```
src/
├── config/      ┐
├── logging/     ├─ hạ tầng cross-cutting (@Global)
├── database/    ┘
└── modules/
    └── health/  ← một feature = một thư mục = một *.module.ts
```

`app.module.ts` chỉ có `imports: [AppConfigModule, LoggingModule, HealthModule]`.
Thêm `ProductsModule` = tạo thư mục + thêm **một dòng**. File này không phình
theo số provider.

**Ranh giới thật nằm ở `exports`**, không phải ở thư mục:

| Module | providers | exports | Hệ quả |
|---|---|---|---|
| `HealthModule` | `HealthService`, `HealthDbRepository` | *(không có)* | Feature khác **không inject được** — muốn dùng chung phải khai báo tường minh |
| `DatabaseModule` | `DbRepository` | `DbRepository` | Mọi feature import để dùng connection chung |
| `LoggingModule` | `ROOT_LOGGER`, `AppLogger`, middleware | `ROOT_LOGGER`, `AppLogger` | `@Global` — không ai phải `imports: [LoggingModule]` |

`@Global()` dùng cho `config` và `logging` là hợp lý vì cả hai **stateless +
immutable** và thật sự cross-cutting; bắt mỗi module `imports: [LoggingModule]`
chỉ tạo nhiễu chứ không tạo ranh giới có ích. Ranh giới giữa `@Global` hợp lý và
lạm dụng: xem [002](002-singleton-vs-global-module.md).

`LoggingModule implements NestModule` tự đăng ký middleware của mình — `AppModule`
không cần biết logging có middleware. Thêm/bớt chỉ sửa một file.

---

### 4. Layered pattern — hướng phụ thuộc một chiều

```
http/    HealthController      ← biết HTTP, status code, JSON shape
  │                              KHÔNG có if nghiệp vụ, KHÔNG chạm DB
  ↓
domain/  HealthService         ← quy tắc nghiệp vụ thuần
  │                              KHÔNG biết status code / request / response
  ↓
data/    HealthDbRepository    ← query của riêng feature này
  │
  ↓
         DbRepository          ← hạ tầng dùng chung (src/database/)
```

Mũi tên **chỉ đi xuống**. `domain/` không import gì từ `http/`, `data/` không
import gì từ `domain/`.

Kiểm chứng bằng kiểu dữ liệu — hai interface cố ý tách đôi dù hiện giống hệt:

```ts
// http/health.controller.ts  — hình dạng JSON, chỉ tầng http biết
interface HealthResponse { status: 'ok' }

// domain/health.service.ts   — kết quả nghiệp vụ, không phải HTTP response
export interface HealthStatus { readonly status: 'ok' }
```

Giống nhau chính là lúc dễ bị cám dỗ gộp lại. Nhưng khi domain thêm
`{ status, uptimeSeconds, checkedAt }` mà HTTP contract vẫn chỉ trả `{ status }`,
việc tách đôi này là thứ giữ cho đổi nghiệp vụ không vô tình phá vỡ API công khai.

**Hai loại tầng data — dễ nhầm:**

- `src/database/db.repository.ts` — hạ tầng: connection, pool, transaction.
  Không thuộc feature nào.
- `src/modules/health/data/health.db.repository.ts` — chỗ **duy nhất** chứa
  query của nghiệp vụ health.

Nhờ vậy: đổi Postgres → Prisma chỉ sửa tầng hạ tầng; đổi cách kiểm tra
datasource chỉ sửa file feature. `domain/` không sửa dòng nào trong cả hai
trường hợp.

**Liveness vs readiness** — layered pattern phục vụ quyết định nghiệp vụ, không
phải trang trí:

```ts
checkLiveness(): HealthStatus        // cố tình KHÔNG hỏi DB
async checkReadiness(): Promise<boolean> { return this.db.ping() }  // mới được hỏi
```

Nếu liveness phụ thuộc DB, DB sập → orchestrator giết và restart **toàn bộ
fleet** một cách vô ích trong khi lỗi nằm chỗ khác.

---

### 5. Global prefix

```
GET /health      → 200
GET /api/health  → 404
```

`app.setGlobalPrefix(prefix, { exclude: ['health'] })`: route nghiệp vụ nằm
dưới `/api`, riêng `/health` giữ nguyên đường dẫn mà kubelet/LB mong đợi.

Bẫy trong log boot: `RoutesResolver` in `HealthController {/api/health}:` (chưa
áp dụng exclude) rồi `RouterExplorer` mới in `Mapped {/health, GET} route`.
**Dòng thứ hai mới là sự thật.** Đọc nhầm dòng đầu là nguồn gốc của "probe 404
mà log bảo đã map đúng".

Request 404 vẫn có access log đầy đủ:

```
INFO: request hoàn tất {"requestId":"90e2b9d9-...","method":"GET","url":"/api/health","statusCode":404,"durationMs":0.31}
```

> **Cập nhật:** lúc viết bài này, middleware còn đăng ký bằng
> `consumer.apply(...).forRoutes('{*path}')` trong `LoggingModule`, và câu trên
> chỉ đúng một nửa: `setGlobalPrefix` áp tiền tố lên cả middleware kiểu Nest,
> nên `/api/health` có log còn `/` hay `/favicon.ico` thì **không**. Xem
> [007](007-global-prefix-nuot-middleware.md) — middleware nay gắn ở
> `src/app.setup.ts` bằng `app.use()`.

---

### Cách tự chạy lại demo

```bash
# Log đầy đủ tới tầng debug
LOG_LEVEL=debug pnpm dev

# JSON thô như production
NODE_ENV=production LOG_LEVEL=debug pnpm dev

# Xem fail-fast
PORT=ba-nghin pnpm dev
```
