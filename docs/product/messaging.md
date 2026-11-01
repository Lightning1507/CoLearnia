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
- Khi mất membership hoặc Workspace bị xóa: chặn truy cập liên quan ngay, thu subscription và chặn download. DM không tự trở thành chat kênh hoặc HOST_PRIVATE. Khi người đó được mời trở lại và cả hai participant đều có membership hợp lệ, họ được đọc lại lịch sử DM còn được lưu của chính mình trong Workspace; không tạo hội thoại mới chỉ vì rejoin. UserId cũ không đủ quyền khi membership hiện tại chưa hợp lệ. Quy tắc khôi phục DM này không khôi phục quyền kênh PRIVATE cũ.
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
- Chốt trước implementation phụ thuộc: index/schema/migration chi tiết; mức ưu tiên và effort sau khi nhóm đo capacity. General không được suy ra bảo vệ đặc biệt khi chưa có quyết định.
- Bổ sung DM và thread làm tăng scope so với bản chỉ chat kênh. Cần ước lượng lại trong capacity chung 4 tuần; việc bỏ floor/presentation không tự chứng minh số giờ còn lại đủ.

## Kênh PRIVATE và quyền quản lý — chốt ngày 01/11/2026

- Hai chiều độc lập: `type` là TEXT/LIVE bất biến; `accessMode` là WORKSPACE/PRIVATE. PRIVATE thay tên RESTRICTED trong thiết kế hiện hành; chưa đổi schema/code runtime. Bản đầu chưa hỗ trợ chuyển WORKSPACE ↔ PRIVATE sau tạo.
- WORKSPACE cho thành viên có membership hợp lệ truy cập. PRIVATE cần đồng thời membership Workspace hợp lệ và có tên trong danh sách được cấp quyền, áp dụng cả TEXT lẫn LIVE.
- Chỉ owner/admin tạo kênh và quản lý danh sách PRIVATE: thêm hoặc gỡ thành viên cùng Workspace còn hợp lệ, kể cả thêm chính mình. Member thường và host cuộc họp không có quyền này chỉ nhờ vai trò đó.
- Quyền quản lý cấu hình không tự cấp quyền nội dung. Owner/admin ngoài danh sách có thể quản lý danh sách nhưng không được đọc/gửi tin, nhận event nội dung, tải tệp hoặc tham gia LIVE. Vì họ có thể thêm chính mình, PRIVATE không phải cam kết giấu nội dung khỏi người quản trị có khả năng tự cấp quyền.
- Người được thêm thấy toàn bộ lịch sử kênh còn được lưu. Người bị gỡ mất ngay quyền đọc/gửi/nhận nội dung/tải tệp/vào LIVE; thu subscription, cache và tài nguyên phiên liên quan. Thêm lại khôi phục truy cập lịch sử còn lưu, không phục hồi media/grant cũ. Không mở quyền nhóm riêng chỉ vì vừa có channel access.
- **Bị loại rồi rejoin Workspace:** quyền ở các kênh PRIVATE cũ bị vô hiệu khi loại thành viên; nhận lại lời mời Workspace không tự khôi phục chúng. Owner/admin phải thêm người đó lại vào từng kênh PRIVATE. Khi được cấp lại, người đó đọc lịch sử kênh còn lưu theo quy tắc trên. Cách lưu/xóa grant cụ thể thuộc thiết kế DB, nhưng không được để userId/allowlist cũ tự mở lại quyền.
- Quyền xem lịch sử còn lưu áp dụng theo vòng đời hội thoại: TEXT giữ lịch sử kênh; channel access mới không mở lại SESSION/GROUP đã đóng hoặc HOST_PRIVATE của người khác trong LIVE. DM rejoin cũng không khôi phục dữ liệu đã purge.
- Quản lý danh sách là UC-WS-15 **Quản lý quyền truy cập kênh** thuộc TQ-02/CH-01. Thêm/gỡ là hai nhánh của cùng mục tiêu, không tạo mỗi nút một UC. Server kiểm role và membership hiện tại; xử lý đồng thời với kick/revoke và không trả nội dung private trong API quản lý.

### Định hướng hiển thị

Tham khảo cách tổ chức trong ảnh Slack người dùng cung cấp: sidebar Workspace gồm kênh và DM; kênh PRIVATE có biểu tượng khóa 🔒 trước tên, kênh đang chọn có nền nổi bật, tên dài rút gọn và cho xem đầy đủ khi trỏ vào. TEXT/LIVE vẫn cần dấu hiệu phân biệt độc lập với khóa PRIVATE. Chỉ hiển thị kênh người dùng có quyền truy cập trong danh sách nội dung; giao diện quản lý quyền ngoài danh sách phải phân biệt với truy cập nội dung, không làm lộ chat/tệp. Bố cục chi tiết sẽ thiết kế khi làm UI; biểu tượng/ẩn kênh không thay ACL server. General giữ quy tắc đã chốt ở trên, không tự sao chép các hạn chế riêng của Slack.

### Ca kiểm chứng bổ sung

- Owner/admin ngoài danh sách: quản lý được quyền, bị chặn nội dung và LIVE; member/host thường bị chặn quản lý.
- Thêm thành viên hợp lệ: đọc được lịch sử còn lưu; từ chối người ngoài Workspace hoặc membership mất hiệu lực.
- Gỡ người đang mở socket/LIVE: thu event/file/media và cache cũ; request biết ID/URL vẫn bị từ chối. Thêm lại không mở scope nhóm hoặc producer cũ.
- Rejoin Workspace: DM mở đúng hội thoại cũ khi cả hai membership hợp lệ; PRIVATE vẫn bị chặn tới khi owner/admin thêm lại. Không trùng cặp DM, không cho người thứ ba đọc và không khôi phục media/nhóm cũ.
