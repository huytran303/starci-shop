# 001 — Cấu hình động với `@nestjs/config`

**Ngày:** 2026-08-02
**Từ khoá:** config, env, validation, typed config, registerAs

---

## Câu hỏi

> Dự án này đã có config động chưa?

---

## Trả lời

> **Cập nhật 2026-08-02:** phần "Chưa có" bên dưới đã được xử lý — xem
> [`004`](004-typed-config-va-structured-logging.md). Giữ lại nguyên văn vì
> phần "Điểm dễ nhầm" ở cuối vẫn đúng và là lý do dẫn tới thiết kế ở 004.

Rồi — nhưng mới ở **mức cơ bản**.

### Đang có

- `@nestjs/config` ^4.0.0 trong dependencies
- `ConfigModule.forRoot({ isGlobal: true, cache: true })` ở `src/app.module.ts`
- `src/main.ts` đọc qua `ConfigService`: `PORT`, `HOST`, `API_PREFIX` (đều có
  default fallback)
- `.env.example` có 3 biến trên, `.env` đã được gitignore

### Chưa có

| Thiếu | Hệ quả |
|---|---|
| **Validation schema** (`validate` / `validationSchema`) | Gõ sai `PORT=abc` → app vẫn boot rồi lỗi lúc runtime |
| **Typed config** — `config.get<number>('PORT')` chỉ là ép kiểu giả | Env luôn là string; `port` thực chất là `"3000"`, không phải number |
| **`registerAs` namespace** (`app.config.ts`, `database.config.ts`) | Config nằm phẳng, dùng magic string rải rác |
| **`envFilePath`** theo môi trường | Không tách được `.env.development` / `.env.test` |
| **Config cho DB** | `DatabaseModule` hoàn toàn hardcode, chưa có `DATABASE_URL` hay pool setting nào |

### Điểm dễ nhầm

```ts
const port = config.get<number>('PORT', 3000);
```

Generic `<number>` ở đây **không convert gì cả** — nó chỉ là type assertion cho
TypeScript. Nếu `.env` có `PORT=3000` thì giá trị nhận về là chuỗi `"3000"`,
và `app.listen()` nhận string. Express vẫn chạy nên lỗi chưa lộ ra.

Muốn thực sự có number, cần một trong hai:

- `validate` với `class-transformer` (`@Type(() => Number)`) — biến đổi ngay
  lúc boot, sau đó `ConfigService` trả về giá trị đã đúng kiểu.
- `registerAs('app', () => ({ port: parseInt(process.env.PORT ?? '3000', 10) }))`
  — parse thủ công trong factory.

Cách thứ nhất tốt hơn vì gộp luôn được validation: sai kiểu thì app fail ngay
lúc khởi động chứ không phải giữa lúc chạy production.
