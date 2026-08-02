# 002 — Singleton khác `@Global()` như thế nào

**Ngày:** 2026-08-02
**Từ khoá:** DI, scope, module, database, singleton

---

## Câu hỏi

> Tôi tưởng cái database phải theo singleton, tức là phải cho nó global để mọi
> nơi access được vào nó. Tôi có đang hiểu sai không?

---

## Trả lời

Hiểu nhầm ở chỗ: **singleton và `@Global()` là hai chuyện khác nhau**.

### Singleton đã có sẵn rồi

Trong Nest, provider mặc định là `Scope.DEFAULT` — nghĩa là **một instance duy
nhất cho toàn application**, không phải mỗi module một cái.

Khi `HealthModule`, `ProductsModule`, `OrdersModule` cùng
`imports: [DatabaseModule]`, Nest **không** tạo 3 `DbRepository`. Nó cache
module theo token, resolve `DatabaseModule` một lần, cả 3 nhận về **cùng một
reference**. Đây là hành vi mặc định của DI container, không cần khai báo thêm.

Thứ phá vỡ singleton là `Scope.REQUEST` / `Scope.TRANSIENT`, chứ không phải
việc import ở nhiều nơi.

### Vậy `@Global()` để làm gì?

Nó chỉ giải quyết vấn đề **khai báo**, không phải vòng đời:

```ts
// Không global: mỗi module cần dùng phải khai báo
@Module({ imports: [DatabaseModule], ... })
export class ProductsModule {}

// Global: khỏi khai báo, inject thẳng ở bất kỳ đâu
```

Cùng một instance trong cả hai trường hợp. `@Global()` chỉ tiết kiệm một dòng
`imports`.

### Nên để `DatabaseModule` global không?

**Không**, và tài liệu Nest cũng khuyến nghị vậy — *"making everything global
is not a good design decision"*.

- Dòng `imports: [DatabaseModule]` chính là **tài liệu về dependency**. Nhìn
  vào module là biết nó chạm DB hay không.
- Test dễ hơn: muốn mock DB cho `ProductsModule`, override đúng một import.
- Global làm dependency vô hình, dễ để lọt service tầng `http` inject thẳng
  `DbRepository` — phá vỡ layering `http -> domain -> data` của dự án.
- Comment sẵn có trong `src/database/database.module.ts` đã đúng tinh thần:
  `exports` là ranh giới. Global làm ranh giới đó mất nghĩa.

`ConfigModule` để `isGlobal: true` là hợp lý vì nó read-only, không có state,
và gần như mọi module đều cần — đánh đổi ở đây đáng.

### Bẫy cần biết: dynamic module

Nếu sau này `DatabaseModule` thành dynamic module, singleton **có thể** bị phá:

```ts
DatabaseModule.forRoot({ url: 'a' })   // instance 1
DatabaseModule.forRoot({ url: 'b' })   // instance 2 — khác token, khác provider
```

Token của dynamic module phụ thuộc vào tham số truyền vào, nên tham số khác
nhau sinh ra module instance khác nhau. Đó là lý do pattern chuẩn là
`forRoot()` gọi **một lần duy nhất** ở `AppModule`, còn feature module dùng
`forFeature()`.

Hiện `DatabaseModule` là static module nên chưa dính vấn đề này.
