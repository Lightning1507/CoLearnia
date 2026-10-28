# Quyền nhóm, nguồn media và điều hành

**Trạng thái:** Policy đích; scaffold chưa triển khai module policy, grant hoặc nhóm.

Nguồn ban đầu được trích chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đã cập nhật theo quyết định team ngày 27/10/2026 trong technical plan v2.3. Đây là nguồn chi tiết hiện hành cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## 5. Phân quyền phát, nhận và công bố

### 5.1. Ba lớp quyền

Workspace: owner/admin/member. Session: host/member. Grant cụ thể: publish/share, board. Admin không mặc nhiên là host và không nghe nhóm riêng. Owner/admin quản lý kênh; member không tự đổi role. RESTRICTED dùng allowlist rõ; owner/admin quản lý cấu hình không đồng nghĩa tự có quyền đọc private session.

Host chỉ điều hành session mà mình đang tham gia. Chỉ có một kiểu cuộc họp: người bắt đầu LiveSession trở thành host, không có bước bật chế độ điều hành. Người vào sau không tự nhận hoặc giành host; host chuyển quyền cho participant khác và người nhận xác nhận. Owner/admin Workspace không mặc nhiên là host. Xem [vòng đời host](live-session.md#83-chuyển-host-và-host-mất-mạng) cho cơ chế host tạm ngẫu nhiên khi mất mạng quá grace và tự hoàn quyền khi host cũ quay lại; rời chủ động/nhiều sự cố còn cần đặc tả.

### 5.2. Quyền publish theo bối cảnh

Nguồn chi tiết: [MAIN / DISCUSSION / ACTIVITY](group-modes.md). Mọi cuộc họp đều có các chức năng điều hành theo quyền host; không dùng thì gọi ở MAIN bình thường. DISCUSSION/ACTIVITY vẫn là hai loại nhóm, không phải hai chế độ cuộc họp.

| Nguồn/thao tác      | MAIN                                                            | DISCUSSION                                          | ACTIVITY                                                             |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| MIC/CAMERA          | Participant tự bật/tắt; audience theo scope                     | Thành viên trao đổi riêng trong nhóm                | Thành viên trao đổi riêng trong nhóm                                 |
| Bắt đầu share       | Mọi participant ở MAIN tự share khi nguồn trống, không xin host | Thành viên bị từ chối; ẩn UI không thay kiểm server | Mọi member trong nhóm tự share, không host duyệt; nguồn bận phải chờ |
| SCREEN/SCREEN_AUDIO | Một người share MAIN; audio đi kèm nguồn hợp lệ                 | Không publish nguồn riêng; kế thừa MAIN             | Một nguồn đang share/group; chỉ audience nhóm, không dùng lease MAIN |
| Freeze/vẽ           | Board MAIN                                                      | Board nhóm trên hình bài giảng MAIN                 | Board nhóm trên nguồn screen duy nhất đang share của nhóm            |
| Undo/clear          | Undo nét mình; clear theo quyền context                         | Cùng quy tắc, trong context nhóm                    | Cùng quy tắc, trong context nhóm                                     |

Server kiểm actor, transport ownership, group mode/scope, source/kind, quota, revision, lease/ownership. Không cho client tự khai ACTIVITY hoặc dùng quyền share MAIN để vượt lệnh cấm của DISCUSSION. MAIN và mỗi ACTIVITY độc quyền nguồn riêng theo quyết định đã chốt; reserve lease tự động không là xin host duyệt.

Clear theo baseline: chủ frame còn trong scope hoặc chủ nguồn share của context LIVE; host chỉ clear khi có quyền đọc/vẽ context hiện tại. Khi quyền bị thu, đóng nguồn liên quan và Consumer server. Không chứng thực được nội dung track chỉ bằng nhãn nguồn client.

### 5.3. Quyền nhận và đọc

| Nguồn                                   | Audience được nhận                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| MAIN screen + screen audio              | Người ở MAIN và thành viên DISCUSSION có quyền; không tự gửi tới ACTIVITY         |
| MIC/CAMERA participant MAIN             | Người ở MAIN; riêng mic/camera host hướng dẫn được cấp theo dòng dưới             |
| Host hướng dẫn tại MAIN                 | MAIN và DISCUSSION; không tự phát mic/camera/announcement vào ACTIVITY            |
| MIC/CAMERA/SCREEN/SCREEN_AUDIO của nhóm | Cùng group; host khi đang hỗ trợ đúng group; không phát sang MAIN hoặc group khác |
| MIC/CAMERA host khi hỗ trợ GROUP        | Group đang hỗ trợ; không đồng thời phát hỗ trợ sang MAIN/group khác               |
| Everyone / SESSION chat                 | Participant hiện tại MAIN; không phát cho group khác                              |
| Board/chat nhóm                         | Participant hiện thuộc nhóm; host đọc khi đang hỗ trợ đúng nhóm                   |
| HOST_PRIVATE                            | Người gửi và đúng host nhận ban đầu, khi phiên ACTIVE và cả hai còn quyền kênh    |

`canConsume` kiểm đời Producer, audience, group mode và state hiện tại trước `router.canConsume()`. Tạo paused và kiểm lại lúc ready; revoke đóng Consumer. Endpoint, event và metadata nguồn dùng cùng ACL. Không dùng gain=0 để giả isolation. [mediasoup communication](https://mediasoup.org/documentation/v3/communication-between-client-and-server/).

### 5.4. Snapshot và dữ liệu lịch sử

`projectSessionFor(viewer)` chỉ trả metadata được phép: danh sách nhóm/số người có thể công khai trong session; producer IDs private, frame URL, nét, tin riêng chỉ tới audience phù hợp. Không gửi raw runtime map.

Khi đổi scope: rời fanout cũ, cập nhật `audienceEpoch`, xóa dữ liệu private cũ trong client cache, rồi nhận snapshot mới. Client bỏ event cũ theo epoch/version nhưng server vẫn phải chặn phát sai. Không bật tự replay packet private của Socket.IO; reconnect dùng snapshot mới và API lịch sử có ACL. [Socket.IO recovery](https://socket.io/docs/v4/connection-state-recovery/).

Người mới vào group được đọc phần lịch sử group trong phiên đang ACTIVE; người rời mất quyền đọc tiếp. Host chỉ đọc group khi đang hỗ trợ. Đóng group/session khóa API đọc private, không mở rộng sang Workspace. Nội dung đã được người nhận xem hoặc tải không thể thu hồi khỏi bộ nhớ/ảnh chụp của họ.

### 8.1. Host, group và hỗ trợ

- Trong cuộc họp, DISCUSSION đi qua yêu cầu tên/mục đích/thành viên, host duyệt rồi từng người được chọn bấm Vào nhóm; ACTIVITY do host tạo/phân khi chuyển sang lượt hoạt động. Theo [group modes](group-modes.md), người chưa phân vẫn ở MAIN; host không là thành viên mọi group.
- Thành viên có thể tự về MAIN; host vẫn có thể chuyển người/đóng nhóm. Chuyển group thu media/chat/board/screen cũ trước, cập nhật membership và cấp nguồn mới. Close group kết thúc help liên quan, đưa thành viên về MAIN; private history bị khóa.
- Chat cuộc họp chỉ gửi text và ảnh, chọn **Everyone** hoặc **Host**. Everyone ánh xạ vào scope hiện tại: không chia nhóm là SESSION/MAIN; khi đang chia nhóm, thành viên trong group gửi vào GROUP đó, người chưa phân nhóm gửi vào MAIN. Everyone không phát xuyên các nhóm. Host đang hỗ trợ dùng group hỗ trợ làm scope Everyone; ngoài hỗ trợ dùng MAIN. UI ghi rõ đích gửi và đổi nhãn theo scope.
- Host ánh xạ vào HOST_PRIVATE giữa người gửi và đúng host nhận tại thời điểm gửi; không có nhắn riêng tùy ý tới mọi participant. Không có host hợp lệ thì vô hiệu lựa chọn Host và báo rõ, không tự đổi sang Everyone.
- Server kiểm scope/host hiện tại khi gửi và bind ảnh; đích đã stale do chuyển nhóm/host phải trả lỗi để người dùng xác nhận đích mới, không tự chuyển tin private sang Everyone hoặc host mới. Lịch sử/ảnh cũ giữ ACL ban đầu.
- Ảnh có thể upload hoặc gửi ảnh chụp canvas hiện tại theo quyền; đây là attachment trong phiên, không là thư viện bài làm. Tệp bất kỳ chỉ thuộc chat/tài liệu kênh, không thuộc chat cuộc họp. Chọn Host không tự cấp quyền board cho host hay tự chuyển mic.
- `host.help.enter` cấp quyền group đích, chuyển MIC host sang GROUP, hiển thị host đã vào trước khi mở scope hỗ trợ. Vào B thì thu A trước.
- `host.help.leave` có thao tác ghi rõ quay lại hướng dẫn toàn phòng. Nếu MIC đang bật, UI yêu cầu xác nhận chuyển phạm vi về MAIN/hướng dẫn cho DISCUSSION; không tự phát global chỉ vì timeout/mất mạng.
- Hỏi bằng tin nhắn không tự đổi scope mic. Host cũ giữ quyền đọc tin gửi riêng cho mình trong phiên theo ACL; host mới không tự nhận lịch sử đó. Người gửi có thể gửi câu hỏi mới cho host mới.

### 8.2. Kết thúc chia nhóm và về phòng chung

- Host chọn **Kết thúc chia nhóm / Đưa tất cả về phòng chung**. Đây là một thao tác toàn phiên; không chỉ gọi nhóm được chọn và không xóa vai trò host.
- Kết thúc help/announcement đang diễn ra; thu quyền media/chat/board của các group trước khi đóng nhóm, đặt mọi participant về MAIN và tắt breakout. Snapshot mới hiển thị rõ đã về phòng chung.
- Mic của người chuyển từ nhóm về MAIN được pause ở server; người dùng tự bật lại để phát biểu. Không tự bật thiết bị đã tắt; camera đang bật chuyển sang audience MAIN theo policy, nên UI phải thông báo rõ phạm vi phòng chung. Host kết thúc help vẫn theo quy tắc xác nhận scope mic tại 8.1.
- Người ở MAIN nghe/xem nhau theo policy MAIN và vẫn nhận main screen. Không có FloorGrant, lời mời/consent phát biểu hay PresentationView. Không tự mang frame/nét/chat nhóm ra phòng chung; board MAIN là context riêng.
- Conversation nhóm đóng, API history/ảnh nhóm bị khóa và frame/nét nhóm vào cleanup theo lifecycle. Reconnect hoặc lệnh chậm từ nhóm cũ không mở lại nhóm, mic hay đích gửi cũ.
- Announcement từ hỗ trợ riêng vẫn yêu cầu xác nhận kết thúc help và chuyển về scope hướng dẫn MAIN/DISCUSSION; không tự quay lại hỗ trợ sau announcement.

### 8.5. Countdown cho lượt hoạt động

TIMER-01 theo [thời lượng chung](group-modes.md#thời-lượng-chung-cho-lượt-hoạt-động--timer-01): deadline server, đếm ngược và nhắc hết giờ, host chủ động kết thúc. Không tự close/mute/move và không mặc định áp cho nhóm DISCUSSION.

Phase giảng/hoạt động theo [group modes](group-modes.md#hai-giai-đoạn-không-chồng-nhau): kết thúc DISCUSSION trước ACTIVITY; không nhận/duyệt/join DISCUSSION khi đang ACTIVITY. Host kết thúc lượt về MAIN rồi mới nhận request lại; timer expired không đổi phase.
