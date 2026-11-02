# Activity Diagram — Luồng hoạt động tổng thể của CoLearnia

> **Delta sau kickoff 02/11:** bản Astah/PNG được xác nhận trước đó là nguồn hình trước ba thay đổi mới. Lượt này chỉ sửa tài liệu, giữ nguyên file `.asta` và ảnh đã có thay đổi của người dùng. Cần bỏ bước host xét duyệt/nhánh từ chối DISCUSSION, đổi thành server kiểm/tạo rồi chủ động vào; bổ sung random trong chuẩn bị ACTIVITY, ghi/xem video MAIN ở phân rã cuộc họp theo [recording](../recording.md). Activity tổng thể giữ mức khái quát, không thêm chi tiết pipeline. Chưa tuyên bố ảnh đã đồng bộ delta này.

## Phạm vi đã xác nhận

Một sơ đồ để hình dung hành trình chính của buổi học, **3 swimlane, 19 action**. Thay bản 41 action quá dài; bản 17 action trước đó đã gộp nhánh quá sớm, nên lần này tách rõ hai hành trình nhóm và thao tác trở về phòng chung. Không mô tả từng bước kiểm quyền, chuẩn bị thiết bị, xử lý lỗi hoặc cleanup kỹ thuật.

[Project Astah hiện hành](CoLearnia-use-cases.asta) · [Ảnh xuất](activity-overview.png) · [Danh mục UC](../use-case-catalog.md) · [Đặc tả trọng tâm](../use-cases/README.md).

Ba lane: **Người dùng hệ thống**, **Host cuộc họp**, **Hệ thống CoLearnia**. Một người có thể giữ nhiều vai trò; host không đồng nhất với owner. Quản trị Workspace không thuộc trọng tâm hình này nên không giữ lane Owner/Admin.

## Các action và truy vết

ID được giữ theo cụm (01–11, 13–14, 16–21); 19 action nằm trong definition của phần tử Astah, không phải mã UC mới.

| Cụm                    | Action                                                                                                                                                                         | Nguồn                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Vào buổi học           | 01 truy cập Workspace; 02 host bắt đầu; 03 khởi tạo phiên cuộc họp; 04 tham gia; 05 học ở phòng chung                                                                          | [Workspace](../workspace-channels.md), [HS-01](../use-cases/01-join-meeting.md), [Live session](../live-session.md) |
| Nhóm trao đổi          | Đích mới: tạo nhóm → hệ thống kiểm hợp lệ → người trong roster chủ động vào → trao đổi và theo dõi bài giảng; ảnh cũ chưa cập nhật                                             | [HS-02](../use-cases/02-discussion.md)                                                                              |
| Nhóm hoạt động         | 09 host thiết lập và bắt đầu hoạt động nhóm (gồm thời lượng); 10 hệ thống đưa thành viên vào nhóm hoạt động; 20 thành viên thực hiện hoạt động nhóm                            | [HS-03](../use-cases/03-activity.md)                                                                                |
| Rời hoặc kết thúc nhóm | 13 thành viên chọn rời nhóm trao đổi; 21 thành viên chọn về sớm từ nhóm hoạt động; 19 host kết thúc nhóm trao đổi; 14 hệ thống kết thúc lượt hoạt động nhóm khi hết thời lượng | [Group modes](../group-modes.md), [HS-03](../use-cases/03-activity.md)                                              |
| Trở về và kết thúc     | 18 hệ thống đưa thành viên liên quan về phòng chung rồi quay lại action 05; 16 host kết thúc cuộc họp cho mọi người; 17 hệ thống đóng phiên                                    | [Group modes](../group-modes.md), [Live session](../live-session.md)                                                |

## Cách đọc

- Hình minh họa một hành trình buổi học. Không mô tả một token cho toàn bộ người tham gia; các nhóm không phải chờ nhau, việc học vẫn tiếp tục khi host hỗ trợ riêng. Hai nhánh nhóm là lựa chọn theo ngữ cảnh, không phải phải thực hiện cả hai.
- Workspace là điểm xuất phát đã sẵn sàng; tạo Workspace, mời thành viên, quản trị kênh và chat bền vững xem UC riêng. Hình bắt đầu từ người dùng đã đăng nhập, không bắt tạo Workspace hoặc cuộc họp mới mỗi lần tham gia phiên có sẵn.
- DISCUSSION được hệ thống tạo hợp lệ trước; người được chọn tự bấm vào. Nhóm giữ bài giảng chung và không share riêng. Tạo không hợp lệ thì báo để sửa, người dùng vẫn ở phòng chung.
- ACTIVITY đóng DISCUSSION trước, không nhận yêu cầu DISCUSSION mới trong lượt; các nhóm độc lập. Các bước kiểm cấu hình/kích hoạt và lỗi chuyển một phần được gộp trong action 10, xem đặc tả để triển khai.
- Mic/camera, chat, share và vẽ nằm trong hoạt động học theo quyền; chỉ host vẽ LIVE tại MAIN, freeze/vẽ chung chỉ trong nhóm, không phải một chuỗi bắt buộc. Action 11 thể hiện trao đổi riêng khi theo dõi bài giảng; action 20 thể hiện hoạt động nhóm độc lập.
- DISCUSSION hỏi/trả lời host qua chat riêng khi host ở MAIN. Hỗ trợ trực tiếp trong nhóm chỉ áp ACTIVITY, được ghi như hoạt động tùy nhu cầu, không ép qua một nhánh hỗ trợ rồi mới được rời nhóm hoặc xử lý deadline. Chi tiết vào/trao đổi/rời hỗ trợ và mic xem [HS-06](../use-cases/06-private-help.md). Không bỏ tính năng hỗ trợ khỏi scope khi lược luồng con trên hình tổng thể.
- Hai nhánh học nhóm không gộp trước hoạt động học; tạo không hợp lệ hiển thị lỗi để sửa, không có nhánh host từ chối. Hình hiện có cần sửa theo delta đầu trang.
- Tự về sớm chỉ chuyển người chọn; không kết thúc lượt của người khác. Host kết thúc DISCUSSION là action 19 ở lane Host. ACTIVITY hết giờ tự thực hiện action 14 ở lane Hệ thống, không chờ host quyết định.
- Chỉ gộp các trường hợp cần chuyển người về phòng chung trước action 18. Điểm gộp là merge, không phải join chờ đủ các nhóm. “Kết thúc lượt hoạt động nhóm” và “Đưa thành viên về phòng chung” có ô riêng; điều kiện “Hết thời lượng” nằm trên đường nối.
- Chỉ có một action 05 “Học và trao đổi tại phòng chung”. Các luồng vừa tham gia, tạo nhóm không hợp lệ, tiếp tục học và trở về từ nhóm đều gộp trước action này; không có ô “Tiếp tục học tại phòng chung” trùng lặp. Sau action 05, lựa chọn tiếp tục học, xin nhóm trao đổi, host tổ chức hoạt động hoặc host kết thúc buổi học nằm tại cùng điểm rẽ nhánh.
- Điểm kết thúc là kết thúc buổi học, không xóa Workspace/kênh/hội thoại. Reconnect, chuyển host, quyền, tranh nguồn và các nhánh lỗi giữ tại đặc tả UC; không bị bỏ khỏi phạm vi sản phẩm khi lược khỏi hình.

## Kiểm tra ở lần dựng trước

Các kết quả API/control-flow dưới đây ghi tại lần dựng, chưa được chạy lại sau chỉnh format thủ công. PNG hiện đã xuất lại từ project đang mở ngày 01/11/2026, kích thước 2068 × 2261 px; xem [trạng thái chung](README.md).

- Chỉnh trong cùng file Astah hiện hành; giữ ID các UC và 6 sơ đồ UC có sẵn, chỉ thay Activity Diagram. Tổng vẫn 7 sơ đồ.
- Đặt font qua giao diện Astah, lưu rồi đọc lại bằng API: 19/19 action có `font.size=14`. `validateProject()` thành công.
- Kiểm 33 control flow: 0 đoạn chéo, 0 đoạn xuyên phần trong action khác. Kiểm này không chứng minh không còn mọi giao cắt giữa các đường.
- Kiểm ảnh PNG xuất từ file gốc đã lưu: 2120 × 2261 px; bố cục rộng hơn bản 17 action để đặt hai nhánh nhóm cạnh nhau; luồng chính, nhánh nhóm và chữ nằm trong các ô đọc được ở kích thước phù hợp.
- Checker harness kiểm nguồn/link, không chứng minh luồng đã được triển khai trong ứng dụng. Không thay code, contract hoặc DB.

## Điều chỉnh board 02/11/2026

Trong action học tại MAIN chỉ host vẽ LIVE, không freeze/resume; trong action học nhóm DISCUSSION/ACTIVITY mới freeze/vẽ/resume theo nguồn tương ứng. Không cần thêm action chi tiết cho từng công cụ. Xem [trạng thái bản vẽ hiện hành](README.md); ghi chú cũ về Astah/ảnh chưa cập nhật đã được gỡ theo xác nhận của người phụ trách.

## Quy tắc nhóm cập nhật ngày 02/11/2026

Action rời DISCUSSION có nhánh tự kết thúc khi người cuối cùng chủ động rời nhóm đã có người; nhóm chưa ai vào vẫn chờ, còn người thì roster hợp lệ được chủ động vào lại. Host chỉ vào hỗ trợ ACTIVITY. Không thêm action/oval cho cleanup tự động; chi tiết ở HS-02/HS-06. Lượt này chỉ cập nhật mô tả Markdown, chưa chỉnh hoặc xuất lại Astah/PNG theo hai quyết định mới này.
