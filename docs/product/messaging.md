# Chat Workspace: kênh, DM và thread

**Trạng thái:** bổ sung thiết kế theo chỉ đạo người dùng ngày 27/10/2026, thuộc technical plan v2.3; chưa là chức năng đã triển khai. Feature IDs: CH-01, CHAT-01/02/03, FILE-01. Chat cuộc họp HELP-01 vẫn theo [Everyone/Host](groups-media-policy.md#81-host-group-và-hỗ-trợ).

## Ba cách trao đổi cần phân biệt

| Cách trao đổi             | Người đọc                                              | Nội dung / thời gian tồn tại                          |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Kênh TEXT trong Workspace | Người có channel access hiện tại                       | Text, ảnh, file; lịch sử lâu dài theo vòng đời kênh   |
| DM 1–1 trong Workspace    | Đúng hai người tham gia còn quyền theo Workspace       | Text, ảnh, file; không phụ thuộc việc đang ở cuộc gọi |
| Chat cuộc họp             | Everyone theo MAIN/group hiện tại hoặc đúng Host riêng | Chỉ text/ảnh; khóa/purge theo vòng đời phiên/nhóm     |

Kênh là nơi trao đổi nhiều người đã thuộc scope; không phải tính năng DM nhóm mới. Bản đầu chưa có DM tự chọn từ ba người trở lên hoặc DM xuyên Workspace.

## Kênh mặc định general — CH-01

- Tạo Workspace đồng thời tạo owner membership, một kênh TEXT tên `general` với accessMode WORKSPACE và conversation CHANNEL, trong cùng transaction. Không có Workspace tạo thành công nhưng thiếu general do lỗi giữa chừng.
- Thành viên có membership hợp lệ truy cập general qua quyền WORKSPACE, không cần thêm từng người vào allowlist. Đây là nơi trao đổi chung ban đầu; không là phòng LIVE mặc định.
- Owner/admin tạo thêm TEXT/LIVE và quản lý kênh theo baseline. Người dùng đã xác nhận giữ quyền tạo kênh cho owner/admin; member thường nhắn trong kênh mình được truy cập.
- `general` là tên kênh được tạo ban đầu, chưa mang thêm quy tắc bất biến/cấm xóa/ép nhận thông báo riêng. CRUD tiếp tục theo CH-01; không tự tái tạo kênh đã bị xóa. Nếu team cần bảo vệ general, đó là quyết định cần bổ sung rõ.

## Chat riêng 1–1 — CHAT-02

- Từ danh sách thành viên Workspace hoặc mục tin nhắn riêng, chọn một người khác để mở hội thoại. Hai bên phải có membership hợp lệ trong cùng Workspace. Cùng một cặp người ở hai Workspace có hai hội thoại riêng.
- Mỗi cặp không phân biệt thứ tự chỉ có một conversation DIRECT trong Workspace; mở đồng thời hoặc retry không tạo hội thoại trùng. Danh tính người gửi lấy từ auth, không tin senderId client.
- Gửi text/ảnh/file; xem danh sách hội thoại của chính mình, mở và phân trang lịch sử, thấy pending/error để thử lại an toàn. Dùng message dedupe và attachment binding chung.
- Chỉ hai bên đọc/gửi/nhận sự kiện/tải attachment. Owner/admin không có quyền đọc DM chỉ vì vai trò quản lý; biết ID hoặc URL cũng không cấp quyền. Không tạo fanout vào room Workspace chung.
- Khi mất membership hoặc Workspace bị xóa: chặn truy cập liên quan ngay, thu subscription và chặn download. DM không tự trở thành chat kênh hoặc HOST_PRIVATE. Chính sách mở lại lịch sử nếu một người được mời trở lại cần chốt trước task đó; không mặc định cấp lại lịch sử bằng userId cũ.
- Lịch sử DM không bị đóng khi rời LIVE; retention đi theo Workspace và [lifecycle](../database/lifecycle.md). Không tự cung cấp UI xóa lịch sử, sửa tin hoặc gọi riêng chỉ vì đã có DM.

## Thread trong kênh — CHAT-03

Người dùng chọn tham khảo cơ chế gom trao đổi quanh một tin nhắn của [Slack threads](https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions). Phạm vi đơn giản bên dưới là thiết kế CoLearnia, không phải toàn bộ tính năng Slack.

- Mỗi tin gốc trong kênh TEXT có thao tác **Trả lời trong thread**. Không cần đánh dấu tin “quan trọng” trước khi mở thread.
- Mở panel chứa tin gốc và các trả lời theo thứ tự, có phân trang. Tin gốc hiển thị số trả lời để người đọc mở lại thảo luận.
- Trả lời hỗ trợ text/ảnh/file. Các trả lời nằm trong thread; không tự đăng lặp vào dòng tin chính. Dòng tin chính chỉ phân trang tin gốc, tránh việc reply vẫn làm trôi toàn bộ kênh.
- Chỉ một cấp: reply trỏ về tin gốc; không có thread lồng trong reply. Bản đầu áp dụng cho kênh TEXT, chưa mở thread cho DM hoặc chat cuộc họp.
- Thread kế thừa đúng quyền của conversation CHANNEL. Người không có quyền đọc kênh không được đọc tin gốc, reply, số trả lời, event hoặc attachment. Không tự mở một audience riêng cho thread.
- Server kiểm tin gốc tồn tại, là root cùng conversation và actor còn quyền; không nhận parent thuộc kênh/Workspace khác. Retry không tăng số trả lời hai lần. Xóa/mất quyền kênh khóa cả thread và file.
- Schema thiết kế có thể dùng rootMessageId nullable trên messages: null là tin gốc, reply chứa ID tin gốc. Index theo conversation/root/cursor và cơ chế reply count nhất quán phải được review trong task DB; không chạy migration từ thay đổi tài liệu này.

Để giữ phạm vi bản đầu, chưa bổ sung subscription/follow thread, broadcast reply ra kênh chính, mention, reactions, read receipts, trạng thái đang gõ, tìm kiếm nâng cao hoặc một trung tâm thông báo riêng. Badge chưa đọc đã được đề xuất trong trao đổi trước, nhưng chưa chốt cách tính/lưu; không coi đó là yêu cầu phát hành tự động chỉ từ việc bổ sung DM/thread.

## Kiểm chứng và các điểm còn mở

- UC-01 mở rộng: tạo Workspace → có general → trao đổi trong kênh → trả lời thread → nhắn riêng thành viên → bên kia đọc và tải file đúng quyền.
- Kiểm hai người mở DM cùng lúc, retry message/reply, root sai conversation, history phân trang không lẫn root/reply, attachment sai scope, người thứ ba/admin dò DM, kick khi socket đang mở và URL sau thu quyền.
- Chốt trước implementation phụ thuộc: cách xử lý lịch sử DM khi rejoin, index/schema/migration chi tiết; mức ưu tiên và effort sau khi nhóm đo capacity. General không được suy ra bảo vệ đặc biệt khi chưa có quyết định.
- Bổ sung DM và thread làm tăng scope so với bản chỉ chat kênh. Cần ước lượng lại trong capacity chung 4 tuần; việc bỏ floor/presentation không tự chứng minh số giờ còn lại đủ.
