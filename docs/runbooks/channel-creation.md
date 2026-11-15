# Tạo kênh TEXT/LIVE — SCRUM-35

## API và quyền

`POST /api/v1/workspaces/:workspaceId/channels` dùng cookie session, Origin và CSRF của auth hiện hành. Body strict theo `createChannelSchema`: `name`, `type` TEXT/LIVE, `accessMode` WORKSPACE/PRIVATE (mặc định WORKSPACE), UUID `requestId`, tùy chọn `replayOnly: true`. Tên trim, 1–80 Unicode code point, được phép trùng tên. Server gán actor từ session. HTTP 201 trả `channelResponseSchema`, chỉ metadata kênh.

Service `createChannelCreator` dùng cùng connection và coordinator bootstrap; thứ tự khóa User → Workspace. Kiểm User/session/membership còn hiệu lực, Workspace chưa xóa và deny barrier dưới khóa; OWNER/ADMIN mới tạo được kênh. Member trả 403; Workspace không tồn tại/ngoài quyền trả 404. Kiểm lại trong transaction và trước khi trả kết quả. Các service đổi quyền phải dùng cùng coordinator.

Channel, conversation CHANNEL của TEXT và audit CHANNEL_CREATE/SUCCEEDED cùng transaction. Factory M2 nhận chính ClientSession của M1. LIVE không tạo conversation TEXT và chưa khởi động cuộc gọi. PRIVATE chưa tạo grant, kể cả cho người tạo: metadata quản trị không là quyền đọc/gửi/vào LIVE. Quản lý danh sách PRIVATE và sidebar thuộc các task sau.

## Provisioning và rollback

Dùng preflight tạo Workspace hiện hành: các collection users/authSessions/workspaces/memberships/channels/conversations/auditEvents, index auth/membership/channel/conversation/audit theo [runbook Workspace](workspace-creation.md). Không thêm collection/index hay env mới. Không tạo schema/index trong HTTP request hoặc tự migrate khi startup. Service chỉ mở khi auth và Workspace preflight đạt.

Khi lỗi trước commit, transaction hủy cả Channel, conversation và audit. Retry transient giữ ID/timestamp được cấp trước callback. Không thực hiện network fanout trong callback. Nếu commit chưa rõ, đối chiếu majority bằng audit ID đã cấp sẵn trong RAM; không dùng audit requestId làm ledger xuyên restart. Chỉ báo thành công sau xác nhận, không ghi FAILED cho một commit chưa rõ.

Rollback triển khai: ngừng tiếp nhận POST tạo kênh trước khi quay code về phiên bản cũ. Không drop collection/index dùng chung và không xóa kênh đã commit. Các dữ liệu đã tạo phải được đối chiếu theo Workspace/Channel ID; xóa nghiệp vụ cần luồng thu tài nguyên tương ứng, không dùng raw delete như rollback deployment. Không có migration mới để đảo ngược.

## Retry và kết quả chưa rõ

Khóa RAM: actor + Workspace + CHANNEL_CREATE + requestId chữ thường; fingerprint gồm tên sau trim, type, accessMode. Cùng khóa/payload trả metadata hiện hành của kênh sau kiểm lại quyền; khác payload trả 409 CONFLICT. Retry không khôi phục kênh đã xóa hoặc quyền đã mất. Khi kênh đang bị deny do xóa, replay không trả metadata từ entry cũ.

Giữ entry đã xác nhận 10 phút, tối đa 10.000 entry; entry chưa phân giải không bị evict theo TTL. Queue, thời gian chờ, pool và transaction retry giữ giới hạn hiện hành. Hết capacity trả SERVER_BUSY. Chống lặp chỉ trong một process; không bảo đảm qua restart/quá TTL. `replayOnly` không tạo operation mới: entry mất/hết hạn trả 410 CHANNEL_REPLAY_UNAVAILABLE mà không ghi dữ liệu.

UI không tự retry POST sau timeout. Giữ payload/requestId, khóa sửa form và cho người dùng chủ động **Đối chiếu yêu cầu cũ** bằng replayOnly. Đóng form không hủy operation server. Sau 10 phút hoặc khi entry mất, kiểm kết quả trước khi tạo mới; không thay key để phát lại mù. Draft/entry UI hiện giữ trong component đúng user/Workspace, không qua reload. Sau reload cần kiểm các kênh đã tạo trước khi tạo yêu cầu mới.

## Điểm nối

- T10.2: list nội dung/list quản trị và sidebar dùng DTO/ID đã trả; chỉ đưa kênh có canReadContent vào danh sách nội dung. Invalidate cache theo `['channels', userId, workspaceId]` sau tạo.
- T13: cấp/gỡ/re-add PRIVATE dựa trên membership incarnation; không tự thêm owner/admin như một bypass.
- M2: factory TEXT đã được gọi thật; send/history vẫn kiểm quyền hiện hành qua policy chung.
- M4: LIVE mới chỉ là metadata Channel, join/start/revoke thuộc runtime riêng.
