# Contract REST bootstrap, ICE và context proof — SCRUM-58

**M3-T1.4 · Bản gửi M4 review.** Dùng ownership và quyền hiện hành của M4, kết quả thu quyền SCRUM-56 và dấu đời transport trong snapshot SCRUM-57. [Sprint 1](../planning/sprint-1.md) · [Cleanup](media-cleanup.md) · [Snapshot media](media-source-sync.md) · [Thiết kế REST và ICE](../proposals/m3-media.md#637-http-context-proof-và-ice-restart-đúng-đời)

## Danh mục API trong task

| API                                                           | Input                                                                                                            | Kết quả thành công                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Socket `media.httpContext.issue`                              | Envelope mutation của SCRUM-22, payload `{}`                                                                     | Ack `completed` với `{ token, expiresAt }` qua socket sở hữu call                                    |
| `GET /api/v1/live-sessions/:sessionId/media/bootstrap`        | Path ObjectId, query `{ epoch, callGeneration }`, header `X-Media-Context`                                       | HTTP 200 với `{ sessionId, epoch, callGeneration, routerRtpCapabilities }` của Router đang hoạt động |
| `POST /api/v1/live-sessions/:sessionId/media/ice-credentials` | Path ObjectId, body `{ requestId, epoch, callGeneration }`, header `X-Media-Context`, cookie và kiểm CSRF/Origin | HTTP 200 với `{ sessionId, epoch, callGeneration, iceServers, expiresAt, serverTime }`               |
| Socket `media.transport.restartIce`                           | Envelope mutation của SCRUM-22, payload `{ transportId, expectedIceGeneration }`                                 | Ack `completed` với `{ transportId, iceGeneration, iceParameters }` dành cho owner                   |

REST dùng envelope `{ data, requestId }` với ID trace do server cấp. `requestId` trong body cấp ICE là khóa intent, giữ nguyên khi retry cùng payload. Socket echo `requestId` của command trong ack. Lỗi dùng envelope chung với mã đã lọc. `callGeneration` là số nguyên dương. Query truyền dạng chuỗi thập phân và được parse chủ đích. `expectedIceGeneration` là số nguyên không âm, tách khỏi `callGeneration` và `expectedPolicyRevision`. [Quy ước API](api-conventions.md)

Bootstrap chỉ trả capabilities phục vụ `Device.load`. GET không tạo Router, participant hoặc transport. Cả hai endpoint đều yêu cầu cookie hợp lệ và proof của ownership hiện hành. Cấp ICE credentials trả STUN/TURN theo cấu hình server và cặp `username`/`credential` ngắn hạn khi dùng TURN. FE dùng kết quả để cấu hình ICE servers. Việc refresh credentials không tự restart ICE hay đổi ownership. Hai response HTTP dùng `Cache-Control: no-store`. Proof, ICE password, TURN credentials và shared secret phải được loại khỏi log. ICE password chỉ đi trong kết quả riêng cho owner, không đi trong snapshot/event chung.

Retry cấp ICE giữ cùng `requestId` và body khi credentials còn hạn và binding còn hiệu lực. Credentials đã hết hạn cần intent mới sau khi kiểm lại ownership. Khi revoke, TURN credentials đã cấp có thể còn hiệu lực tới expiry. Thu quyền media vẫn cần đóng tài nguyên ở app/SFU theo SCRUM-56.

## Proof và quyền giữa hai tab

1. M1 xác thực cookie và kiểm quyền. Server chỉ cấp proof từ socket đang sở hữu call hợp lệ theo M4 sau join/resume. Proof là 32 byte ngẫu nhiên mã hóa base64url không padding. FE giữ ở RAM và gửi trong `X-Media-Context`.
2. Registry lưu SHA-256 digest cùng `userId`, `authSessionId`, `socketId`, `sessionId`, `epoch`, `callGeneration`, `audienceEpoch` và `expiresAt`. Khi xử lý HTTP, so path/query/body với binding rồi kiểm binding với quyền, deny barrier và ownership hiện hành. Kiểm lại trước khi trả dữ liệu, kể cả sau `await`. Socket ID lấy từ binding do server cấp. Schema kiểm hình dạng, còn registry và M1/M4 quyết định quyền.
3. Ví dụ A sở hữu generation `2` và được cấp proof A. B dùng cùng cookie và điền đúng generation `2` nhưng thiếu proof thì nhận `FORBIDDEN`. Proof A không đi kèm auth hợp lệ thì nhận `AUTH_REQUIRED`. Sau khi B takeover hợp lệ lên generation `3`, proof A bị vô hiệu và B phải xin proof qua socket B. FE bỏ response A đến muộn, kể cả request đã được abort.
4. Profile PoC dùng TTL proof 60 giây và một proof hiệu lực cho mỗi ownership. Rotate, leave, disconnect, revoke, resume, takeover hoặc đổi audience vô hiệu proof cũ ngay. Chỉ thử xin lại một lần từ socket còn quyền. Retry cùng intent không hồi proof đã rotate hoặc hết hạn.

## ICE fencing và giới hạn xử lý

- Transport mới có `iceGeneration = 0`. Kiểm ownership, transport, policy và `expectedIceGeneration` trước khi restart. Context hoặc đời ICE đã cũ trả `CONFLICT` khi actor còn quyền biết tài nguyên. Thiếu quyền dùng lỗi theo M1. Không restart transport đã đóng. Sau `await`, kiểm lại các dấu và chỉ công bố parameters khi operation còn hiện hành. Mỗi restart thành công tăng đúng một đời ICE.
- Một restart đang chạy trên mỗi transport. Cùng `requestId` và payload đối soát pending/kết quả còn hiệu lực. ID khác trong lúc pending trả `OPERATION_IN_PROGRESS` theo proposal. Cùng ID khác payload trả `CONFLICT`. I/O đã timeout vẫn chiếm slot tới khi kết thúc hoặc được cô lập.
- FE chỉ áp ack khi còn đúng auth/context, transport, `requestId` đang chờ và đời ICE kế tiếp. Nếu mất ack, thử lại đúng intent trong replay budget. Nếu replay hết hạn hoặc không rõ đời local, resync metadata rồi close/create có kiểm quyền khi cần. `ownTransports` của SCRUM-57 chỉ cung cấp đời ICE và cờ pending.
- Profile control PoC dùng cap payload 16 KiB, queue 4/64/512 và control I/O 2/8/32 theo user/session/process, chờ queue tối đa 2 giây. Áp rate limit hữu hạn cho issue và ICE credentials. Dùng cùng ngân sách replay với coordinator, chỉ phát lại kết quả khi còn đúng binding và chưa hết hạn. TTL/refresh margin và quota cấp TURN, deadline/retry cụ thể của ICE cần chốt ở bước cấu hình và tích hợp. [Budget M3](../proposals/m3-media.md#627-contract-media-và-budget-tích-hợp-theo-28) · [Budget M4](session-context.md#thứ-tự-khóa-và-giới-hạn)

| Điều kiện                                                          | Mã lỗi                                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Path/query/body sai shape                                          | `VALIDATION_ERROR`                                                                                                                                                 |
| Auth thiếu/hết hạn hoặc CSRF/Origin sai ở POST                     | `AUTH_REQUIRED` hoặc `CSRF_INVALID`                                                                                                                                |
| Proof thiếu/sai/hết hạn hoặc binding đã cũ                         | `FORBIDDEN` sau xác thực. ACL che metadata theo M1                                                                                                                 |
| Context/đời ICE cũ còn được biết hoặc intent trùng ID khác payload | `CONFLICT`                                                                                                                                                         |
| Restart khác intent còn chạy                                       | `OPERATION_IN_PROGRESS` theo proposal Socket.IO                                                                                                                    |
| Rate limit hoặc phụ thuộc không sẵn sàng                           | `RATE_LIMITED` hoặc `DEPENDENCY_UNAVAILABLE` theo catalog chung. `SERVER_BUSY` là mã admission đề xuất trong M3/M4, cần đối chiếu với M4 trước khi phát từ handler |

## Kiểm và bàn giao

[Schema và type](../../packages/contracts/src/media-bootstrap.ts) dùng chung cho consumer FE/BE. [Fixture](../../packages/contracts/src/media-bootstrap.test.ts) kiểm schema strict, hai tab cùng cookie, proof không thay auth, binding cũ và ack ICE đến muộn. Các quyết định quyền trong fixture là ví dụ để review. M4 review binding, replay và mã lỗi. M1 đối chiếu auth/CSRF. SCRUM-60 tích hợp transport và signaling. SCRUM-64 tích hợp REST proof/ICE với FE/BE. Việc cấp proof thật, kiểm barrier, race và kết nối qua TURN cần được kiểm ở các task tích hợp.

Phần triển khai cần chốt cách đọc lại kết quả nhạy cảm trong budget. Digest trong registry dùng để xác minh, không thể phục dựng token đã cấp. Profile PoC của M4 cho replay metadata dùng TTL 60 giây, 64 intent/user, 1.024 intent/session, tối đa 2 KiB/intent và 8 MiB/process. Cache này giữ handle/trạng thái/payload hash. Token, TURN credentials và ICE password cần cơ chế đọc lại riêng được review. [Profile replay M4](../proposals/m4-session-groups.md#b3-queue-socket-heartbeat-và-cache--q5)
