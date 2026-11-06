# 6. Page Layouts

**Layout đề xuất · 07/11/2026.** Giữ hướng [handoff UI](../../ui/figma-handoff.md). Kích thước là điểm thử, không là bố cục đã được team duyệt.

## Layout theo hành trình

| Layout         | Cấu trúc                                                        | Điều phải giữ                                               |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| Auth           | Brand gọn + form, có thể xếp một cột khi hẹp                    | Form cuộn được, lỗi không đẩy action khỏi tầm tới           |
| Invite         | Card xác nhận, danh tính/Workspace/hậu quả, đường auth/quay lại | Pending invite qua auth; chưa xác nhận thì chưa join        |
| Workspace list | Header tài khoản, danh sách/rỗng, tạo Workspace                 | Active call strip tách Workspace đang xem với call đang giữ |
| Workspace      | Sidebar + header + content + panel thread tùy chọn              | Header/composer cố định trong vùng; timeline cuộn riêng     |
| Lobby          | Preview + thiết bị + join/quay lại                              | Preview có lifecycle riêng, không đóng track call cũ        |
| RoomShell      | Header/context + stage/camera + một side panel + toolbar        | Controller không nằm trong lifecycle panel/route            |
| Recordings     | Danh sách READY theo kênh, lọc phiên, player                    | Đọc quyền kênh hiện tại; không tạo thư viện bài làm         |

Không thêm Dashboard nếu hành trình hiện tại không cần. Chỉ dùng page template phục vụ màn đã nằm trong scope.

## Workspace và chat

Mặc định sidebar 240 px, thread panel 320 px trong bố cục nhiều cột; cách chuyển bố cục theo bảng responsive bên dưới. Dùng `minmax(0, 1fr)` và `min-width: 0` để nội dung xuống dòng. Tên kênh/DM dài truncate có cách đọc đầy đủ bằng focus/tooltip phù hợp; nội dung tin xuống dòng, không kéo rộng toàn app.

Header và composer là các hàng riêng trong flex/grid; timeline có `min-height: 0` và `overflow-y: auto`. Không position absolute composer đè tin cuối. Thread có root, replies và composer riêng; đóng thread giữ anchor timeline. Chỉ dùng horizontal scroll cục bộ cho dữ liệu thực sự cần.

Sidebar dùng navigation; trạng thái selected khác hover/focus. PRIVATE khóa là access mode, TEXT/LIVE có icon loại độc lập. Menu quản trị ngoài allowlist không dùng layout content để vô tình hiển thị tin.

## Call shell và panel

Khi có share, stage lớn và camera cạnh bên; không share có camera grid/empty phù hợp. Panel chat/người tham gia/nhóm dùng cùng vùng bên phải, một panel chính tại một thời điểm. Board overlay gắn vùng ảnh thực của stage; letterbox/DPR do renderer tính, không lấy kích thước khung ngoài.

Toolbar có hàng layout riêng, phần Rời/kết thúc không phủ vùng ghi hình. Cho wrap hoặc nhóm control phụ vào menu có label khi thiếu chỗ; mic/camera/rời luôn tới được. Kiểm vùng bấm bằng chuột lẫn keyboard, không chỉ nhìn icon. Recording/announcement banner chiếm hàng riêng và phải được tính trong chiều cao còn lại.

Giữ volume, pin, focus panel là presentation state; chúng không quyết định recorder input hoặc quyền nhận. Về Workspace giữ call và có Trở lại cuộc họp, không dựng RoomShell thứ hai ở strip.

## Dialog và lớp nổi

Đề xuất dialog thường 480–560 px, phân nhóm có thể rộng hơn theo nội dung; luôn `max-width` theo viewport và `max-height` hữu hạn. Header/footer không bị cuộn mất ngoài ý muốn; body có scroll. Portal có layer order rõ và semantic surface riêng. Không dùng tăng z-index để che lỗi toolbar overlap.

Popover/menu tránh vượt viewport; scroll và focus không đóng menu bất ngờ khi người dùng đang chọn. Modal theo [accessibility](accessibility.md); side panel thường không modal và không trap focus toàn trang.

## Responsive và kiểm bố cục

Hai mốc desktop phải thử là 1280×800 và 1440×900, ở app viewport trực tiếp. Ảnh co trong khung laptop Figma chưa chứng minh responsive. Không mang `body { min-width: 1120px; overflow: hidden }` của export sang làm nền mọi trang; auth/list/form cần document scroll khi thiếu chiều cao.

### Quy tắc bố cục mặc định

Đây là quy ước triển khai đề xuất của bộ chuẩn, chưa là kết quả nghiệm thu Figma/app. Dùng bề rộng khả dụng của **shell** tính bằng CSS px (sau vùng bao ngoài, trước khi trừ sidebar/panel), không dùng kích thước màn hình vật lý. App toàn trang thì shell bằng viewport; khi nhúng fixture, đo container shell. Zoom làm giảm bề rộng khả dụng cũng chuyển theo cùng bảng. Định nghĩa ngưỡng tại shell dùng chung, feature nhận layout mode qua props khi cần; không tự đặt breakpoint khác cho cùng shell.

| Bề rộng shell           | Sidebar Workspace                  | TEXT và thread                                                                                | Cuộc gọi và panel                                                                        |
| ----------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Từ 1280 px              | Hiện cố định 240 px                | Timeline và thread 320 px cạnh nhau khi mở                                                    | Stage/camera và một panel 320 px cạnh nhau                                               |
| Từ 768 đến dưới 1280 px | Thu thành nút mở navigation drawer | Timeline và thread 320 px cạnh nhau khi mở                                                    | Panel đang chọn thay vùng stage/camera; toolbar và header vẫn hiện, có nút Về sân khấu   |
| Dưới 768 px             | Nút mở navigation drawer           | Thread thay vùng timeline, có nút Về kênh; header ngữ cảnh và composer đúng đích vẫn tới được | Cùng chế độ panel thay stage/camera như hàng trên; control chính wrap trong hàng toolbar |

Drawer navigation là lớp modal chỉ mở từ nút có tên: mở thì focus vào drawer, nền không tương tác, Escape/nút Đóng trả focus về trigger. Chọn kênh/DM đóng drawer và chuyển focus tới heading của nội dung mới. Không dùng drawer navigation để chứa chat/thread hoặc panel cuộc gọi. Dialog xác nhận tác vụ nằm trên drawer/panel, quản lý focus theo [accessibility](accessibility.md); không mở chồng hai drawer.

Ưu tiên vùng nội dung người dùng đang thao tác: mở thread ở chế độ hẹp hiển thị thread; mở panel cuộc gọi hiển thị panel đó, không tự đóng do resize. Khi trở về vùng rộng, đích thread/panel đã chọn xuất hiện ở cột bên cạnh. Nút Về kênh/Về sân khấu chỉ đổi presentation. Giữ nháp đúng đích, anchor cuộn và state còn hợp lệ qua resize/đóng mở; đổi kênh, scope hoặc mất quyền vẫn xử lý theo lifecycle nghiệp vụ. Đổi bố cục không được gửi tin hoặc khởi tạo lại controller/socket; audio vẫn theo call scope. Việc ẩn stage không là lệnh rời call; camera demand vẫn do runtime hiện hành quản lý.

Panel trong call ở chế độ hẹp là vùng nội dung tuần tự, không là modal, không trap focus. Khi mở chuyển focus tới heading panel; đóng/Về sân khấu đưa focus về nút mở tương ứng trên toolbar. Khi resize làm control đang focus biến mất, chuyển focus tới control tương đương trong bố cục mới; không giật focus nếu phần tử vẫn tồn tại. Drawer đang mở tự đóng khi chuyển sang sidebar cố định, chuyển focus tới mục tương đương trong sidebar nếu focus đang ở drawer; giữa hai mode có drawer thì giữ trạng thái mở. Dialog tác vụ đang mở giữ input/pending và reflow theo kích thước mới. Dọn inert/scroll lock của lớp đã đóng, nhưng giữ chúng khi còn modal hợp lệ đang mở.

Mic/camera/rời luôn ở toolbar, không đẩy vào menu phụ. Share, ghi hình và các action khác vẫn có đường thao tác theo quyền hiện hành; có thể vào menu phụ có label khi thiếu chỗ. Header/banner/toolbar là hàng riêng; phần giữa nhận chiều cao còn lại và cuộn cục bộ. Với viewport thấp, cho phép cuộn để tới action; không dùng clip hoặc thu chữ để ép vừa. Dialog rộng tối đa bằng shell trừ khoảng đệm hai bên, body cuộn và action vẫn tới được.

Mobile hoàn chỉnh chưa nằm trong lượt bàn giao prototype. Các quy tắc hẹp trên là hành vi reflow của shell dùng chung, không là cam kết đã kiểm thiết bị mobile, media/board trên mobile hoặc đạt WCAG toàn app. Màn có nhu cầu khác phải nêu lý do và review exception trước triển khai; không tự chọn giữa overlay và tuần tự.

### Ca kiểm khi thay shell/panel

- Giữ hai mốc desktop 1280×800 và 1440×900; kiểm ngay hai phía ngưỡng: shell rộng 1279/1280 và 767/768 CSS px. Kiểm nội dung thông thường ở 320 CSS px và zoom 200%; ghi cả viewport và bề rộng shell nếu khác nhau.
- Mở thread, nhập nháp rồi chuyển qua lại các mode: đúng đích, nháp và vị trí đọc còn hợp lệ; đóng/Về kênh không gửi hoặc mất nháp. Đổi kênh/mất quyền không phục hồi thread cũ qua resize.
- Trong call mở lần lượt chat/người tham gia/nhóm, resize rồi Về sân khấu: chỉ một panel chính, toolbar còn dùng được, controller không tạo lại. Chỉ ghi audio/media liên tục đạt khi đã thử media thật; fixture chỉ chứng minh bố cục/lifecycle fixture.
- Dùng keyboard mở/đóng drawer, panel và dialog ở từng mode; resize khi focus bên trong. Không kẹt focus, còn inert/scroll lock hoặc focus vào vùng đã ẩn. Kiểm viewport thấp có banner reconnect+recording, header dài và toolbar wrap.

Ca review tối thiểu: tên dài, URL không có khoảng trắng, nhiều thành viên, validation nhiều dòng, attachment preview, thread mở, call mở từng panel, banner reconnect+recording, dialog ở zoom 200%. Không thay chính sách camera hoặc bỏ chức năng để vừa layout.
