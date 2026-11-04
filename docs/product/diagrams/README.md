# Sơ đồ CoLearnia — bản hiện hành

> **Delta sau kickoff 02/11:** bản Astah/PNG được xác nhận trước đó là nguồn hình trước ba thay đổi mới. Lượt này chỉ sửa tài liệu, giữ nguyên file `.asta` và ảnh đã có thay đổi của người dùng. Cần bỏ bước host xét duyệt/nhánh từ chối DISCUSSION, đổi thành server kiểm/tạo rồi chủ động vào; bổ sung random trong chuẩn bị ACTIVITY, ghi/xem video MAIN ở phân rã cuộc họp theo [recording](../recording.md). Activity tổng thể giữ mức khái quát, không thêm chi tiết pipeline. Chưa tuyên bố ảnh đã đồng bộ delta này.

Nguồn chỉnh sửa duy nhất là [CoLearnia-use-cases.asta](CoLearnia-use-cases.asta), gồm **6 sơ đồ UC và 1 Activity**. Người dùng đã cập nhật format; ngày 01/11/2026 đã lưu project đang mở và xuất lại cả 7 PNG qua **Tools → Export Image → Multi Diagrams → PNG**, giữ tên ảnh cũ để không hỏng liên kết. Ảnh tổng quan không đổi byte; 6 ảnh còn lại thay đổi. Không chỉnh nội dung/bố cục người dùng trong lượt xuất.

## Các ảnh hiện có

| Sơ đồ                                   | Ảnh                                                | Trạng thái so với danh mục nghiệp vụ                      |
| --------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| UC Tổng quan CoLearnia                  | [Tổng quan](use-case-overview.png)                 | 5 actor, 8 oval; nhóm truy cập chung và TQ-02/03/04/05/07 |
| Phân rã UC Tham gia hoạt động nhóm      | [Tham gia nhóm](use-case-group-participation.png)  | 3 UC: GRP-02/04/08                                        |
| Phân rã UC Điều hành hoạt động nhóm     | [Điều hành nhóm](use-case-group-control.png)       | 8 oval; GRP-09 gồm một/tất cả DISCUSSION; GRP-10 đã gộp   |
| Phân rã UC Tham gia cuộc họp trực tuyến | [Cuộc họp](use-case-meeting.png)                   | 11 UC; chuyển host chỉ nối host, không chờ chấp nhận      |
| Phân rã UC Trao đổi trong Workspace     | [Chat Workspace](use-case-workspace-messaging.png) | 6 UC MSG-01/02/04/05/06/08                                |
| Phân rã UC Tổ chức không gian học tập   | [Workspace](use-case-workspace-organization.png)   | 15 UC WS-01–15; WS-15 nối owner/admin                     |
| Luồng hoạt động tổng thể của CoLearnia  | [Activity](activity-overview.png)                  | 3 lane, 19 action; xem [cách đọc](activity-overview.md)   |

## Kết quả đối chiếu bản mới ngày 01/11/2026

- WS-15 “Quản lý quyền truy cập kênh” đã có trên hình Workspace, nối đúng owner/admin; 15 oval, không tạo actor hoặc UC PRIVATE trên tổng quan.
- UC chuyển quyền host trên hình cuộc họp chỉ nối host; đã bỏ đường nối thành viên dùng cho xác nhận nhận quyền. 11 oval, 12 association theo kiểm ảnh.
- Hình điều hành có 8 oval, giữ GRP-09 “Kết thúc nhóm trao đổi”. Người dùng đã đồng ý gộp GRP-10 vào GRP-09: chọn một hoặc tất cả DISCUSSION là hai nhánh; mã GRP-10 chỉ để truy vết, không tái sử dụng. ACTIVITY vẫn tự kết thúc theo deadline.
- Catalog, outline, kế hoạch phân rã và bảng UC ↔ dữ liệu đã đồng bộ: **46 UC = 43 nghiệp vụ + 3 truy cập chung**; 54 mã ứng viên vẫn được truy vết, gồm 8 mục gộp. Không thay 16 khái niệm/13 collection hoặc thêm hồ sơ đặc tả mới.

Đã mở đúng project trong Astah, lưu các chỉnh sửa đang mở rồi xuất lại 7 PNG trực tiếp và kiểm ảnh Workspace/cuộc họp/điều hành. Giữ layout của người dùng. Sau export, UI trả lỗi `noWindowsAvailable` khi thử đọc definition; chưa audit lại toàn bộ definition/model ID/font qua API. Không coi kiểm ảnh là xác nhận mọi metadata UML đã đồng bộ, hoặc feature runtime đã chạy.

## Quy ước và lịch sử

Theo [kế hoạch/đích phân rã](plan.md), UC ở giữa khung ngang, actor ngoài khung, oval vừa nội dung và font mục tiêu 14. Không dùng include/extend cho thứ tự “tạo nhóm rồi vào”, đăng nhập là điều kiện. TIMER-01 tự kết thúc ACTIVITY theo deadline; host chỉ đóng DISCUSSION. Tổng quan không tách cộng tác hình/nét khỏi tham gia cuộc họp.

Các số lượng/font/ảnh của các đợt bàn giao cũ không phải trạng thái hiện tại. [Bản batch3 lịch sử](../../archive/diagrams/README.md) được chuyển khỏi thư mục đang làm; tiếp tục chỉnh đúng project hiện hành. Không tạo project mới để thay bản có chỉnh sửa thủ công.

Checker kiểm nguồn/tệp/liên kết, không đọc ngữ nghĩa Astah, xác minh font hay chứng minh media đã chạy. Lượt đồng bộ này lưu project hiện tại và thay PNG bằng bản export mới; không sửa layout của người dùng.

## Trạng thái hiện hành — xác nhận ngày 02/11/2026

Người phụ trách dự án xác nhận file Astah và các ảnh UC hiện có là bản mới nhất, đã cập nhật. Ghi chú trước đây cho rằng Astah/PNG chưa cập nhật đã lỗi thời và được thay bằng xác nhận này. Các kết quả kiểm API/font ở trên là bằng chứng của lần kiểm trước, không phải lần kiểm mới trong lượt sửa tài liệu này.

Quy tắc board hiện hành ở [board](../board-collaboration.md) và [HS-05 bản 3](../use-cases/05-board-collaboration.md): BOARD-01/05 chỉ DISCUSSION/ACTIVITY; BOARD-02 có quyền vẽ nhóm và quyền host tại MAIN. MAIN không freeze/resume, giữ host vẽ LIVE; không thêm oval tổng quan. Activity thể hiện hoạt động theo đúng phạm vi. Tiếp tục dùng cùng [CoLearnia-use-cases.asta](CoLearnia-use-cases.asta) và các đường dẫn PNG trong bảng trên.

## Hai quyết định nhóm bổ sung sau xác nhận bản vẽ ngày 02/11/2026

Tài liệu nghiệp vụ vừa cập nhật: UC-GRP-12 chỉ áp ACTIVITY, DISCUSSION hỏi/trả lời riêng với host tại MAIN; UC-GRP-08 có nhánh người cuối cùng chủ động rời DISCUSSION đã có người làm nhóm tự đóng. Không thêm oval/UC mới. Các xác nhận Astah/PNG phía trên giữ nguyên cho lần cập nhật trước; **lượt sửa tài liệu này chưa chỉnh hoặc kiểm lại Astah/PNG theo hai quyết định nhóm mới**. Khi cập nhật bản vẽ, dùng cùng file hiện hành, đối chiếu điều kiện/ghi chú GRP-12 và nhánh rời DISCUSSION theo HS-02/HS-06; không tạo file Astah mới.

## Delta nghiệp vụ ngày 04/11/2026 cần cập nhật hình

Bỏ oval/luồng UC-GRP-07 host điều chuyển; member tự vào lại đúng ACTIVITY đã phân, host chỉ help. DISCUSSION disconnect thu membership ngay/nhóm rỗng đóng; host rớt thay tạm ngay; không empty grace. Astah/PNG chưa được sửa/xuất lại trong lượt tài liệu này; đối chiếu [nguồn nhóm](../group-modes.md) và [host/reconnect](../live-session.md) trước dùng hình làm baseline.
