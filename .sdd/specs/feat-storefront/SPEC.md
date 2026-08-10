# SPEC: feat-storefront

## Vấn đề
Mọi milestone UI sắp tới (auth, catalog, cart…) cần một khung frontend để render
vào. Hiện `src/client/` trống — chưa có app, chưa có design system, chưa có
provider. Task này dựng nền: app Next.js App Router tên `storefront` chạy
HeroUI v3 + Tailwind v4, providers và design token đặt đúng chỗ, build
production pass.

## Hành vi
- App Next.js App Router (thư mục `app/`, KHÔNG phải `pages/`) đặt tại
  `src/client/`, package tên `storefront`, độc lập với backend (package.json
  riêng — root `pnpm check` không đổi).
- `globals.css`: `@import "tailwindcss";` rồi `@import "@heroui/styles";` —
  đúng thứ tự để token HeroUI áp lên component.
- `app/providers.tsx` là client component (`"use client"`) bọc
  `HeroUIProvider`; `app/layout.tsx` Ở LẠI server component — nạp font qua
  `next/font`, khai báo metadata, bọc `{children}` trong `<Providers>`.
- Trang chủ `/` render bằng component HeroUI thật (Typography/Button) với
  design token (`text-foreground`, `text-muted`…), không dùng `<h1>`/`<p>`
  trần cho UI chính. Nội dung: "StarCi Shop" + mô tả khung UI nền.

## Acceptance criteria
- [x] `next build` production pass, route `/` prerender tĩnh
- [x] HTML prerender của `/` chứa nội dung "StarCi Shop" render qua HeroUI
- [x] `providers.tsx` có `"use client"`; `layout.tsx` không có
- [x] Root `pnpm check` vẫn xanh (backend không bị ảnh hưởng)

## Ngoài phạm vi
Dark mode (next-themes), ToastProvider/QueryProvider, CI cho client, feature
nghiệp vụ bất kỳ — các milestone sau cắm vào Providers có sẵn.

## Changelog
- v1.0.0 (2026-08-10) — spec viết trước khi code theo quy trình SDD
