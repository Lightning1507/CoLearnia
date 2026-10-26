# Phiên gọi, thiết bị, host, audio và reconnect

**Trạng thái:** Luồng đích; native worker hiện có chưa chứng minh signaling/camera/mic/reconnect.

Trích chuyển nguyên nội dung tương ứng từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đây là nguồn chi tiết cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## 6. Cuộc gọi, camera và chia sẻ màn hình

### 6.1. Join và quyền sở hữu call

1. `POST /channels/:cid/live-session/join` xác thực membership/channel, lấy khóa channel và tìm/tạo session; unique DB bảo vệ bản ghi; dọn Router tạo thừa nếu DB insert thất bại.
2. Cấp join ticket một lần, hạn 60 giây, gắn auth session/user/channel/session epoch. API retry cùng requestId không tạo phiên/ticket dùng song song.
3. `session.join` consume ticket, kiểm lại quyền, giữ khóa theo user để cấp callGeneration. Nếu tài khoản đã gọi nơi khác, trả `CALL_ALREADY_ACTIVE`, UI yêu cầu người dùng chủ động chuyển phiên.
4. Chuyển phiên: deny nguồn cũ → đóng tài nguyên cũ → tăng generation → bind participant mới. Late event từ socket cũ không đóng call mới. Unique participant theo session không thay registry toàn user.
5. Trả projection, RTP capabilities, tham số send/recv transport. Client tạo transport, connect và xin publish nguồn được phép.
6. Consumer server tạo paused → client gắn track và báo ready → server kiểm lại quyền/generation → resume hoặc close. [mediasoup communication](https://mediasoup.org/documentation/v3/communication-between-client-and-server/).

Quy ước tránh deadlock: khi thực sự cần khóa lồng nhau, thứ tự là user ownership → channel lifecycle → session mutation; không lấy user/channel lock từ trong session queue. REST lấy channel lock đơn lẻ phải nhả trước khi trả ticket. Takeover giữ quyền chuyển theo user, reconcile từng session tuần tự, không khóa hai session cùng lúc; không giữ bất kỳ mutex nào khi chờ callback client. Cleanup registry dùng compare-and-delete theo generation để không cần đảo thứ tự khóa. Mọi close idempotent. Join bị hủy/time out phải dọn participant/ticket/resource pending.

### 6.2. Thiết bị và camera

- Xin mic/camera từ thao tác người dùng; lỗi permission/device có thông báo. Mic/camera tắt không bị server tự bật.
- Đổi thiết bị bằng thay track tương thích hoặc đóng/tạo nguồn có kiểm quyền; một generation không có hai Producer MIC/CAMERA hoạt động.
- Cấu hình thử đầu tiên: camera khoảng 360p–480p/15fps, screen ưu tiên chữ rõ khoảng 720p–1080p/5–15fps; là điểm bắt đầu để đo, không bảo đảm chất lượng mọi mạng.
- Bản nghiệm thu 5 participant phải hiển thị được các camera hợp lệ. Khi thử tải cao hơn, page/pin tile và subscribe theo viewport; không nhận camera trái quyền dù UI ẩn.
- Codec baseline được chọn sau smoke test browser mục tiêu, ghi chính xác vào config/lockfile; chưa cần nhiều codec hay simulcast phức tạp trước khi có số đo.

### 6.3. Share lease và browser picker

Flow chính để giữ user activation: xin lease từ server → khi được cấp hiển thị nút **“Chọn màn hình để chia sẻ”** → click gọi `getDisplayMedia()` trực tiếp → tạo Producer nếu lease/grant còn hợp lệ. Nếu hết lease/hủy picker/thua quyền: stop toàn bộ track vừa lấy, release lease và báo thử lại. Không giữ queue khi chờ picker.

API yêu cầu thao tác người dùng và browser picker; không tự chọn màn hình hay tái dùng quyền capture. Audio phụ thuộc browser/OS/nguồn người dùng chọn. [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

Lease chờ picker khởi đầu 30 giây; khi commit chuyển thành share ownership gắn participant/generation, được giám sát theo signaling lease. Browser Stop/track ended/rời/kick/thu share grant: đóng SCREEN và SCREEN_AUDIO, release ownership, tăng source revision, hủy freeze intent cũ, xóa live overlay cũ. Frame đã FROZEN vẫn có thể dùng đến resume/cleanup nhưng hiển thị nguồn cũ đã dừng; không giả còn live.

Một Producer có thể được nhận qua nhiều lý do quyền, nhưng chỉ tạo một Consumer mỗi receiver/producer. Client registry cũng chống attach audio hai lần.

### 8.3. Chuyển host và host mất mạng

Transfer cần target đang tham gia chấp nhận, có expiry. Khi commit: kết thúc help/floor/presentation/announcement, thu quyền host cũ/share grant điều hành, chuyển role và tăng revision. Để đơn giản, dừng main share khi transfer nếu nguồn phụ thuộc quyền cũ; người có quyền mới chủ động share lại.

Host mới không tự bật mic/camera; MIC đang bật ở scope cũ được pause trong media policy tới khi xác nhận scope điều hành. Host cũ trở về member/MAIN với quyền bình thường; không giữ quyền nghe group hỗ trợ trước đó.

Host mất signaling: không chuyển mic GROUP thành GLOBAL. Giữ vai trò trong grace; hết grace thu media/help/grants điều hành, đặt host trống, giữ room MODERATED. Sau đó participant có thể chủ động nhận host bằng mutation nguyên tử có thông báo; role Workspace không cho phép tiếp quản sớm hoặc nghe ngầm. Người khác vẫn xem main screen còn hợp lệ; main share của host mất lease phải dừng.

### 8.4. Audio graph

```text
remote mic mỗi người → participantGain → discussionBus ─┐
host/global floor   → participantGain → priorityBus   ─┼→ master → output
screen audio        → screenGain      → screenBus    ─┘
```

Mỗi track chỉ đi một bus theo scope hiện tại, không nhân stream. `effectiveGain = master × participantGain × busGain × announcementFactor`; chỉ discussionBus có factor giảm khi thông báo. Không giảm chính host/floor đang được ưu tiên. Ramp gain ngắn; khi kết thúc chỉ bỏ factor, không ghi đè gain cá nhân; mute local vẫn là 0.

Preference lưu cục bộ theo user/Workspace/người nói, không theo producerId tạm. Không gắn cùng track vào audio element có tiếng và Web Audio output. Có nút bật âm thanh khi autoplay chặn, không loop mic local ra loa. Nhiều nguồn có thể cộng gây clipping dù từng gain ≤1; thử headroom/limiter khi cần. Announcement tối đa 30 giây, có timeout khôi phục cả khi host rớt. Volume không thay quyền: nguồn trái quyền không được nhận dù gain=0.

## 11. Reconnect và vòng đời tài nguyên

### 11.1. Control lease và resume

Socket disconnect không chứng minh media đã ngừng. Khi server nhận disconnect: chuyển participant sang RECONNECTING, chặn mutation mới, kết thúc announcement của nguồn đó, thu floor consent của participant và reconcile ngay các Consumer global. Không được giữ quyền global chỉ vì mic WebRTC còn chạy. Với mạng đứt mà chưa được phát hiện, control lease có deadline server và heartbeat; cửa sổ phát hiện này phải được đo.

Giữ call ownership/nhóm tối đa 30 giây từ disconnect hoặc control lease hết hạn để reconnect; media thông thường còn lại được đóng chậm nhất cuối grace. Trong grace vẫn áp dụng mọi kick/move/revoke mới. Deadline không kéo dài bởi request cũ/generation cũ. Sau grace, đóng toàn bộ participant resources và phải join/consent lại.

Resume ticket ngắn hạn, một lần, gắn auth/session epoch/callGeneration, rotate sau mỗi resume. Khi reconnect: auth và Origin/CSRF lại → kiểm registry/current membership → bind socket mới → gửi projection mới → recreate/reconcile transport nếu cần. Ticket không chứa quyền cũ để phục hồi. Nếu hết ticket nhưng còn auth hợp lệ, server chỉ cấp lại quyền resume sau kiểm participant/call ownership hiện hành; không chiếm call thiết bị mới.

### 11.2. Bảng vòng đời

| Tình huống                                 | Xử lý bắt buộc                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Transport failed                           | Close mapping cũ; ICE restart hoặc tạo transport theo adapter; không nhân Producer                     |
| Rời phòng chủ động                         | Hủy intent/ticket/grant; leave fanout; close tracks/audio nodes/client controller và tài nguyên server |
| Kick/mất channel access/logout/auth expiry | Deny barrier; close media/socket liên quan, chặn file/REST ngay                                        |
| Chuyển nhóm                                | Thu old scope trước, cấp new scope; hủy floor consent/intent cũ                                        |
| Group đóng                                 | Thu presentation/floor/help; về MAIN; khóa history, dọn board không còn refs                           |
| Stop share                                 | Close screen + audio; invalidate intent/live overlay; frame frozen có trạng thái nguồn đã dừng         |
| Host rớt                                   | Giữ scope an toàn, không auto global; hết grace thu host activity, cho tiếp quản rõ ràng               |
| Người cuối rời                             | Empty grace 60 giây rồi ENDING → close Router → ENDED; join phải tránh race với reaper                 |
| Host kết thúc phiên                        | ENDING ngay, deny join/mutation, thu tất cả resources và khóa private conversations                    |
| Worker chết                                | ENDED phiên liên quan, invalidate epoch, báo client join phiên mới; worker restart có health rõ        |
| App restart                                | Invalidate runtime/resume đời cũ; đóng metadata stale/private history trước readiness                  |
| Xóa kênh/Workspace                         | Khóa đọc trước cleanup; kết thúc session; file không tiếp tục được cấp qua URL cũ                      |

Resource generation giúp late `transportclose/producerclose/disconnect` không xóa nhầm object đời mới. Mọi close idempotent; đóng server phải báo client và ngược lại, không trông chờ thư viện tự đồng bộ nghiệp vụ.
