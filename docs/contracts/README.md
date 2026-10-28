# Contracts

Source schema ở `packages/contracts/src`, frontend và backend import qua `@colearnia/contracts`.

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

Nguồn: [group modes](../product/group-modes.md). Command request cần tên/mục đích/member IDs; approve/reject lấy host từ auth và kiểm lại session/members. Payload không tự cấp ACTIVITY, group membership hay share. Command group.leave chỉ chuyển actor; không dùng như quyền assign người khác.

Source/lease/board payload cần scopeId, source ID/generation/revision đúng nguồn; MAIN exclusivity không dùng làm cap cả session; mỗi ACTIVITY có một nguồn riêng độc lập. DISCUSSION publish SCREEN/SCREEN_AUDIO luôn deny; mọi member ACTIVITY được share không host approval, acquire chỉ là giữ chỗ tự động; nguồn bận không được giành. Board dùng nguồn screen duy nhất của nhóm. Snapshot chỉ có nguồn/board/file đúng audience, không gửi MAIN media metadata cho ACTIVITY để client tự giấu.

Countdown activityRound.start/state/expired dùng roundId, deadline và server time; quyền host được kiểm khi start, expire chỉ phát nhắc. Không nối expired vào closeAll/mute/revoke. Thêm group.join cho người trong danh sách đã duyệt, chỉ cấp membership sau thao tác Vào nhóm; join/approval/request phải kiểm phase GUIDANCE. activityRound.start phải phân biệt với thao tác bắt đầu phase ACTIVITY, vì hết giờ không kết thúc phase. Duration limits và edits còn là chi tiết cần thiết kế theo task. Các schema hiện có chưa chứng minh những command này đã tồn tại.

## Host và MAIN share — xác nhận 27/10/2026

**Khoảng cách với scaffold:** `packages/contracts/src/session.ts` vẫn export `sessionModeSchema`/`SessionMode` theo FREE/MODERATED cũ, hiện chưa có consumer nghiệp vụ trong apps/packages. Đây là di sản scaffold, không ghi đè quyết định mới; cần loại bỏ cùng task triển khai contract phiên trước khi dùng cho feature. Đợt chốt nghiệp vụ/UC này chưa sửa source schema.

Chỉ có một kiểu cuộc họp; bỏ session.setMode, thao tác tự nhận host và screen.grant/revoke theo host khỏi danh mục thiết kế đích. Tạo phiên gán người bắt đầu làm host; join phiên có sẵn không chiếm host. host.transfer.invite/accept kiểm host hiện tại, target đang tham gia, xác nhận/expiry/revision; không tự dừng MAIN share còn hợp lệ khi đổi host. Mọi participant ở MAIN acquire/release nguồn tự động, không xin host; nguồn bận từ chối, không giành. Group mode DISCUSSION/ACTIVITY vẫn cần kiểm như trên. Ca kiểm: join đồng thời chỉ một host; member không transfer thay host; MAIN share cạnh tranh; chuyển host không làm mất nguồn share hợp lệ. Mất mạng quá grace: server chọn ngẫu nhiên participant đang kết nối/hợp lệ làm host tạm, lưu danh tính host cần hoàn quyền và revision; khi người cũ reconnect/join lại hợp lệ trong cùng phiên thì tự thu quyền host tạm và hoàn lại, phát host.changed. Không dùng invite/accept cho chuyển tự động; client không tự khai quyền hoàn lại. Kiểm race reconnect/timeout, quyền cũ và cleanup help/announcement. Các nhánh rời chủ động/nhiều sự cố theo [vòng đời host](../product/live-session.md#83-chuyển-host-và-host-mất-mạng), không tự thêm quyền ưu tiên owner/admin hoặc đồng host.
