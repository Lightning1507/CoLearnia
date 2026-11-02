# Đặc tả 6 luồng Use Case trọng tâm

**HS-01 bản 3 (host); HS-02 bản 3 (vòng đời/giới hạn request); HS-03 bản 4 (giới hạn duration), cập nhật 01/11/2026. HS-04/06 giữ bản 2; HS-05 bản 3 cập nhật board ngày 02/11/2026.** Phạm vi 6 hồ sơ đã được người dùng đồng ý; các luồng chi tiết dưới đây là bản triển khai từ nghiệp vụ hiện hành để review, chưa là bằng chứng tính năng chạy hoặc sơ đồ Astah đã hoàn thành.

[Báo cáo review bản 1 và kết quả xử lý](review-2026-10-29.md): F-01…F-05 và R-01/R-02 đã được xử lý trong bản 2; quyết định ACTIVITY lỗi và host chủ động rời hỗ trợ đã được người dùng làm rõ, không còn chờ chọn.

## Phạm vi và cách đọc

Chỉ đặc tả 6 luồng quan trọng, không viết đặc tả riêng toàn bộ danh mục. [Danh mục UC](../use-case-catalog.md) và [actor/tổng quan](../use-case-outline.md) vẫn giữ mã và cấu trúc đã thống nhất. Mã HS là hồ sơ luồng, **không phải UC mới**. Một hồ sơ có thể chứa nhiều UC thực hiện khác thời điểm/actor; các giai đoạn ghi rõ mã sở hữu. Không dùng việc đặt chung hồ sơ để suy ra include, extend hoặc gộp các UC trên sơ đồ.

| Hồ sơ                              | Nội dung                                     | UC được đặc tả trong hồ sơ                                                                  | Feature / backlog                         |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [HS-01](01-join-meeting.md)        | Vào cuộc họp; nhánh xác lập và phục hồi host | UC-LIVE-01; nhánh phục hồi host liên quan UC-GRP-01, không thay đặc tả chuyển host chủ động | LIVE-01/02, HOST-01, REC-01 / PB-05/07/11 |
| [HS-02](02-discussion.md)          | Yêu cầu, duyệt và chủ động vào DISCUSSION    | UC-GRP-02/03/04; tự về MAIN tham chiếu UC-GRP-08                                            | GRP-01/02 / PB-07                         |
| [HS-03](03-activity.md)            | Tổ chức và kết thúc lượt ACTIVITY            | UC-GRP-05/06/11; nhánh UC-GRP-07/08; kết thúc tự động theo deadline                         | GRP-01/02, TIMER-01 / PB-07/10/14         |
| [HS-04](04-screen-sharing.md)      | Chia sẻ và dừng nguồn màn hình theo scope    | UC-LIVE-05, bao gồm thao tác dừng đã gộp vào luồng                                          | LIVE-03 / PB-05                           |
| [HS-05](05-board-collaboration.md) | Freeze, vẽ chung và resume                   | UC-BOARD-01/02/05; undo/clear là nhánh trong UC-BOARD-02                                    | BOARD-01, FREEZE-01 / PB-06               |
| [HS-06](06-private-help.md)        | Chat đúng đích và host hỗ trợ riêng nhóm     | UC-LIVE-08/09, UC-GRP-12                                                                    | HELP-01 / PB-09                           |

Actor dùng A-00/A-03/A-04/A-05/A-07 theo bản tổng quan đã rút gọn ngày 29/10/2026. Hành vi thành viên trong cuộc họp dùng A-03, kể cả khi đồng thời là host; hành vi điều hành và quyền vẽ MAIN chỉ dành cho host dùng A-07. Đã vào phiên và quyền scope là điều kiện thực hiện. Backend, bộ đếm giờ và cơ chế phục hồi là xử lý của CoLearnia, không thêm actor hệ thống nội bộ.

Ngoại trừ thao tác vào cuộc họp ở HS-01, các UC thao tác trong cuộc họp ở HS-02…HS-06 yêu cầu actor đang tham gia chính LiveSession đang xét, còn quyền LIVE và đủ quyền ở scope tương ứng. Có membership Workspace, quyền kênh hoặc tên trong roster chưa đáp ứng điều kiện này. Các nhánh mất mạng/thu quyền kiểm lại trạng thái hiện hành, không dùng actor A-03 để suy ra quyền tham gia phiên.

## Quy ước đặc tả

- Mỗi hồ sơ có mục tiêu, actor, trigger, tiền điều kiện, luồng chính, nhánh thay thế/lỗi, hậu điều kiện, quy tắc và ca review.
- Tiền điều kiện xác định ngữ cảnh bắt đầu. Kiểm tra lại khi hành động thực thi vẫn bắt buộc vì quyền/nhóm/host có thể đổi trong lúc người dùng thao tác.
- Bước luồng mô tả actor làm gì và hệ thống phản hồi ra sao; không khóa thiết kế vào endpoint, schema, màu nút hoặc giải pháp transaction cụ thể.
- Giai đoạn có thể kết thúc ở trạng thái chờ, không bắt host hoặc người được duyệt phản hồi ngay trong cùng lượt thao tác.
- Ca review là tiêu chí cần nghiệm thu sau này; chưa phải test đã viết/chạy. Không suy checker Markdown hoặc worker smoke chứng minh đúng các luồng này.
- Nguồn sở hữu quy tắc vẫn là [group modes](../group-modes.md), [live session](../live-session.md), [policy](../groups-media-policy.md), [board](../board-collaboration.md) và [scope](../scope.md). Chỗ chưa chốt ghi rõ ở hồ sơ, không đặt mặc định mới hoặc thay nguồn bằng suy diễn.

## Làm rõ đã chốt sau review

- **Host ngày 01/11:** gán trực tiếp không chờ người nhận; host còn quyền chủ động rời kết thúc phiên cho mọi người, người đã bàn giao chính thức rời như thành viên. Thay host tạm do mất mạng khác bàn giao chính thức; không thêm co-host/presenter. Nguồn: [live session 8.3](../live-session.md#83-chuyển-host-và-host-mất-mạng).

- **ACTIVITY bắt đầu lỗi một phần:** hủy lượt chưa hoàn tất, thu các nhóm/nguồn vừa mở và countdown của lượt; đưa người còn quyền về MAIN, host có thể chủ động bắt đầu lại sau kiểm tra. Không khôi phục DISCUSSION đã đóng. Nguồn sở hữu: [group modes](../group-modes.md).
- **Host chủ động rời hỗ trợ:** về MAIN độc lập với bật/tắt mic, không hỏi xác nhận mic riêng; mic giữ nguyên trạng thái và đổi phạm vi theo nơi host ở. Mic tại MAIN/hướng dẫn tới MAIN/DISCUSSION theo policy, không phát vào ACTIVITY khác. Sự cố/cleanup không tự áp thao tác rời chủ động này. Nguồn sở hữu: [policy](../groups-media-policy.md#81-host-group-và-hỗ-trợ).
- Mỗi UC/giai đoạn có điều kiện và hậu điều kiện riêng; nhánh có mã HS-xx-Eyy và chỉ dẫn kết thúc/tiếp tục. Everyone là UC độc lập C trong HS-06, không là alternative/extend của hỏi Host.

## Điểm còn mở và quy tắc vừa được chốt

1. **Host:** còn mở khi không có ứng viên thay hoặc host tạm cũng mất mạng. Gán host trực tiếp không cần chấp nhận, host còn quyền chủ động rời kết thúc phiên, bàn giao chính thức không tự hoàn quyền đã chốt ngày 01/11; xem HS-01 và nguồn live session.
2. **DISCUSSION đã chốt 01/11:** hủy pending, không sửa; mất hiệu lực theo phase/phiên, không TTL phút; tên ≤80, mục đích ≤500, danh sách hợp lệ không trùng và không cap riêng ngoài capacity. Không tự thêm mời người ngoài roster hoặc khả năng đổi loại nhóm tại chỗ.
3. **ACTIVITY/countdown đã chốt 01/11:** số nguyên 1–120 phút trước bắt đầu, không sửa/gia hạn/tạm dừng khi chạy; schema cấu hình nhóm chi tiết hoàn thiện theo task. Không tự thêm các controls mở rộng. Hết thời lượng tự đóng ACTIVITY/về MAIN đã được chốt ngày 29/10; không còn là điểm mở.
4. **Media/board:** profile/capacity và giới hạn payload phải được kiểm chứng; không coi ví dụ lớp 40–50 người là tải nghiệm thu đã chốt. Các trường hợp nguồn/frame/quyền đổi đã có quy tắc tại nguồn.

Đã có các sơ đồ UC và một Activity; [trạng thái bản vẽ](../diagrams/README.md) ghi chênh lệch còn lại. Tiếp tục giải quyết nhánh mở trong task phụ thuộc và kiểm luồng cùng implementation. Không tạo thêm hồ sơ chi tiết cho tài khoản/CRUD/DM/thread ở đợt này. Thay đổi quy tắc thực sự phải cập nhật nguồn sở hữu cùng lúc, không chỉ chỉnh luồng tại đây.
