# Ghi hình MAIN và xem lại — RECORD-01

**Quyết định sau kickoff ngày 02/11/2026:** bổ sung vào scope; trước đây recording ngoài phạm vi. Đây là yêu cầu thiết kế, chưa có pipeline hoặc bằng chứng ghi hình chạy thật. `RECORD-01` khác `REC-01` (reconnect).

## Mục tiêu và quyền

- Host hiện hành bắt đầu/dừng ghi. Người không còn giữ host không được điều khiển bằng lệnh cũ. UI thông báo rõ đang ghi cho người tham gia, kể cả người vào sau.
- Ghi màn hình chia sẻ, camera và âm thanh **MAIN** vào video xem lại. Chỉ nguồn được phép tại MAIN mới được vào bản ghi; không ghi media/chat/board riêng của DISCUSSION hoặc ACTIVITY.
- Host vào hỗ trợ ACTIVITY không làm recorder chuyển theo host: tiếng/camera hỗ trợ không vào bản ghi MAIN. Người chuyển khỏi MAIN phải được loại khỏi đầu vào ghi theo scope hiện hành; không dùng ẩn UI hoặc volume=0 thay ACL.
- Camera/mic tắt hoặc không có share là trạng thái hợp lệ; không tự bật thiết bị để ghi. Bộ nguồn được cập nhật khi người bật/tắt, rời hoặc chuyển phòng.
- Video gắn phiên LIVE và kênh gốc. Thành viên chỉ xem khi còn membership Workspace và quyền kênh LIVE hiện hành, kể cả PRIVATE. Biết ID/URL hoặc từng tham gia không đủ quyền; thu quyền phải chặn tiếp truy cập. Không công khai link video không kiểm quyền.

## Luồng và kết quả

Host chọn bắt đầu → server kiểm quyền và khả năng recorder → thông báo đang ghi → thu nguồn MAIN → host dừng hoặc phiên kết thúc → hoàn tất/xử lý tệp → video sẵn sàng để thành viên còn quyền xem. Không báo đã ghi khi capture chưa khởi động hoặc đã lỗi; chưa xử lý xong không hiển thị video là sẵn sàng. Lỗi ghi/lưu cần thông báo và không làm kết thúc cuộc gọi đang hoạt động. Dừng/đóng phải giải phóng tài nguyên và không nhân job/tệp khi retry.

## PoC và phần chưa chốt

### Vòng đời đã chốt ngày 03/11/2026

- Kiến trúc recorder đã chọn: Recording service M3 do app server quản lý, dùng quyền/state M4 để cấp context chỉ đọc MAIN gắn session/epoch/recording generation; độc lập với tab/layout/pin và volume nghe cục bộ của host. M3 quản lý capture/encode và bàn giao video cho storage M2. Pipeline đã chọn: mediasoup PlainTransport xuất RTP/RTCP nội bộ → GStreamer nhận/giải mã, ghép hình, trộn tiếng và encode/mux. Phiên bản/plugin, điều khiển pipeline động, clock/timestamp mapping, codec và ngân sách tài nguyên phải kiểm qua PoC; chưa có bằng chứng đồng bộ/capacity đạt.
- Recording gắn với phiên MAIN, độc lập với người bấm ghi. Chuyển DISCUSSION/ACTIVITY hoặc host vào hỗ trợ không dừng recording và không đưa media riêng của nhóm vào bản ghi.
- Chuyển/hoàn quyền host hợp lệ không dừng recording; host hiện hành có quyền dừng, host cũ không còn quyền điều khiển. Người bắt đầu ghi đã bàn giao host rồi rời LIVE hoặc mất kết nối không tự làm dừng bản ghi nếu phiên còn hoạt động; quay lại nhận trạng thái hiện hành, không cần bấm Record để nối tiếp.
- Host chưa bàn giao mà chủ động rời vẫn kết thúc phiên cho mọi người theo [live session](live-session.md#83-chuyển-host-và-host-mất-mạng), nên recording dừng theo phiên. Đóng tab/mất mạng theo disconnect/control lease/grace, không coi ngay là chủ động kết thúc. Phiên kết thúc do hết người theo lifecycle cũng dừng recording; không thêm bộ đếm người/nhánh kết thúc phiên riêng trong recorder.
- Bấm Dừng hoặc kết thúc phiên thì chốt đầu vào và hoàn tất video. Sau khi dừng, lần Record mới tạo recording ID/tệp mới; retry cùng ý định không tạo đoạn mới. Recorder lỗi vẫn báo lỗi/cleanup, không tự mở bản ghi mới.
- Bố cục ghi khi có share MAIN: nội dung trình chiếu ở vùng chính, camera người đang nói tại MAIN ở ô bên cạnh; người nói tắt camera thì dùng ảnh đại diện. Ghép thành một video, độc lập layout/pin/viewport/volume cá nhân. Audio trộn tất cả mic đang phát hợp lệ và screen audio MAIN, không chỉ tiếng người đang hiện hình. PoC còn cần chốt thuật toán chọn/chuyển người nói, tỷ lệ/kích thước, hiển thị khi không có share hoặc không ai nói, overlay và thông số encode.
- Không áp giới hạn 8 giờ của Google Meet. Giới hạn thời lượng/quota cần chọn theo số đo và ngân sách storage/tài nguyên trước vận hành. Đây là quyết định hành vi cho CoLearnia, không tuyên bố sao chép toàn bộ tính năng hoặc kiến trúc nội bộ của Meet.

### Phần cần kiểm chứng và thiết kế

- Demo clip vài phút để kiểm chứng ghi → dừng → xử lý → lưu → xem lại đúng quyền; đây không phải giới hạn thời lượng sản phẩm.
- **PoC cần kiểm chứng:** pipeline PlainTransport → GStreamer, compositor/audiomixer, thêm/bớt và thu quyền nguồn động, đồng bộ RTP/RTCP và tiếng–hình; điều khiển helper, EOS/finalize, giới hạn queue. Cần chốt chi tiết bố cục/người nói, plugin/version, codec/chất lượng, định dạng playback/seek và hỗ trợ browser. Không dùng headless browser hoặc MediaRecorder làm pipeline recording hiện tại.
- Cần thiết kế dung lượng/quota, thời gian lưu/xóa và quyền xóa, nơi lưu byte, danh sách/trang xem, hành vi khi hết dung lượng, restart hoặc ghi gián đoạn. Chưa tự chọn giá trị, không mặc định giữ vĩnh viễn hoặc có job retry bền vững.
- Vòng đời recording khi đổi host theo quyết định trên; cần thiết kế handoff nguyên tử, crash/flush và admission. Các nhánh không có ứng viên host hoặc host tạm tiếp tục mất mạng vẫn theo điểm mở của live-session; không tự chốt fallback bằng recorder.
- Chưa cam kết capacity với recording. PoC phải đo CPU/RAM/disk/network khi cùng gọi/share/chat/nhóm/TURN; kiểm gate/quota/cleanup, không tự thêm Redis/worker pool hoặc giảm camera để đạt số lượng.

## Truy vết và phân công

PB-15; FR-15-01–03; UC-LIVE-11 (ghi hình cuộc họp), UC-LIVE-12 (xem lại bản ghi). M3 chủ trì pipeline/đầu vào MAIN/UI recording; M4 cung cấp quyền host, scope và vòng đời phiên; M2 phụ trách lưu/phục vụ byte và quyền xem, phối hợp metadata với M3; M1 cung cấp quyền kênh hiện hành. Một owner schema/lifecycle phải được thống nhất trong proposal, không tạo hai kho video/file cạnh tranh.

## Kiểm chứng bắt buộc

Host bắt đầu/dừng, non-host/stale-host bị từ chối; không share hoặc camera/mic tắt; nguồn MAIN thay đổi; người vào sau biết đang ghi; host hỗ trợ ACTIVITY và người vào DISCUSSION không làm rò media riêng; dừng/kết thúc phiên hoàn tất đúng một lần; lỗi ghi/lưu không báo thành công; video sẵn sàng phát được; người ngoài/mất quyền PRIVATE không xem bằng URL; clip vài phút có hình/tiếng khớp và bằng chứng tài nguyên đã dọn. Chưa có kết quả kiểm chứng thực tế.
