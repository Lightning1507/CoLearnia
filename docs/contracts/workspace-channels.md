# Contract Workspace, kênh và phối hợp M2/M4 — SCRUM-13

Model kênh/PRIVATE grant, index, validator và cách tích hợp theo [SCRUM-26](../database/channel-models.md).

Model Workspace, membership và invitation theo [SCRUM-30](../database/workspace-models.md). Invitation lưu thêm token mã hóa để lấy lại link hiện hành; chưa bổ sung endpoint/DTO lời mời trong contract này.

**Trạng thái:** schema và port Workspace/kênh đã có; SCRUM-27 bổ sung policy và provider `ResolveChannelAccess` dùng MongoDB theo [runbook quyền](../runbooks/workspace-access.md). SCRUM-28 bổ sung [điều phối deny/cleanup](../runbooks/access-revocation.md) và nối barrier vào provider; SCRUM-32 bổ sung [service và router tạo Workspace/general](../runbooks/workspace-creation.md), đã mount trong main với barrier/ledger dùng chung; thiếu preflight DB thì trả 503. Barrier chưa có adapter cleanup vẫn giữ deny và không báo hoàn tất thu quyền. Các CRUD khác và tích hợp adapter runtime thật chưa có. M4 review chính; M2 xác nhận phần conversation và thu chat/tệp trước khi tích hợp. Chưa ghi nhận xác nhận của hai miền trong task này.

Nguồn: [proposal M1](../proposals/m1-workspace-auth.md), [quyền Workspace/kênh](../product/workspace-channels.md), [PRIVATE](../product/messaging.md), [quy ước API](api-conventions.md), [mã lỗi](error-codes.md). Schema ở `packages/contracts/src/workspace.ts`; chữ ký hàm server ở `apps/server/src/workspaces/ports.ts`.

## 1. Dữ liệu dùng chung

- Document ID là chuỗi hex 24 ký tự; requestId/operationId là UUID. Không thay `resourceIdSchema` rộng của scaffold trên toàn dự án.
- Role: OWNER, ADMIN, MEMBER. Kênh có hai trục độc lập: type TEXT/LIVE và accessMode WORKSPACE/PRIVATE. RESTRICTED bị từ chối ở input mới.
- Giữ giới hạn tên của scaffold: Workspace 2–80, kênh 1–80 Unicode code point sau trim. Đây là giới hạn hiện có được chuyển sang cách đếm chung; không thêm quy tắc tên trùng hoặc ký tự cấm. M4 cần review giới hạn trước consumer adoption.
- revision là số nguyên an toàn ≥0; membershipIncarnation là số nguyên an toàn ≥1. Revision của Workspace, membership và kênh là các bộ đếm riêng; không dùng thay policyRevision của LIVE.
- Body mutation có requestId; mutation trên đối tượng hiện có thêm expectedRevision. UUID không tự tạo cơ chế chống lặp: service vẫn phải xử lý theo lifecycle. requestId trong response là mã truy vết theo quy ước API.
- Input strict: không nhận ownerId, actorId, role tự khai. PATCH tên kênh không nhận type/accessMode; endpoint đổi role chỉ nhận ADMIN/MEMBER, không chuyển owner.

| Thao tác dưới `/api/v1`                           | Schema params / body                                      | Kết quả đã định nghĩa                                  |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| POST `/workspaces`                                | `createWorkspaceSchema`                                   | `workspaceResponseSchema`, HTTP 201                    |
| PATCH `/workspaces/:workspaceId`                  | `workspaceParamsSchema` / `renameWorkspaceSchema`         | `workspaceResponseSchema`, HTTP 200                    |
| DELETE `/workspaces/:workspaceId`                 | `workspaceParamsSchema` / `mutationInputSchema`           | `workspaceMutationResponseSchema`, HTTP 200, data:null |
| POST `/workspaces/:workspaceId/channels`          | `workspaceParamsSchema` / `createChannelSchema`           | `channelResponseSchema`, HTTP 201                      |
| PATCH `/channels/:channelId`                      | `channelParamsSchema` / `renameChannelSchema`             | `channelResponseSchema`, HTTP 200                      |
| DELETE `/channels/:channelId`                     | `channelParamsSchema` / `mutationInputSchema`             | `workspaceMutationResponseSchema`, HTTP 200            |
| PATCH `/workspaces/:workspaceId/members/:userId`  | `workspaceMemberParamsSchema` / `changeMemberRoleSchema`  | `workspaceMutationResponseSchema`, HTTP 200            |
| DELETE `/workspaces/:workspaceId/members/:userId` | `workspaceMemberParamsSchema` / `mutationInputSchema`     | `workspaceMutationResponseSchema`, HTTP 200            |
| PUT/DELETE `/channels/:channelId/access/:userId`  | `channelAccessParamsSchema` / `changePrivateAccessSchema` | `workspaceMutationResponseSchema`, HTTP 200            |

### Revision cần gửi theo từng thao tác

| Thao tác                   | `expectedRevision` đối chiếu với                                        |
| -------------------------- | ----------------------------------------------------------------------- |
| Đổi tên / xóa Workspace    | `workspaces.revision` của Workspace đích                                |
| Đổi role / loại thành viên | `memberships.revision` của **thành viên bị tác động**, không phải actor |
| Đổi tên / xóa kênh         | `channels.revision` của kênh đích                                       |
| Thêm / gỡ quyền PRIVATE    | `channels.revision` của kênh đích, không phải revision của grant        |

Service kiểm CAS trong lần ghi và tăng đúng bộ đếm theo lifecycle; revision cũ trả CONFLICT. Ví dụ kênh revision=3, membership revision=8: gỡ PRIVATE gửi expectedRevision=3; loại thành viên gửi 8. Không tráo hai số dù cùng là số nguyên. Tạo Workspace/kênh mới chưa có revision để đối chiếu. DTO roster và endpoint quản lý thành viên cần cung cấp revision của membership trước khi consumer thực hiện mutation; Workspace/Channel DTO không thay dữ liệu này.

Workspace DTO chỉ có id/name/ownerId/revision. Channel DTO chỉ có id/workspaceId/name/type/accessMode/revision. Không trả document DB nguyên bản. GET list, pagination, invitation và roster DTO chưa được định nghĩa trong lượt này; endpoint owner chốt cùng task implementation, không dùng các DTO trên làm toàn bộ contract danh sách.

Ví dụ tạo kênh hợp lệ (requestId minh họa):

```json
{
  "name": "Thảo luận",
  "type": "LIVE",
  "accessMode": "PRIVATE",
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

`accessMode: "RESTRICTED"`, ID dạng UUID ở channelId, thêm ownerId vào body hoặc sửa type bằng PATCH đều là VALIDATION_ERROR (400). Thiếu phiên: AUTH_REQUIRED (401); CSRF sai: CSRF_INVALID (403). Sai quyền với đích được phép biết: FORBIDDEN (403); đích không tồn tại/không được phép biết: NOT_FOUND (404). Revision cũ: CONFLICT (409), tải lại trạng thái trước khi thao tác tiếp. Lỗi DB/phụ thuộc: theo mã chung, không lộ query hoặc kết luận rollback khi commit chưa rõ.

## 2. Quyền server phải kiểm

| Tình huống                              | Quy tắc                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tạo Workspace                           | Có phiên hợp lệ; server gán chính người tạo làm OWNER                                            |
| Đổi tên Workspace, quản lý kênh/PRIVATE | OWNER/ADMIN có membership ACTIVE trong Workspace còn tồn tại                                     |
| Xóa Workspace, đổi role                 | Chỉ OWNER; không gỡ/hạ chính OWNER qua endpoint thành viên                                       |
| Loại thành viên                         | OWNER loại người khác; ADMIN chỉ loại MEMBER                                                     |
| Đọc/sử dụng WORKSPACE                   | Membership ACTIVE và Workspace/kênh còn tồn tại                                                  |
| Đọc/sử dụng PRIVATE                     | Thêm grant còn hiệu lực, đúng membershipIncarnation hiện tại; OWNER/ADMIN cũng không được bỏ qua |

Ví dụ admin ngoài danh sách PRIVATE có thể quản lý danh sách nhưng không mở chat/LIVE/tệp. Thành viên bị loại rồi tham gia lại có incarnation mới; grant cũ không hợp lệ. Role host không cấp quyền quản trị Workspace. Schema không tự thực hiện các quy tắc này; policy/provider SCRUM-27 kiểm chúng trên dữ liệu server hiện hành.

## 3. Các hàm nội bộ

### M1 cung cấp `ResolveChannelAccess` cho M2/M4

Nhận identity từ `requireAuth` và workspaceId/channelId đích. Trả `ChannelAccessSnapshot`: workspaceId, channelId, channelType, membershipId, membershipIncarnation, membershipRevision, channelRevision, canReadContent, canManageChannel.

Chỉ trả snapshot cho membership hiện hành trong Workspace còn tồn tại; thiếu membership/quyền biết đích thì trả lỗi theo mục 1. `canReadContent:false` cho phép UI quản trị phân biệt quyền quản lý; M2 phải từ chối nội dung khi false, M4 còn kiểm channelType=LIVE. Không nhận snapshot từ client làm bằng chứng quyền. Consumer kiểm lại identity/expiry/quyền hiện tại sau await và trước commit, publish, tạo/resume media hoặc fanout. Nếu đã tạo resource tạm mà lần kiểm lại từ chối hoặc ném lỗi, phải đóng resource bằng nhánh cleanup được bảo đảm (try/finally); chỉ chuyển ownership khi grant/publish thành công. Không nuốt lỗi resolver để tiếp tục cấp quyền. Không gọi resolver trả snapshot một lần rồi cache thành quyền vĩnh viễn.

### M2 cung cấp `CreateChannelConversation` cho M1

Nhận `workspaceId`, `channelId`, `conversationId`, `createdAt: Date` và `dbSession: ClientSession` từ transaction M1 trên cùng connection. Chữ ký khớp `GeneralConversationFactory<ClientSession>.create` trong SCRUM-14 (PR #41, commit `46a218f`); không truyền `channelType` vào factory. Caller M1 chỉ gọi cho kênh TEXT đã được kiểm ở service. Trả conversationId. M1 tạo Workspace + OWNER membership + general TEXT/WORKSPACE + conversation trong cùng transaction; kênh TEXT mới cũng có conversation tương ứng. LIVE dùng conversation theo phiên do M2/M4 quản lý, không gọi hàm TEXT này.

M1 chuẩn bị các ID và createdAt ở server trước callback transaction có thể được chạy lại; mọi lượt callback dùng lại cùng ID/thời gian, cùng dbSession của transaction. Không lấy createdAt từ client hoặc sinh lại conversationId trong callback. Khi kết quả commit chưa rõ, đọc lại theo bộ ID ổn định và đối chiếu đủ quan hệ trước khi quyết định thử lại; không tạo bộ ID mới để che kết quả chưa xác định.

M2 không tự commit/mở transaction khác hoặc phát event trong callback có thể retry. Lỗi thì ném về caller để hủy toàn bộ lần tạo; chỉ phát thông báo sau khi biết commit thành công. SCRUM-32 tích hợp factory thật với model M1 và kiểm transaction trong DB riêng; ma trận rollback/retry đầy đủ tiếp tục ở M1-T6.2. Xem [runbook tạo Workspace](../runbooks/workspace-creation.md).

### Thu quyền từ M1 tới M2/M4

`accessRevocationSchema` trong `workspace.ts` là schema dùng chung được đề xuất cho M1 và đầu vào thu quyền của M4. `AccessRevocation` là union strict gồm sáu loại, mỗi loại có operationId/revision và đúng tập ID:

| kind                   | Đích bắt buộc                                                       | revision dùng để đối chiếu                                 |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| AUTH_SESSION           | authSessionId                                                       | Phiên bản thao tác thu phiên do coordinator quản lý        |
| USER_AUTH_SESSIONS     | userId                                                              | Phiên bản thao tác thu tất cả phiên do coordinator quản lý |
| WORKSPACE_MEMBERSHIP   | workspaceId, userId, membershipId, membershipIncarnation            | Membership revision                                        |
| PRIVATE_CHANNEL_ACCESS | workspaceId, channelId, userId, membershipId, membershipIncarnation | Channel revision                                           |
| CHANNEL_DELETED        | workspaceId, channelId                                              | Channel revision                                           |
| WORKSPACE_DELETED      | workspaceId                                                         | Workspace revision                                         |

Theo góp ý PR #39, dùng tên `USER_AUTH_SESSIONS` và `PRIVATE_CHANNEL_ACCESS`; không nhận hai tên cũ `USER_SESSIONS`/`PRIVATE_CHANNEL`. M4 cần import `accessRevocationSchema` và alias thành `liveAccessRevocationSchema` thay vì khai báo lại union. PRIVATE vẫn bắt buộc `membershipId` và `membershipIncarnation`: coordinator đối chiếu lượt thành viên và revision cũ trước khi chọn runtime resource, không bỏ field chỉ để vượt strict schema. Chưa tương thích với nguyên trạng PR #39 (`f6979c9`) cho đến khi M4 nối schema chung; không coi kiểm local là M4 đã xác nhận. Schema cleanup runtime của M4 tiếp tục riêng vì có session/epoch/transition token và target đời kết nối.

Với `USER_AUTH_SESSIONS`, operation/revision phải gắn tập phiên bị thu đã được coordinator xác định; retry không chọn lại mọi phiên hiện có theo userId rồi đóng nhầm phiên đăng nhập mới. SCRUM-28 giữ cohort bất biến theo operation, cung cấp callback `revokedAuthSessions` cho M4; retry không query lại tập phiên.

revision là bản hiện tại khi bắt đầu thu, chưa phải revision sau commit. Hai loại auth cần M1-T5/M4-T1.2 xác nhận cách cấp bộ đếm ở coordinator; không thêm field DB trong task này. Adapter không dùng số này thay epoch/generation LIVE.

M1 điều phối: kiểm quyền/revision → chặn truy cập đích → gọi M2 ngừng chat/tệp và M4 rời LIVE/thu media-board → xác nhận thu quyền → lưu DB → đối chiếu kết quả. Không đóng kết nối ngoài phạm vi bị thu. Callback trễ/lặp phải kiểm operation và đời membership, không chạm tài nguyên mới của người đã được cấp lại quyền.

`AccessCleanupResult` trả operationId, permissionRevoked, pendingInvalidated, cleanupPending. Chỉ coi thu quyền hiệu lực khi hai cờ đầu đều true; cleanupPending có thể còn việc xóa byte/ref phía sau. Lỗi/timeout dùng cơ chế lỗi của coordinator, giữ deny và đối soát; không giả kết quả thành công. Không giữ transaction MongoDB khi chờ cleanup.

SCRUM-28 cung cấp coordinator nội bộ tự lấy/nhả shared gate, deny barrier và callback persistence Held theo [runbook](../runbooks/access-revocation.md). M2/M4 cleanup chạy ngoài gate, có budget/retry và watermark; callback nghiệp vụ chịu trách nhiệm authorize/CAS/read-back. Kiểm adapter giả không thay việc tích hợp runtime thật.

## 4. Contract shell/sidebar cho SCRUM-45

Type frontend tại `apps/web/src/features/workspaces/shell-contract.ts`; shared DTO vẫn ở contracts, không import React vào package chung.

| Prop                       | Nội dung / bên cung cấp                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `workspace`                | WorkspaceSummary hiện đang mở; M1 cung cấp                                                                         |
| `channels`                 | Danh sách SidebarChannel gồm ChannelSummary và quyền đọc/quản lý do server cung cấp; M1 chuyển thành projection UI |
| `panel`                    | `empty`, `text` hoặc `live`; hai loại có nội dung kèm channelId                                                    |
| `onSelectChannel(channel)` | Callback chọn kênh; shell không tự gọi API hoặc tạo cuộc gọi                                                       |
| `chatPanel`                | Slot chat do M2 cung cấp                                                                                           |
| `callPanel`                | Slot màn hình lobby/cuộc gọi do miền media cung cấp                                                                |
| `persistentCallControls`   | Slot điều khiển cuộc gọi còn hoạt động khi chuyển panel                                                            |

SCRUM-45 có thể dựng shell bằng fixture theo type này. Adapter chọn panel phải kiểm channelId thuộc Workspace hiện tại và type khớp TEXT/LIVE; danh sách chưa tải hoặc chưa có kênh thì dùng `empty`. Hiển thị loading/error của REST do data owner xử lý trước khi cấp props; đây không phải response GET list hay contract pagination.

`canManageChannel=true` không mở nội dung khi `canReadContent=false`: chỉ hiện thao tác quản lý phù hợp. Không hiển thị kênh mà actor không được phép biết. Server vẫn kiểm quyền mọi lần gọi; UI không tự suy quyền từ OWNER/ADMIN. M3/M4 giữ một call controller ngoài vòng đời panel; slot không sở hữu track/transport và chuyển panel không đồng nghĩa rời cuộc gọi. Khi thu quyền/đổi Workspace, data owner dọn dữ liệu và subscription cũ theo lifecycle, không chỉ đổi props để ẩn nội dung.

Chưa có component render hoặc call controller trong SCRUM-13; hợp đồng slot không thay contract join/media của M3/M4.

## 5. Bàn giao và phần còn mở

| Task nhận đầu ra | Phần dùng được sau review                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| SCRUM-26/27/30   | Input/DTO Workspace, channel, role và PRIVATE; task list bổ sung pagination                       |
| SCRUM-19         | Scope thu quyền, revision và kết quả cleanup; tiếp tục thiết kế gate/context                      |
| SCRUM-42         | Identity từ SCRUM-12 và snapshot quyền kênh; M2 bổ sung payload chat                              |
| SCRUM-82/83      | Snapshot cho join/recheck và scope thu quyền; M4 bổ sung runtime generation/context               |
| SCRUM-45         | WorkspaceShellProps, SidebarChannel, panel và slot chat/cuộc gọi; dựng fixture trước khi nối data |

Cần M2 xác nhận cùng connection/transaction và conversation TEXT; M4 xác nhận snapshot, sáu scope thu quyền và semantics revision. Pagination/limits list thuộc task endpoint; schema lưu invitation token theo SCRUM-30, mã hóa/giải mã và quản lý khóa thuộc task invitation; migration dữ liệu RESTRICTED thuộc task DB có kế hoạch riêng nếu có dữ liệu cũ. Không reset DB hoặc tự chuyển dữ liệu trong SCRUM-13.

Kiểm local gồm schema valid/invalid, field quyền giả, type/access độc lập, revision/ID sai, snapshot admin không có quyền nội dung, scope revoke thiếu/thừa ID, chữ ký consumer server và ví dụ M2 từ chối đọc / M4 kiểm lại quyền sau await / cleanup chưa hoàn tất. Các ví dụ dùng fixture, không gọi adapter thật. Đây là kiểm contract/type, chưa phải kiểm ACL, transaction, cleanup hoặc LIVE tích hợp thật.

## Điều phối User/Workspace — SCRUM-19

Cơ chế khóa RAM và context server dùng chung được mô tả tại
[runbook điều phối](../runbooks/operation-coordination.md). M1/M2/M4 dùng cùng
instance, khai báo scope ban đầu theo thứ tự baseline; context chỉ giữ User có thể
dùng `withWorkspace` để xử lý các Workspace lần lượt, giữ User suốt thao tác;
context khóa không thay ACL hoặc deny barrier. Channel/session queue thật và
coordinator thu quyền tiếp tục ở task tương ứng.

## Policy thực thi — SCRUM-27

`createWorkspaceAccessService` thực thi resolver và kiểm action Workspace; xem
[composition, bảng ca và giới hạn](../runbooks/workspace-access.md). Provider đọc
phiên/membership/channel/grant trong snapshot transaction mới, dùng cùng coordinator
User → Workspace; hàm `Held` cho service đã giữ gate. Consumer vẫn phải từ chối nội
dung khi `canReadContent:false`, kiểm lại sau await và giữ cleanup khi resolver ném
lỗi. Chưa thay provider DM hoặc policy runtime phiên/nhóm, chưa là deny barrier.
