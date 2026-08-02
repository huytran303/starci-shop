# Docs — StarCi Shop

Nơi lưu kiến thức tích luỹ trong quá trình làm dự án.

## `guides/` — Tổng hợp theo chủ đề

Trong khi `qa/` ghi lại từng câu hỏi rời rạc theo dòng thời gian, `guides/` gom
một chủ đề thành tài liệu tra cứu hoàn chỉnh: bản đồ file, vòng đời, checklist,
bảng đánh đổi, bẫy thường gặp. Đọc một file là đủ dùng, không phải ghép từ
nhiều bài Q&A.

| # | Chủ đề | Nội dung |
|---|--------|----------|
| [001](guides/001-config-va-logging.md) | Config & Logging | typed config fail-fast với zod, structured logging với pino, correlation id qua `AsyncLocalStorage` |

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
| [005](qa/005-vi-sao-log-boot-cua-nest-trong-khac-thuong.md) | Vì sao log boot của Nest trông khác thường | bufferLogs, pino-pretty, setGlobalPrefix, bootstrap |
