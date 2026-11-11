# Kết thúc phiên và host chủ động rời — SCRUM-86

## Phạm vi

`registry.end(binding, input)` dùng cùng registry MAIN, coordinator M1, repository MongoDB và cleanup coordinator SCRUM-72. Host hiện hành chọn kết thúc hoặc chủ động rời đều kết thúc toàn phiên. Mất kết nối không được đổi thành host chủ động rời; reconnect/kế vị host thuộc các task lifecycle tiếp theo.

Adapter `attachSessionEndSocket` nhận sự kiện `session.end`. Chưa mount adapter này hay registry MAIN vào app production; không coi các test bên dưới là cuộc gọi tích hợp đã chạy.

## API socket

Socket phải được M1 xác thực. Actor/authSession/socket lấy ở server. Payload strict:

```json
{
  "requestId": "20000000-0000-4000-8000-000000000001",
  "sessionId": "100000000000000000000001",
  "epoch": "20000000-0000-4000-8000-000000000002",
  "callGeneration": 1,
  "expectedPolicyRevision": 2,
  "action": "END"
}
```

`action` là `END` hoặc `HOST_LEAVE`. Cả hai chỉ cho host hiện hành. Đây không phải API leave của member. `requestId` là intent của lệnh; `expectedPolicyRevision` là revision runtime, không phải revision MongoDB.

Allow trả ack cùng requestId, `data: {status: "completed", result: {sessionId, epoch, state: "ENDED", cleanupPending: false}}`. `cleanupPending` có thể còn true khi quyền và pending intent đã thu nhưng byte/ref/finalize còn được dọn ở adapter. Không chờ encode/video READY để kết thúc cuộc gọi.

Khi đã chấp nhận lệnh nhưng cleanup, DB hoặc deadline chưa xác nhận được, ack là `data: {status: "pending", result: {sessionId, epoch, state: "ENDING", cleanupPending: true}}`. Trạng thái này không khẳng định DB đã rollback. Lệnh vẫn giữ deny và không tự chạy lại khi client retry.

Deny trước acceptance dùng error envelope chung: member `FORBIDDEN`; socket/generation/epoch/revision cũ hoặc reuse request khác `CONFLICT`; thiếu cấu hình cleanup `DEPENDENCY_UNAVAILABLE`; quá admission `SERVER_BUSY`. Không trả lỗi DB thô. Socket không có ack callback không tạo mutation.

## Thứ tự xử lý

1. Chụp deadline monotonic 10 giây trước chờ gate. Trong User → Workspace gate, đọc lại auth/access, continuity và host/revision hiện hành. Kiểm lại deadline ngay trước đổi state; quá hạn thì từ chối, giữ ACTIVE/Router mở, không tạo end record hay ghi DB. Chuyển host đã commit trước thì host cũ không được end. Nếu end được nhận trước thì trạng thái ENDING ngăn mutation yêu cầu context ACTIVE.
2. Đặt ENDING, tăng policyRevision, block các ownership, hủy toàn bộ ticket của đúng room/epoch và đóng native Router ngay. Đăng ký một operation/token ổn định; adapter media phải hủy pending và dọn handle ngoài Router theo contract cleanup.
3. Nhả gate, bắt đầu cleanup media/messaging/board qua coordinator SCRUM-72 đồng thời với CAS ACTIVE → ENDING có guard. Ngoài đích PARTICIPANT cho ownership, gửi đích SCOPE để đóng MAIN và từng nhóm còn được registry giữ. Lỗi/mất ACK ở beginEnding không bỏ qua cleanup; các adapter vẫn nhận yêu cầu thu quyền và hủy pending. Các target dùng chung deadline, admission và budget retry; không nhân timeout theo số participant/scope.
4. Chỉ khi beginEnding được xác nhận và mọi domain cho cả participant lẫn scope xác nhận `permissionRevoked`/`pendingInvalidated`, chạy transaction `completeEnding` để xóa host metadata và ghi `leftAt`. Participant đã sạch nhưng scope chưa đóng vẫn giữ ACK pending. Guard được kiểm trước mỗi lượt transaction và sau các await. Commit đã gửi có thể trả kết quả muộn; deadline không chứng minh rollback.
5. Vào lại Workspace gate, kiểm operation/token/deadline; chuyển runtime ENDED, xóa đúng ownership và gỡ room khỏi channel. Lượt join tiếp theo được tạo session/epoch mới. Callback cũ không được đóng hoặc giải phóng ownership của phiên mới.

Cleanup adapter thiếu không được thay bằng success. Lỗi/timeout sau acceptance giữ ENDING; DB write chưa rõ không được retry mù. Phần đối chiếu và tiếp tục phiên pending thuộc SCRUM-87; cold bootstrap hiện có xử lý metadata khi restart. Không tự restart server để bỏ qua trạng thái chưa rõ.

## Retry và giới hạn

Retry phải giữ nguyên toàn bộ command, authSession và socket. Các lần end đồng thời dùng chung một Promise, không ghi DB hoặc gọi cleanup lần hai. Guard quyền M1 được kiểm lại trước trả replay; replay không phục hồi quyền.

Completed operation giữ replay 60 giây từ lần hoàn tất đầu tiên; retry không kéo dài TTL. Ngoài sweep trước lookup, registry kiểm lại expiresAt sau await authority dưới gate; record vừa hết hạn bị xóa và trả CONFLICT, không replay ACK cũ. Replay phiên cũ vẫn an toàn khi tài khoản đã vào một phiên mới. Registry giữ tối đa 128 end record; record pending chiếm slot tới khi được đối chiếu hoặc shutdown, không bị TTL xóa để mở lại quyền. Đây là giới hạn RAM của operation, không phải giới hạn số người họp. `close()` chỉ dành shutdown và vô hiệu callback cũ; không thay end nghiệp vụ.

## Điểm ghép và kiểm chứng

- M3 cung cấp media cleanup thực tế: đóng Producer/Consumer/transport và invalidation pending; Router close đã được kiểm native. Recording chưa được triển khai; khi có recorder, adapter phải xác nhận ngừng input trước hoàn tất quyền thu, giữ finalize độc lập.
- M2/M5 cung cấp adapter chat/file/board đúng identity/target. Test hiện dùng adapter điều khiển được; chưa chứng minh file stream hay board intent production đã đóng.
- Adapter socket đã có để composition dùng cùng auth M1. Việc mount cùng registry MAIN, phát terminal `session.ended` theo cursor từng người và FE rời room cần nối trong luồng tích hợp; module này không broadcast projection cũ hay tự tạo một sequence cạnh tranh.
- Test registry kiểm end/host leave lặp, chặn member/stale, join cạnh cleanup, đổi host trước acceptance và lỗi adapter/DB. Ca đổi host mô phỏng commit state dưới coordinator thật; chưa là implementation chuyển host.
- Test operation kiểm deadline, begin/complete trả muộn và runtime bị thay/đóng. Test MongoDB/native Router kiểm hai participant rời cùng transaction, session mới không bị replay cũ tác động và mất ACK mô phỏng sau commit thật.

Nguồn: [nghiệp vụ host](../product/live-session.md), [cleanup coordinator](session-transitions.md), [MAIN join](main-join-registry.md), [repository metadata](../database/session-models.md).
