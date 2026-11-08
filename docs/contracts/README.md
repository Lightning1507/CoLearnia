# Contracts

## Quy ước áp dụng chung

Trước khi viết API/socket, đọc [quy ước API và backend](api-conventions.md) và [bảng mã lỗi chung](error-codes.md). Đây là đầu ra S01 ngày 05/11/2026: cách đặt route/field, response, validation, requestId/retry, phân trang, ack/event và cách chia trách nhiệm backend. Hằng status cùng schema envelope nằm trong packages/contracts; endpoint/payload theo miền và middleware nghiệp vụ vẫn cần triển khai theo task. Quy ước mới là nguồn chung cho các proposal; tên/mã dự kiến khác trong proposal cần đối chiếu trước code phụ thuộc.

Source schema ở `packages/contracts/src`, frontend và backend import qua `@colearnia/contracts`.

**Auth/profile (SCRUM-12):** [contract và ví dụ](auth-profile.md), schema input/output và identity nội bộ trong `auth.ts`; chờ M4 review trước khi consumer dùng. Upload avatar tiếp tục ở M1-T1.3 với M2; chưa có endpoint chỉ từ contract này.

**Workspace/kênh (SCRUM-13):** [contract và điểm giao M2/M4](workspace-channels.md), schema trong `workspace.ts`, chữ ký hàm nội bộ tại `apps/server/src/workspaces/ports.ts`, type shell/sidebar tại `apps/web/src/features/workspaces/shell-contract.ts`. Cần M2/M4 review trước tích hợp; chưa có resolver, transaction Workspace/general hoặc cleanup nghiệp vụ. Nền connection/transaction dùng chung và kiểm DB riêng ở [runbook SCRUM-15](../runbooks/mongodb-transactions.md).

**Messaging access (SCRUM-14 / M2-T1.1):** [identity, general, thu quyền và ngân sách handler](messaging-access.md); typed ports/consumer fixture trong `apps/server/src/messaging/`. Chờ M1 review, M4 xác nhận runtime/cleanup trước consumer; chưa có provider ACL, factory Mongo hoặc admission runtime thật.

Đã có: API error/response, Workspace/channel inputs, session command envelope và system status. Chưa có handler nghiệp vụ tương ứng chỉ vì schema đã được tạo.

Khi thêm command:

1. Zod schema strict cho payload, ack và server event.
2. Liệt kê quyền và revision/generation cần kiểm.
3. Thêm ví dụ thành công, sai quyền và stale state.
4. Đặt tên thống nhất frontend/backend; không tin `actorId`, `groupId` hoặc `source` chỉ vì input hợp schema.
5. Kiểm payload limits và idempotency theo kế hoạch v2.

REST error: `{ error: { code, message }, requestId }`. Không gửi raw database error/stack/credentials tới client.

## Contracts messaging cần bổ sung theo feature

Nguồn nghiệp vụ: [messaging](../product/messaging.md); nguồn scope: CHAT-01/02/03, FILE-01 và HELP-01 trong [scope](../product/scope.md). Đây là danh mục thiết kế, không khẳng định schemas/handlers đã tồn tại.

- Phân biệt conversation CHANNEL/DIRECT bền theo Workspace với SESSION/GROUP/HOST_PRIVATE của cuộc họp. Không yêu cầu LiveSession epoch/callGeneration để gửi DM hoặc reply kênh; auth, membership và conversation ACL vẫn bắt buộc.
- DIRECT open/list/history/send: recipient là một user khác trong Workspace; server gán actor, chuẩn hóa cặp và kiểm membership. Chỉ trả hội thoại/metadata đúng hai bên; vai trò admin không cấp quyền đọc.
- Message payload có clientMessageId, text/attachment refs và rootMessageId nếu là thread TEXT. Root phải cùng conversation, là tin gốc, chưa mất quyền; server kiểm các điều này sau validate. DM/cuộc họp không nhận rootMessageId để tự mở thread ngoài scope.
- Kênh main history chỉ trả root; replies có cursor riêng, ack/event chứa đủ conversation/root để client cập nhật đúng panel và reply count, không nhân reply thành một tin chính. Quy tắc cursor/order và schema count cụ thể hóa cùng task DB; dedupe/retry không tăng count lặp.
- Upload/bind kiểm loại attachment theo conversation: CHANNEL/DIRECT/thread TEXT cho text/ảnh/file; chat cuộc họp chỉ text/ảnh. Event và file content phải dùng cùng ACL như history, không gửi metadata DM tới Workspace room chung.
- Ca contract/service phải có root sai kênh, actor/recipient giả, người thứ ba/admin dò DM, attachment khác conversation, duplicate send/reply và mất membership giữa upload/gửi/fanout.

## Contracts group modes và countdown v2.3

Nguồn: [group modes](../product/group-modes.md). Create cần tên/mục đích/member IDs và kiểm quyền/phase/roster rồi tạo ngay; không host approve/reject. Payload không tự cấp ACTIVITY, membership hoặc share. group.leave chỉ chuyển actor, không assign người khác.

Source/lease/board payload cần scopeId, source ID/generation/revision đúng nguồn; MAIN exclusivity không dùng làm cap cả session; mỗi ACTIVITY có một nguồn riêng độc lập. DISCUSSION publish SCREEN/SCREEN_AUDIO luôn deny; mọi member ACTIVITY được share không host approval, acquire chỉ là giữ chỗ tự động; nguồn bận không được giành. Board dùng nguồn screen duy nhất của nhóm. Snapshot chỉ có nguồn/board/file đúng audience, không gửi MAIN media metadata cho ACTIVITY để client tự giấu.

Countdown dùng roundId, deadline và server time; host đặt thời lượng khi tổ chức, lượt bắt đầu thành công phải có deadline. Đến hạn server tự kết thúc đúng lượt ACTIVITY: deny scope cũ, đóng share/media/help/chat/board nhóm, đưa người còn quyền về MAIN và pause mic; hoàn tất cleanup mới về GUIDANCE. Event expired không chỉ là thông báo UI hoặc lệnh client tự đóng nhóm. Mutation kiểm round/epoch/deadline, idempotent với callback lặp/trễ; reconnect sau deadline không cấp lại scope cũ. Không giữ command host đóng riêng ACTIVITY/kết thúc lượt thủ công; đóng DISCUSSION vẫn theo quyền host. Thêm group.join cho người trong danh sách hợp lệ, chỉ cấp membership sau thao tác Vào nhóm; create/join phải kiểm phase GUIDANCE. Tên command/state chi tiết cần thiết kế theo task; duration 1–120 phút và không edit/pause/extend khi chạy đã chốt ngày 01/11, chưa là schema đã triển khai.

## Host và MAIN share — xác nhận 27/10/2026

[Contract ID, lệnh và ack phiên họp (SCRUM-22)](session-commands.md) định nghĩa `SessionScopeRef` để tham chiếu phòng chung hoặc nhóm trong phiên. Đã bỏ `sessionModeSchema`/`SessionMode` theo quyết định chỉ có một kiểu cuộc họp.

[Contract context và cleanup phiên (SCRUM-23)](session-context.md) định nghĩa DTO nội bộ, phạm vi thu quyền, kết quả cleanup, thứ tự khóa và giới hạn control/snapshot để các miền review.

[Policy và projection phiên (SCRUM-65)](session-policy.md) kiểm quyền theo role/scope, membership thực tế và quyền kênh, đồng thời lọc metadata cho từng người nhận.

[Snapshot và sự kiện theo người nhận (SCRUM-66)](session-projection.md) cung cấp schema công khai, cursor/sequence, chia và ghép snapshot nhất quán cùng quy tắc resync theo audience.

[Contract thu quyền và cleanup media (SCRUM-56)](media-cleanup.md) dùng contract SCRUM-23 và có fixture cho ack, timeout và callback cũ.

[Ví dụ join và nguồn media (SCRUM-44)](media-join-source.md) ghép envelope và context đã có thành các ca hợp lệ, sai quyền và stale cho M3/M4 review. Có fixture contract để controller, shell và registry đối chiếu.

[Contract snapshot và event nguồn media (SCRUM-57)](media-source-sync.md) định nghĩa descriptor, resync, snapshot và delta theo người nhận. Có fixture watermark, gap, đổi audience và own Producer PAUSED/SWITCHING.

[Contract REST bootstrap, ICE và context proof (SCRUM-58)](media-bootstrap.md) định nghĩa schema strict, binding giữa HTTP và socket ownership, cùng fixture hai tab và ICE sai đời.

Chỉ có một kiểu cuộc họp; bỏ session.setMode, thao tác tự nhận host và screen.grant/revoke theo host khỏi danh mục thiết kế đích. Tạo phiên gán người bắt đầu làm host; join phiên có sẵn không chiếm host. Luồng chuyển host trực tiếp kiểm host hiện tại, target đang kết nối/còn quyền và revision, không có invite/accept hoặc chờ expiry của lời mời; tên event/payload cụ thể chốt trong task contracts, chưa có schema nghiệp vụ chỉ từ tài liệu này; không tự dừng MAIN share còn hợp lệ khi đổi host. Mọi participant ở MAIN acquire/release nguồn tự động, không xin host; nguồn bận từ chối, không giành. Group mode DISCUSSION/ACTIVITY vẫn cần kiểm như trên. Ca kiểm: join đồng thời chỉ một host; member không transfer thay host; MAIN share cạnh tranh; chuyển host không làm mất nguồn share hợp lệ. Phát hiện host mất kết nối: thu ngay mọi quyền kết nối cũ, server chọn ngay ngẫu nhiên participant đang kết nối/hợp lệ làm host tạm, lưu danh tính host cần hoàn quyền và revision; khi người cũ reconnect/join lại hợp lệ trong cùng phiên thì tự thu quyền host tạm và hoàn lại, phát host.changed. Cả chuyển chủ động và thay tạm/hoàn quyền đều không cần người nhận chấp nhận; client không tự khai quyền hoàn lại. Kiểm race reconnect/timeout, quyền cũ và cleanup help/announcement. Host chủ động rời khi còn quyền kết thúc phiên cho mọi người; người đã bàn giao chính thức rời như thành viên. Kiểm race giữa transfer và lệnh kết thúc theo role/revision hiện hành; không xử lý rời/kết thúc bằng quyền cũ. Các nhánh không có ứng viên/host tạm mất mạng theo [vòng đời host](../product/live-session.md#83-chuyển-host-và-host-mất-mạng), không tự thêm quyền ưu tiên owner/admin hoặc đồng host.

## Làm rõ luồng UC ngày 29/10/2026

Theo [group modes](../product/group-modes.md), activity.start thất bại sau khi chuyển một phần thì hủy lượt đó: thu private scope ACTIVITY vừa mở, hủy countdown của lượt, đưa người còn quyền về MAIN và không khôi phục DISCUSSION đã đóng. Projection/event phải thể hiện đang hủy và đã hủy theo trạng thái thật; tên schema/enum cụ thể thiết kế khi triển khai, không dựng enum executable từ đợt tài liệu này. Retry hoặc lệnh cũ không nhân lượt hoặc mở lại nguồn đã thu.

Theo [policy hỗ trợ](../product/groups-media-policy.md#81-host-group-và-hỗ-trợ), host.help.leave do host chủ động thực hiện không cần ack xác nhận scope mic riêng: thu scope nhóm rồi về MAIN, giữ trạng thái bật/tắt mic. Không hiểu “giữ trạng thái” là cho kết nối cũ tiếp tục phát xuyên scope; đổi quyền phải chặn media/fanout cũ. Sự cố/mất quyền/nhóm đóng không tự phát tiếng hỗ trợ ra MAIN.

## Quyết định Workspace/nhóm ngày 01/11/2026

Contract đích dùng WORKSPACE/PRIVATE độc lập TEXT/LIVE, thay tên RESTRICTED cũ. Quản lý danh sách PRIVATE chỉ owner/admin; ACL đọc/gửi/event/file/LIVE cần danh sách và membership, không dùng role thay quyền nội dung. Thêm/re-add thấy lịch sử kênh còn lưu; DM mở lịch sử lại khi cả hai membership hợp lệ. Riêng quyền PRIVATE cũ phải vô hiệu khi loại khỏi Workspace; rejoin không phục hồi, owner/admin cần thêm lại. Cần contract quản lý danh sách PRIVATE, nhưng endpoint/event/payload cụ thể phải thiết kế trong task implementation; chưa có schema chỉ vì đã ghi ở đây.

DISCUSSION: tên ≤80, mục đích ≤500, roster hợp lệ không trùng/cùng phiên; create hợp lệ tạo ngay, không approve/reject/cancel-pending nghiệp vụ. Retry không nhân nhóm; create/join kiểm phase hiện hành. ACTIVITY random preview không cấp scope, host được chỉnh trước start; start kiểm lại roster, không random trong lượt. Duration số nguyên 1–120 phút. Nguồn: [group modes](../product/group-modes.md).

## Đầu vào thiết kế DB bước 4 — 01/11/2026

Nguồn field/scope: [collection-design](../database/collection-design.md). Document ID dùng ObjectId nội bộ/chuỗi hex ra API; runtime ID và requestId/clientMessageId dùng UUID. Contract phiên đã dùng schema đúng loại ID; `resourceIdSchema` scaffold vẫn là chuỗi rộng ở các phần khác. `workspace.ts` đã dùng WORKSPACE/PRIVATE, ObjectId và snapshot membership/incarnation/revision theo [SCRUM-13](workspace-channels.md); schema không thay kiểm grant/ACL tại server. M4 dùng alias trực tiếp từ schema thu quyền chung `accessRevocationSchema` theo [SCRUM-23](session-context.md), gồm membership/incarnation bắt buộc cho PRIVATE.

Scope/binding hội thoại/file là cấu trúc theo kind/purpose, không payload Mixed tùy ý. Membership incarnation và grants là quyền server, không cho client tự khai version để được cấp PRIVATE. Không đưa passwordHash/tokenHash/storageKey hoặc document Mongoose nguyên bản vào response. Đây là đầu vào thiết kế, chưa đổi source contract hoặc tạo endpoint mới.

## Đầu vào integrity bước 5

Theo [đặc tả DB bước 5](../database/integrity-and-migrations.md), boundary strict không nhận actor/scope authority, grant incarnation hoặc Mongo update operators từ client. pairKey là khóa server suy từ cặp user, không là quyền truy cập. Message retry cùng clientMessageId khác payload phải conflict; không áp idempotency chung cho mọi POST nếu chưa có cơ chế bền.

Thống nhất cách đếm code point cho giới hạn text/tên giữa contract/service/DB; nullable/variant fields lấy tại collection-design. Error duplicate key phải map theo đúng constraint, không lộ raw DB error và không mặc định mọi E11000 là retry thành công. Chưa đổi source Zod/Mongoose trong bước tài liệu này.

## Board: thay đổi nghiệp vụ 02/11/2026

Theo [board](../product/board-collaboration.md), MAIN chỉ overlay LIVE do host hiện hành ở MAIN/hướng dẫn vẽ; deny freeze/resume và file FRAME MAIN cho mọi actor. Nhóm giữ freeze/vẽ/resume theo nguồn riêng. Contract nét phải phân biệt nét thường và nét tự biến mất tại MAIN, gắn author/context/source revision; thời gian/fade chưa chốt. Đổi/dừng nguồn MAIN dọn overlay, đổi host thu quyền cũ và kiểm lại mọi mutation đang chờ. Đây là yêu cầu cho task contract, chưa có schema board đã triển khai.

## Ràng buộc nhóm cập nhật ngày 02/11/2026

- `host.help.enter` chỉ nhận đích ACTIVITY còn mở trong lượt hiệu lực; từ chối DISCUSSION ngay cả khi actor là host hoặc có ảnh gửi riêng. DISCUSSION chỉ hỏi/trả lời qua HOST_PRIVATE, không cấp board/media nhóm cho host.
- DISCUSSION phân biệt roster hợp lệ, số người hiện trong nhóm và việc nhóm đã từng có người tham gia. Đây là thông tin thiết kế runtime/projection, chưa chọn field hoặc enum executable mới.
- `group.leave`/rời LIVE chủ động của người cuối cùng trong DISCUSSION đã có người phải kết thúc nhóm trong cùng điều phối vòng đời; sau đó chặn join/intent chậm, thu private scope và bỏ quyền vào từ roster cũ. Nếu còn người thì actor trong roster có thể chủ động join lại sau kiểm quyền/phase/nhóm hiện hành.
- Nhóm tạo hợp lệ chưa ai vào vẫn chờ. Mất mạng không tự là lệnh rời; ACTIVITY vẫn theo deadline. Contract consumers phải phân biệt các nhánh này theo [nguồn nghiệp vụ](../product/group-modes.md), không thêm timeout hoặc tự mở lại nhóm đã đóng.

## Bổ sung recording MAIN sau kickoff 02/11

RECORD-01 theo [nguồn nghiệp vụ](../product/recording.md): host điều khiển ghi màn hình/camera/âm thanh MAIN; lưu theo phiên để thành viên còn quyền kênh xem. Không ghi nhóm riêng hoặc chuyển recorder theo host hỗ trợ. Chưa có implementation hoặc benchmark. Proposal M3 chủ trì, M4 cung cấp host/scope/lifecycle, M2 lưu/phục vụ byte/ACL, M1 quyền kênh.

Cần chọn capture/composition/encode, bố cục/số camera/codec và cách phát, trạng thái xử lý, idempotency, cleanup khi stop/end/error/restart, quota/retention/quyền xóa. Chưa chốt thư viện, topology recorder, collection hoặc schema executable. Không coi recorder là participant được nghe mọi scope. Không giữ queue/mutex phiên khi chờ encode/lưu file; task phải thiết kế gate tài nguyên và giao diện cleanup. Đo CPU/RAM/disk/network cùng media/chat/board/TURN trước khi chốt capacity; PoC clip vài phút không là giới hạn thời lượng sản phẩm. REC-01 vẫn là reconnect, không dùng mã đó cho recording.

## Quyết định phiên/nhóm ngày 04/11/2026

Không triển khai `participant.move`. `group.join` kiểm DISCUSSION roster/GUIDANCE hoặc đúng ACTIVITY đã phân của round còn mở, không nhận nhóm khác; host hiện hành chỉ dùng `host.help.enter/leave` và không nằm trong draft member. Disconnect DISCUSSION thu membership ngay; nhóm từng có người rỗng thì close; reconnect về MAIN. Host rớt bị thu quyền kết nối cũ/thay tạm ngay; reconnect grace của call ownership vẫn tối đa 30 giây. Không empty grace; phiên rỗng end ngay qua coordinator và kiểm race join. Recording theo [vòng đời hiện hành](../product/recording.md); công cụ/metadata/byte dở cần contract/PoC.
