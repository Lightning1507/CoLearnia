# Contracts

- Dùng [quy ước API/backend](../../docs/contracts/api-conventions.md) và [bảng mã lỗi](../../docs/contracts/error-codes.md); error envelope chung cho HTTP/socket, code mới phải có semantics/status và consumer review. Schema không lọc được nội dung bí mật bên trong message; adapter vẫn phải tạo lỗi an toàn.

- Nguồn: [quy ước contracts](../../docs/contracts/README.md), nghiệp vụ qua [mục lục](../../docs/README.md).
- Zod schema ở biên, types suy từ schema; schema không tự cấp ACL. Payload/ack/event phải có cùng tên và semantics ở hai bên.
- Không import web/server internals, Mongoose hoặc runtime mediasoup. Package chia sẻ không chứa secret/config server hoặc I/O nghiệp vụ.
- Command cần actor/quyền, revision/generation và ví dụ allow/deny/stale rõ theo baseline; không tự coi payload unknown hiện có là contract đầy đủ.
- Chat theo [messaging](../../docs/product/messaging.md): phân biệt CHANNEL/DIRECT với SESSION/GROUP/HOST_PRIVATE, text/ảnh/file với text/ảnh. Không bắt DM hoặc thread TEXT dùng LiveSession epoch/callGeneration; rootId hợp schema chưa chứng minh root cùng kênh.
- Thay contract phải được bên gửi/nhận review trước hoặc cùng PR; build contracts để kiểm consumers. Không tự thêm event/collection cho phần ngoài scope.

- Theo [group modes](../../docs/product/group-modes.md), phân biệt group create/join, mode, audience/source và countdown round. MAIN share cap không là cap toàn session; mỗi ACTIVITY một nguồn đang share; không host approval cho member. Phân biệt eligible roster với membership sau group.join, kiểm phase ở create/join. Deadline hết hạn tự kết thúc đúng lượt ACTIVITY/về MAIN; round/epoch và cleanup idempotent chặn callback trễ/lặp, reconnect không mở lại scope cũ. Không dùng expired như sự kiện chỉ nhắc hoặc lệnh client tự kết thúc.

- [Host cuộc họp](../../docs/product/live-session.md#83-chuyển-host-và-host-mất-mạng): một kiểu cuộc họp, người bắt đầu là host; chuyển quyền trực tiếp, không cần người nhận chấp nhận, không tự nhận host. MAIN mọi participant tự share khi trống, không xin host/giành nguồn; DISCUSSION vẫn cấm share riêng. Host mất mạng quá grace: chọn ngẫu nhiên participant hợp lệ làm host tạm, tự hoàn quyền khi host cũ quay lại hợp lệ; host chủ động rời khi còn giữ quyền thì kết thúc phiên cho mọi người; nhánh không có ứng viên/nhiều sự cố đọc nguồn trước khi triển khai.

- Board theo [nguồn hiện hành](../../docs/product/board-collaboration.md): MAIN không freeze/resume, chỉ host hiện hành ở MAIN/hướng dẫn được vẽ/clear LIVE, kể cả người khác share; nét thường hoặc tự biến mất, đổi/dừng nguồn xóa overlay. DISCUSSION/ACTIVITY giữ freeze/vẽ chung của nhóm, không công bố ra MAIN. Không cho quyền share thay quyền vẽ; server kiểm role/scope/source, thu quyền host cũ; chưa chốt thời gian/fade nét tạm.

- Theo [quy tắc nhóm ngày 02/11](../../docs/product/group-modes.md): host chỉ vào hỗ trợ ACTIVITY; DISCUSSION hỏi/trả lời qua chat riêng khi host ở MAIN. Nhóm DISCUSSION tạo hợp lệ chưa ai vào vẫn chờ; còn người thì roster hợp lệ được chủ động vào lại; người cuối cùng chủ động rời nhóm đã có người thì tự đóng, thu chat/board/media và bỏ nút vào lại cho cả roster. Mất mạng không coi ngay là chủ động rời; không áp tự đóng theo số người cho ACTIVITY.

- Sau kickoff 02/11: DISCUSSION tạo ngay khi server kiểm hợp lệ, không host approve/reject/cancel-pending nghiệp vụ; roster chưa là membership. ACTIVITY random preview cân số lượng, chỉnh trước start, không xáo khi chạy. RECORD-01 theo [recording](../../docs/product/recording.md): host ghi màn hình/camera/âm thanh MAIN, không ghi nhóm riêng; video chỉ cho thành viên còn quyền kênh. Demo vài phút chưa là giới hạn sản phẩm; pipeline/quota/retention/schema còn chờ proposal/PoC, không tự chọn hoặc gọi là đã triển khai.
