# Tài khoản, Workspace, kênh, chat và tệp

**Trạng thái:** hướng dẫn triển khai theo baseline v2.3; các module nghiệp vụ này chưa có trong scaffold. Đây là bản đồ theo luồng công việc, không thêm quyền hay endpoints mới.

## Nguồn chính theo câu hỏi

| Câu hỏi                             | Nguồn chi tiết                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Phải hoàn thành gì?                 | [Scope: AUTH-01, WS-01/02/03, CH-01, CHAT-01/02/03, FILE-01; UC-01](scope.md)                                                |
| Ai được làm gì?                     | [REST chính, mục 10.2](../technical-plan.md#102-rest-chính), [ba lớp quyền, mục 5.1](groups-media-policy.md#51-ba-lớp-quyền) |
| Cookie/auth/CSRF và lỗi?            | [Quy ước giao tiếp, mục 10.1](../technical-plan.md#101-quy-ước-chung)                                                        |
| Dữ liệu và index?                   | [Model, mục 9.1](../database/model.md#91-mongodb-bền-vững)                                                                   |
| Transaction, attachment và lịch sử? | [Lifecycle, mục 9.3–9.4](../database/lifecycle.md)                                                                           |
| Upload, quota và trust boundary?    | [Bảo mật, mục 13.1–13.2](../technical-plan.md#13-bảo-mật-giới-hạn-và-retention)                                              |

## Lát cắt để giao việc

### Luồng tài khoản và lời mời — chốt ngày 03/11/2026

- Người đã đăng nhập có thể xem Workspace mình còn tham gia và tạo Workspace mới; chưa có Workspace thì hiển thị trạng thái trống cùng nút Tạo Workspace. Người tạo trở thành owner; tạo Workspace/general/membership/conversation vẫn nguyên tử.
- Tham gia Workspace bằng link do owner/admin tạo, có hạn dùng, giới hạn lượt và khả năng thu hồi. Bản hiện tại không có hệ thống gửi email mời tự động hoặc nhập mã Workspace; người tạo tự chia sẻ link qua kênh liên lạc phù hợp.
- Mở link khi chưa đăng nhập: đăng nhập hoặc đăng ký rồi quay lại đúng lời mời, không ép tạo Workspace. Đăng ký thành công tự thiết lập phiên đăng nhập; không yêu cầu nhập lại tài khoản.
- Người dùng chủ động xác nhận Tham gia Workspace; trước cấp membership server kiểm lại link và Workspace hiện tại. Đăng ký/đăng nhập không tự accept lời mời. Người đã ACTIVE mở Workspace hiện có, không thêm membership hay tính thêm lượt dùng.
- Kênh WORKSPACE dùng membership chung; PRIVATE do owner/admin thêm thành viên đã thuộc Workspace vào danh sách, không dùng lời mời kênh qua email/link riêng trong scope hiện tại.

### Ranh giới triển khai

- Tài khoản: form → bootstrap CSRF → register/login → cookie session → me/logout; expiry/logout phải tác động socket/media liên quan. Không dùng mock identity làm auth thật.
- Workspace: tạo kèm owner membership, kênh general TEXT và conversation CHANNEL nguyên tử; mọi truy cập tra membership hiện tại. Nhận invitation cần kiểm đồng thời theo lifecycle.
- Kênh: phân biệt TEXT/LIVE lâu dài với một lượt LiveSession; type bất biến, list lọc access. Owner/admin quản lý cấu hình không tự có quyền nghe nhóm riêng.
- Chat/tệp: service chung cho REST/socket, dedupe bền, phân trang; attachment STAGED được bind đúng conversation trong transaction. ID/URL biết trước không cấp quyền tải.

Các dòng trên giúp chọn phạm vi issue, không thay chi tiết trong các nguồn được dẫn. Khi thấy mâu thuẫn, ghi lại nguồn/điều kiện cụ thể và xử lý trước phần code phụ thuộc.

## Nghiệm thu theo feature

Đối chiếu T-01/T-02/T-10/T-13 tại [test matrix](../technical-plan.md#143-test-matrix-bắt-buộc): ca sai Workspace/kênh, tự nâng role, invitation đồng thời, message retry và attachment sai scope. Luồng hạnh phúc có UI chưa đủ để nghiệm thu các quyền này.

## Điểm cần chốt khi triển khai

- Implementation băm mật khẩu và cấu hình đo thực tế, như mục 13.1 của plan.
- Field types, nullability, validation chi tiết và index migration theo [model](../database/model.md); không phát sinh collections ngoài scope.
- Đặc tả Zod còn thiếu phải được thống nhất với bên dùng contract trước hoặc cùng PR.

## Chat mở rộng ngày 27/10/2026

Nguồn chi tiết: [general, DM 1–1 và thread](messaging.md). CHAT-02/03 là bổ sung phạm vi, chưa có code/schema nghiệp vụ. Owner/admin giữ quyền tạo kênh; không suy member được tạo kênh từ quyền nhắn tin. Thread bản đầu chỉ trong TEXT; DM text/ảnh/file khác HOST_PRIVATE chỉ text/ảnh trong cuộc họp.

## PRIVATE và định hướng sidebar — 01/11/2026

Nguồn sở hữu: [messaging](messaging.md#kênh-private-và-quyền-quản-lý--chốt-ngày-01112026). TEXT/LIVE độc lập với WORKSPACE/PRIVATE; chỉ owner/admin tạo kênh và quản lý danh sách PRIVATE, không tự có quyền nội dung ngoài danh sách. UC-WS-15 bao phủ thêm/gỡ quyền sau tạo; PRIVATE có biểu tượng khóa. Sidebar tham khảo Slack, chưa là UI đã triển khai.

Rejoin Workspace theo [messaging](messaging.md): có thể mở lại DM khi cả hai membership hợp lệ, nhưng quyền kênh PRIVATE cũ không tự phục hồi; owner/admin phải thêm lại từng kênh. Khi loại thành viên cần vô hiệu quyền PRIVATE cùng các truy cập đang mở.

## Hồ sơ cá nhân và đổi mật khẩu — chốt ngày 03/11/2026

M1 bổ sung xem/chỉnh tên hiển thị, cập nhật hoặc xóa avatar và đổi mật khẩu của chính người đang đăng nhập. Hồ sơ bản đầu gồm tên hiển thị và avatar; email chỉ hiển thị, không sửa. Không mở thêm bio/thông tin cá nhân khác hoặc quyền admin sửa hồ sơ người khác. Không có avatar thì hiển thị chữ cái từ tên. Quên mật khẩu/khôi phục qua email để sau MVP.

Đổi mật khẩu yêu cầu phiên hợp lệ, mật khẩu hiện tại đúng và mật khẩu mới hợp lệ; sai thì không đổi dữ liệu hoặc thu phiên. Đổi thành công thu tất cả phiên đăng nhập của tài khoản, bao gồm phiên đang dùng và các trình duyệt/thiết bị khác; đóng socket/media thuộc các phiên bị thu và yêu cầu đăng nhập lại bằng mật khẩu mới. Clear cookie tại trình duyệt thực hiện thao tác; các trình duyệt khác không được tiếp tục truy cập bằng cookie cũ. Avatar do M1 sở hữu luồng/UI và tham chiếu User, M2 phối hợp nền file/validation/byte/cleanup. Quyền xem avatar đã chốt: chính chủ hoặc người đã đăng nhập có chung ít nhất một Workspace còn hiệu lực (cả hai membership ACTIVE, Workspace chưa xóa); chỉ hiển thị tại nơi người xem được phép thấy thông tin thành viên. Không có đường dẫn ảnh công khai; không dùng quyền host/admin để bỏ qua kiểm quyền này. Định dạng/kích thước, purpose/binding và chính sách giữ ảnh cũ còn cần review kỹ thuật M1/M2; không tự dùng ACL kênh cho avatar. Xem [proposal M1](../proposals/m1-workspace-auth.md).

## Vai trò OWNER/ADMIN — chốt ngày 03/11/2026

Người tạo Workspace là OWNER duy nhất; MVP không có chuyển quyền sở hữu. OWNER cấp/thu ADMIN để hỗ trợ quản lý; ADMIN không có quyền xóa Workspace hoặc cấp ADMIN. UC-WS-11 và FR-02-08 ngừng áp dụng, không xóa/tái dùng mã lịch sử. Host cuộc họp và chuyển host độc lập, vẫn giữ nguyên.
