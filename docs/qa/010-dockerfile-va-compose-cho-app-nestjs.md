# 010 — Dockerfile & compose cho chính app NestJS

**Ngày:** 2026-08-04
**Từ khoá:** dockerfile, multi-stage, layer cache, corepack, packageManager, dockerignore, build context, PID 1, SIGTERM, healthcheck, depends_on, service_healthy, env_file

## Câu hỏi

> hướng dẫn tôi viết docker đi

Bài [008](008-docker-compose-cho-mongodb.md) đã trả lời phần "chạy một database
có sẵn image". Bài này là phần còn lại: **đóng gói chính app mình viết** thành
image, và ghép hai container lại trong một compose.

Chốt trước hai điều mơ hồ trong repo:

- **Postgres, không phải Mongo.** `src/config/env.schema.ts` `refine` rằng
  `DATABASE_URL` phải bắt đầu bằng `postgres://` — thiếu là process exit 1 lúc
  boot. Bài 008 viết về Mongo là bài học rời, chưa áp vào repo.
- **Có Dockerfile cho app**, không chỉ compose dựng DB.

## Trả lời

### Vì sao 3 file, không phải 1

| File | Vai trò |
|---|---|
| `Dockerfile` | Công thức **build** image cho app mình viết. Postgres không cần vì đã có image chính thức — như Mongo ở bài 008. |
| `docker-compose.yml` | Công thức **chạy**: nhiều container, nối mạng, thứ tự khởi động. |
| `.dockerignore` | Danh sách không gửi sang Docker daemon. |

---

## `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
FROM node:22-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm build && pnpm prune --prod

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main"]
```

### `# syntax=docker/dockerfile:1`

Chọn parser (frontend) mới nhất của dòng 1.x. Cú pháp mới dùng được mà không
phụ thuộc version Docker cài trên máy.

### Chọn base image

- `alpine` ~50MB, `node:22` thường ~350MB. Khác biệt là bộ userspace: alpine
  dùng musl libc thay glibc.
- **Node 22 chứ không 26** dù máy dev đang chạy 26: `devDependencies` khai
  `@types/node: ^22`. Build bằng runtime lệch major với type definitions là tự
  mời lỗi. 22 cũng là LTS.
- `AS build` đặt tên stage để stage sau `COPY --from=build`.

### Corepack và field `packageManager`

Corepack đi kèm Node. Nó đọc field `packageManager` trong `package.json` rồi
tải đúng version pnpm đó — nên phải thêm vào `package.json`:

```json
"packageManager": "pnpm@11.18.0"
```

Không có field này, corepack không biết tải bản nào. Không đặt
`COREPACK_ENABLE_DOWNLOAD_PROMPT=0` thì nó dừng hỏi y/n trong môi trường không
có TTY và build đứng.

Lợi ích phụ: field này cũng ghim pnpm cho mọi người trong team, không chỉ cho
Docker.

### Thứ tự `COPY` — đây là toàn bộ trò chơi

Mỗi lệnh trong Dockerfile tạo một **layer**. Docker cache layer theo nội dung
input: nếu `COPY package.json pnpm-lock.yaml` cho ra layer y hệt lần trước thì
layer `RUN pnpm install` phía sau cũng dùng lại cache — không chạy lại.

Viết `COPY . .` rồi mới install thì sửa **một dòng comment** trong `src/` cũng
làm layer COPY đổi → cài lại toàn bộ dependencies. Build 5 giây thành 60 giây.

> Quy tắc: thứ ít đổi để trên, thứ hay đổi để dưới.

`--frozen-lockfile` = fail nếu lockfile không khớp `package.json`, thay vì âm
thầm sửa lockfile. Build phải tái lập được, không được tự ý nâng version.

### `pnpm prune --prod`

Xoá devDependencies khỏi `node_modules` **ngay tại chỗ**. Cách khác là thêm một
stage chạy `pnpm install --prod` lần hai — tải lại từ đầu. Prune chỉ xoá: nhanh
hơn, ít stage hơn.

### Stage 2 — điểm chính của multi-stage

Bắt đầu lại từ image sạch. Mọi thứ ở stage 1 — pnpm store, source `.ts`,
`typescript`, `@nestjs/cli` — **không** vào image cuối. Chỉ cái gì `COPY --from`
mới vào.

| | Kích thước image cuối |
|---|---|
| Build một stage | ~800MB – 1GB |
| Multi-stage | ~200MB |

pnpm dựng `node_modules` bằng symlink trỏ vào `node_modules/.pnpm/...`. Symlink
tương đối và nằm trong cùng thư mục nên copy sang stage khác vẫn đúng.

### `USER node`

Image Node có sẵn user `node` (uid 1000). Container chạy root nghĩa là một lỗ
hổng RCE trong app = root trong container, và với vài cấu hình còn thoát ra host
được.

### `EXPOSE 3000`

**Thuần tài liệu.** Không mở cổng gì cả. `ports:` trong compose mới thật sự mở.

### `CMD` dạng mảng — bẫy PID 1

| Dạng | Chuyện gì xảy ra khi `docker stop` |
|---|---|
| `CMD node dist/main` (shell form) | Docker chạy `/bin/sh -c "..."`. **sh là PID 1**, nhận SIGTERM, không forward xuống node. Node bị SIGKILL sau 10s. `enableShutdownHooks` của Nest không chạy, connection pool không đóng. |
| `CMD ["node", "dist/main"]` (exec form) | **node là PID 1**, nhận thẳng SIGTERM, Nest shutdown gọn. |

Cũng vì lý do này mà không dùng `CMD ["pnpm", "start:prod"]`: thêm một tầng
process nữa (pnpm → node), đúng lại cái bẫy tín hiệu.

---

## `.dockerignore`

```
node_modules/
dist/
coverage/
*.tsbuildinfo
.env
.env.*
!.env.example
.git/
docs/
*.md
```

Trước khi build, Docker CLI đóng gói **cả thư mục** gửi sang daemon — gọi là
**build context**. Không có `.dockerignore` thì `node_modules` 500MB cũng bay
sang dù Dockerfile không hề copy nó.

Tệ hơn: `.env` nằm trong context. Chỉ cần một `COPY . .` bất cẩn là secret vào
image **vĩnh viễn**. Xoá file ở layer sau không xoá được nó khỏi lịch sử image
— `docker history` vẫn moi ra.

---

## `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: starci
      POSTGRES_PASSWORD: starci
      POSTGRES_DB: starci_shop
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U starci -d starci_shop']
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://starci:starci@postgres:5432/starci_shop
      PORT: 3000
      NODE_ENV: development
    ports:
      - '3000:3000'
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres-data:
```

### healthcheck + `depends_on` — khác bài 008 chỗ này

Bài 008 nói healthcheck là thừa. Đúng, **vì lúc đó chỉ có mỗi một service**.
Giờ có `app` phụ thuộc thì cần thật:

- `depends_on: - postgres` trần chỉ đợi container **được tạo**, không đợi
  Postgres sẵn sàng nhận query.
- Postgres mở cổng 5432 **trước** khi thật sự phục vụ — lần chạy đầu nó còn
  chạy `initdb`, mất vài giây.
- `pg_isready` là tool chính chủ đi kèm image, trả về 0 khi server nhận
  connection được.
- `condition: service_healthy` bảo compose đợi healthcheck xanh mới start app.

Thiếu nó: app boot, connect trượt, rơi vào `bootstrap().catch` → `exit 1`.
`restart: unless-stopped` sẽ cứu sau vài vòng, nhưng đó là vá triệu chứng — và
log boot đầy lỗi giả.

### `env_file` vs `environment`

`env_file` nạp cả file, `environment` ghi đè từng key. Ba key bắt buộc phải đè:

| Key | Vì sao |
|---|---|
| `DATABASE_URL` | `.env` trỏ `localhost:5432` — đúng khi `pnpm dev` ở host, **sai hoàn toàn** trong container: `localhost` của container app là chính nó (network namespace riêng). Phải là `postgres` = **tên service**; compose có DNS nội bộ resolve tên service thành IP container. |
| `PORT` | Cố định 3000 để khớp mapping `3000:3000`. Ai đó đổi `.env` thành `PORT=4000` thì app nghe 4000 còn mapping trỏ 3000 → đứt. |
| `NODE_ENV` | Dockerfile đặt `production`, nhưng `env_file` **ghi đè nó lúc runtime** thành `development`. Ghi rõ ra để đó là quyết định nhìn thấy được, không phải tai nạn. |

Kiểm tra kết quả hợp nhất mà không cần chạy gì:

```bash
docker compose config
```

Lệnh này in ra file compose sau khi đã resolve `env_file`, biến `${...}` và
default — cách nhanh nhất để bắt lỗi ghi đè env.

### `ports` của postgres

`'5432:5432'` chỉ để psql/DBeaver/TablePlus ở **host** nối vào. App trong
compose không cần — nó đi qua network nội bộ. Bỏ dòng đó đi thì bớt một cổng mở
ra ngoài (xem đoạn cuối bài 008).

---

## Lệnh thường dùng

```bash
docker compose up -d --build     # build image app + bật cả hai
docker compose logs -f app       # xem log app
docker compose exec postgres psql -U starci -d starci_shop
docker compose config            # xem cấu hình đã resolve
docker compose down              # tắt, giữ data
docker compose down -v           # tắt và xoá volume (mất data)
```

---

## Những thứ cố tình chưa thêm

- **healthcheck cho service `app`** — chưa service nào `depends_on` nó. Thêm
  khi có reverse proxy hoặc service thứ hai chờ app.
- **Hot reload trong container** (bind mount + `pnpm dev`) — bind mount trên
  macOS đi qua lớp VM nên I/O chậm; chạy `pnpm dev` thẳng ở host vẫn nhanh hơn.
- **Migration runner** — chưa có ORM, `src/database/db.repository.ts` còn là
  no-op.
- **Compose riêng cho production** — file này là dev. Deploy thật thì secret
  đến từ orchestrator (Kubernetes Secret, ECS task definition...), không phải
  file `.env` nằm cạnh source.
