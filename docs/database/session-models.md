# Metadata phiên họp và repository — SCRUM-79

[Model](../../apps/server/src/live/session-manager/session-models.ts) đăng ký `LiveSession` và `SessionParticipant` trên connection dùng chung. [Repository](../../apps/server/src/live/session-manager/session-repository.ts) nhận `Database` từ SCRUM-15 và chỉ ghi metadata qua transaction của connection đó.

## Dữ liệu và index

`liveSessions` lưu Workspace/kênh, epoch, hostUserId, status, revision, startedAt/endedAt và timestamps. `sessionParticipants` lưu session/user, joinedAt/leftAt, lastScope/lastScopeAt và timestamps. Scope metadata là `{ kind: 'MAIN' }`, `{ kind: 'GROUP', groupId }` hoặc null. Scope và thời điểm phải cùng có giá trị hoặc cùng null.

ENDED yêu cầu endedAt và hostUserId null. ACTIVE/ENDING có endedAt null. UUID kiểm riêng với ObjectId; revision là số nguyên an toàn từ 0. Native validator chặn field runtime ngoài schema, scope sai shape và counter sai kiểu/miền cả khi raw update. Bất biến reference/epoch được khai báo trên Mongoose, còn service phải whitelist mutation và giữ đúng policy.

| Collection            | Index                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `liveSessions`        | Unique `uq_live_open_channel` trên channelId, partial filter `status: { $in: ['ACTIVE', 'ENDING'] }` |
| `liveSessions`        | `ix_live_reconcile` trên status/_id                                                                  |
| `sessionParticipants` | Unique `uq_participant_pair` trên sessionId/userId                                                   |
| `sessionParticipants` | `ix_participant_user` trên userId/sessionId                                                          |

Các phiên ENDED cùng kênh được giữ làm metadata lịch sử. Participant dùng lại một document theo session/user khi vào lại; ID ứng viên mới không thay ID đã tồn tại.

## API repository nội bộ

Tất cả ID document là `Types.ObjectId`, epoch/groupId là UUID và thời gian là `Date` do server cấp. Input được kiểm strict trước khi chạy DB. Caller chuẩn bị ID/thời gian trước transaction và giữ gate theo thứ tự hiện hành, kiểm auth/access/runtime policy trước khi gọi repository.

| Hàm              | Input chính                                                             | Kết quả và điều kiện                                                                                  |
| ---------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `create`         | sessionId, participantId, workspaceId, channelId, epoch, hostUserId, at | Tạo ACTIVE revision 0 cùng host participation tại MAIN trong một transaction                          |
| `join`           | sessionId, epoch, expectedRevision, userId, participantId, at           | Chỉ ACTIVE, upsert participation, trả participantId thực tế và revision mới                           |
| `setScope`       | sessionId, epoch, expectedRevision, userId, scope, at                   | Chỉ ACTIVE và participation chưa rời, cập nhật metadata scope/thời điểm                               |
| `leave`          | sessionId, epoch, expectedRevision, userId, at                          | ACTIVE/ENDING, ghi leftAt của participation hiện hành                                                 |
| `changeHost`     | sessionId, epoch, expectedRevision, hostUserId hoặc null, at            | Chỉ ACTIVE; host khác null phải có participation chưa rời                                             |
| `beginEnding`    | sessionId, epoch, expectedRevision, at                                  | CAS ACTIVE → ENDING                                                                                   |
| `completeEnding` | sessionId, epoch, expectedRevision, at                                  | CAS ENDING → ENDED, xóa metadata host và ghi leftAt cho participation chưa rời trong cùng transaction |
| `readVersion`    | sessionId, epoch                                                        | Point read metadata ở primary với readConcern majority, phục vụ đối chiếu                             |

Mọi mutation sau create dùng CAS theo ID/epoch/status/revision và tăng revision một lần khi transaction thành công. Nếu participant mutation không tìm thấy đích hợp lệ, toàn transaction abort và revision được rollback. Revision metadata DB được dùng chung để sắp thứ tự các mutation phiên/participant trong repository; runtime policyRevision và callGeneration giữ phạm vi riêng.

CAS stale, sai đời phiên hoặc trạng thái không phù hợp trả `SessionMetadataConflictError` có code CONFLICT. Vi phạm unique vẫn là lỗi duplicate-key nội bộ để application service đối chiếu rồi ánh xạ lỗi API chung. Repository không tự chọn host, tạo Router/ticket, cấp quyền nhóm hoặc gửi event. Caller chỉ công bố kết quả sau commit đã xác nhận, kiểm lại quyền/deadline hiện tại theo SCRUM-72/82.

## Kết quả commit chưa rõ

Nền transaction SCRUM-15 retry commit một lần khi có nhãn `UnknownTransactionCommitResult`. Nếu vẫn chưa rõ, repository truyền tiếp lỗi gốc, giữ nhãn để caller chuyển sang read-back/reconcile. Lỗi này không kích hoạt chạy lại callback tạo phiên hoặc phát side effect.

Caller dùng ID/epoch đã chuẩn bị để đọc lại metadata bằng `readVersion`. Revision/trạng thái hiện tại giúp đối chiếu với intent đã lưu trong runtime. Nếu revision đã tiến xa hơn, không thể suy riêng thao tác nào đã được xác nhận chỉ từ số revision. Kết quả null là chưa thấy metadata trong lần đọc đó; khi chưa đủ căn cứ, giữ trạng thái chưa rõ và reconcile theo SCRUM-87. Bản đầu chưa thêm receipt/outbox bền cho mỗi thao tác.

## Provision và tích hợp

`sessionIndexRequirements` dùng với `preflightIndexes`; `sessionCollectionValidators` dùng cho migration/test được review. Factory đăng ký model, không tự provision hoặc sửa DB ứng dụng. Connection chung tắt autoCreate/autoIndex. Trước khi consumer dùng persistence trên DB có dữ liệu, cần kiểm dữ liệu/index/validator theo [kế hoạch integrity](integrity-and-migrations.md), áp manifest và đọc lại options.

SCRUM-82 nối registry/join ticket với repository. SCRUM-80 xử lý bootstrap/query có ACL. SCRUM-86/87/91 phối hợp end/reconcile/worker lifecycle. Metadata lastScope/host/status không cấp lại grant runtime sau reconnect hoặc restart.

## Kiểm chứng

[Unit test](../../apps/server/src/live/session-manager/session-models.test.ts) kiểm schema, defaults, runtime field bị từ chối, cặp scope/thời điểm và input repository. [Integration test](../../apps/server/test/session-repository.integration.ts) chạy unique/partial index, participation ổn định, CAS đồng thời, commit/rollback và validator MongoDB.

Hai ca unknown commit được inject tại biên driver. Một ca thực hiện commit DB thật rồi mất xác nhận ở cả lần đầu và retry; ca còn lại không gọi commit và được abort khi kết thúc session. Cả hai xác nhận repository giữ lỗi và dữ liệu đọc lại đúng với ca đã inject. Chưa mô phỏng failover hoặc mất mạng giữa client và MongoDB.

Lệnh kiểm DB riêng là `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/session-repository.integration.ts`. Replica set test dùng rs0 trên localhost, đổi cổng qua `COLEARNIA_DB_TEST_PORT`. Kết quả local chạy trên MongoDB 8.2.6 tạm, loopback cổng 27179; bản 8.0.16 theo baseline cần được kiểm riêng.
