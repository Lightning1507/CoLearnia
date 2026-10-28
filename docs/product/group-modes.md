# Phòng chung và hai chế độ nhóm trong LIVE

**Trạng thái:** thiết kế đã điều chỉnh theo xác nhận người dùng ngày 27/10/2026, baseline v2.3; chưa có code nghiệp vụ. Nguồn cho GRP-01/02, LIVE-03, BOARD-01/FREEZE-01, HELP-01 và TIMER-01. Các chi tiết được đánh dấu **chưa chốt** không được suy thành quyết định implementation.

## Ba bối cảnh

| Bối cảnh                   | Ai khởi tạo / tham gia                                                                | Nguồn hình và tiếng                                                                                              | Quyền share                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| MAIN · Phòng chung         | Participant có quyền phiên và đang ở MAIN                                             | Mic/camera/chat/board phòng chung                                                                                | Tối đa một người share tại MAIN. Mọi participant ở MAIN tự share khi nguồn trống, không xin host; nguồn bận thì chờ, không giành     |
| DISCUSSION · Nhóm trao đổi | Thành viên xin tạo, host duyệt; yêu cầu có tên, mục đích và danh sách người được chọn | Kế thừa screen/screen audio và tiếng giảng host từ MAIN; mic/camera/chat/board của thành viên riêng trong nhóm   | Thành viên không được publish screen/screen audio riêng. UI ẩn nút share và server từ chối cả request tự tạo                         |
| ACTIVITY · Nhóm hoạt động  | Host tạo/phân người để tổ chức hoạt động nhóm                                         | Mic/camera/chat/board và screen nhóm hoạt động độc lập với MAIN và nhóm khác; không mặc định nhận bài giảng MAIN | Mọi thành viên nhóm được tự bấm share, không cần host duyệt; mỗi nhóm một nguồn đang share, người khác chờ dừng. Board dùng nguồn đó |

MAIN và mỗi ACTIVITY có một nguồn share đang hoạt động riêng, không phải một khóa share toàn LiveSession. Đây là hai quy tắc đã được người dùng xác nhận độc lập. Screen nhóm hoạt động chỉ tới audience nhóm đó/host đang hỗ trợ có quyền, không tự đưa ra MAIN. Một Router/LiveSession vẫn là hướng PoC; isolation phải do policy kiểm, không cần biến mỗi nhóm thành một Workspace/channel hoặc ứng dụng riêng.

## Yêu cầu tạo nhóm trao đổi — GRP-01

1. Participant đang có quyền LIVE gửi yêu cầu gồm **tên nhóm, mục đích, các thành viên muốn tham gia**. Người gửi không tự chọn ACTIVITY hoặc cấp quyền share bằng payload/mục đích.
2. Host xem, duyệt hoặc từ chối; server kiểm lại host, phiên và danh sách người hiện còn hợp lệ tại thời điểm xử lý. Chưa được duyệt thì chưa có membership/fanout riêng hoặc quyền đọc board nhóm.
3. Sau host duyệt, những người trong danh sách được chấp thuận thấy nút **Vào nhóm**; mỗi người chủ động bấm. Không tự chuyển người được chọn. Người ngoài danh sách không tự vào. Danh sách được duyệt chỉ là điều kiện vào, chưa cấp quyền nghe/đọc private cho người chưa bấm vào; server xác lập membership khi join hợp lệ.
4. Nhóm nhận bài giảng MAIN nhưng có board riêng để cùng freeze/vẽ. Âm lượng tiếng giảng và trao đổi được chỉnh cục bộ; không mute/duck để giả việc thu quyền.

**Chi tiết còn cần thiết kế trong task:** sửa/hủy/hết hạn request và giới hạn tên/mục đích/số thành viên. Không thêm cơ chế người ngoài danh sách xin gia nhập, chuyển mode tại chỗ hoặc chuỗi lời mời riêng nếu chưa được yêu cầu. Luồng vào bằng nút và việc hai mode không hoạt động đồng thời đã chốt; không hỏi lại chúng như điểm mở.

## Nhóm hoạt động do host tổ chức — GRP-01/02

- Host tạo nhóm ACTIVITY và phân thành viên; người chưa phân vẫn ở MAIN. A và B làm việc độc lập. Mọi thành viên đang ở nhóm có thể bấm **Chia sẻ màn hình** ngay, không gửi yêu cầu cho host và không cần host cấp share grant riêng.
- Host không tự nghe/xem mọi nhóm. Host vào hỗ trợ một nhóm có thông báo và chỉ được đọc/nhận nội dung nhóm đang hỗ trợ. Khi sang nhóm khác, thu quyền nhóm cũ trước.
- Người ở ACTIVITY không tự nhận screen, mic/camera host hoặc announcement audio từ MAIN. Host trong nhóm hỗ trợ được xem/nghe trong scope hỗ trợ; không dùng role host để cấp đường nhận xuyên scope thường trực.
- Mỗi ACTIVITY có tối đa một người/nguồn screen đang hoạt động; screen audio nếu hỗ trợ đi kèm nguồn đó. Người khác phải chờ nguồn hiện tại dừng, không giành/tắt share của bạn chỉ bằng bấm share. Hai nhóm A/B có thể share đồng thời độc lập.
- Server giữ chỗ nguồn theo group một cách nguyên tử để xử lý hai cú bấm cùng lúc. Đây là kiểm tra tài nguyên/ACL tự động, **không phải xin host duyệt**. Khi nguồn bận, UI báo người đang share; nếu request tự tạo vẫn phải bị chặn.
- Freeze/vẽ trên nguồn screen hiện hành của chính nhóm. Khi nguồn dừng hoặc đổi, invalidate intent/live overlay đúng revision; frame FROZEN đã chốt vẫn theo lifecycle board. Không tự fallback về screen MAIN; hết nguồn hợp lệ hiển thị chưa có nguồn.

## Hai giai đoạn không chồng nhau

- **Giai đoạn giảng:** có MAIN và có thể mở DISCUSSION đã được host duyệt. Chưa có ACTIVITY đang hoạt động; host có thể chuẩn bị danh sách nhóm hoạt động mà chưa chuyển người.
- **Bắt đầu lượt hoạt động:** host kết thúc các DISCUSSION trước, thu quyền/media/board/chat cũ rồi đưa người vào các ACTIVITY đã phân. Không biến DISCUSSION cũ thành ACTIVITY và không nhập board/chat cũ sang nhóm mới.
- **Trong lượt ACTIVITY:** chưa nhận request DISCUSSION mới; approval/join từ request cũ cũng phải bị chặn theo phase hiện tại. Người xong sớm về MAIN không được mở DISCUSSION mới khi lượt hoạt động còn đang diễn ra.
- **Kết thúc lượt:** host chủ động kết thúc, đưa tất cả về MAIN, đóng ACTIVITY/countdown và trở về giai đoạn giảng; lúc đó mới cho xin DISCUSSION trở lại. Countdown hết giờ không tự đổi phase hoặc đóng nhóm.
- Snapshot sau reconnect phải thể hiện phase hiện tại. Bắt đầu/kết thúc lượt được serialize và kiểm quyền host; event/request chậm không tái tạo mode cũ.

## Chủ động về phòng chung và kết thúc — GRP-01

- Thành viên có nút **Về phòng chung**, chỉ chuyển chính mình về MAIN; không thoát LIVE hoặc kéo cả nhóm theo. Mic người chuyển được pause để tự bật lại; UI thông báo phạm vi camera/mic mới. Camera đang bật không bị hệ thống tự bật thêm thiết bị.
- Thu Consumer, fanout, board/chat/file access và screen publish nhóm cũ trước khi cấp scope MAIN. Nếu chính người rời đang share trong ACTIVITY, đóng nguồn share và mọi pending operation liên quan.
- Người rời không tiếp tục đọc lịch sử/ảnh nhóm. Được chuyển về MAIN không cấp quyền board/chat của các nhóm khác. Không tự cấp lại quyền nhóm khi reconnect; vào bằng nút phải kiểm lại danh sách được duyệt, phase và quyền hiện hành; không thêm danh sách phòng mở để tự chọn nhóm bất kỳ.
- Host có thể đóng một nhóm hoặc **Đưa tất cả về phòng chung**. Đóng nhóm khóa private history, hủy intent/share và dọn refs; không công bố/ghép board nhóm vào MAIN. CloseAll giữ vai trò host; không có chuyển chế độ cuộc họp.

## Thời lượng chung cho lượt hoạt động — TIMER-01

Người dùng đã chọn bản đầu **một thời lượng chung, đếm ngược và nhắc hết giờ; host quyết định kết thúc**. Áp dụng cho một lượt nhóm ACTIVITY do host tổ chức. Không mặc định gắn đồng hồ chung vào các DISCUSSION được xin mở giữa bài giảng.

- Host đặt thời lượng và bắt đầu lượt đếm; mọi nhóm trong lượt nhìn cùng thời gian còn lại. Không có đồng hồ riêng từng nhóm hoặc đồng hồ cá nhân trong scope này.
- Server giữ roundId/deadline và trạng thái RUNNING/EXPIRED/CANCELLED trong runtime; client hiển thị từ deadline kèm mốc thời gian server, không tự cho mỗi máy quyết định hết giờ bằng bộ đếm riêng.
- Hết giờ chỉ hiện nhắc, giữ nhóm hoạt động; **không tự close/move/mute hoặc thu share**. Host bấm kết thúc khi phù hợp. Một người về MAIN sớm không hủy đồng hồ của người còn lại.
- Reconnect lấy round/deadline hiện tại, không reset thời gian hoặc phát nhắc hết giờ lặp vô hạn. Đóng lượt/phiên hủy countdown đang chạy; server restart không phục hồi vòng media cũ.
- Schema, giới hạn duration và thao tác sửa/gia hạn/tạm dừng chưa chốt; không tự thêm các controls đó. Không thêm collection timer bền vững hoặc một bộ đồng hồ đa mục đích.

## Kiểm chứng và điểm cần chốt trước implementation

- MAIN: hai người tranh lease, chỉ một nguồn thắng; browser Stop/rời/revoke dọn đúng nguồn.
- DISCUSSION: request thiếu mục đích/sai thành viên hoặc chưa duyệt không cấp quyền; publish screen bị chặn dù giả client; vẫn nhận MAIN screen/tiếng giảng; nét/chat/mic không sang nhóm khác.
- ACTIVITY: nhận đúng nguồn của nhóm; không nhận MAIN/các nhóm khác bằng endpoint, Consumer hay metadata. Test hai người trong cùng nhóm tranh nguồn: chỉ một thắng, không giành share; A/B share đồng thời độc lập; không cần host approval; board theo nguồn nhóm.
- Vào nhóm: người được chọn phải bấm; chưa vào hoặc ngoài danh sách không được nhận private. Chuyển sang ACTIVITY khóa request/approval/join DISCUSSION cũ.
- Leave/close/reconnect: thu quyền cũ, đóng screen của người rời, không mở lại scope cũ; hết giờ không tự kết thúc nhóm.
- Profile media phải đo cả DISCUSSION kế thừa và ACTIVITY có screen riêng. Chưa có số đo cho phép khẳng định capacity sau mở rộng này; PoC/ADR vẫn Proposed tới khi có evidence.

**Xác nhận sau review 27/10:** giữ chỗ/lease ở server là chi tiết kỹ thuật chống tranh nguồn; UI ACTIVITY không có bước xin host share. Các quyết định share, vào nhóm và hai phase ở trên thay toàn bộ ghi chú “chưa chốt” tương ứng trong bản v2.3 trước lượt xác nhận này.
