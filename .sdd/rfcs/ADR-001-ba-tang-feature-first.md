# ADR-001: Ba tầng feature-first trong src/server

Ngày: 2026-08-10 · Trạng thái: accepted

## Quyết định
`src/server` chia theo feature (`modules/{feature}/`), trong mỗi feature ba
tầng `http/ → domain/ → data/`; hạ tầng cross-cutting (`config/`, `logging/`,
`database/`) nằm cạnh `modules/`. Mũi tên phụ thuộc chỉ đi vào trong. Wiring
bằng DI container của Nest; ranh giới ép bằng ESLint `no-restricted-imports`.

## Vì sao
- Cùng mục tiêu với ADR-001 của `template-mern-stack` (ranh giới cứng, máy kiểm
  được, để người + agent làm song song không dẫm chân) nhưng bằng phương tiện
  của Nest thay vì Express thuần.
- Khác template ba điểm, đều là hệ quả của Express → Nest:
  - Không có tầng `usecase` riêng — service trong `domain/` gánh vai đó. Thêm
    tầng thứ tư chỉ khi một service phải điều phối nhiều repository/feature.
  - Không "truyền repository làm tham số" — DI là chuẩn của Nest, và tính đóng
    gói đến từ `exports` của module: provider không export là private thật, do
    DI container ép chứ không phải quy ước.
  - Ranh giới ép bằng ESLint thay vì grep — hiểu cú pháp import, ít false
    positive hơn.
- Chi tiết kiến trúc và vì sao không để phẳng: README §Kiến trúc.

## Đánh đổi
- Nhiều file hơn một app Express phẳng. Chấp nhận: ranh giới là thứ giữ việc
  làm song song không rối.
- Domain service mang decorator `@Injectable()` — domain không "thuần" 100%.
  Chấp nhận: đổi framework server thì đằng nào cũng viết lại tầng interface.
- Repository đang inject bằng class trực tiếp, chưa có port/interface. Thêm
  port khi xuất hiện repository thứ hai cho cùng domain (in-memory repo cho
  test là ứng viên đầu tiên).
