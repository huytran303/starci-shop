# 005 — Vì sao log boot của Nest trông khác thường

**Ngày:** 2026-08-02
**Từ khoá:** logging, pino, pino-pretty, bufferLogs, setGlobalPrefix, Nest bootstrap

---

## Câu hỏi

> Tôi thấy log ở nest có sự khác biệt, nguyên nhân từ đâu?

Log boot quan sát được:

```
[02:23:51.464] INFO: NestFactory Starting Nest application... {"context":"NestFactory"}
[02:23:51.464] INFO: InstanceLoader AppModule dependencies initialized {"context":"InstanceLoader"}
...
[02:23:51.464] INFO: RoutesResolver HealthController {/api/health}: {"context":"RoutesResolver"}
[02:23:51.464] INFO: RouterExplorer Mapped {/health, GET} route {"context":"RouterExplorer"}
```

---

## Trả lời

Ba khác biệt, ba nguyên nhân hoàn toàn khác nhau.

### 1. Cả 13 dòng cùng một mốc thời gian — do `bufferLogs: true`

Không phải app boot trong 0ms. `NestFactory.create(AppModule, { bufferLogs: true })`
làm Nest giữ log của chính nó trong buffer, chỉ xả ra khi `app.useLogger()`
được gọi. Lúc xả, cả 13 dòng đi qua pino trong cùng một lượt → pino đóng dấu
`time` tại **thời điểm flush**, không phải thời điểm sự kiện xảy ra.

Chạy lại cùng app với `bufferLogs: false` để đối chiếu:

```
[InstanceLoader] AppModule dependencies initialized       +3ms
[InstanceLoader] AppConfigModule dependencies initialized +2ms
>>> tổng thời gian boot: 40 ms
```

Boot thật mất 40ms, các bước cách nhau 2–3ms. `LogBufferRecord` của Nest không
lưu timestamp gốc nên không có cách nào khôi phục.

**Đánh đổi đã chọn:** giữ `bufferLogs: true`. Bỏ nó thì có timestamp thật,
nhưng 8 dòng đầu in bằng logger mặc định của Nest (text màu) rồi mới chuyển
sang JSON — một lần boot lẫn hai định dạng, và log production mất tính
máy-đọc-được ở đúng đoạn quan trọng nhất. Thứ tự các dòng vẫn đúng; với log
boot thì thứ tự quan trọng hơn độ chính xác milli-giây.

Hệ quả cần nhớ: **không dùng timestamp của log boot để đo thời gian khởi
động.** Muốn đo thì tự `Date.now()` quanh `bootstrap()`.

### 2. `context` hiện hai lần — lỗi cấu hình pino-pretty

```
INFO: NestFactory Starting Nest application... {"context":"NestFactory"}
      ^^^^^^^^^^^ messageFormat in ra             ^^^^^^^^^^^^^^^^^^^^^ object đuôi in lại
```

`messageFormat: '{context} {msg}'` in `context` ra đầu dòng, nhưng `context`
không nằm trong `ignore` nên pino-pretty in lại nó trong object đuôi.

Sửa: thêm `context` vào `ignore`. Sửa xong lộ tiếp lỗi thứ hai — dòng từ
middleware (không có `context`) bị thừa một khoảng trắng đầu message, vì
`messageFormat` luôn in phần `{context} `. Dùng khối điều kiện của pino-pretty:

```ts
ignore: 'pid,service,env,context',
messageFormat: '{if context}{context} {end}{msg}',
```

### 3. `RoutesResolver {/api/health}` vs `Mapped {/health, GET}` — không liên quan tới logging

Đây là cách Nest tự báo cáo, phản ánh đúng cấu hình trong `main.ts`:

```ts
app.setGlobalPrefix(prefix, { exclude: ['health'] });
```

- `RoutesResolver` in đường dẫn controller **sau khi áp global prefix** → `/api/health`
- `RouterExplorer` in route **thực sự đăng ký, sau khi trừ `exclude`** → `/health`

Route thật là `/health`; `GET /api/health` trả 404 (đã có test e2e khẳng định).
Bằng chứng thêm: bootstrap một app y hệt nhưng không gọi `setGlobalPrefix` thì
dòng đó in `RoutesResolver HealthController {/health}:` — khác biệt biến mất.

### Rút ra

Khi log trông lạ, phân biệt ba lớp trước khi sửa:

| Lớp | Ví dụ ở đây |
|---|---|
| Nội dung do framework sinh ra | `RoutesResolver` vs `RouterExplorer` — Nest, không phải bug |
| Thời điểm log được phát ra | `bufferLogs` dời timestamp về lúc flush |
| Cách render | `messageFormat` / `ignore` của pino-pretty |
