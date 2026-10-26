# Quyền nhóm, nguồn media và điều hành

**Trạng thái:** Policy đích; scaffold chưa triển khai module policy, grant hoặc nhóm.

Trích chuyển nguyên nội dung tương ứng từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đây là nguồn chi tiết cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## 5. Phân quyền phát, nhận và công bố

### 5.1. Ba lớp quyền

Workspace: owner/admin/member. Session: host/member. Grant cụ thể: publish/share, board, floor, presentation. Admin không mặc nhiên là host và không nghe nhóm riêng. Owner/admin quản lý kênh; member không tự đổi role. RESTRICTED dùng allowlist rõ; owner/admin quản lý cấu hình không đồng nghĩa tự có quyền đọc private session.

Host chỉ điều hành session mà mình đang tham gia. FREE không có breakout. Một participant có thể yêu cầu chuyển FREE → MODERATED và nhận host nếu chưa có host, qua mutation nguyên tử và thông báo toàn phòng; không cướp host. Chuyển về FREE đóng nhóm, floor/presentation/help/announcement theo đúng thứ tự thu quyền.

### 5.2. Quyền publish

| Nguồn/thao tác | FREE                                             | MODERATED                                                            |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| MIC            | Participant tự bật/tắt; tối đa một nguồn         | Tương tự; nơi nhận theo policy, không theo client                    |
| CAMERA         | Participant tự bật/tắt; tối đa một nguồn         | Tương tự; không tự global khi floor active                           |
| Xin share      | Participant hợp lệ, không có lease khác          | Host; hoặc người được host cấp share grant hiện hành                 |
| SCREEN         | Chỉ chủ lease, một nguồn video                   | Cùng quy tắc và share grant còn hạn                                  |
| SCREEN_AUDIO   | Tối đa một audio đi kèm lease/screen             | Cùng quy tắc; thu cùng screen/grant                                  |
| Freeze/vẽ      | Participant trong MAIN có board access           | Participant cùng group; host khi đang hỗ trợ; MAIN theo board access |
| Clear board    | Chủ frame còn trong scope, hoặc chủ share ở LIVE | Thêm host nếu có quyền đọc/vẽ context hiện tại                       |

Undo chỉ tác động nét do mình tạo. Server kiểm actor, transport ownership, kind/source, quota, epoch, grant và lease. Khi lease/grant bị thu, nguồn liên quan cũng bị đóng. Share grant không phải floor grant.

Server kiểm quyền publish và định tuyến, không chứng thực được nội dung audio thật sự là mic hay tab chỉ từ nhãn nguồn. Bản đầu không cam kết chống publisher cố ý đưa nội dung khác vào track được phép công bố.

### 5.3. Quyền nhận và đọc

| Nguồn                               | Người được nhận                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Main screen + screen audio          | Participant đang có quyền session/channel                                      |
| MIC/CAMERA trong FREE               | Các participant MAIN, trừ chính nguồn cần tránh self audio                     |
| MIC/CAMERA thành viên khi breakout  | Cùng group; MAIN chỉ nghe/xem MAIN; host được nhận group đang hỗ trợ           |
| MIC host khi GLOBAL                 | Cả session                                                                     |
| MIC host khi GROUP                  | Chỉ group đang hỗ trợ                                                          |
| CAMERA host trong MODERATED         | Cả session; không dùng camera để suy ra quyền audio                            |
| MIC người có floor ACTIVE + consent | Toàn session, lấy hợp với quyền nhóm, không nhân đôi                           |
| CAMERA người có floor               | Giữ phạm vi cũ; không tự mở rộng                                               |
| Board/chat nhóm                     | Participant hiện thuộc nhóm; host đọc board/chat khi đang hỗ trợ               |
| HOST_PRIVATE                        | Người gửi và đúng host nhận ban đầu, khi phiên ACTIVE và cả hai còn quyền kênh |
| Presentation                        | Participant session đọc projection đã chọn khi presentation còn ACTIVE         |

`canConsume` kiểm đúng đời Producer và trạng thái hiện tại, rồi mới kiểm codec bằng `router.canConsume()`. Được quyền mới tạo/resume Consumer; thu quyền đóng Consumer server. Danh sách nguồn và event được lọc; Socket.IO room chỉ do server quản lý. [mediasoup communication](https://mediasoup.org/documentation/v3/communication-between-client-and-server/).

### 5.4. Snapshot và dữ liệu lịch sử

`projectSessionFor(viewer)` chỉ trả metadata được phép: danh sách nhóm/số người có thể công khai trong session; producer IDs private, frame URL, nét, tin riêng và consent cá nhân chỉ tới audience phù hợp. Không gửi raw runtime map. Presentation không dùng endpoint board riêng của group.

Khi đổi scope: rời fanout cũ, cập nhật `audienceEpoch`, xóa dữ liệu private cũ trong client cache, rồi nhận snapshot mới. Client bỏ event cũ theo epoch/version nhưng server vẫn phải chặn phát sai. Không bật tự replay packet private của Socket.IO; reconnect dùng snapshot mới và API lịch sử có ACL. [Socket.IO recovery](https://socket.io/docs/v4/connection-state-recovery/).

Người mới vào group được đọc phần lịch sử group trong phiên đang ACTIVE; người rời mất quyền đọc tiếp. Host chỉ đọc group khi đang hỗ trợ. Đóng group/session khóa API đọc private, không mở rộng sang Workspace. Nội dung đã được người nhận xem hoặc tải không thể thu hồi khỏi bộ nhớ/ảnh chụp của họ.

### 8.1. Host, group và hỗ trợ

- Trong MODERATED, host tạo group và phân participant; người chưa phân thuộc MAIN. Host không là thành viên mọi group.
- Chuyển group thu media/chat/board cũ trước, cập nhật membership và cấp nguồn mới. Close group thu floor/presentation liên quan, về MAIN; private history bị khóa.
- Thành viên gửi text/ảnh/tệp tới đúng host qua HOST_PRIVATE; ảnh có thể chọn upload hoặc gửi ảnh chụp canvas hiện tại theo quyền. Đây là tệp tin nhắn trong phiên, không là thư viện/đầu ra lâu dài.
- `host.help.enter` cấp quyền group đích, chuyển MIC host sang GROUP, hiển thị host đã vào trước khi mở scope hỗ trợ. Vào B thì thu A trước.
- `host.help.leave` có thao tác ghi rõ quay lại hướng dẫn toàn phòng. Nếu MIC đang bật, UI yêu cầu xác nhận chuyển phạm vi; không tự phát global chỉ vì timeout/mất mạng.
- Hỏi bằng tin nhắn không tự đổi scope mic. Host cũ giữ quyền đọc tin gửi riêng cho mình trong phiên theo ACL; host mới không tự nhận lịch sử đó. Người gửi có thể gửi câu hỏi mới cho host mới.

### 8.2. Floor, consent và trạng thái kết hợp

`FloorGrant`: INVITED → ACTIVE → REVOKED/EXPIRED; có invitedParticipantIds, consent set và policyRevision. Host start khi ít nhất một người consent; người được mời có thể consent sau khi ACTIVE nếu vẫn trong tập mời/group. Người từ chối vẫn ở nhóm, không phát toàn phòng. MIC tắt không tự bật; người có MIC đang bật vẫn cần consent khi chuyển global.

Thành viên rời group/rời phiên mất consent; reconnect sau mất control lease phải consent lại. Revoke đóng đường global, không đóng mic nhóm còn hợp lệ. Tập quyền được lấy hợp để không phát hai lần.

Để giảm trạng thái chồng chéo, bản đầu chỉ một hoạt động điều hành chính tại một thời điểm: **hỗ trợ riêng hoặc lượt floor/presentation**. Host phải kết thúc hỗ trợ trước khi mở lượt trình bày. Announcement từ hỗ trợ riêng yêu cầu xác nhận kết thúc help và chuyển GLOBAL; không tự quay lại hỗ trợ sau announcement. Announcement trong lượt trình bày chỉ duck tiếng thảo luận, không thu grant âm thầm.
