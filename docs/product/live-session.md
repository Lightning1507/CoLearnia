# Phiên gọi, thiết bị, host, audio và reconnect

**Trạng thái:** Luồng đích; native worker hiện có chưa chứng minh signaling/camera/mic/reconnect.

Nguồn ban đầu được trích chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đã cập nhật theo quyết định team ngày 27/10/2026 trong technical plan v2.3. Đây là nguồn chi tiết hiện hành cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## 6. Cuộc gọi, camera và chia sẻ màn hình

### 6.1. Join và quyền sở hữu call

1. `POST /channels/:cid/live-session/join` xác thực membership/channel, lấy khóa channel và tìm/tạo session; unique DB bảo vệ bản ghi; dọn Router tạo thừa nếu DB insert thất bại.
   Người khởi tạo thành công phiên mới được gán host cùng việc tạo phiên; hai người join đồng thời chỉ có một phiên/một host. Người vào phiên đang tồn tại không lấy host, kể cả khi host đang mất kết nối. Chi tiết trường hợp host mất kết nối theo mục 8.3.
2. Cấp join ticket một lần, hạn 60 giây, gắn auth session/user/channel/session epoch. API retry cùng requestId không tạo phiên/ticket dùng song song.
3. `session.join` consume ticket, kiểm lại quyền, giữ khóa theo user để cấp callGeneration. Nếu tài khoản đã gọi nơi khác, trả `CALL_ALREADY_ACTIVE`, UI yêu cầu người dùng chủ động chuyển phiên.
4. Chuyển phiên: deny nguồn cũ → đóng tài nguyên cũ → tăng generation → bind participant mới. Late event từ socket cũ không đóng call mới. Unique participant theo session không thay registry toàn user.
5. Trả projection, RTP capabilities, tham số send/recv transport. Client tạo transport, connect và xin publish nguồn được phép.
6. Consumer server tạo paused → client gắn track và báo ready → server kiểm lại quyền/generation → resume hoặc close. [mediasoup communication](https://mediasoup.org/documentation/v3/communication-between-client-and-server/).

Quy ước tránh deadlock: khi thực sự cần khóa lồng nhau, thứ tự là user ownership → Workspace mutation gate (nếu cần kiểm/commit quyền Workspace) → channel lifecycle → session mutation; không lấy user/Workspace/channel lock từ trong session queue. Chi tiết cổng DB một process theo [integrity bước 5](../database/integrity-and-migrations.md). REST lấy channel lock đơn lẻ phải nhả trước khi trả ticket. Takeover giữ quyền chuyển theo user, reconcile từng session tuần tự, không khóa hai session cùng lúc; không giữ bất kỳ mutex nào khi chờ callback client. Cleanup registry dùng compare-and-delete theo generation để không cần đảo thứ tự khóa. Mọi close idempotent. Join bị hủy/time out phải dọn participant/ticket/resource pending.

### 6.2. Thiết bị và camera

- Xin mic/camera từ thao tác người dùng; lỗi permission/device có thông báo. Mic/camera tắt không bị server tự bật.
- Đổi thiết bị bằng thay track tương thích hoặc đóng/tạo nguồn có kiểm quyền; một generation không có hai Producer MIC/CAMERA hoạt động.
- Cấu hình thử đầu tiên: camera khoảng 360p–480p/15fps, screen ưu tiên chữ rõ khoảng 720p–1080p/5–15fps; là điểm bắt đầu để đo, không bảo đảm chất lượng mọi mạng.
- Gate 5 participant phải hiển thị được các camera hợp lệ. Theo [capacity hiện hành](../capacity.md), hướng thử 10 → 25 rồi mở rộng 50; khi share nội dung lớn, camera ở sidebar. Thử tối đa 4 camera từ xa/client theo viewport/pin, server pause/close Consumer thật; không chỉ ẩn video đã nhận. Đây không là giới hạn người được bật camera; audio giữ theo scope, không bị cắt vì camera ngoài viewport. Chưa có profile 25/50 đạt; không nhận camera trái quyền dù UI ẩn.
- Codec baseline được chọn sau smoke test browser mục tiêu, ghi chính xác vào config/lockfile; chưa cần nhiều codec hay simulcast phức tạp trước khi có số đo.

### 6.3. Share lease và browser picker

Flow chính để giữ user activation: xin lease từ server → khi được cấp hiển thị nút **“Chọn màn hình để chia sẻ”** → click gọi `getDisplayMedia()` trực tiếp → tạo Producer nếu lease/grant còn hợp lệ. Nếu hết lease/hủy picker/thua quyền: stop toàn bộ track vừa lấy, release lease và báo thử lại. Không giữ queue khi chờ picker.

API yêu cầu thao tác người dùng và browser picker; không tự chọn màn hình hay tái dùng quyền capture. Audio phụ thuộc browser/OS/nguồn người dùng chọn. [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

Lease chờ picker khởi đầu 30 giây; khi commit chuyển thành share ownership gắn participant/generation, được giám sát theo signaling lease. Browser Stop/track ended/rời/kick/mất quyền scope: đóng SCREEN và SCREEN_AUDIO, release ownership, tăng source revision, hủy freeze intent cũ, xóa live overlay cũ. Frame đã FROZEN vẫn có thể dùng đến resume/cleanup nhưng hiển thị nguồn cũ đã dừng; không giả còn live.

Lease/source registry phải có scope và mode theo [group modes](group-modes.md). MAIN dùng một lease độc quyền; DISCUSSION không có lease share riêng; mỗi ACTIVITY có lease độc quyền riêng, mọi member trong nhóm được bấm share mà không host approval. Reserve lease tự động chỉ chống tranh nguồn, không là xin phép host. Browser Stop/rời nhóm/revoke chỉ invalidate nguồn và board refs liên quan, không reset mọi nguồn của toàn session.

Một Producer có thể được nhận qua nhiều lý do quyền, nhưng chỉ tạo một Consumer mỗi receiver/producer. Client registry cũng chống attach audio hai lần.

### 8.3. Chuyển host và host mất mạng

Chỉ có một kiểu cuộc họp, không còn FREE/MODERATED. Người bắt đầu LiveSession được gán host nguyên tử cùng việc tạo phiên; join sau vào phiên đang có không tạo host thứ hai. Người khác không tự nhận host. Theo xác nhận ngày 01/11/2026, host chọn một participant đang kết nối/còn quyền trong chính phiên để chuyển quyền trực tiếp, không có bước mời/chờ người nhận chấp nhận. Server kiểm lại actor/target/revision; khi commit kết thúc help/announcement, thu quyền điều hành host cũ, chuyển role và tăng revision, thông báo host mới cho phòng. Nếu target không còn hợp lệ thì từ chối, không bàn giao một phần. Đây là bàn giao chính thức: người cũ trở thành thành viên, không tự lấy lại quyền khi vào lại. MAIN share không phụ thuộc vai trò host nên không bị dừng chỉ vì chuyển host; mất quyền scope/rời/mất lease vẫn phải đóng nguồn.

Host mới đang ở nhóm phải được thu membership/help cũ và chuyển về MAIN khi nhận vai trò; đây là chuyển scope theo lifecycle, không phải quyền host điều chuyển thành viên. Host mới không tự bật mic/camera; MIC đang bật ở scope cũ được pause trong media policy tới khi xác nhận scope điều hành; MAIN/DISCUSSION khác ACTIVITY độc lập. Host cũ trở về member/MAIN với quyền bình thường; không giữ quyền nghe group hỗ trợ trước đó.

Khi server phát hiện host mất signaling hoặc control lease hết hạn, thu ngay mọi quyền media/chat/board/help/announcement/điều hành của kết nối cũ. Không chuyển MIC GROUP thành hướng dẫn MAIN/DISCUSSION. Chọn host tạm ngay từ participant đang kết nối/còn quyền, không đợi reconnect grace 30 giây. Quyền nối lại ownership và danh tính cần hoàn quyền được giữ riêng với quyền thực thi của kết nối đã mất.

**Đã chốt khi phát hiện host mất kết nối — cập nhật 04/11/2026:**

- Server thu media/help/quyền điều hành của kết nối cũ, chọn ngẫu nhiên một participant hiện đang kết nối và còn quyền tham gia phiên làm **host tạm**. Không ưu tiên owner/admin và không cần bước chấp nhận; chuyển host chủ động cũng không cần người nhận chấp nhận; thông báo rõ cho cuộc họp.
- Ghi nhận danh tính host bị mất mạng để hoàn quyền trong chính LiveSession này. Khi người đó kết nối lại hoặc join lại sau grace, server xác thực danh tính/quyền hiện tại rồi tự động thu quyền host tạm và trả quyền host cho người cũ; không cần host tạm đồng ý. Không tin cờ “host cũ” do client khai.
- Chuyển/hoàn quyền nguyên tử, tăng revision và phát host.changed; tại một thời điểm chỉ một host có quyền điều hành. Event trễ không phục hồi host tạm hoặc kết nối cũ.
- Thu help/announcement của host trước khi cấp quyền điều hành mới. Không tự bật mic/camera, phát tiếng hỗ trợ cũ ra MAIN, chuyển người/board/chat nhóm hoặc reset countdown chỉ vì đổi host. MAIN share của người còn quyền tiếp tục; nguồn của kết nối mất lease phải đóng. ACTIVITY vẫn không nhận MAIN mặc định.
- Đây là xử lý tự động của hệ thống, không mở nút tự nhận host cho thành viên. Quyền hoàn lại chỉ áp dụng cho sự cố mất mạng trong phiên còn hoạt động, không áp dụng sang LiveSession mới hoặc tự hủy một lần chuyển host chủ động đã hoàn tất.

**Làm rõ thu quyền hỗ trợ khi đổi/hoàn host — xác nhận người phụ trách ngày 05/11/2026:** nếu người đang hỗ trợ ACTIVITY chỉ có quyền vào nhóm nhờ vai trò host và không thuộc roster ACTIVITY của nhóm đó, khi mất host phải thu ngay quyền xem/nghe/chat/board và lượt hỗ trợ cũ, đưa riêng người đó về MAIN, tạm tắt mic; camera giữ nguyên trạng thái bật/tắt và áp audience của phạm vi hiện hành. Host mới không tự nhận lượt hỗ trợ/nhóm đích của host cũ; muốn hỗ trợ phải chủ động vào đúng nhóm theo policy. Không đóng nhóm, đổi roster/countdown hoặc đưa các thành viên khác về MAIN. Đây là nhánh bị thu quyền, khác host chủ động rời hỗ trợ giữ trạng thái mic. Không suy quy tắc này thành quyết định cho mọi trường hợp host có membership nhóm hợp lệ độc lập; phần đó phải đối chiếu quyền hiện hành trước triển khai.

**Host chủ động rời cuộc họp:** nếu vẫn giữ quyền host thì kết thúc phiên cho mọi người theo UC-LIVE-10, không tự chọn người thay. UI phải thể hiện rõ “Kết thúc cuộc họp cho mọi người”. Nếu đã chuyển quyền chính thức thành công thì người cũ rời như thành viên, cuộc họp tiếp tục. Rời nhóm hỗ trợ về MAIN không phải rời cuộc họp và không kết thúc phiên. Mất kết nối không phải lệnh kết thúc: đóng tab/crash hoặc timeout đi qua nhánh mất mạng nếu server không nhận được thao tác kết thúc hợp lệ.

**Bàn giao khi đang thay tạm:** chuyển quyền chủ động thành công là bàn giao chính thức, thay thế đích hoàn quyền của lần mất mạng trước; người host trước bàn giao không tự lấy lại quyền.

**Kế vị và hoàn quyền khi nhiều sự cố — đã chốt ngày 04/11/2026:**

- Giữ một đích hoàn quyền gốc trong cùng phiên. A là host, B thay tạm rồi mất kết nối, C thay tiếp: đích vẫn là A. B quay lại khi C còn hợp lệ thì là member, không giành host từ C; A quay lại hợp lệ mới tự hoàn quyền. Nếu không còn host tạm connected, một participant quay lại hợp lệ có thể được chọn tạm, nhưng không thay đích A.
- Không có ứng viên connected nhưng còn ownership trong reconnect grace thì giữ phiên chờ các deadline grace hiện có, không cấp quyền điều hành cho kết nối đã mất. Người quay lại được kiểm quyền; đúng đích gốc thì hoàn quyền, người khác chỉ được chọn tạm khi chưa có host hợp lệ. Hết mọi grace mà không còn người thì ENDING ngay, không thêm empty grace. Join/resume/election/end được serialize.
- Host hoặc đích hoàn quyền bị thu auth/quyền kênh thì thu tài nguyên và xóa đích hoàn quyền liên quan, chọn người connected/hợp lệ thay thế. Khi người bị thu được cấp lại quyền và vào lại, họ là member; không tự lấy lại host. Bàn giao chính thức cũng thay đích hoàn quyền gốc theo quy tắc trên. Host tạm khác bị thu quyền không xóa đích A còn hợp lệ.
- Không dựng một chồng đích hoàn quyền theo từng host tạm. Khi không có đích gốc còn hợp lệ, host mới được chọn làm đầu mối hiện hành; những lần mất kết nối tiếp theo áp dụng cùng quy tắc. Phiên ENDED không phục hồi vai trò.

### 8.4. Audio graph

```text
remote mic mỗi người → participantGain → discussionBus ─┐
host hướng dẫn chung   → participantGain → priorityBus   ─┼→ master → output
screen audio        → screenGain      → screenBus    ─┘
```

Chỉ nguồn đã được policy cấp mới vào graph: DISCUSSION có tiếng giảng MAIN và tiếng nhóm; ACTIVITY chỉ có nguồn của nhóm/host hỗ trợ, không có bus nghe giảng MAIN mặc định.

Mỗi track chỉ đi một bus theo scope hiện tại, không nhân stream. `effectiveGain = master × participantGain × busGain × announcementFactor`; chỉ discussionBus có factor giảm khi thông báo. Không giảm chính host đang được ưu tiên. Ramp gain ngắn; khi kết thúc chỉ bỏ factor, không ghi đè gain cá nhân; mute local vẫn là 0.

Preference lưu cục bộ theo user/Workspace/người nói, không theo producerId tạm. Không gắn cùng track vào audio element có tiếng và Web Audio output. Có nút bật âm thanh khi autoplay chặn, không loop mic local ra loa. Nhiều nguồn có thể cộng gây clipping dù từng gain ≤1; thử headroom/limiter khi cần. Announcement tối đa 30 giây, có timeout khôi phục cả khi host rớt. Volume không thay quyền: nguồn trái quyền không được nhận dù gain=0.

## 11. Reconnect và vòng đời tài nguyên

### 11.1. Control lease và resume

Socket disconnect không chứng minh media đã ngừng. Khi server nhận disconnect: chuyển participant sang RECONNECTING, chặn mutation mới, kết thúc announcement của nguồn đó, reconcile các Consumer theo quyền/scope hiện tại. Không được giữ quyền global chỉ vì mic WebRTC còn chạy. Với mạng đứt mà chưa được phát hiện, control lease có deadline server và heartbeat; cửa sổ phát hiện này phải được đo.

Giữ call ownership tối đa 30 giây từ disconnect hoặc control lease hết hạn để reconnect; MAIN/ACTIVITY được đối soát theo quyền hiện hành, media thông thường còn lại được đóng chậm nhất cuối grace. Hai ngoại lệ thu ngay: mọi quyền của kết nối host cũ và membership/private scope DISCUSSION. Người mất kết nối ở DISCUSSION quay lại MAIN; nhóm từng có người mà rỗng thì đóng ngay. Trong grace vẫn áp dụng mọi kick/revoke/deadline mới; ACTIVITY hết hạn không được phục hồi. Deadline không kéo dài bởi request cũ/generation cũ. Sau grace, đóng toàn bộ participant resources và phải join lại; không tự phục hồi quyền cũ.

Không có empty grace riêng. Sau khi xử lý leave/hết reconnect grace, nếu không còn participant connected hoặc ownership còn hợp lệ trong grace thì chuyển ENDING ngay. Một người đang được giữ ownership trong reconnect grace chưa làm phiên thành rỗng. Join và quyết định kết thúc phải serialize: join thắng trước thì phiên tiếp tục; ENDING thắng trước thì từ chối join cho tới khi cleanup xong. Host chủ động kết thúc/rời khi còn quyền vẫn end ngay cho mọi người.

Resume ticket ngắn hạn, một lần, gắn auth/session epoch/callGeneration, rotate sau mỗi resume. Khi reconnect: auth và Origin/CSRF lại → kiểm registry/current membership → bind socket mới → gửi projection mới → recreate/reconcile transport nếu cần. Ticket không chứa quyền cũ để phục hồi. Nếu hết ticket nhưng còn auth hợp lệ, server chỉ cấp lại quyền resume sau kiểm participant/call ownership hiện hành; không chiếm call thiết bị mới.

### 11.2. Bảng vòng đời

| Tình huống                                 | Xử lý bắt buộc                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Transport failed                           | Close mapping cũ; ICE restart hoặc tạo transport theo adapter; không nhân Producer                                            |
| Rời phòng chủ động                         | Hủy intent/ticket/grant; leave fanout; close tracks/audio nodes/client controller và tài nguyên server                        |
| Kick/mất channel access/logout/auth expiry | Deny barrier; close media/socket liên quan, chặn file/REST ngay                                                               |
| Chuyển nhóm                                | Thu old scope trước, cấp new scope; hủy intent cũ; cập nhật đích chat theo scope                                              |
| Group đóng                                 | Kết thúc help liên quan; về MAIN; pause mic người chuyển để tự bật lại; khóa history/ảnh nhóm và dọn board hết refs           |
| Stop share                                 | Close screen + audio; invalidate intent/live overlay; frame frozen có trạng thái nguồn đã dừng                                |
| Host rớt                                   | Thu ngay mọi quyền kết nối cũ; chọn host tạm ngay, host cũ quay lại hợp lệ tự nhận lại quyền; không đợi reconnect grace       |
| Người cuối rời                             | Nếu không còn participant connected/ownership trong reconnect grace thì ENDING ngay; không empty grace. Join và end serialize |
| Host kết thúc phiên                        | ENDING ngay, deny join/mutation, thu tất cả resources và khóa private conversations                                           |
| Worker chết                                | ENDED phiên liên quan, invalidate epoch, báo client join phiên mới; worker restart có health rõ                               |
| App restart                                | Invalidate runtime/resume đời cũ; đóng metadata stale/private history trước readiness                                         |
| Xóa kênh/Workspace                         | Khóa đọc trước cleanup; kết thúc session; file không tiếp tục được cấp qua URL cũ                                             |

Resource generation giúp late `transportclose/producerclose/disconnect` không xóa nhầm object đời mới. Mọi close idempotent; đóng server phải báo client và ngược lại, không trông chờ thư viện tự đồng bộ nghiệp vụ.

### 11.3. Leave nhóm và countdown

`group.leave` chuyển chính actor về MAIN theo [group modes](group-modes.md); không phải session.leave hoặc quyền chuyển người khác. Thu nguồn/Consumer nhóm cũ, đóng share nhóm của người rời, pause mic trước khi cấp MAIN. Reconnect dùng group mode/membership/source hiện tại; không phục hồi quyền share từ client cache. Countdown ACTIVITY lấy deadline/round hiện tại, không reset; đến hạn server tự kết thúc đúng lượt và đưa người còn quyền về MAIN, thu scope nhóm/pause mic. Reconnect sau deadline không mở lại nhóm cũ; callback cũ không tác động lượt mới. Test cùng nhóm chỉ một share thắng, hai nhóm share đồng thời, không có bước hệ thống tạo khi hợp lệ; reconnect không tự resume share hoặc join DISCUSSION khi đang phase ACTIVITY.

## Giới hạn hỗ trợ nhóm — quyết định 02/11/2026

Host chỉ vào hỗ trợ ACTIVITY; DISCUSSION hỏi/trả lời qua chat riêng khi host ở MAIN. Người cuối cùng chủ động về MAIN hoặc rời LIVE làm DISCUSSION đã có người tự kết thúc theo [group modes](group-modes.md); nhóm tạo hợp lệ chưa ai vào vẫn chờ, nhóm còn người cho roster hợp lệ chủ động vào lại. Khi phát hiện disconnect/control lease hết hạn, DISCUSSION thu membership ngay; nhóm từng có người rỗng thì đóng, reconnect về MAIN. Call ownership vẫn có reconnect grace; ACTIVITY kiểm phân công/deadline hiện hành khi vào lại.

## Recording MAIN — sau kickoff

Theo [RECORD-01](recording.md), chỉ host hiện hành ghi/dừng, recorder nhận màn hình/camera/âm thanh MAIN; không nhận nhóm riêng hoặc đi theo host vào hỗ trợ. Video theo phiên/kênh, người xem cần quyền hiện hành. Chưa chọn pipeline, quota/retention hoặc chứng minh record chạy thật.
