# Phòng chung và hai chế độ nhóm trong LIVE

**Trạng thái:** thiết kế đã điều chỉnh theo xác nhận người dùng ngày 27/10, cập nhật TIMER-01 ngày 29/10 và vòng đời request/duration ngày 01/11/2026, baseline v2.3; chưa có code nghiệp vụ. Nguồn cho GRP-01/02, LIVE-03, BOARD-01/FREEZE-01, HELP-01 và TIMER-01. Các chi tiết được đánh dấu **chưa chốt** không được suy thành quyết định implementation.

## Ba bối cảnh

| Bối cảnh                   | Ai khởi tạo / tham gia                                                                | Nguồn hình và tiếng                                                                                              | Quyền share                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| MAIN · Phòng chung         | Participant có quyền phiên và đang ở MAIN                                             | Mic/camera/chat phòng chung; chỉ host vẽ LIVE, không freeze                                                      | Tối đa một người share tại MAIN. Mọi participant ở MAIN tự share khi nguồn trống, không xin host; nguồn bận thì chờ, không giành     |
| DISCUSSION · Nhóm trao đổi | Thành viên xin tạo, host duyệt; yêu cầu có tên, mục đích và danh sách người được chọn | Kế thừa screen/screen audio và tiếng giảng host từ MAIN; mic/camera/chat/board của thành viên riêng trong nhóm   | Thành viên không được publish screen/screen audio riêng. UI ẩn nút share và server từ chối cả request tự tạo                         |
| ACTIVITY · Nhóm hoạt động  | Host tạo/phân người để tổ chức hoạt động nhóm                                         | Mic/camera/chat/board và screen nhóm hoạt động độc lập với MAIN và nhóm khác; không mặc định nhận bài giảng MAIN | Mọi thành viên nhóm được tự bấm share, không cần host duyệt; mỗi nhóm một nguồn đang share, người khác chờ dừng. Board dùng nguồn đó |

MAIN và mỗi ACTIVITY có một nguồn share đang hoạt động riêng, không phải một khóa share toàn LiveSession. Đây là hai quy tắc đã được người dùng xác nhận độc lập. Screen nhóm hoạt động chỉ tới audience nhóm đó/host đang hỗ trợ có quyền, không tự đưa ra MAIN. Một Router/LiveSession vẫn là hướng PoC; isolation phải do policy kiểm, không cần biến mỗi nhóm thành một Workspace/channel hoặc ứng dụng riêng.

## Yêu cầu tạo nhóm trao đổi — GRP-01

1. Participant đang có quyền LIVE gửi yêu cầu gồm **tên nhóm, mục đích, các thành viên muốn tham gia**. Người gửi không tự chọn ACTIVITY hoặc cấp quyền share bằng payload/mục đích.
2. Host xem, duyệt hoặc từ chối; server kiểm lại host, phiên và danh sách người hiện còn hợp lệ tại thời điểm xử lý. Chưa được duyệt thì chưa có membership/fanout riêng hoặc quyền đọc board nhóm.
3. Sau host duyệt, những người trong danh sách được chấp thuận thấy nút **Vào nhóm**; mỗi người chủ động bấm. Không tự chuyển người được chọn. Người ngoài danh sách không tự vào. Danh sách được duyệt chỉ là điều kiện vào, chưa cấp quyền nghe/đọc private cho người chưa bấm vào; server xác lập membership khi join hợp lệ.
4. Nhóm nhận bài giảng MAIN nhưng có board riêng để cùng freeze/vẽ. Âm lượng tiếng giảng và trao đổi được chỉnh cục bộ; không mute/duck để giả việc thu quyền.

**Vòng đời và giới hạn đã chốt ngày 01/11:** người gửi được hủy yêu cầu còn chờ; không sửa yêu cầu đã gửi, muốn đổi thì hủy rồi gửi lại. Yêu cầu chờ mất hiệu lực khi bắt đầu ACTIVITY hoặc kết thúc phiên; không có TTL theo phút. Sau duyệt không dùng thao tác hủy pending để đóng nhóm. Tên tối đa 80 ký tự, mục đích tối đa 500 ký tự; danh sách không trùng người và chỉ gồm participant hợp lệ đang trong cùng phiên. Không thêm cap số người riêng ngoài capacity phiên. Hủy và duyệt đồng thời phải có một kết quả cuối cùng, không tạo nhóm từ yêu cầu đã hủy. Không thêm cơ chế người ngoài danh sách xin gia nhập, chuyển mode tại chỗ hoặc chuỗi lời mời riêng nếu chưa được yêu cầu. Luồng vào bằng nút và việc hai mode không hoạt động đồng thời đã chốt; không hỏi lại chúng như điểm mở.

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
- **Bắt đầu lượt lỗi sau khi đã chuyển một phần:** hủy lượt chưa hoàn tất, thu quyền/media/chat/board của các ACTIVITY vừa mở, hủy countdown đã gắn với lượt và đưa người còn quyền về MAIN; mic người từ nhóm về được pause theo policy. Không khôi phục DISCUSSION đã đóng. Hiển thị đang hủy cho tới khi cleanup hoàn tất; khi đã hủy thì về phase giảng, host có thể xem lại cấu hình còn hợp lệ và chủ động bắt đầu lượt mới. Không tự retry hoặc giữ một phần ACTIVITY chạy tiếp như lượt thành công.
- **Trong lượt ACTIVITY:** chưa nhận request DISCUSSION mới; approval/join từ request cũ cũng phải bị chặn theo phase hiện tại. Người xong sớm về MAIN không được mở DISCUSSION mới khi lượt hoạt động còn đang diễn ra.
- **Kết thúc lượt:** khi deadline server đến hạn, hệ thống tự kết thúc lượt, đóng mọi ACTIVITY của lượt, đưa người còn quyền về MAIN và trở về giai đoạn giảng sau cleanup; lúc đó mới cho xin DISCUSSION trở lại. Không chờ host quyết định hoặc xác nhận. Không giữ thao tác host kết thúc riêng một ACTIVITY hoặc kết thúc lượt thủ công trong scope hiện tại.
- Snapshot sau reconnect phải thể hiện phase hiện tại. Bắt đầu lượt được serialize và kiểm quyền host; kết thúc tự động được serialize theo đúng round/deadline hiện hành; event/request chậm không tái tạo mode cũ.

## Chủ động về phòng chung và kết thúc — GRP-01

- Thành viên có nút **Về phòng chung**, chỉ chuyển chính mình về MAIN; không thoát LIVE hoặc kéo cả nhóm theo. Mic người chuyển được pause để tự bật lại; UI thông báo phạm vi camera/mic mới. Camera đang bật không bị hệ thống tự bật thêm thiết bị.
- Thu Consumer, fanout, board/chat/file access và screen publish nhóm cũ trước khi cấp scope MAIN. Nếu chính người rời đang share trong ACTIVITY, đóng nguồn share và mọi pending operation liên quan.
- Người rời không tiếp tục đọc lịch sử/ảnh nhóm. Được chuyển về MAIN không cấp quyền board/chat của các nhóm khác. Không tự cấp lại quyền nhóm khi reconnect; vào bằng nút phải kiểm lại danh sách được duyệt, phase và quyền hiện hành; không thêm danh sách phòng mở để tự chọn nhóm bất kỳ.
- Host có thể đóng một hoặc tất cả **DISCUSSION** trong giai đoạn giảng; bắt đầu ACTIVITY cũng đóng các DISCUSSION trước. Với **ACTIVITY**, thành viên tự về sớm hoặc hệ thống đưa về khi hết thời lượng chung, không có thao tác host đóng riêng nhóm/kết thúc lượt thủ công. Đóng nhóm khóa private history, hủy intent/share và dọn refs; không công bố/ghép board nhóm vào MAIN, không đổi vai trò host.

## Thời lượng chung cho lượt hoạt động — TIMER-01

Quyết định cập nhật ngày 29/10/2026 thay cơ chế chỉ nhắc/chờ host: **một thời lượng chung; hết giờ hệ thống tự kết thúc lượt và đưa mọi người về MAIN**. Áp dụng cho một lượt nhóm ACTIVITY do host tổ chức. Không mặc định gắn đồng hồ chung vào các DISCUSSION được xin mở giữa bài giảng.

- Host thiết lập thời lượng chung khi tổ chức lượt; bắt đầu ACTIVITY thành công phải có countdown/deadline chung được xác lập. Mọi nhóm trong lượt nhìn cùng thời gian còn lại. Không có đồng hồ riêng từng nhóm hoặc đồng hồ cá nhân trong scope này.
- Server giữ roundId/deadline và trạng thái vòng đời lượt trong runtime; phân biệt đang kết thúc với đã cleanup xong, enum cụ thể thiết kế theo task; client hiển thị từ deadline kèm mốc thời gian server, không tự cho mỗi máy quyết định hết giờ bằng bộ đếm riêng.
- Khi đến deadline, server chặn thao tác mới vào scope ACTIVITY cũ, kết thúc hỗ trợ liên quan, thu media/share/chat/board của các nhóm và đưa người còn quyền về MAIN. Mic người từ nhóm về được pause để tự bật lại; không tự phát tiếng hỗ trợ ra MAIN do cleanup. Không công khai chat/board nhóm. Một người về MAIN sớm chỉ rời chính mình, không đóng nhóm hoặc hủy đồng hồ của người còn lại.
- Reconnect lấy round/deadline/phase hiện tại, không reset thời gian hoặc mở lại ACTIVITY đã hết giờ. Nếu deadline đã đến mà callback hết giờ chưa xử lý, server phải reconcile kết thúc lượt trước khi cấp lại scope nhóm. Callback cũ/lặp không kết thúc lượt mới; cleanup idempotent, chỉ báo kết thúc khi đã thu quyền và chuyển phạm vi xong. Đóng lượt/phiên hủy countdown đang chạy; server restart không phục hồi vòng media cũ.
- Thời lượng là số nguyên từ 1 đến 120 phút, host đặt trước khi bắt đầu. Bản đầu không sửa/gia hạn/tạm dừng khi lượt đang chạy. Schema và cách kiểm version/deadline chi tiết thiết kế theo task; không tự thêm các controls đó. Không thêm collection timer bền vững hoặc một bộ đồng hồ đa mục đích.

## Kiểm chứng và điểm cần chốt trước implementation

- MAIN: hai người tranh lease, chỉ một nguồn thắng; browser Stop/rời/revoke dọn đúng nguồn.
- DISCUSSION: request thiếu mục đích/sai thành viên hoặc chưa duyệt không cấp quyền; publish screen bị chặn dù giả client; vẫn nhận MAIN screen/tiếng giảng; nét/chat/mic không sang nhóm khác.
- ACTIVITY: nhận đúng nguồn của nhóm; không nhận MAIN/các nhóm khác bằng endpoint, Consumer hay metadata. Test hai người trong cùng nhóm tranh nguồn: chỉ một thắng, không giành share; A/B share đồng thời độc lập; không cần host approval; board theo nguồn nhóm.
- Vào nhóm: người được chọn phải bấm; chưa vào hoặc ngoài danh sách không được nhận private. Chuyển sang ACTIVITY khóa request/approval/join DISCUSSION cũ.
- Leave/close/reconnect: thu quyền cũ, đóng screen của người rời, không mở lại scope cũ; hết giờ tự kết thúc đúng lượt và về MAIN; kiểm callback trễ/lặp, reconnect sau deadline và host mất mạng không ngăn kết thúc tự động.
- Profile media phải đo cả DISCUSSION kế thừa và ACTIVITY có screen riêng. Chưa có số đo cho phép khẳng định capacity sau mở rộng này; PoC/ADR vẫn Proposed tới khi có evidence.

**Xác nhận sau review 27/10:** giữ chỗ/lease ở server là chi tiết kỹ thuật chống tranh nguồn; UI ACTIVITY không có bước xin host share. Các quyết định share, vào nhóm và hai phase ở trên thay toàn bộ ghi chú “chưa chốt” tương ứng trong bản v2.3 trước lượt xác nhận này.

**Làm rõ sau review UC ngày 29/10/2026:** host chủ động rời hỗ trợ về MAIN giữ trạng thái bật/tắt mic, không cần xác nhận mic riêng; tiếng ở phạm vi mới theo [policy](groups-media-policy.md#81-host-group-và-hỗ-trợ). Điều này khác thành viên thường tự về MAIN được pause mic và khác cleanup do mất mạng/đóng nhóm.
