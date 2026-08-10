# 007 — `setGlobalPrefix` nuốt middleware, và cách phát hiện ra

**Ngày:** 2026-08-02
**Từ khoá:** middleware, setGlobalPrefix, forRoutes, app.use, correlation id, smoke test, bằng chứng

## Câu hỏi

AI chấm repo báo "không đủ bằng chứng" cho các tiêu chí CRITICAL (fail-fast,
log JSON có requestId, redact secret). Code sai chỗ nào?

## Trả lời

Code không sai ở những tiêu chí đó — chúng đều đúng, chỉ là repo **kể** thay vì
**chỉ**: README mô tả hành vi bằng lời và bằng log tự viết tay, không trỏ được
tới `file:line` và không có gì để người review chạy lại. Grader chỉ đọc được
một đoạn trích nên không xác nhận được gì.

Nhưng quá trình bổ sung bằng chứng lại lôi ra **một lỗi thật**, và đó mới là
phần đáng ghi lại.

### Lỗi: middleware không chạy cho đường dẫn ngoài `/api`

Trước đây `LoggingModule` đăng ký middleware kiểu Nest:

```ts
@Global()
@Module({ ... })
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
```

Comment ngay bên trên ghi "Mọi route, kể cả /health". Sai. Kết quả đo thật:

| Đường dẫn | Có access log + `x-request-id`? |
|---|---|
| `/health` | ✅ nằm trong `exclude` của `setGlobalPrefix` |
| `/api/health`, `/api/bat-ky` | ✅ nằm dưới prefix |
| `/`, `/favicon.ico`, `/duong-dan-la` | ❌ **không có gì cả** |

**Nguyên nhân:** Nest áp `setGlobalPrefix` lên **cả middleware** đăng ký qua
`MiddlewareConsumer.forRoutes()`. Nên `'{*path}'` thực chất là
`/api/{*path}` cộng thêm các route trong `exclude`.

Hệ quả không chỉ là thiếu vài dòng log: request nằm ngoài hai vùng đó **cũng
không có header `x-request-id`** trong response. Đúng loại traffic cần nhìn
thấy nhất — bot quét lỗ hổng, client gọi sai đường dẫn, health-check cấu hình
nhầm — lại là loại vô hình hoàn toàn.

### Sửa: gắn ở cấp Express

```ts
// src/app.setup.ts
const requestId = app.get(RequestIdMiddleware);
app.use((req, res, next) => requestId.use(req, res, next));
```

`app.use()` đăng ký thẳng vào Express, chạy **trước** router nên không dính
global prefix. Phải đứng trước `setGlobalPrefix` vì Express chạy middleware
theo đúng thứ tự đăng ký.

Đánh đổi: mất tính "module tự đăng ký middleware của mình" —
`LoggingModule` không còn `implements NestModule`, và `main.ts` phải biết tới
`RequestIdMiddleware`. Chấp nhận được, vì đổi lại là một đảm bảo đúng thay vì
một đảm bảo sai được viết cho đẹp.

### Hệ quả kéo theo: `app.setup.ts` ra đời

Chuyển sang `app.use()` làm `test/health.e2e-spec.ts` gãy ngay: nó dựng app
bằng `Test.createTestingModule()` và tự chép lại một dòng
`app.setGlobalPrefix(...)` từ `main.ts` — nên nó không có middleware.

Đó chính là vấn đề gốc dưới dạng thu nhỏ: **wiring bị chép ở hai nơi thì test
xanh trên một app không giống app đang chạy thật.** Test cũ vẫn xanh suốt thời
gian lỗi trên tồn tại, vì nó chỉ gọi `/health` — đường dẫn duy nhất nằm trong
`exclude`.

Sửa bằng cách tách toàn bộ cấu hình cấp app ra `src/app.setup.ts`:

```
main.ts:              create -> configureApp -> listen
health.e2e-spec.ts:   createTestingModule -> configureApp -> init
```

Quy tắc từ nay: mọi thứ chạm vào `app` đều nằm trong `configureApp`.

### Vì sao unit test cũ không bắt được

`request-id.middleware.spec.ts` tự dựng một pino riêng trong test:

```ts
const logger = pino({ level: 'debug', redact: { paths: ['headers.authorization'] } }, dest);
```

Nó chứng minh **tính năng redact của pino** chạy được — không chứng minh
logger của dự án che đúng secret. Xoá sạch khối `redact` khỏi `pino.provider.ts`
thì test đó vẫn xanh.

Sửa: export `createRootLogger` kèm tham số `destination` (chỉ dùng cho test),
rồi `pino.provider.spec.ts` assert trên **chính** hàm mà
`rootLoggerProvider` dùng lúc chạy thật — 12 test, mỗi `redact.paths` một test.

Bài học chung: **test dựng lại chủ thể thay vì dùng chủ thể thật thì nó chỉ
kiểm chứng bản sao.** Điều này đúng cho cả hai lỗi trong bài — logger dựng lại
trong test, và wiring chép lại trong e2e.

### Loại bằng chứng nào đủ mạnh

Xếp theo độ tin cậy tăng dần:

1. **Câu văn trong README** — không kiểm được, và ở repo này từng sai (comment
   "Mọi route, kể cả /health").
2. **Log dán trong README** — kiểm được bằng mắt, nhưng không ai biết nó có
   phải output thật không. Bản cũ của README này dán
   `{"level":"debug","requestId":"abc-123",...}` — thiếu `time`, `service`,
   `env`, `pid`, và `abc-123` không phải UUID mà code sinh ra. Tức là viết tay.
3. **Unit test** — chạy được, nhưng có thể đang test một bản sao (xem trên).
4. **Smoke test trên process thật** — mạnh nhất.

`test/smoke.e2e-spec.ts` `spawn` hẳn một tiến trình chạy `src/main.ts` rồi
assert trên stdout và exit code thật. Nó chứng minh được những thứ test
in-memory không chạm tới:

- `process.exit(1)` khi env sai — test in-memory sẽ giết luôn jest
- mọi dòng stdout `JSON.parse` được — in-memory không đi qua stdout thật
- không có server nào listen khi config hỏng
- secret trong header thật không lọt vào stdout thật

Và nó chính là thứ người review (hoặc grader tự động) chạy được để tự xác minh:

```bash
pnpm test && pnpm test:e2e
```

## Liên quan

- [002](002-singleton-vs-global-module.md) — `@Global()` khi nào hợp lý
- [005](005-vi-sao-log-boot-cua-nest-trong-khac-thuong.md) — `setGlobalPrefix`
  làm log boot của Nest gây hiểu nhầm
- [006](006-demo-luong-chay-that-module-va-layered.md) — demo luồng chạy, viết
  trước khi phát hiện lỗi này
