# Quyền nhóm, nguồn media và điều hành

**Trạng thái:** Policy đích; scaffold chưa triển khai module policy, grant hoặc nhóm.

Nguồn ban đầu được trích chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đã cập nhật theo quyết định team ngày 27/10/2026 trong technical plan v2.3. Đây là nguồn chi tiết hiện hành cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## 5. Phân quyền phát, nhận và công bố

### 5.1. Ba lớp quyền

Workspace: owner/admin/member. Session: host/member. Grant cụ thể: publish/share, board. Admin không mặc nhiên là host và không nghe nhóm riêng. Owner/admin quản lý kênh; member không tự đổi role. PRIVATE dùng allowlist rõ; owner/admin quản lý cấu hình không đồng nghĩa tự có quyền đọc private session.

Host chỉ điều hành session mà mình đang tham gia. Chỉ có một kiểu cuộc họp: người bắt đầu LiveSession trở thành host, không có bước bật chế độ điều hành. Người vào sau không tự nhận hoặc giành host; host chuyển quyền trực tiếp cho participant hợp lệ, không cần người nhận chấp nhận. Chỉ một host tại một thời điểm; không thêm co-host/presenter. Owner/admin Workspace không mặc nhiên là host. Xem [vòng đời host](live-session.md#83-chuyển-host-và-host-mất-mạng) cho cơ chế host tạm ngẫu nhiên ngay khi phát hiện host mất kết nối và tự hoàn quyền khi host cũ quay lại; host chủ động rời khi còn giữ quyền kết thúc phiên cho mọi người; sau bàn giao chính thức người cũ rời như thành viên. Không có ứng viên/host tạm mất mạng vẫn là điểm mở.

### 5.2. Quyền publish theo bối cảnh

Nguồn chi tiết: [MAIN / DISCUSSION / ACTIVITY](group-modes.md). Mọi cuộc họp đều có các chức năng điều hành theo quyền host; không dùng thì gọi ở MAIN bình thường. DISCUSSION/ACTIVITY vẫn là hai loại nhóm, không phải hai chế độ cuộc họp.

| Nguồn/thao tác      | MAIN                                                            | DISCUSSION                                          | ACTIVITY                                                                          |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| MIC/CAMERA          | Participant tự bật/tắt; audience theo scope                     | Thành viên trao đổi riêng trong nhóm                | Thành viên trao đổi riêng trong nhóm                                              |
| Bắt đầu share       | Mọi participant ở MAIN tự share khi nguồn trống, không xin host | Thành viên bị từ chối; ẩn UI không thay kiểm server | Mọi member trong nhóm tự share, không hệ thống tạo khi hợp lệ; nguồn bận phải chờ |
| SCREEN/SCREEN_AUDIO | Một người share MAIN; audio đi kèm nguồn hợp lệ                 | Không publish nguồn riêng; kế thừa MAIN             | Một nguồn đang share/group; chỉ audience nhóm, không dùng lease MAIN              |
| Freeze/vẽ           | Không freeze; chỉ host vẽ LIVE                                  | Board nhóm trên hình bài giảng MAIN                 | Board nhóm trên nguồn screen duy nhất đang share của nhóm                         |
| Undo/clear          | Chỉ host: undo nét mình, clear có xác nhận                      | Cùng quy tắc, trong context nhóm                    | Cùng quy tắc, trong context nhóm                                                  |

Server kiểm actor, transport ownership, group mode/scope, source/kind, quota, revision, lease/ownership. Không cho client tự khai ACTIVITY hoặc dùng quyền share MAIN để vượt lệnh cấm của DISCUSSION. MAIN và mỗi ACTIVITY độc quyền nguồn riêng theo quyết định đã chốt; reserve lease tự động không là xin host duyệt.

MAIN chỉ host hiện hành có quyền vẽ/clear, người share khác host không được vẽ. Nét thường/nét tự biến mất theo [board](board-collaboration.md); MAIN không freeze/resume. Nhóm clear theo baseline: chủ frame còn trong scope hoặc chủ nguồn share của context LIVE; host chỉ clear khi có quyền đọc/vẽ context hiện tại. Khi quyền bị thu, đóng nguồn liên quan và Consumer server. Không chứng thực được nội dung track chỉ bằng nhãn nguồn client.

### 5.3. Quyền nhận và đọc

| Nguồn                                   | Audience được nhận                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| MAIN screen + screen audio              | Người ở MAIN và thành viên DISCUSSION có quyền; không tự gửi tới ACTIVITY                |
| MIC/CAMERA participant MAIN             | Người ở MAIN; riêng mic/camera host hướng dẫn được cấp theo dòng dưới                    |
| Host hướng dẫn tại MAIN                 | MAIN và DISCUSSION; không tự phát mic/camera/announcement vào ACTIVITY                   |
| MIC/CAMERA/SCREEN/SCREEN_AUDIO của nhóm | Cùng group; host chỉ khi đang hỗ trợ đúng ACTIVITY; không phát sang MAIN hoặc group khác |
| MIC/CAMERA host khi hỗ trợ GROUP        | ACTIVITY đang hỗ trợ; không đồng thời phát hỗ trợ sang MAIN/group khác                   |
| Everyone / SESSION chat                 | Participant hiện tại MAIN; không phát cho group khác                                     |
| Board/chat nhóm                         | Participant hiện thuộc nhóm; host chỉ đọc khi đang hỗ trợ đúng ACTIVITY                  |
| HOST_PRIVATE                            | Người gửi và đúng host nhận ban đầu, khi phiên ACTIVE và cả hai còn quyền kênh           |

`canConsume` kiểm đời Producer, audience, group mode và state hiện tại trước `router.canConsume()`. Tạo paused và kiểm lại lúc ready; revoke đóng Consumer. Endpoint, event và metadata nguồn dùng cùng ACL. Không dùng gain=0 để giả isolation. [mediasoup communication](https://mediasoup.org/documentation/v3/communication-between-client-and-server/).

### 5.4. Snapshot và dữ liệu lịch sử

`projectSessionFor(viewer)` chỉ trả metadata được phép: danh sách nhóm/số người có thể công khai trong session; producer IDs private, frame URL, nét, tin riêng chỉ tới audience phù hợp. Không gửi raw runtime map.

Khi đổi scope: rời fanout cũ, cập nhật `audienceEpoch`, xóa dữ liệu private cũ trong client cache, rồi nhận snapshot mới. Client bỏ event cũ theo epoch/version nhưng server vẫn phải chặn phát sai. Không bật tự replay packet private của Socket.IO; reconnect dùng snapshot mới và API lịch sử có ACL. [Socket.IO recovery](https://socket.io/docs/v4/connection-state-recovery/).

Người mới vào group được đọc phần lịch sử group trong phiên đang ACTIVE; người rời mất quyền đọc tiếp. Host chỉ đọc group ACTIVITY khi đang hỗ trợ; không vào hỗ trợ DISCUSSION. Đóng group/session khóa API đọc private, không mở rộng sang Workspace. Nội dung đã được người nhận xem hoặc tải không thể thu hồi khỏi bộ nhớ/ảnh chụp của họ.

### 8.1. Host, group và hỗ trợ

- Trong cuộc họp, DISCUSSION đi qua yêu cầu tên/mục đích/thành viên, hệ thống tạo khi hợp lệ rồi từng người được chọn bấm Vào nhóm; ACTIVITY do host tạo/phân khi chuyển sang lượt hoạt động. Theo [group modes](group-modes.md), người chưa phân vẫn ở MAIN; host không là thành viên mọi group.
- Thành viên có thể tự về MAIN; host có thể đóng một/tất cả DISCUSSION; không điều chuyển người, thành viên chỉ tự vào lại đúng ACTIVITY đã phân còn mở. ACTIVITY chỉ kết thúc theo deadline/lỗi bắt đầu/kết thúc phiên, không có lệnh host đóng thủ công. Chuyển group thu media/chat/board/screen cũ trước, cập nhật membership và cấp nguồn mới. Đóng nhóm kết thúc help liên quan, đưa thành viên của nhóm đó về MAIN; private history bị khóa, nhóm khác không bị đóng theo.
- Chat cuộc họp chỉ gửi text và ảnh, chọn **Everyone** hoặc **Host**. Everyone ánh xạ vào scope hiện tại: không chia nhóm là SESSION/MAIN; khi đang chia nhóm, thành viên trong group gửi vào GROUP đó, người chưa phân nhóm gửi vào MAIN. Everyone không phát xuyên các nhóm. Host đang hỗ trợ dùng group hỗ trợ làm scope Everyone; ngoài hỗ trợ dùng MAIN. UI ghi rõ đích gửi và đổi nhãn theo scope.
- Host ánh xạ vào HOST_PRIVATE giữa người gửi và đúng host nhận tại thời điểm gửi; không có nhắn riêng tùy ý tới mọi participant. Không có host hợp lệ thì vô hiệu lựa chọn Host và báo rõ, không tự đổi sang Everyone.
- Server kiểm scope/host hiện tại khi gửi và bind ảnh; đích đã stale do chuyển nhóm/host phải trả lỗi để người dùng xác nhận đích mới, không tự chuyển tin private sang Everyone hoặc host mới. Lịch sử/ảnh cũ giữ ACL ban đầu.
- Ảnh có thể upload hoặc gửi ảnh chụp canvas hiện tại theo quyền; đây là attachment trong phiên, không là thư viện bài làm. Tệp bất kỳ chỉ thuộc chat/tài liệu kênh, không thuộc chat cuộc họp. Chọn Host không tự cấp quyền board cho host hay tự chuyển mic.
- `host.help.enter` kiểm mode ACTIVITY và cấp quyền group đích, chuyển MIC host sang GROUP, hiển thị host đã vào trước khi mở scope hỗ trợ. Vào B thì thu A trước.
- `host.help.leave` là thao tác host chủ động rời nhóm hỗ trợ về MAIN, độc lập với bật/tắt mic và không yêu cầu xác nhận mic riêng. Thu quyền nhận/phát ở nhóm trước khi chuyển phạm vi; mic giữ nguyên trạng thái: đang bật thì từ lúc chuyển phát theo MAIN/hướng dẫn cho DISCUSSION, đang tắt thì vẫn tắt. UI hiển thị phạm vi hiện tại; ACTIVITY khác không nhận nguồn đó. Mất mạng/timeout/đóng nhóm ngoài thao tác rời chủ động không tự phát mic global.
- Hỏi bằng tin nhắn không tự đổi scope mic. Host cũ giữ quyền đọc tin gửi riêng cho mình trong phiên theo ACL; host mới không tự nhận lịch sử đó. Người gửi có thể gửi câu hỏi mới cho host mới.

**Giới hạn hỗ trợ đã chốt ngày 02/11/2026:** `host.help.enter` chỉ hợp lệ với ACTIVITY đang mở trong lượt còn hiệu lực. DISCUSSION chỉ hỏi/trả lời riêng qua HOST_PRIVATE; host tiếp tục ở MAIN, không nhận nội dung riêng của nhóm bằng vai trò host. UI không có nút Vào hỗ trợ DISCUSSION và server phải từ chối cả lệnh tự gửi. Tin/ảnh riêng chỉ cấp quyền trên nội dung được gửi, không cấp quyền toàn bộ board nhóm.

Theo [vòng đời DISCUSSION](group-modes.md), tự về MAIN không đóng nhóm khi còn người khác; người cuối cùng chủ động rời nhóm đã có người tham gia làm nhóm tự kết thúc. Thu toàn bộ private scope của nhóm trước khi báo đã đóng; roster cũ không cấp lại quyền. Nhóm chưa ai vào vẫn chờ; disconnect thu membership DISCUSSION ngay, nhóm từng có người rỗng thì đóng, reconnect về MAIN. ACTIVITY không tự đóng theo số người còn lại.

### 8.2. Kết thúc chia nhóm và về phòng chung

- ACTIVITY: deadline server hết hạn tự kết thúc toàn lượt và đưa người còn quyền về MAIN, không chờ host. DISCUSSION: host vẫn có thể đóng một hoặc tất cả nhóm trao đổi, hoặc chúng được đóng trước khi bắt đầu ACTIVITY. Không xóa vai trò host; không có lệnh host kết thúc thủ công ACTIVITY trong scope hiện tại.
- Kết thúc help và thu quyền media/chat/board liên quan tới các nhóm đang đóng trước khi đưa người còn quyền về MAIN. Đóng một DISCUSSION chỉ tác động nhóm đích; nhóm khác tiếp tục. Hết lượt ACTIVITY đóng mọi ACTIVITY của lượt; người đã ở MAIN không bị reset thiết bị. Không xóa announcement MAIN còn hợp lệ chỉ vì đóng một DISCUSSION; snapshot thể hiện đúng phạm vi đã thay đổi.
- Mic của người chuyển từ nhóm về MAIN được pause ở server; người dùng tự bật lại để phát biểu. Không tự bật thiết bị đã tắt; camera đang bật chuyển sang audience MAIN theo policy, nên UI phải thông báo rõ phạm vi phòng chung. Host chủ động rời help dùng 8.1; hết giờ đóng nhóm là cleanup tự động, không áp nhánh giữ mic để phát tiếng hỗ trợ ra MAIN.
- Người ở MAIN nghe/xem nhau theo policy MAIN và vẫn nhận main screen. Không có FloorGrant, lời mời/consent phát biểu hay PresentationView. Không tự mang frame/nét/chat nhóm ra phòng chung; board MAIN là context riêng.
- Conversation nhóm đóng, API history/ảnh nhóm bị khóa và frame/nét nhóm vào cleanup theo lifecycle. Reconnect hoặc lệnh chậm từ nhóm cũ không mở lại nhóm, mic hay đích gửi cũ.
- Announcement chỉ phát tại scope hướng dẫn MAIN/DISCUSSION; host đang hỗ trợ phải kết thúc hỗ trợ về MAIN trước, theo thao tác rời tại 8.1, không có xác nhận mic riêng. Không tự quay lại hỗ trợ sau announcement.

### 8.5. Countdown cho lượt hoạt động

TIMER-01 theo [thời lượng chung](group-modes.md#thời-lượng-chung-cho-lượt-hoạt-động--timer-01): deadline server và countdown chung; hết giờ tự đóng các ACTIVITY của lượt, thu scope cũ và đưa người còn quyền về MAIN. Mic từ nhóm về được pause để tự bật lại; không công khai chat/board. Không áp mặc định cho DISCUSSION.

Phase giảng/hoạt động theo [group modes](group-modes.md#hai-giai-đoạn-không-chồng-nhau): kết thúc DISCUSSION trước ACTIVITY; không tạo/join DISCUSSION khi đang ACTIVITY. Hết thời lượng, hệ thống kết thúc lượt và hoàn tất cleanup về MAIN/GUIDANCE rồi mới nhận request DISCUSSION lại.

## Recording MAIN — sau kickoff

Theo [RECORD-01](recording.md), chỉ host hiện hành ghi/dừng, recorder nhận màn hình/camera/âm thanh MAIN; không nhận nhóm riêng hoặc đi theo host vào hỗ trợ. Video theo phiên/kênh, người xem cần quyền hiện hành. Chưa chọn pipeline, quota/retention hoặc chứng minh record chạy thật.
