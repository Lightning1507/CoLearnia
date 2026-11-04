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

## Nơi lưu video — cập nhật M2 ngày 04/11/2026

Minh Quân 15 chọn **Cloudflare R2 riêng tư** để lưu video lâu dài. MongoDB giữ thông tin bản ghi và mã tệp trong kho; quyết định M2 mở rộng ngày 05/11/2026 dùng R2 cho cả ảnh chat, tài liệu và ảnh giữ hình. Avatar công khai vẫn ở Cloudinary, tách khỏi kho riêng tư. Đây là quyết định nơi lưu, chưa là tính năng đã chạy hoặc xác nhận capacity.

M2 kiểm hạn mức và cấp đầu nhận dữ liệu trước khi M3 bắt đầu; M3 tạo video MAIN, M2 chỉ xác nhận sẵn sàng khi video đã hoàn tất và lưu R2 thành công. Khi xem, web gọi API M2; M2 kiểm quyền kênh hiện tại rồi lấy từng đoạn từ R2 để phát/tua. Không bật kho công khai hoặc trả link R2 để bỏ qua kiểm quyền. Không dùng ổ đĩa máy chủ làm kho lâu dài. M2/M3 phải thử ghi thẳng theo luồng lên R2; nếu định dạng/bộ ghi buộc cần tệp tạm thì review cách cấp chỗ, giới hạn và dọn trước triển khai. Chưa cam kết bỏ hoàn toàn tệp tạm hoặc chọn sẵn cách ghi. Chi tiết tại [proposal M2, mục 6.5](../proposals/m2-messaging-files.md#65-lưu-và-xem-lại-recording); R2 không thay bộ ghi hình của M3.

## Đồng bộ schema bàn giao M3–M2 ngày 05/11/2026

Theo yêu cầu Minh Quân 15, proposal M2 dùng [schema recordings bàn giao](../database/recordings-schema.md) làm thiết kế dữ liệu: thêm `recordings` và loại `files.purpose: RECORDING`. Chỉ M2 ghi hai phần; M3 gửi kết quả, M4 điều khiển theo host hiện hành. Đây là thiết kế đích, chưa có schema/index/migration thực thi.

- Mỗi đoạn thu tối đa **3 tiếng** từ lúc capture thực sự bắt đầu; đổi host không reset hạn dừng. Đến hạn dừng input rồi hoàn tất phần đã thu. Cấu hình video đầu **MP4/H264/AAC**, còn cần PoC phát/tua, hình/tiếng và sai lệch thời lượng khi hoàn tất.
- Video READY **giữ vô thời hạn**, không TTL hoặc tự xóa theo tuổi. Khi mất quyền hoặc xóa kênh/Workspace, chặn truy cập ngay; quyền xóa byte và chính sách sau khi cha bị xóa còn mở. Không lấy lịch 15 phút/24 giờ/7 ngày của chat/frame áp cho video.
- Một recording chưa hoàn tất mỗi phiên, gồm cả PROCESSING: đoạn trước đang upload thì chưa ghi đoạn tiếp. PoC một slot toàn app process, gồm cả upload/verify/cleanup còn giữ tài nguyên; M3 kiểm admission, M2 báo tài nguyên đã giải phóng. Đây chưa là kết quả capacity đạt.
- `STARTING → RECORDING → STOPPING → PROCESSING → READY`; lỗi xác định đi FAILED. Hai document recording/file chuyển READY cùng transaction sau kiểm byte đích. Mất phản hồi phải tra storedReceipt trước retry; không coi timeout là FAILED.
- Trang Bản ghi theo kênh/phiên chỉ liệt kê READY cho người xem thông thường. M4 cấp trạng thái đang ghi/xử lý/thông báo lỗi cho đúng người trong phiên; không mở lịch sử FAILED/nội bộ cho mọi thành viên kênh.

## PoC và phần chưa chốt

- Demo clip vài phút để kiểm chứng ghi → dừng → xử lý → lưu → xem lại đúng quyền; đây không phải giới hạn thời lượng sản phẩm.
- **Proposal/PoC cần chọn:** cơ chế capture/composition/encode, thư viện hoặc tiến trình cần dùng, bố cục share/camera và số camera ghi; cách trộn âm thanh MAIN; chất lượng, bố cục và hỗ trợ trình duyệt của profile MP4/H264/AAC. Cơ chế tạo tệp vẫn cần đối chiếu proposal M3 và thử, không coi profile là pipeline đã chạy.
- Đã chọn R2 cho nội dung video. Cần kiểm tích hợp upload/phát/tua/thu quyền; thiết kế dung lượng/quota, thời hạn bản tạm/lỗi, quyền xóa và hành vi sau khi cha bị xóa, danh sách/trang xem, hành vi khi hết dung lượng tạm hoặc R2 lỗi, restart hoặc ghi gián đoạn. Video READY giữ vô thời hạn theo mục trên; các hạn mức chưa chốt không tự điền, không coi đã có job retry chạy thật.
- Vòng đời chi tiết khi bàn giao host hoặc host tạm mất mạng cần proposal; quyền điều khiển luôn theo host hiện hành, không tự chuyển nguồn recorder khỏi MAIN.
- Chưa cam kết capacity với recording. PoC phải đo CPU/RAM/disk/network khi cùng gọi/share/chat/nhóm/TURN; kiểm gate/quota/cleanup, không tự thêm Redis/worker pool hoặc giảm camera để đạt số lượng.

## Truy vết và phân công

PB-15; FR-15-01–03; UC-LIVE-11 (ghi hình cuộc họp), UC-LIVE-12 (xem lại bản ghi). M3 chủ trì pipeline/đầu vào MAIN/UI recording; M4 cung cấp quyền host, scope và vòng đời phiên; M2 phụ trách lưu/phục vụ byte và quyền xem, phối hợp metadata với M3; M1 cung cấp quyền kênh hiện hành. M2 sở hữu schema/lifecycle lưu trữ theo bản bàn giao; M3/M4 review điểm giao, không tạo hai kho video/file cạnh tranh.

## Kiểm chứng bắt buộc

Host bắt đầu/dừng, non-host/stale-host bị từ chối; không share hoặc camera/mic tắt; nguồn MAIN thay đổi; người vào sau biết đang ghi; host hỗ trợ ACTIVITY và người vào DISCUSSION không làm rò media riêng; dừng/kết thúc phiên hoàn tất đúng một lần; lỗi ghi/lưu không báo thành công; video sẵn sàng phát được; người ngoài/mất quyền PRIVATE không xem bằng URL; clip vài phút có hình/tiếng khớp và bằng chứng tài nguyên đã dọn. Chưa có kết quả kiểm chứng thực tế.
