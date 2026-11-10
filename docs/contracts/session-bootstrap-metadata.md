# Bootstrap và query metadata phiên — SCRUM-80

Source: `apps/server/src/live/session-manager/session-bootstrap.ts`, `session-metadata-query.ts`; schema chia sẻ tại `packages/contracts/src/session-metadata.ts`. Dùng [model/repository SCRUM-79](../database/session-models.md), [context M1–M4](session-context.md) và [coordination chung](../runbooks/operation-coordination.md).

## Bootstrap trước readiness

`main.ts` mở HTTP health trước khi kết nối MongoDB/chạy bootstrap. Trong lúc đối soát, liveness trả `200`, readiness trả `503` và chưa tạo media runtime. Readiness chỉ đạt khi bootstrap READY cùng các điều kiện DB/media/auth hiện có. Không tạo Router, participant runtime, ticket, grant, nhóm hoặc board từ metadata cũ.

`createSessionBootstrap(database,{isOffline,prepareStaleSession,...})` có state IDLE/RUNNING/READY/FAILED, `run()`, `isReady()` và `stats()` chỉ chứa state/số phiên đã kết thúc. Run single-flight, một attempt/process; lỗi/timeout không khởi động chồng callback cleanup khác. Worker chết khi server đang chạy dùng SCRUM-91, không gọi cold bootstrap này.

1. DB chưa có cả liveSessions/sessionParticipants thì không có metadata cũ; bootstrap đạt mà không tự tạo collection/index. Nếu chỉ có một collection hoặc manifest index không khớp thì giữ lỗi, không tự migration.
2. Đọc ACTIVE/ENDING theo `_id`, từng lô 25; pageSize cấu hình nội bộ tối đa 100, maxTimeMS 5 giây. Không tải cả lịch sử hoặc mảng participant vào RAM.
3. ACTIVE chuyển ENDING bằng repository CAS. ENDING tiếp tục bước đối soát, không nhận join mới. Kiểm server vẫn offline sau await và trước mutation tiếp theo.
4. Gọi prepareStaleSession với `{sessionId,epoch,workspaceId,channelId}`. Kết quả phải echo đúng session/epoch, permissionRevoked=true và pendingInvalidated=true. cleanupPending=true được phép vì byte/ref có thể dọn sau. Không giữ transaction DB khi chờ adapter.
5. Chỉ sau xác nhận, completeEnding commit ENDED, hostUserId=null và leftAt của participation chưa rời trong một transaction. LastScope lịch sử vẫn là metadata, không phục hồi quyền nhóm/host.

Toàn lượt bootstrap có deadline monotonic mặc định **30 giây**, gồm preflight, đọc từng lô, cleanup và chờ DB. Mỗi callback cleanup vẫn tối đa 10 giây nhưng không vượt thời gian còn lại của lượt. Quá hạn tổng thì chuyển FAILED, báo lỗi cho startup và abort tín hiệu provider; không tự retry hoặc chuyển READY khi I/O đến muộn. Các điểm tiếp tục sau await kiểm deadline/abort trước mutation tiếp theo. DB transaction đã gửi đi có thể vẫn commit: không suy timeout là rollback, restart phải đọc lại state.

Một run xử lý tối đa 10.000 phiên; vượt số lượng hoặc thời gian thì giữ FAILED để đối soát phần còn lại, không báo READY với dữ liệu dở. Healthcheck staging vẫn interval 10 giây/retries 6, thêm start_period 60 giây cho thời gian kết nối/auth preflight, bootstrap 30 giây và khởi động native media. Hết budget không tự mở readiness hoặc tăng timeout theo số phiên; staging cần kiểm log và xử lý backlog/provider trước lần restart sau. Start period chỉ miễn đếm failure khởi động, không biến 503 thành healthy hoặc cho web vượt điều kiện service_healthy.

### Phối hợp M2/M5

Main hiện inject `createColdSessionArtifactGuard`, chỉ đọc để xác minh:

- Không còn conversation SESSION/GROUP/HOST_PRIVATE của session chưa có closedAt là Date đơn.
- FRAME cùng session có state đúng chuỗi DELETE_PENDING hoặc cleanupAfter là Date đơn; mảng chứa Date, field thiếu/sai kiểu chưa được coi là đã xử lý. Guard dùng `$expr`/`$type` để kiểm kiểu chính trường, không dùng predicate `$type` khớp phần tử mảng.

Còn artifact chưa xử lý thì trả chưa xác nhận, phiên giữ ENDING và readiness `503`. M4 không tự update conversation, frame, lịch purge, quota hoặc xóa byte. M2/M5 cung cấp provider cleanup theo cùng signature để thay guard khi tích hợp. Provider phải xử lý idempotent theo sessionId/epoch và nhận AbortSignal; timeout không chứng minh I/O đã dừng. Guard giữ cleanupPending=true vì không chứng minh dọn byte đã hoàn tất. Recording/file finalization thuộc miền phụ trách, không đánh READY video từ bootstrap metadata.

Đây là kiểm cold startup của baseline một process. Trước khi bật runtime/join, composition phải giữ điều kiện isOffline, bootstrap xong và providers đúng miền; không chạy cùng một instance app khác còn giữ các phiên này.

## Query metadata có kiểm quyền

`createSessionMetadataQuery(database,{coordinator,isReady,authorize,now?})` trả hàm:

```ts
query(auth, { workspaceId, channelId }, { limit?, cursor? })
```

Đây là service nội bộ cho M2/M4, chưa mount endpoint hoặc thêm UI lịch sử cuộc họp. Actor lấy từ auth M1 trên server. authorize phải kiểm lại auth, Workspace/channel, membership/private grant và deny barrier dưới context User → Workspace gate được truyền vào; không nhận access stamp của client. isReady phải bao gồm bootstrap/index readiness và trạng thái dừng server.

| Dữ liệu | Nội dung                                                                  |
| ------- | ------------------------------------------------------------------------- |
| Target  | workspaceId/channelId ObjectId hex                                        |
| Limit   | Mặc định 20, số nguyên 1–50, không tự coerce string                       |
| Cursor  | workspaceId/channelId/startedAt/sessionId; chỉ dùng lại trong đúng target |
| Item    | sessionId, epoch, status, startedAt, endedAt                              |
| Page    | `{items,nextCursor}`, nextCursor=null khi hết                             |

Query buộc cả Workspace và kênh, chỉ kênh LIVE với canReadContent=true; canManageChannel/OWNER/ADMIN không bỏ qua PRIVATE. Dùng index `ix_live_channel_metadata = {workspaceId:1,channelId:1,startedAt:-1,_id:-1}`, hint đúng index, primary/majority, maxTimeMS 5 giây. Đọc tối đa limit+1; sort startedAt rồi `_id` giảm dần để cursor ổn định khi trùng timestamp, không dùng ObjectId để suy thời gian nghiệp vụ. Metadata thay đổi giữa hai trang không là snapshot lịch sử toàn kênh.

Sau DB await, authorize lại. Auth hết hạn, quyền bị thu, membership incarnation/revision hoặc channel revision đổi đều không trả dữ liệu vừa đọc. DTO strict không có hostUserId, user/participant roster, lastScope, auth/access stamp hoặc token. Không dùng metadata làm LiveContext hoặc quyền xem nội dung nhóm cũ.

| Điều kiện                                      | Xử lý                                              |
| ---------------------------------------------- | -------------------------------------------------- |
| Input/cursor sai shape                         | Zod ở biên, adapter map VALIDATION_ERROR           |
| Cursor thuộc target khác hoặc stamp đổi        | CONFLICT                                           |
| Auth thiếu/hết hạn                             | AUTH_REQUIRED                                      |
| Thiếu quyền đọc hoặc sai loại kênh             | FORBIDDEN; M1 có thể trả NOT_FOUND để che đích     |
| Bootstrap/index chưa sẵn sàng, lỗi DB/provider | DEPENDENCY_UNAVAILABLE, không trả query/stack/data |

## Index và vận hành

Manifest session có thêm ix_live_channel_metadata, không thêm collection hoặc TTL. Không auto provision: DB có hai collection metadata phải có đủ index qua migration được review trước khi chạy bản mới. Thiếu index giữ `503`, không syncIndexes/drop dữ liệu để ép khớp. Test chỉ provision DB cô lập.

Với DB đã provision đủ SCRUM-79, bước bổ sung index này sau review là:

```js
db.liveSessions.createIndex(
  { workspaceId: 1, channelId: 1, startedAt: -1, _id: -1 },
  { name: 'ix_live_channel_metadata' },
);
```

Đối chiếu options/index hiện có và preflight trước khi áp dụng; lệnh này không thay validator hoặc tạo đủ schema cho DB mới. Không tự chạy từ startup.

Chẩn đoán readiness: kiểm kết nối/replica set → manifest session index → ACTIVE/ENDING chưa đối soát → provider M2/M5 cho conversation/frame. Sau khi xử lý đúng miền, restart để chạy lại cold bootstrap. Giữ các phiên đã ENDED khi rollback code, không phục hồi grant/host/nhóm từ backup metadata chỉ để làm readiness xanh.

## Kiểm chứng

[Integration test](../../apps/server/test/session-bootstrap-query.integration.ts) dùng MongoDB replica set riêng: xử lý ACTIVE/ENDING, single-flight/idempotency, readiness HTTP, lỗi index/offline/cleanup/unknown commit, artifact liên miền, pagination và ACL trước/sau await. M1 authority là fixture; DB/CAS/query/index/transaction thật. [Bằng chứng startup](../test-evidence/2026-11-10-scrum-80-bootstrap.md) kiểm entrypoint main thật và native media trên port/DB test riêng.

Contract test: `pnpm exec vitest run packages/contracts/src/session-metadata.test.ts`. DB test: `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/session-bootstrap-query.integration.ts`. Các kiểm tra này không chứng minh ACL M1 production, recording/file cleanup đầy đủ hoặc browser/TURN.

Test timeout tách hai lịch sử có điều khiển: cleanup bị giữ tới sau deadline thì không được gọi completeEnding và phiên giữ ENDING; transaction completeEnding đã thực hiện ghi trước deadline nhưng bị giữ tại commit thì có thể commit sau deadline, song bootstrap vẫn FAILED/readiness 503. Ca nhiều phiên chỉ kiểm budget/readiness, không đòi tổng số ENDED đứng yên khi còn transaction đã gửi. Test commit muộn dùng MongoDB thật, chỉ trì hoãn lời gọi commit ở biên driver, không mô phỏng failover mạng.

Bootstrap truyền guard `offline` vào `completeEnding(input, assertCurrent?)`. Repository kiểm guard trước transaction, mỗi lượt callback retry, sau CAS LiveSession và sau updateMany participant trước khi trả callback cho commit. Nếu CAS đầu trả sau deadline thì không gửi lệnh ghi participant; callback ném lỗi, transaction abort, cả revision/status đầu được rollback. Ca regression giữ response của CAS sau khi ghi thật trong transaction, chờ hết deadline rồi thả, kiểm updateMany chưa từng gọi và DB vẫn ENDING/participant chưa leftAt. Guard không hủy hoặc suy rollback đối với commit đã bắt đầu gửi trước deadline.
