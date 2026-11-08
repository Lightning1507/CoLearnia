# Snapshot và sự kiện theo người nhận — SCRUM-66

Schema công khai ở [session-projection.ts](../../packages/contracts/src/session-projection.ts), bộ ghép snapshot/kiểm thứ tự ở [session-snapshot.ts](../../packages/contracts/src/session-snapshot.ts). M4 cung cấp, M3 review chính; controller M3, state FE M4 và các consumer dùng cùng contract. Quyền nội dung vẫn do [policy SCRUM-65](session-policy.md) và [context SCRUM-23](session-context.md) kiểm ở server.

## 1. Dữ liệu công khai

`SessionProjection` giữ đúng đầu ra `projectSessionFor`: metadata phiên, viewer, participant cùng phạm vi, metadata nhóm mở và các quyền hiện hành. Schema chọn rõ từng field, không có auth/access stamp, roster, chat, producer, frame hoặc nét vẽ. Đầu ra policy MAIN/DISCUSSION/ACTIVITY có test đối chiếu schema này. Không dùng việc parse schema thay ACL.

Mọi header snapshot/event gồm:

| Field                             | Ý nghĩa                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sessionId`, `epoch`              | Định danh và đời runtime phiên                                                                         |
| `participantId`, `callGeneration` | Đúng người nhận và đời ownership cuộc gọi                                                              |
| `audienceEpoch`, `scope`          | Đời quyền nhận và phạm vi MAIN/GROUP; header chỉ chứa scope ref                                        |
| `projectionSequence`              | Sequence liên tục riêng participant/callGeneration; snapshot giữ mốc hiện tại, event được gửi tăng một |
| `policyRevision`                  | Phiên bản quyền toàn phiên; được nhảy khi thay đổi ở audience khác, không dùng để phát hiện mất event  |

Header phải khớp metadata của `projection`, kể cả viewer. Scope chi tiết trong projection có mode và, với ACTIVITY, roundId/deadline; header chỉ giữ `{ type: 'MAIN' }` hoặc `{ type: 'GROUP', groupId }` theo SCRUM-22.

## 2. Resync, snapshot và event

`sessionResyncInputSchema` nhận `{ requestId, sessionId, epoch, callGeneration, payload: { lastProjectionSequence?, lastPolicyRevision? } }`. Không bắt khớp `expectedPolicyRevision` cũ để được lấy lại state. Các mốc client gửi chỉ là thông tin đối soát; server không dùng chúng làm sequence/quyền đã xác nhận.

`sessionSnapshotSchema` mô tả snapshot logic hoàn chỉnh. Ví dụ tối thiểu về header:

```json
{
  "event": "session.snapshot",
  "requestId": "10000000-0000-4000-8000-000000000002",
  "snapshotId": "10000000-0000-4000-8000-000000000003",
  "sessionId": "111111111111111111111111",
  "epoch": "10000000-0000-4000-8000-000000000001",
  "participantId": "222222222222222222222222",
  "callGeneration": 1,
  "audienceEpoch": 0,
  "scope": { "type": "MAIN" },
  "projectionSequence": 7,
  "policyRevision": 19
}
```

Snapshot logic thêm `projection`. Khi truyền, server luôn dùng `sessionSnapshotPartSchema`: cùng header, thêm `partIndex`, `partCount`, `fragment`; không gửi field `projection` trong từng phần. `partIndex` bắt đầu từ 0. `fragment` là đoạn liên tiếp của **một chuỗi `JSON.stringify(projection)`**, không phải một projection độc lập hoặc base64. Ghép theo index rồi parse đúng một lần sau khi đủ phần. Ngay cả snapshot nhỏ cũng dùng một phần; không có hai kiểu packet để consumer tự đoán.

Event `session.changed`, `host.changed`, `group.changed`, `activity.changed`, `participant.scopeChanged` dùng `sessionProjectionEventSchema`: header và toàn bộ projection công khai đã lọc của người nhận, thay projection cũ khi đủ điều kiện. Đây là metadata replacement, không là JSON Patch hoặc bản sao sự kiện chat/media/board. `session.ended` dùng `sessionEndedEventSchema`, chỉ có header, không mang projection private cũ; coordinator kết thúc phiên sẽ cấp sequence và phát notice sau cleanup theo task kết thúc phiên.

## 3. Chuẩn bị tại server

Các hàm thuần ở [server projection](../../apps/server/src/live/projection/session-projection.ts):

| Hàm                                                                | Đầu vào / kết quả                                                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `createSessionProjectionCursor(input)`                             | Input policy đã xác minh; trả cursor ở sequence 0. Chỉ khởi tạo một lần khi registry commit ownership mới, không gọi lại mỗi resync |
| `prepareSessionSnapshot(input, cursor, { requestId, snapshotId })` | Gọi policy một lần, serialize projection một lần; trả toàn bộ `parts` cùng một mốc và `nextCursor` không tăng sequence              |
| `prepareSessionProjectionEvent(input, cursor, eventName)`          | Gọi policy, dựng event ở sequence S+1 và trả `nextCursor`; giữ sequence liên tục khi audience thay đổi                              |

Cursor thuộc runtime registry của từng participant/callGeneration, không lấy từ client và không dùng chung cho nhiều người. Snapshot ID do server tạo, requestId lấy từ lần join/resync đang xử lý. Các hàm không mutate input/cursor, không tự enqueue, phát socket hoặc lưu runtime.

Coordinator giữ thứ tự gate của SCRUM-23, đối chiếu cursor hiện hành, lấy input M1/runtime nhất quán rồi chuẩn bị packet. Chỉ commit `nextCursor` khi enqueue thành công vào đúng kết nối dưới cùng gate; retry thất bại giữ cursor cũ. Hai tác vụ chuẩn bị từ cùng cursor không được cùng commit. Enqueue snapshot cần nhận trọn bộ vào hàng đợi hữu hạn, không nhận một phần rồi báo thành công. Sau `await` hoặc trước gửi từng phần, kiểm lại ownership/audience/quyền; quyền đổi thì hủy bộ cũ, chặn các packet còn chờ và yêu cầu snapshot mới. Việc tạo được packet chưa chứng minh đã gửi tới client.

`CONFLICT` dùng khi cursor khác ownership, audience/revision lùi hoặc scope đổi mà audience không tăng. Từ chối auth/quyền giữ mã của policy. `PAYLOAD_TOO_LARGE` dùng khi metadata vượt budget; adapter dùng lỗi chuẩn [catalog](error-codes.md), không phát packet quá cỡ hoặc gửi một phần projection bị cắt. Event quá lớn cần đánh dấu người nhận phải resync bằng snapshot chia phần; registry/transport sẽ tích hợp đường xử lý này, không âm thầm bỏ event và coi state đã đồng bộ.

## 4. Ghép và áp dụng tại consumer

`assembleSessionSnapshot(parts, { requestId, cursor })` kiểm toàn bộ phần, đủ index, không trùng, cùng snapshot/header, đúng request đang chờ và không lùi các mốc đã biết. Trả `{ ok: true, snapshot }` khi projection cuối cùng cũng hợp schema; còn lại trả mã lỗi, không trả state đã ghép dở. Chấp nhận phần đến đảo thứ tự. Caller phải nâng mốc audience tối thiểu ngay khi quan sát được audience mới, không chờ đủ snapshot mới loại context cũ.

`classifySessionProjectionEvent(event, currentCursor)` dùng **sau khi parse strict schema**:

| Kết quả  | Hành vi consumer                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `APPLY`  | Đúng ownership/audience/scope, sequence đúng S+1, policyRevision không lùi: thay projection và cập nhật cursor                  |
| `IGNORE` | Sai ownership hoặc event cũ/trùng: không đổi ownership/cursor bằng event này                                                    |
| `RESYNC` | Thiếu sequence, audience mới hơn hoặc scope/revision mâu thuẫn: dừng thao tác private, bỏ state/buffer cũ, yêu cầu snapshot mới |

Sau snapshot tại sequence S, loại event ≤ S rồi chỉ áp các event liên tục từ S+1, đúng context. Đổi audience A → MAIN → A vẫn tăng audienceEpoch, không đặt lại sequence. Hai lần resync trả ngược thứ tự được phân biệt bằng requestId. Khi scope/ownership đổi, client dọn cache chat/board/frame và pending callback theo proposal; helper không tự điều khiển UI hoặc các miền khác.

Theo `sessionControlBudget`: event và mỗi phần ≤16 KiB JSON UTF-8 **tính cả envelope và escape**, tối đa 64 phần/1 MiB mỗi bộ. Server chia theo byte đã serialize, giữ cặp surrogate của Unicode. Helper ghép kiểm lại cap phần/tổng byte. Caller giữ deadline lắp 5 giây, buffer tối đa 64 event/256 KiB/5 giây; thiếu phần, hết hạn hoặc overflow thì bỏ bộ/buffer và resync có backoff. Không đặt lại deadline theo từng phần đến, không giữ nhiều bộ snapshot cũ vô hạn. Timeout/buffer runtime được nối ở task FE/registry, chưa có trong helper thuần.

## 5. Kiểm chứng và tích hợp tiếp

Test chạy trực tiếp schema, policy, bộ tạo packet và bộ ghép: context/header không khớp; roster/private bị loại; sequence riêng từng người; policyRevision nhảy; audience đổi; snapshot đến đảo thứ tự, thiếu/trùng/trộn bộ; resync cũ; Unicode/escape và vượt budget.

Chưa có handler Socket.IO, cursor registry, lịch enqueue, timer lắp/buffer FE hoặc cuộc gọi thật từ task này. SCRUM-82 giữ cursor ownership/luồng join, SCRUM-84 nối reconnect/resync, SCRUM-85 nối state/cache FE; coordinator SCRUM-72 xác minh quyền và gate khi tích hợp. Controller M3 dùng schema này để đối soát public metadata; schema nguồn media và sequence của M2/M3/M5 vẫn thuộc từng miền.
