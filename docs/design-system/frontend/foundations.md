# 2. Design Foundations

**Đề xuất để review · 07/11/2026.** Các giá trị dưới là điểm xuất phát, chưa là brand/token được team duyệt. Tham khảo [CSS export](../../figma-ui/src/index.css) và [hướng thị giác](../../ui/figma-make-brief.md); cách đặt tên ở [tokens](tokens.md).

## Surface và màu

Workspace sáng, vùng media tối là hai surface theo ngữ cảnh trong cùng app; không cần công tắc light/dark. Dialog/chat đọc nội dung có thể dùng surface sáng bên cạnh stage tối. Không suy quyền hoặc trạng thái chỉ từ màu.

| Vai trò          | Giá trị xuất phát | Cách dùng                                           |
| ---------------- | ----------------- | --------------------------------------------------- |
| Canvas Workspace | `#f4f6f5`         | Nền app                                             |
| Surface đọc      | `#ffffff`         | Chat, form, dialog                                  |
| Sidebar/subtle   | `#f1f3f2`         | Điều hướng phụ                                      |
| Text chính       | `#17201e`         | Nội dung trên surface sáng                          |
| Text phụ         | `#52605c`         | Thời gian, giải thích; đo lại trên nền thực         |
| Action chính     | `#0d7c62`         | Button chính, chữ trắng                             |
| Action hover     | `#0c654f`         | Hover của action chính                              |
| Selected nhẹ     | `#d8f5eb`         | Kèm chữ/icon, không thay focus                      |
| Border nhẹ       | `#dfe4e2`         | Phân vùng; không mặc định đủ contrast cho input     |
| Destructive      | `#b54444`         | Xóa/kết thúc có hậu quả, kèm label                  |
| Stage media      | `#17201e`         | Nền vùng hình; text/surface control cần token riêng |

Đây là các màu đang có trong export hoặc hướng gần với nó, không phải kết quả audit contrast. Success/warning/error/info cần cặp foreground/background/border riêng, đo trước áp dụng; không dùng màu accent thay mọi trạng thái. Không đưa màu avatar ngẫu nhiên thành trạng thái online hoặc quyền.

## Typography

Font stack đề xuất: `Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif`. CSS export gọi Inter nhưng chưa chứng minh font đã được tải/đóng gói; kiểm fallback và dấu tiếng Việt. Nếu thêm font asset phải kiểm license và budget tải trong PR riêng.

| Vai trò            | Cỡ/line-height đề xuất | Weight  |
| ------------------ | ---------------------- | ------- |
| Nội dung chat/form | 14–16 px / 1.5         | 400     |
| Label/button       | 14 px / 1.4            | 500–600 |
| Metadata/caption   | 12 px / 1.5            | 400–500 |
| Tiêu đề panel      | 18 px / 1.4            | 600     |
| Tiêu đề trang      | 24 px / 1.3            | 600–700 |

Dùng `rem` khi triển khai scale; đây là quy đổi ở root mặc định 16 px. Không copy nhãn 9–10 px trong export thành chuẩn. Metadata phụ vẫn phải đọc được; tiêu đề dài xuống dòng, không tăng letter-spacing cho đoạn tiếng Việt. Không tải nhiều weight chỉ để khớp số 650/740 của prototype.

## Spacing, radius và elevation

Scale đề xuất theo bước 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 48. Dùng 4–8 cho icon/label, 12–16 cho field/row, 20–24 cho section/dialog. Giá trị ngoài scale phải có lý do layout hoặc hình học; tọa độ board/video không ép về spacing token.

Radius đề xuất: 4 px cho chi tiết nhỏ, 8 cho control/surface, 12 cho dialog, pill cho badge/avatar khi có ý nghĩa. Viền nhẹ cho phân cấp, bóng chỉ cho lớp nổi (menu/dialog), không shadow từng message. Tránh blur/gradient trang trí; nền auth có gradient trong export không tự thành quy chuẩn mới.

## Icon và trạng thái

Một bộ icon thống nhất về nét, kích thước và baseline. Export có `Icon` SVG nội bộ; có thể đánh giá tái sử dụng trước chọn thư viện. Đề xuất icon 16/20/24 px; hit area độc lập kích thước hình. Icon trang trí ẩn khỏi accessibility tree, icon-only control có tên và tooltip. Không dùng emoji làm icon thao tác.

Mic/camera/share/recording cần label và pressed/busy/disabled đúng nghĩa; đang tắt khác không có quyền/không có thiết bị. Màu đỏ chỉ hỗ trợ nghĩa, không thay chữ.

## Kích thước và chuyển động

Button đề xuất cao 36/40 px; icon control thường 36 px, control call 40–44 px. Cho phép density gọn trong danh sách nhưng không làm vùng bấm quá nhỏ. Dialog co theo viewport, nội dung cuộn, footer thao tác luôn tới được. Layout chi tiết ở [layouts](layouts.md).

Chuyển động chỉ báo đổi trạng thái, không làm chậm thao tác. Có reduced motion; không dùng animation làm đồng hồ authority. Fade nét tạm và mốc cảnh báo recording theo nguồn sản phẩm, chưa tự chốt bằng duration token. Kiểm các giá trị nền này trên ít nhất TEXT+thread, dialog form và call mở panel trước nhân rộng.
