# Phạm vi và luồng nghiệm thu

**Trạng thái:** Thiết kế đích đã chốt; tiêu chí ở đây chưa là kết quả nghiệm thu.

Nguồn ban đầu được trích chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đã cập nhật theo quyết định team ngày 27/10/2026 trong technical plan v2.3. Đây là nguồn chi tiết hiện hành cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## 1. Mục tiêu, ràng buộc và phạm vi

### 1.1. Mục tiêu sản phẩm

CoLearnia cung cấp Workspace lâu dài cho lớp hoặc nhóm học. Thành viên trao đổi trong kênh văn bản có thread hoặc nhắn riêng 1–1, vào phòng để gọi mic/camera và chia sẻ màn hình. Trong buổi học có điều hành, DISCUSSION được thành viên xin tạo để trao đổi riêng trong khi theo dõi bài giảng; ACTIVITY do host tổ chức để làm việc độc lập, có share riêng. Nhóm có thể dừng hình để cùng giải bài, nhận hỗ trợ, rồi về phòng chung bật mic trao đổi.

**Build xong sau tuần 4** nghĩa là toàn bộ chức năng thuộc scope đã tích hợp, chạy trên staging qua Internet, có xử lý lỗi và đạt kiểm thử bắt buộc. Hoàn thành module riêng hoặc chạy mock không được tính là hoàn thành luồng sản phẩm. Tuần 5–6 không được lập kế hoạch như thời gian viết phần lõi còn thiếu.

**Capacity bản đầu ngày 01/11:** giữ PoC chức năng 5 người, hướng kiểm chứng 25 người/LIVE rồi thử 50 nếu đạt, công bố theo profile thực đã đo ở [capacity](../capacity.md). Không cam kết 100 người, không cắt camera/nhóm/chức năng để đạt số lượng. Chấp nhận app restart kết thúc phiên trong topology bản đầu; chưa có HA/zero-downtime.

### 1.2. Phạm vi bắt buộc và mức triển khai

Tất cả các dòng dưới đây thuộc bản hiện tại, bao gồm camera, tài liệu, chat cuộc họp, hỗ trợ riêng và về phòng chung.

| ID        | Chức năng                | Mức triển khai và tiêu chí chính                                                                                                                                                                                                                                                 |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01   | Tài khoản                | Đăng ký/đăng nhập/đăng xuất; refresh còn phiên; logout và hết hạn chặn REST/socket/media                                                                                                                                                                                         |
| WS-01     | Workspace                | Tạo, liệt kê, sửa tên, xóa; một owner, admin/member; tạo owner membership nguyên tử                                                                                                                                                                                              |
| WS-02     | Lời mời                  | Link có hạn dùng, thu hồi và giới hạn lượt; join lặp không trùng thành viên                                                                                                                                                                                                      |
| WS-03     | Thành viên               | Xem, đổi admin/member, loại thành viên, chuyển owner; không tự nâng quyền                                                                                                                                                                                                        |
| CH-01     | Kênh TEXT/LIVE           | Workspace mới có general TEXT; owner/admin tạo/đổi tên/xóa kênh; loại bất biến; kênh còn khi phòng trống; quyền WORKSPACE/PRIVATE; owner/admin thêm/gỡ danh sách PRIVATE sau tạo, nội dung chỉ người có quyền; rejoin Workspace cần cấp lại PRIVATE; chưa đổi accessMode sau tạo |
| CHAT-01   | Chat kênh                | Tin văn bản, ảnh/tệp đính kèm, phân trang lịch sử kênh; có pending/error và chống gửi trùng                                                                                                                                                                                      |
| CHAT-02   | Tin nhắn riêng Workspace | DM 1–1 trong cùng Workspace, text/ảnh/file và lịch sử; chỉ hai bên đọc, admin không mặc nhiên có quyền                                                                                                                                                                           |
| CHAT-03   | Thread trong kênh        | Trả lời một cấp theo tin gốc TEXT, text/ảnh/file; số trả lời, panel và lịch sử phân trang; cùng ACL kênh                                                                                                                                                                         |
| FILE-01   | Tài liệu                 | Upload/download qua API kiểm quyền; chưa có sửa nội dung hay quản lý phiên bản                                                                                                                                                                                                   |
| LIVE-01   | Vào/rời                  | Lobby thiết bị, danh sách tham gia; một phiên sống/kênh và một call owner/tài khoản                                                                                                                                                                                              |
| LIVE-02   | Mic và camera            | Bật/tắt, chọn thiết bị cơ bản; truyền thật qua Internet; từ chối thiết bị vẫn có thể vào xem                                                                                                                                                                                     |
| LIVE-03   | Screen share             | MAIN mọi participant tự share khi trống, không xin host; tối đa một người share; DISCUSSION không share riêng; ACTIVITY mỗi nhóm một nguồn; mọi member tự share không host duyệt, board theo nguồn đó                                                                            |
| HOST-01   | Điều hành                | Một kiểu cuộc họp; người bắt đầu là host; chuyển host trực tiếp, không cần người nhận chấp nhận; người khác không tự nhận host                                                                                                                                                   |
| GRP-01    | Tạo/vào/rời/đóng nhóm    | Thành viên xin DISCUSSION bằng tên/mục đích/thành viên, host duyệt rồi người được chọn bấm Vào nhóm; host kết thúc DISCUSSION trước tổ chức ACTIVITY; thành viên tự về MAIN sớm; ACTIVITY hết thời lượng tự về MAIN, host đóng DISCUSSION                                        |
| GRP-02    | Hai policy nhóm          | DISCUSSION kế thừa bài giảng, trao đổi riêng; ACTIVITY độc lập MAIN/group khác; move/leave thu scope cũ                                                                                                                                                                          |
| BOARD-01  | Vẽ cơ bản                | Bút, màu, con trỏ, undo nét gần nhất của mình, clear theo quyền; không làm tẩy theo từng điểm                                                                                                                                                                                    |
| FREEZE-01 | Freeze/resume            | Một frame chung/scope, audio tiếp tục; resume đến hình hiện tại, ẩn nét cũ                                                                                                                                                                                                       |
| HELP-01   | Chat cuộc họp và hỗ trợ  | Text/ảnh; chọn Everyone trong scope hiện tại hoặc Host riêng; host vào nhóm hỗ trợ có thông báo, tiếng chỉ tới nhóm đích                                                                                                                                                         |
| AUDIO-01  | Âm lượng                 | Điều chỉnh cục bộ nguồn hợp lệ, tiếng giảng/trao đổi trong DISCUSSION; duck/restore thông báo đúng audience, không phát MAIN sang ACTIVITY                                                                                                                                       |
| REC-01    | Reconnect                | Xác thực lại, snapshot lọc quyền, khôi phục media theo trạng thái hiện tại; không lấy lại grant hoặc đích gửi chat đã stale                                                                                                                                                      |
| TIMER-01  | Thời lượng hoạt động     | Một countdown chung cho lượt ACTIVITY; host đặt, server deadline; hết giờ tự kết thúc lượt, thu scope ACTIVITY và đưa người còn quyền về MAIN, mic pause; không chờ host                                                                                                         |

Camera chưa có nền ảo, bộ lọc, làm đẹp. Vẽ chưa có hình khối, text, transform, nhận dạng chữ, bảng vô hạn hoặc CRDT. Quản lý quyền không có permission override nhiều tầng.

### 1.3. Ngoài scope của đợt này

- Floor grant/consent từng người và projection công bố riêng hình+nét nhóm (đã bỏ theo quyết định team 27/10/2026).
- Quiz, câu hỏi/bình chọn A/B/C/D; đồng hồ cá nhân/từng nhóm hoặc đa mục đích ngoài countdown chung TIMER-01; trạng thái tiến độ nhóm.
- Thư viện bài làm, lưu/export ảnh lời giải lâu dài thành artifact.
- Freeze cá nhân tách khỏi board nhóm; screen share riêng của DISCUSSION.
- Ghi hình toàn phiên, VOD/HLS, phụ đề AI, chạy code trên server, điều khiển máy từ xa.

Không xây collections, endpoints hoặc màn hình cho những phần trên trong đợt này. Frame tạm phục vụ freeze và ảnh được người dùng gửi vào chat là hai luồng riêng; hệ thống không tự lưu frame thành tài liệu.

### 1.4. Ràng buộc và giả định phải theo dõi

| Nội dung          | Quyết định/giả định hiện tại                                                      | Người theo dõi    |
| ----------------- | --------------------------------------------------------------------------------- | ----------------- |
| Nhóm và thời gian | 5 người, 4 tuần build + 1–2 tuần hoàn thiện                                       | Cả nhóm           |
| Ngày bắt đầu/nộp  | Chưa có ngày lịch; tuần tính từ kickoff                                           | E ghi vào backlog |
| Giờ làm thực tế   | Chưa xác nhận; khai báo giờ/người/tuần trước khi nhận issue                       | Từng người        |
| Ngân sách         | Chưa xác nhận; cần VPS/public IP, domain/TLS, băng thông và backup                | E                 |
| Kỹ năng WebRTC    | Chưa xác nhận; PoC để đo năng lực triển khai                                      | B+C, D hỗ trợ     |
| MongoDB           | Chọn cho kế hoạch; A xác nhận yêu cầu học phần khi kickoff                        | A                 |
| Browser           | Chrome/Edge desktop là môi trường nghiệm thu; Firefox kiểm bổ sung; mobile để sau | D+E               |
| Runtime           | Một app instance, một mediasoup worker ban đầu; không HA                          | B+E               |
| Mất server        | Kết thúc media cũ, join mới; không cam kết giữ nét chưa lưu                       | B+C+D             |

Đây là kế hoạch mục tiêu, chưa là lời bảo đảm hoàn thành trong 4 tuần. Không tự đưa chức năng chính sang “nếu kịp”. Nếu capacity thiếu, nhóm cập nhật quyết định phạm vi/lịch một cách rõ ràng theo mục 18.

## 2. Luồng nghiệm thu và mô hình nghiệp vụ

### 2.1. Ba luồng bắt buộc

**UC-01 — Tổ chức việc học:** đăng ký/đăng nhập → tạo Workspace có general → mời thành viên → tạo thêm TEXT/LIVE → gửi tin/ảnh/tệp, trả lời thread trong TEXT → nhắn riêng 1–1 → thành viên khác đọc/tải đúng quyền. Người ngoài không tải được tệp bằng ID/URL lấy được.

**UC-02 — Học nhóm tự do:** vào LIVE → bật mic/camera → một người share → cả phòng cùng freeze, vẽ và chỉnh âm lượng → resume → rời/vào lại. Người bắt đầu là host; không dùng chức năng điều hành vẫn gọi bình thường, không có bước bật chế độ host.

**UC-03 — Buổi học có hướng dẫn:** người bắt đầu giữ host hoặc được chuyển host trực tiếp, không cần người nhận chấp nhận → MAIN có bài giảng chung → kiểm hai nhánh: (a) thành viên xin DISCUSSION bằng tên/mục đích/danh sách, host duyệt, người được chọn chủ động vào nhóm, kế thừa bài giảng và freeze/vẽ riêng, không share; (b) host tổ chức ít nhất hai ACTIVITY độc lập với MAIN và nhau, mỗi nhóm một share, member tự bấm không host duyệt, board theo nguồn đó → hỗ trợ đúng nhóm → người xong sớm tự về MAIN, còn lại tự về MAIN khi hết thời lượng chung → tự bật mic phát biểu. TIMER-01 cho nhánh hoạt động tự kết thúc lượt khi hết giờ; không cần host quyết định, không giữ lệnh host kết thúc ACTIVITY thủ công. Hai loại nhóm không hoạt động đồng thời: host kết thúc DISCUSSION trước ACTIVITY; trong lượt không nhận request DISCUSSION, hết lượt về MAIN mới cho xin lại.

Kiểm lỗi và reconnect được chèn vào cả ba luồng, không chỉ demo đường đi thành công.

### 2.2. Mô hình và thời gian tồn tại

```text
User
└── Workspace
    ├── Membership: owner / admin / member
    ├── Channel TEXT (general ban đầu) → Conversation CHANNEL → Message / Thread replies / Attachment
    ├── Conversation DIRECT → hai thành viên Workspace → Message / Attachment
    └── Channel LIVE → LiveSession hiện tại
                        ├── Participants + host + MAIN
                        ├── Group DISCUSSION → bài giảng MAIN + chat/board riêng
                        ├── Group ACTIVITY → media/share/chat/board độc lập
                        └── Chat Everyone theo scope + HOST_PRIVATE
```

| Khái niệm          | Vòng đời                                                          |
| ------------------ | ----------------------------------------------------------------- |
| Workspace/Channel  | Lâu dài đến khi xóa; LIVE channel không phải cuộc gọi             |
| LiveSession        | Một lượt sử dụng LIVE; ACTIVE → ENDING → ENDED                    |
| SessionParticipant | Danh tính tham gia phiên; khác membership trong Workspace         |
| MAIN               | Phạm vi người chưa vào nhóm; không là một kênh mới                |
| BreakoutGroup      | Thuộc đúng một session; runtime và dữ liệu riêng bị khóa khi đóng |
| BoardContext       | Ngữ cảnh hình/nét của MAIN hoặc group, có version riêng           |
| Producer/Consumer  | Object mediasoup trong RAM; không khôi phục bằng ID sau restart   |

Các bất biến: tối đa một session ACTIVE/ENDING giữ chỗ mỗi LIVE channel; một call owner generation/tài khoản; một main share; một Consumer cho mỗi participant/producer.

Chat kênh, general mặc định, DM và thread theo [đặc tả messaging](messaging.md). Chat cuộc họp vẫn chỉ text/ảnh; khả năng gửi file của DM không mở rộng HELP-01.

Nguồn phân biệt ba bối cảnh và các điểm share/request chưa chốt: [group modes](group-modes.md).
