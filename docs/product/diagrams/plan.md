# Kế hoạch sơ đồ Use Case phân rã

> **Delta sau kickoff 02/11:** bản Astah/PNG được xác nhận trước đó là nguồn hình trước ba thay đổi mới. Lượt này chỉ sửa tài liệu, giữ nguyên file `.asta` và ảnh đã có thay đổi của người dùng. Cần bỏ bước host xét duyệt/nhánh từ chối DISCUSSION, đổi thành server kiểm/tạo rồi chủ động vào; bổ sung random trong chuẩn bị ACTIVITY, ghi/xem video MAIN ở phân rã cuộc họp theo [recording](../recording.md). Activity tổng thể giữ mức khái quát, không thêm chi tiết pipeline. Chưa tuyên bố ảnh đã đồng bộ delta này.

Đích phân rã được người dùng đồng ý, cập nhật các quyết định tới 01/11/2026. Trạng thái bản Astah/PNG thực tế chỉ ghi tại [README bản vẽ](README.md). Đây là kế hoạch đầu ra mô hình UC, không là bảng trạng thái công việc cạnh tranh với GitHub Issues/Projects. Nguồn nghiệp vụ vẫn ở [danh mục UC](../use-case-catalog.md), [định hình tổng quan](../use-case-outline.md) và [6 hồ sơ đặc tả](../use-cases/README.md).

## Ba đợt triển khai

Sau các lần review và xác nhận tiếp theo, kế hoạch còn **5 sơ đồ phân rã (2 + 2 + 1)**, mỗi hình bám một UC nghiệp vụ tổng quan. Đây là lựa chọn trình bày của nhóm, không phải quy tắc UML bắt buộc. Gộp hình không bỏ chức năng hoặc đổi quyền.

| Đợt | Sơ đồ phân rã theo UC tổng quan         | UC cần thể hiện                                   |
| --- | --------------------------------------- | ------------------------------------------------- |
| 1   | Phân rã UC Tham gia hoạt động nhóm      | GRP-02/04/08                                      |
| 1   | Phân rã UC Điều hành hoạt động nhóm     | GRP-03/05/06/07/09/11/12/13                       |
| 2   | Phân rã UC Tham gia cuộc họp trực tuyến | LIVE-01/02/04/05/08/09/10, GRP-01, BOARD-01/02/05 |
| 2   | Phân rã UC Trao đổi trong Workspace     | MSG-01/02/04/05/06/08                             |
| 3   | Phân rã UC Tổ chức không gian học tập   | WS-01–15                                          |

Mã trong bảng lược tiền tố `UC-`; tên sơ đồ bắt đầu bằng “Phân rã UC” và giữ đúng tên UC tổng quan, hậu tố chỉ góc nhìn khi cần chia hình. Ba UC truy cập chung giữ trên tổng quan, không phân rã thêm.

## Quy tắc mô hình và trình bày

- Cùng project Astah, dùng lại 5 actor đã chốt. GRP-08 chỉ cần vẽ ở TQ-05 nhưng vẫn áp dụng cho cả DISCUSSION/ACTIVITY. GRP-09 áp dụng một/tất cả DISCUSSION; GRP-10 đã gộp vào GRP-09; ACTIVITY hết deadline tự kết thúc theo HS-03. Không nhân bản phần tử hoặc dùng tên mode thay UC cha.
- Association mô tả tương tác. Thành viên phối hợp nhận thông báo, được chuyển phạm vi hoặc nhận hỗ trợ không có quyền ra lệnh điều hành. Actor chủ động, actor phối hợp và điều kiện quyền lấy từ danh mục/đặc tả; sơ đồ không thay ma trận ACL.
- Giữ quan hệ kế thừa hiện có trong mô hình tổng quan; không cần vẽ lại toàn cây trên từng góc nhìn. Chỉ thêm liên kết host khi có tương tác riêng, không nối lại mọi hành vi thành viên đã kế thừa.
- Chuyển host (GRP-01) và kết thúc cuộc họp (LIVE-10) thuộc phân rã TQ-04 ở đợt 2. Giữ phần tử mô hình hiện có và mã cũ, không cắt chức năng hoặc ép vào phân rã hoạt động nhóm.
- Trên hình, đặt thời lượng chỉ nối host; nhận countdown là luồng trong đặc tả. Thông báo hướng dẫn chung chỉ nối host; hỗ trợ riêng ACTIVITY nối thêm thành viên trực tiếp trao đổi; DISCUSSION chỉ hỏi/trả lời qua LIVE-09 khi host ở MAIN. Cập nhật 01/11: UC chuyển host chỉ nối host, không có bước thành viên đích xác nhận; kết thúc cuộc họp chỉ nối host.
- Ngừng áp dụng GRP-07 điều chuyển từ 04/11/2026, bỏ oval tương ứng; GRP-09 thành “Kết thúc nhóm trao đổi”, gồm hai nhánh một/tất cả DISCUSSION; GRP-10 giữ mã truy vết đã gộp, không thêm oval thứ hai.
- Đặt countdown có kết quả là đồng hồ chung cho lượt; hết giờ tự kết thúc ACTIVITY/về MAIN, không chờ host; không tạo oval hoặc actor hệ thống cho callback timer. Thông báo hướng dẫn chung có audience/ưu tiên âm thanh theo policy, không là oval khác chỉ để bật mic.
- Duyệt rồi vào nhóm, chuẩn bị rồi bắt đầu, nhắn host rồi hỗ trợ là những quan hệ thời gian/điều kiện; không tự nối include/extend. Vẽ không bắt buộc freeze; freeze không bắt buộc vẽ. Đợt 1 chưa có quan hệ include/extend cần thêm.
- Mọi khung hệ thống mang tên CoLearnia. Khung ngang, oval gọn theo tên, actor bên ngoài, font UC 14; kiểm tránh đường xuyên oval/nhãn hoặc giao chéo không cần thiết. Những yêu cầu chưa xác minh được phải ghi tại [trạng thái bản vẽ](README.md).

## Nội dung đợt 2 đã xác nhận

- TQ-04 có 11 UC trên cùng một hình, gồm cuộc gọi, share, board, chat, chuyển host và kết thúc phiên. A-03 nối 9 UC thông thường, BOARD-01/05 chỉ khi ở nhóm. Theo quyết định 02/11, A-07 cần thêm association BOARD-02 riêng cho vẽ MAIN host-only. A-07 nối riêng LIVE-09 (nhận/trả lời), GRP-01 (gán host trực tiếp), LIVE-10 (kết thúc phiên); không nối lặp 9 hành vi thành viên đã kế thừa. Đích mới là 13 association; ảnh xuất kiểm ngày 01/11 đã bỏ đường nối thành viên với chuyển host.
- TQ-03 có 6 UC gửi/xem kênh, gửi/xem DM, thảo luận thread và tải attachment; chỉ dùng A-03, tổng 6 association. Owner/admin kế thừa nhưng không vượt ACL hội thoại. Chọn người/mở DM, upload, phân trang và thử lại nằm trong luồng. Thread một cấp chỉ trong TEXT; chat cuộc họp chỉ text/ảnh.
- Không include vào cuộc họp với đăng nhập, vẽ với freeze hoặc gửi tin với tải tệp. Nguồn/quyền/scope là điều kiện; xử lý phục hồi host mất mạng nằm trong nhánh, không thêm actor hoặc UC tự nhận host.

## Đích Workspace và kiểm tra bàn giao

TQ-02 có 15 UC WS-01–15: A-00 nối WS-01/02/07 với điều kiện đăng nhập; A-03 nối WS-08; A-04/A-05 cùng nối WS-03/05/06/10/12/13/14/15; A-05 riêng WS-04/09/11. Tổng 23 association. Không tạo actor trung gian hoặc xác nhận nhận quyền owner. General sinh trong tạo Workspace; vào qua lời mời dựa trên điều kiện, không include tạo lời mời.

TIMER-01 tự kết thúc ACTIVITY, không thêm oval callback; GRP-09 đóng một/tất cả DISCUSSION (GRP-10 đã gộp). Hủy pending là nhánh GRP-02; duration/request lấy tại [group modes](../group-modes.md), không còn điểm mở tương ứng.

Đối chiếu ID/tên/actor với danh mục, kiểm model trong Astah, kiểm trực quan và xuất ảnh từ cùng project đã lưu. Font mục tiêu 14. Phần chưa khớp ghi đúng tại README bản vẽ; không coi số lượng đích ở kế hoạch là bằng chứng đã vẽ. Không tự chọn nhánh host nhiều sự cố hoặc capacity còn mở.
