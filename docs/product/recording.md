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

## Vòng đời đã thống nhất ngày 04/11/2026

- Bản ghi gắn session/epoch và recording generation, độc lập cookie/kết nối người bắt đầu. Đổi hoặc hoàn quyền host không stop/start lại bản ghi; quyền điều khiển thuộc host hiện hành, nguồn luôn MAIN.
- Dừng rồi ghi lại tạo intent/ID đoạn mới; retry cùng intent không tạo đoạn mới. Hết lượt ACTIVITY không dừng ghi; mic bị pause không được tự bật để đưa vào bản ghi.
- Dừng trong STARTING hủy start intent và chặn callback muộn chuyển sang đang ghi. Dữ liệu/tệp dở không được công bố READY; cách lưu tạm và cleanup byte cần contract M2/M3.
- Kết thúc phiên chốt và ngừng đầu vào trước khi xác nhận thu quyền, sau đó có thể finalize tệp ngoài session queue. Call kết thúc không phải chờ video READY; callback finalize chỉ cập nhật đúng attempt, không mở lại phiên.
- Hướng pipeline: capture nguồn MAIN → ghép hình/trộn tiếng → encode → lưu → phục vụ video có ACL. Công cụ/codec/bố cục và giới hạn tài nguyên cụ thể cần PoC, chưa chọn từ quyết định vòng đời này.

## Nơi lưu video — cập nhật M2 ngày 04/11/2026

Minh Quân 15 chọn **Cloudflare R2 riêng tư** để lưu video lâu dài. MongoDB giữ thông tin bản ghi và mã tệp trong kho; quyết định M2 mở rộng ngày 05/11/2026 dùng R2 cho cả ảnh chat, tài liệu và ảnh giữ hình. Avatar công khai vẫn ở Cloudinary, tách khỏi kho riêng tư. Đây là quyết định nơi lưu, chưa là tính năng đã chạy hoặc xác nhận capacity.

M2 kiểm hạn mức và cấp đầu nhận dữ liệu trước khi M3 bắt đầu; M3 tạo video MAIN, M2 chỉ xác nhận sẵn sàng khi video đã hoàn tất và lưu R2 thành công. Khi xem, web gọi API M2; M2 kiểm quyền kênh hiện tại rồi lấy từng đoạn từ R2 để phát/tua. Không bật kho công khai hoặc trả link R2 để bỏ qua kiểm quyền. Không dùng ổ đĩa máy chủ làm kho lâu dài. M2/M3 phải thử ghi thẳng theo luồng lên R2; nếu định dạng/bộ ghi buộc cần tệp tạm thì review cách cấp chỗ, giới hạn và dọn trước triển khai. Chưa cam kết bỏ hoàn toàn tệp tạm hoặc chọn sẵn cách ghi. Chi tiết tại [proposal M2, mục 6.5](../proposals/m2-messaging-files.md#65-lưu-và-xem-lại-recording); R2 không thay bộ ghi hình của M3.

## Đề xuất M2 theo schema bàn giao ngày 05/11/2026

Theo yêu cầu Minh Quân 15, proposal M2 dùng [schema recordings bàn giao](../database/recordings-schema.md) làm thiết kế dữ liệu: thêm `recordings` và loại `files.purpose: RECORDING`. Chỉ M2 ghi hai phần; M3 gửi kết quả, M4 điều khiển theo host hiện hành. Đây là đề xuất của PR M2 cần review chéo, chưa là chính sách đã được nhóm thông qua; chưa có schema/index/migration thực thi. Chính sách baseline còn mở ở mục phía dưới, gồm cả retention/quota; các con số/READY vô thời hạn dưới đây mô tả phương án M2 nhận từ bản bàn giao.

- Mỗi đoạn thu tối đa **3 tiếng** từ lúc capture thực sự bắt đầu; đổi host không reset hạn dừng. Đến hạn dừng input rồi hoàn tất phần đã thu. Cấu hình video đầu **MP4/H264/AAC**, còn cần PoC phát/tua, hình/tiếng và sai lệch thời lượng khi hoàn tất.
- Video READY **giữ vô thời hạn**, không TTL hoặc tự xóa theo tuổi. Khi mất quyền hoặc xóa kênh/Workspace, chặn truy cập ngay; quyền xóa byte và chính sách sau khi cha bị xóa còn mở. Không lấy lịch 15 phút/24 giờ/7 ngày của chat/frame áp cho video.
- Một recording chưa hoàn tất mỗi phiên, gồm cả PROCESSING: đoạn trước đang upload thì chưa ghi đoạn tiếp. PoC một slot toàn app process, gồm cả upload/verify/cleanup còn giữ tài nguyên; M3 kiểm admission, M2 báo tài nguyên đã giải phóng. Đây chưa là kết quả capacity đạt.
- `STARTING → RECORDING → STOPPING → PROCESSING → READY`; lỗi xác định đi FAILED. Hai document recording/file chuyển READY cùng transaction sau kiểm byte đích. Mất phản hồi phải tra storedReceipt trước retry; không coi timeout là FAILED.
- Trang Bản ghi theo kênh/phiên chỉ liệt kê READY cho người xem thông thường. M4 cấp trạng thái đang ghi/xử lý/thông báo lỗi cho đúng người trong phiên; không mở lịch sử FAILED/nội bộ cho mọi thành viên kênh.

## PoC và chi tiết kỹ thuật cần hoàn thiện

- Demo clip vài phút để kiểm chứng ghi → dừng → xử lý → lưu → xem lại đúng quyền; đây không phải giới hạn thời lượng sản phẩm.
- **Proposal/PoC cần chọn:** cơ chế capture/composition/encode, thư viện hoặc tiến trình cần dùng, bố cục share/camera và số camera ghi; cách trộn âm thanh MAIN; codec/chất lượng, định dạng phát và hỗ trợ trình duyệt. Chưa chọn FFmpeg, MediaRecorder hoặc nhà cung cấp.
- Cần thiết kế dung lượng/quota, thời gian lưu/xóa và quyền xóa, nơi lưu byte, danh sách/trang xem, hành vi khi hết dung lượng, restart hoặc ghi gián đoạn. Chưa tự chọn giá trị, không mặc định giữ vĩnh viễn hoặc có job retry bền vững.
- Contract start/stop/input-stopped/finalized, admission, metadata, deadline cleanup và byte dở cần review M2/M3/M4; quyền điều khiển luôn theo host hiện hành, không tự chuyển nguồn recorder khỏi MAIN.

- Chưa cam kết capacity với recording. PoC phải đo CPU/RAM/disk/network khi cùng gọi/share/chat/nhóm/TURN; kiểm gate/quota/cleanup, không tự thêm Redis/worker pool hoặc giảm camera để đạt số lượng.

### Đề xuất kỹ thuật cho PoC M3–M2–M4

Chọn hướng recorder phía server để không phụ thuộc host còn mở trình duyệt. M3 tạo context nhận MAIN có session/epoch/recording generation riêng, dùng [mediasoup PlainTransport](https://mediasoup.org/documentation/v3/mediasoup/api/#PlainTransport) chuyển RTP nội bộ sang helper GStreamer. Context này không giả participant và không dùng cookie host. Source eligibility kiểm tại create/resume và mọi lần scope/quyền đổi; nhận revoke phải đóng nguồn trái quyền trước khi cấp scope private.

GStreamer nhận/giải mã RTP theo capabilities thực tế, ghép bằng [compositor](https://gstreamer.freedesktop.org/documentation/compositor/index.html), trộn audio MAIN bằng [audiomixer](https://gstreamer.freedesktop.org/documentation/audiomixer/audiomixer.html), rồi encode H.264/AAC vào MP4 bằng [mp4mux](https://gstreamer.freedesktop.org/documentation/isomp4/mp4mux.html). Đây là cấu hình đề xuất cần PoC, chưa phải pipeline đã triển khai. Plugin/công cụ và phiên bản cụ thể do M3 xác nhận trên Linux trước tích hợp; không thêm dependency chỉ bằng thay đổi tài liệu này.

Cấu hình thử: 1280×720, 15 fps, H.264 khoảng 2 Mbit/s và AAC 48 kHz/128 kbit/s. Share là vùng lớn, camera MAIN còn hợp lệ xếp thành các ô khi có nguồn; không có share thì dùng bố cục camera, không có hình thì nền thông báo. Không tự bật camera/mic, không ghi board/chat private; không lấy volume cá nhân làm gain bản ghi. Mọi mic MAIN/screen audio hợp lệ được trộn sau resample về cùng sample rate, có headroom để kiểm clipping. Các giá trị chất lượng/bố cục là profile PoC, không giới hạn sản phẩm hoặc bằng chứng đạt số người lớn.

M2 là đầu mối đề xuất metadata và byte, M3 sở hữu tiến trình/attempt, M4 sở hữu host/scope/intent. Đề xuất một metadata bản ghi tham chiếu kho tệp chung, không hai collection cạnh tranh; schema/index phải được review riêng. Writer có backpressure và hàng đợi hữu hạn, không giữ cả video trong RAM. Dùng đường dẫn server tạo trong storage root; helper/RTP chỉ ở mạng nội bộ, không mở cho browser. Dừng input và đóng Consumer/transport tách khỏi EOS/finalize dữ liệu đã nhận; READY chỉ sau xác minh tệp/metadata và playback/seek.

PoC phải kiểm bật/tắt nguồn và đổi host/scope khi đang ghi, zero-input, đồng bộ tiếng-hình, stop STARTING, end/flush, helper crash, disk đầy và restart. Mốc capture-ready/input-stopped/finalized có deadline và state riêng; timeout không tự bật lại recorder hoặc phát video dở. Cách phục hồi/xóa byte dở cần giữ ACL và không chọn retention sản phẩm thay người dùng.

### Chính sách video chưa thống nhất

Thời hạn lưu, ai được xóa, quota và hành vi hết dung lượng vẫn **chưa thống nhất**. Không tự đặt giữ vĩnh viễn, tự xóa sau một số ngày hoặc thêm quyền xóa. PoC dùng storage test cô lập với giới hạn vận hành được ghi trong evidence; không bật lưu video sản phẩm tới khi chính sách/giới hạn storage được xác nhận. Cấu hình chất lượng thử phía trên không thay quyết định chính sách này. Đề xuất M2/schema bàn giao về hạn 3 tiếng và READY vô thời hạn được giữ riêng để review trong PR, không tự ghi đè trạng thái chưa chốt của main.

## Truy vết và phân công

PB-15; FR-15-01–03; UC-LIVE-11 (ghi hình cuộc họp), UC-LIVE-12 (xem lại bản ghi). M3 chủ trì pipeline/đầu vào MAIN/UI recording; M4 cung cấp quyền host, scope và vòng đời phiên; M2 phụ trách lưu/phục vụ byte và quyền xem, phối hợp metadata với M3; M1 cung cấp quyền kênh hiện hành. M2 sở hữu schema/lifecycle lưu trữ theo bản bàn giao; M3/M4 review điểm giao, không tạo hai kho video/file cạnh tranh.

## Kiểm chứng bắt buộc

Host bắt đầu/dừng, non-host/stale-host bị từ chối; không share hoặc camera/mic tắt; nguồn MAIN thay đổi; người vào sau biết đang ghi; host hỗ trợ ACTIVITY và người vào DISCUSSION không làm rò media riêng; dừng/kết thúc phiên hoàn tất đúng một lần; lỗi ghi/lưu không báo thành công; video sẵn sàng phát được; người ngoài/mất quyền PRIVATE không xem bằng URL; clip vài phút có hình/tiếng khớp và bằng chứng tài nguyên đã dọn. Chưa có kết quả kiểm chứng thực tế.
