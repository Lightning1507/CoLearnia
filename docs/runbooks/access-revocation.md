# Điều phối thu quyền — SCRUM-28

Nguồn: [contract M1/M2/M4](../contracts/workspace-channels.md),
[policy hiện hành](workspace-access.md), [thứ tự khóa](operation-coordination.md).

## Thành phần đã có

`apps/server/src/workspaces/access-revocation.ts` cung cấp
`createAccessRevocationCoordinator`. Đây là port nội bộ cho service nghiệp vụ,
không phải endpoint nhận event do client tự dựng. Sáu scope dùng schema chung:
AUTH_SESSION, USER_AUTH_SESSIONS, WORKSPACE_MEMBERSHIP, PRIVATE_CHANNEL_ACCESS,
CHANNEL_DELETED, WORKSPACE_DELETED.

Luồng mỗi operation:

1. Giữ User → Workspace (nếu có), service xác thực actor, target và revision hiện hành.
2. Chụp cohort phiên cho logout-all; dựng deny barrier rồi gọi M2 `fence` đồng bộ.
3. Nhả gate, gọi M2/M4 cleanup. M2 dùng watermark đã chụp; M4 dùng event canonical.
4. Chỉ khi các adapter xác nhận thu quyền và vô hiệu pending mới lấy lại gate để ghi DB.
5. Commit không rõ kết quả hoặc ném lỗi: giữ deny; lần retry đọc lại kết quả trước khi ghi tiếp.

PRIVATE/membership gắn đúng membership ID/incarnation. Trong lúc pending, tăng revision
khác không vượt deny; sau commit, snapshot cũ vẫn bị chặn, grant/lượt membership mới
được policy DB và revision mới quyết định. ID Workspace đã xóa không được tái sử dụng.
Cleanup không tự ghi quyền hoặc phục hồi quyền khi lỗi.

Barrier chuẩn hóa ObjectId của principal và snapshot về chữ thường trước khi đối chiếu.
Snapshot chỉ kiểm Workspace không có cả `channelId` lẫn `channelRevision`; nếu kiểm
kênh thì bắt buộc có đủ hai trường. ID/revision/incarnation sai hoặc thiếu trả false,
không suy revision thiếu thành vô hạn và không hạ snapshot kênh lỗi thành Workspace-only.

## Composition bắt buộc

Mọi consumer dùng **cùng instance coordinator và barrier**, không tạo registry theo request.
Provider Workspace/kênh yêu cầu barrier là tham số thứ tư:

```ts
const revocations = createAccessRevocationCoordinator({
  coordinator: operationCoordinator,
  messaging: messagingRevocationPort,
  live: { revoke: (event) => mainRegistry.revoke(event) },
});
const access = createWorkspaceAccessService(
  database,
  operationCoordinator,
  () => accessReady,
  revocations.barrier,
);
```

Biến trong ví dụ là các port thật do bootstrap cung cấp; không thay bằng adapter luôn
trả thành công. Với MAIN, truyền `accessRevocations: revocations` vào
`createMainJoinRegistry` cùng coordinator đã dùng để tạo ledger. Registry kiểm cùng
instance coordinator ngay khi khởi tạo và lấy cohort trực tiếp từ
`revocations.revokedAuthSessions(event)`. Callback trả bản sao cohort đã chụp;
không query lại mọi phiên của user. Khởi tạo registry trước khi nhận request.

M4 kiểm `revocations.barrier.isCurrent(authority.auth, authority.access, held)` trong
`currentFence`, trước callback `isAuthorityCurrent`, dưới Workspace gate đang giữ.
Nếu có stamp đã commit thì kiểm cả stamp đó để không bỏ qua khoảng đã bị thu quyền.
Các kiểm identity/expiry/revision/generation/ACL vẫn giữ nguyên. Barrier chỉ kiểm
freshness, không cấp ACL và không lấy User gate lồng.
M2 cũng phải kiểm lại deny cho các principal liên quan trước
đọc/gửi/fanout/download, kể cả peer của DM; watermark không thay ACL.
HTTP/socket đọc phiên phải kiểm auth barrier dưới User gate trước khi sử dụng context.
Provider Workspace đã nối cả auth và Workspace/channel barrier. SCRUM-32 khởi tạo một
ledger/barrier dùng chung ở `lib/shared-access-revocation.ts` và truyền nó vào API tạo
Workspace đã mount trong main. Chưa sửa mọi consumer HTTP/socket/chat/LIVE.

### Khởi tạo trước adapter runtime

`createAccessRevocationCoordinator({ coordinator })` có thể khởi tạo barrier thật trước khi
có cleanup. Nếu nhận operation hợp lệ, `prepareHeld` vẫn xác thực/chụp cohort dưới gate;
sau đó install deny, trả `permissionRevoked:false`, `pendingInvalidated:false`,
`cleanupPending:true`. Không chạy `commitHeld`, không tự coi registry rỗng là cleanup xong.
Lỗi authorize ở prepare không cài deny. Đây là trạng thái dependency chưa sẵn sàng, không
phải adapter giả trả thành công.

Bootstrap runtime sau đó gọi `accessRevocations.bindCleanupAdapters({ messaging, live })`
với cả hai port thật trên cùng singleton, trước khi nhận consumer tương ứng. Bind một lần;
không thay adapter khi đã bind. Nếu truyền qua constructor thì cũng phải có đủ cả hai.
Retry operation ID cũ tiếp tục dùng cohort/target/watermark cũ; bind không tự chạy lại hoặc
thay ledger, không tự giải phóng deny.

`lib/shared-main-registry.ts` cung cấp `createApplicationMainRegistry(options, messaging)`:
dùng singleton `accessRevocations` và `operationCoordinator` của ứng dụng, yêu cầu đủ
cleanup media/messaging/board và bind cặp M2/LIVE đúng một lần. Bind lại bị từ chối;
registry vừa tạo bị đóng, registry đã bind được giữ nguyên. Hàm chỉ được gọi trong
bootstrap có authority/repository/cleanup thật. `main.ts` hiện chưa truyền
`mountRegistry` vào `startLiveRuntime`; việc bổ sung factory không đồng nghĩa toàn bộ
HTTP/socket/LIVE đã được mount hay đã nghiệm thu tích hợp.

## Callback persistence của service nghiệp vụ

`revoke({ event, userId, persistence })` chỉ được gọi bởi server. Với event có userId,
User gate bắt buộc đúng user bị tác động; AUTH_SESSION cần owner đã xác minh ở server;
Workspace/channel toàn phần dùng User gate của actor và Workspace gate tương ứng.

- `prepareHeld(held)`: kiểm actor/quyền/target/revision từ nguồn hiện hành, không mutation;
  trả `{ authSessionIds: [] }`, riêng USER_AUTH_SESSIONS trả tập phiên hiện tại cần thu.
  AuthSession ID phải thuộc đúng user. ID và revision không được tin từ request client.
  Không giữ transaction mở khi callback kết thúc.
- `commitHeld(held, cohort)`: kiểm lại operation, incarnation và CAS của target trong
  transaction ghi. Chỉ ghi đúng cohort đã chụp; không query lại toàn bộ phiên hiện tại.
  Trả `committed` khi kết quả chắc chắn hoặc `unknown` khi cần đối soát. Không cấp lại
  quyền hay chuyển tác động sang incarnation mới để làm operation cũ thành công.
- `reconcileHeld(held)`: trả `committed`, `not_committed` hoặc `unknown` bằng read-back
  đáng tin cậy, gắn operation và target. Chỉ `not_committed` mới cho phép ghi lại.
  Không suy kết quả từ việc request hết thời gian chờ.

Các callback được giữ từ lần gọi đầu; retry cùng operation không thay callback/cohort.
Không gọi lại hàm ngoài tự lấy gate trong callback Held. Mọi writer/regrant cùng tuân
thủ gate và version protocol; writer phải kiểm deny cho mọi target bị tác động
(kể cả target membership khi actor quản lý người khác), không chỉ quyền actor.
Barrier không bảo vệ writer ghi DB ngoài giao thức.

## Lỗi, retry và giới hạn

- Lỗi validate/prepare trước deny được trả cho caller, không gọi cleanup hay ghi DB.
- Khi đã dựng deny, lỗi fence/cleanup/DB trả hai cờ hiệu lực false và cleanupPending true.
  Caller cần retry **cùng event/operationId**; thay payload/User gate cùng ID bị CONFLICT.
- M2 `completed` và M4 `permissionRevoked && pendingInvalidated` phải có đúng operationId.
  `cleanupPending:true` từ M4 vẫn có thể chỉ công việc dọn byte nền sau khi quyền đã bị thu.
- Budget cleanup mặc định 2 giây, dùng `performance.now()`. M2 nhận AbortSignal/deadline;
  M4 port hiện không nhận signal. Promise hết budget vẫn được theo dõi: retry không mở
  thêm một lần gọi cho đến khi promise cũ kết thúc. Kết quả trễ không tự commit DB.
- Adapter phải idempotent theo operation + target/watermark. M2 logout-all dùng từng
  AUTH_SESSION, không target USER rộng. Watermark retry không đóng tài nguyên đăng ký sau.
  M4 giữ cohort, ownership/epoch/generation, transition token và các handle cleanup
  từ lần đầu. Retry tiếp tục phần chưa hoàn tất; phần đã xác nhận không gọi lại.
  Synchronous media cleanup được retry dưới Workspace gate; I/O M2/M5 chạy ngoài gate.
  Promise adapter quá hạn vẫn được theo dõi, không mở I/O trùng khi retry.
  Lỗi không tự retry trong foreground (`retryable:false`) vẫn có thể được thử lại khi
  caller chủ động retry cùng operation sau khi provider đã khắc phục.
  Operation đang chạy dùng chung promise, hoàn tất thì replay; cùng ID khác payload
  trả CONFLICT. Record incomplete không hết hạn/không bị evict để né deny. Không quét
  lại cohort/đổi target sang login, incarnation hoặc generation mới để làm retry thành công.
- Mặc định: tối đa 16 orchestration đồng thời, 256 adapter task chưa kết thúc,
  128 session/cohort, 1024 record/process;
  constructor cho phép cấu hình số nguyên dương. Hết admission trả SERVER_BUSY trước
  dựng deny mới. Cùng operation đang chạy dùng chung promise, không nhân đôi cleanup. Hết slot adapter
  giữ deny và trả incomplete để retry, không tạo thêm promise cleanup.
- Không tự xóa cả record completed vì còn chặn snapshot cũ/replay; không evict pending
  để lấy chỗ. Chạm giới hạn ledger cần xử lý vận hành/thiết kế retention an toàn trước
  mở rộng; không khuyến nghị restart để xóa deny chưa lưu DB.

Registry/deny/cohort nằm trong RAM của **một process**. Chưa có durable recovery cho
operation chưa commit nếu crash; không công bố an toàn restart của luồng thu quyền.
Không thêm Redis, worker pool, collection hay migration trong task này. Chưa đo tải
kết hợp 25/50; adapter thật, business CRUD và recovery thuộc phần tích hợp tiếp theo.

## Kiểm tra

- Unit orchestration, scope, retry/timeout, stale generation, bounded admission:
  `pnpm exec vitest run apps/server/src/workspaces/access-revocation.test.ts`.
- Mongo provider + barrier (DB test ngẫu nhiên riêng):
  `COLEARNIA_DB_TEST_PORT=27228 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/workspace-access.integration.ts`.
- [Kết quả SCRUM-28](../test-evidence/2026-11-13-scrum-28-access-revocation.md).
- [Tích hợp deny/cohort và retry của M4](../test-evidence/2026-11-14-m4-access-revocation.md).
