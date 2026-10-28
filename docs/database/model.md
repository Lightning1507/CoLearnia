# Mô hình dữ liệu và trạng thái runtime

**Trạng thái:** Thiết kế đích, chưa phải Mongoose schemas/migrations đã tồn tại. Scaffold mới có database connector và Mongo replica set.

Nội dung mục 9.1–9.2 được chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026; cách diễn đạt ownerId đã được làm rõ theo review cùng ngày để tránh suy thành unique index. Đã cập nhật runtime/chat theo quyết định team 27/10/2026, baseline v2.3. Đây là nguồn chi tiết cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

### 9.1. MongoDB bền vững

| Collection          | Trường/ràng buộc chính                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| users               | emailNormalized unique, passwordHash, displayName, status                                                                        |
| authSessions        | userId, tokenHash unique, expiresAt, revokedAt; TTL dọn, request vẫn tự kiểm hạn                                                 |
| workspaces          | name, ownerId tham chiếu owner của Workspace, deletedAt; đồng bộ với owner membership                                            |
| memberships         | workspaceId+userId unique, role, status                                                                                          |
| invitations         | tokenHash unique, workspaceId, expiresAt, revokedAt, maxUses, uses                                                               |
| channels            | workspaceId, type bất biến, name/order, accessMode, allowedUserIds, deletedAt                                                    |
| conversations       | kind CHANNEL/DIRECT/SESSION/GROUP/HOST_PRIVATE, scope refs, participants cho tin riêng, closedAt, purgeAt                        |
| messages            | conversationId, senderId, clientMessageId, text, attachmentIds, rootMessageId nullable cho thread TEXT, createdAt; dedupe unique |
| files               | storageKey unique, uploaderId, purpose, accessRef, mime/size/dimensions, state, expiresAt                                        |
| liveSessions        | channelId, epoch, hostUserId, status, startedAt/endedAt, revision                                                                |
| sessionParticipants | sessionId+userId unique, joinedAt/leftAt, current group metadata; không là nguồn runtime sau restart                             |
| auditEvents         | actor, action, scope/target, revision, timestamp; không lưu chat/audio/token                                                     |

Không tạo SavedArtifact, polls, votes hoặc timers trong bản này. GroupRuntime không bắt buộc có collection: dữ liệu private chỉ được đọc khi session/group runtime còn hợp lệ. Conversation giữ refs và closedAt/purgeAt để khóa và dọn dù runtime đã mất.

Index bắt buộc: messages unique `(conversationId,senderId,clientMessageId)`; history `(conversationId,createdAt,_id)`; liveSessions unique channelId với partial filter status ACTIVE/ENDING; indexes tra membership/channel/files; TTL cho auth/purge metadata phù hợp. Migration tạo index và test trên bản Mongo được pin, không chỉ dựa autoIndex của Mongoose.

Một Workspace có đúng một owner. Không có thao tác hạ/xóa owner trực tiếp; transfer cập nhật ownerId và roles trong transaction. Owner rời phải transfer trước hoặc xóa Workspace.

### 9.2. Runtime

SessionRuntime giữ state/queue/participants, help và share leases/ownership; GroupRuntime giữ mode DISCUSSION/ACTIVITY và membership; MediaRuntime giữ objects thật; BoardRuntime giữ intents/frame/strokes; ActiveCallRegistry theo user giữ callGeneration. Không serialize transport/producer vào DB. Presence socket không là identity lâu dài.

## Chi tiết cần hoàn thiện trong task database

- Danh mục trên là baseline, không là schema thực. Khi triển khai từng collection, ghi types/nullability, enum/validation và index specification chính xác trong source/migration cùng PR.
- Cần xác nhận cách biểu diễn soft-delete/status, partial filter ACTIVE/ENDING và TTL/purge trên phiên bản Mongo pin; có ca đồng thời/rollback. Không tự chạy migration từ task tài liệu.
- Quy tắc đã chốt là mỗi Workspace có đúng một owner. Không suy từ đó ra `unique(ownerId)` trên toàn collection; cardinality user–Workspace cần được mô tả rõ khi thiết kế index, không tự bổ sung giới hạn một Workspace cho mỗi user.
- GroupRuntime không bắt buộc persist. Nếu cần collection hỗ trợ nhóm, ghi lý do, vòng đời, ACL và review thiết kế trước khi triển khai; không coi collection nhóm là tính năng ngoài scope.
- Auth hashing implementation, các field phụ và cách migrate dữ liệu hiện hữu chưa được chốt chỉ bằng tài liệu này. Không thêm collections cho artifact/quiz/timer ngoài scope. Xem [trạng thái quyết định](../decision-status.md).

Nguồn liên quan: [lifecycle](lifecycle.md), [contracts](../contracts/README.md), [Workspace](../product/workspace-channels.md).

Chat cuộc họp (HELP-01) chỉ cho text/ảnh. Everyone chọn conversation SESSION cho MAIN hoặc GROUP hiện tại; Host chọn HOST_PRIVATE gắn đúng host nhận. Scope/recipient không lấy nguyên từ client mà phải kiểm tại thời điểm gửi. CHANNEL chat/tài liệu vẫn cho tệp theo FILE-01. Không tạo model FloorGrant/PresentationView trong bản hiện tại.

### Bổ sung thiết kế messaging

Theo [messaging](../product/messaging.md), DIRECT có workspaceId và đúng hai participant user IDs; khóa cặp chuẩn hóa không phân biệt thứ tự, unique theo Workspace để chống tạo trùng. Không dùng HOST_PRIVATE cho DM bền vững. Messages giữ cùng conversation khi reply; root thuộc cùng conversation CHANNEL, chỉ một cấp. History kênh lọc tin gốc, replies có cursor riêng. Index root/cursor, ràng buộc cặp và cập nhật reply count phải được thiết kế/test trong migration; đây chưa là schema executable. Không cần tạo collection thread riêng mặc định.

### Nhóm và countdown v2.3

[Group modes](../product/group-modes.md) thêm request tên/mục đích/danh sách người và activity round deadline. Hướng thiết kế là runtime của LiveSession, không tự thêm collection timer bền vững; request schema/TTL và group persistence cụ thể vẫn cần thiết kế theo task. Danh sách được duyệt khác membership đã bấm Vào nhóm; session groupPhase chặn DISCUSSION trong lượt ACTIVITY. Member ACTIVITY share không host duyệt, mỗi group một nguồn active và board bám nguồn đó. Audit ghi hành động/ID và kết quả, không sao chép mục đích/nội dung chat riêng vào log. Source registry/board refs cần scope+source generation; metadata participant không tự cấp quyền loại nhóm sau restart. Timer expired chỉ là state để nhắc, không là transaction đóng group.
