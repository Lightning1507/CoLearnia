# Định hình Use Case — actor và tổng quan

**Trạng thái: actor, cấu trúc tổng quan và cách đặt nhóm truy cập đã được người dùng đồng ý sau review.** Ngày 27/10/2026. Tài liệu tổ chức lại nghiệp vụ hiện hành để chuẩn bị vẽ trên Astah; không bổ sung chức năng, thay quyền hoặc chứng minh đã triển khai.

Nguồn: [scope](scope.md), [backlog sơ bộ](backlog-draft.md), [quyền Workspace trong plan mục 10.2](../technical-plan.md#102-rest-chính), [quyền cuộc họp](groups-media-policy.md), [group modes](group-modes.md), [messaging](messaging.md).

## 1. Phạm vi và quy ước

- Subject của sơ đồ là toàn bộ **hệ thống CoLearnia**. Actor ở ngoài ranh giới; backend, database, mediasoup và bộ đếm giờ là thành phần bên trong, không là actor của sơ đồ này.
- Sơ đồ tổng quan thể hiện các mục tiêu tổng hợp theo miền nghiệp vụ ở cùng mức khái quát; đăng ký/đăng nhập/đăng xuất được đặt trực tiếp như nhóm chức năng truy cập chung theo chỉ đạo người dùng, không mở một sơ đồ phân rã tài khoản riêng. Các mục TQ dưới đây là ứng viên UC tổng quan; chưa là UC chi tiết có thể đặc tả bằng một luồng duy nhất.
- Sơ đồ chi tiết sẽ thể hiện mục tiêu cụ thể, có trigger và kết quả; không chuyển từng nút bấm hoặc API thành UC.
- Quan hệ tổng quan → chi tiết được ghi bằng bảng truy vết; không mặc nhiên dùng include, extend hoặc generalization để diễn đạt phân rã.
- UC-01/02/03 hiện hữu vẫn là ba hành trình nghiệm thu trong scope. Mã A và TQ ở đây chỉ là mã tham chiếu phân tích; mã UC chi tiết được đề xuất tại [danh mục UC](use-case-catalog.md), không đổi mã cũ âm thầm.
- Phần 2 ghi lại vai trò/quyền đã có nguồn; việc chọn actor và cách gom ở phần 3 là đề xuất mô hình hóa. Quan hệ kế thừa actor chung được đề xuất ở mục 3; không thay quyền nghiệp vụ.

## 2. Actor đề xuất

| Mã   | Actor                   | Phạm vi và điều kiện                                                          | Tương tác nghiệp vụ chính                                                                                                                 |
| ---- | ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A-00 | Người dùng hệ thống     | Vai trò chung, không biểu thị đã đăng nhập hoặc có quyền Workspace            | Đăng nhập; làm actor tổng quát cho các vai trò sử dụng hệ thống                                                                           |
| A-01 | Người chưa đăng nhập    | Chưa có phiên truy cập hợp lệ                                                 | Đăng ký, đăng nhập                                                                                                                        |
| A-02 | Người dùng đã đăng nhập | Có phiên truy cập hợp lệ; chưa nhất thiết thuộc Workspace nào                 | Đăng xuất; tạo Workspace, xem các Workspace mình thuộc; tham gia qua lời mời hợp lệ                                                       |
| A-03 | Thành viên Workspace    | Có membership hiện hành trong Workspace đang xét; chỉ truy cập kênh được phép | Trao đổi trong kênh, DM cùng Workspace, thread trong TEXT, gửi/đọc/tải tệp đúng phạm vi; truy cập LIVE được phép                          |
| A-04 | Admin Workspace         | Có vai trò admin trong Workspace đang xét                                     | Đổi tên Workspace; tạo/thu hồi lời mời; quản lý kênh; loại member theo quyền                                                              |
| A-05 | Owner Workspace         | Chủ sở hữu duy nhất của Workspace đang xét                                    | Các quyền quản trị tương ứng; đổi admin/member, chuyển owner, xóa Workspace                                                               |
| A-06 | Người tham gia cuộc họp | Đã vào LiveSession và còn quyền; có thể ở MAIN hoặc nhóm                      | Mic/camera, share theo ngữ cảnh, chat cuộc họp, cộng tác trên nội dung; xin DISCUSSION, vào nhóm đã được duyệt, tự về MAIN theo điều kiện |
| A-07 | Host cuộc họp           | Đang giữ vai trò host hợp lệ trong LiveSession mà mình tham gia               | Điều hành phiên, xử lý DISCUSSION, tổ chức ACTIVITY, đặt thời lượng, hỗ trợ nhóm và kết thúc chia nhóm                                    |

### Giới hạn và cách đọc actor

- Một người có thể đóng nhiều vai trò; vai trò phụ thuộc Workspace hoặc LiveSession cụ thể. A-03 chỉ tư cách thành viên nói chung, không chỉ riêng role `member` trong dữ liệu.
- Admin/owner vẫn có thể trao đổi như thành viên khi đủ quyền truy cập; host vẫn có thể tham gia cuộc họp. Hướng generalization đề xuất ở mục 3 chỉ dùng sau khi đối chiếu điều kiện các UC được kế thừa.
- Admin không đổi role, sửa/xóa owner hoặc admin khác; owner có quyền đổi admin/member và chuyển owner theo baseline. Chưa đưa các thao tác này thành oval ở sơ đồ tổng quan.
- Owner/admin không mặc nhiên là host, không mặc nhiên được nghe nhóm riêng hoặc đọc DM. Host không được quản trị Workspace chỉ vì giữ vai trò host.
- Người bắt đầu LiveSession trở thành host; người vào sau không tự nhận host. Không có UC bật chế độ điều hành hoặc tự nhận host. Chuyển host gồm host mời và người tham gia đích xác nhận; mất mạng quá grace thì server chọn ngẫu nhiên participant hợp lệ làm host tạm và tự hoàn quyền khi host cũ quay lại hợp lệ trong cùng phiên. Đây là nhánh phục hồi của UC điều hành, không là UC tự nhận host; rời chủ động và nhiều sự cố còn cần đặc tả. MAIN mọi participant tự share khi nguồn trống, không xin host.
- MAIN, DISCUSSION, ACTIVITY là ngữ cảnh hoạt động; không tạo actor nhóm A/B hoặc actor riêng cho từng mode. Quyền chia sẻ và nhận nội dung thể hiện trong đặc tả.
- Tư cách ở danh sách DISCUSSION được duyệt chưa là tư cách đã vào nhóm. Người được chọn phải chủ động vào; chưa vào không nhận dữ liệu riêng.
- Chưa thêm actor quản trị viên toàn hệ thống, giáo viên, sinh viên, trưởng nhóm hoặc dịch vụ ngoài: baseline không cần những vai trò đó để mô tả quyền hiện tại. Chức danh ngoài đời không thay quyền trong ứng dụng.

## 3. UC tổng quan đề xuất

### Chức năng truy cập chung đặt trực tiếp trên tổng quan

- UC-ACC-01 · Đăng ký tài khoản: A-01, khi chưa có phiên truy cập hợp lệ theo luồng đăng ký.
- UC-ACC-02 · Đăng nhập: nối một lần với **A-00 · Người dùng hệ thống**. Vai trò chuyên biệt kế thừa actor chung; không vẽ quan hệ kế thừa từ người sang UC, không include Đăng nhập từ mọi UC nghiệp vụ. Đăng nhập thực hiện khi cần xác thực; liên kết này không mô tả trạng thái đã đăng nhập.
- UC-ACC-03 · Đăng xuất: A-02, cần có phiên truy cập hợp lệ. Giữ chức năng theo AUTH-01, không cần sơ đồ tài khoản riêng.
- TQ-01 cũ được thay bởi các UC trực tiếp này, không dùng lại mã hoặc đổi số TQ-02…06. Nhóm truy cập là ngoại lệ trình bày có chủ đích, không khẳng định Đăng nhập cùng mức mục tiêu tổng hợp với tổ chức Workspace.
- Hướng kế thừa đề xuất chỉ để dùng chung tương tác: A-01/A-02 → A-00; A-03 → A-02; A-04/A-05 → A-03; A-06 → A-03; A-07 → A-06. Mũi tên tam giác rỗng về actor tổng quát. Owner không kế thừa Admin vì điều kiện role khác nhau; quyền quản trị dùng liên kết trực tiếp tới UC phù hợp. Điều kiện kênh/nhóm vẫn kiểm ở từng UC, không tự mở quyền do kế thừa.

### Các miền nghiệp vụ cần phân rã

Các dòng dưới là cùng mức mục tiêu tổng hợp. Cột phạm vi để giải thích và truy vết, không phải danh sách oval sẽ đặt cùng tầng trên sơ đồ tổng quan.

| Mã    | Tên UC tổng quan đề xuất                          | Mục tiêu/kết quả tổng hợp                                                                       | Actor liên quan                                          | Backlog / feature                                                                  |
| ----- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| TQ-02 | Tổ chức không gian học tập                        | Có Workspace, thành viên và kênh TEXT/LIVE với quyền phù hợp để học cùng nhau                   | A-02, A-03, A-04, A-05; tương tác cụ thể tùy quyền       | PB-02/03 / WS-01/02/03, CH-01                                                      |
| TQ-03 | Trao đổi trong Workspace                          | Thành viên trao đổi, chia sẻ tài liệu qua kênh, DM và thread, đọc lại đúng phạm vi              | A-03; admin/owner chỉ theo quyền hội thoại               | PB-04/12/13 / CHAT-01/02/03, FILE-01                                               |
| TQ-04 | Tham gia cuộc họp trực tuyến                      | Thành viên vào/rời cuộc gọi, trao đổi mic/camera, chia sẻ/xem màn hình và chat đúng phạm vi     | A-03 ở bước vào; A-06 trong cuộc họp                     | PB-05/08, phần chat PB-09 / LIVE-01/02/03, AUDIO-01, phần chat HELP-01             |
| TQ-05 | Tổ chức và tham gia hoạt động nhóm trong buổi học | Người tham gia và host tổ chức DISCUSSION/ACTIVITY, tham gia nhóm, hỗ trợ và trở về phòng chung | A-06, A-07; tách rõ thao tác từng actor ở sơ đồ chi tiết | PB-07/10/14, phần hỗ trợ PB-09 / HOST-01, GRP-01/02, TIMER-01, phần hỗ trợ HELP-01 |
| TQ-06 | Cộng tác trên nội dung chia sẻ                    | Người trong cùng ngữ cảnh được phép dừng hình, vẽ chung và trở về hình trực tiếp                | A-06; A-07 khi có quyền trong ngữ cảnh đang xét          | PB-06 / BOARD-01, FREEZE-01                                                        |

### Ranh giới giữa các mục tổng quan

- TQ-02 sở hữu cấu trúc Workspace/thành viên/kênh; TQ-03 sở hữu trao đổi và tài liệu. Tạo general là kết quả tạo Workspace, không là một UC thủ công cho người dùng.
- TQ-04 sở hữu hành vi cuộc gọi dùng chung cho MAIN và nhóm. TQ-05 sở hữu tổ chức, quyền tham gia và vòng đời nhóm; không lặp lại UC bật camera hay share cho từng loại nhóm.
- Chat Everyone/Host thuộc TQ-04; host vào/rời nhóm hỗ trợ thuộc TQ-05. Tin nhắn không tự đưa host vào nhóm hoặc chuyển mic.
- TQ-06 tập trung vào hình/nét và freeze/resume, không lặp lại việc bắt đầu/dừng share của TQ-04. Nhóm ACTIVITY dùng nguồn đang share của nhóm; DISCUSSION dùng bài giảng MAIN.
- TQ-05 dùng tên bao gồm cả tổ chức lẫn tham gia vì yêu cầu tạo DISCUSSION và tự về MAIN là mục tiêu của thành viên, không chỉ thao tác host. Khi review cần xác nhận tên này đủ rõ và gọn để đặt trên hình.
- REC-01/PB-11 là yêu cầu xuyên suốt: ghi ở nhánh mất kết nối/khôi phục của UC liên quan và tiêu chí nghiệm thu; chưa ép thành một UC tổng quan ngang với các miền nghiệp vụ.
- FILE-01 được truy vết chính ở TQ-03, đồng thời hỗ trợ ảnh chat cuộc họp trong TQ-04. Chat cuộc họp chỉ text/ảnh; không suy từ đây ra quyền gửi file bất kỳ.
- PB-10 là một lát cắt của GRP-01/PB-07, không tạo thêm miền hoặc tính phạm vi hai lần. Countdown chỉ nhắc; host kết thúc ACTIVITY, không tự đưa người về MAIN khi hết giờ.

## 4. Những gì cần review trước khi vẽ

1. Actor chung A-00 và bảy vai trò/ngữ cảnh A-01…A-07 có diễn đạt rõ ba phạm vi truy cập, Workspace và cuộc họp hay không; có vai trò nào chỉ cần là điều kiện thay vì actor độc lập hay không.
2. Năm miền nghiệp vụ TQ-02…06 có cùng mức khái quát, đủ bao phủ và tên phù hợp hay không; đặc biệt tên/ràng buộc TQ-04/05/06.
3. Liên kết actor ở mức tổng quan chỉ diễn đạt tham gia một phần miền, không có nghĩa mọi actor được thực hiện mọi thao tác trong miền đó. Sơ đồ chi tiết phải tách quyền; không dùng sơ đồ tổng quan làm ma trận ACL.
4. Chưa chốt include/extend/generalization, số sơ đồ hoặc layout Astah. [Danh mục UC chi tiết](use-case-catalog.md) đã có bản đề xuất để review; không thêm nghiệp vụ còn mở để làm sơ đồ trông đầy đủ.

## 5. Đầu ra tiếp theo sau review

Review [danh mục UC chi tiết dưới từng TQ](use-case-catalog.md): mã, tên, actor, điều kiện chính, kết quả và nguồn nghiệp vụ. Đối chiếu quan hệ từ luồng thực trước khi vẽ; đặc tả phần nhiều trạng thái rồi mới dựng sơ đồ tổng quan/chi tiết trên Astah. Activity diagram mô tả thứ tự và nhánh, không thay bằng các mũi tên giữa UC.

## Xác nhận sau review

Người dùng đã đồng ý phần review và chỉnh sửa: actor chung cho đăng nhập, nhóm truy cập trực tiếp trên tổng quan, 5 miền nghiệp vụ TQ-02…06 và danh mục 43 UC nghiệp vụ + 3 UC truy cập chung; 7 mục gộp vẫn được giữ chức năng trong luồng sở hữu. Đây là baseline phân tích UC, không xác nhận feature đã triển khai. Quan hệ include/extend, luồng đặc tả, layout và file Astah chưa được chốt; các điểm nghiệp vụ còn mở tại nguồn vẫn giữ nguyên.
