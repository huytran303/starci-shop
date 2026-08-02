# Guide 001 — Config & Logging trong StarCi Shop

**Cập nhật:** 2026-08-02

Tài liệu tổng hợp: đọc file này là nắm được toàn bộ cách dự án xử lý cấu hình
và log, cùng lý do đằng sau từng lựa chọn.

Hỏi–đáp gốc dẫn tới thiết kế này: [`qa/001`](../qa/001-cau-hinh-dong-config-module.md),
[`qa/004`](../qa/004-typed-config-va-structured-logging.md).

---

## 1. Hai đảm bảo

Mọi thứ dưới đây tồn tại để giữ đúng hai lời hứa:

| # | Đảm bảo | Nếu vi phạm |
|---|---|---|
| 1 | Config sai → shop **không boot** | Một `DATABASE_URL` sai làm hỏng đơn hàng giữa lúc checkout, thay vì chặn lúc deploy |
| 2 | Mọi dòng log của một request mang **cùng một id** | Có log nhưng không dựng lại được đường đi của request nào cả |

---

## 2. Bản đồ file

```
src/config/
  env.schema.ts       zod schema — NGUỒN SỰ THẬT DUY NHẤT về config
  env.validation.ts   validateEnv (thuần) + validateEnvOrExit (in + exit 1)
  env.service.ts      facade có kiểu trên ConfigService
  config.module.ts    @Global — ConfigModule.forRoot({ validate })

src/logging/
  request-context.ts        AsyncLocalStorage<{ requestId, logger }>
  pino.provider.ts          logger gốc: JSON, redact, pretty ở dev
  app-logger.service.ts     adapter LoggerService (Nest) -> pino
  request-id.middleware.ts  sinh/nhận requestId, mở ALS context
  logging.module.ts         @Global — đăng ký middleware cho '{*path}'

.env.example   tài liệu, được commit
.env.test      giá trị giả cho test, ĐƯỢC commit
.env           thật, KHÔNG commit
```

Cả hai module đều `@Global()`. Đây là một trong số ít trường hợp `@Global()`
đúng: config và logging là cross-cutting thật sự, **stateless và immutable**,
nên không có rủi ro chia sẻ state ngoài ý muốn (so sánh với [`qa/002`](../qa/002-singleton-vs-global-module.md)).

---

## 3. Config

### 3.1 Vòng đời

```
node dist/main.js
  └─ require('./app.module')
       └─ require('./config/config.module')
            └─ ConfigModule.forRoot({ validate: validateEnvOrExit })   ← CHẠY Ở ĐÂY
                 ├─ đọc .env.local → .env.<NODE_ENV> → .env
                 ├─ merge với process.env (process.env thắng)
                 └─ validateEnvOrExit(config)
                      ├─ hợp lệ  → Object.freeze(data), Nest dùng làm nguồn cho ConfigService
                      └─ sai     → console.error + process.exit(1)   ← DỪNG TẠI ĐÂY
  └─ bootstrap()
       └─ NestFactory.create(...)     ← chỉ tới được đây khi env đã hợp lệ
```

Điểm quan trọng: validate chạy **lúc nạp module graph**, sớm hơn cả
`NestFactory.create()`. Không có cửa sổ thời gian nào mà process đã nhận
traffic trong khi config chưa chắc đúng.

### 3.2 Thêm một biến env mới — checklist

1. Thêm field vào `envSchema` trong `src/config/env.schema.ts`.
2. Bắt buộc thì **không đặt `.default()`**; tuỳ chọn thì đặt default hợp lý.
3. Thêm dòng tương ứng vào `.env.example` (kèm comment giải thích).
4. Thêm giá trị giả vào `.env.test` nếu biến đó bắt buộc.
5. Dùng qua `env.get('TEN_BIEN')` — **không** đọc `process.env` ở bất kỳ đâu khác.

Kiểu tự có, không cần khai báo interface thứ hai: `Env = z.infer<typeof envSchema>`.

### 3.3 Quy tắc viết schema

| Tình huống | Dùng |
|---|---|
| Số | `z.coerce.number().int()` — **không bao giờ** `z.number()` |
| Boolean | `z.coerce.boolean()` hoặc `z.enum(['true','false']).transform(...)` |
| Tập giá trị cố định | `z.enum([...])` |
| URL | `z.url()` + `.refine()` cho scheme cụ thể |
| Secret | `z.string().min(32)` — chặn secret rác ngay lúc boot |

`process.env` **luôn** là string. `PORT=3000` là chuỗi `"3000"`. Không coerce
thì `app.listen("3000")` vẫn chạy (Express tự ép) nhưng phép toán nào trên nó
cũng sai âm thầm.

### 3.4 Vì sao có `EnvService` chứ không dùng thẳng `ConfigService`

```ts
config.get<number>('PORT')   // ❌ magic string; <number> chỉ là type assertion
env.get('PORT')              // ✅ key ràng vào keyof Env; kiểu suy ra từ schema
env.get('PROT')              // ✅ lỗi COMPILE, không phải undefined lúc runtime
```

### 3.5 Vì sao tách `validateEnv` và `validateEnvOrExit`

- `validateEnv` — thuần, ném `EnvValidationError`. Unit test được.
- `validateEnvOrExit` — mỏng, chỉ in message + `process.exit(1)`. Không gọi
  trong test.

Nếu để lỗi bay lên cho Nest xử lý, Nest in stack trace nội bộ của nó
(`ExceptionHandler`, `Module._compile`...) rồi mới thoát — người vận hành cần
đọc đúng một dòng "thiếu DATABASE_URL", không phải 20 dòng stack.

Lỗi được gom **tất cả một lượt**:

```
[FATAL] Cấu hình môi trường không hợp lệ — không thể khởi động:
  - DATABASE_URL: thiếu biến môi trường bắt buộc
  - JWT_SECRET: thiếu biến môi trường bắt buộc
Xem .env.example để biết danh sách biến bắt buộc.
```

Sửa một vòng là xong, thay vì boot–sửa–boot–sửa từng biến một.

---

## 4. Logging

### 4.1 Cách log đúng

```ts
@Injectable()
export class OrderService {
  constructor(private readonly logger: AppLogger) {}

  async checkout(orderId: string) {
    // ✅ field có cấu trúc, query được ở log store
    this.logger.log(`checkout đơn ${orderId}`, OrderService.name);
  }
}
```

Không cần nhận `req`, không cần truyền logger xuống. `AppLogger` tự lấy child
logger của request hiện tại từ `AsyncLocalStorage`; ngoài request thì rơi về
logger gốc.

### 4.2 Vòng đời một request

```
GET /health  (x-request-id: don-hang-abc123)
  │
  ├─ RequestIdMiddleware
  │    ├─ requestId = header x-request-id ?? randomUUID()
  │    ├─ res.setHeader('x-request-id', requestId)
  │    ├─ logger = root.child({ requestId })
  │    ├─ res.on('finish') → log method/url/status/durationMs
  │    └─ requestContextStorage.run({ requestId, logger }, next)
  │         │
  │         ├─ HealthController.check()
  │         └─ HealthService.checkLiveness()
  │              └─ this.logger.debug(...)   ← lấy logger từ ALS, có requestId
  └─ response
```

Kết quả:

```json
{"level":"debug","requestId":"don-hang-abc123","context":"HealthService","msg":"kiểm tra liveness"}
{"level":"info","requestId":"don-hang-abc123","method":"GET","url":"/health","statusCode":200,"durationMs":0.37,"msg":"request hoàn tất"}
```

### 4.3 Vì sao `AsyncLocalStorage` chứ không phải `req.log`

Gắn logger vào `req` thì mọi service tầng sâu phải nhận `req.log` như tham số,
luồn qua `http/` → `domain/` → `data/`. Chỉ cần một chỗ quên là dòng log đó rớt
correlation — và ta chỉ phát hiện lúc đang debug sự cố, đúng lúc cần nó nhất.

`AsyncLocalStorage` giữ context xuyên `await`, `setTimeout`, promise chain.
Context tự biến mất khi ra khỏi request, không rò rỉ sang request khác.

### 4.4 Ưu tiên id từ upstream

Nếu upstream (API gateway, service khác) đã gửi `x-request-id`, dùng lại nó.
Một request đi qua 4 service vẫn chung một id — **đó** mới là truy vết từ đầu
tới cuối. Tự sinh chỉ khi ta là điểm vào đầu tiên.

Id cũng được trả về client qua response header, để họ dán vào ticket khi báo lỗi.

### 4.5 Redact

```ts
redact: {
  paths: ['req.headers.authorization', 'req.headers.cookie', '*.password',
          'DATABASE_URL', 'JWT_SECRET', '*.token', ...],
  censor: '[ĐÃ CHE]',
}
```

`logger.info({ req })` là câu người ta viết theo phản xạ, và nó in nguyên
`authorization: Bearer <token>` vào log — chỗ cả team đọc được và thường được
ship sang bên thứ ba. `censor` thay vì `remove` để debug vẫn thấy field đó có
tồn tại.

Nhưng đừng dựa vào lưới an toàn: **không log config thô, không log nguyên
`req`**. Cần host của DB thì log `new URL(url).host`, đừng log cả connection
string.

### 4.6 Format theo môi trường

| `NODE_ENV` | Output |
|---|---|
| `production` | JSON một dòng, ghi thẳng stdout |
| khác | `pino-pretty` — có màu, dễ đọc trên terminal |

`bufferLogs: true` + `app.useLogger()` trong `main.ts` để log nội bộ của Nest
("Nest application successfully started", route mapping, lỗi DI) cũng đi qua
pino — không bị lẫn hai định dạng trong một lần boot.

⚠️ Hệ quả: mọi dòng log boot mang **cùng một timestamp** — thời điểm buffer
được xả, không phải lúc sự kiện xảy ra. Thứ tự vẫn đúng, nhưng **đừng dùng
timestamp của log boot để đo thời gian khởi động**. Chi tiết: [`qa/005`](../qa/005-vi-sao-log-boot-cua-nest-trong-khac-thuong.md).

---

## 5. Đánh đổi đã cân nhắc

| Lựa chọn | Được | Mất | Kết luận |
|---|---|---|---|
| Validate lúc boot | Process đang chạy chắc chắn có config hợp lệ | Boot chậm hơn vài ms | ✅ Dùng |
| Validate lười theo lần dùng | Boot nhanh | Typo ở nhánh hiếm crash production hàng giờ sau | ❌ Không dùng cho config hạ tầng |
| Log JSON | Query được `requestId="..."` trên Loki/ELK | Đọc thô rất ồn | ✅ Dùng, kèm pretty ở dev |
| `console.log` | Đọc đẹp | Không tìm kiếm được ở quy mô lớn | ❌ Sai cho production |
| `AsyncLocalStorage` | Correlation tự động xuyên tầng | Chi phí nhỏ, cần hiểu cơ chế | ✅ Dùng |
| Luồn `req.log` thủ công | Tường minh | Một chỗ quên là rớt correlation | ❌ Không dùng |

---

## 6. Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| `z.number()` cho biến env | Luôn fail vì env là string | `z.coerce.number()` |
| `config.get<number>('PORT')` | Nhận về chuỗi `"3000"` | `env.get('PORT')` |
| Đọc `process.env` rải rác | Biến thiếu crash giữa request | Chỉ đọc trong `env.schema.ts` |
| `logger.info(req.headers)` | Lộ bearer token | `redact` + không log nguyên `req` |
| Gọi logger trần trong service | Rớt requestId | Inject `AppLogger` |
| Bắt lỗi zod rồi chạy tiếp | App boot nửa-cấu-hình | Để nó exit khác 0 |
| Quên `.env.test` | Clone mới chạy `pnpm test` là exit 1 | Biến bắt buộc phải có giá trị giả |
| `forRoutes('*')` | Warning deprecation (Express 5) | `forRoutes('{*path}')` |
| `messageFormat` in field không có trong `ignore` | Field hiện hai lần mỗi dòng | Field nào đã in ở `messageFormat` thì phải nằm trong `ignore` |

---

## 7. Kiểm chứng

```bash
pnpm test                          # 16 unit test, gồm 7 test cho validateEnv
pnpm test:e2e                      # 5 e2e test, gồm 3 test cho x-request-id
```

Smoke thủ công hai đảm bảo:

```bash
# 1. Config sai → không boot
mv .env .env.bak && node dist/main.js; echo "exit=$?"; mv .env.bak .env

# 2. Correlation id
NODE_ENV=production LOG_LEVEL=debug node dist/main.js &
curl -s -o/dev/null -H 'x-request-id: don-hang-abc123' localhost:3000/health
# → mọi dòng log của request đó mang requestId "don-hang-abc123"
```

---

## 8. Có thể làm tiếp

- **OpenTelemetry trace id** làm correlation id, để log nối được với
  distributed trace xuyên service.
- **Sinh `.env.example` từ zod shape**, để tài liệu env không bao giờ lệch khỏi
  schema đã validate.
- **`registerAs` namespace** (`database.config.ts`, `auth.config.ts`) khi số
  biến lớn lên và config phẳng bắt đầu khó đọc.
- **Log sampling** cho endpoint tần suất cao (`/health` bị probe vài giây một
  lần) để không làm ngập log store.
