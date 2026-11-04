# Mô hình dữ liệu và trạng thái runtime

**Cập nhật recording ngày 05/11/2026:** phần 13 collection trước recording giữ làm baseline cũ; delta `recordings` và `files: RECORDING` theo [schema bàn giao](recordings-schema.md), đã được proposal M2 nhận làm thiết kế. Profile MP4/H264/AAC, tối đa 3 tiếng/đoạn, READY giữ vô thời hạn; quota, bản tạm/lỗi và xóa byte sau parent deletion còn cần review. Các ghi chú recording “chưa có field/index” bên dưới phản ánh mốc trước delta; chưa có schema/index/migration thực thi hoặc test sản phẩm đạt.

**Trạng thái:** thiết kế đích đã [review chéo bước 6](review-2026-11-01.md). Bước 4–5 ngày 01/11/2026 đã mô tả collection/document và đặc tả integrity/migration; chưa có Mongoose schemas, index/migration nghiệp vụ hoặc bằng chứng feature chạy chỉ từ tài liệu này. Scaffold có database connector và Mongo replica set.

Đọc theo thứ tự: [UC ↔ dữ liệu](uc-data-map.md) → [mô hình nghiệp vụ](conceptual-model.md) → [nơi lưu/vòng đời](lifecycle.md) → [collection/field/nhúng-tham chiếu](collection-design.md) → [index/validation/concurrency/migration](integrity-and-migrations.md). E01–E16 là khái niệm, không phải 16 collection.

Mục 9.1–9.2 giữ số từ [technical plan](../technical-plan.md) để truy vết; chi tiết field và lựa chọn vật lý hiện hành do collection-design sở hữu, retention/cleanup do lifecycle sở hữu, cơ chế transaction/khóa/index do integrity-and-migrations sở hữu. Không dùng khung allowedUserIds/accessRef cũ như schema song song với bản thiết kế mới.

Để xem trực quan hoặc xuất ảnh: [DBML 13 collection cho dbdiagram.io](diagrams/README.md). Đây là bản vẽ từ thiết kế, không phải SQL/schema hoặc database đang chạy.

**Vận hành/capacity bản đầu:** MongoDB local dùng Docker Compose (mongo:8.0.16, rs0 một node, named volume); chưa tạo collection chỉ bằng chạy mongo-init. Theo [capacity](../capacity.md), hướng kiểm chứng 25 rồi thử 50, chưa có cam kết phát hành. Giữ 13 collection; kiểm gate/quota/stamp/query trước đổi field, không thêm Redis/sharding từ mục tiêu số người.

### 9.1. MongoDB bền vững

Thiết kế có **13 collection**: 12 collection baseline và channelAccessGrants biểu diễn quyền PRIVATE theo UC-WS-15. Collection mới là quan hệ quyền đã được đồng ý, không thêm tính năng hay actor.

| Collection          | Vai trò và quyết định chính                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| users               | Danh tính và thông tin xác thực; không nhúng membership                                              |
| authSessions        | Phiên xác thực/tokenHash, expiry/revoke server                                                       |
| workspaces          | Owner duy nhất trong từng Workspace, revision và tombstone                                           |
| memberships         | Một cặp Workspace/user, role/status; incarnation tăng khi rejoin sau bị loại                         |
| invitations         | Link mời có tokenHash, hạn/thu hồi/giới hạn lượt                                                     |
| channels            | TEXT/LIVE và WORKSPACE/PRIVATE; không nhúng mảng quyền                                               |
| channelAccessGrants | Grant theo channel/membership/incarnation; thay allowedUserIds, không tự phục hồi PRIVATE sau rejoin |
| conversations       | CHANNEL/DIRECT/SESSION/GROUP/HOST_PRIVATE; scope theo kind, đóng/purge                               |
| messages            | Tin/reply độc lập, dedupe, root reference và attachment IDs                                          |
| files               | Metadata có purpose/scope/binding và lịch dọn; byte ở kho private                                    |
| liveSessions        | Metadata lifecycle/host/epoch; không thay SessionRuntime                                             |
| sessionParticipants | Metadata tham gia/vị trí gần nhất, không cấp quyền runtime                                           |
| auditEvents         | Actor/action/target/kết quả; không chép nội dung riêng                                               |

Kiểu field, required/null, enum thiết kế và điều kiện theo loại ở [bước 4](collection-design.md). Không có SavedArtifact, polls, votes, timer, request/group/board/stroke collection trong thiết kế hiện tại. GroupRuntime và board/nét ở RAM; conversation/file giữ refs đủ để khóa và dọn sau khi runtime mất.

**Các ràng buộc index baseline phải giữ ở bước 5:** emailNormalized, auth/invitation tokenHash và storageKey unique theo collection; messages dedupe theo conversationId/senderId/clientMessageId; history theo conversation và cursor; một LiveSession ACTIVE/ENDING mỗi channel; một membership mỗi Workspace/user; một DIRECT/cặp/Workspace; index tra membership/channel/grant/files và TTL chỉ cho auth; purge nội dung/tệp bằng job. Key/options cụ thể nằm ở [bước 5](integrity-and-migrations.md), chưa là migration đã chạy. Không chỉ dựa Mongoose autoIndex hay unique validator.

Một Workspace có đúng một owner; transfer owner cập nhật Workspace và hai membership nhất quán. Không unique ownerId trên toàn hệ thống. Một LIVE channel có nhiều phiên qua thời gian; không unique channelId cho mọi lịch sử phiên.

### 9.2. Runtime

SessionRuntime giữ phase, participants/group membership, mutation queue, policyRevision, host tạm/đích hoàn quyền, help/announcement và share ownership. GroupRuntime giữ DISCUSSION/ACTIVITY, roster/phân công và scope. ActivityRound giữ draft/thời lượng/deadline chung. BoardRuntime giữ intent/frame context/nét/sequence. MediaRuntime giữ objects thật; ActiveCallRegistry giữ callGeneration theo user.

Metadata DB revision khác policyRevision runtime; lastScope/hostUserId không khôi phục quyền sau restart. Không serialize transport/producer hoặc từng điểm vẽ vào DB. Byte frame dùng files và kho private, context/refs hiện hành do runtime kiểm. Xem [bước 3](lifecycle.md).

Host theo [live session 8.3](../product/live-session.md#83-chuyển-host-và-host-mất-mạng): gán trực tiếp không chờ chấp nhận; host còn quyền chủ động rời kết thúc phiên. Bàn giao chính thức khác thay tạm/hoàn quyền; không giải quyết nhánh thiếu ứng viên/host tạm mất mạng bằng schema.

## Mức hoàn thiện và bước tiếp

- Bước 4 chọn ObjectId cho document bền/foreign refs, RuntimeId UUID cho đối tượng runtime, Date UTC và cấu trúc có kiểu; không tự sửa schema Zod/code ở đợt tài liệu.
- PRIVATE dùng grant gắn membership incarnation; đổi role không tăng incarnation, bị loại rồi rejoin tăng và cần owner/admin cấp lại grant. DM vẫn cùng conversation khi cả hai membership hợp lệ.
- Thread một cấp trong TEXT, không nhúng reply list; file bind một message hoặc một frame context, không tái dùng frame để mở chat khác scope. HOST_PRIVATE có cặp cố định trong phiên, không đổi audience theo host mới.
- **Bước 5 đã đặc tả:** [index/options/validation, CAS/transaction/deny barrier, quota, purge, migration/rollback và matrix DB-01–12](integrity-and-migrations.md). Chưa có schema/migration hoặc integration test đã chạy; [bước 6](review-2026-11-01.md) ghi kết quả review và điều kiện trước implementation. Chi tiết tham chiếu chéo không được giao phó chỉ cho Mongoose ref/populate.
- Thư viện hash, retention audit/metadata và nhánh host nhiều sự cố vẫn mở tại [trạng thái quyết định](../decision-status.md). Không thêm chức năng quản trị metadata chỉ vì dữ liệu được lưu.

Nguồn liên quan: [contracts](../contracts/README.md), [Workspace](../product/workspace-channels.md), [kiến trúc](../architecture.md). Bước tài liệu này không chạy reset, seed, migration hoặc thay schema DB đang dùng.

## Ảnh hưởng board ngày 02/11/2026

MAIN giữ overlay/nét trong RAM, không freeze/không file FRAME; chỉ board DISCUSSION/ACTIVITY có intent và FrozenFrame. Nét thường MAIN và nét tự biến mất có lifecycle khác nhau theo [board](../product/board-collaboration.md). Giữ 13 collection, không thêm collection nét/board hoặc DB write theo điểm. FRAME yêu cầu groupId hợp lệ; xem [collection design](collection-design.md). Đây là sửa thiết kế, chưa chạy schema/migration.

## Phạm vi mới sau kickoff 02/11

Thiết kế 13 collection hiện có chưa bao phủ đầy đủ recording. Theo [recording](../product/recording.md), cần metadata gắn phiên/kênh, trạng thái xử lý, tham chiếu byte, người khởi tạo/thời gian và thông tin phục vụ cleanup/quota. Video byte ở kho tệp, không nhúng MongoDB. Collection riêng hay mở rộng file metadata, field/index và migration do proposal M2–M3 thống nhất; chưa tạo collection thứ 14 hoặc schema runnable.

DISCUSSION không còn request chờ host; E11 là thao tác tạo được kiểm hợp lệ ngay trong runtime, không collection xét duyệt. ACTIVITY thêm random preview vào cấu hình hiện có, chưa cần thực thể mới.
