# Proposal theo miền phụ trách

Mỗi thành viên đặt proposal `.md` của miền mình trong thư mục này. [Proposal mẫu](../templates/feature-proposal-sample.md) minh họa cấu trúc và mức chi tiết; ví dụ quản lý sách, công nghệ và số liệu trong mẫu không phải yêu cầu của CoLearnia.

## Đặt tên file

Bản hiện có: [M1 — Tài khoản, Workspace và quyền truy cập kênh](m1-workspace-auth.md), trạng thái Draft để team review; chưa là thiết kế đã duyệt hoặc task đã giao.

| Miền                        | Tên file                |
| --------------------------- | ----------------------- |
| M1 — Tài khoản và Workspace | `m1-workspace-auth.md`  |
| M2 — Chat và tệp            | `m2-messaging-files.md` |
| M3 — Media                  | `m3-media.md`           |
| M4 — Phiên họp và nhóm      | `m4-session-groups.md`  |
| M5 — Board                  | `m5-board.md`           |

Phạm vi chính xác lấy từ [5 miền phụ trách](../product/delivery-domains.md) và [FR/AC](../product/functional-requirements.md). Chỉ tạo file của miền đã nhận, không cần tạo sẵn các file trống.

## Chuẩn bị và gửi review

1. Từ `main` mới nhất, tạo nhánh riêng, ví dụ `feature/m3-media-proposal`.
2. Viết proposal theo mẫu, tập trung vào phạm vi, hướng triển khai, dữ liệu/API/socket, quyền, các miền cần phối hợp, rủi ro, task sơ bộ và estimate. Ghi rõ giả định và câu hỏi chưa chốt.
3. Push nhánh và mở **Draft PR** vào `main`; title tiếng Anh, ví dụ `docs(media): propose media implementation`. Description tiếng Việt theo quy ước PR của repo.
4. Gửi link Draft PR vào nhóm Messenger. Đợt review ngày **03/11/2026**, gửi trước **18:00 (giờ Việt Nam)** để team đọc trước buổi họp.
5. Các thành viên đọc phần giao với miền mình và comment trực tiếp trong PR. Sau buổi họp, tác giả cập nhật trên cùng nhánh/PR, chuyển sang Ready for review khi đủ nội dung rồi thực hiện review/merge theo quy trình.

Proposal là thiết kế để thảo luận; việc mở PR hoặc merge tài liệu không tự thay đổi nghiệp vụ/kiến trúc đã chốt. Thay đổi baseline cần được thống nhất và cập nhật nguồn liên quan. Estimate ghi kèm giả định và phụ thuộc; chưa là cam kết sprint.
