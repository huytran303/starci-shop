# 009 — Lỗi TypeScript chỉ hiện trên IDE, còn `tsc` và `jest` đều pass

**Ngày:** 2026-08-04
**Từ khoá:** typescript, tsserver, @types/jest, ts(2593), ts(2304), inferred project, vscode

## Câu hỏi

> Cannot find name 'it'. Do you need to install type definitions for a test
> runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha`
> and then add 'jest' or 'mocha' to the types field in your tsconfig.ts(2593)
>
> đây là lỗi gì?

## Trả lời

### Kết luận

Đây là lỗi **giả** do TypeScript language server của editor, không phải lỗi
biên dịch. Ở thời điểm gặp, cả hai lệnh sau đều sạch:

```bash
npx tsc --noEmit                          # không lỗi
npx jest src/logging/pino.provider.spec.ts # 21 passed
```

Config lúc đó đã đúng: `tsconfig.json` có `"types": ["node", "jest"]` và
`node_modules/@types/jest` đã được cài.

### Cách phân biệt "lỗi thật" với "TS server hỏng"

Đọc *toàn bộ* danh sách diagnostics, đừng chỉ đọc dòng đầu. Trong ca này, cùng
một file còn có:

- `Cannot find name 'process'` → thiếu cả types `node`
- `Parameter '_path' implicitly has an 'any' type` → thiếu type của module import

Nếu chỉ mỗi `@types/jest` bị thiếu thật thì `process` phải vẫn nhận diện được.
Việc **mọi** ambient type cùng biến mất là dấu hiệu TS server không nạp được
`tsconfig.json` của project — nó đang xử lý file trong *inferred project*
(cấu hình mặc định, `types` rỗng), chứ không phải project thật.

Quy tắc rút ra: chạy `npx tsc --noEmit` trước khi tin vào gạch đỏ của editor.
`tsc` là nguồn sự thật duy nhất; TS server chỉ là bản sao chạy nền, và bản sao
đó có thể lệch.

### Nguyên nhân thường gặp

1. **`node_modules` bị cài lại mà TS server chưa restart.** TS server cache
   danh sách type roots lúc khởi động. `pnpm install` thay symlink trong
   `node_modules/@types/` nhưng tiến trình cũ vẫn giữ bản đồ cũ.
2. **Workspace root sai.** Mở thư mục cha (ví dụ `fullstack/`) thay vì
   `starci-shop/` thì TS đi ngược lên tìm `tsconfig.json` không thấy → rơi vào
   inferred project.
3. **File nằm ngoài `include`/bị `exclude`.** Cũng cho ra inferred project.
   Ở repo này `tsconfig.json` có `"include": ["src/**/*"]` nên `*.spec.ts`
   trong `src/` được bao phủ; còn `tsconfig.build.json` cố tình
   `exclude: ["**/*spec.ts"]` — file build không chứa test là đúng thiết kế,
   nhưng nếu editor lỡ chọn nhầm file config này thì spec sẽ mất type.

### Cách sửa

`Cmd+Shift+P` → **TypeScript: Restart TS Server**.

Nếu vẫn còn, kiểm tra thư mục đang mở có phải gốc project không.

**Đừng** làm theo gợi ý trong chính thông báo lỗi (`npm i --save-dev
@types/jest`). Thông báo ts(2593) là văn bản tĩnh, TypeScript in ra bất cứ khi
nào tên `it`/`describe` không phân giải được — nó không hề kiểm tra xem gói đã
cài hay chưa. Cài lại một gói vốn đã có chỉ làm nhiễu `package.json`.
