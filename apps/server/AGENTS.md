# Server

- Đọc [kiến trúc](../../docs/architecture.md), [quyền nhóm](../../docs/product/groups-media-policy.md), [model](../../docs/database/model.md) và [lifecycle](../../docs/database/lifecycle.md) theo task.
- REST/socket validate/auth rồi gọi cùng application service; không tạo hai bản policy hoặc tin actorId/groupId/source từ client.
- Chat kênh/DM/thread theo [messaging](../../docs/product/messaging.md): general tạo nguyên tử cùng Workspace, DIRECT unique cặp trong Workspace, thread giữ ACL kênh; admin không tự đọc DM. Kiểm file/event/history như kiểm gửi tin.
- Kiểm quyền trước create/resume Consumer, đóng tài nguyên khi revoke; project snapshot/event/file theo audience hiện tại.
- Giữ riêng epoch, callGeneration, policyRevision và board version/sequence. Resource async cũ phải được đóng khi quyền/state đã đổi.
- Không chờ browser picker/upload/client ack trong mutation queue hoặc transaction DB; close phải idempotent và cleanup compare generation.
- Không persist mediasoup objects. Tái khởi động kết thúc runtime cũ; không phục hồi grant bằng metadata DB.
- Module policy thuần không phụ thuộc Express/Socket.IO/Mongoose/mediasoup; orchestration/I/O ở service/adapter. Không dựng abstraction rỗng.
- Auth/quyền/file/media cần test từ chối; smoke worker không thay hai mạng/forced TURN. Không sửa readiness thành xanh giả.

- Nhóm theo [ba bối cảnh](../../docs/product/group-modes.md): MAIN một share, DISCUSSION cần host duyệt và cấm publish screen, ACTIVITY độc lập với MAIN. Mỗi ACTIVITY một share độc lập, member không host approval; duyệt DISCUSSION chưa cấp membership tới khi bấm vào, phase ACTIVITY chặn request/join DISCUSSION; deadline chung hết hạn tự kết thúc đúng lượt ACTIVITY, thu scope/share/help/chat/board và đưa người còn quyền về MAIN/pause mic; callback trễ/lặp và reconnect không mở lại nhóm cũ. Host đóng DISCUSSION, không kết thúc ACTIVITY thủ công.

- [Host cuộc họp](../../docs/product/live-session.md#83-chuyển-host-và-host-mất-mạng): một kiểu cuộc họp, người bắt đầu là host; chuyển quyền trực tiếp, không cần người nhận chấp nhận, không tự nhận host. MAIN mọi participant tự share khi trống, không xin host/giành nguồn; DISCUSSION vẫn cấm share riêng. Host mất mạng quá grace: chọn ngẫu nhiên participant hợp lệ làm host tạm, tự hoàn quyền khi host cũ quay lại hợp lệ; host chủ động rời khi còn giữ quyền thì kết thúc phiên cho mọi người; nhánh không có ứng viên/nhiều sự cố đọc nguồn trước khi triển khai.

- PRIVATE theo [messaging](../../docs/product/messaging.md): owner/admin quản lý danh sách, nội dung vẫn cần membership và channel access; thêm/re-add thấy lịch sử còn lưu, gỡ thu event/file/LIVE ngay. TEXT/LIVE độc lập WORKSPACE/PRIVATE; khóa trên UI không thay ACL. DM rejoin chỉ mở lịch sử khi cả hai membership hợp lệ; PRIVATE cũ không tự phục hồi sau rejoin Workspace, owner/admin phải thêm lại.

- Board theo [nguồn hiện hành](../../docs/product/board-collaboration.md): MAIN không freeze/resume, chỉ host hiện hành ở MAIN/hướng dẫn được vẽ/clear LIVE, kể cả người khác share; nét thường hoặc tự biến mất, đổi/dừng nguồn xóa overlay. DISCUSSION/ACTIVITY giữ freeze/vẽ chung của nhóm, không công bố ra MAIN. Không cho quyền share thay quyền vẽ; server kiểm role/scope/source, thu quyền host cũ; chưa chốt thời gian/fade nét tạm.
