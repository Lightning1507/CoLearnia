# Mô hình dữ liệu và trạng thái runtime

**Trạng thái:** Thiết kế đích, chưa phải Mongoose schemas/migrations đã tồn tại. Scaffold mới có database connector và Mongo replica set.

Nội dung mục 9.1–9.2 được chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026; cách diễn đạt ownerId đã được làm rõ theo review cùng ngày để tránh suy thành unique index. Đây là nguồn chi tiết cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

### 9.1. MongoDB bền vững

| Collection          | Trường/ràng buộc chính                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| users               | emailNormalized unique, passwordHash, displayName, status                                            |
| authSessions        | userId, tokenHash unique, expiresAt, revokedAt; TTL dọn, request vẫn tự kiểm hạn                     |
| workspaces          | name, ownerId tham chiếu owner của Workspace, deletedAt; đồng bộ với owner membership                |
| memberships         | workspaceId+userId unique, role, status                                                              |
| invitations         | tokenHash unique, workspaceId, expiresAt, revokedAt, maxUses, uses                                   |
| channels            | workspaceId, type bất biến, name/order, accessMode, allowedUserIds, deletedAt                        |
| conversations       | kind CHANNEL/SESSION/GROUP/HOST_PRIVATE, scope refs, participants cho tin riêng, closedAt, purgeAt   |
| messages            | conversationId, senderId, clientMessageId, text, attachmentIds, createdAt; dedupe unique             |
| files               | storageKey unique, uploaderId, purpose, accessRef, mime/size/dimensions, state, expiresAt            |
| liveSessions        | channelId, epoch, mode, hostUserId, status, startedAt/endedAt, revision                              |
| sessionParticipants | sessionId+userId unique, joinedAt/leftAt, current group metadata; không là nguồn runtime sau restart |
| auditEvents         | actor, action, scope/target, revision, timestamp; không lưu chat/audio/token                         |

Không tạo SavedArtifact, polls, votes hoặc timers trong bản này. GroupRuntime không bắt buộc có collection: dữ liệu private chỉ được đọc khi session/group runtime còn hợp lệ. Conversation giữ refs và closedAt/purgeAt để khóa và dọn dù runtime đã mất.

Index bắt buộc: messages unique `(conversationId,senderId,clientMessageId)`; history `(conversationId,createdAt,_id)`; liveSessions unique channelId với partial filter status ACTIVE/ENDING; indexes tra membership/channel/files; TTL cho auth/purge metadata phù hợp. Migration tạo index và test trên bản Mongo được pin, không chỉ dựa autoIndex của Mongoose.

Một Workspace có đúng một owner. Không có thao tác hạ/xóa owner trực tiếp; transfer cập nhật ownerId và roles trong transaction. Owner rời phải transfer trước hoặc xóa Workspace.

### 9.2. Runtime

SessionRuntime giữ state/queue/participants; GroupRuntime giữ membership; MediaRuntime giữ objects thật; BoardRuntime giữ intents/frame/strokes; GrantRuntime giữ floor/consent/projection; ActiveCallRegistry theo user giữ callGeneration. Không serialize transport/producer vào DB. Presence socket không là identity lâu dài.

## Chi tiết cần hoàn thiện trong task database

- Danh mục trên là baseline, không là schema thực. Khi triển khai từng collection, ghi types/nullability, enum/validation và index specification chính xác trong source/migration cùng PR.
- Cần xác nhận cách biểu diễn soft-delete/status, partial filter ACTIVE/ENDING và TTL/purge trên phiên bản Mongo pin; có ca đồng thời/rollback. Không tự chạy migration từ task tài liệu.
- Quy tắc đã chốt là mỗi Workspace có đúng một owner. Không suy từ đó ra `unique(ownerId)` trên toàn collection; cardinality user–Workspace cần được mô tả rõ khi thiết kế index, không tự bổ sung giới hạn một Workspace cho mỗi user.
- GroupRuntime không bắt buộc persist. Nếu cần collection hỗ trợ nhóm, ghi lý do, vòng đời, ACL và review thiết kế trước khi triển khai; không coi collection nhóm là tính năng ngoài scope.
- Auth hashing implementation, các field phụ và cách migrate dữ liệu hiện hữu chưa được chốt chỉ bằng tài liệu này. Không thêm collections cho artifact/quiz/timer ngoài scope. Xem [trạng thái quyết định](../decision-status.md).

Nguồn liên quan: [lifecycle](lifecycle.md), [contracts](../contracts/README.md), [Workspace](../product/workspace-channels.md).
