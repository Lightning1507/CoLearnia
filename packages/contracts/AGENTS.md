# Contracts

- Nguồn: [quy ước contracts](../../docs/contracts/README.md), nghiệp vụ qua [mục lục](../../docs/README.md).
- Zod schema ở biên, types suy từ schema; schema không tự cấp ACL. Payload/ack/event phải có cùng tên và semantics ở hai bên.
- Không import web/server internals, Mongoose hoặc runtime mediasoup. Package chia sẻ không chứa secret/config server hoặc I/O nghiệp vụ.
- Command cần actor/quyền, revision/generation và ví dụ allow/deny/stale rõ theo baseline; không tự coi payload unknown hiện có là contract đầy đủ.
- Thay contract phải được bên gửi/nhận review trước hoặc cùng PR; build contracts để kiểm consumers. Không tự thêm event/collection cho phần ngoài scope.
