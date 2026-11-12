# Policy quyền Workspace/kênh — SCRUM-27

Nguồn nghiệp vụ: [Workspace/kênh](../product/workspace-channels.md),
[PRIVATE](../product/messaging.md), [contract M1/M2/M4](../contracts/workspace-channels.md).

## Thành phần và cách dùng

- `apps/server/src/workspaces/access-policy.ts`: policy thuần, không I/O. Dữ liệu đầu vào do server đọc; không truyền body/request hoặc snapshot client vào đây.
- `access-service.ts`: adapter dùng connection chung, phiên hiện hành và cùng instance [coordinator](operation-coordination.md). Mỗi lần gọi đọc snapshot transaction mới trên primary: auth session/user, Workspace, membership, channel và PRIVATE grant. Không cache quyền, không đọc hash/token/mật khẩu.
- `resolveChannelAccess` thực thi port đã có cho M2/M4. Ngoài phiên còn hiệu lực, kênh WORKSPACE cần membership ACTIVE; PRIVATE cần grant đúng membership ID/incarnation và chưa revoked. OWNER/ADMIN không có grant chỉ nhận `canManageChannel:true`, `canReadContent:false`. MEMBER ngoài PRIVATE nhận NOT_FOUND.
- `requireWorkspacePermission` kiểm `read`, `rename`, `delete`, `createChannel`, `manageInvitation`, `changeRole`, `removeMember`; hai action cuối cần `targetUserId` và đọc target từ DB, không nhận role do caller tự điền. Trả membership/targetMembership cùng revision để service tiếp tục CAS. Không thực hiện mutation.

Composition khi gắn consumer thật:

```ts
const access = createWorkspaceAccessService(database, operationCoordinator, () => accessReady);
// accessReady chỉ true sau preflightIndexes(connection, workspaceAccessIndexRequirements)
// thành công, và false khi shutdown. Không dùng () => true ở production.
const resolveChannelAccess: ResolveChannelAccess = access.resolveChannelAccess;
```

`workspaceAccessIndexRequirements` tái sử dụng index auth/membership/channel/grant hiện có.
Provider không tự tạo collection/index hoặc chạy migration. Pool, admission transaction,
retry và timeout từng giai đoạn dùng [database chung](mongodb-transactions.md).
Mỗi query có maxTimeMS=5000; hết pool transaction hoặc DB unavailable từ chối cấp quyền.
Chưa đo capacity tải kết hợp 25/50 người.

### Khi service đang giữ gate

Hàm ngoài tự lấy khóa User → Workspace. Nếu caller đã trong callback coordinator,
dùng `resolveChannelAccessHeld(input, context)` hoặc
`requireWorkspacePermissionHeld(input, context)`; không gọi lại hàm ngoài và không tạo
coordinator riêng. Context phải giữ đúng cả User và Workspace, còn sống trong callback.

```ts
await operationCoordinator.run({ userId: identity.userId, workspaceId }, async (context) => {
  const permission = await access.requireWorkspacePermissionHeld(
    { identity, workspaceId, action: 'rename' },
    context,
  );
  // Không có await bên ngoài DB giữa kiểm quyền và mutation.
  // Transaction ghi phải kiểm lại state cần thiết/CAS; giữ cùng gate đến khi hoàn tất.
  // Dùng permission.membership trong service mutation/CAS của task tương ứng.
  // Giữ callback này đến khi transaction ghi hoàn tất; không trả snapshot ra để ghi sau.
});
```

Đây là ví dụ composition, chưa có route đổi tên từ SCRUM-27. Gọi provider **trước**
transaction ghi, không mở transaction provider bên trong transaction ghi của caller.
Provider không nhận session transaction bên ngoài để tránh đọc lại snapshot cũ và coi
đó là lần kiểm quyền hiện hành. Coordinator giới hạn một app process; các writer
thực tế phải cùng tuân thủ gate và thứ tự khóa. Ghi DB ngoài giao thức này có thể làm
snapshot vừa trả về trở nên cũ.

### Lỗi và kiểm lại quyền

| Tình huống                                                                     | Kết quả                |
| ------------------------------------------------------------------------------ | ---------------------- |
| Context auth sai/hết hạn, session không tồn tại/revoked/hết hạn, User disabled | AUTH_REQUIRED          |
| Workspace đã xóa/không có membership, kênh sai Workspace/đã xóa, PRIVATE ẩn    | NOT_FOUND              |
| Actor được biết Workspace nhưng sai quyền/action/target OWNER hoặc chính mình  | FORBIDDEN              |
| Preflight chưa sẵn sàng, mất DB, timeout/pool admission thất bại               | DEPENDENCY_UNAVAILABLE |

Transport xác thực bằng middleware có sẵn và validate params trước khi gọi; lỗi ID
sai dạng là validation error từ schema, không phải DB lookup. Adapter HTTP/socket
map lỗi sang envelope chung; không trả raw exception/DB query. Lỗi gate giữ semantics
BUSY/TIMEOUT/ABORTED/INVALID_CONTEXT của coordinator, không coi là được phép.

Snapshot chỉ đúng tại lần kiểm; sau await dài, trước commit/publish/create/resume/fanout
phải kiểm lại. M2 bắt buộc `canReadContent`; M4 còn kiểm `channelType === 'LIVE'` và
policy runtime phiên/nhóm. Nếu resource đã chuẩn bị, cleanup trong `finally` khi kiểm
lại trả false **hoặc ném lỗi**; chưa chuyển ownership thì phải đóng.

SCRUM-27 không tự gắn provider vào chat/LIVE hiện tại, không triển khai CRUD, DM ACL,
channel/session queues hay thu socket/media. Deny barrier, đóng tài nguyên đang hoạt
động và fanout khi thu quyền thuộc SCRUM-28/các task tích hợp; gate và DB snapshot
không thay cơ chế đó. Tạo Workspace khi chưa có membership dùng auth + transaction
của task tạo Workspace, không gọi policy membership để tự cấp OWNER.

## Bảng ca kiểm

| Ca                                                                   | Mong muốn                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| ACTIVE MEMBER / ADMIN / OWNER đọc WORKSPACE TEXT/LIVE                | Cho phép                                                 |
| MEMBER rename/create channel/invitation/delete Workspace             | Từ chối                                                  |
| ADMIN rename/create channel/invitation; delete Workspace/change role | Cho phép nhóm đầu; từ chối nhóm sau                      |
| OWNER đổi role/loại người khác; tự gỡ/hạ OWNER                       | Cho phép người khác không phải OWNER; từ chối OWNER/self |
| ADMIN loại MEMBER / ADMIN / OWNER                                    | Chỉ MEMBER                                               |
| PRIVATE chưa grant, OWNER/ADMIN                                      | Quản lý được, nội dung bị từ chối                        |
| PRIVATE grant hiện hành cho MEMBER, TEXT/LIVE                        | Cho phép nội dung                                        |
| Grant revoked/sai scope/khác membership/incarnation cũ               | Từ chối nội dung                                         |
| REMOVED/rejoin, Workspace/channel xóa hoặc sai Workspace             | Không dùng quyền cũ                                      |
| Auth revoked/expired/disabled, expiry trong lúc chờ/đọc              | Từ chối                                                  |
| Kiểm lại sau revoke, resolver ném lỗi                                | Không publish, đóng resource tạm                         |
| Context sai/hết lifetime, dùng lại gate lồng                         | Từ chối, không rò khóa                                   |

Test thuần: `pnpm exec vitest run apps/server/src/workspaces/access-policy.test.ts`.
Test MongoDB (DB ngẫu nhiên riêng, không seed/reset DB dev):
`COLEARNIA_DB_TEST_PORT=27227 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/workspace-access.integration.ts`.
Kết quả thực chạy tại [evidence](../test-evidence/2026-11-12-scrum-27-workspace-access.md).
