# Gửi tin, lịch sử và subscribe kênh TEXT (SCRUM-40)

Contract dùng chung cho Web và API, ưu tiên tin văn bản trong kênh TEXT. Timeline và thread một cấp có cùng quy tắc quyền nhưng tải lịch sử riêng. DM, chat cuộc họp, đính kèm, avatar và recording có contract riêng. M2 cung cấp schema cho SCRUM-41/42/43/46 và M1 review cùng consumer trước khi tích hợp. Phạm vi truy vết CHAT-01 và phần văn bản của FR-13-01/02. [Nghiệp vụ](../product/messaging.md) · [FR](../product/functional-requirements.md) · [Schema](../../packages/contracts/src/text-messaging.ts)

| Transport                                                         | Dữ liệu vào                                                                    | Kết quả                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/channels/:channelId/messages`                       | Params `channelId`, body `clientMessageId, text, rootMessageId?`               | HTTP 201 với `outcome: created` hoặc 200 với `outcome: existing`. Cả hai trả `message`.                  |
| Socket `message.send`                                             | `{ requestId, payload: { channelId, clientMessageId, text, rootMessageId? } }` | Ack cùng DTO với REST.                                                                                   |
| `GET /api/v1/channels/:channelId/messages`                        | Params `channelId`, query theo chế độ bên dưới                                 | Trang tin gốc với `scope.rootMessageId: null`.                                                           |
| `GET /api/v1/channels/:channelId/messages/:rootMessageId/replies` | Params `channelId, rootMessageId`, query theo chế độ bên dưới                  | Trang reply của đúng root.                                                                               |
| Socket `conversation.subscribe`                                   | `{ requestId, payload: { channelId, rootMessageId, afterCheckpoint? } }`       | Ack trả `scope, subscriptionId, syncToken, throughCheckpoint`.                                           |
| Socket `conversation.unsubscribe`                                 | `{ requestId, payload: { subscriptionId } }`                                   | Ack `data: null`. Đóng lặp trên cùng kết nối an toàn.                                                    |
| Socket `message.created`                                          | Server phát `{ subscriptionId, message }`                                      | Gộp theo ID và chỉ áp dụng cho subscription/phạm vi đang mở.                                             |
| Socket `conversation.invalidated`                                 | Server phát `{ subscriptionId, reason }`                                       | `ACCESS_REVOKED` thu quyền và xóa cache liên quan. `RESYNC_REQUIRED` yêu cầu lượt mới nếu vẫn còn quyền. |

Body gửi tin văn bản giữ nguyên khoảng trắng quanh nội dung, từ chối chuỗi chỉ có khoảng trắng hoặc chứa surrogate đứng một mình, và giới hạn 4.000 Unicode code point. Bỏ `rootMessageId` khi gửi tin gốc. Server gán `senderId` từ session. Body gửi chuẩn hóa UUID `clientMessageId` về chữ thường trước khi tra khóa retry và lưu. Gửi lại cùng `clientMessageId` trong cùng hội thoại và người gửi, với cùng text và root, trả tin cũ sau khi kiểm quyền hiện tại. Cùng khóa nhưng khác text hoặc root trả `CONFLICT`. Khi ACK mất hoặc commit chưa rõ, giữ nguyên khóa và payload khi thử lại. `requestId` dùng để tra lần gọi. [Quy ước API](api-conventions.md)

Ví dụ body gửi tin gốc.

```json
{
  "clientMessageId": "10000000-0000-4000-8000-000000000002",
  "text": "Chào nhóm 👋"
}
```

## Lịch sử, dữ liệu cũ và tải bù

Trang trả `{ mode, scope, items, nextCursor }`. `nextCursor: null` đánh dấu hết trang. `limit` mặc định 30, nhận số nguyên từ 1 đến 50. Cursor, checkpoint và sync token là chuỗi opaque tối đa 2.048 ký tự URL-safe. Client lưu và gửi lại nguyên giá trị. Server xác minh tính hợp lệ và ràng chúng với scope, hướng đọc và lượt tương ứng. Cách ký hoặc lưu token thuộc triển khai SCRUM-43.

- **`history`** là mặc định. Đọc từ mới tới cũ theo `(createdAt, id)` với `cursor` tùy chọn. Timeline lọc tin gốc, thread lọc theo root. DTO có thể thiếu `commitSeq` khi đọc dữ liệu cũ. Server dựng DTO từ dữ liệu đã lưu, lấy số reply hợp lệ cho tin gốc và bỏ `replyCount` ở reply.
- **`snapshot`** dùng ở lần mở đầu hoặc khi cần tạo lại baseline. Query có `syncToken` và `throughCheckpoint` từ ACK, trả trang mới nhất tới mốc cố định `H` cùng `throughCheckpoint`. Trang cũ hơn dùng `nextCursor` của snapshot với chế độ `history`. Server giữ hàng cũ chưa có `commitSeq` trong baseline và lịch sử thông thường. Nếu dữ liệu hoặc epoch không còn tương thích với checkpoint, mở snapshot mới theo quyền hiện hành.
- **`catch-up`** đọc tăng dần theo commit trong khoảng `L < commitSeq <= H`. Gửi `syncToken`, `afterCheckpoint` (`L` đã hoàn tất), `throughCheckpoint` (`H` từ ACK) và `cursor` nếu có. Giữ nguyên `L/H` và token qua từng trang. Mỗi tin trong catch-up có `commitSeq` dương trong miền số nguyên an toàn. Một trang có thể rỗng vì không có tin của scope đó.

Ví dụ query tải bù. Các giá trị dưới đây minh họa hình dạng, token thật do server cấp.

```text
?mode=catch-up&afterCheckpoint=checkpoint.L&throughCheckpoint=checkpoint.H&syncToken=sync.token&limit=30
```

Gắn listener trước subscribe và giữ event trong bộ đệm có giới hạn. Đối chiếu `subscriptionId` khi có ACK, bỏ event của lượt cũ, gộp tin theo ID. Chỉ lưu checkpoint mới sau khi hoàn tất snapshot hoặc tải đủ các trang tới `H`. Event có `commitSeq` cao hơn hoặc khoảng trống do timeline và thread dùng chung bộ đếm không đổi checkpoint. SCRUM-43 nối tín hiệu `RESYNC_REQUIRED` và lượt đối soát định kỳ theo SCRUM-38. Tin vừa tạo và event mới mang `commitSeq`; ACK trả tin đã có có thể mang DTO cũ thiếu trường này. [Bằng chứng SCRUM-38](../test-evidence/2026-11-09-scrum-38-history-sync.md)

## Đồng bộ số reply trên timeline

- Khi một reply mới commit, server phát `thread.reply-count.updated` đến subscription **timeline** còn quyền của kênh. Payload gồm `subscriptionId, channelId, conversationId, rootMessageId, replyCount, revision`. `replyCount` là số tuyệt đối sau commit, và `revision` là `commitSeq` của reply đó. Server lấy số đếm nhất quán với revision từ lần commit. Retry cùng `clientMessageId` trả tin đã có và không tạo mutation số đếm mới. `message.created` của reply vẫn đi theo scope thread.
- Để đối soát, `POST /api/v1/channels/:channelId/thread-reply-counts` nhận `{ rootMessageIds }` gồm 1–50 ID khác nhau và trả `{ channelId, conversationId, counts: [{ rootMessageId, replyCount, revision }] }`. Server kiểm quyền nội dung như đọc timeline và chỉ chấp nhận root thuộc đúng hội thoại. Response thành công có đúng một kết quả cho mỗi ID yêu cầu. Đọc count và revision từ cùng trạng thái đã commit. Revision là commitSeq mới nhất đã làm đổi count của root, hoặc 0 nếu root chỉ có dữ liệu baseline chưa được đánh số. Count baseline vẫn bao gồm reply hợp lệ cũ. Mọi thay đổi count sau baseline phải tiến revision.
- Client kiểm scope, subscription hoặc lượt tải hiện hành và chỉ áp dụng revision lớn hơn revision đang giữ cho từng root. Count từ DTO lịch sử chưa có revision chỉ dùng để khởi tạo khi chưa có count đã đối soát. Client đối soát các root đang hiển thị sau khi tải timeline, sau reconnect/`RESYNC_REQUIRED` và theo lượt đối soát định kỳ của SCRUM-38. Chia nhóm tối đa 50 ID, gộp lượt đang chạy và bỏ response của lượt cũ hoặc sau khi thu quyền. Cơ chế này đọc lại được root cũ nằm trước checkpoint. Event count và lượt đọc count không nâng checkpoint lịch sử.

## Quyền và lỗi

Server lấy actor từ session và tra hội thoại bằng channelId, sau đó kiểm membership và quyền nội dung kênh TEXT mỗi lần gửi, đọc, subscribe và trước fanout. Với PRIVATE cần có grant còn hiệu lực. Root phải là tin gốc cùng hội thoại và còn truy cập được. Khi thu quyền, server dừng history/fanout, thu subscription và hủy lượt đang tải. [Contract quyền M1/M2](messaging-access.md)

- ID, payload hoặc cursor sai định dạng dùng `VALIDATION_ERROR`. Cursor khác kênh, root, chế độ hoặc lượt bị từ chối khi kiểm quan hệ.
- Thiếu session dùng `AUTH_REQUIRED`. Thiếu quyền dùng `FORBIDDEN` hoặc `NOT_FOUND` theo quy tắc che giấu tài nguyên.
- Lượt cũ hết hạn hoặc mất hiệu lực trả `CONFLICT` khi actor vẫn có quyền biết scope. Client mở lượt mới từ checkpoint hoàn tất hoặc snapshot nếu checkpoint cũ hết hiệu lực.

Ví dụ ACK từ chối. Fixture kiểm hình dạng lỗi, dữ liệu cũ và phân trang. Kiểm ACL, xác minh chữ ký token, migration và đường gửi thật thuộc các task tích hợp.

```json
{
  "error": { "code": "FORBIDDEN", "message": "Bạn không có quyền đọc kênh này." },
  "requestId": "10000000-0000-4000-8000-000000000001"
}
```

[Bảng lỗi](error-codes.md) · [Fixture kiểm schema](../../packages/contracts/src/text-messaging.test.ts)
