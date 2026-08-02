# StarCi Shop — Backend

NestJS API chia ba tầng. Mọi tính năng sau này (sản phẩm, giỏ hàng, đơn hàng,
thanh toán) đều đi theo đúng khuôn này.

## Kiến trúc

**Feature-first, layer-second.** Mỗi feature là một Nest module riêng; bên
trong module mới chia ba tầng.

```
src/
  main.ts               bootstrap, đọc cấu hình từ env
  app.module.ts         chỉ lắp ráp feature module, không chứa provider nào

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
```

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

Cấu hình qua env (xem `.env.example`): `PORT`, `HOST`, `API_PREFIX`.

> **Cổng 3000 có thể đã bị chiếm.** Nếu gặp `EADDRINUSE`, kiểm tra bằng
> `lsof -nP -iTCP:3000 -sTCP:LISTEN` rồi chạy `PORT=3100 pnpm dev`.

> **`tsBuildInfoFile` phải nằm trong `dist/`.** `nest-cli.json` đặt
> `deleteOutDir: true` nên `dist/` bị xoá mỗi lần build. Nếu file
> `.tsbuildinfo` nằm ngoài `dist/`, nó sống sót qua lần xoá đó và `tsc` sẽ
> tưởng "không có gì thay đổi" nên **không emit gì cả** — build vẫn exit 0
> nhưng `pnpm start` báo `Cannot find module dist/main`. Đừng chuyển nó ra
> ngoài `dist/`.

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
