# Tạo Workspace và general — SCRUM-32

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

Nếu nhận `UnknownTransactionCommitResult`, đọc primary/majority theo bộ ID đã chuẩn bị và
đối chiếu đủ Workspace, OWNER membership, general, conversation, audit. Chỉ trả thành công
khi tất cả khớp. Không xác nhận được thì trả DEPENDENCY_UNAVAILABLE với thông báo chưa rõ
kết quả, log mã trace và mã thao tác để đối chiếu; không báo đã rollback, không ghi audit FAILED trái với một
commit có thể đã thành công, không chạy lại nghiệp vụ bằng bộ ID mới.

HTTP server sinh mã riêng trong response/header; audit giữ `requestId` hợp lệ từ body.
Router log `traceRequestId` (server), `operationRequestId` (body đã validate) và `actorUserId`
ở lúc nhận thao tác; khi thành công ghi thêm `workspaceId`. Nhánh commit chưa rõ và nhánh
commit xong nhưng auth hết hạn cũng giữ cả hai mã. Không log raw body, tên Workspace,
email hoặc cookie/CSRF/token. Audit không đổi thành kho trace hay idempotency.

`requestId` là mã truy vết, không dedupe POST. Hai lần gọi HTTP/service độc lập có thể tạo hai
Workspace, kể cả cùng tên/requestId. Client không tự replay POST sau timeout/mất ack; phải
kiểm danh sách Workspace trước khi chủ động tạo lại. API danh sách và UI chọn/tạo/mở thuộc
M1-T7.1. Không thêm ledger hoặc contract dedupe trong SCRUM-32.

Các ca transient/unknown trong test chỉ kiểm nhánh xử lý bằng lỗi chèn có kiểm soát; không
chứng minh mất mạng/primary stepdown thật. Ma trận lỗi từng write, retry/rollback và phục hồi
đầy đủ thuộc M1-T6.2. Chưa đo tải kết hợp 25/50 hoặc kiểm đa process; giữ baseline một process.

## Kiểm thử

```sh
COLEARNIA_DB_TEST_PORT=27232 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/create-workspace.integration.ts
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
