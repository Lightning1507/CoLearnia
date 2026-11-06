# 1. Design Principles

**Đề xuất chuẩn frontend · 07/11/2026.** Nghiệp vụ theo [scope](../../product/scope.md), [messaging](../../product/messaging.md), [group modes](../../product/group-modes.md) và [LIVE](../../product/live-session.md).

## Nội dung học là trọng tâm

Workspace theo cấu trúc Slack, vùng họp theo bố cục Meet, phân cấp tiết chế theo Linear như [brief UI](../../ui/figma-make-brief.md). Dùng một hệ thống chữ/icon/component xuyên suốt. Hội thoại là dòng liên tục, không card cho từng tin; stage ưu tiên nội dung chia sẻ. Mỗi đường viền, badge và thông báo phải giúp người dùng hiểu hoặc thao tác.

## Ngữ cảnh luôn rõ

Người dùng cần biết Workspace/kênh đang xem, cuộc gọi đang giữ, phòng hiện tại, nguồn hình và đích gửi. “Về phòng chung”, “Về Workspace” và “Rời cuộc họp” có hậu quả khác nhau; không dùng một nút quay lại mơ hồ cho cả ba.

Scope badge phải có chữ. Hình frozen ghi rõ đang giữ hình và tiếng vẫn trực tiếp. Chat họp hiện đúng Everyone của phòng hoặc tên người nhận riêng. Hộp chuyển LIVE hiển thị nguồn/đích và hậu quả đối với host/member; Hủy giữ call đang có.

## Hiển thị đúng trạng thái đã biết

Phân biệt đang gửi, đã lưu, thất bại và chưa rõ kết quả. Ack tiếp nhận không phải tài nguyên đã sẵn sàng. Recording bắt đầu ghi khác STARTING; video READY khác đã bấm Dừng. Thông báo gắn với operation hiện hành; retry thành công không để lỗi cũ làm sai kết quả.

Có phản hồi sớm bằng trạng thái pending nhưng chỉ đổi scope sau projection xác nhận. Cho người dùng đường tiếp tục khi rỗng/lỗi/mất quyền; không tự bật mic/camera, phát lại lệnh nhạy cảm hoặc tự chiếm call để giúp luồng trông liền mạch.

## Quyền rõ nhưng không dựa vào UI để bảo vệ

UI render từ quyền/context server; kiểm quyền thực nằm ở server. Owner/admin Workspace không mặc nhiên là host hoặc được đọc PRIVATE/DM. Host không xem tất cả nhóm. Thu quyền đóng nội dung/pending/cache đúng scope và yêu cầu controller dọn tài nguyên; không chỉ ẩn panel.

Mọi thao tác ảnh hưởng cả nhóm/lớp phải nói rõ đối tượng. DISCUSSION tạo hợp lệ rồi chủ động vào; ACTIVITY bắt đầu đóng DISCUSSION, hết deadline tự về MAIN. Không thêm bước host duyệt để làm UI giống ảnh cũ.

## Nhất quán để nhiều người phát triển

Tái sử dụng hành vi trước khi tái sử dụng hình thức. Button/Dialog/Input là primitive; MeetingChatPanel và ActivityDraft là component nghiệp vụ. Hai màn cùng hộp thoại xác nhận dùng chung primitive nhưng policy vẫn thuộc miền phụ trách.

Không tạo một “UniversalPanel” với hàng chục cờ cho mọi nghiệp vụ. Khi khác biệt làm API khó hiểu, giữ component riêng và chia sẻ phần nhỏ ổn định. Chỉ đưa lên shared khi có nhu cầu dùng lại thực tế; dùng slot/composition cho các miền ghép vào shell.

## Đọc được, thao tác được, kiểm được

Desktop 1280×800 và 1440×900 là hai mốc review UI hiện hành; không đóng băng body theo kích thước prototype. Chữ chính dễ đọc, focus rõ, không điều khiển chỉ bằng hover hoặc màu. Kiểm với tên/danh sách dài, keyboard và zoom; việc chưa kiểm mobile phải nói rõ.

Thứ tự xử lý: sai nghiệp vụ hoặc cản thao tác → hành trình MVP còn thiếu → lỗi/quyền/phục hồi → đồng nhất thị giác. Dùng evidence để kết luận thay vì số màn hoặc phần trăm hoàn thành.

## Câu hỏi khi review

- Người mới có nhận ra vị trí, đích gửi và hậu quả thao tác không?
- Pending/lỗi/Hủy/mất quyền có đường ra và giữ ngữ cảnh hợp lệ không?
- Component mới có thể ghép vào app mà không tạo thêm authority/controller không?
- Đề xuất có vô tình thêm tính năng hoặc chốt một giá trị sản phẩm còn mở không?
- Ca nào đã thử, ca nào chỉ thấy trên ảnh và ca nào còn thiếu?
