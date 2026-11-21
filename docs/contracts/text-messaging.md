# Gửi tin, lịch sử và subscribe kênh TEXT (SCRUM-40)

Phạm vi triển khai đợt PR #117 là history-only. `main.ts` chỉ bật budget history; REST POST và socket send giữ tắt kể cả khi biến cấu hình còn text budget. Thiết kế gửi/retry bên dưới tiếp tục là phần cần nghiệm thu của SCRUM-42. History đọc ACL bằng snapshot session trên pool chung, dưới gate User/Workspace hiện hành, không tạo transaction ghi hoặc chờ commit ACL.

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

## Triển khai SCRUM-43 và điều kiện bật

Backend đã có adapter `conversation.subscribe/unsubscribe`, snapshot/catch-up cho **tin gốc kênh TEXT** và fanout có kiểm quyền. [Service](../../apps/server/src/messaging/text-service.ts) dùng cùng Database/pool, admission và User/Workspace coordinator với history. H được đọc majority và registry được cài trong cùng đoạn giữ gate; writer dùng chung gate không thể commit vào khoảng giữa hai bước. Catch-up đọc majority theo `commitSeq`, giữ nguyên L/H qua mọi trang. Snapshot giữ cả dữ liệu baseline chưa có sequence; cursor đọc lịch sử cũ từ snapshot tiếp tục giữ giới hạn H.

Checkpoint ký HMAC với miền riêng, gồm incarnation registry, kênh, hội thoại và sequence; không dùng timestamp hoặc ID làm checkpoint. Incarnation này không phải epoch của cuộc gọi LIVE. Token ngẫu nhiên tra trong registry, ràng phiên auth, lease/connection, scope và snapshot membership/incarnation/revision/kênh. Mỗi trang vẫn kiểm ACL thật dưới gate. Lease đóng, hết hạn, registry restart hoặc thay revision thì token cũ không cho hoàn tất lượt. Cursor catch-up ký và ràng đúng subscription; token/cursor không cấp quyền đọc. Format opaque là chi tiết implementation để M1 review, không phải API cho client giải mã.

[Controller client](../../apps/web/src/features/text/text-sync.ts) gắn listener trước subscribe, giữ buffer có giới hạn event/byte, tải hết các trang catch-up, gộp theo ID và chỉ công bố checkpoint H sau khi toàn lượt thành công. Snapshot đầu chỉ mở cửa sổ tin mới nhất; `olderCursor` dùng cho cuộn đọc lịch sử, không buộc tải toàn bộ lịch sử cũ để mở timeline. Event sau H không tiến checkpoint. Đối soát định kỳ chạy lại subscribe/catch-up, kể cả khi socket còn kết nối và chỉ một event bị mất; không suy mất tin từ khoảng trống sequence của timeline/thread. ACCESS_REVOKED và lỗi auth/quyền xóa cache/checkpoint; timeout, overflow, disconnect, token hết hiệu lực hoặc trang sai scope không công bố trạng thái live của lượt đó. Nếu catch-up vượt trần projection/page, lượt đó báo resync và bỏ checkpoint để thử snapshot hữu hạn; không báo hoàn tất khoảng cũ. Consumer phải `stop()` khi đổi danh tính/phạm vi/logout; cache chỉ nằm trong bộ nhớ.

Registry cung cấp `MessagingRevocationPort` với fence đồng bộ và watermark generation, cleanup idempotent chỉ thu resource cũ. **Main chỉ cho subscribe khi chính port này đã được bind cùng adapter LIVE thật vào coordinator thu quyền**, có index sync, cấu hình resource và budget history/subscription. Không bind LIVE giả để mở tính năng. Composition LIVE hiện tại vẫn chờ các port thật theo SCRUM-88; do đó merge code này hoặc chỉ điền env không tự bật sync trên môi trường dùng chung. Phần thêm ở coordinator chỉ kiểm identity adapter đã bind; không đổi FIFO, deny, thứ tự commit/cleanup hay pool.

REST POST và `message.send` tiếp tục bị main vô hiệu hóa theo rollout history-only của PR #117. Hook fanout chỉ được gọi sau kết quả commit xác định; commit chưa rõ hoặc event bị mất cần lượt đối soát, không tự suy rollback hoặc nâng checkpoint. Bản sửa này không đóng P2/recovery của đường gửi.

SCRUM-47 nối controller vào [TextChannel](../../apps/web/src/features/text/TextChannel.tsx) ở luồng đăng nhập `/workspaces/:workspaceId`, dùng [adapter REST/Socket.IO](../../apps/web/src/features/text/text-api.ts). UI nhận dạng từ session, gửi CSRF cho REST POST và handshake, giữ nguyên clientMessageId khi retry. Projection mặc định 500 tin/2 MB, buffer 128 event, tối đa 64 trang/lượt, trang 30 tin, deadline lượt 12 giây và đối soát mỗi 5 giây. Trang 30 tin tách khỏi trần projection để phù hợp budget response của history. Controller cũ giữ hành vi khi không truyền tùy chọn `pageSize`. Thu quyền xóa projection/checkpoint, unmount composer/outbox/draft và reset cache danh sách kênh của Workspace đang mở. Đổi danh tính/kênh hoặc logout dừng controller/socket và hủy request cũ. ACK subscribe đến sau abort phải trả lease lại bằng unsubscribe.

Route `/workspace` vẫn là fixture SCRUM-46. DM, thread/reply-count runtime và chat cuộc họp chưa được bật bởi triển khai này. Bằng chứng SCRUM-47 dùng hai tài khoản đăng ký thật, Mongo/HTTP/Socket.IO và adapter messaging/LIVE thật trong harness dùng database riêng. Quyết định bật main vẫn theo điều kiện composition/rollout ở trên, đường gửi trên main còn history-only. [Bằng chứng SCRUM-47 và điều kiện bàn giao](../test-evidence/2026-11-19-scrum-47-text-chat.md) · [Bàn giao SCRUM-43](../test-evidence/2026-11-18-scrum-43-text-sync.md)

### Projection nhỏ và ngân sách byte của controller

Kích thước trang không vượt `limits.messages` hoặc giới hạn contract. Snapshot chưa vừa budget được đọc lại với limit nhỏ hơn trong cùng lease/H; không lấy cursor từ trang đã bị bỏ. Nếu một tin tối thiểu vẫn vượt trần, controller trả `blocked` cùng `PROJECTION_CAPACITY`, hủy lease và dừng tự resync; cần cấu hình/controller mới. Byte budget không mã hóa được `[]` bị từ chối trước I/O. Đây là trạng thái chưa đồng bộ, không có checkpoint hoàn tất. Consumer SCRUM-47 cần hiển thị lỗi cấu hình/tài nguyên này; không tự tăng trần để giấu lỗi. Xem regression P2 trong evidence SCRUM-43.
