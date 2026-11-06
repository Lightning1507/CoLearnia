# 5. UX Patterns

**Đề xuất cách thể hiện · 07/11/2026.** Quy tắc hành vi kế thừa [messaging](../../product/messaging.md), [LIVE](../../product/live-session.md), [nhóm](../../product/group-modes.md), [recording](../../product/recording.md) và [error catalog](../../contracts/error-codes.md).

## Form và validation

Label luôn có; placeholder chỉ là ví dụ. Hint giải thích trước, lỗi gần field, lỗi toàn form cho tình huống không gắn được một field. Sau submit lỗi, giữ input còn hợp lệ và focus lỗi đầu/summary; password không persist hoặc log. Có Lưu/Hủy, dirty state rõ, không tự lưu thao tác quản trị có hậu quả.

Validation dùng schema contract của task khi đã có; hiển thị giới hạn đã chốt, không lấy giới hạn demo làm chính sách. Zod client giúp phản hồi sớm, server vẫn kiểm quyền/input. Bản đầu dùng form native và state theo nhu cầu; thư viện form cần lựa chọn riêng, không mặc định cài từ tài liệu này. IME tiếng Việt không gửi tin khi người dùng đang composition.

Với auth/profile, đọc [contract SCRUM-12](../../contracts/auth-profile.md) và schema trong `packages/contracts/src/auth.ts` trước làm form. Đã có schema không có nghĩa endpoint đã chạy; giữ trạng thái review/điểm mở theo contract và [decision-status](../../decision-status.md). Không dùng cùng rule cho mật khẩu mới và mật khẩu đăng nhập/hiện tại, không trim/normalize mật khẩu hoặc sao chép giới hạn từ prototype. Dùng schema/giới hạn contract thay native `maxLength` làm authority vì cách đếm Unicode có thể khác.

Đăng ký thành công tự đăng nhập; từ lời mời quay lại xác nhận, không autojoin. Email hồ sơ chỉ đọc; avatar upload xong chưa là lưu User thành công. Đổi mật khẩu dùng mật khẩu hiện tại và thông báo thu mọi phiên theo nguồn.

## Ma trận trạng thái bất đồng bộ

| Trạng thái          | UI và action                                                   |
| ------------------- | -------------------------------------------------------------- |
| Idle                | Cho thao tác hợp lệ; mô tả đích/hậu quả                        |
| Pending             | Hiện đang xử lý; chặn lặp cùng operation, giữ thao tác độc lập |
| Success             | Chỉ sau kết quả xác định; cập nhật đúng dữ liệu/đích           |
| Failure đã xác định | Lý do dễ hiểu và hướng khắc phục, giữ input an toàn            |
| Outcome chưa rõ     | Đang đối soát; read-back/resync theo contract trước retry      |
| Forbidden/ended     | Đóng nội dung/pending thuộc quyền cũ; có lối tới nơi còn quyền |

Không gộp `accepted/pending/completed` thành một boolean success. Abort request không bảo đảm callback cũ không chạy; kiểm context/operation trước ghi UI. Lỗi cũ của lượt start ACTIVITY phải hết hiệu lực khi retry chuyển sang lượt mới; không xóa mọi thông báo toàn app.

## Loading, empty và phân trang

Initial loading có nhãn hoặc skeleton kích thước ổn định. Refresh giữ dữ liệu còn quyền, báo đang cập nhật; mất quyền phải xóa dữ liệu dù còn cache. Empty nói chưa có nội dung, không gọi lỗi mạng là “Chưa có tin nhắn”.

History TEXT/DM/thread có cursor riêng, tải trang trước giữ anchor đọc, loading/error/thử lại/hết lịch sử. Realtime không tự kéo người đang đọc lịch sử xuống cuối; có lối tới tin mới. Gộp theo message ID, đối chiếu pending bằng clientMessageId; không nhân replyCount. Đổi conversation/root bỏ callback và cursor cũ. Catch-up nhiều trang/mốc commit theo contract M2, chưa tự thiết kế thuật toán checkpoint trong UI.

Danh sách dài chỉ virtualize khi đo cho thấy cần; giữ keyboard/focus/anchor. Paging là hợp đồng server, không dùng cắt mảng mock làm bằng chứng tải thật.

## Gửi và retry

Tin đang gửi/lỗi có trạng thái trên chính tin. Thử lại cùng ý định giữ clientMessageId/payload; nội dung mới là ý định mới. Upload STAGED khác đã gửi; chuyển đích hoặc mất quyền không gắn lại attachment cũ tùy tiện. TEXT/DM có text/ảnh/file, thread chỉ TEXT; meeting chỉ text/ảnh.

Private meeting gắn đúng hai bên, không lọc phòng trước rồi làm mất tin nhóm→host MAIN. Host mới không kế thừa cặp cũ; lịch sử cặp cũ chỉ đọc theo ACL hiện hành. Khi đổi host/scope, vô hiệu nháp/ảnh và yêu cầu kiểm đích mới theo policy, không tự gửi sang Everyone.

## Thông báo và xác nhận

| Loại                          | Vị trí/hành vi                                                          |
| ----------------------------- | ----------------------------------------------------------------------- |
| Lỗi field                     | Ngay dưới input, liên kết qua `aria-describedby`                        |
| Kết quả thao tác ngắn         | Status/toast không che control; không chứa nội dung private ngoài scope |
| Reconnect/mất quyền/recording | Banner trong context liên quan; tồn tại theo trạng thái                 |
| Xóa/kết thúc/chuyển call      | Dialog nêu đối tượng và hậu quả; action cụ thể, có Hủy                  |

Không dựa toast tự mất để truyền thông tin thiết yếu. Action “Thử lại” phải còn hợp lệ lúc click. Confirmation không thay server revalidation. Hủy chuyển LIVE giữ call cũ; host xác nhận có hậu quả kết thúc cho mọi người, member rời call riêng. Đích bị thu quyền trong lúc dialog mở phải báo và không chuyển nhầm.

## Reconnect, thu quyền và nhóm

Offline chặn lệnh nhạy cảm, không để socket flush lệnh cũ sang audience mới. Auth→projection hiện hành→reconcile resources; cache key có auth/workspace/conversation và session/epoch/generation/audience khi áp dụng. Thu quyền đóng preview/thread/player đúng scope, không đăng xuất hoặc xóa Workspace khác vô cớ. Re-add không hồi call/grant cũ.

ACTIVITY start có STARTING/partial/cleaning rồi thành công hoặc MAIN; cleanup xong mới cho retry chủ động, không phục hồi DISCUSSION. Countdown hiển thị deadline server, không tự đặt deadline từ đồng hồ client. Khi tự về MAIN mic pause/camera giữ theo policy; người đã MAIN không bị reset. Host help chủ động về MAIN giữ trạng thái mic khác cleanup sự cố.

## Recording, board và thiết bị

Recording hiển thị STARTING/RECORDING/STOPPING/PROCESSING/READY/FAILED theo quyền. Chỉ thư viện READY, không tự thêm nút xóa/retention/quota chưa chốt. Kết thúc call không bắt chờ video READY. Player lỗi/phát/tua có trạng thái riêng và dừng khi mất access.

MAIN không freeze; nhóm freeze giữ hình/tiếng vẫn trực tiếp. Nguồn đổi trước commit báo thử lại; frame đã FROZEN hợp lệ giữ khi live dừng. Permission thiết bị bị từ chối vẫn cho vào xem; autoplay bị chặn có nút bật tiếng. Nhãn này không chứng minh media đã chạy thật.
