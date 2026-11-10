# Model Workspace, thành viên và link mời — SCRUM-30

Nguồn: [contract M1](../contracts/workspace-channels.md), [collection design](collection-design.md#33-workspaces), [integrity](integrity-and-migrations.md). Source ở `apps/server/src/workspaces/workspace-models.ts`; kiểm OWNER ở `workspace-integrity.ts`.

## Phạm vi

Ba model Mongoose dùng connection được inject từ `createDatabase`: `Workspace`, `Membership`, `Invitation`. Có manifest index và native MongoDB validators để bảo vệ cả raw insert/update. Không tự tạo collection/index ở startup, không chạy migration hoặc sửa DB hiện có. Chưa có route, service quản lý thành viên hoặc API lời mời.

| Collection  | Nội dung                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| workspaces  | name trim 2–80 Unicode code point, ownerId bất biến, revision ≥0, deletedAt null hoặc Date                                   |
| memberships | workspaceId/userId bất biến, role OWNER/ADMIN/MEMBER, status ACTIVE/REMOVED, incarnation ≥1, revision ≥0, joinedAt/removedAt |
| invitations | workspaceId/createdByUserId bất biến, tokenHash, encryptedToken, enabled, revision ≥0                                        |

Mỗi document có `_id`, `createdAt`, `updatedAt`. Native validator bắt buộc field và từ chối field lạ. Counter nhận BSON int/long/double nguyên trong miền số an toàn JavaScript; từ chối string, Decimal128, NaN, Infinity hoặc overflow.

## OWNER và membership

`workspaces.ownerId` là con trỏ chuẩn. Workspace còn hoạt động phải có đúng một membership OWNER ACTIVE khớp userId đó. Không unique ownerId trên toàn hệ thống, không unique role để thay kiểm quan hệ giữa hai collection.

`assertWorkspaceOwner(connection, workspaceId, session)` kiểm invariant trong transaction hiện hành; thiếu Workspace, Workspace đã xóa, không có OWNER, có nhiều OWNER hoặc sai con trỏ đều ném `WorkspaceOwnerInvariantError`. Caller giữ Workspace gate và dừng mutation để reconcile khi lỗi; helper không tự sửa owner hoặc cấp quyền. Query có maxTimeMS 5 giây, chỉ lấy tối đa hai OWNER để phát hiện trùng. Helper chưa được nối vào API/startup; service tạo và quản lý Workspace phải gọi trong transaction theo task triển khai.

Service tạo Workspace chuẩn bị ID/thời gian ổn định trước callback, tạo Workspace + OWNER + general + conversation TEXT trong cùng transaction theo SCRUM-32. User hợp lệ, quyền actor và quan hệ Workspace/kênh/grant vẫn do service kiểm; MongoDB không có foreign key hoặc ràng buộc liên collection. Không có chuyển owner trong MVP. Writer chỉ dùng cập nhật field đã whitelist bằng `$set`/`$inc`, giữ gate/transaction và kiểm invariant. Không dùng `replaceOne`, `findOneAndReplace`, replacement trong `bulkWrite` hoặc raw replacement: `immutable` của Mongoose không bảo vệ các thao tác thay toàn document, kể cả khi bật `runValidators`. Raw update cũng không được tự đổi owner; đây là contract của writer, model chưa tự chặn mọi cách ghi này.

Membership ACTIVE bắt buộc removedAt=null; REMOVED bắt buộc removedAt=Date. OWNER phải ACTIVE. Unique `(workspaceId,userId)` bao gồm tombstone REMOVED. Rejoin cập nhật cùng document, CAS revision/status, đặt `role: MEMBER` trong cùng `$set` và tăng incarnation/revision đúng một lần; không khôi phục ADMIN cũ qua link mời. Đổi role chỉ tăng revision. Nhận lời mời khi đã ACTIVE trả membership hiện hành, không đổi role/incarnation/revision. Model không tự tăng các counter hoặc khôi phục grant PRIVATE; service T8/T9 thực hiện lifecycle này.

## Token link mời

Giữ nguyên link mời; không đổi sang mã nhập tay. Một document tồn tại xuyên các lần tắt/tạo lại. Không có expiresAt, uses, maxUses hoặc TTL.

| Field                     | Định dạng                                                    |
| ------------------------- | ------------------------------------------------------------ |
| tokenHash                 | SHA-256 của 32 byte token ngẫu nhiên, lowercase hex 64 ký tự |
| encryptedToken.algorithm  | `AES-256-GCM`                                                |
| encryptedToken.keyId      | 1–64 ký tự ASCII chữ/số/`_`/`-`, chọn khóa server            |
| encryptedToken.iv         | 12 byte, base64url không padding                             |
| encryptedToken.ciphertext | 32 byte, base64url không padding                             |
| encryptedToken.authTag    | 16 byte, base64url không padding                             |

Hướng tích hợp T8:

1. Sinh 32 byte ngẫu nhiên bằng CSPRNG; biểu diễn trong URL bằng base64url không padding. Khi nhận link, decode canonical về đúng 32 byte trước khi hash. Không hash hai biểu diễn khác nhau của cùng token.
2. Mã hóa **32 byte gốc** bằng khóa AES 256 bit; IV ngẫu nhiên mới mỗi lần mã hóa. AAD là UTF-8 của `colearnia:invitation:v1:<workspaceId lowercase hex>` để gắn ciphertext với Workspace.
3. Khóa lấy từ cấu hình bí mật của server, không từ client hoặc DB. `keyId` không chứa khóa. Giữ khóa cũ khi envelope còn tham chiếu; chuyển ciphertext và keyId cùng một lần ghi khi luân chuyển khóa. Không tạo khóa mới ngẫu nhiên ở mỗi lần server khởi động.
4. Chỉ owner/admin hiện hành mới được lấy link đang bật. Giải mã phải kiểm GCM authTag/AAD và đối chiếu hash, từ chối khi thiếu khóa/sai tag/sai hash; không cấp link thay thế âm thầm. Không dùng token từ document lỗi.
5. Tạo lại link cập nhật tokenHash, toàn bộ encryptedToken, enabled=true và tăng revision nguyên tử theo expectedRevision dưới Workspace gate. Tắt link giữ document nhưng enabled=false; revision cũ bị conflict. Retry cùng requestId không thay mã lần hai; cách lưu/đối soát intent thuộc T8.

Hash và envelope đều `select:false` trên query Mongoose. `toJSON`/`toObject` luôn xóa chúng, kể cả document vừa tạo hoặc query chủ động chọn field. Raw query/aggregation và `.select('+tokenHash +encryptedToken').lean()` là dữ liệu nội bộ, không được trả thẳng vào response/log. API phải dùng DTO riêng. Khóa và plaintext token không có field trong schema.

Đây là định dạng lưu trữ và hướng tích hợp, chưa phải module mã hóa hoặc quản lý khóa đã chạy. Không thêm biến môi trường không được sử dụng; task T8 bổ sung cấu hình/runbook trước khi chạy service lời mời. Validator chỉ kiểm cấu trúc, không chứng minh ciphertext/tag/hash thuộc cùng token; service phải tạo/kiểm cả bộ.

## Index và áp dụng

| Collection  | Index                   | Key / options                                   |
| ----------- | ----------------------- | ----------------------------------------------- |
| memberships | uq_membership_pair      | `{workspaceId:1,userId:1}`, unique, gồm REMOVED |
| memberships | ix_membership_user      | `{userId:1,status:1,workspaceId:1}`             |
| memberships | ix_membership_workspace | `{workspaceId:1,status:1,_id:1}`                |
| invitations | uq_invitation_token     | `{tokenHash:1}`, unique                         |
| invitations | uq_invitation_workspace | `{workspaceId:1}`, unique, gồm enabled=false    |

Không unique tên Workspace, không thêm index owner hoặc TTL. Có thể dùng `preflightIndexes` với manifest này sau provisioning. Trước áp vào DB có dữ liệu, kiểm duplicate membership/link, OWNER không khớp, counter/status và invitation thiếu encryptedToken. Dữ liệu hash-only không thể tự giải mã để backfill: cần kế hoạch thay link có thông báo; không tự đổi hoặc xóa link hiện có. Chỉ migration được review mới được createCollection/collMod/createIndexes; không dùng syncIndexes/reset để ép DB khớp model.

## Kiểm tra

- Unit: schema hợp lệ/từ chối, Unicode/default, lifecycle membership, cấu trúc token mã hóa và redaction.
- Integration: DB riêng ngẫu nhiên trên replica set; provision native validators/index; kiểm OWNER, unique membership/link, CAS đồng thời, thay token nguyên tử, raw write bị từ chối, commit/rollback và redaction.
- Test membership/rejoin/regenerate gọi model trực tiếp theo mẫu CAS; chưa là bằng chứng service/HTTP, idempotency requestId hoặc cleanup M2/M4 đã hoạt động.

Chạy `pnpm exec vitest run apps/server/src/workspaces/workspace-models.test.ts` và `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/workspace-models.integration.ts`; full check bằng `pnpm check`. DB integration yêu cầu replica set theo [local runbook](../runbooks/local-development.md). Test chỉ drop database ngẫu nhiên do chính suite tạo, không dùng database ứng dụng.
