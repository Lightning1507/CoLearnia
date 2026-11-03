# Định hình Use Case — actor và tổng quan

**Trạng thái: actor, cấu trúc tổng quan và cách đặt nhóm truy cập đã được người dùng đồng ý sau review.** Cập nhật ngày 29/10/2026: rút gọn còn 5 actor theo xác nhận của người dùng. Tài liệu tổ chức lại nghiệp vụ hiện hành để chuẩn bị vẽ trên Astah; không bổ sung chức năng, thay quyền hoặc chứng minh đã triển khai.

Nguồn: [scope](scope.md), [backlog sơ bộ](backlog-draft.md), [quyền Workspace trong plan mục 10.2](../technical-plan.md#102-rest-chính), [quyền cuộc họp](groups-media-policy.md), [group modes](group-modes.md), [messaging](messaging.md).

## 1. Phạm vi và quy ước

- Subject của sơ đồ là toàn bộ **hệ thống CoLearnia**. Actor ở ngoài ranh giới; backend, database, mediasoup và bộ đếm giờ là thành phần bên trong, không là actor của sơ đồ này.
- Sơ đồ tổng quan thể hiện các mục tiêu tổng hợp theo miền nghiệp vụ ở cùng mức khái quát; đăng ký/đăng nhập/đăng xuất được đặt trực tiếp như nhóm chức năng truy cập chung theo chỉ đạo người dùng, không mở một sơ đồ phân rã tài khoản riêng. Các mục TQ dưới đây là ứng viên UC tổng quan; chưa là UC chi tiết có thể đặc tả bằng một luồng duy nhất.
- Sơ đồ chi tiết sẽ thể hiện mục tiêu cụ thể, có trigger và kết quả; không chuyển từng nút bấm hoặc API thành UC.
- Quan hệ tổng quan → chi tiết được ghi bằng bảng truy vết; không mặc nhiên dùng include, extend hoặc generalization để diễn đạt phân rã.
- UC-01/02/03 hiện hữu vẫn là ba hành trình nghiệm thu trong scope. Mã A và TQ ở đây chỉ là mã tham chiếu phân tích; mã UC chi tiết được đề xuất tại [danh mục UC](use-case-catalog.md), không đổi mã cũ âm thầm.
- Phần 2 ghi lại vai trò/quyền đã có nguồn; việc chọn actor và cách gom ở phần 3 là mô hình phân tích đã thống nhất. Quan hệ kế thừa actor chung được chốt ở mục 3; không thay quyền nghiệp vụ.

## 2. Actor đã chốt

| Mã   | Actor                | Phạm vi và điều kiện                                                          | Tương tác nghiệp vụ chính                                                                                                                                                                  |
| ---- | -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-00 | Người dùng hệ thống  | Vai trò chung, không biểu thị đã đăng nhập hoặc có quyền Workspace            | Đăng ký, đăng nhập, đăng xuất; tạo Workspace, xem Workspace mình thuộc và tham gia qua lời mời; làm actor tổng quát                                                                        |
| A-03 | Thành viên Workspace | Có membership hiện hành trong Workspace đang xét; chỉ truy cập kênh được phép | Trao đổi trong kênh, DM cùng Workspace, thread trong TEXT, gửi/đọc/tải tệp đúng phạm vi; truy cập LIVE được phép, mic/camera, chat cuộc họp, tham gia nhóm và cộng tác hình/nét đúng scope |
| A-04 | Admin Workspace      | Có vai trò admin trong Workspace đang xét                                     | Đổi tên Workspace; tạo/thu hồi lời mời; quản lý kênh; loại member theo quyền                                                                                                               |
| A-05 | Owner Workspace      | Chủ sở hữu duy nhất của Workspace đang xét                                    | Các quyền quản trị tương ứng; đổi admin/member, xóa Workspace                                                                                                                              |
| A-07 | Host cuộc họp        | Đang giữ vai trò host hợp lệ trong LiveSession mà mình tham gia               | Điều hành phiên, xử lý DISCUSSION, tổ chức ACTIVITY, đặt thời lượng, vào hỗ trợ ACTIVITY và đóng DISCUSSION; ACTIVITY tự kết thúc theo deadline                                            |

### Giới hạn và cách đọc actor

- Một người có thể đóng nhiều vai trò; vai trò phụ thuộc Workspace hoặc LiveSession cụ thể. A-03 chỉ tư cách thành viên nói chung, không chỉ riêng role `member` trong dữ liệu.
- Admin/owner vẫn có thể trao đổi như thành viên khi đủ quyền truy cập; host vẫn có thể tham gia cuộc họp. Generalization tại mục 3 dùng chung tương tác; điều kiện của từng UC vẫn bắt buộc.
- Admin không đổi role, sửa/xóa owner hoặc admin khác; owner có quyền đổi admin/member theo baseline. Chưa đưa các thao tác này thành oval ở sơ đồ tổng quan.
- Owner/admin không mặc nhiên là host, không mặc nhiên được nghe nhóm riêng hoặc đọc DM. Host không được quản trị Workspace chỉ vì giữ vai trò host.
- Người bắt đầu LiveSession trở thành host; người vào sau không tự nhận host. Không có UC bật chế độ điều hành hoặc tự nhận host. Chuyển host do host chọn và gán trực tiếp cho người tham gia hợp lệ, không chờ chấp nhận; mất mạng quá grace thì server chọn ngẫu nhiên participant hợp lệ làm host tạm và tự hoàn quyền khi host cũ quay lại hợp lệ trong cùng phiên. Đây là nhánh phục hồi của UC điều hành, không là UC tự nhận host; host chủ động rời khi còn quyền kết thúc phiên, người đã bàn giao chính thức rời như thành viên; không có ứng viên/host tạm mất mạng còn cần đặc tả. MAIN mọi participant tự share khi nguồn trống, không xin host.
- MAIN, DISCUSSION, ACTIVITY là ngữ cảnh hoạt động; không tạo actor nhóm A/B hoặc actor riêng cho từng mode. Quyền chia sẻ và nhận nội dung thể hiện trong đặc tả.
- Tư cách ở danh sách DISCUSSION được tạo hợp lệ chưa là tư cách đã vào nhóm. Người được chọn phải chủ động vào; chưa vào không nhận dữ liệu riêng.
- Chưa thêm actor quản trị viên toàn hệ thống, giáo viên, sinh viên, trưởng nhóm hoặc dịch vụ ngoài: baseline không cần những vai trò đó để mô tả quyền hiện tại. Chức danh ngoài đời không thay quyền trong ứng dụng.

## 3. UC tổng quan đã thống nhất

### Chức năng truy cập chung đặt trực tiếp trên tổng quan

- UC-ACC-01 · Đăng ký tài khoản: A-00, khi chưa có phiên truy cập hợp lệ theo luồng đăng ký.
- UC-ACC-02 · Đăng nhập: nối một lần với **A-00 · Người dùng hệ thống**. Vai trò chuyên biệt kế thừa actor chung; không vẽ quan hệ kế thừa từ người sang UC, không include Đăng nhập từ mọi UC nghiệp vụ. Đăng nhập thực hiện khi cần xác thực; liên kết này không mô tả trạng thái đã đăng nhập.
- UC-ACC-03 · Đăng xuất: A-00, cần có phiên truy cập hợp lệ. Giữ chức năng theo AUTH-01, không cần sơ đồ tài khoản riêng.
- TQ-01 cũ được thay bởi các UC trực tiếp này, không dùng lại mã hoặc đổi số TQ-02…06. Nhóm truy cập là ngoại lệ trình bày có chủ đích, không khẳng định Đăng nhập cùng mức mục tiêu tổng hợp với tổ chức Workspace.
- Hướng kế thừa đã chốt để dùng chung tương tác: A-03 → A-00; A-04/A-05/A-07 → A-03. Mũi tên tam giác rỗng về actor tổng quát. Owner không kế thừa Admin vì điều kiện role khác nhau; quyền quản trị dùng liên kết trực tiếp tới UC phù hợp. Điều kiện kênh/nhóm vẫn kiểm ở từng UC, không tự mở quyền do kế thừa.

### Các miền nghiệp vụ cần phân rã

Các dòng dưới là cùng mức mục tiêu tổng hợp. Cột phạm vi để giải thích và truy vết, không phải danh sách oval sẽ đặt cùng tầng trên sơ đồ tổng quan.

| Mã    | Tên UC tổng quan đề xuất     | Mục tiêu/kết quả tổng hợp                                                                                                       | Actor liên quan                                                 | Backlog / feature                                                                              |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TQ-02 | Tổ chức không gian học tập   | Có Workspace, thành viên và kênh TEXT/LIVE với quyền phù hợp để học cùng nhau                                                   | A-00, A-03, A-04, A-05; tương tác cụ thể tùy quyền              | PB-02/03 / WS-01/02/03, CH-01                                                                  |
| TQ-03 | Trao đổi trong Workspace     | Thành viên trao đổi, chia sẻ tài liệu qua kênh, DM và thread, đọc lại đúng phạm vi                                              | A-03; admin/owner chỉ theo quyền hội thoại                      | PB-04/12/13 / CHAT-01/02/03, FILE-01                                                           |
| TQ-04 | Tham gia cuộc họp trực tuyến | Thành viên vào/rời cuộc gọi, trao đổi mic/camera, chia sẻ/xem màn hình, chat và cộng tác khung hình đúng phạm vi                | A-03; cần quyền kênh và đã vào phiên cho hành vi trong cuộc họp | PB-05/06/08, phần chat PB-09 / LIVE-01/02/03, AUDIO-01, BOARD-01, FREEZE-01, phần chat HELP-01 |
| TQ-05 | Tham gia hoạt động nhóm      | Thành viên xin tạo DISCUSSION, vào nhóm được tạo hợp lệ/được phân và tự về phòng chung                                          | A-03; host kế thừa tương tác thành viên khi đủ điều kiện        | PB-07/10 / GRP-01/02                                                                           |
| TQ-07 | Điều hành hoạt động nhóm     | Hệ thống tạo DISCUSSION khi hợp lệ, tổ chức ACTIVITY, đặt thời lượng, hỗ trợ; đóng DISCUSSION, ACTIVITY tự kết thúc khi hết giờ | A-07                                                            | PB-07/09/10/14 / HOST-01, GRP-01/02, TIMER-01, HELP-01                                         |

### Ranh giới giữa các mục tổng quan

- TQ-02 sở hữu cấu trúc Workspace/thành viên/kênh; TQ-03 sở hữu trao đổi và tài liệu. Tạo general là kết quả tạo Workspace, không là một UC thủ công cho người dùng.
- TQ-04 sở hữu hành vi cuộc gọi dùng chung cho MAIN và nhóm. TQ-05 sở hữu mục tiêu tham gia; TQ-07 sở hữu tổ chức và vòng đời nhóm; không lặp lại UC bật camera hay share cho từng loại nhóm.
- Chat Everyone/Host thuộc TQ-04; host vào/rời nhóm hỗ trợ thuộc TQ-07. Tin nhắn không tự đưa host vào nhóm hoặc chuyển mic.
- Cộng tác khung hình (freeze/vẽ/resume) thuộc chi tiết TQ-04, không là oval riêng ở tổng quan; mã TQ-06 cũ ngừng dùng ở tầng tổng quan, không tái sử dụng. Nhóm ACTIVITY dùng nguồn đang share của nhóm; DISCUSSION dùng bài giảng MAIN. Theo quyết định 02/11/2026, MAIN không freeze/resume, chỉ host vẽ LIVE; BOARD-01/05 chỉ trong nhóm, BOARD-02 thêm quyền riêng A-07 tại MAIN. Không thêm oval tổng quan.
- TQ-05 thể hiện mục tiêu tham gia của thành viên; TQ-07 thể hiện trách nhiệm điều hành riêng của host. Host kế thừa Thành viên Workspace, nên không nối lại Host → TQ-05; đường riêng Host → TQ-07 không trao quyền điều hành cho thành viên.
- REC-01/PB-11 là yêu cầu xuyên suốt: ghi ở nhánh mất kết nối/khôi phục của UC liên quan và tiêu chí nghiệm thu; chưa ép thành một UC tổng quan ngang với các miền nghiệp vụ.
- FILE-01 được truy vết chính ở TQ-03, đồng thời hỗ trợ ảnh chat cuộc họp trong TQ-04. Chat cuộc họp chỉ text/ảnh; không suy từ đây ra quyền gửi file bất kỳ.
- PB-10 là một lát cắt của GRP-01/PB-07, không tạo thêm miền hoặc tính phạm vi hai lần. Countdown hết giờ tự kết thúc ACTIVITY và đưa người còn quyền về MAIN; thành viên được về sớm. Host không cần ra quyết định kết thúc ACTIVITY; DISCUSSION vẫn do host đóng.

## 4. Tiêu chí review sơ đồ và các thay đổi tiếp theo

1. Giữ đúng 5 actor A-00/A-03/A-04/A-05/A-07; điều kiện xác thực và đã tham gia cuộc họp nằm trong đặc tả, không tạo actor riêng.
2. Năm mục tiêu tổng hợp TQ-02/03/04/05/07 có cùng mức khái quát, đủ bao phủ và tên phù hợp hay không; đặc biệt ranh giới TQ-04/05/07.
3. Liên kết actor ở mức tổng quan chỉ diễn đạt tham gia một phần miền, không có nghĩa mọi actor được thực hiện mọi thao tác trong miền đó. Sơ đồ chi tiết phải tách quyền; không dùng sơ đồ tổng quan làm ma trận ACL.
4. Đã chốt generalization actor tại mục 3; include/extend và các sơ đồ chi tiết cần review riêng. [Danh mục UC chi tiết](use-case-catalog.md) đã có bản đề xuất để review; không thêm nghiệp vụ còn mở để làm sơ đồ trông đầy đủ.

## 5. Đầu ra tiếp theo sau review

Theo thống nhất ngày 29/10/2026, chỉ viết [6 hồ sơ đặc tả trọng tâm](use-cases/README.md), không đặc tả riêng toàn bộ danh mục: vào cuộc họp, DISCUSSION, ACTIVITY, share, cộng tác hình/nét và hỗ trợ riêng. Đã có bản 2 xử lý review luồng; danh mục vẫn giữ mã UC, các hồ sơ nhiều giai đoạn không tự gộp UC hoặc tạo include. Đã có tổng quan Astah; sơ đồ chi tiết và quan hệ cần review theo từng miền. Activity diagram mô tả thứ tự/nhánh, không thay bằng mũi tên giữa UC.

## Xác nhận sau review

Người dùng đã đồng ý phần review và chỉnh sửa: actor chung cho đăng nhập, nhóm truy cập trực tiếp trên tổng quan, 5 mục tiêu nghiệp vụ tổng hợp TQ-02/03/04/05/07 và danh mục 43 UC nghiệp vụ + 3 UC truy cập chung; 8 mục gộp vẫn được giữ chức năng trong luồng sở hữu. Đây là baseline phân tích UC, không xác nhận feature đã triển khai. Đã có file Astah tổng quan với 5 actor theo xác nhận ngày 29/10/2026; đã có 5 sơ đồ phân rã và một Activity; trạng thái kiểm bản vẽ lấy tại mục lục sơ đồ. Các điểm nghiệp vụ còn mở tại nguồn vẫn giữ nguyên.

## Điều chỉnh actor ngày 29/10/2026

Người dùng đã xác nhận gộp A-01/A-02 vào A-00 và A-06 vào A-03. Giữ mã A-00/A-03/A-04/A-05/A-07 để tránh đổi các mã vai trò còn dùng; các mã đã gộp không tái sử dụng. Chưa/có phiên đăng nhập và đã vào cuộc họp là điều kiện thực hiện UC. Host kế thừa Thành viên Workspace, độc lập với owner/admin; không đổi quyền hoặc scope sản phẩm. Sơ đồ hiện hành tại [project Astah](diagrams/README.md).

## Tách mục tiêu nhóm và bố cục ngang ngày 29/10/2026

Theo xác nhận của người dùng, TQ-05 cũ được tách thành TQ-05 · Tham gia hoạt động nhóm và TQ-07 · Điều hành hoạt động nhóm. Sau review tiếp theo, cộng tác hình/nét được đưa xuống chi tiết TQ-04; không đổi mã UC chi tiết hoặc thêm feature. Tổng quan có 5 actor và 8 oval (5 mục tiêu tổng hợp, 3 UC truy cập). Khung hệ thống ngang, oval gọn theo tên; các actor ngoài khung. Font 14 là yêu cầu trình bày còn chờ áp dụng và kiểm tra trên giao diện; xem trạng thái bản vẽ tại [diagrams](diagrams/README.md).

## Rà ranh giới tổng quan — cộng tác khung hình

Theo xác nhận của người dùng, bỏ oval TQ-06 khỏi tổng quan. TQ-04 bao phủ trải nghiệm cuộc gọi, share, chat và cộng tác khung hình; TQ-05/TQ-07 mô tả tham gia và điều hành vòng đời nhóm, không lặp các chức năng cuộc gọi. Giữ nguyên UC-BOARD-01/02/05 và các hành vi undo/clear trong danh mục/đặc tả; không cắt feature và không tự thêm include/extend.

## Cập nhật sau kickoff 02/11

TQ-04 bao gồm UC-LIVE-12 xem lại recording theo quyền kênh; TQ-07 giữ vai trò điều hành nhóm, không xét duyệt DISCUSSION. UC-LIVE-11 ghi hình là quyền host trong miền cuộc họp, thể hiện ở phân rã điều hành cuộc họp. Random nằm trong UC chuẩn bị ACTIVITY. Không tự thêm actor recorder hoặc oval tổng quan riêng cho thao tác kỹ thuật. [Recording](recording.md) là nguồn; Astah/PNG chưa được sửa trong lượt tài liệu này.

## Hồ sơ cá nhân — bổ sung ngày 03/11/2026

ACC-04 Chỉnh sửa hồ sơ cá nhân (tên hiển thị và avatar, gồm xóa ảnh) và ACC-05 Đổi mật khẩu là hai mục tiêu người dùng đã đăng nhập theo PROFILE-01. Chưa chỉnh Astah hoặc chốt bố cục tổng quan mới trong task proposal; không thêm actor hoặc oval riêng cho upload, chọn ảnh hay nhập mật khẩu hiện tại. Quên mật khẩu ngoài MVP.

Ngày 03/11/2026: UC-WS-11 chuyển owner ngừng áp dụng trong MVP; không vẽ oval chuyển owner. Người tạo giữ OWNER, cấp ADMIN để hỗ trợ. Không thay chức năng chuyển host cuộc họp.
