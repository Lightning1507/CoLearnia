# SCRUM-34 — Chọn, tạo và mở Workspace

- `pnpm check` pass, gồm 812 unit test. Build web còn cảnh báo kích thước chunk.
- 68 integration test trong `create-workspace.integration.ts` và `workspace-access.integration.ts` pass trên MongoDB 8.0.16 replica set riêng. Kiểm API từ server thật với hai tài khoản, danh sách rỗng, phân trang, phân quyền, Workspace đã xóa và deny barrier đang chờ thu quyền. Hai ca hồi quy kiểm gửi lại sau khi mất entry và Workspace bị thu quyền giữa lúc đọc hai mục trong cùng trang.
- Trước lần cập nhật theo review, Chrome chạy giao diện thật với API fixture. Đăng nhập, thấy danh sách rỗng, giữ tên khi POST trả 503, tải lại danh sách, gửi lại cùng payload và requestId, rồi mở Workspace. Mở URL trực tiếp ở tab mới cũng thành công. Lệnh reload trên cùng tab bị Chrome chặn do giao diện extension.
- Màn mở hiển thị Workspace và vai trò đã được API xác nhận. Dữ liệu kênh và panel chat/cuộc gọi thuộc các task tích hợp tiếp theo.
- Chống lặp dựa trên cửa sổ 10 phút của SCRUM-33 trong cùng tiến trình. Gửi lại từ UI dùng `replayOnly: true`. Nếu máy chủ mất entry hoặc entry hết hạn, API trả 410 mà không tạo thêm dữ liệu. UI kiểm thời hạn trước mỗi POST và không xếp hàng POST chờ mạng. Thông tin lần gửi lại chỉ giữ trong màn tạo hiện tại.
