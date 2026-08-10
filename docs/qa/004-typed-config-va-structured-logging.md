# 004 — Typed config fail-fast + structured logging có correlation id

**Ngày:** 2026-08-02
**Từ khoá:** config, zod, validation, fail-fast, pino, logging, correlation id, AsyncLocalStorage

---

## Câu hỏi

> Làm typed config theo 12-factor được validate lúc khởi động (fail-fast khi
> bất kỳ biến env nào thiếu/sai) và structured JSON logging gắn một correlation
> id theo từng request vào mọi dòng log.

---

## Trả lời

> Bản tra cứu đầy đủ (checklist thêm biến env, bảng đánh đổi, bẫy thường gặp):
> [`guides/001-config-va-logging.md`](../guides/001-config-va-logging.md).

Hai đảm bảo cần đạt:

1. **Config sai → shop không boot.** Không có trạng thái "đang chạy với config
   nửa vời".
2. **Mọi dòng log của một request có chung một id.** Có id là dựng lại được
   toàn bộ đường đi của một request, xuyên qua mọi tầng.

### Kiến trúc

```
src/config/
  env.schema.ts      # zod schema — nguồn sự thật DUY NHẤT về config
  env.validation.ts  # validateEnv (thuần, test được) + validateEnvOrExit (thoát process)
  env.service.ts     # facade có kiểu: env.get('PORT') là number
  config.module.ts   # @Global, gọi ConfigModule.forRoot({ validate })

src/logging/
  request-context.ts       # AsyncLocalStorage<{ requestId, logger }>
  pino.provider.ts         # pino gốc: JSON, redact secret, pretty ở dev
  app-logger.service.ts    # adapter LoggerService của Nest -> pino
  request-id.middleware.ts # sinh/nhận requestId, mở ALS context
  logging.module.ts        # @Global; middleware gắn ở app.setup.ts (xem 007)
```

### Đảm bảo 1 — fail fast

`ConfigModule.forRoot({ validate: validateEnvOrExit })` gọi hàm validate đúng
**một lần**, ngay khi module graph được nạp — sớm hơn cả `NestFactory.create()`.

```
$ node dist/main.js          # .env bị xoá

[FATAL] Cấu hình môi trường không hợp lệ — không thể khởi động:
  - DATABASE_URL: thiếu biến môi trường bắt buộc
  - JWT_SECRET: thiếu biến môi trường bắt buộc
Xem .env.example để biết danh sách biến bắt buộc.

$ echo $?
1
```

Ba chi tiết quan trọng:

- **Liệt kê tất cả lỗi một lượt**, không dừng ở lỗi đầu — sửa một vòng là xong,
  thay vì boot–sửa–boot–sửa từng biến.
- **`z.coerce.number()` chứ không `z.number()`.** `process.env` luôn trả về
  string; `PORT=3000` là chuỗi `"3000"`. Không coerce thì `app.listen("3000")`
  âm thầm hành xử sai (xem `docs/qa/001`).
- **Tách `validateEnv` (thuần, ném lỗi) khỏi `validateEnvOrExit` (in + exit).**
  Chỉ hàm mỏng thứ hai biết tới `process.exit`, nên phần lõi vẫn unit test được.

Vì sao không để lỗi bay lên cho Nest: Nest bắt lỗi khởi tạo, in stack trace nội
bộ của nó (`ExceptionHandler`, `Module._compile`...) rồi mới thoát. Người vận
hành cần đọc đúng một dòng "thiếu DATABASE_URL", không phải 20 dòng stack.

### Đảm bảo 2 — correlation id

```json
{"level":"debug","requestId":"don-hang-abc123","context":"HealthService","msg":"kiểm tra liveness"}
{"level":"info","requestId":"don-hang-abc123","method":"GET","url":"/health","statusCode":200,"durationMs":0.37,"msg":"request hoàn tất"}
```

Cơ chế:

1. Middleware đọc header `x-request-id` (nếu upstream gửi sang) hoặc sinh UUID.
2. Trả id về client qua header — client dán vào ticket là ta grep ra đúng log
   của họ.
3. `logger.child({ requestId })` → mọi dòng logger con ghi ra đều có id.
4. `AsyncLocalStorage.run()` bọc phần còn lại của pipeline.

**Vì sao `AsyncLocalStorage` chứ không chỉ `req.log`:** gắn vào `req` thì mọi
service tầng sâu phải nhận `req.log` như tham số, luồn qua controller → domain →
data. Chỉ một chỗ quên là dòng đó rớt correlation, và ta chỉ phát hiện lúc đang
debug sự cố. `AsyncLocalStorage` giữ context xuyên `await` nên
`HealthService.checkLiveness()` log ra đúng requestId mà chữ ký hàm không đổi
một chữ nào.

**Ưu tiên id từ upstream** mới thực sự là "truy vết từ đầu tới cuối": một
request đi qua 4 service vẫn chung một id. Tự sinh chỉ khi ta là điểm vào đầu.

### Redact secret

```ts
redact: { paths: ['req.headers.authorization', '*.password', 'DATABASE_URL', ...], censor: '[ĐÃ CHE]' }
```

Không phải phòng xa: `logger.info({ req })` là câu người ta viết theo phản xạ,
và nó in nguyên `authorization: Bearer <token>` vào log — chỗ cả team đọc được
và thường được ship sang bên thứ ba. `censor` thay vì `remove` để debug vẫn
thấy field đó có tồn tại.

### Đánh đổi

| Lựa chọn | Được | Mất |
|---|---|---|
| Validate lúc boot | Process đang chạy chắc chắn có config hợp lệ | Boot chậm hơn vài ms |
| Validate lười theo lần dùng | Boot nhanh | Typo ở nhánh hiếm crash production hàng giờ sau |
| Log JSON | Loki/ELK query được `requestId="..."` | Đọc thô rất ồn → `pino-pretty` ở dev |
| `console.log` | Đọc đẹp | Không tìm kiếm được ở quy mô lớn |

### Bẫy đã tránh

- `config.get<number>('PORT')` — generic đó chỉ là type assertion, **không**
  convert gì cả. `EnvService.get('PORT')` ràng key vào `keyof Env` nên gõ sai là
  lỗi compile, và kiểu trả về suy ra từ schema.
- `Object.freeze` kết quả validate → không service nào mutate config lúc runtime.
- `bufferLogs: true` + `app.useLogger()` → log nội bộ Nest cũng ra JSON, không
  bị lẫn hai định dạng trong một lần boot.
- ~~`forRoutes('{*path}')` — cú pháp path-to-regexp v8 (Express 5 của Nest 11);
  `'*'` kiểu cũ vẫn chạy nhưng in warning deprecation.~~ **Đã bỏ:**
  `setGlobalPrefix` áp tiền tố lên cả middleware kiểu Nest nên `forRoutes` bỏ
  sót mọi đường dẫn ngoài `/api`. Nay gắn bằng `app.use()` ở
  `src/app.setup.ts` — xem [007](007-global-prefix-nuot-middleware.md).

### Còn có thể làm thêm

- **OpenTelemetry trace id** làm correlation id, để log nối với distributed trace.
- **Sinh `.env.example` từ zod shape**, để tài liệu env không bao giờ lệch khỏi
  schema đã validate.
- **`registerAs` namespace** (`database.config.ts`, `auth.config.ts`) khi số
  biến lớn lên và config phẳng bắt đầu khó đọc.
