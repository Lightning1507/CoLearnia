# Web

- Đọc [scope](../../docs/product/scope.md), tài liệu miền qua [mục lục](../../docs/README.md) và [kiến trúc](../../docs/architecture.md).
- Import schema/types chia sẻ qua `@colearnia/contracts`; không import server internals hoặc đưa secret server vào VITE_*.
- Zustand giữ projection để render; TanStack Query giữ REST cache. Track/transport/audio nodes thuộc controller runtime, không persist store/localStorage.
- Chuyển panel không unmount call controller; cleanup chịu được StrictMode và phải kiểm generation.
- UI hiển thị rõ scope mic, freeze/live và đích gửi chat Everyone/Host; không tự bật thiết bị hoặc nâng audience do reconnect.
- Chat theo [messaging](../../docs/product/messaging.md): phân biệt kênh/general, DM và thread TEXT với chat cuộc họp. Thread không đẩy reply vào dòng chính; đổi Workspace/quyền phải dọn cache/subscription private cũ, không chỉ ẩn panel.
- Kiểm tra UI bằng browser khi thay hành vi; trạng thái mock phải được ghi rõ. Test quyền client không thay kiểm quyền server.
- Dùng lệnh check theo root AGENTS; typecheck bằng tsconfig của package. Giữ UI tiếng Việt, định danh kỹ thuật rõ nghĩa và pattern hiện có.

- Nhóm theo [ba bối cảnh](../../docs/product/group-modes.md): ẩn share trong DISCUSSION, phân biệt Về phòng chung với Rời cuộc họp; ACTIVITY không tự nhận nguồn MAIN. Timer chung hết hạn thì server tự kết thúc ACTIVITY/về MAIN, UI không chờ host xác nhận; thành viên được tự về sớm, không kéo cả nhóm. Không dựng nút host kết thúc ACTIVITY thủ công; ACTIVITY có một nguồn đang share/nhóm, mọi member tự bấm không xin host. Chỉ người trong danh sách hợp lệ thấy Vào nhóm DISCUSSION; phase ACTIVITY không mở request DISCUSSION.

- [Host cuộc họp](../../docs/product/live-session.md#83-chuyển-host-và-host-mất-mạng): một kiểu cuộc họp, người bắt đầu là host; chuyển quyền trực tiếp, không cần người nhận chấp nhận, không tự nhận host. MAIN mọi participant tự share khi trống, không xin host/giành nguồn; DISCUSSION vẫn cấm share riêng. Host mất mạng quá grace: chọn ngẫu nhiên participant hợp lệ làm host tạm, tự hoàn quyền khi host cũ quay lại hợp lệ; host chủ động rời khi còn giữ quyền thì kết thúc phiên cho mọi người; nhánh không có ứng viên/nhiều sự cố đọc nguồn trước khi triển khai.

- PRIVATE theo [messaging](../../docs/product/messaging.md): owner/admin quản lý danh sách, nội dung vẫn cần membership và channel access; thêm/re-add thấy lịch sử còn lưu, gỡ thu event/file/LIVE ngay. TEXT/LIVE độc lập WORKSPACE/PRIVATE; khóa trên UI không thay ACL. DM rejoin chỉ mở lịch sử khi cả hai membership hợp lệ; PRIVATE cũ không tự phục hồi sau rejoin Workspace, owner/admin phải thêm lại.

- Board theo [nguồn hiện hành](../../docs/product/board-collaboration.md): MAIN không freeze/resume, chỉ host hiện hành ở MAIN/hướng dẫn được vẽ/clear LIVE, kể cả người khác share; nét thường hoặc tự biến mất, đổi/dừng nguồn xóa overlay. DISCUSSION/ACTIVITY giữ freeze/vẽ chung của nhóm, không công bố ra MAIN. Không cho quyền share thay quyền vẽ; server kiểm role/scope/source, thu quyền host cũ; chưa chốt thời gian/fade nét tạm.

- Theo [quy tắc nhóm ngày 02/11](../../docs/product/group-modes.md): host chỉ vào hỗ trợ ACTIVITY; DISCUSSION hỏi/trả lời qua chat riêng khi host ở MAIN. Nhóm DISCUSSION tạo hợp lệ chưa ai vào vẫn chờ; còn người thì roster hợp lệ được chủ động vào lại; người cuối cùng chủ động rời nhóm đã có người thì tự đóng, thu chat/board/media và bỏ nút vào lại cho cả roster. Mất mạng không coi ngay là chủ động rời; không áp tự đóng theo số người cho ACTIVITY.

- Sau kickoff 02/11: DISCUSSION tạo ngay khi server kiểm hợp lệ, không host approve/reject/cancel-pending nghiệp vụ; roster chưa là membership. ACTIVITY random preview cân số lượng, chỉnh trước start, không xáo khi chạy. RECORD-01 theo [recording](../../docs/product/recording.md): host ghi màn hình/camera/âm thanh MAIN, không ghi nhóm riêng; video chỉ cho thành viên còn quyền kênh. Demo vài phút chưa là giới hạn sản phẩm; pipeline/quota/retention/schema còn chờ proposal/PoC, không tự chọn hoặc gọi là đã triển khai.
