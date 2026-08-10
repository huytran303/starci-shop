# Constitution

Version 1.0.0 · Trạng thái: ACTIVE (sửa được — xem §Sửa đổi)

Chuyển thể từ `template-mern-stack` (constitution v1.2.0) sang NestJS + Postgres.

**Nguyên tắc: rule không có máy kiểm thì chỉ là lời khuyên.** Mỗi rule dưới đây
nêu rõ cách kiểm của nó. Máy kiểm nằm ở `pnpm lint` (ESLint),
`scripts/check-constitution.sh` và `.github/workflows/ci.yml`; `review` nghĩa là
gate do người review PR — ghi rõ để reviewer biết CI KHÔNG cover phần nào.

---

## Tầng 1 — Bảo mật & dữ liệu

### SEC-01 · Mật khẩu
Hash bằng bcrypt (cost ≥ 12) hoặc argon2id. Plaintext không bao giờ được lưu,
log, hay echo.
**Kiểm:** ngủ đông đến khi có feature auth. PR auth PHẢI thêm test assert giá
trị lưu verify được với input và khác input, cùng test route-walk của SEC-02.

### SEC-02 · Auth trên endpoint ghi
Mọi route POST/PUT/PATCH/DELETE phải có guard auth, trừ route trong allowlist
`PUBLIC_ROUTES` (chỉ auth flow: login, register, refresh).
**Rule và kiểm NGỦ ĐÔNG đến khi feature auth ship.** PR auth kích hoạt rule và
PHẢI thêm test duyệt toàn bộ route đã mount của Nest và assert mọi route ghi có
guard hoặc nằm trong `PUBLIC_ROUTES`.

### SEC-03 · Validate input (SQL injection)
Mọi input từ client đi qua DTO + `ValidationPipe` (whitelist, mount global trong
`app.setup.ts`) hoặc zod schema trước khi dùng. SQL chỉ viết dạng tham số hoá
(`$1, $2`) — không bao giờ nối chuỗi hay template literal chứa input vào câu
SQL. Driver Postgres chỉ được import trong tầng data (`src/server/database/`,
`src/server/modules/*/data/`).
**Kiểm:** `check-constitution.sh` grep: `useGlobalPipes` phải mount trong
`app.setup.ts`; cấm template literal trong `.query(`; cấm import `pg` ngoài
tầng data. Chiều import giữa các tầng do `pnpm lint` ép. Phần còn lại: review.

### SEC-04 · Secret
`.env` không bao giờ commit; `.env.example` luôn cập nhật (nguồn sự thật là
`src/server/config/env.schema.ts`). Trong source, `process.env` chỉ được đọc
trong `src/server/config/`. Agent không bao giờ in, log, hay commit giá trị
secret.
**Kiểm:** grep trong `check-constitution.sh` (`.gitignore` phải ignore `.env`;
`process.env` chỉ trong `config/`) + gitleaks trong CI. Điều khoản agent:
review.

### DATA-01 · Xoá
Hard delete là mặc định. Soft delete chỉ cho entity mà feature cần
restore/lịch sử, và phải qua cơ chế scope tự động ở tầng data — không bao giờ
là filter `deleted_at IS NULL` viết tay mà mọi query phải tự nhớ.
**Kiểm:** review.

### LOG-01 · Observability
Mọi request log thành một dòng JSON có `durationMs` và `requestId` (middleware
gắn bằng `app.use()` trong `app.setup.ts` — chạy cho MỌI route, kể cả ngoài
`API_PREFIX`). Stack trace và chi tiết lỗi nội bộ chỉ vào log server; client
nhận `{error}` với message chung chung khi 500. Secret bị redact
(`authorization`, `cookie`, `password`, `DATABASE_URL`, `JWT_SECRET`, `token`).
**Kiểm:** `check-constitution.sh` assert middleware requestId mount trong
`app.setup.ts`; redact khoá bởi `logging/pino.provider.spec.ts` (mỗi path một
test). Phần response lỗi cho client: review, đến khi exception filter ship cùng
ARCH-02.

---

## Tầng 2 — Kiến trúc

### ARCH-01 · Ranh giới tầng
`http → domain → data`, mũi tên chỉ đi vào trong, khuôn feature-first (ADR-001
+ README §Kiến trúc). `config/` và `logging/` là hạ tầng cross-cutting
`@Global`. Driver DB chỉ ở tầng data. Không `console.*` — inject `AppLogger`
(ngoại lệ duy nhất: hai đường boot-fatal khi logger chưa tồn tại).
**Kiểm:** `pnpm lint` (`no-restricted-imports` trong `eslint.config.mjs` — fail
khi vẽ mũi tên ngược); `check-constitution.sh` cấm `console.*` ngoài `main.ts`
và `config/env.validation.ts`, cấm import `pg` ngoài tầng data.

### ARCH-02 · Xử lý lỗi
Lỗi nghiệp vụ throw `DomainError(message, kind)` từ tầng domain; MỘT exception
filter global map kind → status: `validation` → 400 (mặc định), `conflict` →
409, `not_found` → 404; mọi thứ khác → 500 với message chung. Domain không
biết HTTP — không throw `HttpException` từ domain. Không stack trace cho client
(LOG-01).
**Kiểm:** kích hoạt cùng feature nghiệp vụ đầu tiên có nhánh lỗi — PR đó PHẢI
ship `DomainError` + filter (mapping nằm ở MỘT chỗ) + unit test cho mapping.
Sau đó: review xác nhận code mới throw `DomainError` thay vì status ad-hoc.

### ARCH-03 · API contract
Endpoint thay đổi thì contract OpenAPI (`@nestjs/swagger`, serve tại `/docs`)
cập nhật **trong cùng PR**, review như code.
**Kiểm:** ngủ đông đến khi feature API thật đầu tiên ship swagger. Từ đó
decorator nằm cạnh controller nên drift lộ ngay trong diff; chi tiết response:
review (checklist PR).

---

## Tầng 3 — Chuẩn kỹ thuật

### STD-01 · TypeScript
Strict mode ghim trong tsconfig. Không `any` — dùng `unknown` + narrowing.
Theo idiom Nest: class + decorator cho controller/provider, không áp func-style
của template Express.
**Kiểm:** `check-constitution.sh` parse tsconfig assert `strict: true`;
`@typescript-eslint/no-explicit-any` (error) chạy trong `pnpm lint`; `tsc` chạy
trong CI qua `pnpm build`.

### STD-02 · Kiểm thử
- Unit: `*.spec.ts` nằm cạnh source — không DB, không network.
- Integration: `*.integration.spec.ts` chạy với Postgres thật (docker compose /
  CI service) — thêm khi tầng data có driver thật.
- E2e/smoke trong `test/`: spawn process thật, assert stdout + exit code.
- Không có ngưỡng coverage — ngưỡng % dạy người ta viết test đuổi coverage.
  Gate là: **mỗi acceptance criterion trong SPEC có một test.**

**Kiểm:** job `check` trong CI cố ý KHÔNG có service Postgres và không có
`DATABASE_URL` thật — test "unit" mà chạm DB sẽ fail ở đó theo cấu tạo.
Integration chạy job riêng (thêm cùng integration test đầu tiên).
Definition of Done = `pnpm check` xanh.

### STD-03 · Git
Branch: `spec/{name}` (bàn spec), `agent/{name}` (agent làm),
`feat|fix/{name}`. Conventional Commits (`feat|fix|docs|spec|chore`). PR: tối
thiểu 1 reviewer, không self-approve, CI xanh mới merge.
**Kiểm:** GitHub branch protection trên `main` (required checks + 1 approval —
cấu hình một lần trong repo settings). Tên branch: review.

---

## Quy trình

### Gate review
| Gate | Gì | Ai |
|------|----|----|
| L1 | Test + build/typecheck pass | CI |
| L2 | Code khớp acceptance criteria trong SPEC của nó | reviewer |
| L3 | Constitution: các rule máy kiểm SEC/ARCH/STD | CI (`pnpm check`) |
| L4 | Rule chỉ-review (SEC-03 phần còn lại, DATA-01, ARCH-02/03) + demo ngắn | reviewer |

CI không kiểm L2 và L4 — nói ngược lại là dạy reviewer bỏ qua chúng.

### Triển khai
Local: `docker compose up -d postgres` + `pnpm dev`. Chưa có CD — thêm workflow
khi team chọn host. Freeze `main` trước release/demo; khẩn cấp đi qua
`git revert`, không hotfix.

### Sửa đổi
File này đổi qua PR có đa số team approve, và **mỗi rule mới ship máy kiểm
trong cùng PR** (hoặc ghi rõ `review`). Team lead phân xử tranh chấp hằng ngày.

---

## Chính sách AI Agent

**Được làm không cần hỏi:** đọc/ghi `src/server`, `src/client`, `docs`,
`.sdd/specs`; chạy pnpm script, jest, tsc; commit trên branch `agent/*`.

**Cần người xác nhận:** xoá file; sửa file này; push lên `main`; thêm
dependency (`package.json`); đổi schema DB (`src/server/database/**`); mọi thứ
đụng `.env*`.

**Bắt buộc:** không in/commit giá trị secret; báo cáo edge case mà SPEC chưa
cover thay vì tự đoán; cập nhật `TASKS.md` của feature khi xong task; câu hỏi
kiến thức thì ghi vào `docs/qa/` theo quy ước sẵn có.
