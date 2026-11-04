# Bước 1 — Truy vết Use Case và dữ liệu

**Trạng thái:** bản phân tích để nhóm review, ngày 01/11/2026. Hoàn thành phạm vi bước 1–2 theo yêu cầu: truy vết UC và mô hình nghiệp vụ; field/collection và index đích đã được cụ thể hóa ở bước 4–5; chưa có schema executable, migration hay thay đổi code từ đợt tài liệu. MongoDB/Mongoose vẫn là hướng đã chọn. Reviewer nghiệp vụ: người dùng/nhóm; chưa gán thành viên cụ thể hoặc tạo Issue thay nhóm.

Nguồn: [danh mục UC hiện hành](../product/use-case-catalog.md), [6 hồ sơ trọng tâm](../product/use-cases/README.md), các nguồn product theo miền bên dưới. [Model khung](model.md) và [lifecycle](lifecycle.md) là các ràng buộc thiết kế đã có; bảng này giải thích nguồn gốc dữ liệu, không tự thay baseline. [Mô hình nghiệp vụ bước 2](conceptual-model.md) định nghĩa E01–E16 và các quan hệ được dùng trong bảng.

## Quy ước đọc

- Mỗi dòng tương ứng một trong **46 UC được giữ**: 3 truy cập chung và 43 nghiệp vụ. Các mã được gộp không thành UC/collection mới.
- “Đọc” gồm dữ liệu cần kiểm quyền, không có nghĩa được trả toàn bộ dữ liệu đó cho client. “Ghi” là thay đổi nghiệp vụ khi thành công; một thay đổi có thể chỉ là trạng thái tạm trong phiên.
- Các tên E là khái niệm nghiệp vụ, **không phải 16 collection MongoDB**. [Bước 3](lifecycle.md) xác định nơi lưu/vòng đời; [bước 4](collection-design.md) mô tả field/nhúng-tham chiếu, chưa là schema executable.
- Mỗi dữ liệu phải có chức năng dùng và nguồn tạo/thay đổi. Không tạo UC CRUD chỉ để hợp thức hóa dữ liệu hỗ trợ kỹ thuật; cũng không thêm dữ liệu nghiệp vụ khi chưa tìm được nhu cầu.

## Truy cập chung — 3 UC

Nguồn: [tài khoản](../product/workspace-channels.md), [model phiên truy cập](model.md), [biên tin cậy của plan](../technical-plan.md#131-biên-tin-cậy).

| UC                            | Actor      | Đọc / kiểm                                                   | Tạo hoặc thay đổi                                            | Kết quả và ranh giới                                                 |
| ----------------------------- | ---------- | ------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| UC-ACC-01 · Đăng ký tài khoản | Người dùng | E01: tài khoản theo email                                    | E01: danh tính, tên hiển thị, thông tin xác thực được bảo vệ | Có tài khoản; không tự tạo Workspace hoặc vai trò quản trị           |
| UC-ACC-02 · Đăng nhập         | Người dùng | E01 và trạng thái phiên truy cập                             | Phiên truy cập hỗ trợ xác thực                               | Có phiên hợp lệ; refresh nằm trong luồng này, chưa chọn thư viện băm |
| UC-ACC-03 · Đăng xuất         | Người dùng | Phiên truy cập liên quan; E10 và tài nguyên đang dùng nếu có | Thu phiên và truy cập socket/media liên quan                 | Không xóa E01 hoặc lịch sử chat; không coi logout là xóa tài khoản   |

## TQ-02 — Không gian học tập, 15 UC

Nguồn: [Workspace/kênh](../product/workspace-channels.md), [general và quyền tạo kênh](../product/messaging.md), [policy quyền](../product/groups-media-policy.md), [transaction](lifecycle.md).

| UC                                     | Actor                   | Đọc / kiểm                                | Tạo hoặc thay đổi                                            | Kết quả và ranh giới                                                                                     |
| -------------------------------------- | ----------------------- | ----------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| UC-WS-01 · Tạo Workspace               | Người dùng đã đăng nhập | E01                                       | E02, E03 owner, E05 general TEXT, E06 CHANNEL                | Cùng thành công hoặc cùng thất bại; general là kênh ban đầu, chưa có bảo vệ đặc biệt                     |
| UC-WS-02 · Xem các Workspace của mình  | Người dùng              | E02–E03                                   | Không tạo dữ liệu nghiệp vụ                                  | Danh sách theo membership còn quyền, không phải mọi Workspace                                            |
| UC-WS-03 · Đổi tên Workspace           | Admin/owner             | E02–E03                                   | Tên E02                                                      | Không đổi owner hoặc membership                                                                          |
| UC-WS-04 · Xóa Workspace               | Owner                   | E02–E03 và các tài nguyên thuộc Workspace | Trạng thái E02; thu quyền/đóng tài nguyên liên quan          | Khóa ngay, dọn theo lifecycle; chưa có restore UI                                                        |
| UC-WS-05 · Tạo lời mời tham gia        | Admin/owner             | E02–E04                                   | E04: tạo/sao chép lại/tạo lại link hiện hành, không hạn/lượt | Tạo lại vô hiệu link cũ; không tự cấp membership                                                         |
| UC-WS-06 · Thu hồi lời mời             | Admin/owner             | E03–E04                                   | Hiệu lực E04                                                 | Chặn lượt nhận mới; không tự loại người đã tham gia                                                      |
| UC-WS-07 · Tham gia qua lời mời        | Người dùng              | E01–E04, link hiện hành còn bật           | E03 khi cần                                                  | Không trùng membership; không tự hồi PRIVATE; link cũ/đã tắt không cấp membership mới                    |
| UC-WS-08 · Xem thành viên              | Thành viên              | E01–E03                                   | Không tạo dữ liệu nghiệp vụ                                  | Danh sách thành viên được phép xem; không trả thông tin xác thực                                         |
| UC-WS-09 · Thay đổi vai trò thành viên | Owner                   | E03 của người thao tác và đích            | Vai trò admin/member trong E03                               | Không hạ owner bằng thao tác này                                                                         |
| UC-WS-10 · Loại thành viên             | Admin/owner             | E03 và phạm vi quyền quản lý              | Hiệu lực E03, thu truy cập liên quan                         | Admin không loại owner/admin khác; không xóa tài khoản E01                                               |
| UC-WS-12 · Tạo kênh học tập            | Admin/owner             | E02–E03                                   | E05 và E06 CHANNEL nếu là TEXT; phạm vi truy cập kênh        | TEXT/LIVE bất biến; LIVE chưa đồng nghĩa đã có phiên họp                                                 |
| UC-WS-13 · Đổi tên kênh                | Admin/owner             | E03, E05                                  | Tên E05                                                      | Không đổi loại kênh hoặc ngầm mở quyền đọc                                                               |
| UC-WS-14 · Xóa kênh                    | Admin/owner             | E03, E05 và tài nguyên kênh               | Trạng thái E05, đóng hội thoại/phiên/tài nguyên theo loại    | Thu đọc/tải trước cleanup; không chuyển nội dung sang kênh khác                                          |
| UC-WS-15 · Quản lý quyền truy cập kênh | Admin/owner             | E02–E03, E05 PRIVATE và người đích        | Danh sách truy cập E05; thu subscription/file/LIVE khi gỡ    | Quản lý không tự cho đọc; rejoin Workspace không hồi PRIVATE cũ, cần thêm lại; thêm thấy lịch sử còn lưu |

## TQ-03 — Trao đổi Workspace, 6 UC

Nguồn: [messaging](../product/messaging.md), [lifecycle chat/tệp](lifecycle.md).

| UC                                | Actor                          | Đọc / kiểm                           | Tạo hoặc thay đổi                                             | Kết quả và ranh giới                                          |
| --------------------------------- | ------------------------------ | ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------- |
| UC-MSG-01 · Gửi tin trong kênh    | Thành viên có quyền TEXT       | E03, E05–E06; E08 nếu đính kèm       | E07, gắn E08 đúng hội thoại                                   | Text/ảnh/file; gửi lại không nhân tin                         |
| UC-MSG-02 · Xem hội thoại kênh    | Thành viên có quyền TEXT       | E03, E05–E08                         | Không tạo dữ liệu nghiệp vụ                                   | Phân trang tin gốc, không trộn replies vào dòng chính         |
| UC-MSG-04 · Gửi tin riêng         | Một trong hai bên DM           | E03 hai bên, E06 DIRECT; E08         | Tìm/tạo E06 của cặp trong Workspace; E07 và liên kết E08      | Text/ảnh/file; admin không có quyền đọc thay; không DM nhóm   |
| UC-MSG-05 · Xem hội thoại riêng   | Một trong hai bên DM           | E03 hai bên, E06–E08                 | Không cần tạo DM mới khi mở lại                               | Danh sách/lịch sử của chính mình; DM không đóng theo LIVE     |
| UC-MSG-06 · Thảo luận theo thread | Thành viên có quyền TEXT       | E03, E05–E08; tin gốc cùng hội thoại | E07 trả lời gắn tin gốc; liên kết E08 và thông tin số trả lời | Một cấp, chỉ CHANNEL; không cần thực thể quản lý thread riêng |
| UC-MSG-08 · Tải tệp Workspace     | Thành viên còn quyền hội thoại | E03, E05 khi là kênh, E06–E08        | Không tạo bản sao dữ liệu nghiệp vụ để tải                    | Quyền hiện tại của kênh/DM, không chỉ biết URL/ID             |

UC-MSG-03 mở DM nằm trong MSG-04/05; MSG-07 đọc thread nằm trong MSG-06. Chưa có UC sửa/xóa tin, read receipt, follow thread hoặc tìm kiếm nâng cao; không thêm dữ liệu cho các tính năng đó.

## TQ-04 — Cuộc họp và board, 11 UC

Nguồn: [HS-01](../product/use-cases/01-join-meeting.md), [HS-04](../product/use-cases/04-screen-sharing.md), [HS-05](../product/use-cases/05-board-collaboration.md), [HS-06](../product/use-cases/06-private-help.md), [live session](../product/live-session.md).

| UC                                  | Actor                                          | Đọc / kiểm                                    | Tạo hoặc thay đổi                                                            | Kết quả và ranh giới                                                                    |
| ----------------------------------- | ---------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| UC-LIVE-01 · Vào cuộc họp           | Thành viên có quyền LIVE                       | E01, E03, E05, E09 và cuộc gọi hiện tại       | E09 nếu chưa có phiên; E10; host ban đầu, MAIN và trạng thái kết nối         | Một phiên hợp lệ/kênh; host không mặc nhiên là owner; join lại kiểm quyền hiện hành     |
| UC-LIVE-02 · Rời cuộc họp           | Người đang tham gia                            | E09–E10, nhóm/nguồn/board/hỗ trợ liên quan    | Trạng thái tham gia E10 và thu tài nguyên                                    | Không xóa membership Workspace; host còn quyền chủ động rời kết thúc phiên theo LIVE-10 |
| UC-LIVE-04 · Trao đổi mic/camera    | Người đang tham gia                            | E09–E10, vị trí nhóm, quyền nguồn nhận        | Trạng thái thiết bị/nguồn và lựa chọn âm lượng cục bộ                        | Không phát sinh bản ghi âm/video; không coi device/socket là danh tính người            |
| UC-LIVE-05 · Chia sẻ màn hình       | Người ở MAIN/ACTIVITY                          | E09–E10, E12, nguồn scope hiện tại            | Trạng thái nguồn share và quan hệ E14 với nguồn                              | Một nguồn/scope; DISCUSSION cấm share; dừng/rời thu đúng nguồn                          |
| UC-LIVE-08 · Everyone               | Người đang tham gia đúng scope                 | E09–E10, E12, E06, E08                        | E07 và gắn ảnh E08 vào SESSION/GROUP đúng scope                              | Chỉ text/ảnh; về MAIN không mang chat nhóm theo                                         |
| UC-LIVE-09 · Trao đổi riêng host    | Người hỏi, host nhận/trả lời                   | E09–E10, host đích, E06, E08                  | E06 HOST_PRIVATE nếu cần; E07 và ảnh E08                                     | Gắn hai bên ban đầu; đổi host không chuyển lịch sử; không tự cấp quyền board            |
| UC-LIVE-10 · Kết thúc cho mọi người | Host                                           | E09 và tài nguyên toàn phiên                  | Kết thúc E09, E10, nhóm/lượt/hỗ trợ/nguồn/board; khóa private chat           | Không xóa kênh LIVE; người dùng có thể mở phiên khác sau này                            |
| UC-GRP-01 · Chuyển host             | Host                                           | E09–E10, vai trò hiện tại                     | Bàn giao trực tiếp và quan hệ host của phiên, không chờ người nhận chấp nhận | Không đổi vai trò Workspace; xử lý host tạm theo HS-01, không thêm tài khoản host       |
| UC-BOARD-01 · Dừng hình             | Thành viên DISCUSSION/ACTIVITY còn quyền board | E09–E10, E12 nhóm hiện tại, nguồn hợp lệ, E14 | E15 và tài nguyên ảnh E08; trạng thái/ngữ cảnh E14                           | Một frame chung của scope; freeze không bắt buộc vẽ, không dừng audio                   |
| UC-BOARD-02 · Vẽ và chỉ dẫn         | Người còn quyền board                          | E14–E16, tác giả, nguồn và scope              | E16 hoặc chỉ dẫn tạm; undo của mình/clear theo quyền                         | Không ghi từng điểm vào DB; nét gắn ngữ cảnh, không là thư viện bài làm                 |
| UC-BOARD-05 · Trở lại trực tiếp     | Người còn quyền board                          | E14–E16 và nguồn hiện tại                     | Đóng ngữ cảnh frame/nét cũ, chuyển trạng thái E14                            | Không bắt đầu share mới hoặc xóa ảnh chat đã gửi độc lập                                |

LIVE-03 xem người tham gia và LIVE-07 âm lượng thuộc LIVE-01/04; LIVE-06 dừng share thuộc LIVE-05; BOARD-03/04 undo/clear thuộc BOARD-02. Không bỏ dữ liệu/quyền của các luồng đã gộp.

## TQ-05 — Tham gia nhóm, 3 UC

Nguồn: [HS-02](../product/use-cases/02-discussion.md), [HS-03](../product/use-cases/03-activity.md), [group modes](../product/group-modes.md).

| UC                                   | Actor              | Đọc / kiểm                      | Tạo hoặc thay đổi                                            | Kết quả và ranh giới                                           |
| ------------------------------------ | ------------------ | ------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| UC-GRP-02 · Tạo nhóm trao đổi        | Participant hợp lệ | E09/E10, phase, roster          | Kiểm create rồi tạo E12/roster trong runtime; dedupe retry   | Không hàng chờ host; roster chưa là membership                 |
| UC-GRP-04 · Vào nhóm được tạo hợp lệ | Người trong roster | E09–E12, roster hợp lệ, phase   | Quan hệ hiện diện E10–E12; cấp scope sau kiểm quyền          | Roster hợp lệ khác người đã vào; không cấp quyền trước khi bấm |
| UC-GRP-08 · Trở về phòng chung       | Người đang ở nhóm  | E09–E10, E12 và tài nguyên mình | Bỏ hiện diện nhóm, chuyển MAIN, thu nguồn/quyền và pause mic | Chỉ chuyển bản thân, không kết thúc lượt/nhóm của người khác   |

## TQ-07 — Điều hành nhóm, 8 UC

Nguồn: [group modes](../product/group-modes.md), [policy](../product/groups-media-policy.md), [HS-02](../product/use-cases/02-discussion.md), [HS-03](../product/use-cases/03-activity.md), [HS-06](../product/use-cases/06-private-help.md).

| UC                                    | Actor                               | Đọc / kiểm                                            | Tạo hoặc thay đổi                                                                     | Kết quả và ranh giới                                                                 |
| ------------------------------------- | ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| UC-GRP-03 (cũ)                        | —                                   | Ngừng áp dụng                                         | Kiểm tạo hợp lệ chuyển vào GRP-02                                                     | Không còn quyết định phê duyệt hoặc quyền host xét                                   |
| UC-GRP-05 · Chuẩn bị nhóm hoạt động   | Host                                | E09–E10                                               | Cấu hình E13, E12 ACTIVITY và quan hệ phân công dự kiến                               | Chưa đổi hiện diện, chưa cấp private scope                                           |
| UC-GRP-06 · Bắt đầu lượt hoạt động    | Host; người được phân phối hợp      | E09–E10, E12–E13, phân công/thời lượng                | Đóng DISCUSSION; kích hoạt lượt/nhóm, chuyển hiện diện, xác lập deadline              | Lỗi một phần: hủy lượt, về MAIN, không khôi phục DISCUSSION                          |
| UC-GRP-07 · Điều chuyển giữa phòng    | Host; người đích phối hợp           | E09–E13, phòng đích, phase và quyền                   | Quan hệ hiện diện E10–E12, thu nguồn/quyền cũ                                         | Không nhập chat/board cũ sang nơi mới hoặc reset deadline                            |
| UC-GRP-09 · Kết thúc nhóm trao đổi    | Host; thành viên nhóm đích phối hợp | E09, các E12 DISCUSSION được chọn và người trong nhóm | Đóng một hoặc tất cả DISCUSSION, khóa chat/board/help, chuyển người còn quyền về MAIN | Không dùng cho ACTIVITY; nhóm không chọn tiếp tục; GRP-10 đã gộp                     |
| UC-GRP-11 · Đặt thời lượng lượt       | Host; thành viên theo dõi           | E09, cấu hình E13                                     | Thời lượng dự kiến; deadline E13 khi bắt đầu thành công                               | Một thời lượng chung; hết giờ hệ thống kết thúc đúng lượt, không tạo “timer” độc lập |
| UC-GRP-12 · Hỗ trợ riêng nhóm         | Host; nhóm đích                     | E09–E10, E12, E06, E14 và tài nguyên được phép        | Quan hệ hỗ trợ hiện hành host–ACTIVITY, audience nghe/phát và quyền tạm               | Vào/rời/sang nhóm khác thu scope cũ; không tự tạo ticket hoặc lịch sử hỗ trợ         |
| UC-GRP-13 · Thông báo hướng dẫn chung | Host                                | E09–E10, vị trí và trạng thái hỗ trợ                  | Trạng thái phát hướng dẫn đúng audience                                               | MAIN/DISCUSSION, không ACTIVITY; không suy thành kho thông báo bền vững              |

## Dữ liệu hỗ trợ không cần UC CRUD riêng

| Dữ liệu                                               | Luồng sở hữu                                          | Nguồn tạo / kết thúc                                            | Giới hạn                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Phiên truy cập                                        | ACC-02/03, hết hạn/thu quyền                          | Hệ thống xác thực; người dùng đăng nhập/đăng xuất               | Khác E09 phiên họp, không là bảng quản lý phiên mới trong UI                                                      |
| Dấu vết kiểm soát                                     | Các thao tác auth/quyền/tài nguyên theo baseline      | Hệ thống ghi sự kiện theo [model](model.md)                     | Không chép chat, mục đích nhóm, ảnh hoặc token vào log; chưa có UC tra cứu audit cho admin                        |
| Hiệu lực thao tác, phiên bản, khóa nguồn, chốt freeze | Join/share/board và nhánh reconnect trong HS-01/04/05 | Hệ thống quản lý trong đúng đời phiên/thao tác                  | Hỗ trợ giữ đúng kết quả, không thêm chức năng CRUD hay tự quyết định collection                                   |
| Tệp đang upload chưa được gắn                         | MSG-01/04/06, LIVE-08/09, BOARD-01                    | Người dùng bắt đầu gửi/chụp; hệ thống quản lý upload và cleanup | Có thể chưa có tin nhắn/frame thành công; đây là dữ liệu tạm có nguồn gốc, không phải dữ liệu mồ côi về nghiệp vụ |

## Review độ phủ và các khoảng trống

- **Chiều UC → dữ liệu:** 3 + 15 + 6 + 11 + 3 + 8 = 46 UC được giữ đã có dòng truy vết. Các UC chỉ đọc không bị ép có thao tác ghi.
- **Chiều dữ liệu → UC:** E01–E16 có nguồn tạo/thay đổi ở bảng trên; thread, host, roster, phân công và hiện diện là vai trò/quan hệ, không tự tạo collection độc lập. Phiên truy cập/audit là hỗ trợ baseline, không đòi UC quản lý mới.
- **Không thêm:** danh mục kỹ năng, quiz, bình chọn, thư viện bài làm, lịch sử board lâu dài hoặc read receipt. Recording MAIN đã bổ sung sau kickoff; xem [recording](../product/recording.md), không coi là thư viện board.
- **Còn cần làm rõ:** không có ứng viên thay host/host tạm mất mạng; implementation/kiểm chứng schema/index và cách xử lý runtime ở các điểm mở đó. DM rejoin, vòng đời request, duration và PRIVATE đã chốt tại nguồn, không còn là điểm mở. Xem [trạng thái quyết định](../decision-status.md).
- **Quyền kênh đã bổ sung:** UC-WS-15 bao phủ quản lý danh sách PRIVATE sau tạo theo [messaging](../product/messaging.md); E05 giữ quan hệ truy cập, không mặc định thêm collection riêng.
- **Không suy CRUD từ vòng đời:** xóa tài khoản, member chủ động rời Workspace, mở lại nhóm đã đóng và phục hồi Workspace chưa có UC độc lập được giữ. Chỗ nguồn đề cập owner muốn rời phải transfer/xóa không đủ để tự thêm một UC rời Workspace cho mọi member.

## Truy vết sang bước 3

Người review lần theo một UC để tìm dữ liệu đọc/ghi, rồi lần ngược một thực thể để tìm người/luồng tạo ra nó; phân biệt được quyền Workspace, tham gia cuộc họp, roster và hiện diện nhóm. [Bước 3 tại lifecycle](lifecycle.md) ánh xạ E01–E16 sang nơi lưu, trạng thái và cleanup. Các điểm chưa quyết định giữ tách khỏi baseline; chưa chạy DB, migration, seed hoặc thay contract từ tài liệu này.

## Đối chiếu với bước 4

[Thiết kế collection/document](collection-design.md) giữ 12 collection nền, thêm channelAccessGrants cho quan hệ E05–E03/UC-WS-15. E01–E10 ánh xạ sang dữ liệu bền theo model; E11–E16 giữ runtime/trường hợp frame dùng E08. Auth/audit là hỗ trợ baseline. Mọi UC trong bảng tiếp tục dùng các collection/runtime đó; không phát sinh UC vì chọn thêm một collection quan hệ quyền.

[Bước 6 — review chéo](review-2026-11-01.md) đối chiếu toàn chuỗi phân tích với thiết kế đích; giữ nguyên 46 UC, không thêm UC CRUD cho dữ liệu hỗ trợ.

**Truy vết gộp 01/11:** UC-GRP-10 thuộc nhánh đóng tất cả của UC-GRP-09, không còn dòng dữ liệu riêng. Gộp mục tiêu không thay 16 khái niệm, 13 collection hoặc quyền dữ liệu.

## Điều chỉnh BOARD ngày 02/11/2026

BOARD-01/05 chỉ nhóm DISCUSSION/ACTIVITY, tạo/thu E15 qua E08; MAIN không FrozenFrame. BOARD-02 tại MAIN: A-07 ở MAIN/hướng dẫn ghi E14/E16 runtime (nét thường/tự biến mất), A-03 xem; tại nhóm A-03 đủ quyền vẽ như cũ. BOARD-03/04 gộp vẫn giữ undo nét mình/clear đúng scope. Không thêm UC hoặc collection; xem [HS-05](../product/use-cases/05-board-collaboration.md).

## Delta thiết kế sau kickoff 02/11

RECORD-01 / UC-LIVE-11–12 / FR-15-01–03 bổ sung metadata bản ghi gắn LiveSession/kênh, trạng thái ghi/xử lý/sẵn sàng/lỗi ở mức hành vi, tham chiếu video byte và cleanup. Video thuộc kho tệp; không nhúng byte vào MongoDB hoặc tái dùng FRAME/attachment để vượt ACL. Xem [recording](../product/recording.md) và [model](model.md). 13 collection/16 khái niệm cũ mô tả phạm vi trước recording, chưa là thiết kế recording hoàn tất; chưa chốt field/index/migration mới.

Quyền xem kiểm membership và channel access hiện tại, kể cả PRIVATE, không dựa vào participant cũ; xóa kênh/Workspace và thu quyền phải được tính trong lifecycle. Stop/end hoàn tất hoặc báo lỗi, dọn tài nguyên/tệp dở dang; quota/retention/quyền xóa và xử lý restart còn chờ proposal. DISCUSSION tạo hợp lệ ngay, không trạng thái host xét/hủy pending; random preview chỉ là cấu hình ACTIVITY, không tự chuyển người.

### UC recording ↔ dữ liệu mới

| UC                             | Actor                     | Đọc                                                   | Ghi / kết quả                                                                          | Quyền và vòng đời                                                                |
| ------------------------------ | ------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| UC-LIVE-11 · Ghi hình cuộc họp | Host hiện hành            | Phiên, host/scope, nguồn MAIN                         | Metadata bản ghi theo phiên/kênh; trạng thái xử lý và tham chiếu video; byte ở kho tệp | Không nhóm riêng; stop/end/error cleanup; schema/index/quota/retention chưa chốt |
| UC-LIVE-12 · Xem lại bản ghi   | Thành viên còn quyền kênh | Metadata sẵn sàng, membership/channel access hiện tại | Phát video đúng quyền; không cần tạo lịch sử người xem                                 | PRIVATE cần access hiện hành; biết URL hoặc tham gia phiên cũ không đủ quyền     |

## Delta PROFILE-01 ngày 03/11/2026

M1 bổ sung ACC-04/05 và FR-01-04–06: sửa displayName/avatar và đổi mật khẩu hiện tại; quên mật khẩu để sau MVP. Cập nhật 04/11: avatar lưu trên Cloudinary, công khai qua URL; chỉ chính chủ được thay/xóa. MongoDB giữ metadata ảnh trên User; xem cấu trúc đề xuất tại [collection-design](collection-design.md#31-users). Không áp dụng cách truy cập công khai này cho file chat hoặc video cuộc họp. Đổi mật khẩu vẫn thu tất cả phiên và socket/media liên quan. Luồng upload, xác minh ảnh và dọn ảnh cũ cần M1/M2 review theo [proposal](../proposals/m1-workspace-auth.md); chưa triển khai schema/index/migration.

Cập nhật 03/11: WS-11/FR-02-08 chuyển owner không còn thuộc MVP. Owner pointer và membership OWNER vẫn phải khớp từ lúc tạo; role management không được đổi OWNER. Các mô tả/test transfer cũ còn trong review là lịch sử, không yêu cầu xây luồng bàn giao. Chuyển host phiên LIVE vẫn giữ nguyên.
