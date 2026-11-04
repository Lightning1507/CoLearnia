# Ghi hình MAIN và xem lại — RECORD-01

**Quyết định sau kickoff ngày 02/11/2026:** bổ sung vào scope; trước đây recording ngoài phạm vi. Đây là yêu cầu thiết kế, chưa có pipeline hoặc bằng chứng ghi hình chạy thật. `RECORD-01` khác `REC-01` (reconnect).

## Mục tiêu và quyền

- Host hiện hành bắt đầu/dừng ghi. Người không còn giữ host không được điều khiển bằng lệnh cũ. UI thông báo rõ đang ghi cho người tham gia, kể cả người vào sau.
- Ghi màn hình chia sẻ, camera và âm thanh **MAIN** vào video xem lại. Chỉ nguồn được phép tại MAIN mới được vào bản ghi; không ghi media/chat/board riêng của DISCUSSION hoặc ACTIVITY.
- Host vào hỗ trợ ACTIVITY không làm recorder chuyển theo host: tiếng/camera hỗ trợ không vào bản ghi MAIN. Người chuyển khỏi MAIN phải được loại khỏi đầu vào ghi theo scope hiện hành; không dùng ẩn UI hoặc volume=0 thay ACL.
- Camera/mic tắt hoặc không có share là trạng thái hợp lệ; không tự bật thiết bị để ghi. Bộ nguồn được cập nhật khi người bật/tắt, rời hoặc chuyển phòng.
- Video gắn phiên LIVE và kênh gốc. Thành viên chỉ xem khi còn membership Workspace và quyền kênh LIVE hiện hành, kể cả PRIVATE. Biết ID/URL hoặc từng tham gia không đủ quyền; thu quyền phải chặn tiếp truy cập. Không công khai link video không kiểm quyền.

## Luồng và kết quả

Host chọn bắt đầu → server kiểm quyền và khả năng recorder → thông báo đang ghi → thu nguồn MAIN → host dừng, đoạn đủ 3 tiếng hoặc phiên kết thúc → hoàn tất/xử lý tệp → video sẵn sàng để thành viên còn quyền xem. Không báo đã ghi khi capture chưa khởi động hoặc đã lỗi; chưa xử lý xong không hiển thị video là sẵn sàng. Lỗi ghi/lưu cần thông báo và không làm kết thúc cuộc gọi đang hoạt động. Dừng/đóng phải giải phóng tài nguyên và không nhân job/tệp khi retry.

## Vòng đời đã thống nhất ngày 04/11/2026

- Bản ghi gắn session/epoch và recording generation, độc lập cookie/kết nối người bắt đầu. Đổi hoặc hoàn quyền host không stop/start lại bản ghi; quyền điều khiển thuộc host hiện hành, nguồn luôn MAIN.
- Dừng rồi ghi lại tạo intent/ID đoạn mới; retry cùng intent không tạo đoạn mới. Hết lượt ACTIVITY không dừng ghi; mic bị pause không được tự bật để đưa vào bản ghi.
- Dừng trong STARTING hủy start intent và chặn callback muộn chuyển sang đang ghi. Dữ liệu/tệp dở không được công bố READY; cách lưu tạm và cleanup byte cần contract M2/M3.
- Kết thúc phiên chốt và ngừng đầu vào trước khi xác nhận thu quyền, sau đó có thể finalize tệp ngoài session queue. Call kết thúc không phải chờ video READY; callback finalize chỉ cập nhật đúng attempt, không mở lại phiên.
- Hướng pipeline: capture nguồn MAIN → ghép hình/trộn tiếng → encode → lưu → phục vụ video có ACL. Công cụ/codec/bố cục và giới hạn tài nguyên cụ thể cần PoC, chưa chọn từ quyết định vòng đời này.

## PoC và chi tiết kỹ thuật cần hoàn thiện

### Vòng đời đã chốt ngày 03/11/2026

- Kiến trúc recorder đã chọn: Recording service M3 do app server quản lý, dùng quyền/state M4 để cấp context chỉ đọc MAIN gắn session/epoch/recording generation; độc lập với tab/layout/pin và volume nghe cục bộ của host. M3 quản lý capture/encode và bàn giao video cho storage M2. Pipeline đã chọn: mediasoup PlainTransport xuất RTP/RTCP nội bộ → GStreamer nhận/giải mã, ghép hình, trộn tiếng và encode/mux. Phiên bản/plugin, điều khiển pipeline động, clock/timestamp mapping, codec và ngân sách tài nguyên phải kiểm qua PoC; chưa có bằng chứng đồng bộ/capacity đạt.
- Recording gắn với phiên MAIN, độc lập với người bấm ghi. Chuyển DISCUSSION/ACTIVITY hoặc host vào hỗ trợ không dừng recording và không đưa media riêng của nhóm vào bản ghi.
- Chuyển/hoàn quyền host hợp lệ không dừng recording; host hiện hành có quyền dừng, host cũ không còn quyền điều khiển. Người bắt đầu ghi đã bàn giao host rồi rời LIVE hoặc mất kết nối không tự làm dừng bản ghi nếu phiên còn hoạt động; quay lại nhận trạng thái hiện hành, không cần bấm Record để nối tiếp.
- Host chưa bàn giao mà chủ động rời vẫn kết thúc phiên cho mọi người theo [live session](live-session.md#83-chuyển-host-và-host-mất-mạng), nên recording dừng theo phiên. Đóng tab/mất mạng theo disconnect/control lease/grace, không coi ngay là chủ động kết thúc. Phiên kết thúc do hết người theo lifecycle cũng dừng recording; không thêm bộ đếm người/nhánh kết thúc phiên riêng trong recorder.
- Bấm Dừng, đoạn đủ 3 tiếng hoặc kết thúc phiên thì chốt đầu vào và hoàn tất video. Sau khi dừng, lần Record mới tạo recording ID/tệp mới; retry cùng ý định không tạo đoạn mới. Recorder lỗi vẫn báo lỗi/cleanup, không tự mở bản ghi mới.
- Bố cục profile PoC cập nhật 04/11 theo #28: có share MAIN thì share vùng lớn cùng các ô camera MAIN hợp lệ; không share dùng lưới camera, không có hình dùng nền thông báo. Xếp ô ổn định theo participant, độc lập pin/viewport/volume cá nhân và không chỉ chọn camera người nói. Audio trộn mọi mic MAIN/screen audio hợp lệ. Profile thử H.264/AAC MP4 720p/15 fps; số input, xếp ô/ảnh đại diện, overlay và plugin/encode phải kiểm qua PoC, chưa là capacity đạt.
- Mỗi đoạn ghi tối đa 3 tiếng theo quyết định 04/11 bên dưới, không áp giới hạn 8 giờ của Google Meet. Quota và ngân sách storage/tài nguyên vẫn cần review theo máy; không tuyên bố sao chép kiến trúc nội bộ của Meet.

### Phần cần kiểm chứng và thiết kế

- Demo clip vài phút để kiểm chứng ghi → dừng → xử lý → lưu → xem lại đúng quyền; đây không phải giới hạn thời lượng sản phẩm.
- **PoC cần kiểm chứng:** pipeline PlainTransport → GStreamer, compositor/audiomixer, thêm/bớt và thu quyền nguồn động, đồng bộ RTP/RTCP và tiếng–hình; điều khiển helper, EOS/finalize, giới hạn queue. Chi tiết bố cục ô camera, plugin/version, profile codec/chất lượng, playback/seek và browser được xác minh trong PoC. Không dùng headless browser hoặc MediaRecorder làm pipeline recording hiện tại.
- Video READY giữ vô thời hạn, mỗi đoạn tối đa 3 tiếng theo quyết định bên dưới. Còn cần thiết kế quota/disk budget, quyền xóa thủ công, xử lý video khi xóa kênh/Workspace, nơi lưu byte, danh sách/trang xem và lỗi/restart. Không tự thêm job retry bền vững hoặc phục hồi recording sau crash.
- Vòng đời recording khi đổi host theo quyết định trên; cần thiết kế handoff nguyên tử, crash/flush và admission. Kế vị host và reconnect áp dụng nguồn lifecycle M4 tại PR #28 đã được yêu cầu đồng bộ; recorder không tự elect hoặc đặt fallback/end riêng.
- Chưa cam kết capacity với recording. PoC phải đo CPU/RAM/disk/network khi cùng gọi/share/chat/nhóm/TURN; kiểm gate/quota/cleanup, không tự thêm Redis/worker pool hoặc giảm camera để đạt số lượng.

## Thời lượng và lưu trữ — chốt ngày 04/11/2026

- Mỗi đoạn ghi tối đa **3 tiếng (10.800 giây)** từ lúc capture thực sự bắt đầu; không tính từ click. Đổi host, đổi scope hoặc reconnect không reset thời lượng.
- Server báo trước cho host hiện hành, mốc cảnh báo cụ thể thiết kế trong UI task. Đến hạn tự ngừng input và hoàn tất video, cuộc gọi tiếp tục. Host chủ động ghi đoạn mới khi admission cho phép; không tự nối đoạn hoặc tự Record lại. Stop/end/deadline lặp hoặc đến muộn không nhân tệp và không dừng đoạn mới.
- Video **READY giữ vô thời hạn**, không tự xóa theo tuổi, không TTL hoặc sweeper xóa video READY chỉ vì đã cũ. Quyền xem vẫn theo membership/channel access hiện hành; giữ byte lâu dài không cấp quyền đọc.
- Tệp tạm, upload bỏ dở và attempt recording lỗi/hủy vẫn cleanup theo lifecycle sau xác minh writer/ref/commit; chính sách giữ READY không giữ mọi tệp tạm vô hạn. Không tự công bố clip dở READY.
- Quota/disk không đủ phải từ chối bắt đầu hoặc báo lỗi ghi đúng lifecycle; không tự xóa video READY cũ để lấy chỗ. Mức quota cụ thể, quyền xóa thủ công và xử lý video khi xóa kênh/Workspace **còn cần chốt riêng**; không suy retention vô thời hạn thành quyền xóa hoặc tự purge parent.
- Clip demo vài phút không chứng minh ghi ổn định 3 tiếng. Cần kiểm deadline bằng fake clock và soak ghi thật đủ 3 tiếng cùng sync/resource/disk/finalize trước công bố khả năng đạt; timeout finalize của clip PoC ngắn chưa là SLA cho bản ghi dài.

## Bàn giao và storage adapter

M3 finalize artifact tạm, M2 lưu qua adapter kho private không phụ thuộc nhà cung cấp, xác minh byte/media metadata và commit metadata rồi mới READY. Finalize local không đủ để báo video đã lưu. Retry/read-back đúng operation/recording/attempt, budget transfer tách encoder finalize; chỉ dọn artifact tạm sau stored receipt bền hoặc nhánh lỗi/hủy đã đối soát refs/writer. M2 cung cấp content/Range có ACL hiện hành và hủy stream khi revoke; không public URL hoặc dùng URL ký sống lâu thay quyền kênh. Provider do M2 cấu hình phía server, không là contract M3/FE. Thiết kế interface và ca kiểm tại [proposal M3 mục 6.3.1](../proposals/m3-media.md#631-contract-bàn-giao-video-m3m2-không-phụ-thuộc-nhà-cung-cấp); chưa có adapter hoặc bằng chứng upload/playback thật.

### Đề xuất kỹ thuật cho PoC M3–M2–M4

Chọn hướng recorder phía server để không phụ thuộc host còn mở trình duyệt. M3 tạo context nhận MAIN có session/epoch/recording generation riêng, dùng [mediasoup PlainTransport](https://mediasoup.org/documentation/v3/mediasoup/api/#PlainTransport) chuyển RTP nội bộ sang helper GStreamer. Context này không giả participant và không dùng cookie host. Source eligibility kiểm tại create/resume và mọi lần scope/quyền đổi; nhận revoke phải đóng nguồn trái quyền trước khi cấp scope private.

GStreamer nhận/giải mã RTP theo capabilities thực tế, ghép bằng [compositor](https://gstreamer.freedesktop.org/documentation/compositor/index.html), trộn audio MAIN bằng [audiomixer](https://gstreamer.freedesktop.org/documentation/audiomixer/audiomixer.html), rồi encode H.264/AAC vào MP4 bằng [mp4mux](https://gstreamer.freedesktop.org/documentation/isomp4/mp4mux.html). Đây là cấu hình đề xuất cần PoC, chưa phải pipeline đã triển khai. Plugin/công cụ và phiên bản cụ thể do M3 xác nhận trên Linux trước tích hợp; không thêm dependency chỉ bằng thay đổi tài liệu này.

Cấu hình thử: 1280×720, 15 fps, H.264 khoảng 2 Mbit/s và AAC 48 kHz/128 kbit/s. Share là vùng lớn, camera MAIN còn hợp lệ xếp thành các ô khi có nguồn; không có share thì dùng bố cục camera, không có hình thì nền thông báo. Không tự bật camera/mic, không ghi board/chat private; không lấy volume cá nhân làm gain bản ghi. Mọi mic MAIN/screen audio hợp lệ được trộn sau resample về cùng sample rate, có headroom để kiểm clipping. Các giá trị chất lượng/bố cục là profile PoC, không giới hạn sản phẩm hoặc bằng chứng đạt số người lớn.

M2 là đầu mối đề xuất metadata và byte, M3 sở hữu tiến trình/attempt, M4 sở hữu host/scope/intent. Đề xuất một metadata bản ghi tham chiếu kho tệp chung, không hai collection cạnh tranh; schema/index phải được review riêng. Writer có backpressure và hàng đợi hữu hạn, không giữ cả video trong RAM. Dùng artifactRef do M2 cấp, ánh xạ tới đường dẫn server tạo trong storage root cho tệp tạm; helper/RTP chỉ ở mạng nội bộ, không mở cho browser. Dừng input và đóng Consumer/transport tách khỏi EOS/finalize dữ liệu đã nhận; READY chỉ sau xác minh tệp/metadata và playback/seek.

PoC phải kiểm bật/tắt nguồn và đổi host/scope khi đang ghi, zero-input, đồng bộ tiếng-hình, stop STARTING, end/flush, helper crash, disk đầy và restart. Mốc capture-ready/input-stopped/finalized có deadline và state riêng; timeout không tự bật lại recorder hoặc phát video dở. Đối soát/dọn byte dở theo contract storage ở trên, giữ ACL và không tự cứu clip dở; không áp cleanup tạm vào video READY giữ vô thời hạn.

## Truy vết và phân công

PB-15; FR-15-01–03; UC-LIVE-11 (ghi hình cuộc họp), UC-LIVE-12 (xem lại bản ghi). M3 chủ trì pipeline/đầu vào MAIN/UI recording; M4 cung cấp quyền host, scope và vòng đời phiên; M2 phụ trách lưu/phục vụ byte và quyền xem, phối hợp metadata với M3; M1 cung cấp quyền kênh hiện hành. Một owner schema/lifecycle phải được thống nhất trong proposal, không tạo hai kho video/file cạnh tranh.

## Kiểm chứng bắt buộc

Host bắt đầu/dừng, non-host/stale-host bị từ chối; không share hoặc camera/mic tắt; nguồn MAIN thay đổi; người vào sau biết đang ghi; host hỗ trợ ACTIVITY và người vào DISCUSSION không làm rò media riêng; dừng/kết thúc phiên hoàn tất đúng một lần; lỗi ghi/lưu không báo thành công; video sẵn sàng phát được; người ngoài/mất quyền PRIVATE không xem bằng URL; clip vài phút có hình/tiếng khớp và bằng chứng tài nguyên đã dọn. Chưa có kết quả kiểm chứng thực tế.
