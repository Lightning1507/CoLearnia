# HS-01 · Vào cuộc họp và phục hồi vai trò host

**Trạng thái:** bản 3 cập nhật quy tắc host được người dùng chốt ngày 01/11/2026; các luồng khác giữ baseline bản 2 ngày 29/10. Đây là đặc tả đích, chưa phải code đã chạy. [Quy ước chung](README.md). Nguồn: [live session 6.1, 8.3, 11](../live-session.md), [policy](../groups-media-policy.md), [scope](../scope.md).

## Thông tin UC

| Thuộc tính     | Nội dung                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| UC trọng tâm   | UC-LIVE-01 · Vào cuộc họp                                                                                                                        |
| Mục tiêu       | Thành viên vào đúng phiên LIVE và nhận nguồn được phép; người bắt đầu phiên mới trở thành host                                                   |
| Actor chính    | A-03 · Thành viên Workspace có quyền kênh LIVE                                                                                                   |
| Actor phối hợp | A-03 đang trong phiên; A-07 khi tham gia nhánh bàn giao/khôi phục host                                                                           |
| Trigger        | Thành viên chọn tham gia kênh LIVE                                                                                                               |
| Tiền điều kiện | Đã đăng nhập; Workspace/kênh LIVE còn tồn tại; có membership và quyền kênh hiện hành. Không bắt buộc đã cho phép mic/camera hoặc đã có phiên gọi |
| Thành công     | Actor tham gia đúng một phiên hợp lệ với vai trò/scope được xác lập; thiết bị và nội dung đúng lựa chọn/quyền                                    |

## Luồng chính — UC-LIVE-01

1. Thành viên mở kênh LIVE mình được truy cập và chọn tham gia.
2. Hệ thống hiển thị bước chuẩn bị thiết bị; người dùng chọn mic/camera và trạng thái mong muốn. Việc xin quyền thiết bị gắn với thao tác người dùng.
3. Người dùng xác nhận vào cuộc họp.
4. Hệ thống kiểm lại phiên truy cập, membership, quyền kênh và tình trạng cuộc gọi đang dùng của tài khoản.
5. Nếu đã có LiveSession hợp lệ tại kênh, hệ thống cho tham gia phiên đó với tư cách người tham gia; nếu chưa có, tạo một phiên và gán người bắt đầu làm host. Hai người vào cùng lúc không tạo hai phiên hoặc hai host.
6. Hệ thống hoàn tất tham gia, hiển thị phòng chung MAIN, vai trò và danh sách/nội dung theo quyền hiện hành. Không tự phân vào ACTIVITY hoặc vào DISCUSSION chỉ vì có tên trong danh sách hợp lệ; việc vào/chuyển nhóm theo HS-02/03.
7. Người dùng nghe/xem các nguồn MAIN được phép; mic/camera chỉ hoạt động theo lựa chọn được người dùng cho phép. Giao diện thể hiện rõ thiết bị, scope và trạng thái kết nối.

## Nhánh thay thế và lỗi khi tham gia

| Mã nhánh  | Điểm rẽ | Tình huống                                                   | Phản hồi / kết quả                                                                                                                                     | Tiếp tục / kết thúc                                                                                                                 |
| --------- | ------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| HS-01-E01 | 2       | Từ chối thiết bị, thiếu mic/camera hoặc thiết bị lỗi         | Thông báo thiết bị không khả dụng, vẫn cho phép vào để nghe/xem nếu còn quyền; không báo lỗi thiết bị thành lỗi quyền kênh                             | Tiếp tục bước 3 với thiết bị bị từ chối ở trạng thái không khả dụng; không bắt cấp lại quyền để vào xem.                            |
| HS-01-E02 | 2–3     | Người dùng hủy                                               | Không hoàn tất tham gia; dọn phần thiết bị/tài nguyên đang chuẩn bị của thao tác đó                                                                    | Kết thúc UC vào cuộc họp, không thành công; muốn tham gia phải bắt đầu lại bước 1.                                                  |
| HS-01-E03 | 4       | Hết phiên đăng nhập, mất membership hoặc không có quyền kênh | Từ chối, yêu cầu xác thực lại khi phù hợp; không trả nội dung phiên riêng                                                                              | Kết thúc không thành công; sau khi có phiên/quyền hợp lệ, người dùng có thể bắt đầu lại bước 1.                                     |
| HS-01-E04 | 4       | Tài khoản đang có cuộc gọi khác                              | Báo đang có cuộc gọi, yêu cầu người dùng chủ động xác nhận chuyển; nếu hủy giữ cuộc gọi cũ; nếu đồng ý thu cuộc gọi cũ trước khi hoàn tất tham gia mới | Nếu hủy: kết thúc lần vào mới, giữ cuộc gọi cũ. Nếu xác nhận chuyển: tiếp tục bước 5 sau kiểm tra hiện hành.                        |
| HS-01-E05 | 5       | Phiên đang kết thúc hoặc kênh bị xóa trong lúc vào           | Không gắn vào phiên đã mất hiệu lực; thông báo trạng thái và chỉ cho thử lại theo quyền hiện tại, không tự phục hồi phiên cũ                           | Kết thúc lần vào không thành công; người dùng chỉ bắt đầu lại bước 1 khi có phiên/kênh hợp lệ.                                      |
| HS-01-E06 | 5–7     | Hủy, timeout hoặc lỗi kết nối trong lúc tham gia             | Không báo đã vào thành công khi chưa hoàn tất; dọn phần tham gia/thiết bị đang chờ; lần thử lại không nhân participant/tài nguyên                      | Kết thúc lần vào không thành công và dọn phần chưa hoàn tất; thử lại là một lần vào mới từ bước 1.                                  |
| HS-01-E07 | Sau 7   | Mất kết nối ngắn                                             | Hiển thị reconnect; xác thực và đồng bộ vai trò, scope, nguồn hiện tại khi nối lại trong grace; không dùng dữ liệu cũ để mở lại quyền đã bị thu        | Đây là phục hồi sau khi UC vào đã hoàn tất: đồng bộ quyền hiện tại và tiếp tục cuộc họp; nếu không còn quyền thì kết thúc truy cập. |
| HS-01-E08 | Sau 7   | Mất kết nối quá grace                                        | Thu tài nguyên đời cũ; phải join lại theo quyền hiện tại. Không tự vào lại nhóm cũ hoặc tự bật share bằng cache                                        | Kết thúc kết nối đời cũ; người dùng thực hiện lại bước 1 để join, không resume nhóm/quyền cũ.                                       |
| HS-01-E09 | Mọi lúc | Server restart, worker chết hoặc phiên đã kết thúc           | Không resume runtime đời cũ; báo mất phiên, cho tham gia phiên mới khi có quyền; không bảo đảm giữ nét runtime cũ                                      | Kết thúc truy cập phiên cũ; chỉ bắt đầu lại bước 1 khi có phiên hợp lệ, không quay về trạng thái runtime cũ.                        |

Grace tham gia theo baseline hiện tại tối đa 30 giây từ disconnect/control lease hết hạn; đây là cấu hình kỹ thuật cần kiểm chứng, không một đồng hồ UI do từng máy tự quyết định.

## Nhánh vai trò host liên quan

Những nhánh này bổ sung quy tắc xuyên suốt khi tham gia/reconnect, không tạo UC “tự nhận host” và không thay thế toàn bộ UC-GRP-01 chuyển host chủ động.

| Trường hợp                                     | Luồng đã chốt                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Người đầu tiên bắt đầu phiên                   | Nhận host cùng việc tạo LiveSession; owner/admin không được ưu tiên vượt quy tắc này                                                                                                                                                                         |
| Host chuyển quyền chủ động                     | Host chọn người đang kết nối/còn quyền trong phiên; kiểm lại actor/target/revision rồi chuyển ngay, không chờ người nhận chấp nhận. Target stale thì từ chối thao tác; không phát sinh lời mời chờ. Đây là UC-GRP-01 riêng, không bắt mọi lần join thực hiện |
| Host mất mạng trong reconnect grace            | Quyền kết nối cũ đã bị thu và host tạm đã được chọn; grace chỉ giữ ownership để nối lại, không giữ quyền thực thi host cũ                                                                                                                                    |
| Phát hiện host mất kết nối, có ứng viên hợp lệ | Thu quyền kết nối cũ, chọn ngẫu nhiên một participant đang kết nối/còn quyền làm host tạm, thông báo cho phòng; không cần người được chọn bấm chấp nhận                                                                                                      |
| Host bị mất mạng quay lại                      | Xác thực đúng danh tính, cùng phiên còn hoạt động và còn quyền; tự thu quyền host tạm rồi hoàn quyền người cũ. Nếu đã quá grace thì đi qua join lại, không dùng resume cũ                                                                                    |

Chỉ một host có quyền điều hành tại một thời điểm. Chuyển/hoàn host thu help/announcement cũ trước; không tự bật mic/camera, đóng nhóm/reset countdown hoặc dừng MAIN share còn hợp lệ chỉ vì đổi vai trò. Không khôi phục role sang LiveSession mới hoặc cho người đã mất quyền kênh. Tin riêng gửi host cũ không tự chuyển lịch sử sang host tạm/mới.

**Chủ động rời:** host còn quyền chọn kết thúc thì đóng phiên cho mọi người (UC-LIVE-10); nếu đã bàn giao chính thức thì rời như thành viên (UC-LIVE-02). UI không dùng một nút “Rời” mơ hồ cho hành vi kết thúc toàn phiên. Rời hỗ trợ về MAIN độc lập với rời cuộc họp. Mất mạng không tự kết thúc như một lệnh rời chủ động.

**Bàn giao chính thức khác thay tạm:** không tự hoàn quyền cho người trước bàn giao khi họ vào lại; nếu host tạm bàn giao chính thức thành công thì lần bàn giao này thay đích hoàn quyền của sự cố trước.

**Còn mở:** không có ứng viên hợp lệ; host tạm cũng mất mạng. Không tự chọn chuỗi kế vị, đồng host hoặc ưu tiên giáo viên/owner/admin cho các nhánh này.

## Hậu điều kiện

- **Thành công:** participant và quyền hiện hành được xác lập; vai trò host đúng quy tắc; không nghe/xem nhóm chưa được phép vào.
- **Bảo đảm khi thất bại:** không còn quyền/media mới bị bỏ quên từ lần join không hoàn tất; không cướp quyền host hoặc call của kết nối khác bằng request cũ.
- Danh sách nhóm/roster có thể được xem theo projection nhưng không đồng nghĩa đã được đọc nội dung private. Cấu hình tạo phiên và xử lý hủy join phải giữ nguyên tắc một phiên/host, không dựng thêm quy tắc nghiệp vụ về host khi không có người hợp lệ.

## Ghi chú kỹ thuật cho dev

Join ticket, callGeneration, control lease và cleanup tài nguyên thực hiện theo live-session; không là thao tác bổ sung người dùng phải làm. Nhánh tạo phiên mới và nhánh nối lại đều phải kiểm danh tính/quyền hiện hành, không coi nhãn host ở giao diện là nguồn cấp quyền.

## Lợi ích và yêu cầu chất lượng liên quan

Thành viên cần vào đúng phiên, biết trạng thái thiết bị và không mất quyền riêng tư do reconnect; host cần vai trò điều hành nhất quán.

Tham chiếu [quality scenarios của technical plan](../../technical-plan.md#142-quality-scenarios): Q-01 (join), Q-06 (reconnect). Đây là mục tiêu thử trong baseline, chưa là SLA hoặc số đo đã đạt; điều kiện đo và workload lấy tại nguồn, không tự tăng lên lớp 40–50 người.

## Ca review / nghiệm thu cần có

1. Hai người bắt đầu cùng lúc: một phiên, một host; người vào sau không giành host.
2. Từ chối camera/mic vẫn vào xem; không tự bật thiết bị khi nhận host.
3. Đang gọi nơi khác: hủy/đồng ý chuyển cho kết quả đúng, không nhân cuộc gọi.
4. Chuyển host trực tiếp: target không cần chấp nhận; actor/target stale bị chặn, chỉ một host sau commit. Host còn quyền chủ động rời kết thúc toàn phiên; người đã bàn giao rời chỉ ảnh hưởng bản thân. Race bàn giao/kết thúc kiểm đúng role/revision.
5. Quyền kênh bị thu trong lúc join/reconnect: không nhận private hoặc khôi phục scope cũ.
6. Host rớt ngắn, rớt quá grace và quay lại: đúng host tạm/hoàn quyền; lệnh stale bị từ chối, không reset nhóm/countdown.
