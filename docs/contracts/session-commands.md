# Contract ID và lệnh phiên họp — SCRUM-22

M4 sở hữu contract. M3 review trước khi frontend, backend và media dùng chung. Nguồn nghiệp vụ là [Live session](../product/live-session.md), [chế độ nhóm](../product/group-modes.md) và [proposal M4, mục 6.3](../proposals/m4-session-groups.md#63-api-socket-và-contract-dự-kiến).

Schema Zod và kiểu TypeScript nằm trong [session.ts](../../packages/contracts/src/session.ts), được export qua `@colearnia/contracts`. `sessionCommandEnvelopeSchema` nhận danh sách field của payload để tạo một schema strict riêng cho từng lệnh. Cả envelope và payload đều từ chối field ngoài schema.

## ID và khung lệnh

| Field                                                         | Kiểu                         | Ý nghĩa                                                                                                      |
| ------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `sessionId`, `participantId` và các ID tham chiếu participant | ObjectId, chuỗi hex 24 ký tự | ID của phiên và participant. `targetParticipantId` và `hostParticipantId` dùng cùng kiểu với `participantId` |
| `epoch`, `groupId`, `roundId`                                 | UUID                         | Đời runtime của phiên, nhóm và lượt hoạt động                                                                |
| `requestId`                                                   | UUID                         | Đối chiếu lệnh với ack. Quy tắc retry theo từng lệnh                                                         |
| `callGeneration`                                              | Số nguyên dương              | Đời kết nối đang giữ quyền tham gia                                                                          |
| `expectedPolicyRevision`                                      | Số nguyên từ 0               | Phiên bản trạng thái mà client dựa vào khi gửi lệnh                                                          |
| `payload`                                                     | Object strict theo từng lệnh | Chỉ chứa dữ liệu client được phép chọn                                                                       |

`SessionScopeRef` có hai dạng `{ type: 'MAIN' }` hoặc `{ type: 'GROUP', groupId }`. Server xác định nhóm là DISCUSSION hay ACTIVITY từ trạng thái hiện hành. Kiểu ID chỉ xác nhận định dạng. Server lấy actor từ kết nối đã xác thực và kiểm lại quyền, epoch, generation, revision và quan hệ giữa các ID trước khi thay đổi trạng thái.

## Hai ví dụ schema

| Lệnh            | `payload`                 | `data.result` khi hoàn tất                                             | Điều kiện do server kiểm                                                                                                                           |
| --------------- | ------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host.transfer` | `{ targetParticipantId }` | `{ hostParticipantId, policyRevision }`                                | Actor là host hiện hành. Người nhận đang kết nối và còn quyền trong cùng phiên                                                                     |
| `group.join`    | `{ groupId }`             | `{ scope: { type: 'GROUP', groupId }, audienceEpoch, policyRevision }` | Dành cho thành viên. DISCUSSION còn mở, đúng giai đoạn và đúng roster. ACTIVITY còn hạn và đúng nhóm đã phân. Host hỗ trợ ACTIVITY qua luồng riêng |

Ví dụ gửi `host.transfer` trong phòng chung:

```json
{
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001",
  "sessionId": "507f1f77bcf86cd799439011",
  "epoch": "1c3b90f0-0c26-4e98-9a60-000000000002",
  "callGeneration": 1,
  "expectedPolicyRevision": 0,
  "payload": { "targetParticipantId": "507f1f77bcf86cd799439012" }
}
```

Ack sau khi chuyển quyền thành công:

```json
{
  "data": {
    "status": "completed",
    "result": { "hostParticipantId": "507f1f77bcf86cd799439012", "policyRevision": 1 }
  },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

Khi thành viên gửi đúng payload `host.transfer` nhưng thiếu quyền, server trả:

```json
{
  "error": { "code": "FORBIDDEN", "message": "Bạn không có quyền chuyển host." },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

Khi host còn quyền nhưng gửi lệnh dựa trên revision cũ, server trả:

```json
{
  "error": { "code": "CONFLICT", "message": "Trạng thái phiên đã thay đổi." },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

Gửi UUID vào `targetParticipantId`, ObjectId vào `groupId` hoặc tự gửi `actorId`/`role` đều bị schema từ chối. Input sai dạng dùng `VALIDATION_ERROR`. Lệnh đúng dạng nhưng actor thiếu quyền dùng `FORBIDDEN`. Revision cũ dùng `CONFLICT` và client đồng bộ lại trước khi người dùng quyết định thao tác tiếp. Ack dùng envelope lỗi chung. Nếu request ID đầu vào sai, adapter phải cấp ID hợp lệ cho phản hồi lỗi theo [quy ước API](api-conventions.md#5-requestid-retry-và-revision).

`group.join` có thêm ví dụ input và ack trong [proposal M4](../proposals/m4-session-groups.md#634-ví-dụ-gọi-và-kết-quả). Ack ở đây bao phủ nhánh `completed` và lỗi. Mỗi lần gọi chỉ nhận một ack. Nếu handler cần báo `accepted` hoặc `pending` để cleanup tiếp, task triển khai phải bổ sung schema và cơ chế theo dõi trước khi phát trạng thái đó. Contract xác thực, context và cleanup thuộc SCRUM-23; snapshot/resync có task riêng.
