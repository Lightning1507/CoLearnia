<!-- Title nhập riêng bằng tiếng Anh: <type>(<scope>): <short description> [<Jira-key>], ví dụ feat(auth): add login form [SCRUM-25]; bỏ mã nếu chưa có ticket, không dùng nguyên tên nhánh. Body bằng tiếng Việt; dẫn mã Jira liên quan. Closes #... / Refs #... chỉ dùng nếu thực sự có GitHub Issue. Giữ What, Why, Environment Variables và Developer Test; có thể xóa How/Limits khi không cần. PR nhỏ viết ngắn, không điền cho đủ heading. -->

## What — Thay đổi gì?

<!-- Nêu kết quả và hành vi trước/sau nếu hữu ích; dẫn issue/feature thật nếu có. -->

-

## Why — Vì sao cần thay đổi?

<!-- Nêu vấn đề và tác động đối với người dùng hoặc quá trình phát triển. -->

-

## How — Thực hiện như thế nào?

<!-- Tùy chọn: giải thích cách làm, lựa chọn kỹ thuật hoặc phạm vi đáng review. Xóa mục này nếu What/Why đã đủ rõ; không kể lại từng dòng code. -->

-

## Environment Variables — Biến môi trường

<!-- Không có thay đổi thì giữ “Không có”. Nếu có: ghi tên biến, mục đích, bắt buộc/tùy chọn, default không nhạy cảm và cấu hình dev/production cần cập nhật (.env.example/runbook). Không ghi giá trị secret. -->

- Không có.

## Developer Test — Tác giả đã kiểm tra

<!-- Ghi loại kiểm tra phù hợp: Unit / Integration / Manual / kiểm tài liệu; lệnh hoặc bước thực chạy, kết quả và evidence/môi trường khi cần. Có thể xóa các dòng gợi ý không áp dụng. Không tích sẵn pass hoặc bắt PR tài liệu phải có test code. -->

- Kiểm tra đã chạy và kết quả:
- `pnpm check`: <!-- Ghi kết quả thực; chưa chạy thì nêu rõ lý do. -->
- Chưa kiểm / giới hạn kiểm chứng: <!-- Ghi “Không có bổ sung” nếu không có. -->

## Limits — Giới hạn và việc tiếp theo

<!-- Tùy chọn: nêu giới hạn, rủi ro, migration/deploy/rollback hoặc việc tiếp theo đáng lưu ý. Xóa mục nếu không có; phần kiểm thử chưa chạy vẫn phải ghi ở Developer Test. -->

-
