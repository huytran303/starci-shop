# 003 — Luồng code từ `main.ts` đến HTTP response

**Ngày:** 2026-08-02
**Từ khoá:** bootstrap, DI, module graph, request lifecycle, liveness, decorator metadata

## Câu hỏi

giải thích luồng code đi, start từ dòng nào, đi vào từng dòng code như thế nào

## Trả lời

Luồng chia làm 2 giai đoạn hoàn toàn khác nhau: **khởi động** (chạy 1 lần) và
**xử lý request** (chạy mỗi lần có HTTP đến).

---

## Giai đoạn 1 — Khởi động

### Dòng đầu tiên thực sự chạy: `src/main.ts:33`

```ts
void bootstrap();
```

Đây là dòng duy nhất ở top-level được *thực thi*. Mọi thứ phía trên chỉ là khai
báo. `void` chỉ để nói với TypeScript/ESLint "tôi cố ý không `await` promise
này" — không có tác dụng runtime.

Nhưng trước khi tới được dòng 33, Node đã phải chạy các `import` ở dòng 1–5:

```ts
import { AppModule } from './app.module';   // main.ts:5
```

Import này kéo theo cả dây chuyền — Node load xong `app.module.ts`, file đó lại
`import { HealthModule }`, file đó lại import `DatabaseModule`,
`HealthController`, `HealthService`, `HealthDbRepository`. **Toàn bộ 8 file
được nạp vào bộ nhớ trước khi dòng 33 chạy.**

Lúc nạp, các decorator (`@Module`, `@Injectable`, `@Controller`) thực thi ngay —
chúng không tạo object nào cả, chỉ **ghi metadata** lên class thông qua
`reflect-metadata`. Ví dụ `@Module({ providers: [DbRepository] })` ở
`database.module.ts:13` chỉ gắn vào class `DatabaseModule` một cái nhãn:
"providers của tao là `[DbRepository]`". Nest đọc nhãn này ở bước sau.

### `main.ts:8` — Nest dựng cây DI

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
```

Dòng nặng nhất trong file. Bên trong nó Nest làm tuần tự:

**Bước 1 — Quét đồ thị module.** Bắt đầu từ `AppModule`, đọc metadata `imports`:

```
AppModule (app.module.ts:14)
├── ConfigModule.forRoot({ isGlobal: true, cache: true })   ← app.module.ts:16
└── HealthModule                                            ← app.module.ts:17
    └── DatabaseModule                                      ← health.module.ts:20
```

`ConfigModule.forRoot()` ở dòng 16 là một **lời gọi hàm thật sự**, chạy ngay khi
file được nạp. Nó đọc `.env`, parse vào `process.env`, rồi trả về object mô tả
module động. `isGlobal: true` nghĩa là `ConfigService` được đăng ký vào registry
toàn cục — mọi module khác inject được mà không cần `imports`. `cache: true`
nghĩa là mỗi key chỉ đọc từ `process.env` một lần rồi nhớ vào Map.

Xem thêm [[001-cau-hinh-dong-config-module]] và
[[002-singleton-vs-global-module]].

**Bước 2 — Khởi tạo provider theo thứ tự phụ thuộc.** Nest phân tích constructor
của từng class để biết ai cần ai:

```ts
// health.db.repository.ts:18
constructor(private readonly db: DbRepository) {}
```

Nest đọc được kiểu `DbRepository` nhờ `emitDecoratorMetadata` trong `tsconfig` —
TypeScript nhúng thông tin kiểu vào metadata lúc compile. Từ đó Nest suy ra thứ
tự khởi tạo, từ lá lên gốc:

```
1. new DbRepository()                            ← db.repository.ts:13, không phụ thuộc ai
2. new HealthDbRepository(dbRepositoryInstance)  ← health.db.repository.ts:18
3. new HealthService(healthDbRepositoryInstance) ← health.service.ts:19
4. new HealthController(healthServiceInstance)   ← health.controller.ts:18
```

Chỗ đắt giá ở bước 1: `DbRepository` được tạo **một lần duy nhất**, cùng một
instance dùng lại ở mọi nơi. Đó là vì `database.module.ts:15` có
`exports: [DbRepository]` — nếu thiếu dòng exports này, `HealthDbRepository` sẽ
báo lỗi *"Nest can't resolve dependencies"* dù `DatabaseModule` đã nằm trong
`imports`. **Import module ≠ nhìn thấy provider của nó; chỉ những gì được
`exports` mới xuyên qua ranh giới.**

Ngược lại, `health.module.ts:22` khai `providers: [HealthService,
HealthDbRepository]` mà **không** có `exports` — nên feature khác
(`ProductsModule` sau này) không thể inject `HealthService`. Đó là cố ý.

**Bước 3 — Đăng ký route.** Nest đọc `@Controller('health')` ở
`health.controller.ts:16` và `@Get()` ở dòng 26, ghép thành `GET /health`, rồi
đăng ký handler vào Express router.

### `main.ts:9-13` — Đọc cấu hình

```ts
const config = app.get(ConfigService);
const port = config.get<number>('PORT', 3000);
```

`app.get()` moi instance ra khỏi container DI theo cách thủ công — hợp lệ ở
`main.ts` vì ở đây chưa có DI (chưa nằm trong class nào để inject qua
constructor).

Tham số thứ hai (`3000`, `'0.0.0.0'`, `'api'`) là giá trị mặc định khi biến môi
trường không tồn tại. Cái bẫy cần nhớ: `config.get<number>('PORT', 3000)` — nếu
`.env` có `PORT=8080`, giá trị trả về là **chuỗi** `"8080"`, không phải số, dù
generic ghi `<number>`. Generic của TypeScript không ép kiểu lúc runtime. Ở đây
vô hại vì `app.listen()` chấp nhận cả hai.

### `main.ts:17` — Prefix toàn cục

```ts
app.setGlobalPrefix(prefix, { exclude: ['health'] });
```

Từ đây mọi route thành `/api/...`. Nhưng `health` được loại trừ, nên route vẫn
là `GET /health` chứ không phải `GET /api/health` — vì kubelet / load balancer
thường được cấu hình cứng đường dẫn `/health`.

### `main.ts:19-21` — Pipe kiểm tra dữ liệu

```ts
app.useGlobalPipes(
  new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
);
```

Đăng ký một pipe chạy trước **mọi** handler. Hiện chưa có tác dụng vì `/health`
không nhận body hay query nào. Ý nghĩa ba tuỳ chọn:

- `whitelist` — tự động loại bỏ field không khai trong DTO
- `forbidNonWhitelisted` — thay vì loại bỏ im lặng thì ném 400
- `transform` — biến plain object thành instance của class DTO, đồng thời ép
  kiểu `"5"` → `5`

### `main.ts:25` — Bật shutdown hooks

```ts
app.enableShutdownHooks();
```

Đăng ký listener cho `SIGTERM`/`SIGINT`. Khi nhận tín hiệu, Nest gọi
`onModuleDestroy()` / `onApplicationShutdown()` trên các provider có khai báo.
`DbRepository.disconnect()` ở `db.repository.ts:28` được viết cho mục đích này —
nhưng **hiện chưa được nối vào**: class chưa `implements OnModuleDestroy`, nên
hàm đó chưa bao giờ được gọi tự động.

### `main.ts:27` — Mở cổng

```ts
await app.listen(port, host);
```

Express bắt đầu lắng nghe. Promise resolve khi socket đã bind xong. Hai dòng
`Logger.log` sau đó chạy, `bootstrap()` kết thúc — nhưng process không thoát, vì
server đang giữ event loop.

---

## Giai đoạn 2 — Một request `GET /health`

Giả sử kubelet gọi `curl http://localhost:3000/health`:

1. Express nhận request, so khớp router → tìm thấy handler đã đăng ký lúc boot.

2. `ValidationPipe` chạy — không có tham số nào để validate, đi qua ngay.

3. `health.controller.ts:29`:

   ```ts
   const { status } = this.healthService.checkLiveness();
   ```

   `this.healthService` chính là instance đã tạo từ lúc boot, **không tạo mới**.
   Controller mặc định là singleton — cùng một object phục vụ mọi request.

4. `health.service.ts:29-31`:

   ```ts
   checkLiveness(): HealthStatus {
     return { status: 'ok' };
   }
   ```

   Trả về ngay. **Không chạm vào DB** — đây là quyết định thiết kế quan trọng
   nhất trong file: liveness fail nghĩa là orchestrator sẽ giết và restart pod.
   Nếu DB sập mà báo liveness fail, toàn bộ fleet sẽ restart vô ích trong khi lỗi
   nằm ở nơi khác. Kiểm tra dependency là việc của readiness.

   Vì thế `HealthDbRepository` được inject ở dòng 19 nhưng **không hề được dùng**
   trong luồng request này. Nó chỉ phục vụ `checkReadiness()` ở dòng 39 — hàm
   hiện chưa có endpoint nào gọi tới.

5. Quay lại `health.controller.ts:30`, đóng gói lại thành `{ status }` rồi
   return. `@HttpCode(HttpStatus.OK)` ở dòng 27 ép status code = 200. Nest
   serialize object thành JSON, set `Content-Type: application/json`, gửi đi.

Kết quả: `200 {"status":"ok"}`.

---

## Nhánh chết — code tồn tại nhưng chưa chạy

Ba mắt xích đã được đấu dây nhưng chưa có ai kích hoạt:

```
HealthService.checkReadiness()      health.service.ts:39   ← chưa endpoint nào gọi
  └── HealthDbRepository.ping()     health.db.repository.ts:26
      └── DbRepository.ping()       db.repository.ts:22    ← hiện luôn return true

DbRepository.disconnect()           db.repository.ts:28    ← chưa implements OnModuleDestroy
```

Kiến trúc bốn tầng chỉ để phục vụ một chuỗi `return { status: 'ok' }` nghe có vẻ
thừa, nhưng giá trị nằm ở chỗ khác: khi gắn Postgres thật, chỉ
`db.repository.ts:24` đổi từ `return true` thành `SELECT 1` — `domain/` và
`http/` không sửa dòng nào.
