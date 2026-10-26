# Server

- Đọc [kiến trúc](../../docs/architecture.md), [quyền nhóm](../../docs/product/groups-media-policy.md), [model](../../docs/database/model.md) và [lifecycle](../../docs/database/lifecycle.md) theo task.
- REST/socket validate/auth rồi gọi cùng application service; không tạo hai bản policy hoặc tin actorId/groupId/source từ client.
- Kiểm quyền trước create/resume Consumer, đóng tài nguyên khi revoke; project snapshot/event/file theo audience hiện tại.
- Giữ riêng epoch, callGeneration, policyRevision và board version/sequence. Resource async cũ phải được đóng khi quyền/state đã đổi.
- Không chờ browser picker/upload/client ack trong mutation queue hoặc transaction DB; close phải idempotent và cleanup compare generation.
- Không persist mediasoup objects. Tái khởi động kết thúc runtime cũ; không phục hồi grant bằng metadata DB.
- Module policy thuần không phụ thuộc Express/Socket.IO/Mongoose/mediasoup; orchestration/I/O ở service/adapter. Không dựng abstraction rỗng.
- Auth/quyền/file/media cần test từ chối; smoke worker không thay hai mạng/forced TURN. Không sửa readiness thành xanh giả.
