# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
# Có devDependencies (@nestjs/cli, typescript) vì cần để biên dịch.
FROM node:22-alpine AS build

# Corepack lấy đúng pnpm ghi trong `packageManager` của package.json.
# Tắt prompt vì build không có TTY để trả lời.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Manifest copy TRƯỚC source: sửa một dòng trong src/ không làm mất cache
# của bước install (bước chậm nhất). Đảo thứ tự là mỗi lần build đều cài lại.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

# `prune --prod` gỡ devDependencies ngay tại chỗ, để stage sau chỉ việc copy
# node_modules đã sạch — khỏi cài lần hai.
RUN pnpm build && pnpm prune --prod

# ---------- Stage 2: runtime ----------
# Image mới hoàn toàn: không có pnpm store, không có source .ts, không có
# devDependencies. Chỉ những gì cần để `node dist/main` chạy.
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Image node có sẵn user `node` (uid 1000). Chạy root trong container là thói
# quen xấu không có lý do gì để giữ.
USER node

EXPOSE 3000

# Dạng exec (mảng), không phải dạng shell: node thành PID 1 và nhận thẳng
# SIGTERM khi `docker stop`. Dạng shell thì sh làm PID 1, nuốt tín hiệu, và
# `enableShutdownHooks` của Nest không bao giờ chạy.
CMD ["node", "dist/main"]
