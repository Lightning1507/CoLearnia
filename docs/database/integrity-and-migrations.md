# Bước 5 — Index, validation, đồng thời và migration

**Trạng thái:** đặc tả kỹ thuật ngày 01/11/2026, để review trước implementation. Chưa chạy DB, createIndex/collMod, migration, seed, integration test hoặc đo query plan. Phạm vi là hoàn thiện thiết kế đã được giao, không viết Mongoose schema hay tự triển khai feature.

Nguồn: [collection/document bước 4](collection-design.md), [lifecycle bước 3](lifecycle.md), [UC ↔ dữ liệu](uc-data-map.md), [contracts](../contracts/README.md). Đối chiếu repository: docker-compose.yml pin **MongoDB 8.0.16**, apps/server/package.json pin **Mongoose 9.11.4**. Thiết kế chỉ dành cho **một app process**, Mongo replica set và runtime ở RAM theo technical plan; thêm app replica phải thiết kế coordination lại.

## 1. Điều chỉnh kỹ thuật từ review bước 4

1. Thêm **scope.pairKey: String** ở DIRECT/HOST_PRIVATE: nối hai ObjectId hex thường theo thứ tự tăng dần bằng dấu “:”, server tính từ đúng hai participant IDs khác nhau. Field này là khóa suy dẫn, không là audience hoặc dữ liệu client được tin. Không unique trên mảng participantUserIds để chống trùng cặp.
2. File scope/binding vẫn theo bước 4; state DELETE_PENDING và cleanupAfter là cơ sở job dọn byte, **không TTL files/conversations/messages** ở bản đầu. Chỉ authSessions dùng TTL trực tiếp.
3. Quota bản đầu dùng tổng metadata files + reservation STAGED dưới khóa Workspace của một process, không thêm collection/counter quota. Byte DELETE_PENDING chưa xóa vẫn được tính. Cần reconcile disk trước readiness sau restart.
4. Field nghiệp vụ chưa có giới hạn ở nguồn không tự nhận một con số mới. Validator phải giữ đúng giới hạn có nguồn; giới hạn request/bytes chung cần task contract quy định trước handler tương ứng.

Unique multikey index áp lên các phần tử của mảng, không biểu diễn khóa cặp như mong muốn; scalar pairKey giúp khóa duy nhất không phụ thuộc multikey. Unique index cũng không tạo được nếu dữ liệu hiện có đã trùng. [MongoDB unique indexes](https://www.mongodb.com/docs/v8.0/core/index-unique/). pairKey là lựa chọn thiết kế CoLearnia, không tính năng DM mới.

## 2. Đặc tả index đích

Ký hiệu: **U** = unique: true; **P** = partialFilterExpression đúng object ghi trong bảng; **TTL0** = expireAfterSeconds: 0. Các key là object theo thứ tự field, chiều 1/-1; tên index chính là mã trong cột đầu. Mỗi collection đã có _id unique mặc định, không tạo bản lặp. Không dùng sparse/collation tùy ý thay options ở đây.

### 2.1. Khóa duy nhất và TTL

| Tên index                   | Collection          | Key                                             | Options / mục đích                                          |
| --------------------------- | ------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| uq_user_email               | users               | {emailNormalized:1}                             | U; email được chuẩn hóa trước lưu                           |
| uq_auth_token               | authSessions        | {tokenHash:1}                                   | U                                                           |
| ttl_auth_expiry             | authSessions        | {expiresAt:1}                                   | TTL0; auth vẫn kiểm hạn/revoke trực tiếp                    |
| uq_membership_pair          | memberships         | {workspaceId:1,userId:1}                        | U, gồm REMOVED để rejoin giữ incarnation                    |
| uq_invitation_token         | invitations         | {tokenHash:1}                                   | U                                                           |
| uq_channel_membership_grant | channelAccessGrants | {channelId:1,membershipId:1}                    | U, không partial revokedAt để re-add cập nhật cùng document |
| uq_conv_channel             | conversations       | {"scope.channelId":1}                           | U; P={kind:"CHANNEL"}                                       |
| uq_conv_direct              | conversations       | {workspaceId:1,"scope.pairKey":1}               | U; P={kind:"DIRECT"}                                        |
| uq_conv_session             | conversations       | {"scope.sessionId":1}                           | U; P={kind:"SESSION"}                                       |
| uq_conv_group               | conversations       | {"scope.sessionId":1,"scope.groupId":1}         | U; P={kind:"GROUP"}                                         |
| uq_conv_host_pair           | conversations       | {"scope.sessionId":1,"scope.pairKey":1}         | U; P={kind:"HOST_PRIVATE"}                                  |
| uq_message_retry            | messages            | {conversationId:1,senderId:1,clientMessageId:1} | U                                                           |
| uq_file_storage             | files               | {storageKey:1}                                  | U                                                           |
| uq_live_open_channel        | liveSessions        | {channelId:1}                                   | U; P={status:{$in:["ACTIVE","ENDING"]}}                     |
| uq_participant_pair         | sessionParticipants | {sessionId:1,userId:1}                          | U                                                           |

**Owner, cập nhật scope 03/11:** workspaces.ownerId là con trỏ chuẩn; membership OWNER phải khớp nó. Tạo Workspace/general/owner membership dùng cùng transaction dưới coordination hiện hành. Không có transfer owner trong MVP, không giữ writer đổi ownerId hoặc cho role API tạo/hủy OWNER. Kick không được loại owner. Không thêm unique ownerId toàn hệ thống hoặc unique trên role thay kiểm invariant; preflight/DB-03 kiểm đúng một OWNER ACTIVE khớp pointer, sai thì dừng mutation để reconcile, không chọn owner tùy ý. Thiết kế CAS chuyển owner của review trước không còn yêu cầu triển khai.

Không unique ownerId toàn hệ thống, tên Workspace/kênh hoặc liveSessions.channelId trên mọi phiên. Không partial deletedAt cho khóa DM/CHANNEL: dữ liệu cũ không được tái dùng như đối tượng mới. ACTIVE/ENDING cùng bị khóa để join không tạo phiên chồng cleanup.

Partial index chỉ gồm document khớp filter; query muốn dùng index phải chứa điều kiện phù hợp. $in được hỗ trợ trong partial filter MongoDB 8.0. [MongoDB partial indexes](https://www.mongodb.com/docs/v8.0/core/index-partial/). Tất cả expression/options ở đây vẫn phải chạy thử trên image 8.0.16 ở task implementation.

### 2.2. Index truy vấn và cleanup

| Tên index               | Collection / key                                                                      | Query được hỗ trợ                                                      |
| ----------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ix_auth_user            | authSessions {userId:1,revokedAt:1}                                                   | Tra/thu phiên liên quan user                                           |
| ix_membership_user      | memberships {userId:1,status:1,workspaceId:1}                                         | Workspace của tôi, kiểm membership hai bên DM                          |
| ix_membership_workspace | memberships {workspaceId:1,status:1,_id:1}                                            | Danh sách thành viên, cursor theo _id                                  |
| uq_invitation_workspace | invitations {workspaceId:1}, unique                                                   | Một cấu hình link hiện hành/Workspace; thay index danh sách lời mời cũ |
| ix_channel_workspace    | channels {workspaceId:1,deletedAt:1,order:1,_id:1}                                    | Kênh sống, thứ tự ổn định                                              |
| ix_grant_member         | channelAccessGrants {membershipId:1,membershipIncarnation:1,revokedAt:1,channelId:1}  | Kênh PRIVATE actor còn quyền; kiểm Workspace/channel sau               |
| ix_conv_direct_user     | conversations {workspaceId:1,kind:1,"scope.participantUserIds":1,createdAt:-1,_id:-1} | List DIRECT chứa actor; cần kind DIRECT; không unique                  |
| ix_conv_session_scope   | conversations {"scope.sessionId":1,kind:1,closedAt:1,_id:1}                           | Đóng/reconcile hội thoại phiên                                         |
| ix_conv_purge           | conversations {purgeAt:1,_id:1}                                                       | Closed + purgeAt là Date ≤ now; non-TTL                                |
| ix_conv_workspace       | conversations {workspaceId:1,_id:1}                                                   | Khóa/purge khi Workspace xóa, gồm DIRECT                               |
| ix_message_scope_cursor | messages {conversationId:1,rootMessageId:1,createdAt:-1,_id:-1}                       | Root history hoặc replies của một root, cursor kép                     |
| ix_file_cleanup         | files {cleanupAfter:1,_id:1}                                                          | File đủ hạn dọn, non-TTL                                               |
| ix_file_staged_expiry   | files {state:1,expiresAt:1,_id:1}                                                     | STAGED hết hạn → DELETE_PENDING                                        |
| ix_file_workspace       | files {workspaceId:1,_id:1}                                                           | Tính quota và reconcile/xóa Workspace                                  |
| ix_file_conversation    | files {"scope.conversationId":1,_id:1}                                                | Attachment đang staged/ready/pending theo conversation                 |
| ix_file_session         | files {"scope.sessionId":1,"scope.epoch":1,_id:1}                                     | Frame đời runtime cần reconcile                                        |
| ix_live_reconcile       | liveSessions {status:1,_id:1}                                                         | Bootstrap tìm ACTIVE/ENDING đời cũ                                     |
| ix_participant_user     | sessionParticipants {userId:1,sessionId:1}                                            | Tra metadata theo user, không thay ActiveCallRegistry                  |
| ix_audit_workspace      | auditEvents {workspaceId:1,createdAt:-1,_id:-1}                                       | Đối chiếu vận hành theo scope, không tạo UC tra audit                  |

workspaces không cần secondary index ở bản đầu: danh sách đi từ memberships rồi tra _id. channels, audit metadata không tự có TTL. Không thêm index nội dung/text search hoặc field ngoài UC. Index trong bảng là bộ đích ban đầu; query plan có thể cho thấy cần giảm/thay index trùng prefix, phải ghi lý do và đo lại, không bỏ unique bảo vệ invariant.

**Cursor history:** filter conversationId + rootMessageId (null cho root) và tuple (createdAt,_id) nhỏ hơn cursor khi sort giảm dần; dạng $or hai nhánh createdAt < t hoặc createdAt = t và _id < id. Cursor gồm scope/filter tương ứng, được validate; cursor từ thread/kênh khác không thay ACL. UI có thể đảo thứ tự trang để hiển thị thời gian tăng; không dùng skip cho history sâu. Dùng cùng tuple cho list DIRECT; plan có blocking sort hay không cần explain, không tuyên bố chỉ vì có index là đã tối ưu.

TTL chỉ xóa document nền, có thể chậm sau thời điểm hết hạn; không cascade xóa byte/tin con và không là kiểm quyền. [MongoDB TTL](https://www.mongodb.com/docs/v8.0/core/index-ttl/).

## 3. Validation ở ba lớp

1. **Zod boundary:** input strict, reject unknown field và sai định dạng/giới hạn; actor, membership incarnation, storageKey, sender, scope authority do server gán.
2. **Mongoose + Mongo validator:** schema strict; cấu trúc theo kind/purpose, types/null/enum/counters. Khi triển khai migrations tạo $jsonSchema/biểu thức nội document phù hợp, validationLevel strict và validationAction error sau preflight dữ liệu. Không bypass validation ở app.
3. **Application service/policy:** reference cùng phạm vi, ACL hiện tại, immutable và transition hợp lệ, race/deny barrier. Validator document không truy vấn các collection khác để chứng minh quyền.

Mongoose unique không là validator; update validators phải bật và chỉ kiểm những path/operator được hỗ trợ. Không dựa riêng runValidators để bắt toàn bộ invariant khi $inc/update pipeline/bulkWrite. Service xây mutation rõ field rồi DB validator kiểm document kết quả; không cho client truyền Mongo operators hoặc raw filter. [Mongoose validation](https://mongoosejs.com/docs/validation.html), [MongoDB schema validation](https://www.mongodb.com/docs/v8.0/core/schema-validation/).

### 3.1. Kiểu, defaults và dữ liệu có nguồn

- Id API: đúng 24 ký tự hex, normalize về BSON ObjectId; không cast chuỗi bất kỳ thành hợp lệ. RuntimeId/requestId/clientMessageId đúng UUID theo contract. Dates từ server, không tin createdAt/expiresAt client.
- Mongoose Number là JavaScript Number; không mặc định mọi giá trị được ghi thành BSON double. Probe serializer với dependency đang pin cho thấy 0/42 thành Int32, 2^31 thành Double. Validator cho Int phải chấp nhận các BSON numeric type mà writer/operator thực sự tạo (int/long/double), đồng thời buộc giá trị hữu hạn, nguyên, trong miền số nguyên an toàn và giới hạn field; không chỉ nhận double hoặc chỉ int32. BSON Long đọc ra phải được chuyển có kiểm tra miền an toàn trước khi đưa vào API Number; không chấp nhận Decimal128 ngầm. DB-01 cần kiểm cả insert và $inc qua biên int32. Counter không âm; incarnation ≥1; revision khởi đầu 0. [BSON types](https://www.mongodb.com/docs/v8.0/reference/bson-types/), [validation bằng query operators](https://www.mongodb.com/docs/v8.0/core/schema-validation/specify-query-expression-rules/).
- Field nullable bắt buộc có mặt với null ở trạng thái ban đầu: deletedAt/revokedAt/closedAt/purgeAt/removedAt/leftAt/endedAt và các field nullable ở bước 4. Field chỉ thuộc variant khác phải vắng mặt. Không dùng missing/null tùy writer.
- Default server: timestamps UTC; membership mới ACTIVE/MEMBER/incarnation 1, owner chỉ trong luồng tạo/transfer; revision 0; uses 0; grant revokedAt null; attachmentIds []; rootMessageId null. replyCount =0 chỉ cho root CHANNEL. READY không có default, chỉ sau bind.
- Normalization email: trim và lowercase theo chính sách đăng nhập của app, dùng cùng helper ở register/login; không tự bỏ dấu chấm, dấu “+” hoặc sửa domain. Giữ Unicode text, không tự xóa nội dung trước khi kiểm giới hạn. Workspace name trim 2–80, channel name trim 1–80 theo input scaffold; displayName cần contract giới hạn trước handler, chưa tự đặt max mới.
- Message ≤4.000 ký tự, ≤4 attachment, ≤10 MiB/file; frame ≤1920×1080, ≤2 MiB; quota Workspace 500 MiB và tạm phiên 20 MiB là cấu hình khởi đầu từ plan, tiếp tục đo. DISCUSSION tên ≤80, mục đích ≤500, roster không trùng/cùng phiên; ACTIVITY duration số nguyên 1–120 phút. Text/tên dùng cùng cách đếm code point ở contract/service và DB validator nếu dùng $strLenCP, có test emoji/ký tự tổ hợp; không tùy lớp dùng UTF-16 length khác nhau.
- passwordHash/tokenHash/storageKey không được serialize/log; hash library và tham số không được tự coi là chốt bởi tài liệu này.

### 3.2. Ma trận kiểm theo collection

| Collection          | Cấu trúc/default và kiểm trong document                                                                                                                                                          | Kiểm service / quyền / transition                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| users               | Email normalized, hash/displayName không rỗng, ACTIVE/DISABLED; không nhận role Workspace ở đây                                                                                                  | Đăng nhập đúng trạng thái, không lộ hash; email conflict trả lỗi nghiệp vụ                                                      |
| authSessions        | userId, tokenHash, expiresAt Date; revokedAt null ban đầu                                                                                                                                        | User hợp lệ; now < expiry và chưa revoke; rotate thu phiên cũ/socket/media                                                      |
| workspaces          | ownerId, name, revision, deletedAt null                                                                                                                                                          | Owner ACTIVE đúng Workspace, ownerId khớp role; xóa/transfer chỉ actor hợp lệ                                                   |
| memberships         | Unique pair; ACTIVE thì removedAt null, REMOVED có removedAt; incarnation/revision nguyên                                                                                                        | Không loại/hạ owner trực tiếp; admin không sửa owner/admin khác; rejoin tăng incarnation đúng một lần                           |
| invitations         | workspaceId unique; tokenHash unique/private; enabled Boolean; revision Int ≥0. Field lưu/tái tạo token chờ review theo collection-design §3.5.                                                  | Workspace/actor hợp lệ; nhận khi token khớp link hiện hành đang bật; không hạn/lượt; ACTIVE không nhân membership.              |
| channels            | TEXT/LIVE, WORKSPACE/PRIVATE; revision/order; deletedAt null                                                                                                                                     | type/accessMode immutable; owner/admin quản lý; tên general không là protected flag                                             |
| channelAccessGrants | Refs + incarnation; grant/revoke dates; đúng shape bước 4                                                                                                                                        | Channel PRIVATE, memberships cùng Workspace, đích ACTIVE; actor owner/admin; gỡ/re-add kiểm revision kênh, incarnation hiện tại |
| conversations       | Variant scope đúng kind; DIRECT/HOST_PRIVATE đúng hai IDs khác nhau, sorted, pairKey khớp; closedAt/purgeAt đi cùng quy tắc lifecycle                                                            | Ref cùng Workspace/kênh/phiên; runtime group thật, đúng hai bên; không tự mở lại meeting; DIRECT kick không đóng vĩnh viễn      |
| messages            | Text hoặc file không rỗng cả hai; IDs không trùng; UUID retry; replyCount chỉ root CHANNEL                                                                                                       | Root cùng conversation và là root; người gửi có quyền; attachment READY bind chính tin và đúng uploader; meeting chỉ ảnh        |
| files               | Scope/binding và authorization stamp có kiểu, 1–2 memberships; READY có MIME/byteSize/binding, reservedBytes 0, expiresAt null; STAGED binding null, expiry Date; DELETE_PENDING có cleanupAfter | Uploader/purpose/scope đúng, MIME thật/size/quota, frame context/intent hợp lệ; client không patch state/scope                  |
| liveSessions        | Epoch, revision, status; ENDED có endedAt và hostUserId null; ACTIVE/ENDING endedAt null                                                                                                         | Host hợp lệ trong runtime, một phiên open/kênh; chuyển host/ending CAS; null không giải nhánh host còn mở                       |
| sessionParticipants | Session/user; joinedAt; lastScope đúng MAIN/GROUP/null, lastScopeAt cùng có/không; leftAt nullable                                                                                               | Metadata gần nhất, không cấp quyền; scope thuộc phiên; reconnect không nhân document                                            |
| auditEvents         | Actor/scope nullable theo nguồn, outcome enum, target/action allowlist nội bộ; không payload Mixed                                                                                               | Không chat/token/tên file riêng/mục đích request; ghi đúng kết quả, không xem log là evidence media                             |

Giá trị thời gian và phép so sánh nội document được kiểm bằng validator/biểu thức tương ứng khi triển khai; rule cần cross-collection phải ở service, không ghi một dòng “foreign ref hợp lệ” rồi coi Mongo đã enforce.

## 4. Đồng thời, transaction và ranh giới runtime

### 4.1. Cơ chế chung

- Bản đầu một process: có **cổng mutation theo Workspace** cho thay đổi quyền/cấu trúc và commit tin/file/nhận invitation cần kiểm cùng quyền. Giữ qua DB commit ngắn; không giữ khi chờ upload, browser picker, ack hoặc người dùng. Đây là đánh đổi throughput phù hợp baseline, không phân tán lock bằng Mongo chỉ từ tài liệu.
- Thứ tự acquire thống nhất: user ownership (nếu cần) → Workspace mutation → channel lifecycle → session mutation. Chỉ lấy khóa thật sự cần; không lấy khóa ngoài từ bên trong session queue. Takeover reconcile từng session lần lượt, không giữ hai queue phiên. Reaper/runtime callbacks không gọi ngược vào Workspace lock khi còn giữ session queue.
- Runtime board/share thuần dùng session queue và generation/context; commit chat/group file đi từ cổng ngoài vào queue phiên, giữ scope không thay trong commit DB ngắn. Revoke đi cùng thứ tự; hai đường không được mỗi nơi dùng một mutex riêng.
- Tất cả app writes, sweep và mutation endpoint phải tuân cổng liên quan. Raw migration/admin writes chỉ khi app maintenance, không chạy song song. Nếu mở process thứ hai thì các bảo đảm ACL qua khóa RAM này không còn đúng; chặn cấu hình đó theo baseline.
- DB transaction đọc snapshot không tự ngăn ACL đổi ở document khác. Cổng app ngăn race trong một process; unique/CAS + transaction giữ dữ liệu bền. Không coi chỉ đọc ACL trong transaction là đã khóa người có quyền.
- Transaction DB dùng session chung, readConcern snapshot, writeConcern majority, readPreference primary; mọi operation tuần tự, không Promise.all trong cùng transaction. Driver có thể chạy lại callback: ID/createdAt/canonical payload phải ổn định, không gửi event/email/media hoặc ghi disk trong callback. [Node driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

**Deadline qua I/O:** giữ session queue không làm thời gian ngừng chạy. Mọi grant/read/fanout cho ACTIVITY phải kiểm deadline server hiện tại, kể cả sau await DB/disk và trước công bố kết quả. Nếu một write đang commit đúng lúc hết hạn, kết quả có thể đã được lưu nhưng không được phát nội dung hoặc cấp scope cũ; read-back/reconcile theo ID, rồi cleanup theo lifecycle. Không hứa DB commit và deadline RAM là một transaction nguyên tử, không giữ nhóm mở chỉ vì callback timer đang chờ queue. DB-09/10 phải inject DB chậm đi qua deadline và kiểm không phát private sau hạn.

**Download đang mở:** kiểm ACL lúc bắt đầu chưa đủ. File service đăng ký stream đang chạy theo auth/user/Workspace/channel/conversation và runtime scope nếu có; nhả gate trước truyền byte. Revoke/close/expiry dựng deny barrier rồi hủy stream liên quan, chặn request Range/retry mới; sweep phải phối hợp với registry stream/writer trước unlink. Không giữ Workspace lock suốt lượt tải và không dựa URL public sống lâu. Byte đã gửi hoặc nằm trong buffer phía người nhận không thể thu hồi; ca DB-05/11 kiểm hủy stream và không tiếp tục cấp byte, không hứa xóa bản người dùng đã tải.

### 4.2. Kịch bản và điểm hoàn tất

| Luồng                                 | Bảo đảm thực thi đích                                                                                                                                                                         | Retry/lỗi phải cho kết quả nào                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tạo Workspace                         | Transaction insert Workspace, owner membership, general TEXT, CHANNEL và audit SUCCEEDED                                                                                                      | Commit đủ hoặc không có phần nào. Retry tạo mới chưa có khóa idempotency chung: không auto-replay POST sau mất ack; giao diện kiểm danh sách hiện có. Không hứa requestId dedupe mọi REST           |
| Nhận invitation/rejoin                | Dưới Workspace gate, transaction kiểm actor/Workspace/link hiện hành và membership; nếu REMOVED update theo status/revision rồi tăng incarnation. Tạo lại/tắt link dùng cùng gate.            | Join đồng thời không nhân membership; ACTIVE retry trả hiện tại. Accept trước thao tác tắt/đổi đã hoàn tất vẫn giữ membership; accept sau phải bị từ chối với token cũ. Không tự khôi phục PRIVATE. |
| PRIVATE add/remove, kick, xóa phạm vi | Gate → deny barrier → thu media/fanout → transaction/CAS quyền+audit → reconcile → projection                                                                                                 | Re-add grant update incarnation hiện tại. Nếu DB lỗi sau thu, giữ tài nguyên đóng; xác minh trạng thái DB trước clear barrier/cấp mới. Không báo xóa thành công khi commit chưa rõ                  |
| Mở DM/HOST_PRIVATE                    | Normalize pair, tìm/create theo scalar pairKey và scope; unique chống trùng                                                                                                                   | Duplicate key chỉ được đọc lại đúng key sau ACL; không coi mọi E11000 là thành công                                                                                                                 |
| Gửi tin/reply                         | Kiểm ACL/gate/queue thích hợp; root text-only không file/invariant chéo dùng insert đơn + unique; có file/reply counter dùng transaction insert + CAS bind + increment counter nếu insert mới | Retry cùng key/payload trả tin cũ sau ACL, không tăng counter/bind lần hai. Cùng key khác payload trả conflict; so sánh canonical text/root/attachmentIds, không sửa tin cũ                         |
| File bị bind cùng lúc                 | CAS file theo _id/uploader/scope/state STAGED/binding null, expiresAt > now và authorization còn khớp trong transaction của tin                                                               | Chỉ một tin thắng; tin còn lại abort toàn bộ, không tin thành công nhưng thiếu file                                                                                                                 |
| Tạo/join LIVE                         | Theo lock order; unique open channel, metadata hợp lệ trước công bố Router/ticket; upsert participation unique session/user                                                                   | Tạo Router thừa phải close. Join ENDING không tự tạo chồng; retry ticket/request theo live policy trong runtime, không thêm collection ticket                                                       |
| Transfer host / tự hết ACTIVITY       | Session queue kiểm role/revision/round/deadline; persist metadata cần thiết, cleanup trước cấp scope mới                                                                                      | Không re-run side effect qua DB retry; deadline không chờ host. DB/runtime lỗi giữ deny/resync, không phát audio riêng ra MAIN; host nhiều sự cố vẫn theo điểm mở                                   |
| Freeze commit                         | Reserve intent trong runtime; upload ngoài queue; khi commit kiểm lại epoch/source/context/quyền, DB file binding rồi công bố frame trong queue                                               | DB đã bind nhưng crash trước runtime attach thì frame orphan của epoch cũ được sweep. Không cố rollback file bằng giả khôi phục board từ DB                                                         |
| Fanout sau commit                     | Publish ngoài transaction, audience kiểm hiện tại dưới scope gate/queue; không giữ raw recipient list qua revoke                                                                              | Commit rồi crash trước ack vẫn có history/retry; không exactly-once network, không durable broker/outbox chỉ từ thiết kế này                                                                        |

CAS = filter gồm trạng thái/revision dự kiến, update tăng revision và kiểm matchedCount. Revision DB, policyRevision, incarnation, epoch và callGeneration khác nhau; không dùng một counter thay tất cả. Lỗi transient transaction được driver retry có giới hạn/deadline của task; unknown commit result phải resolve bằng khóa/idempotency/read-back khi có, không chạy lại side effect mù. Với thao tác không có idempotency key bền, trả trạng thái chưa xác định/resync thay vì tuyên bố “chưa làm” rồi tạo lại.

**Kết quả commit chưa rõ:** không ghi FAILED chỉ vì mất ack/timeout; trước hết read-back/reconcile theo ID/revision. Audit SUCCEEDED trong transaction có thể đã tồn tại; không thêm event FAILED mâu thuẫn. Khi vẫn chưa phân giải được, ghi log vận hành theo requestId, không tạo một kết quả nghiệp vụ giả trong auditEvents.

**Audit:** thao tác quyền/cấu trúc có DB mutation ghi SUCCEEDED trong cùng transaction; callback retry không tạo log lặp. DENIED/FAILED ghi event metadata riêng sau kết quả thật, không đổi kết quả thành công của mutation chỉ vì log lỗi; báo vận hành khi audit thất bại. Sự kiện thuần runtime có audit sau khi reconcile và revision xác định, không hứa log exactly-once qua crash. Không dùng audit như ledger idempotency hoặc lưu payload người dùng.

### 4.3. Quota và upload

- Dưới Workspace gate, tổng phần ATTACHMENT dùng để kiểm quota = byteSize của READY/DELETE_PENDING chưa xóa + reservedBytes của STAGED. File DELETE_PENDING từ STAGED phải xác định byteSize thực bằng writer/stat trước khi chuyển reservedBytes về 0; nếu chưa xác định được thì giữ reservation và tính max(byteSize đã biết, reservedBytes), không tính 0 hoặc cộng hai lần. Không “trả quota” khi disk vẫn còn byte.
- Frame tính riêng quota tạm theo session/epoch theo cùng quy tắc byte/reservation trên. Cổng Workspace cũng serialize reservation này để bản đầu không cần thêm lock lồng đảo thứ tự.
- Mỗi STAGED giữ authorization stamp do server chụp theo [field bước 4](collection-design.md#310-files): 1–2 membership versions và channel revision nếu có. Kiểm lại dưới gate khi reserve, hoàn tất upload và bind; expiry, revoke hoặc khác version thì từ chối/cancel và dọn, không tự gia hạn hay reauthorize file cũ. Re-add/rejoin cần upload mới. READY tải theo ACL hiện tại, không bị khóa vĩnh viễn bởi stamp cũ; stamp chỉ chống commit upload cũ. Frame còn phải kiểm epoch/intent/context runtime. Khi bootstrap mất upload runtime, hủy STAGED đời process cũ trước nhận commit, không hồi writer từ metadata.
- Tạo metadata STAGED + reservation trước mở luồng ghi disk; reserve mức trần hợp lệ của file hoặc mức nhỏ hơn đã xác minh, chặn stream nếu vượt. Sau reserve nhả gate rồi upload. Bind có thể dùng file metadata đã kiểm, không đọc file lớn trong transaction.
- Upload xong cập nhật byteSize/MIME/dimensions đã xác minh; đến commit chuyển reservation thành byte đã dùng đúng một lần. Failure/expiry → DELETE_PENDING và lên lịch xóa; file đang được upload phải được hủy/đóng writer trước unlink.
- Khi disk/DB không khớp sau crash, chưa nhận upload mới ở scope đang reconcile. Sweep đối chiếu đường storageKey chỉ trong kho private, đếm orphan/byte thực; thiếu dung lượng thực phải chặn upload dù tổng DB còn quota.
- Bản đầu aggregate metadata dưới cổng một process; quota bytes không giới hạn số document (file nhỏ/0 byte vẫn có metadata), vì vậy phải stream/aggregate ở DB và đo trên fixture nhiều file, không load toàn bộ documents vào RAM. Chưa có số đo hiệu năng. Nếu sau đo cần counter materialized thì phải thiết kế/review thêm field và reconciliation, không âm thầm thêm counter thứ hai dễ lệch.

### 4.4. Cổng kiểm chứng trước công bố capacity

Theo [capacity 25/50](../capacity.md), giữ gate/aggregate/stamp như mô tả ở trên cho MVP, nhưng chưa xem chúng đã chịu được tải đích. Khi triển khai phải có queue bounded/deadline và đo wait/hold/depth; không để request chờ vô hạn. Nhánh root text-only chỉ dùng insert đơn nếu không có invariant nhiều document, vẫn kiểm ACL/dedupe/fanout dưới gate đúng thứ tự. Không bỏ gate để benchmark đẹp.

- Quota: đo aggregate trên lịch sử file cũ và media cùng máy. Nếu scan/gate làm không đạt profile, task riêng thiết kế counter used/reserved + reconcile trước thay authority; chưa thêm field/collection counter.
- Stamp: giữ phương án bảo thủ hiện tại; test add/remove một người làm upload người khác stale. Nếu cần thu hẹp version theo đúng quyền bị tác động, review field và chạy lại revoke/re-add; chưa đổi schema stamp trong đợt này.
- Frame: 20 MiB/session là cấu hình profile nhỏ; trước C-25/C-50 khai báo số board của fixture, frame active + reservation + frame cũ chờ dọn và ngân sách hữu hạn per-board/session/server. Không tự tăng vô hạn hoặc coi quota 20 MiB đã đáp ứng mọi bố trí nhóm.
- Read: batch user metadata/projection/cursor, đo query count và explain; không query DB cho mỗi recipient/preview/heartbeat. Cache quyền phải invalidation cùng deny barrier. Pool/wait/query timeout và buffering policy có config trước chạy tải; không dùng pool size = số participant.
- Cleanup theo batch nhả gate giữa lô; không giữ khóa khi scan disk/unlink/nén ảnh lâu, kiểm lại trạng thái trước cập nhật metadata. Nếu background job bị chậm, thu quyền vẫn phải có hiệu lực ngay.

Các cổng trên là yêu cầu implementation/test. Chưa chạy DB-01–12 hoặc benchmark; giới hạn chat/upload theo user không thay admission limit theo session/process.

## 5. Cleanup, TTL và restart

Retentions và chu kỳ đã có ở [lifecycle](lifecycle.md#133-cleanup): sweeper 60 giây, STAGED/orphan quá 15 phút, context mất refs sau grace tối đa 5 phút, private conversation đóng purge sau 24 giờ, tệp kênh/Workspace xóa sau 7 ngày khi hết refs. Đây là cấu hình khởi đầu, không xem là SLA. Bước này không đặt retention mới cho audit/User/invitation/metadata phiên.

Thứ tự job idempotent:

1. Khóa quyền bằng lifecycle/runtime/deny barrier ngay khi hết hiệu lực. Đóng conversation bằng closedAt/purgeAt; với Workspace/kênh xóa, từ tombstone suy scope cần dọn, không cần tạo restore feature.
2. Dùng cursor batch theo _id, không một transaction cho toàn Workspace. Giữ conversation và file metadata cho tới khi đã biết hết con phải dọn; các job lặp tiếp tục được sau crash.
3. STAGED quá hạn: thu writer/intent và mark DELETE_PENDING. File của conversation đủ retention: mark DELETE_PENDING/cleanupAfter sau kiểm scope. Frame hết refs: đối chiếu board/context/epoch trước mark; frame của runtime cũ chỉ dọn sau bootstrap đã chặn đời cũ.
4. Xóa byte khi đủ hạn và không còn refs/writer; ENOENT coi byte đã dọn, lỗi quyền/disk phải retry và ghi trạng thái vận hành. Giữ metadata cho đến khi xác nhận byte mất; không unlink từ path do client cung cấp. Sau khi xóa byte, xóa file metadata dưới cổng scope; khi crash giữa hai bước, lần sau thấy ENOENT rồi hoàn tất metadata, không đếm quota byte đã mất mãi.
5. Sau khi các file của một message đã dọn, xóa message theo lô; sau hết children/files mới xóa conversation. Với CHANNEL có thread, dọn reply trước root và giữ root cho đến khi không còn reply; crash giữa các batch vẫn tìm được root/scope. Conversation đã khóa nên không nhận reply mới; không purge từng tin của hội thoại còn mở. Không xóa scope/ref trước khi job có thể tìm lại file. Tombstone cha có thể giữ metadata tối thiểu; khi chưa chọn retention metadata thì không purge tùy tiện.
6. Restart: trước readiness reconcile ACTIVE/ENDING cũ thành ENDED, participant không còn runtime, khóa mọi conversation private/intent/frame đời cũ; không reset “24 giờ” mỗi lần bootstrap. Dọn file orphan cả có metadata lẫn không có. Không phục hồi host/group/round/board từ Mongo.
7. Auth TTL chỉ dọn authSession sau expiresAt; expired request vẫn bị deny ngay cả khi TTL chưa chạy. Không TTL invitations, grants, conversations, messages, files, liveSessions hoặc audit mặc định.

Lịch dọn CHANNEL/DIRECT sau parent deletion phải tôn trọng mốc tệp 7 ngày, không lấy private-session 24 giờ áp nhầm. Giữ scope và dấu đóng trong suốt các batch. Khi re-add PRIVATE hoặc DM rejoin, không hồi tệp đã bị purge và không mở lại conversation meeting.

## 6. Kế hoạch migration và rollback

Đây là trình tự cho task implementation sau, không phải lệnh đã chạy. Không giả định DB local chưa có dữ liệu chỉ vì source chưa có schema.

| Giai đoạn             | Việc cần thực hiện                                                                                                                                                                                                                     | Điều kiện dừng                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 · kiểm kê/backup   | Xác nhận DB/image/FCV/replica set từ cấu hình; kiểm collection/index/validator hiện có, counts và dữ liệu sai bằng ID/count; backup DB + permanent files cùng manifest theo runbook                                                    | Chưa có quyền ghi/migration, backup chưa kiểm phục hồi hoặc app vẫn đang nhận writes                                                                             |
| M1 · preflight        | Tìm trùng email/membership/cặp DM/tin retry/open session, missing/null/types sai, owner không khớp, refs chéo Workspace, READY file thiếu byte/binding                                                                                 | Không tự xóa/merge dữ liệu để unique build xanh; báo ID/count và cách xử lý cần review, không in secret/nội dung                                                 |
| M2 · map/backfill     | Maintenance một process; mapping RESTRICTED→PRIVATE nếu có, allowedUserIds→grants và membership incarnation có chứng cứ; scope/binding/pairKey chuẩn hóa theo nguồn; STAGED cũ thiếu stamp bị hủy/dọn, không backfill quyền upload mới | Không biết lịch sử kick/rejoin hoặc audience: không cấp lại quyền tự động; dừng phần phụ thuộc để review. Không bịa incarnation/grant cho dữ liệu không đủ nguồn |
| M3 · validators/index | Migration versioned có checksum và trạng thái áp dụng trong metadata vận hành; tạo collection/validator/index có tên theo đặc tả; tắt autoIndex/autoCreate ngoài test                                                                  | Sai options, duplicate hoặc validator không hợp image pin: dừng, không ignore hoặc drop invariant                                                                |
| M4 · contract/app     | Đồng bộ PRIVATE và bỏ FREE/MODERATED cũ; dùng typed scopes/pairKey/grants, không dual-authority allowedUserIds; bootstrap reconcile trước readiness                                                                                    | Contract/web/server không cùng semantics, index/validator thiếu hoặc reconcile chưa xong thì không ready                                                         |
| M5 · xác minh         | Chạy integration/race/failure matrix ở mục 7; listIndexes/listCollections kiểm options, explain query fixtures, restore thử trong DB/volume cô lập                                                                                     | Bất kỳ quyền cũ tự sống lại, dữ liệu trùng, byte orphan không dọn được hoặc lỗi không được báo thật                                                              |

Nếu DB đã có uq_active_owner từ bản thử trước review, preflight phải nhận diện và migration được review riêng mới gỡ đúng index đó trong maintenance sau khi kiểm owner pointer/roles; không để index cũ phá luồng transfer, không chạy syncIndexes để tự drop mọi index ngoài bảng. Task tài liệu này chưa kiểm hay gỡ index nào trên DB.

Metadata migration là hạ tầng deployment (ledger của migration runner), không collection nghiệp vụ thứ 14 hoặc UC quản lý migration. Task implementation chọn runner/đường manifest cụ thể và commit cùng script; không tạo framework migration trong đợt tài liệu.

**Idempotent:** kiểm index name/key/options chính xác trước create; đã apply đúng checksum thì không replay backfill. Cùng tên khác options hoặc ledger dang dở phải xác minh, không syncIndexes tự drop index lạ. App chỉ start khi schema/migration/index readiness đạt, health DB ping không đủ.

**Rollback:** trước writes mới có thể rollback additive change đã xác minh không mất dữ liệu. Sau khi writer mới hoạt động, không chạy bản cũ hiểu allowedUserIds/RESTRICTED vì có thể mở quyền sai; giữ maintenance, fix-forward hoặc restore backup đã diễn tập với sự chấp thuận tương ứng và nêu dữ liệu mới sẽ mất. Purge byte/merge dữ liệu không thể “rollback bằng down()”. Không rollback bằng bỏ validator/unique rồi tiếp tục phục vụ dữ liệu sai. Không nâng Mongo hoặc đổi pin trong task này.

## 7. Ma trận kiểm thử trước nghiệm thu implementation

Tất cả ca dưới là **yêu cầu kiểm thử**, chưa được chạy. Dùng Mongo 8.0.16 replica set và Mongoose pin trong repo, DB/volume test cô lập; mock không thay unique/transaction/TTL test. Hai client kết nối độc lập cho race, injection lỗi ở ranh giới DB/runtime/disk; không assert TTL xóa đúng một giây.

| Mã    | Nhóm test               | Điều kiện và kết quả bắt buộc                                                                                                                                                                                                                      |
| ----- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB-01 | Schema/enum/null        | 13 collection nhận document đúng; reject field lạ/sai type/scope, enum cũ, thiếu nullable bắt buộc, số âm/lẻ/NaN và pairKey giả                                                                                                                    |
| DB-02 | Unique/partial          | Từng unique index có ca vi phạm; DIRECT hai cặp chung một user vẫn hợp lệ, cặp đảo thứ tự hội tụ; nhiều session ENDED/kênh hợp lệ, chỉ một ACTIVE/ENDING                                                                                           |
| DB-03 | Workspace/owner atomic  | Inject lỗi từng write tạo Workspace/general; không owner/general dở dang, đúng một OWNER ACTIVE khớp ownerId; role/kick API không đổi hoặc xóa OWNER, không có endpoint transfer trong MVP                                                         |
| DB-04 | Invitation/rejoin race  | Tạo đồng thời chỉ một link hiện hành; sao chép không đổi link; tạo lại/tắt cùng lúc accept không cấp quyền bằng token cũ sau khi thay đổi có hiệu lực. Join lặp không nhân membership; incarnation chỉ tăng khi tái gia nhập thật.                 |
| DB-05 | PRIVATE race/ACL        | Add cùng kick, remove cùng send/upload/download; user/admin ngoài list không đọc; rejoin không hồi grant, cấp lại đúng incarnation mới mở lịch sử còn lưu; STAGED trước kick/rejoin hoặc remove/re-add không bind được dù quyền hiện tại đã có lại |
| DB-06 | Message/thread/dedupe   | Retry song song cùng/different payload; một tin/root counter tăng một; root chéo kênh/reply lồng bị từ chối, emoji/giới hạn đúng giữa các lớp                                                                                                      |
| DB-07 | Attachment binding      | Hai tin dùng cùng staged file chỉ một thắng; transaction rollback không để READY sai/tin thiếu file; meeting từ chối PDF, frame không thành attachment; STAGED hết hạn không bind dù sweeper chưa chạy, stamp giả/stale bị chặn                    |
| DB-08 | Quota/stream            | Upload đồng thời sát quota + DELETE_PENDING còn byte; không vượt tổng reserve/used, abort/cleanup không trả quota hai lần; restart reconcile orphan trước mở upload                                                                                |
| DB-09 | ACL/generation/runtime  | Revoke trong khi async callback/ticket/freeze đang chờ; không cấp quyền cũ; deadline/ACTIVITY và transfer host giữ policy đã chốt                                                                                                                  |
| DB-10 | Crash/unknown commit    | Crash sau insert trước ack, byte trước metadata/bind, host metadata trước projection; retry/readback không nhân dữ liệu hoặc side effects, không giả thành công                                                                                    |
| DB-11 | Cleanup/restart/TTL     | Closed private deny ngay trước purge; job lặp và ENOENT an toàn; crash giữa batch reply/root không mất đường cleanup; frame active giữ lại; restart không mở lại group/media, auth expiry deny khi TTL document còn                                |
| DB-12 | Migration/restore/query | Existing data sai làm preflight dừng; áp dụng hai lần không duplicate; sai checksum/options fail; restore cô lập; explain các query mục 2.2 với fixture ghi kích thước/kết quả                                                                     |

Bằng chứng cần lưu trong PR: version/image thực, commands, fixture/workload, pass/fail và giới hạn; listIndexes/validator options không chứa secrets; executionStats ghi keys/docs examined và sort stage cho history/DM/membership/grants/cleanup. Không đặt threshold hiệu năng tùy ý rồi tuyên bố đạt tải lớp 40–50 người.

## 8. Phạm vi hoàn thành và bước tiếp

Bước 5 đã có đặc tả index/options, validator theo collection, thứ tự khóa/transaction/CAS/quota, cleanup, kế hoạch migration/rollback và matrix DB-01–12. Chưa có bằng chứng DB behavior đã đúng; kiểm tài liệu không thay chạy các ca trên.

Còn mở đúng nguồn: thư viện/tham số hash, contract limits chưa có như displayName, retention audit/metadata, host không có ứng viên/host tạm cũng mất mạng và media capacity. Không chọn mặc định các điểm đó để bảng schema trông hoàn chỉnh.

**Bước 6 đã review tài liệu:** xem [kết quả review chéo](review-2026-11-01.md), gồm điều chỉnh owner, upload authorization/expiry, thread cleanup và audit unknown commit. Bộ đích còn 34 index tùy biến (15 unique/TTL và 19 query), ngoài _id mặc định. Chưa chạy các ca DB; không tự chuyển sang schema/migration hoặc GitHub Projects từ task review.

## Bổ sung kiểm board ngày 02/11/2026

FRAME chỉ chấp nhận groupId DISCUSSION/ACTIVITY đang có quyền và intent hợp lệ; null/MAIN bị từ chối trước reserve/upload/bind. MAIN overlay không tạo file FRAME. Bổ sung DB-09: deny MAIN freeze dù host, thu quyền mutation host cũ và stale source revision; nhóm giữ FROZEN hợp lệ khi nguồn live dừng. Nét thường/tự biến mất tại MAIN vẫn ở RAM, không thêm collection/index; xem [board](../product/board-collaboration.md). Chưa chạy kiểm chứng DB.

## Delta thiết kế sau kickoff 02/11

RECORD-01 / UC-LIVE-11–12 / FR-15-01–03 bổ sung metadata bản ghi gắn LiveSession/kênh, trạng thái ghi/xử lý/sẵn sàng/lỗi ở mức hành vi, tham chiếu video byte và cleanup. Video thuộc kho tệp; không nhúng byte vào MongoDB hoặc tái dùng FRAME/attachment để vượt ACL. Xem [recording](../product/recording.md) và [model](model.md). 13 collection/16 khái niệm cũ mô tả phạm vi trước recording, chưa là thiết kế recording hoàn tất; chưa chốt field/index/migration mới.

Quyền xem kiểm membership và channel access hiện tại, kể cả PRIVATE, không dựa vào participant cũ; xóa kênh/Workspace và thu quyền phải được tính trong lifecycle. Stop/end hoàn tất hoặc báo lỗi, dọn tài nguyên/tệp dở dang; quota/retention/quyền xóa và xử lý restart còn chờ proposal. DISCUSSION tạo hợp lệ ngay, không trạng thái host xét/hủy pending; random preview chỉ là cấu hình ACTIVITY, không tự chuyển người.

## Delta PROFILE-01 ngày 03/11/2026

M1 bổ sung ACC-04/05 và FR-01-04–06: sửa displayName/avatar và đổi mật khẩu hiện tại; quên mật khẩu để sau MVP. Cập nhật 04/11: avatar lưu trên Cloudinary, công khai qua URL; chỉ chính chủ được thay/xóa. MongoDB giữ metadata ảnh trên User; xem cấu trúc đề xuất tại [collection-design](collection-design.md#31-users). Không áp dụng cách truy cập công khai này cho file chat hoặc video cuộc họp. Đổi mật khẩu vẫn thu tất cả phiên và socket/media liên quan. Luồng upload, xác minh ảnh và dọn ảnh cũ cần M1/M2 review theo [proposal](../proposals/m1-workspace-auth.md); chưa triển khai schema/index/migration.

Cập nhật 03/11: WS-11/FR-02-08 chuyển owner không còn thuộc MVP. Owner pointer và membership OWNER vẫn phải khớp từ lúc tạo; role management không được đổi OWNER. Các mô tả/test transfer cũ còn trong review là lịch sử, không yêu cầu xây luồng bàn giao. Chuyển host phiên LIVE vẫn giữ nguyên.

**Delta invitation 04/11:** trước khi áp unique workspaceId, kiểm dữ liệu lời mời cũ nếu có và review cách chọn/thay link hiện hành, thông báo vô hiệu link cũ và chuyển đổi token. Không tự gộp/xóa bản ghi hoặc chạy migration trong task tài liệu; cơ chế token có thể lấy lại phải được chốt trước schema.
