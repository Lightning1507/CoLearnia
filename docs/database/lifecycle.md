# Vòng đời dữ liệu, transaction và cleanup

**Trạng thái:** Thiết kế đích. Transaction probe trong CI kiểm cơ chế Mongo, không thay kiểm thử nghiệp vụ hoặc sweeper thực.

Nguồn ban đầu được trích chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đã cập nhật theo quyết định team ngày 27/10/2026 trong technical plan v2.3. Đây là nguồn chi tiết hiện hành cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

### 9.3. Quyền lịch sử và retention

| Dữ liệu          | Quyền đọc                                                                    | Kết thúc/xóa                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CHANNEL chat/tệp | Membership và channel access hiện tại                                        | Lưu đến khi kênh/Workspace xóa; soft delete khóa đọc ngay                                                                     |
| DIRECT chat/tệp  | Đúng hai participant; cả hai còn membership hợp lệ trong Workspace đang sống | Không đóng theo LIVE; khóa khi mất membership; purge theo Workspace khi xóa. Lịch sử khi rejoin cần chốt trước implementation |
| SESSION chat     | Participant hiện thuộc MAIN, session ACTIVE                                  | Khóa khi ENDED, purge sau 24 giờ                                                                                              |
| GROUP chat/ảnh   | Cùng group đang mở; host đang hỗ trợ                                         | Rời nhóm mất quyền đọc tiếp; close group/session khóa ngay, purge sau 24 giờ                                                  |
| HOST_PRIVATE     | Hai bên ban đầu còn quyền session/channel                                    | Không chuyển audience khi transfer host; khóa khi ENDED, purge sau 24 giờ                                                     |
| Frame/nét        | Board ACL của MAIN/group                                                     | Không là bài lưu; giữ khi đang được dùng, dọn sau mất tham chiếu                                                              |

Retention 24 giờ là mặc định vận hành khởi đầu để cleanup, không phải tính năng xem lại. Người ngoài runtime không được tải file private kể cả metadata chưa purge. Người mới vào group có thể đọc lịch sử group trong phiên đang mở; chính sách này phải hiển thị trong mô tả nhóm/room.

Files CHANNEL/DIRECT chỉ gắn được vào đúng conversation tương ứng. Reply trong thread dùng ACL conversation CHANNEL của tin gốc. Ảnh nhóm/private không được gắn vào tin toàn Workspace bằng đổi attachmentId. Upload trước lưu STAGED với owner/scope; commit message atomically bind file READY; upload bỏ dở được dọn. Tin hỏi host có ảnh canvas là private attachment, không mở endpoint frame nhóm cho host khi host chưa được cấp board access.

### 9.4. Transaction và đồng bộ runtime

Mongo replica set một node được cấu hình từ dev/CI/staging. Transaction nhiều document cần deployment hỗ trợ; không gọi mediasoup hoặc chờ upload bên trong transaction DB. [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).

| Thao tác                 | Cách bảo đảm                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Tạo Workspace            | Workspace + owner membership + general TEXT + conversation CHANNEL trong một transaction            |
| Nhận invitation          | Kiểm expiry/revoke/maxUses và upsert membership trong transaction; user đã là member không tốn lượt |
| Transfer owner           | Kiểm owner hiện tại/target; đổi ownerId và role hai bên nguyên tử                                   |
| Gửi message + attachment | Validate ACL và bind STAGED file cùng insert message; retry dùng unique clientMessageId             |
| Create live session      | Khóa channel + unique DB; runtime Router chỉ được công bố khi metadata hợp lệ; failure cleanup      |
| Kick/đổi quyền/xóa kênh  | Đặt deny barrier theo scope → đóng media/fanout → ghi DB → reconcile runtime → phát snapshot        |

Nếu DB lỗi sau thu media, không tự mở lại nguồn: participant nhận trạng thái cần resync, chỉ khôi phục sau khi xác thực DB và policy. Barrier phải chặn REST/file/socket liên quan, không chỉ handler kick. Sau crash, không có media runtime cũ; bootstrap đánh dấu phiên cũ ENDED và đóng conversation private trước khi cho join mới.

Message insert thành công nhưng crash trước ack/fanout: retry trả đúng message cũ sau kiểm quyền, history lấy lại được. Không tuyên bố exactly-once toàn mạng hoặc thêm message broker chỉ vì trường hợp này.

### 13.3. Cleanup

- Sweeper mỗi 60 giây: STAGED/orphan frame quá 15 phút; context hết refs dọn sau grace tối đa 5 phút; không xóa frame đang board sử dụng.
- Private session messages/files khóa ngay khi close và purge sau 24 giờ. Metadata tombstone chỉ giữ đủ audit không chứa nội dung riêng.
- Kênh/Workspace soft delete: khóa đọc ngay, purge tệp không còn references sau 7 ngày theo job; không có chức năng restore UI trong scope.
- Cleanup kiểm cả disk lẫn metadata; TTL Mongo không tự xóa file. Quota áp dụng trước upload/commit, sweeper không là cách duy nhất ngăn đầy disk.
- Worker/process crash: bootstrap và sweep đối chiếu epoch/reference; không phụ thuộc người dùng đóng tab đúng cách.

Everyone không mở lịch sử MAIN cho participant đang ở group khác. Đóng tất cả nhóm khóa history/ảnh nhóm, không chuyển conversation GROUP thành SESSION. Tin/ảnh HOST_PRIVATE vẫn giữ hai bên ban đầu khi về MAIN hoặc transfer host. Chat cuộc họp không nhận tệp bất kỳ; CHAT-01/FILE-01 của kênh không bị cắt.

Thread có cùng vòng đời kênh/tin gốc, không nhận retention 24 giờ của cuộc họp. Tạo DM đồng thời phải hội tụ về một cặp; bind reply và attachment cùng transaction, retry không làm reply count tăng lặp. Kick/xóa Workspace thu fanout DIRECT và quyền file liên quan; retention không thay ACL.

### Vòng đời theo hai group mode

Theo [group modes](../product/group-modes.md), pending request không cấp GROUP/file access. Approval phải kiểm lại actor/danh sách/session/phase trước ghi danh sách được duyệt; group.join kiểm lại rồi mới cấp membership, không giữ mutex hoặc transaction DB khi chờ người dùng. Chuyển phase thu quyền/đóng DISCUSSION trước khi active ACTIVITY; không chuyển chat/board cũ sang loại nhóm mới. DISCUSSION/ACTIVITY có cùng nguyên tắc khóa history/ảnh khi rời/đóng; không đổi private GROUP thành SESSION. Leave đóng share ACTIVITY của actor và chỉ cleanup refs đúng scope.

Countdown gắn round hoạt động và deadline server; hết giờ không đóng group hoặc purge lịch sử. Close round/closeAll/session end hủy countdown. Server restart kết thúc runtime/round đời cũ. Không tự persist countdown hay phục hồi media từ DB.
