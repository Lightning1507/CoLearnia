# Review đồng bộ quy tắc board — 02/11/2026

## Phạm vi và kết quả

Theo xác nhận người dùng, sửa thiết kế hiện hành; không là thay đổi code/runtime.

| Tiêu chí         | Kết quả review tài liệu                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| MAIN             | Không freeze/resume; chỉ host hiện hành ở MAIN/hướng dẫn vẽ, kể cả người khác share; share vẫn mở khi nguồn trống |
| Nét MAIN         | Nét thường hoặc tự biến mất; undo nét mình, clear xác nhận; đổi/dừng nguồn xóa overlay, không tracking slide      |
| Nhóm             | DISCUSSION kế thừa MAIN và không share; ACTIVITY dùng nguồn riêng; cùng freeze/vẽ/resume, audio tiếp tục          |
| Thu quyền        | Đổi host chặn mutation cũ; host không tự mở board nhóm; không mang ảnh/nét nhóm về MAIN                           |
| UC               | BOARD-01/05 chỉ nhóm, BOARD-02 có quyền riêng host tại MAIN; giữ mã, số lượng và cấu trúc tổng quan               |
| DB               | MAIN không FrozenFrame, FRAME cần groupId hợp lệ; giữ 13 collection, board/nét ở RAM                              |
| Harness/UI brief | Chỉ dẫn root/web/server/contracts và workflow trỏ policy mới; prompt 2 bỏ MAIN freeze, prompt 3 giữ freeze nhóm   |

Đã rà nguồn board, scope, backlog, policy, group modes, catalog/outline, HS-04/05, technical plan, kiến trúc, contracts và thiết kế dữ liệu. Lịch sử review/evidence cũ giữ snapshot theo ngày, không dùng làm policy hiện hành.

## Kiểm tra đã chạy

- Node bundled chạy `scripts/check-harness.mjs`: PASS 86 nguồn/liên kết và runtime pins.
- Node bundled chạy `--test scripts/check-harness.test.mjs scripts/architecture.test.mjs`: 52/52 PASS.
- Prettier trên Markdown thay đổi và brief UI: PASS sau format.
- `git diff --check`: PASS.

Checker không kiểm ngữ nghĩa hoặc anchors. Kết quả review ngữ nghĩa là đối chiếu tài liệu, không là test ACL/media/DB.

## Giới hạn và bước tiếp

- Chưa chốt thời gian/fade nét tự biến mất; chưa thêm thông số cố định.
- Tại lượt kiểm tài liệu ban đầu chưa sửa/xuất Astah/PNG. Cập nhật sau đó ngày 02/11: người phụ trách xác nhận Astah và ảnh UC đã là bản mới nhất; xem [trạng thái bản vẽ](../product/diagrams/README.md). Đây là cập nhật trạng thái theo xác nhận, không phải lần chạy lại kiểm API/font.
- Chưa gửi prompt sửa vào Figma Make, chưa kiểm lại prototype theo policy mới.
- Chưa sửa schema code/DB đang chạy, chưa migration hoặc thử media; không chạy full `pnpm check` cho lượt sửa tài liệu này.
- Chưa commit/push. Thay đổi docs/README và brief UI có sẵn được giữ, cập nhật theo quyết định mới.
