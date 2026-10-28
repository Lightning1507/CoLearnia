# Web

- Đọc [scope](../../docs/product/scope.md), tài liệu miền qua [mục lục](../../docs/README.md) và [kiến trúc](../../docs/architecture.md).
- Import schema/types chia sẻ qua `@colearnia/contracts`; không import server internals hoặc đưa secret server vào VITE_*.
- Zustand giữ projection để render; TanStack Query giữ REST cache. Track/transport/audio nodes thuộc controller runtime, không persist store/localStorage.
- Chuyển panel không unmount call controller; cleanup chịu được StrictMode và phải kiểm generation.
- UI hiển thị rõ scope mic, freeze/live và đích gửi chat Everyone/Host; không tự bật thiết bị hoặc nâng audience do reconnect.
- Chat theo [messaging](../../docs/product/messaging.md): phân biệt kênh/general, DM và thread TEXT với chat cuộc họp. Thread không đẩy reply vào dòng chính; đổi Workspace/quyền phải dọn cache/subscription private cũ, không chỉ ẩn panel.
- Kiểm tra UI bằng browser khi thay hành vi; trạng thái mock phải được ghi rõ. Test quyền client không thay kiểm quyền server.
- Dùng lệnh check theo root AGENTS; typecheck bằng tsconfig của package. Giữ UI tiếng Việt, định danh kỹ thuật rõ nghĩa và pattern hiện có.

- Nhóm theo [ba bối cảnh](../../docs/product/group-modes.md): ẩn share trong DISCUSSION, phân biệt Về phòng chung với Rời cuộc họp; ACTIVITY không tự nhận nguồn MAIN. Timer chung chỉ nhắc; ACTIVITY có một nguồn đang share/nhóm, mọi member tự bấm không xin host. Chỉ người được duyệt thấy Vào nhóm DISCUSSION; phase ACTIVITY không mở request DISCUSSION.

- [Host cuộc họp](../../docs/product/live-session.md#83-chuyển-host-và-host-mất-mạng): một kiểu cuộc họp, người bắt đầu là host; chuyển quyền có xác nhận, không tự nhận host. MAIN mọi participant tự share khi trống, không xin host/giành nguồn; DISCUSSION vẫn cấm share riêng. Host mất mạng quá grace: chọn ngẫu nhiên participant hợp lệ làm host tạm, tự hoàn quyền khi host cũ quay lại hợp lệ; các nhánh rời chủ động/nhiều sự cố đọc nguồn trước khi triển khai.
