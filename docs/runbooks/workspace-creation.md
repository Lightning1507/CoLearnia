# Tạo Workspace và general — SCRUM-32/33

Nguồn: [contract M1/M2](../contracts/workspace-channels.md),
[general](../product/messaging.md#kênh-mặc-định-general--ch-01),
[transaction và audit](../database/integrity-and-migrations.md#4-đồng-thời-transaction-và-ranh-giới-runtime).

## Thành phần và kết quả

`apps/server/src/workspaces/create-workspace.ts` cung cấp `createWorkspaceCreator`.
Service nhận input strict `{ name, requestId }` và identity do middleware server xác thực.
Client không chọn owner, role hoặc ID. Tên dùng schema hiện tại: trim, 2–80 Unicode code point.
Không bắt tên Workspace duy nhất.

Dưới cùng coordinator User → Workspace mới, service kiểm User ACTIVE, authSession chưa
revoked/hết hạn và auth deny barrier. ID của Workspace, membership, channel, conversation,
audit và thời gian tạo được chuẩn bị một lần trước callback transaction. Các write tuần tự:

1. Workspace có ownerId của người tạo, revision 0, deletedAt null.
2. Membership OWNER ACTIVE, incarnation 1, revision 0, joinedAt tại thời điểm tạo.
3. general TEXT/WORKSPACE, order/revision 0, deletedAt null.
4. Conversation CHANNEL bằng `createChannelConversationFactory(database.connection).create`
   của M2, đúng `ClientSession` đang ghi các đối tượng M1.
5. Audit `WORKSPACE_CREATE` / `SUCCEEDED`, cùng transaction.

Kiểm invariant OWNER và kiểm lại phiên/barrier trước khi callback kết thúc. Không có
socket/event, ghi file hoặc cleanup bên ngoài DB trong transaction. Chỉ trả Workspace DTO
sau commit đã xác nhận; không trả document Mongoose hoặc thông tin session/token.
General không phải phòng LIVE; không tạo invitation, PRIVATE grant hoặc membership thứ hai.

## Composition và readiness

```ts
const createWorkspace = createWorkspaceCreator({
  database,
  coordinator: operationCoordinator,
  barrier: accessRevocations.barrier,
  indexesReady: () => authIndexesReady && workspaceIndexesReady && !stopping,
  createConversation: createChannelConversationFactory(database.connection).create,
});
const workspaceRouter = createWorkspaceRouter(httpAuth, createWorkspace);
// createApp(config, status, authRouter, workspaceRouter)
```

`database`, `operationCoordinator`, `accessRevocations` và HTTP auth phải là các instance thật dùng
chung của bootstrap. Không tạo coordinator/barrier riêng cho route, không dùng adapter luôn
báo cleanup thành công hoặc `indexesReady: () => true` trong production.

**Hiện trạng:** `main.ts` đã mount Workspace router khi có SESSION_SECRET hợp lệ, dùng
factory conversation thật của M2 và `accessRevocations.barrier` từ
`apps/server/src/lib/shared-access-revocation.ts`. `pnpm dev` có route
`POST /api/v1/workspaces`; auth/CSRF và preflight DB vẫn bắt buộc. Thiếu cấu hình auth
thì route không được mount; thiếu collection/index thì request đã xác thực nhận 503.

Barrier/ledger của ứng dụng khởi tạo trước cleanup runtime. Không truyền mock/no-op adapter:
chưa bind M2/M4 thì yêu cầu thu quyền đã qua `prepareHeld` vẫn đặt deny và trả cleanupPending,
không gọi commitHeld, không báo thu quyền thành công. Tạo Workspace chỉ cần kiểm barrier và
phiên; không có tài nguyên chat/LIVE cần cleanup khi tạo mới. Khi runtime thật được compose,
gọi `accessRevocations.bindCleanupAdapters({ messaging, live })` đúng một lần trên instance
này và retry các operation pending bằng ID cũ. Không thay ledger hoặc khởi tạo barrier khác.
Runtime chat/LIVE và mọi consumer khác vẫn cần task tích hợp tương ứng; không suy rằng
mount API tạo Workspace đã hoàn tất cơ chế thu quyền toàn ứng dụng.

`preflightWorkspaceCreation(database)` chỉ đọc và trả boolean; lỗi quyền/timeout ném về caller,
caller giữ readiness false. Cần có users/authSessions, workspaces/memberships, channels,
conversations và auditEvents; index auth/membership/channel/CHANNEL conversation cùng
`ix_audit_workspace` phải khớp manifest. Gọi preflight sau connect, giữ false khi startup lỗi
hoặc shutdown; khi bật auth, health readiness cũng yêu cầu preflight Workspace pass. Không chạy preflight mọi request, không tự tạo collection/index trên request.

Model audit ở `workspace-audit.ts` chỉ cho writer tạo Workspace, chưa là module audit tổng quát.
Field theo nguồn collection-design; không có payload metadata tự do, không token/chat/email.
Index `ix_audit_workspace`: `{ workspaceId: 1, createdAt: -1, _id: -1 }`. Không có TTL, không
lấy audit làm REST idempotency ledger hoặc thêm API xem audit.

Chưa áp migration lên DB dev/production. Collection/index mới phải được provision qua thay đổi
DB được review; model registration không bật autoCreate/autoIndex. Test tự tạo chúng trong DB
UUID riêng. Không chạy các lệnh provision/reset của test lên DB ứng dụng.

## HTTP và lỗi

Router cung cấp `POST /api/v1/workspaces`: requireAuth → requireCsrf → service. Dùng cookie
session, Origin và CSRF bound với cookie theo middleware hiện có; response không cache.
Thành công HTTP 201 theo `workspaceResponseSchema`: id/name/ownerId/revision.

- Input sai hoặc thêm ownerId/role: VALIDATION_ERROR (400).
- Phiên mất hiệu lực, User disabled hoặc auth barrier trước commit: AUTH_REQUIRED (401).
- Nếu commit đã được xác nhận nhưng phiên hết hạn ở bước kiểm cuối: vẫn AUTH_REQUIRED
  (401), không trả DTO; thông báo rõ Workspace đã được tạo, yêu cầu đăng nhập lại và kiểm
  danh sách trước khi tạo tiếp. Service đánh dấu `committed: true`; đây không phải rollback
  hoặc commit chưa rõ. UI M1-T7.1 cần giữ thông báo này qua bước đăng nhập, không tự replay POST.
- Origin/CSRF sai: CSRF_INVALID (403).
- Admission gate bận/hết thời gian: SERVER_BUSY (503).
- Preflight/pool/DB unavailable: DEPENDENCY_UNAVAILABLE (503).
- Lỗi nội bộ/provider không được nhận diện: envelope INTERNAL_ERROR, không trả lỗi DB thô.

## Retry, commit chưa rõ và giới hạn

Connector dùng transaction primary/snapshot/majority và retry bounded hiện có; factory M2
không mở transaction hoặc connection khác. ID/time không đổi giữa các lượt callback; không
tái sử dụng document Mongoose đã save ở callback trước.

Nếu nhận `UnknownTransactionCommitResult`, đọc primary/majority audit `SUCCEEDED` theo đúng
`auditId` đã chuẩn bị trong entry runtime, đối chiếu actor/action/Workspace/target/requestId,
revision tạo 0 và thời điểm tạo. Audit này chỉ được ghi cùng transaction với cả bốn đối tượng,
nên là bằng chứng lần tạo đã commit; không yêu cầu tên/revision/quyền/trạng thái hiện tại
còn giống lúc tạo. Không tìm thao tác qua audit requestId sau restart hoặc dùng audit làm
kho chống lặp bền. Thiếu/sai bằng chứng vẫn giữ unknown, không mở transaction tạo mới.

Khi retry entry unknown đã xác nhận commit, chuyển entry sang completed trước khi kiểm
session, membership, barrier và Workspace hiện tại. Đổi tên trả DTO mới; Workspace đã xóa
hoặc mất membership trả FORBIDDEN, không kẹt unknown và không tạo lại. Conversation đã đóng
cũng không phủ nhận transaction tạo trước đó. Không xác nhận được thì trả DEPENDENCY_UNAVAILABLE với thông báo chưa rõ
kết quả, log mã trace và mã thao tác để đối chiếu; không báo đã rollback, không ghi audit FAILED trái với một
commit có thể đã thành công, không chạy lại nghiệp vụ bằng bộ ID mới.

HTTP server sinh mã riêng trong response/header; audit giữ `requestId` hợp lệ từ body.
Router log `traceRequestId` (server), `operationRequestId` (body đã validate) và `actorUserId`
ở lúc nhận thao tác; khi thành công ghi thêm `workspaceId`. Nhánh commit chưa rõ và nhánh
commit xong nhưng auth hết hạn cũng giữ cả hai mã. Không log raw body, tên Workspace,
email hoặc cookie/CSRF/token. Audit không đổi thành kho trace hay idempotency.

SCRUM-33 bổ sung chống lặp riêng cho POST tạo Workspace trong cùng process:

- Khóa: actor User + WORKSPACE_CREATE + requestId UUID không phân biệt hoa/thường.
  So sánh SHA-256 của payload sau schema trim tên; không ép tên duy nhất.
- Cùng khóa/payload trả cùng Workspace ID (HTTP 201), kể cả request đến đồng thời.
  Response dùng trace HTTP mới. DTO lấy từ DB hiện hành, không phát lại tên/revision cũ.
- Cùng khóa khác payload trả CONFLICT (409), không ghi thêm; khác actor hoặc requestId
  là thao tác độc lập, có thể tạo Workspace trùng tên.
- Mỗi lần gọi vẫn kiểm session/User ACTIVE và auth barrier dưới User gate. Trước trả lại
  DTO đã tạo còn kiểm Workspace chưa xóa, membership ACTIVE và Workspace barrier dưới
  Workspace gate. Mất quyền trả FORBIDDEN (403), không tạo Workspace thay thế.
- Một instance creator ở main, bộ nhớ tối đa 10.000 entry, không thêm collection/index.
  Thành công giữ 10 phút từ lúc xác nhận, dùng đồng hồ monotonic; replay không gia hạn.
  Dọn entry thành công hết hạn khi nhận thao tác tiếp theo. Đầy trả SERVER_BUSY (503),
  không đẩy entry chưa hết hạn ra để nhận key mới; replay key cũ vẫn được kiểm.
- Rollback xác định giải phóng entry, cùng request có thể thử lại. Commit chưa rõ giữ IDs/time
  và payload hash; request sau chỉ reconcile, không chạy transaction tạo mới. Entry chưa rõ
  không hết hạn/không bị evict, vẫn tính vào capacity; cần đối chiếu vận hành nếu kéo dài.
- Commit thành công nhưng auth hết hạn vẫn giữ entry. Sau đăng nhập lại với cùng User,
  request cũ có thể trả kết quả sau kiểm quyền; không tạo thêm Workspace.

Không có bảo đảm dedupe xuyên restart, nhiều process hoặc quá 10 phút. Client phải kiểm
trạng thái trước khi gửi lại ngoài cửa sổ này, không tự đổi requestId sau lỗi/timeout.
Đặc biệt restart làm mất cả entry commit chưa rõ; không coi restart là cách rollback hay
cho phép replay an toàn. Audit không được dùng làm ledger thay thế. SCRUM-34 gửi `replayOnly: true` khi người dùng chủ động gửi lại yêu cầu chưa rõ kết quả. Nếu entry đã mất hoặc hết hạn, API trả `WORKSPACE_REPLAY_UNAVAILABLE` (410) trước khi ghi dữ liệu.

Các ca transient/unknown trong test chỉ kiểm nhánh xử lý bằng lỗi chèn có kiểm soát; không
chứng minh mất mạng/primary stepdown thật. SCRUM-33 kiểm lỗi sau cả năm write, hết lượt
transient retry, commit bị server từ chối, và gửi lại/đồng thời theo contract trên. Chưa đo tải kết hợp 25/50 hoặc kiểm đa process; giữ baseline một process.

## Kiểm thử

```sh
COLEARNIA_DB_TEST_PORT=27234 COLEARNIA_DB_TEST_FAILPOINTS=1 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/create-workspace.integration.ts
pnpm check
```

Integration suite còn khởi động trực tiếp `src/main.ts` trong process con, truyền env test
riêng (không đọc .env), lấy CSRF từ server thật và POST bằng cookie fixture. Kiểm HTTP 201
và đủ năm bản ghi; khi bỏ một index trong DB test thì startup giữ route 503 và không ghi.
Các process con được shutdown trước khi dọn DB.

Dùng MongoDB 8.0.16 replica set rs0 ở loopback, DB `colearnia_test_scrum32_<UUID>` riêng;
không đọc `.env` hoặc MONGO_URI ứng dụng. Test chỉ drop DB UUID do chính lượt đó tạo.
Suite dùng barrier thật chưa bind adapter cleanup; transaction/conversation/policy và auth
cookie/CSRF dùng implementation thật. Kết quả tại [evidence SCRUM-32](../test-evidence/2026-11-13-scrum-32-workspace-creation.md).

### MongoDB riêng cho ma trận SCRUM-33

Ca server từ chối commit dùng failpoint, chỉ bật trên container test độc lập không volume;
không bật trên DB ứng dụng. Cờ `COLEARNIA_DB_TEST_FAILPOINTS=1` chỉ dành cho server này.
Không đặt cờ thì riêng ca failpoint được skip, các ca rollback/retry khác vẫn chạy.

```sh
docker run --name colearnia-scrum33-test -d -p 127.0.0.1:27234:27234 mongo:8.0.16 mongod --replSet rs0 --bind_ip_all --port 27234 --setParameter enableTestCommands=1
docker exec colearnia-scrum33-test mongosh --quiet --port 27234 --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27234"}]})'
```

Chờ `db.hello().isWritablePrimary` là true rồi chạy suite ở trên. Suite dùng DB UUID riêng,
failpoint chỉ một lần cho commit và được tắt trong finally; không dùng container chung với
ứng dụng/test chạy song song. Xong kiểm thì `docker rm -f colearnia-scrum33-test` chỉ xóa
container test này. Kết quả mới: [evidence SCRUM-33](../test-evidence/2026-11-14-scrum-33-workspace-retry.md).
