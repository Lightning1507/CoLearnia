# Danh mục Use Case chi tiết — sau review

**Trạng thái: danh mục và quyết định giữ/gộp đã được người dùng đồng ý sau review.** Cập nhật ngày 01/11/2026 (PRIVATE/UC-WS-15): đã có [tổng quan Astah](diagrams/README.md) và [6 hồ sơ đặc tả hiện hành](use-cases/README.md); chưa vẽ sơ đồ chi tiết cho toàn bộ danh mục. Tiếp nối [actor và tổng quan](use-case-outline.md), tổ chức nghiệp vụ đã chốt theo mục tiêu người dùng; không thêm scope hoặc quyền. Đây là danh mục phân tích, không phải backlog task, danh sách màn hình hay bằng chứng triển khai.

## Kết quả review mức mục tiêu

Bản đầu có 53 mục ứng viên, sau đó thêm WS-15. Hiện hành sau kickoff: **43 UC nghiệp vụ + 3 truy cập chung**, 8 mã gộp và UC-GRP-03/07 ngừng áp dụng (56 mã truy vết). Bỏ xét duyệt DISCUSSION, thêm LIVE-11/12 recording; không tái dùng mã cũ. Các dòng Giữ/Truy cập chung là UC hiện hành, các dòng gộp/ngừng không là oval độc lập.

## Quy ước

- Actor hiện hành: A-00 Người dùng hệ thống, A-03 Thành viên Workspace, A-04 Admin Workspace, A-05 Owner Workspace, A-07 Host cuộc họp. A-03 bao gồm owner/admin/host khi thực hiện hành vi thành viên và đủ quyền scope. Điều kiện đăng nhập, membership và đã vào cuộc họp vẫn bắt buộc ở từng UC.
- Mã `UC-ACC/WS/MSG/LIVE/GRP/BOARD-xx` là định danh phân tích đã được đồng ý, tách biệt feature IDs và ba hành trình nghiệm thu UC-01/02/03. Số mã không là thứ tự thực hiện hoặc số task cần lập.
- Cột điều kiện là tóm tắt để kiểm ranh giới, chưa thay toàn bộ tiền điều kiện/validation/ACL. Cột kết quả mô tả trường hợp thành công; đặc tả sau phải có luồng lỗi và hậu điều kiện thất bại.
- Nguồn ở mỗi miền sở hữu nghiệp vụ. Khi khác biệt, sửa/đối chiếu nguồn thay vì coi danh mục này là quyền mới. Các nhánh còn mở giữ nguyên, không tự điền cho đủ sơ đồ.
- Các bước chọn màu, chọn file, chụp frame, phân trang, refresh phiên và retry nằm trong luồng phù hợp; không tự tạo UC chỉ vì có nút hoặc endpoint.

## Chức năng truy cập chung · đặt trực tiếp trên tổng quan

Nguồn: [Scope AUTH-01](scope.md), [tài khoản](workspace-channels.md).

| Mã        | UC đề xuất        | Actor | Điều kiện chính          | Kết quả người dùng                                                         | Quyết định review                   |
| --------- | ----------------- | ----- | ------------------------ | -------------------------------------------------------------------------- | ----------------------------------- |
| UC-ACC-01 | Đăng ký tài khoản | A-00  | Thông tin đăng ký hợp lệ | Có tài khoản để truy cập hệ thống                                          | Truy cập chung, không phân rã riêng |
| UC-ACC-02 | Đăng nhập         | A-00  | Có tài khoản hợp lệ      | Thiết lập phiên truy cập hợp lệ                                            | Truy cập chung, không phân rã riêng |
| UC-ACC-03 | Đăng xuất         | A-00  | Có phiên truy cập        | Kết thúc phiên truy cập liên quan; thu truy cập socket/media theo baseline | Truy cập chung, không phân rã riêng |

## TQ-02 · Tổ chức không gian học tập

Nguồn: [Scope WS-01/02/03, CH-01](scope.md), [quyền tại plan 10.2](../technical-plan.md#102-rest-chính), [general](messaging.md).

| Mã       | UC đề xuất                     | Actor     | Điều kiện chính                                                                 | Kết quả người dùng                                                                                                 | Quyết định review |
| -------- | ------------------------------ | --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| UC-WS-01 | Tạo Workspace                  | A-00      | Đã đăng nhập                                                                    | Có Workspace, owner membership và general TEXT đồng thời                                                           | Giữ UC độc lập    |
| UC-WS-02 | Xem các Workspace của mình     | A-00      | Đã đăng nhập                                                                    | Xem danh sách và mở Workspace còn quyền                                                                            | Giữ UC độc lập    |
| UC-WS-03 | Đổi tên Workspace              | A-04/A-05 | Còn quyền quản trị Workspace đích                                               | Tên Workspace được cập nhật                                                                                        | Giữ UC độc lập    |
| UC-WS-04 | Xóa Workspace                  | A-05      | Là owner hiện tại                                                               | Workspace ngừng truy cập; các tài nguyên liên quan được thu theo lifecycle                                         | Giữ UC độc lập    |
| UC-WS-05 | Tạo lời mời tham gia Workspace | A-04/A-05 | Còn quyền tạo lời mời                                                           | Có link mời với hạn dùng và giới hạn theo baseline                                                                 | Giữ UC độc lập    |
| UC-WS-06 | Thu hồi lời mời Workspace      | A-04/A-05 | Có lời mời thuộc Workspace được quản lý                                         | Link không còn dùng để tham gia                                                                                    | Giữ UC độc lập    |
| UC-WS-07 | Tham gia Workspace qua lời mời | A-00      | Có lời mời còn hợp lệ                                                           | Có membership, không tạo trùng khi thực hiện lại                                                                   | Giữ UC độc lập    |
| UC-WS-08 | Xem thành viên Workspace       | A-03      | Có membership hiện hành                                                         | Xem danh sách thành viên trong Workspace                                                                           | Giữ UC độc lập    |
| UC-WS-09 | Thay đổi vai trò thành viên    | A-05      | Là owner; đích đủ điều kiện                                                     | Cập nhật admin/member; không hạ owner bằng thao tác này                                                            | Giữ UC độc lập    |
| UC-WS-10 | Loại thành viên khỏi Workspace | A-04/A-05 | Đích trong quyền quản lý; admin không loại owner/admin khác                     | Thu membership và truy cập liên quan                                                                               | Giữ UC độc lập    |
| UC-WS-11 | Chuyển quyền owner Workspace   | A-05      | Đích là thành viên hợp lệ                                                       | Một owner mới, không có thời điểm hai owner có quyền                                                               | Giữ UC độc lập    |
| UC-WS-12 | Tạo kênh học tập               | A-04/A-05 | Còn quyền quản lý kênh                                                          | Có kênh TEXT hoặc LIVE với phạm vi truy cập theo baseline                                                          | Giữ UC độc lập    |
| UC-WS-13 | Đổi tên kênh học tập           | A-04/A-05 | Kênh tồn tại trong Workspace được quản lý                                       | Tên mới; không đổi loại TEXT/LIVE                                                                                  | Giữ UC độc lập    |
| UC-WS-14 | Xóa kênh học tập               | A-04/A-05 | Kênh thuộc Workspace được quản lý                                               | Kênh ngừng truy cập, đóng phiên/tài nguyên liên quan                                                               | Giữ UC độc lập    |
| UC-WS-15 | Quản lý quyền truy cập kênh    | A-04/A-05 | Kênh PRIVATE thuộc Workspace được quản lý; người được thêm có membership hợp lệ | Thêm/gỡ danh sách truy cập; rejoin Workspace cần cấp lại PRIVATE; thu quyền khi gỡ, không đổi loại hoặc accessMode | Giữ UC độc lập    |

## TQ-03 · Trao đổi trong Workspace

Nguồn: [Messaging](messaging.md), [scope CHAT-01/02/03, FILE-01](scope.md).

| Mã        | UC đề xuất                        | Actor | Điều kiện chính                      | Kết quả người dùng                                                                   | Quyết định review                          |
| --------- | --------------------------------- | ----- | ------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| UC-MSG-01 | Gửi tin nhắn trong kênh           | A-03  | Có quyền kênh TEXT                   | Tin text/ảnh/file đến đúng kênh, có trạng thái gửi/thử lại                           | Giữ UC độc lập                             |
| UC-MSG-02 | Xem hội thoại trong kênh          | A-03  | Có quyền kênh TEXT                   | Đọc tin gốc hiện tại và lịch sử phân trang                                           | Giữ UC độc lập                             |
| UC-MSG-03 | Mở hội thoại riêng với thành viên | A-03  | Hai bên còn thuộc cùng Workspace     | Tìm/mở một DM của cặp trong Workspace; không tạo trùng; xem từ danh sách DM của mình | Gộp vào UC-MSG-04/05: chọn người/mở lại DM |
| UC-MSG-04 | Gửi tin nhắn riêng                | A-03  | Là một trong hai bên DM còn quyền    | Tin text/ảnh/file chỉ tới đúng hội thoại riêng                                       | Giữ UC độc lập                             |
| UC-MSG-05 | Xem hội thoại riêng               | A-03  | Là một trong hai bên DM còn quyền    | Đọc tin và lịch sử riêng đúng quyền                                                  | Giữ UC độc lập                             |
| UC-MSG-06 | Thảo luận theo thread             | A-03  | Có quyền kênh TEXT và tin gốc hợp lệ | Đọc thread và trả lời một cấp; không đăng lặp ra dòng chính                          | Giữ UC độc lập                             |
| UC-MSG-07 | Xem thảo luận trong thread        | A-03  | Có quyền kênh và tin gốc             | Xem tin gốc, số reply và lịch sử thread                                              | Gộp vào UC-MSG-06: đọc và trả lời thread   |
| UC-MSG-08 | Tải tệp đính kèm trong Workspace  | A-03  | Còn quyền hội thoại chứa attachment  | Nhận tệp hợp lệ; biết URL/ID không thay quyền                                        | Giữ UC độc lập                             |

## TQ-04 · Tham gia cuộc họp trực tuyến

Nguồn: [Live session](live-session.md), [policy](groups-media-policy.md), [group modes](group-modes.md).

| Mã         | UC đề xuất                           | Actor               | Điều kiện chính                                  | Kết quả người dùng                                                                                              | Quyết định review                                     |
| ---------- | ------------------------------------ | ------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| UC-LIVE-01 | Vào cuộc họp                         | A-03                | Có quyền kênh LIVE, phiên truy cập hợp lệ        | Tham gia phiên hiện có hoặc khởi tạo phiên mới và trở thành host; có lobby; có thể chỉ xem nếu từ chối thiết bị | Giữ UC độc lập                                        |
| UC-LIVE-02 | Rời cuộc họp                         | A-03                | Đang tham gia phiên                              | Thành viên rời và thu tài nguyên của mình; host còn quyền chủ động rời dùng LIVE-10 kết thúc toàn phiên         | Giữ UC độc lập                                        |
| UC-LIVE-03 | Xem người tham gia cuộc họp          | A-03                | Đang tham gia và còn quyền                       | Xem danh sách người tham gia theo projection được phép                                                          | Đưa vào UC-LIVE-01/04: xem người để theo dõi/trao đổi |
| UC-LIVE-04 | Trao đổi bằng mic và camera          | A-03                | Đang tham gia, có thiết bị/quyền sử dụng phù hợp | Chọn thiết bị, bật/tắt, nghe/xem đúng audience; xem người tham gia và chỉnh âm lượng nguồn hợp lệ               | Giữ UC độc lập                                        |
| UC-LIVE-05 | Chia sẻ màn hình                     | A-03                | Ở MAIN hoặc ACTIVITY, nguồn scope đang trống     | Chủ động bắt đầu và dừng nguồn share của mình; không xin host/giành nguồn; DISCUSSION bị chặn                   | Giữ UC độc lập                                        |
| UC-LIVE-06 | Dừng chia sẻ màn hình                | A-03                | Là người đang share trong scope                  | Dừng nguồn của mình và giải phóng chỗ share; frame đã freeze theo lifecycle riêng                               | Gộp vào UC-LIVE-05: kết thúc nguồn share của mình     |
| UC-LIVE-07 | Điều chỉnh âm lượng nghe             | A-03                | Có nguồn được phép nhận                          | Thay âm lượng cục bộ của nguồn hợp lệ; không mở quyền nghe scope khác                                           | Đưa vào UC-LIVE-04: thiết lập âm lượng nguồn hợp lệ   |
| UC-LIVE-08 | Trao đổi với Everyone trong cuộc họp | A-03                | Có scope MAIN/group hiện tại hợp lệ              | Gửi/đọc text và ảnh theo scope, không phát xuyên nhóm; đọc ảnh cùng ACL                                         | Giữ UC độc lập                                        |
| UC-LIVE-09 | Trao đổi riêng với host              | A-03; A-07 phối hợp | Có host hợp lệ, cả hai còn quyền                 | Gửi/đọc text và ảnh giữa người gửi với đúng host đích; không mở DM tùy ý trong meeting                          | Giữ UC độc lập                                        |
| UC-LIVE-10 | Kết thúc cuộc họp cho mọi người      | A-07                | Đang giữ host hợp lệ                             | Phiên kết thúc và thu tài nguyên toàn phiên; khác kết thúc chia nhóm                                            | Giữ UC độc lập                                        |
| UC-GRP-01  | Chuyển quyền host cuộc họp           | A-07                | Host hiện tại hợp lệ, đích đang tham gia         | Host gán trực tiếp cho participant hợp lệ; không chờ chấp nhận, người cũ trở thành thành viên                   | Giữ UC độc lập                                        |

## TQ-05 · Tham gia hoạt động nhóm

Nguồn: [Group modes](group-modes.md), [host và hỗ trợ](groups-media-policy.md), [chuyển/khôi phục host](live-session.md#83-chuyển-host-và-host-mất-mạng).

| Mã        | UC đề xuất                           | Actor | Điều kiện chính                                   | Kết quả người dùng                                                                                                                                           | Quyết định review |
| --------- | ------------------------------------ | ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| UC-GRP-02 | Tạo nhóm trao đổi                    | A-03  | Đang tham gia LIVE, phase giảng, dữ liệu hợp lệ   | Hệ thống tạo nhóm/roster ngay, không chờ host; chưa chuyển người hoặc cấp membership                                                                         | Giữ UC độc lập    |
| UC-GRP-04 | Vào nhóm trao đổi đã được tạo hợp lệ | A-03  | Có trong roster hợp lệ; phase và quyền còn hợp lệ | Chủ động vào/vào lại DISCUSSION còn mở theo roster hợp lệ, nhận bài giảng MAIN và không gian riêng                                                           | Giữ UC độc lập    |
| UC-GRP-08 | Trở về phòng chung                   | A-03  | Đang ở một nhóm                                   | Chỉ mình về MAIN, còn trong LIVE; mic pause để tự bật lại, nhóm còn người tiếp tục; người cuối cùng chủ động rời thì tự đóng DISCUSSION đã có người tham gia | Giữ UC độc lập    |

## TQ-07 · Điều hành hoạt động nhóm

Host có trách nhiệm điều hành riêng; thành viên có thể phối hợp nhưng không có quyền điều hành. Host vẫn kế thừa các tương tác TQ-05 khi đủ điều kiện. UC-GRP-01 chuyển host và UC-LIVE-10 kết thúc cuộc họp đặt trong phân rã TQ-04; giữ mã UC-GRP-01 để truy vết, không đổi mã theo chỗ hiển thị. Hướng dẫn chung tại đây theo policy MAIN/DISCUSSION.

| Mã        | UC đề xuất                    | Actor                          | Điều kiện chính                                                                | Kết quả người dùng                                                                                                                                | Quyết định review                            |
| --------- | ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| UC-GRP-03 | Xét duyệt yêu cầu (cũ)        | —                              | Ngừng áp dụng sau kickoff 02/11                                                | Kiểm hợp lệ tự động nằm trong UC-GRP-02; không host duyệt/từ chối                                                                                 | Ngừng áp dụng, không oval, không tái dùng mã |
| UC-GRP-05 | Chuẩn bị nhóm hoạt động       | A-07                           | Đang giữ host hợp lệ                                                           | Tạo ACTIVITY, phân thủ công hoặc random có preview/chỉnh trước start; chuẩn bị chưa chuyển người                                                  | Giữ UC độc lập                               |
| UC-GRP-06 | Bắt đầu lượt hoạt động nhóm   | A-07; A-03 được phân phối hợp  | Nhóm/phân công/thời lượng hợp lệ                                               | Kết thúc DISCUSSION trước, đưa người được phân vào ACTIVITY độc lập; chặn DISCUSSION trong lượt                                                   | Giữ UC độc lập                               |
| UC-GRP-07 | Điều chuyển thành viên (cũ)   | —                              | Ngừng áp dụng ngày 04/11/2026                                                  | Không có host move; thành viên vào lại đúng ACTIVITY đã phân theo luồng tham gia hiện có                                                          | Ngừng áp dụng, không oval, không tái dùng mã |
| UC-GRP-09 | Kết thúc nhóm trao đổi        | A-07; A-03 trong nhóm phối hợp | DISCUSSION đang mở, ở giai đoạn giảng                                          | Host chọn đóng một nhóm hoặc tất cả DISCUSSION; thu private scope, đưa người liên quan về MAIN; nhóm không chọn tiếp tục                          | Giữ UC độc lập; chỉ DISCUSSION               |
| UC-GRP-10 | Kết thúc các nhóm trao đổi    | A-07                           | Theo UC-GRP-09                                                                 | Nhánh chọn tất cả DISCUSSION của cùng mục tiêu kết thúc nhóm                                                                                      | Gộp vào UC-GRP-09; mã chỉ để truy vết        |
| UC-GRP-11 | Đặt thời lượng lượt hoạt động | A-07; A-03 theo dõi            | Host tổ chức lượt, thời lượng hợp lệ trước khi bắt đầu                         | Có deadline chung khi bắt đầu; hết giờ hệ thống tự kết thúc ACTIVITY và đưa người còn quyền về MAIN/pause mic                                     | Giữ UC độc lập                               |
| UC-GRP-12 | Hỗ trợ riêng một nhóm         | A-07; A-03 nhóm đích phối hợp  | ACTIVITY còn mở trong lượt hiệu lực; host được vào theo thao tác hỗ trợ        | Vào có thông báo, trao đổi trong nhóm đích rồi rời hỗ trợ; không nghe mọi nhóm; chủ động rời về MAIN giữ trạng thái mic, không xác nhận mic riêng | Giữ UC độc lập                               |
| UC-GRP-13 | Thông báo hướng dẫn chung     | A-07; A-03 nhận đúng audience  | Host ở scope hướng dẫn hợp lệ; kết thúc help về MAIN trước khi thông báo chung | Thông báo tới MAIN/DISCUSSION theo policy; không tự phát sang ACTIVITY                                                                            | Giữ UC độc lập                               |

## TQ-04 (tiếp) · Cộng tác trên khung hình chia sẻ

Phần này chuyển từ TQ-06 cũ xuống phạm vi cuộc họp, không còn oval riêng ở tổng quan. Giữ mã UC-BOARD và chức năng; không mặc định include/extend chỉ vì nằm trong cùng miền.

Nguồn: [Board collaboration](board-collaboration.md), [quyền board](groups-media-policy.md), [nguồn theo nhóm](group-modes.md).

| Mã          | UC đề xuất                          | Actor                                   | Điều kiện chính                                                                          | Kết quả người dùng                                                                                                               | Quyết định review                               |
| ----------- | ----------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| UC-BOARD-01 | Dừng hình để cộng tác               | A-03                                    | Trong DISCUSSION/ACTIVITY, có quyền board và nguồn hợp lệ                                | Cùng scope dùng một frame chung; audio hợp lệ vẫn tiếp tục                                                                       | Giữ UC độc lập                                  |
| UC-BOARD-02 | Vẽ và chỉ dẫn trên nội dung chia sẻ | A-03 trong nhóm; A-07 tại MAIN          | Có quyền board/context hiện hành                                                         | Vẽ/chỉ dẫn, undo nét mình, clear theo quyền và xác nhận; MAIN host vẽ LIVE nét thường/tự biến mất; nhóm LIVE tạm, FROZEN giữ nét | Giữ UC độc lập                                  |
| UC-BOARD-03 | Hoàn tác nét vẽ của mình            | A-03 trong nhóm; A-07 tại MAIN          | Còn quyền context, có nét của mình được phép undo                                        | Bỏ nét gần nhất của mình; không xóa nét người khác                                                                               | Đưa vào UC-BOARD-02: sửa nét bằng undo của mình |
| UC-BOARD-04 | Xóa nội dung vẽ trong ngữ cảnh      | A-03 nhóm có quyền clear; A-07 tại MAIN | MAIN chỉ host ở MAIN/hướng dẫn; nhóm theo chủ frame/chủ nguồn hoặc host đủ quyền context | Sau xác nhận, xóa nét của context theo quyền; không xóa tùy ý board nhóm khác                                                    | Đưa vào UC-BOARD-02: clear có quyền và xác nhận |
| UC-BOARD-05 | Trở lại hình trực tiếp              | A-03                                    | Trong DISCUSSION/ACTIVITY, có quyền board/context                                        | Bỏ lớp frame/nét cũ để thấy nguồn hiện tại; không tua lại, báo rõ nếu nguồn đã dừng                                              | Giữ UC độc lập                                  |

## Truy vết yêu cầu xuyên suốt và điểm mở

| Nội dung                                      | UC/luồng sở hữu                                                     | Cách thể hiện                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh/hết hạn/thu phiên                     | UC-ACC-02/03 và UC đang dùng quyền                                  | Gia hạn là xử lý phiên; hết quyền ngừng truy cập, không include Đăng nhập vào mọi UC                                                                                       |
| REC-01, PB-11                                 | UC-LIVE-01 và các UC media/chat/group/board được giữ                | Nhánh mất mạng, reconnect và lấy trạng thái hiện hành; không thêm miền Reconnect ngang mức TQ                                                                              |
| Host tự có khi bắt đầu                        | UC-LIVE-01                                                          | Nhánh tạo phiên mới; vào phiên đã có không lấy host                                                                                                                        |
| Host tạm khi mất mạng và tự hoàn quyền        | Luồng điều hành TQ-07, liên quan UC-LIVE-01, UC-GRP-01              | Sự kiện hệ thống ngay khi phát hiện host mất kết nối; ngẫu nhiên participant hợp lệ rồi tự hoàn quyền khi người cũ quay lại hợp lệ; không cần nút tự nhận host/UC xin host |
| Host chủ động rời và bàn giao chính thức      | UC-LIVE-02/10, UC-GRP-01 và nhánh phục hồi                          | Host còn quyền chủ động rời kết thúc phiên; người đã bàn giao rời như thành viên. Không có ứng viên/host tạm mất mạng vẫn mở tại nguồn                                     |
| FILE-01                                       | UC-MSG-01/04/06/08, UC-LIVE-08/09, UC-BOARD-01                      | Upload/bind là bước gửi/chụp; Workspace cho file, meeting chỉ ảnh, frame freeze tạm khác attachment gửi vào chat                                                           |
| Lịch sử DM sau rời rồi được mời lại Workspace | UC-MSG-04/05/08                                                     | Đã chốt tại messaging: mở lại lịch sử còn lưu của đúng cặp khi cả hai membership hiện tại hợp lệ; userId cũ không đủ quyền                                                 |
| Channel PRIVATE                               | UC-WS-12/15, mọi UC truy cập kênh                                   | Owner/admin tạo/quản lý danh sách; nội dung cần channel access kể cả admin. Thêm thấy lịch sử còn lưu, gỡ thu quyền ngay; không đổi accessMode sau tạo                     |
| Countdown hết giờ                             | UC-GRP-06/11 và luồng kết thúc tự động HS-03                        | Deadline server kết thúc đúng lượt ACTIVITY, thu scope và về MAIN; không là oval mới hoặc include UC-GRP-09                                                                |
| Phát biểu sau chia nhóm                       | Hết thời lượng ACTIVITY hoặc UC-GRP-09 (DISCUSSION), rồi UC-LIVE-04 | Người từ nhóm về được pause mic, tự bật tại MAIN; không floor/consent/công khai board                                                                                      |

Người nhận tin/tham gia nhóm được ghi là actor phối hợp khi cần làm rõ tương tác; các bảng không có nghĩa mọi UC cần hai actor hoặc backend trở thành actor. Host tạm dùng cùng actor A-07, host bị mất mạng dùng cùng danh tính người dùng; không tạo loại tài khoản mới.

## Quan hệ và cách tách sơ đồ đề xuất

- TQ là sơ đồ tổng quan; danh mục chi tiết là các góc nhìn dưới miền. Không nối include từ TQ tới mọi UC trong miền.
- Chưa gán include/extend/generalization trong danh mục. Cần đọc luồng chính và nhánh trước, không dùng extend để diễn đạt thứ tự hoặc phân quyền.
- Tạo DISCUSSION và vào DISCUSSION là hai mục tiêu riêng. Kiểm hợp lệ tự động nằm trong luồng tạo, không là UC xét duyệt hoặc include khi join.
- Nhắn Host không include hỗ trợ nhóm: tin nhắn không tự đưa host vào nhóm. Hỗ trợ cũng không bắt buộc phải có tin nhắn trước nếu nguồn không yêu cầu.
- Vẽ không bắt buộc include dừng hình vì MAIN host vẽ LIVE (nét thường hoặc tự biến mất), nhóm LIVE có chỉ dẫn tạm; dừng hình không bắt buộc người dùng phải vẽ. Resume không include bắt đầu share.
- Kế hoạch hiện hành có 5 sơ đồ phân rã tương ứng TQ-02/03/04/05/07. TQ-04 giữ board trong cùng hình cuộc họp; TQ-02 giữ Workspace, thành viên/lời mời và kênh trên cùng hình. Các phương án tách góc nhìn trước đó đã được thay bằng [kế hoạch đã xác nhận](diagrams/plan.md), không thay đổi mục tiêu hoặc quyền.
- Không dồn toàn bộ danh mục lên một hình. Mỗi sơ đồ dùng một mức chính, chỉ thêm UC dùng chung/mở rộng khi có quan hệ thật sự cần diễn đạt. Danh mục dùng chung giữ mã nhất quán nếu UC xuất hiện lại ở nhiều góc nhìn.

## Đề nghị review và đặc tả tiếp theo

Review các quyết định giữ/gộp theo lý do tại [bản review](use-case-review.md); đặc biệt các UC cấu hình/CRUD nhỏ được giữ tạm vì có kết quả riêng. UC-LIVE-08/09 gom gửi/đọc theo audience; UC-GRP-05/06 tách chuẩn bị/bắt đầu; UC-GRP-12 gom vòng hỗ trợ. Đây là lựa chọn mô hình hóa còn có thể chỉnh; không phải chức năng được tự thêm.

Chỉ có [6 hồ sơ đặc tả trọng tâm](use-cases/README.md), mỗi hồ sơ nêu trigger, actor, điều kiện, luồng, nhánh lỗi, hậu điều kiện và ca review. Phiên bản hiện hành lấy tại mục lục hồ sơ; không viết 46 đặc tả riêng hoặc tự thêm include/extend để lấp sơ đồ.

## Trạng thái sơ đồ và quy tắc trình bày

Đích là 5 phân rã TQ-02/03/04/05/07 theo [kế hoạch](diagrams/plan.md). Đã có 6 hình UC (kể tổng quan) và 1 Activity; [README bản vẽ](diagrams/README.md) là nguồn duy nhất ghi chênh lệch thực tế, không lặp snapshot từng đợt ở danh mục này.

GRP-09 chỉ đóng DISCUSSION, không kết thúc ACTIVITY thủ công; GRP-08 áp dụng cả hai mode. Trên hình GRP-11 đặt thời lượng, GRP-13 thông báo, GRP-01 chuyển host và LIVE-10 kết thúc phiên chỉ cần nối host; thành viên trực tiếp trao đổi nên nối GRP-12. Association không thay ACL hoặc tự cấp quyền điều hành. Host kế thừa hành vi thông thường của thành viên; không nối lặp chỉ để cho thấy host cũng tham gia.

## Làm rõ hỗ trợ và nhóm trống — xác nhận 02/11/2026

UC-GRP-12 chỉ hỗ trợ trực tiếp ACTIVITY; DISCUSSION hỏi/trả lời qua UC-LIVE-09 khi host ở MAIN. UC-GRP-08 có nhánh người cuối cùng chủ động rời DISCUSSION đã có người làm nhóm tự kết thúc, dùng cleanup nhóm hiện hành; không tạo oval hay UC mới. UC-GRP-09 vẫn là mục tiêu host chủ động đóng một/tất cả DISCUSSION. Nhóm tạo hợp lệ nhưng chưa ai vào được giữ chờ; nhóm còn người cho roster hợp lệ vào lại; nhóm đã đóng không mở lại từ roster cũ. Chi tiết và ca kiểm ở [HS-02](use-cases/02-discussion.md).

## Gộp UC kết thúc DISCUSSION — xác nhận 01/11/2026

UC-GRP-09 có hai nhánh một/tất cả DISCUSSION; GRP-10 đã gộp, không tái dùng mã. Tổng hiện hành theo mục đầu trang; không thêm hồ sơ đặc tả recording chi tiết trong lượt này.

## UC recording bổ sung sau kickoff

| Mã         | UC                       | Actor | Điều kiện / kết quả                                                          | Quyết định                                    |
| ---------- | ------------------------ | ----- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| UC-LIVE-11 | Ghi hình cuộc họp        | A-07  | Host hiện hành bắt đầu/dừng ghi MAIN và theo dõi xử lý; không ghi nhóm riêng | Giữ UC độc lập, bắt đầu/dừng là cùng mục tiêu |
| UC-LIVE-12 | Xem lại bản ghi cuộc họp | A-03  | Video sẵn sàng, còn membership/quyền kênh LIVE gốc                           | Giữ UC độc lập                                |

Random là phương án của UC-GRP-05 chuẩn bị ACTIVITY, không thêm UC random độc lập. UC-GRP-03/07 ngừng áp dụng, không tái dùng mã; tổng hiện hành 43 UC nghiệp vụ + 3 truy cập chung (bỏ một UC xét duyệt, thêm hai recording), 8 mục gộp và hai mã ngừng áp dụng. Nguồn: [recording](recording.md), [group modes](group-modes.md).
