# Contracts

Source schema ở `packages/contracts/src`, frontend và backend import qua `@colearnia/contracts`.

Đã có: API error/response, Workspace/channel inputs, session command envelope và system status. Chưa có handler nghiệp vụ tương ứng chỉ vì schema đã được tạo.

Khi thêm command:

1. Zod schema strict cho payload, ack và server event.
2. Liệt kê quyền và revision/generation cần kiểm.
3. Thêm ví dụ thành công, sai quyền và stale state.
4. Đặt tên thống nhất frontend/backend; không tin `actorId`, `groupId` hoặc `source` chỉ vì input hợp schema.
5. Kiểm payload limits và idempotency theo kế hoạch v2.

REST error: `{ error: { code, message }, requestId }`. Không gửi raw database error/stack/credentials tới client.
