# Docs — StarCi Shop

Nơi lưu kiến thức tích luỹ trong quá trình làm dự án.

## `qa/` — Hỏi & đáp kiến thức

Mỗi file là một câu hỏi về **mặt kiến thức** (khái niệm, pattern, đánh đổi
thiết kế, cách một cơ chế hoạt động) kèm câu trả lời đầy đủ.

Không lưu ở đây: yêu cầu thực thi ("thêm endpoint X", "sửa lỗi Y"), câu hỏi
về trạng thái tức thời ("test pass chưa"), hay chuyện chỉ đúng trong một
phiên làm việc. Những thứ đó thuộc về git history hoặc issue tracker.

Quy tắc đặt tên: `NNN-slug-khong-dau.md`, số tăng dần, không tái sử dụng số
đã xoá.

### Danh sách

| # | Chủ đề | Từ khoá |
|---|--------|---------|
| [001](qa/001-cau-hinh-dong-config-module.md) | Cấu hình động với `@nestjs/config` — hiện trạng và những gì còn thiếu | config, env, validation, typed config |
| [002](qa/002-singleton-vs-global-module.md) | Singleton khác `@Global()` như thế nào | DI, scope, module, database |
| [003](qa/003-luong-code-tu-main-den-response.md) | Luồng code từ `main.ts` đến HTTP response | bootstrap, DI, module graph, request lifecycle |
| [004](qa/004-typed-config-va-structured-logging.md) | Typed config fail-fast + structured logging có correlation id | zod, validation, fail-fast, pino, correlation id, AsyncLocalStorage |
