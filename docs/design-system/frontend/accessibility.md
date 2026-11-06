# 7. Accessibility

**Đề xuất tiêu chí triển khai và review · 07/11/2026.** Chưa có audit chứng minh ứng dụng/prototype tuân thủ toàn bộ WCAG. Mục tiêu đề xuất là WCAG 2.2 AA cho UI; phạm vi media/canvas và các khoảng trống phải được team đánh giá riêng trước tuyên bố tuân thủ.

## Semantics và tên

Dùng button cho action, link cho điều hướng, label cho input, heading theo cấu trúc, list/table theo dữ liệu. Icon-only control có accessible name; SVG trang trí `aria-hidden`. Có `lang="vi"`, title trang/ngữ cảnh hợp lý và lối bỏ qua navigation khi cần.

Label mic/camera phản ánh hành động tiếp theo và trạng thái, không chỉ “mic”. Toggle có `aria-pressed` khi phù hợp. Disabled có lý do đọc được gần action; tooltip không là nơi duy nhất chứa hướng dẫn. Thông báo lỗi nối field bằng `aria-describedby`, `aria-invalid`; không dùng màu đơn độc.

## Keyboard, focus và modal

Mọi action có thể thực hiện bằng bàn phím. Focus nhìn thấy trên cả surface sáng/tối, không bị banner/toolbar che. Không dùng tabindex dương. Menu/tabs theo đúng pattern và có keyboard behavior tương ứng; không thêm ARIA role mà thiếu hành vi.

Dialog có tên, focus vào trong khi mở, Tab/Shift+Tab nằm trong modal, Escape đóng và focus về trigger hoặc điểm hợp lý còn tồn tại. Nền modal không tương tác được. Confirmation xóa/kết thúc ưu tiên focus action ít gây hại. Theo [W3C APG: Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Đóng dialog không có nghĩa hủy được operation server đã nhận. Nếu còn operation, hiển thị trạng thái ở vùng còn tới được. Thu quyền làm trigger biến mất thì chuyển focus tới heading/vùng thông báo còn quyền; không để focus rơi về body hoặc nội dung private ẩn.

## Chữ, contrast và vùng bấm

Theo [W3C WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/): kiểm contrast chữ thường tối thiểu 4.5:1, chữ lớn 3:1, thành phần UI/đồ họa cần nhận biết 3:1 với màu kề theo tiêu chí áp dụng. Kiểm resize text 200%, reflow nội dung thông thường ở bề rộng tương đương 320 CSS px; video/board có ngoại lệ theo bản chất hai chiều, không miễn toàn trang.

WCAG 2.2 AA có tiêu chí target size tối thiểu 24×24 CSS px hoặc đáp ứng ngoại lệ/spacing. Chuẩn nội bộ đề xuất vùng bấm 36–44 px cho control chính để dễ dùng; không nói 44 px là mức AA bắt buộc. Palette ở foundations chưa được đo, phải kiểm từng cặp màu và state thực.

## Nội dung động

Loading/status kết quả dùng live region có mức ưu tiên phù hợp. Không đọc lại toàn timeline mỗi tin, không announce countdown từng giây. Lỗi cần xử lý có text tồn tại đủ để đọc; toast không giữ thông tin duy nhất. Tin mới không giật focus của người đang soạn/đọc lịch sử.

Giảm chuyển động theo preference hệ thống; focus, thông báo và deadline vẫn đúng. Không dùng animation để thay authority timer. Autoplay bị chặn có action bật tiếng rõ; focus thao tác này không tự bật mic.

## Media, canvas và giới hạn

Slider âm lượng có tên, giá trị và keyboard; phân biệt tiếng nghe với mic phát. Player có control bàn phím, trạng thái phát/tua/loading/lỗi có tên. Keyboard không bị mắc trong media stage.

Toolbar board dùng được bằng keyboard; trạng thái giữ hình/nguồn/permission có text ngoài canvas. Freehand drawing không tự được coi tiếp cận đầy đủ chỉ vì toolbar có ARIA. Khả năng thay thế nội dung canvas, phụ đề/transcript và yêu cầu media accessibility cần ghi khoảng trống với team. Không tự thêm feature ngoài scope hoặc tuyên bố WCAG toàn app đạt để bỏ qua quyết định này.

## Ca kiểm và evidence

- Keyboard-only: auth → Workspace → TEXT/thread → lobby/call → mở/đóng panel/dialog; không mất focus hoặc kẹt.
- Screen reader trên môi trường được ghi rõ: field/error, tên icon, status gửi tin, scope, dialog và player; không gọi việc thêm ARIA là kết quả đã thử.
- Contrast, focus ở sáng/tối, zoom/reflow, tên dài, reduced motion và target size.
- Thu quyền trong khi dialog/thread/player đang mở: nội dung cũ bị đóng, focus tới nơi hợp lệ.

Ghi browser/OS/công cụ, các bước, kết quả và phần chưa kiểm. Automation hỗ trợ tìm lỗi; manual review vẫn cần. Chọn công cụ audit trong task riêng, chưa cài dependency hoặc tạo CI gate mới từ tài liệu này.
