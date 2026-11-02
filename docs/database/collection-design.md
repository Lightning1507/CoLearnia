# Bước 4 — Thiết kế collection và document MongoDB

**Trạng thái:** thiết kế kỹ thuật để review ngày 01/11/2026, trong phạm vi bước 4 đã được giao. Chưa tạo Mongoose schema, đổi Zod, tạo index hoặc chạy migration/seed/DB. Quy tắc sản phẩm lấy từ [messaging](../product/messaging.md), [group modes](../product/group-modes.md) và [live session](../product/live-session.md); mô hình này không giải quyết thay các điểm nghiệp vụ còn mở.

Đầu vào: [46 UC ↔ dữ liệu](uc-data-map.md), [16 khái niệm](conceptual-model.md), [nơi lưu/vòng đời bước 3](lifecycle.md). [Model](model.md) giữ mục lục và các ràng buộc baseline; tài liệu này sở hữu cấu trúc document đích. [Bước 5](integrity-and-migrations.md) đặc tả index/options, validation, concurrency và kế hoạch migration/kiểm thử; chưa triển khai thực thi.

## 1. Các lựa chọn thiết kế

- Giữ 12 collection nền và bổ sung **channelAccessGrants**, thay mảng allowedUserIds bằng quan hệ có vòng đời gắn membership. Đây là biểu diễn UC-WS-15, không thêm chức năng/quyền mới.
- Tham chiếu những tập tăng lâu dài: thành viên, kênh, hội thoại, tin nhắn, file và metadata tham gia phiên. Không nhúng toàn bộ tin/reply/member/session vào document cha.
- Nhúng cấu trúc nhỏ có giới hạn: hai bên hội thoại riêng, tối đa 4 attachment IDs/tin theo cấu hình khởi đầu, scope/binding tệp và target audit. Không nhúng byte file, media objects, board/stroke hoặc toàn lịch sử thay host.
- Một membership được tái kích hoạt tại cùng cặp Workspace/user, có **incarnation** tăng sau khi đã bị loại. Grant PRIVATE phải khớp incarnation hiện tại; rejoin mở DM theo membership nhưng không phục hồi grant cũ.
- Mỗi upload bind vào **một message hoặc một frame context**. Không tái dùng một fileId cho nhiều tin hoặc vừa chat vừa board; retry cùng lệnh trả binding cũ. Ảnh canvas gửi chat là một tài nguyên attachment riêng.
- HOST_PRIVATE tái dùng cùng cặp user trong cùng LiveSession, không gắn vai trò host động vào ACL; đổi host không đổi participants của hội thoại cũ. Đây là lựa chọn khóa lưu trữ cho hành vi hai bên ban đầu, không cho host mới đọc lịch sử người trước.

Cách chọn nhúng/tham chiếu dựa vào quan hệ, truy vấn và mức tăng dữ liệu; tham chiếu phù hợp với tập con lớn hoặc tăng không giới hạn. [MongoDB data modeling](https://www.mongodb.com/docs/manual/data-modeling/best-practices/), [tránh mảng không giới hạn](https://www.mongodb.com/docs/manual/data-modeling/design-antipatterns/unbounded-arrays/). Việc tách channelAccessGrants và incarnation là thiết kế CoLearnia, không phải yêu cầu MongoDB.

## 2. Quy ước field

| Ký hiệu            | Ý nghĩa                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Id                 | BSON ObjectId cho document bền vững và foreign reference; API trả chuỗi hex, không trả object Mongoose                 |
| RuntimeId          | UUID chuỗi cho epoch/group/round/board/intent; không giả làm foreign key tới collection không tồn tại                  |
| Date               | BSON Date, thời điểm UTC do server gán; API serialize ISO 8601                                                         |
| Int                | BSON numeric với giá trị nguyên an toàn (type writer theo integrity); revision/count/byte size không dùng số thập phân |
| T hoặc null        | Field có mặt nhưng chưa có giá trị trong trạng thái hiện tại; không trộn null/missing tùy tiện                         |
| Cấu trúc theo loại | Field con chỉ có ở đúng loại; loại khác không được gửi/lưu field đó, không dùng object Mixed tự do                     |

Mỗi collection có _id: Id và createdAt: Date. Collection thay đổi có updatedAt: Date; nội dung messages chỉ thêm mới (replyCount của root được cập nhật), auditEvents append-only; hai collection này chỉ cần createdAt. Field trong các bảng là field lưu ngoài bộ chung này. ID do media adapter cấp giữ định dạng của adapter, không ép thành document Id hoặc nhầm với callGeneration/revision dạng Int. Reference không tự là foreign key được MongoDB kiểm; service phải kiểm tồn tại, cùng Workspace/scope và quyền.

Các giá trị enum bên dưới là **đích thiết kế**, chưa phải schema đã export. Dữ liệu nhập được kiểm strict ở biên; các giới hạn đã có tại [plan 13](../technical-plan.md#13-bảo-mật-giới-hạn-và-retention) được dùng lại, không đặt thêm giới hạn sản phẩm bằng phỏng đoán.

**Khoảng cách với scaffold:** packages/contracts/src/common.ts hiện chấp nhận resourceId là chuỗi 1–128, requestId là UUID; lựa chọn Id không mâu thuẫn nhưng chưa được schema kiểm đúng định dạng. packages/contracts/src/workspace.ts còn enum RESTRICTED, session.ts còn FREE/MODERATED: phải sửa theo PRIVATE/một kiểu cuộc họp trong task contracts trước consumer nghiệp vụ. Không sửa code/schema chỉ từ tài liệu này.

## 3. Danh mục 13 collection

| Collection          | Khái niệm / UC sở hữu            | Nhúng hay tham chiếu                             |
| ------------------- | -------------------------------- | ------------------------------------------------ |
| users               | E01 · ACC-01/02                  | Không nhúng Workspace/membership                 |
| authSessions        | Hỗ trợ ACC-02/03                 | userId, độc lập từng phiên xác thực              |
| workspaces          | E02 · WS-01/03/04/11             | ownerId; không mảng member/channel               |
| memberships         | E03 · WS-07/09/10/11             | workspaceId + userId, role và incarnation        |
| invitations         | E04 · WS-05/06/07                | workspaceId, người tạo; không mảng người đã nhận |
| channels            | E05 · WS-12/13/14                | workspaceId; không mảng quyền/tin nhắn           |
| channelAccessGrants | Quan hệ E05–E03 · WS-15          | channelId + membershipId + incarnation           |
| conversations       | E06 · MSG/LIVE chat              | Scope theo kind; private nhúng cặp cố định       |
| messages            | E07 · MSG-01/04/06, LIVE-08/09   | conversation/root/file references                |
| files               | E08/E15 · MSG-08, gửi/chụp frame | Metadata + scope/binding nhỏ; byte ngoài DB      |
| liveSessions        | E09 · LIVE-01/10, GRP-01         | channel/host refs; không mảng group/round        |
| sessionParticipants | E10 · LIVE-01/02, GRP-04/07/08   | session/user refs, metadata hiện diện gần nhất   |
| auditEvents         | Hỗ trợ các thao tác kiểm soát    | Target có kiểu, không nội dung private           |

E11 Request, E12 Group, E13 Round, E14 Board và E16 Stroke vẫn thuộc RAM; E15 dùng files, không có collection frame. Thread không có collection riêng. Auth/audit/grant không đòi thêm UC CRUD.

### 3.1. users

| Field           | Kiểu / điều kiện         | Ý nghĩa                                                                |
| --------------- | ------------------------ | ---------------------------------------------------------------------- |
| emailNormalized | String bắt buộc          | Khóa email đăng nhập; normalization thống nhất trong auth service      |
| passwordHash    | String bắt buộc, private | Hash có tham số của implementation được chọn; không trả API/log        |
| displayName     | String bắt buộc          | Tên hiển thị hiện tại, không snapshot lặp vào từng tin                 |
| status          | ACTIVE / DISABLED        | Hiệu lực xác thực theo baseline; không bổ sung màn hình khóa tài khoản |

Không thêm avatar/profile settings hoặc chức năng đổi email/password từ thiết kế này. Thư viện/hash parameters vẫn chờ task auth; không ghi giá trị giả vào schema.

### 3.2. authSessions

| Field     | Kiểu / điều kiện | Ý nghĩa                                        |
| --------- | ---------------- | ---------------------------------------------- |
| userId    | Id → users       | Chủ phiên xác thực                             |
| tokenHash | String, private  | Không lưu token cookie nguyên bản              |
| expiresAt | Date bắt buộc    | Hạn tuyệt đối kiểm mỗi lần dùng, không chờ TTL |
| revokedAt | Date hoặc null   | Logout/rotate/revoke làm phiên cũ không hợp lệ |

Không lưu socket IDs/media objects. Revoke phải lan tới runtime do phiên này sở hữu theo auth/call policy; relationship runtime không là danh tính User mới. Dọn metadata theo lifecycle; TTL cụ thể thiết kế ở bước 5.

### 3.3. workspaces

| Field     | Kiểu / điều kiện | Ý nghĩa                                                            |
| --------- | ---------------- | ------------------------------------------------------------------ |
| name      | String bắt buộc  | Theo input Workspace, không đặt thêm quy tắc tên ở DB              |
| ownerId   | Id → users       | Owner duy nhất của Workspace; phải khớp membership OWNER hiện hành |
| revision  | Int ≥0           | Phiên bản mutation của Workspace/owner                             |
| deletedAt | Date hoặc null   | Tombstone khóa truy cập; không là restore feature                  |

Không unique ownerId trên toàn collection. Tạo Workspace/general/membership/conversation và transfer owner phải nhất quán theo lifecycle; index/transaction thực thi ở bước 5.

### 3.4. memberships

| Field               | Kiểu / điều kiện       | Ý nghĩa                                              |
| ------------------- | ---------------------- | ---------------------------------------------------- |
| workspaceId, userId | Id → workspaces/users  | Một document theo cặp                                |
| role                | OWNER / ADMIN / MEMBER | Vai trò hiện tại; REMOVED không cho dùng role cũ     |
| status              | ACTIVE / REMOVED       | Hiệu lực membership                                  |
| incarnation         | Int ≥1                 | Tăng đúng một lần khi REMOVED → ACTIVE; lần đầu là 1 |
| revision            | Int ≥0                 | CAS cho thay đổi quyền; khác incarnation             |
| joinedAt            | Date                   | Lần gia nhập hiện tại; rejoin cập nhật               |
| removedAt           | Date hoặc null         | Được gán khi bị loại; rejoin đặt null                |

Mọi thay đổi role/status, kick và rejoin đều tăng revision bằng CAS; đổi role/transfer owner tăng revision, **không tăng incarnation** và không tự làm mất PRIVATE hợp lệ. Người đã ACTIVE nhận lời mời lại không tăng incarnation hoặc tốn lượt. User/Workspace không hợp lệ vẫn chặn truy cập dù status ACTIVE.

Không nhúng membershipIds vào User. Tombstone membership phải còn đủ để phân biệt các lần gia nhập, không xóa rồi tạo lại cùng version làm grant cũ sống lại; kế hoạch purge Workspace sẽ xử lý refs đồng bộ.

### 3.5. invitations

| Field                        | Kiểu / điều kiện      | Ý nghĩa                                         |
| ---------------------------- | --------------------- | ----------------------------------------------- |
| workspaceId, createdByUserId | Id → workspaces/users | Phạm vi và actor phát hành                      |
| tokenHash                    | String, private       | Tra link mà không lưu token raw                 |
| expiresAt                    | Date                  | Hết hạn kiểm server                             |
| revokedAt                    | Date hoặc null        | Thu hồi chặn nhận mới                           |
| maxUses                      | Int >0                | Giới hạn lượt của link theo baseline            |
| uses                         | Int ≥0                | Lượt nhận thành công, không tính user đã ACTIVE |

Hết hạn/hết lượt là trạng thái suy từ field, không giữ enum EXPIRED có thể lệch thời gian. Không giới hạn link vào đúng một email hoặc thêm lịch sử người nhận nếu chưa có nhu cầu UC. Retry/concurrency nhận lời mời thiết kế ở bước 5.

### 3.6. channels

| Field       | Kiểu / điều kiện    | Ý nghĩa                                                       |
| ----------- | ------------------- | ------------------------------------------------------------- |
| workspaceId | Id → workspaces     | Phạm vi kênh                                                  |
| type        | TEXT / LIVE         | Bất biến                                                      |
| name        | String              | Tên hiện hành, general là tên khởi tạo                        |
| order       | Int ≥0              | Sắp thứ tự hiển thị theo khung baseline; chưa thêm UC kéo thả |
| accessMode  | WORKSPACE / PRIVATE | Không đổi sau tạo trong bản đầu                               |
| revision    | Int ≥0              | Mutation cấu hình/quyền kênh                                  |
| deletedAt   | Date hoặc null      | Xóa khóa cả nội dung/phiên liên quan                          |

Không lưu allowedUserIds song song với grant vì sẽ có hai nguồn quyền. WORKSPACE không cần grant cho từng thành viên. TEXT tra conversation CHANNEL theo channelId; LIVE tra phiên ACTIVE/ENDING theo channelId, không nhúng lịch sử phiên.

### 3.7. channelAccessGrants

| Field                 | Kiểu / điều kiện      | Ý nghĩa                                                            |
| --------------------- | --------------------- | ------------------------------------------------------------------ |
| workspaceId           | Id → workspaces       | Phục vụ tra/reconcile theo Workspace; phải khớp channel/membership |
| channelId             | Id → channels PRIVATE | Không tạo grant cho WORKSPACE                                      |
| membershipId          | Id → memberships      | Tư cách của người được cấp trong Workspace                         |
| membershipIncarnation | Int ≥1                | Bản incarnation được cấp, phải khớp membership hiện tại            |
| grantedByUserId       | Id → users            | Owner/admin thực hiện lần cấp hiện hành                            |
| grantedAt             | Date                  | Lần thêm/cấp lại hiện hành                                         |
| revokedAt             | Date hoặc null        | Gỡ khỏi kênh; cấp lại cập nhật version/grantedAt và đặt null       |

Một document theo cặp channelId/membershipId; cấp lại cập nhật document này, không lưu mảng lịch sử. Mutation add/remove/re-add thực sự thay quyền phải tăng channels.revision cùng transaction với grant; retry không đổi quyền không tăng lại chỉ vì lặp request. Quyền đọc cần đồng thời: Workspace/kênh sống + membership ACTIVE + grant chưa revoke + incarnation khớp. Owner/admin quản lý danh sách không bỏ qua điều kiện đọc. History PRIVATE cũ vẫn đọc được sau khi **được cấp lại**, theo vòng đời hội thoại.

Ví dụ: membership incarnation 1 có grant version 1; bị loại → REMOVED nên bị chặn ngay; rejoin → incarnation 2, grant version 1 vẫn không hợp lệ; owner/admin thêm lại → grant version 2. Không phải đổi userId hoặc xóa DM để đạt quy tắc này. Cleanup grant cũ là tối ưu sau deny, không được coi việc xóa nhiều grant là điều kiện duy nhất ngăn tự phục hồi.

### 3.8. conversations

Field chung ngoài bộ timestamps:

| Field       | Kiểu / điều kiện                                  | Ý nghĩa                                          |
| ----------- | ------------------------------------------------- | ------------------------------------------------ |
| workspaceId | Id                                                | Phạm vi cho mọi kind                             |
| kind        | CHANNEL / DIRECT / SESSION / GROUP / HOST_PRIVATE | Quyết định scope và ACL                          |
| scope       | Cấu trúc theo bảng dưới                           | Tham chiếu đích thực, server xác lập             |
| closedAt    | Date hoặc null                                    | Đã khóa theo vòng đời, không tự mở lại           |
| purgeAt     | Date hoặc null                                    | Hạn dọn khi đã đóng; không coi TTL là kiểm quyền |

| kind         | scope bắt buộc                                                                           | Field không được có / điều kiện                                          |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| CHANNEL      | channelId: Id                                                                            | Kênh TEXT; không session/group/participants                              |
| DIRECT       | participantUserIds: [Id, Id], thứ tự chuẩn hóa, hai user khác nhau                       | Không channel/session/group; duy nhất cặp trong Workspace                |
| SESSION      | channelId: Id, sessionId: Id                                                             | Kênh LIVE và MAIN của phiên; không roster                                |
| GROUP        | channelId: Id, sessionId: Id, groupId: RuntimeId                                         | Group thuộc runtime của chính phiên; groupId không FK MongoDB            |
| HOST_PRIVATE | channelId: Id, sessionId: Id, participantUserIds: [Id, Id] chuẩn hóa, hai user khác nhau | Hai bên ban đầu, không thay bằng hostUserId hiện hành; không group scope |

DIRECT và HOST_PRIVATE bổ sung **scope.pairKey: String**, server tính bằng hai ObjectId hex lowercase đã sắp thứ tự, nối bằng dấu “:”. Giá trị phải khớp participantUserIds; unique dùng scalar pairKey, không unique mảng participants. Đây là điều chỉnh kỹ thuật ở [bước 5](integrity-and-migrations.md).

Một CHANNEL/kênh TEXT, một SESSION/phiên, một GROUP/group, một HOST_PRIVATE/cặp/phiên. Với HOST_PRIVATE, server vẫn kiểm người nhận là host hiện tại **khi bắt đầu/gửi tin hướng tới host**; reply/hội thoại cũ chỉ có hai bên theo policy. Việc host đổi rồi quay lại đúng cặp dùng cùng hội thoại nếu còn mở; host mới có cặp khác. Không tự gửi tin cho người từng là host khi UI đã chọn host hiện tại.

DIRECT khóa truy cập khi một trong hai mất membership nhưng không đặt closedAt chỉ vì kick; khi cả hai hợp lệ lại đọc history cũ. CHANNEL mất quyền của một người cũng không đóng hội thoại cho mọi người. Xóa kênh/Workspace mới đóng phạm vi bền tương ứng; meeting đóng theo phiên/nhóm. Không lưu lastMessage preview chứa nội dung private trong danh sách Workspace chung.

### 3.9. messages

| Field           | Kiểu / điều kiện                      | Ý nghĩa                                                                    |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| conversationId  | Id → conversations                    | Scope duy nhất của tin, không lặp Workspace/group refs                     |
| senderId        | Id → users                            | Server gán từ auth                                                         |
| clientMessageId | UUID String                           | Khóa retry của người gửi trong conversation                                |
| text            | String, có thể rỗng nếu có attachment | Giới hạn 4.000 ký tự khởi đầu theo plan; không nhận tin trống cả text/file |
| attachmentIds   | Id[] → files, 0–4 khởi đầu            | Mỗi file READY bind đúng chính tin này                                     |
| rootMessageId   | Id → messages hoặc null               | Null là root; reply chỉ CHANNEL/TEXT cùng conversation                     |
| replyCount      | Int ≥0, chỉ root CHANNEL              | Counter hiển thị; insert reply/dedupe cập nhật nhất quán                   |

Không nhúng replies vào root. Root không được trỏ vào reply, không thread DIRECT/meeting. Message identity/createdAt gán trước commit; cursor theo createdAt + _id để thứ tự ổn định khi cùng thời điểm, root/replies có truy vấn riêng. Không dựa ObjectId đơn lẻ để suy quyền hoặc thời điểm nghiệp vụ.

Không lưu displayName snapshot, read receipt, typing, reaction, editedAt/deletedAt vì chưa có UC tương ứng. Purge đi theo conversation, không thêm purgeAt trên mọi message thành hai nguồn retention; job dùng trạng thái/hạn của cha và xóa theo lô cùng file refs.

### 3.10. files

| Field                   | Kiểu / điều kiện                            | Ý nghĩa                                                                                              |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| workspaceId, uploaderId | Id → workspaces/users                       | Phạm vi và chủ upload do server gán                                                                  |
| storageKey              | String, private                             | Khóa ngẫu nhiên trong kho private, không là public URL                                               |
| originalName            | String hoặc null                            | Tên tải xuống đã chuẩn hóa; frame không cần tên người dùng                                           |
| purpose                 | ATTACHMENT / FRAME                          | Chặn đổi mục đích để vượt ACL                                                                        |
| mimeType                | String hoặc null khi chưa kiểm xong         | MIME thực được xác minh; không tin header client                                                     |
| byteSize                | Int ≥0 hoặc null khi chưa upload xong       | Kích thước thực đã kiểm; không nhét byte vào document                                                |
| reservedBytes           | Int ≥0                                      | Chỗ quota đang giữ khi STAGED; commit/release phải tính đúng một lần                                 |
| dimensions              | { width: Int >0, height: Int >0 } hoặc null | Bắt buộc cho ảnh/frame đã xác minh; null cho file không ảnh                                          |
| state                   | STAGED / READY / DELETE_PENDING             | Trạng thái lưu trữ/cleanup, không là quyền đọc                                                       |
| scope                   | Cấu trúc theo loại ở dưới                   | Scope cấp upload và quyền hiện tại                                                                   |
| authorization           | Cấu trúc bắt buộc, server gán               | Snapshot version khi cấp upload; dùng chặn commit cũ, không là quyền download                        |
| binding                 | Cấu trúc theo loại hoặc null                | Null khi chưa bind; READY phải có binding hợp lệ                                                     |
| expiresAt               | Date hoặc null                              | Hạn STAGED theo lifecycle; null sau bind thành công; không tự TTL xóa mất cleanup metadata           |
| cleanupAfter            | Date hoặc null                              | Hạn dọn sau bỏ dở/đóng hội thoại/hết frame refs; null khi chưa đủ điều kiện; kiểm refs lại trước xóa |

- authorization = { memberships: [{ membershipId: Id, incarnation: Int ≥1, revision: Int ≥0 }], channel: { channelId: Id, revision: Int ≥0 } hoặc null }. Mảng memberships có đúng tư cách uploader; DIRECT có thêm đúng tư cách bên kia (tổng hai, sắp theo membershipId, không trùng). Channel bắt buộc với CHANNEL/SESSION/GROUP/HOST_PRIVATE và FRAME, null với DIRECT. Các refs phải khớp conversation/Workspace/uploader, không do client chọn. STAGED reserve/hoàn tất/bind kiểm phiên bản hiện tại dưới gate và expiresAt > now; khác phiên bản hoặc hết hạn thì hủy/dọn, yêu cầu upload mới, không tự cập nhật stamp để cứu request cũ. Đổi role hoặc revision kênh dù còn quyền cũng có thể yêu cầu upload lại: lựa chọn bảo thủ cho bản đầu. READY giữ stamp để đối chiếu nhưng download chỉ dùng ACL hiện tại; thêm lại vẫn đọc lịch sử còn lưu như nghiệp vụ đã chốt. Frame kiểm thêm intent/epoch/context runtime, không chỉ stamp DB.
- ATTACHMENT: scope = { conversationId: Id }; binding = { kind: MESSAGE, messageId: Id }. Conversation quyết định text/ảnh/file hay chỉ ảnh, audience, đóng/purge; file của reply cũng bind chính reply đó.
- FRAME: scope = { sessionId: Id, epoch: RuntimeId, boardId: RuntimeId, contextVersion: Int, groupId: RuntimeId }; binding = { kind: BOARD_FRAME, intentId: RuntimeId }. FRAME chỉ thuộc DISCUSSION/ACTIVITY, groupId bắt buộc; MAIN không freeze nên không có FRAME; board/context/intent phải còn hợp lệ trong runtime. Nguồn/source revision được kiểm bằng intent/board runtime; không suy source hoặc quyền chỉ từ metadata file.
- Khi resume/đóng scope làm hết ref: thu quyền bằng runtime trước, cập nhật lịch dọn; file đang được board dùng không bị dọn chỉ vì createdAt cũ. Sau crash bootstrap đóng đời runtime cũ rồi sweep đối chiếu refs.
- Một file chỉ bind một đích; message có 0..4 file theo cấu hình khởi đầu, một frame dùng một file ảnh. Muốn gửi ảnh từ canvas qua chat đi luồng upload attachment riêng, không đổi purpose/scope/binding của frame đang dùng.
- Upload STAGED không là tệp thành công để download. Orphan hoặc DELETE_PENDING vẫn giữ storageKey/scope đủ để job xóa byte idempotent trước khi xóa metadata. Không dùng TTL files như cách duy nhất dọn disk.
- Byte quota Workspace và quota tạm phiên khác nhau; reservedBytes không là tính năng quota mới. [Bước 5](integrity-and-migrations.md) chọn aggregate file metadata/reservation dưới Workspace gate của một process, đối chiếu disk sau crash; chưa là thuật toán đã kiểm chứng.

Các cấu trúc scope/binding ở đây thay field accessRef tổng quát của khung cũ bằng cấu trúc có kiểu; không giữ cả hai bản authority. Validator + transition checks cho STAGED/READY/DELETE_PENDING lấy tại integrity; không để client tùy ý patch. Download đang mở phải được đăng ký để revoke/expiry hủy stream mà không giữ gate suốt lượt tải; byte đã gửi không thể thu hồi.

### 3.11. liveSessions

| Field                  | Kiểu / điều kiện        | Ý nghĩa                                                                                               |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| workspaceId, channelId | Id                      | Kênh LIVE còn hợp lệ, Workspace phải khớp                                                             |
| epoch                  | RuntimeId               | Đời phiên; command cũ không áp phiên khác                                                             |
| hostUserId             | Id hoặc null            | Metadata host hiện hành; null chỉ khi không còn host hợp lệ/đã kết thúc, không là cơ chế tự nhận host |
| status                 | ACTIVE / ENDING / ENDED | Không mode FREE/MODERATED                                                                             |
| revision               | Int ≥0                  | Phiên bản metadata DB cho lifecycle/host                                                              |
| startedAt              | Date                    | Tạo phiên mới                                                                                         |
| endedAt                | Date hoặc null          | Khi ENDED; không tự xóa kênh                                                                          |

Một phiên ACTIVE/ENDING mỗi kênh theo baseline. policyRevision, phase, host tạm/đích hoàn quyền, help, nhóm, round/deadline và source leases là **runtime**, không coi revision DB là mọi policyRevision của phiên. Chuyển host phải cập nhật metadata/runtime có kiểm quyền và reconcile theo lifecycle; cách CAS/commit cụ thể ở bước 5.

hostUserId phải tương ứng participant hợp lệ khi giữ quyền. Null không tự quyết định nhánh không có ứng viên hoặc host tạm mất mạng; hai nhánh đó vẫn cần chốt tại nguồn. Không phục hồi phiên ACTIVE từ DB sau process restart.

### 3.12. sessionParticipants

| Field             | Kiểu / điều kiện                                                  | Ý nghĩa                                                      |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| sessionId, userId | Id → liveSessions/users                                           | Một document theo cặp                                        |
| joinedAt          | Date                                                              | Lần join hợp lệ gần nhất trong phiên                         |
| leftAt            | Date hoặc null                                                    | Lần rời/thu quyền; reconnect trong grace không nhân document |
| lastScope         | { kind: MAIN } hoặc { kind: GROUP, groupId: RuntimeId } hoặc null | Metadata vị trí gần nhất đã hoàn tất; không là grant         |
| lastScopeAt       | Date hoặc null                                                    | Thời điểm metadata trên được ghi                             |

_id có thể dùng làm participantId ổn định trong phiên; callGeneration/socket/current transition vẫn runtime. Trong lúc đổi phạm vi hoặc metadata chậm, server dùng state đang chuyển/deny barrier, không dùng lastScope cấp quyền. Không persist từng heartbeat, track hoặc source; không lưu roster người cùng nhóm trong document này.

### 3.13. auditEvents

| Field                  | Kiểu / điều kiện                 | Ý nghĩa                                                       |
| ---------------------- | -------------------------------- | ------------------------------------------------------------- |
| actorUserId            | Id hoặc null                     | Null khi tác vụ hệ thống                                      |
| action                 | String có danh mục trong service | Thao tác auth/quyền/lifecycle có ý nghĩa                      |
| workspaceId, sessionId | Id hoặc null                     | Scope liên quan, không suy quyền tra cứu audit                |
| target                 | { kind: String, id: String }     | Loại/ID đích; RuntimeId có thể là đích mà không có collection |
| requestId              | UUID String hoặc null            | Liên kết thao tác; tác vụ tự động có thể không request client |
| revision               | Int ≥0 hoặc null                 | Phiên bản liên quan nếu có                                    |
| outcome                | SUCCEEDED / DENIED / FAILED      | Kết quả, không dump payload lỗi                               |

Không có metadata object tùy ý chứa chat/token/mục đích nhóm. Chưa có UC xem audit hoặc chính sách retention số ngày; không thêm các mục đó từ field này. Thao tác nào phải ghi atomically với DB và event nào ghi sau runtime reconcile được chốt ở bước 5.

## 4. Truy vấn chính định hình document

| Nhu cầu / UC                       | Truy vấn và join logic                                                                    | Điều kiện trước khi trả dữ liệu                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Workspace của tôi · WS-02          | memberships theo userId/status ACTIVE → workspaces còn sống                               | User/auth hợp lệ; không lấy quyền từ ownerId trên Workspace khác                               |
| Danh sách thành viên · WS-08       | memberships theo workspace/status → projection users                                      | Actor có membership; không trả hash/session tokens                                             |
| Kênh truy cập được · MSG/LIVE join | channels theo Workspace; WORKSPACE hoặc PRIVATE có grant khớp membership/incarnation      | Không trộn danh sách quản trị với quyền đọc nội dung                                           |
| Quản lý PRIVATE · WS-15            | Channel + memberships hiện tại + grants; cập nhật một grant                               | Actor owner/admin; đích ACTIVE cùng Workspace; cập nhật revision/deny khi revoke               |
| Mở/list DM · MSG-04/05             | DIRECT theo Workspace/cặp chuẩn hóa hoặc cặp chứa actor; kiểm cả hai membership           | Không cần runtime phiên; rejoin giữ cùng conversation                                          |
| History kênh · MSG-02              | messages theo conversationId/rootMessageId null + cursor createdAt/_id                    | CHANNEL/TEXT và channel ACL hiện tại                                                           |
| Thread · MSG-06                    | Root cùng conversation → replies rootMessageId + cursor; replyCount ở root                | Root thực sự là root; không truy vấn chéo hội thoại                                            |
| Gửi/retry · MSG/LIVE               | Dedupe conversationId/senderId/clientMessageId; insert message và bind files              | ACL tại commit/fanout; retry không tăng replyCount hoặc chiếm file lần nữa                     |
| Join LIVE · LIVE-01                | Channel/access → liveSessions ACTIVE/ENDING; participation theo session/user              | User call ownership, epoch và runtime hợp lệ; tránh phiên/host trùng                           |
| Chat cuộc họp · LIVE-08/09         | Conversation theo session/group/cặp, history DB                                           | MAIN/group/help/two-party ACL theo runtime, open/ACTIVE; không cấp từ refs DB đơn lẻ           |
| Tải frame/file · BOARD/MSG-08      | files → conversation hoặc BoardRuntime/context                                            | state/binding hợp lệ + ACL + chưa bị deny/cleanup; URL biết trước không đủ                     |
| Dọn dữ liệu · lifecycle            | Conversation đã đóng/purgeAt; files STAGED/DELETE_PENDING/hết refs; session cũ theo epoch | Recheck ref đang dùng, xóa byte và metadata theo thứ tự retry được; không quét nội dung để log |

Đây là query shape; [integrity](integrity-and-migrations.md) sở hữu danh sách index/options hiện hành. Chạy explain trên fixture khi triển khai; bảng query không tự chứng minh index đã tối ưu. Mongoose unique không là validator; validate model không chứng minh chống race hoặc đúng ACL. [Mongoose validation](https://mongoosejs.com/docs/validation.html).

## 5. Nhất quán và đối chiếu bước 5

| Ràng buộc                      | Các document/runtime liên quan                                        | Điều không được suy ra                                                                    |
| ------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Một owner/Workspace            | Workspace + hai memberships khi transfer                              | Không unique ownerId toàn hệ thống                                                        |
| Nhận invitation/rejoin         | Invitation + membership incarnation                                   | Retry không tăng incarnation/lượt lần hai; rejoin không hồi PRIVATE                       |
| Thu quyền PRIVATE              | Membership/grant/channel revision + deny/runtime                      | Không chỉ ẩn kênh hoặc chờ job xóa grant cũ                                               |
| Một hội thoại theo scope       | Conversation theo kind và khóa scope                                  | Không unique một channelId cho cả CHANNEL lẫn mọi cuộc họp của LIVE                       |
| Một tin khi retry              | Message + file binding + root counter                                 | Không coi validator unique hoặc một client ack là exactly-once toàn mạng                  |
| Một session còn hoạt động/kênh | LiveSession + channel lifecycle lock + Router                         | Không unique channelId toàn lịch sử phiên                                                 |
| Purge nội dung/byte            | Conversation + messages + files + kho tệp                             | Không TTL cha trước khi mất scope/storage refs cần dọn; không xóa frame runtime đang dùng |
| Kết thúc runtime cũ            | LiveSession/participant metadata + private conversations/frame scopes | Không phục hồi grant/media/group/board qua lastScope/hostUserId                           |

[Bước 5](integrity-and-migrations.md) đã đặc tả validator theo kind, required/null/default, reference consistency, normalization và giới hạn có nguồn; index/dedupe/CAS/transaction/deny barrier; giữ quota khi upload; thứ tự purge; migration kiểm tra dữ liệu cũ và rollback. Không mặc định mọi invariants đều giải bằng transaction hoặc chỉ một unique index.

Chưa tự chọn thư viện hash, retention audit/metadata phiên hoặc nhánh host nhiều sự cố. Cấu trúc invitation/link và field names là thiết kế hiện tại, không tạo chức năng mời theo email, read receipt, library hoặc khôi phục buổi học sau restart. Cấu hình media/capacity vẫn cần PoC; không suy từ schema rằng lớp 40–50 người đã được hỗ trợ.

## Capacity sau review vận hành ngày 01/11

Giữ field/13 collection hiện tại. [Capacity](../capacity.md) chọn 25 làm mốc thử trước, 50 mở rộng; [integrity 4.4](integrity-and-migrations.md#44-cổng-kiểm-chứng-trước-công-bố-capacity) giữ gate/aggregate/stamp bảo thủ trong MVP và quy định cổng đo trước tối ưu. Chưa thêm quota counter hoặc version grant mới; 20 MiB frame/session chưa chứng minh phù hợp profile lớn. Schema implementation phải kiểm query count, bounded queues và stamp ảnh hưởng upload người không liên quan; không coi review tài liệu là capacity đạt.

## 6. Tiêu chí review bước 4

- Đủ 13 collection và nguồn UC/khái niệm; không bỏ collection baseline hoặc tạo collection cho mọi E11–E16.
- Không mảng member/message/reply tăng vô hạn; cặp private và attachment IDs có giới hạn rõ.
- PRIVATE qua kick/rejoin, thread và hai bên HOST_PRIVATE biểu diễn được bằng field/quan hệ đã mô tả.
- File có purpose/scope/binding, byte nằm ngoài MongoDB; frame khác attachment; xóa metadata không làm mất đường dọn byte.
- Metadata phiên/participant phân biệt với runtime; mỗi UC ở bước 1 đọc/ghi được qua collection hoặc runtime tương ứng.
- Bước này kiểm tài liệu/độ phủ/liên kết; chưa có test MongoDB, validator/index hoặc migration thực thi từ đầu ra này.

Đặc tả index/validation/concurrency và kế hoạch migration/test hiện hành ở [bước 5](integrity-and-migrations.md). Các ghi chú “ở bước 5” phía trên là ranh giới nguồn: không có nghĩa còn thiếu đặc tả hoặc đã chạy DB. [Bước 6 đã review chéo](review-2026-11-01.md); các chỉnh sửa kỹ thuật sau review nằm ngay tại nguồn này và integrity, chưa có schema hoặc DB test thực thi.
