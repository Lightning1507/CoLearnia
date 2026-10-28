# Danh mục Use Case chi tiết — sau review

**Trạng thái: danh mục và quyết định giữ/gộp đã được người dùng đồng ý sau review; chưa chốt sơ đồ hoặc đặc tả hoàn chỉnh.** Ngày 27/10/2026. Tiếp nối [actor và tổng quan](use-case-outline.md), tổ chức nghiệp vụ đã chốt theo mục tiêu người dùng; không thêm scope hoặc quyền. Đây là danh mục phân tích, không phải backlog task, danh sách màn hình hay bằng chứng triển khai.

## Kết quả review mức mục tiêu

Bản đầu có 53 mục ứng viên. Sau [review mức mục tiêu](use-case-review.md), người dùng đã đồng ý **43 UC nghiệp vụ độc lập, 3 UC truy cập chung và 7 mục đưa vào luồng của UC khác**. Không cắt chức năng, không tạo 53 oval. Bảng dưới giữ mã cũ của cả mục được gộp để truy vết; chỉ các dòng “Giữ” và “Truy cập chung” là ứng viên oval. Các mục được gộp không còn là UC độc lập; mã không tái sử dụng.

## Quy ước

- Actor A-00…A-07 lấy từ bản tổng quan. A-03 bao gồm tư cách thành viên Workspace của owner/admin; A-06 cũng bao gồm host khi thực hiện hành vi người tham gia và đủ quyền scope. Actor chung A-00 dùng cho đăng nhập theo bản tổng quan; điều kiện quyền từng UC vẫn bắt buộc.
- Mã `UC-ACC/WS/MSG/LIVE/GRP/BOARD-xx` là định danh phân tích đã được đồng ý, tách biệt feature IDs và ba hành trình nghiệm thu UC-01/02/03. Số mã không là thứ tự thực hiện hoặc số task cần lập.
- Cột điều kiện là tóm tắt để kiểm ranh giới, chưa thay toàn bộ tiền điều kiện/validation/ACL. Cột kết quả mô tả trường hợp thành công; đặc tả sau phải có luồng lỗi và hậu điều kiện thất bại.
- Nguồn ở mỗi miền sở hữu nghiệp vụ. Khi khác biệt, sửa/đối chiếu nguồn thay vì coi danh mục này là quyền mới. Các nhánh còn mở giữ nguyên, không tự điền cho đủ sơ đồ.
- Các bước chọn màu, chọn file, chụp frame, phân trang, refresh phiên và retry nằm trong luồng phù hợp; không tự tạo UC chỉ vì có nút hoặc endpoint.

## Chức năng truy cập chung · đặt trực tiếp trên tổng quan

Nguồn: [Scope AUTH-01](scope.md), [tài khoản](workspace-channels.md).

| Mã        | UC đề xuất        | Actor | Điều kiện chính          | Kết quả người dùng                                                         | Quyết định review                   |
| --------- | ----------------- | ----- | ------------------------ | -------------------------------------------------------------------------- | ----------------------------------- |
| UC-ACC-01 | Đăng ký tài khoản | A-01  | Thông tin đăng ký hợp lệ | Có tài khoản để truy cập hệ thống                                          | Truy cập chung, không phân rã riêng |
| UC-ACC-02 | Đăng nhập         | A-00  | Có tài khoản hợp lệ      | Thiết lập phiên truy cập hợp lệ                                            | Truy cập chung, không phân rã riêng |
| UC-ACC-03 | Đăng xuất         | A-02  | Có phiên truy cập        | Kết thúc phiên truy cập liên quan; thu truy cập socket/media theo baseline | Truy cập chung, không phân rã riêng |

## TQ-02 · Tổ chức không gian học tập

Nguồn: [Scope WS-01/02/03, CH-01](scope.md), [quyền tại plan 10.2](../technical-plan.md#102-rest-chính), [general](messaging.md).

| Mã       | UC đề xuất                     | Actor     | Điều kiện chính                                             | Kết quả người dùng                                                         | Quyết định review |
| -------- | ------------------------------ | --------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------- |
| UC-WS-01 | Tạo Workspace                  | A-02      | Đã đăng nhập                                                | Có Workspace, owner membership và general TEXT đồng thời                   | Giữ UC độc lập    |
| UC-WS-02 | Xem các Workspace của mình     | A-02      | Đã đăng nhập                                                | Xem danh sách và mở Workspace còn quyền                                    | Giữ UC độc lập    |
| UC-WS-03 | Đổi tên Workspace              | A-04/A-05 | Còn quyền quản trị Workspace đích                           | Tên Workspace được cập nhật                                                | Giữ UC độc lập    |
| UC-WS-04 | Xóa Workspace                  | A-05      | Là owner hiện tại                                           | Workspace ngừng truy cập; các tài nguyên liên quan được thu theo lifecycle | Giữ UC độc lập    |
| UC-WS-05 | Tạo lời mời tham gia Workspace | A-04/A-05 | Còn quyền tạo lời mời                                       | Có link mời với hạn dùng và giới hạn theo baseline                         | Giữ UC độc lập    |
| UC-WS-06 | Thu hồi lời mời Workspace      | A-04/A-05 | Có lời mời thuộc Workspace được quản lý                     | Link không còn dùng để tham gia                                            | Giữ UC độc lập    |
| UC-WS-07 | Tham gia Workspace qua lời mời | A-02      | Có lời mời còn hợp lệ                                       | Có membership, không tạo trùng khi thực hiện lại                           | Giữ UC độc lập    |
| UC-WS-08 | Xem thành viên Workspace       | A-03      | Có membership hiện hành                                     | Xem danh sách thành viên trong Workspace                                   | Giữ UC độc lập    |
| UC-WS-09 | Thay đổi vai trò thành viên    | A-05      | Là owner; đích đủ điều kiện                                 | Cập nhật admin/member; không hạ owner bằng thao tác này                    | Giữ UC độc lập    |
| UC-WS-10 | Loại thành viên khỏi Workspace | A-04/A-05 | Đích trong quyền quản lý; admin không loại owner/admin khác | Thu membership và truy cập liên quan                                       | Giữ UC độc lập    |
| UC-WS-11 | Chuyển quyền owner Workspace   | A-05      | Đích là thành viên hợp lệ                                   | Một owner mới, không có thời điểm hai owner có quyền                       | Giữ UC độc lập    |
| UC-WS-12 | Tạo kênh học tập               | A-04/A-05 | Còn quyền quản lý kênh                                      | Có kênh TEXT hoặc LIVE với phạm vi truy cập theo baseline                  | Giữ UC độc lập    |
| UC-WS-13 | Đổi tên kênh học tập           | A-04/A-05 | Kênh tồn tại trong Workspace được quản lý                   | Tên mới; không đổi loại TEXT/LIVE                                          | Giữ UC độc lập    |
| UC-WS-14 | Xóa kênh học tập               | A-04/A-05 | Kênh thuộc Workspace được quản lý                           | Kênh ngừng truy cập, đóng phiên/tài nguyên liên quan                       | Giữ UC độc lập    |

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
| UC-LIVE-02 | Rời cuộc họp                         | A-06                | Đang tham gia phiên                              | Rời LIVE và thu tài nguyên của mình; nhánh host chưa chuyển quyền còn mở                                        | Giữ UC độc lập                                        |
| UC-LIVE-03 | Xem người tham gia cuộc họp          | A-06                | Đang tham gia và còn quyền                       | Xem danh sách người tham gia theo projection được phép                                                          | Đưa vào UC-LIVE-01/04: xem người để theo dõi/trao đổi |
| UC-LIVE-04 | Trao đổi bằng mic và camera          | A-06                | Đang tham gia, có thiết bị/quyền sử dụng phù hợp | Chọn thiết bị, bật/tắt, nghe/xem đúng audience; xem người tham gia và chỉnh âm lượng nguồn hợp lệ               | Giữ UC độc lập                                        |
| UC-LIVE-05 | Chia sẻ màn hình                     | A-06                | Ở MAIN hoặc ACTIVITY, nguồn scope đang trống     | Chủ động bắt đầu và dừng nguồn share của mình; không xin host/giành nguồn; DISCUSSION bị chặn                   | Giữ UC độc lập                                        |
| UC-LIVE-06 | Dừng chia sẻ màn hình                | A-06                | Là người đang share trong scope                  | Dừng nguồn của mình và giải phóng chỗ share; frame đã freeze theo lifecycle riêng                               | Gộp vào UC-LIVE-05: kết thúc nguồn share của mình     |
| UC-LIVE-07 | Điều chỉnh âm lượng nghe             | A-06                | Có nguồn được phép nhận                          | Thay âm lượng cục bộ của nguồn hợp lệ; không mở quyền nghe scope khác                                           | Đưa vào UC-LIVE-04: thiết lập âm lượng nguồn hợp lệ   |
| UC-LIVE-08 | Trao đổi với Everyone trong cuộc họp | A-06                | Có scope MAIN/group hiện tại hợp lệ              | Gửi/đọc text và ảnh theo scope, không phát xuyên nhóm; đọc ảnh cùng ACL                                         | Giữ UC độc lập                                        |
| UC-LIVE-09 | Trao đổi riêng với host              | A-06; A-07 phối hợp | Có host hợp lệ, cả hai còn quyền                 | Gửi/đọc text và ảnh giữa người gửi với đúng host đích; không mở DM tùy ý trong meeting                          | Giữ UC độc lập                                        |
| UC-LIVE-10 | Kết thúc cuộc họp cho mọi người      | A-07                | Đang giữ host hợp lệ                             | Phiên kết thúc và thu tài nguyên toàn phiên; khác kết thúc chia nhóm                                            | Giữ UC độc lập                                        |

## TQ-05 · Tổ chức và tham gia hoạt động nhóm trong buổi học

Nguồn: [Group modes](group-modes.md), [host và hỗ trợ](groups-media-policy.md), [chuyển/khôi phục host](live-session.md#83-chuyển-host-và-host-mất-mạng).

| Mã        | UC đề xuất                                  | Actor                          | Điều kiện chính                                                            | Kết quả người dùng                                                                                                                 | Quyết định review |
| --------- | ------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| UC-GRP-01 | Chuyển quyền host cuộc họp                  | A-07; A-06 đích phối hợp       | Host hiện tại hợp lệ, đích đang tham gia                                   | Đích chấp nhận thì trở thành host; từ chối/hết hạn không bàn giao                                                                  | Giữ UC độc lập    |
| UC-GRP-02 | Yêu cầu tạo nhóm trao đổi                   | A-06                           | Ở phase giảng, có quyền tham gia LIVE                                      | Gửi tên, mục đích và danh sách đề xuất để host xét; chưa cấp quyền nhóm                                                            | Giữ UC độc lập    |
| UC-GRP-03 | Xét duyệt yêu cầu nhóm trao đổi             | A-07                           | Yêu cầu còn hợp lệ, ở phase giảng                                          | Duyệt roster hoặc từ chối; duyệt không tự chuyển người vào nhóm                                                                    | Giữ UC độc lập    |
| UC-GRP-04 | Vào nhóm trao đổi đã được duyệt             | A-06                           | Có trong roster được duyệt; phase và quyền còn hợp lệ                      | Chủ động vào DISCUSSION, nhận bài giảng MAIN và không gian riêng                                                                   | Giữ UC độc lập    |
| UC-GRP-05 | Chuẩn bị nhóm hoạt động                     | A-07                           | Đang giữ host hợp lệ                                                       | Tạo các ACTIVITY và phân thành viên để sẵn sàng bắt đầu; chuẩn bị chưa chuyển người                                                | Giữ UC độc lập    |
| UC-GRP-06 | Bắt đầu lượt hoạt động nhóm                 | A-07; A-06 được phân phối hợp  | Nhóm/phân công hợp lệ                                                      | Kết thúc DISCUSSION trước, đưa người được phân vào ACTIVITY độc lập; chặn DISCUSSION trong lượt                                    | Giữ UC độc lập    |
| UC-GRP-07 | Chuyển thành viên giữa các phạm vi          | A-07; A-06 đích phối hợp       | Host và đích hợp lệ; phạm vi đích phù hợp phase/mode                       | Thu scope cũ trước khi cấp scope mới; không nhập chat/board cũ                                                                     | Giữ UC độc lập    |
| UC-GRP-08 | Trở về phòng chung                          | A-06                           | Đang ở một nhóm                                                            | Chỉ mình về MAIN, còn trong LIVE; mic pause để tự bật lại, không đóng nhóm cho người khác                                          | Giữ UC độc lập    |
| UC-GRP-09 | Đóng một nhóm                               | A-07; A-06 trong nhóm phối hợp | Nhóm đang mở thuộc phiên                                                   | Người trong nhóm về MAIN; thu private scope nhóm; không công khai nội dung                                                         | Giữ UC độc lập    |
| UC-GRP-10 | Kết thúc chia nhóm và tập trung phòng chung | A-07; A-06 trong nhóm phối hợp | Đang có chia nhóm/lượt hoạt động                                           | Đóng các nhóm, về MAIN; kết thúc lượt ACTIVITY/countdown nếu có; mọi người tự bật mic phát biểu                                    | Giữ UC độc lập    |
| UC-GRP-11 | Đặt thời lượng lượt hoạt động               | A-07; A-06 theo dõi            | Có lượt ACTIVITY hợp lệ                                                    | Bắt đầu một countdown chung; người trong lượt xem thời gian và nhận nhắc hết giờ, host vẫn quyết định kết thúc                     | Giữ UC độc lập    |
| UC-GRP-12 | Hỗ trợ riêng một nhóm                       | A-07; A-06 nhóm đích phối hợp  | Nhóm còn mở; host được vào theo thao tác hỗ trợ                            | Vào có thông báo, trao đổi trong nhóm đích rồi rời hỗ trợ; không nghe mọi nhóm; quay lại hướng dẫn phải xác nhận scope mic khi cần | Giữ UC độc lập    |
| UC-GRP-13 | Thông báo hướng dẫn chung                   | A-07; A-06 nhận đúng audience  | Host ở scope hướng dẫn hợp lệ; kết thúc help/xác nhận chuyển scope khi cần | Thông báo tới MAIN/DISCUSSION theo policy; không tự phát sang ACTIVITY                                                             | Giữ UC độc lập    |

## TQ-06 · Cộng tác trên nội dung chia sẻ

Nguồn: [Board collaboration](board-collaboration.md), [quyền board](groups-media-policy.md), [nguồn theo nhóm](group-modes.md).

| Mã          | UC đề xuất                          | Actor               | Điều kiện chính                                                           | Kết quả người dùng                                                                                      | Quyết định review                               |
| ----------- | ----------------------------------- | ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| UC-BOARD-01 | Dừng hình để cộng tác               | A-06                | Có quyền board và nguồn share hợp lệ của context                          | Cùng scope dùng một frame chung; audio hợp lệ vẫn tiếp tục                                              | Giữ UC độc lập                                  |
| UC-BOARD-02 | Vẽ và chỉ dẫn trên nội dung chia sẻ | A-06                | Có quyền board/context hiện hành                                          | Vẽ/chỉ dẫn, undo nét mình, clear theo quyền và xác nhận; LIVE chỉ dẫn tạm, FROZEN giữ nét trong context | Giữ UC độc lập                                  |
| UC-BOARD-03 | Hoàn tác nét vẽ của mình            | A-06                | Còn quyền context, có nét của mình được phép undo                         | Bỏ nét gần nhất của mình; không xóa nét người khác                                                      | Đưa vào UC-BOARD-02: sửa nét bằng undo của mình |
| UC-BOARD-04 | Xóa nội dung vẽ trong ngữ cảnh      | A-06 có quyền clear | Có quyền clear theo chủ frame/chủ nguồn hoặc host được phép trong context | Sau xác nhận, xóa nét của context theo quyền; không xóa tùy ý board nhóm khác                           | Đưa vào UC-BOARD-02: clear có quyền và xác nhận |
| UC-BOARD-05 | Trở lại hình trực tiếp              | A-06                | Có quyền board/context                                                    | Bỏ lớp frame/nét cũ để thấy nguồn hiện tại; không tua lại, báo rõ nếu nguồn đã dừng                     | Giữ UC độc lập                                  |

## Truy vết yêu cầu xuyên suốt và điểm mở

| Nội dung                                                  | UC/luồng sở hữu                                        | Cách thể hiện                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Refresh/hết hạn/thu phiên                                 | UC-ACC-02/03 và UC đang dùng quyền                     | Gia hạn là xử lý phiên; hết quyền ngừng truy cập, không include Đăng nhập vào mọi UC                                                             |
| REC-01, PB-11                                             | UC-LIVE-01 và các UC media/chat/group/board được giữ   | Nhánh mất mạng, reconnect và lấy trạng thái hiện hành; không thêm miền Reconnect ngang mức TQ                                                    |
| Host tự có khi bắt đầu                                    | UC-LIVE-01                                             | Nhánh tạo phiên mới; vào phiên đã có không lấy host                                                                                              |
| Host tạm khi mất mạng và tự hoàn quyền                    | Luồng điều hành TQ-05, liên quan UC-LIVE-01, UC-GRP-01 | Sự kiện hệ thống sau grace; ngẫu nhiên participant hợp lệ rồi tự hoàn quyền khi người cũ quay lại hợp lệ; không cần nút tự nhận host/UC xin host |
| Host chủ động rời, nhiều sự cố hoặc host tạm chuyển quyền | UC-LIVE-02, UC-GRP-01 và nhánh phục hồi                | Còn mở tại nguồn; chưa vẽ kết quả tự động cụ thể                                                                                                 |
| FILE-01                                                   | UC-MSG-01/04/06/08, UC-LIVE-08/09, UC-BOARD-01         | Upload/bind là bước gửi/chụp; Workspace cho file, meeting chỉ ảnh, frame freeze tạm khác attachment gửi vào chat                                 |
| Lịch sử DM sau rời rồi được mời lại Workspace             | UC-MSG-04/05/08                                        | Chưa chốt; không tự phục hồi lịch sử chỉ theo userId                                                                                             |
| Channel RESTRICTED                                        | UC-WS-12, mọi UC truy cập kênh                         | Dùng quyền allowlist theo baseline; chưa tự thêm UI/quy trình quản trị quyền nhiều tầng                                                          |
| Countdown hết giờ                                         | UC-GRP-11                                              | Nhắc hết giờ; không include hoặc tự gọi UC-GRP-10                                                                                                |
| Phát biểu sau chia nhóm                                   | UC-GRP-10 rồi UC-LIVE-04                               | Tự bật mic tại MAIN; không lời mời floor/consent hoặc công bố board nhóm                                                                         |

Người nhận tin/tham gia nhóm được ghi là actor phối hợp khi cần làm rõ tương tác; các bảng không có nghĩa mọi UC cần hai actor hoặc backend trở thành actor. Host tạm dùng cùng actor A-07, host bị mất mạng dùng cùng danh tính người dùng; không tạo loại tài khoản mới.

## Quan hệ và cách tách sơ đồ đề xuất

- TQ là sơ đồ tổng quan; danh mục chi tiết là các góc nhìn dưới miền. Không nối include từ TQ tới mọi UC trong miền.
- Chưa gán include/extend/generalization trong danh mục. Cần đọc luồng chính và nhánh trước, không dùng extend để diễn đạt thứ tự hoặc phân quyền.
- Duyệt DISCUSSION và vào DISCUSSION là hai mục tiêu ở thời điểm khác nhau: đã duyệt là tiền điều kiện vào, không bắt UC vào thực thi lại UC duyệt.
- Nhắn Host không include hỗ trợ nhóm: tin nhắn không tự đưa host vào nhóm. Hỗ trợ cũng không bắt buộc phải có tin nhắn trước nếu nguồn không yêu cầu.
- Vẽ không bắt buộc include dừng hình vì LIVE có chỉ dẫn tạm; dừng hình không bắt buộc người dùng phải vẽ. Resume không include bắt đầu share.
- TQ-02 có thể tách ba sơ đồ chi tiết: Workspace, thành viên/lời mời, kênh. TQ-05 có thể tách host/hỗ trợ, DISCUSSION, ACTIVITY. Đây là bố cục xem mô hình, không thêm tầng UC hoặc miền sản phẩm mới.
- Không dồn toàn bộ danh mục lên một hình. Mỗi sơ đồ dùng một mức chính, chỉ thêm UC dùng chung/mở rộng khi có quan hệ thật sự cần diễn đạt. Danh mục dùng chung giữ mã nhất quán nếu UC xuất hiện lại ở nhiều góc nhìn.

## Đề nghị review và đặc tả tiếp theo

Review các quyết định giữ/gộp theo lý do tại [bản review](use-case-review.md); đặc biệt các UC cấu hình/CRUD nhỏ được giữ tạm vì có kết quả riêng. UC-LIVE-08/09 gom gửi/đọc theo audience; UC-GRP-05/06 tách chuẩn bị/bắt đầu; UC-GRP-12 gom vòng hỗ trợ. Đây là lựa chọn mô hình hóa còn có thể chỉnh; không phải chức năng được tự thêm.

Sau review danh mục, đặc tả lần lượt: vào cuộc họp/host; yêu cầu–duyệt–vào DISCUSSION; chuẩn bị–bắt đầu–kết thúc ACTIVITY; share theo scope; freeze/vẽ/resume; chat Everyone/Host và hỗ trợ. Mỗi đặc tả có trigger, actor chính/phối hợp, tiền điều kiện, luồng chính, nhánh thay thế/lỗi, hậu điều kiện và nguồn quy tắc. Khi đủ luồng mới chốt quan hệ và dựng sơ đồ Astah; chưa tạo file Astah ở bước này.

## Xác nhận sau review

Người dùng đã đồng ý phần review và chỉnh sửa: actor chung cho đăng nhập, nhóm truy cập trực tiếp trên tổng quan, 5 miền nghiệp vụ TQ-02…06 và danh mục 43 UC nghiệp vụ + 3 UC truy cập chung; 7 mục gộp vẫn được giữ chức năng trong luồng sở hữu. Đây là baseline phân tích UC, không xác nhận feature đã triển khai. Quan hệ include/extend, luồng đặc tả, layout và file Astah chưa được chốt; các điểm nghiệp vụ còn mở tại nguồn vẫn giữ nguyên.
