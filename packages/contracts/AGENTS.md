# Contracts

- Nguồn: [quy ước contracts](../../docs/contracts/README.md), nghiệp vụ qua [mục lục](../../docs/README.md).
- Zod schema ở biên, types suy từ schema; schema không tự cấp ACL. Payload/ack/event phải có cùng tên và semantics ở hai bên.
- Không import web/server internals, Mongoose hoặc runtime mediasoup. Package chia sẻ không chứa secret/config server hoặc I/O nghiệp vụ.
- Command cần actor/quyền, revision/generation và ví dụ allow/deny/stale rõ theo baseline; không tự coi payload unknown hiện có là contract đầy đủ.
- Chat theo [messaging](../../docs/product/messaging.md): phân biệt CHANNEL/DIRECT với SESSION/GROUP/HOST_PRIVATE, text/ảnh/file với text/ảnh. Không bắt DM hoặc thread TEXT dùng LiveSession epoch/callGeneration; rootId hợp schema chưa chứng minh root cùng kênh.
- Thay contract phải được bên gửi/nhận review trước hoặc cùng PR; build contracts để kiểm consumers. Không tự thêm event/collection cho phần ngoài scope.

- Theo [group modes](../../docs/product/group-modes.md), phân biệt group request/approval, mode, audience/source và countdown round. MAIN share cap không là cap toàn session; mỗi ACTIVITY một nguồn đang share; không host approval cho member. Phân biệt approved roster với membership sau group.join, kiểm phase ở request/approve/join. Deadline hết hạn tự kết thúc đúng lượt ACTIVITY/về MAIN; round/epoch và cleanup idempotent chặn callback trễ/lặp, reconnect không mở lại scope cũ. Không dùng expired như sự kiện chỉ nhắc hoặc lệnh client tự kết thúc.

- [Host cuộc họp](../../docs/product/live-session.md#83-chuyển-host-và-host-mất-mạng): một kiểu cuộc họp, người bắt đầu là host; chuyển quyền trực tiếp, không cần người nhận chấp nhận, không tự nhận host. MAIN mọi participant tự share khi trống, không xin host/giành nguồn; DISCUSSION vẫn cấm share riêng. Host mất mạng quá grace: chọn ngẫu nhiên participant hợp lệ làm host tạm, tự hoàn quyền khi host cũ quay lại hợp lệ; host chủ động rời khi còn giữ quyền thì kết thúc phiên cho mọi người; nhánh không có ứng viên/nhiều sự cố đọc nguồn trước khi triển khai.
