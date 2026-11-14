# SCRUM-29 — Đăng xuất và xử lý phiên hết hạn

- Nhánh `feature/SCRUM-29-session-logout`, thay đổi chưa commit. Dùng mẫu bàn giao tại [task brief](../ai/task-template.md).
- `pnpm check` pass, gồm harness 55 test, 136 mục nguồn/runtime và 816 test trong suite mặc định. Build web có cảnh báo kích thước chunk.
- `COLEARNIA_DB_TEST_PORT=27017 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/registration.integration.ts` pass 30 test trên replica set local với database UUID riêng.
- HTTP và DB thật kiểm Origin sai, payload cố chọn phiên khác, cleanup chưa gắn trả 503, phiên bị deny trong khi bản ghi còn, retry với adapter giả, ghi thu hồi, clear cookie, logout lặp và phiên độc lập của cùng tài khoản còn hợp lệ.
- Socket.IO thật kiểm phiên hết hạn khi socket đang rảnh, đóng kết nối và từ chối kết nối lại. Test đồng hồ giả kiểm đóng nhiều kết nối của cùng phiên và giữ phiên khác.
- Chưa chạy UI trực tiếp trên trình duyệt. Cleanup chat/file/LIVE thật thuộc M1-T15.2. Runtime chưa gắn adapter thật sẽ trả 503 cho logout đang chờ cleanup.
- Reviewer M4 kiểm phạm vi `AUTH_SESSION` và hành vi deny khi cleanup chưa xác nhận.

## Cập nhật sau review

- Ca hồi quy kiểm record thu phiên đã hoàn tất không chặn thu membership khi giới hạn thao tác là 1, cleanup được thử lại sau khi đóng socket, và CSRF lỗi không tự gửi lại POST logout.
- Record deny của phiên đã thu được giữ đến hạn phiên để chặn context cũ đang chạy, rồi được dọn khi coordinator nhận thao tác mới. Cleanup hết hạn thử lại tối đa bốn lần.
