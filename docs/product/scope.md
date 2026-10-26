# Phạm vi và luồng nghiệm thu

**Trạng thái:** Thiết kế đích đã chốt; tiêu chí ở đây chưa là kết quả nghiệm thu.

Trích chuyển nguyên nội dung tương ứng từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đây là nguồn chi tiết cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## 1. Mục tiêu, ràng buộc và phạm vi

### 1.1. Mục tiêu sản phẩm

CoLearnia cung cấp Workspace lâu dài cho lớp hoặc nhóm học. Thành viên trao đổi trong kênh văn bản, vào phòng để gọi mic/camera và chia sẻ màn hình. Trong buổi học có điều hành, các nhóm nói và vẽ riêng nhưng vẫn nhận màn hình, tiếng giảng chung. Nhóm có thể dừng hình để cùng giải bài, nhận hỗ trợ, rồi công bố bài làm trước phòng.

**Build xong sau tuần 4** nghĩa là toàn bộ chức năng thuộc scope đã tích hợp, chạy trên staging qua Internet, có xử lý lỗi và đạt kiểm thử bắt buộc. Hoàn thành module riêng hoặc chạy mock không được tính là hoàn thành luồng sản phẩm. Tuần 5–6 không được lập kế hoạch như thời gian viết phần lõi còn thiếu.

### 1.2. Phạm vi bắt buộc và mức triển khai

Tất cả các dòng dưới đây thuộc bản hiện tại, bao gồm camera, tài liệu, hỗ trợ riêng và trình bày toàn phòng.

| ID         | Chức năng                   | Mức triển khai và tiêu chí chính                                                                      |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| AUTH-01    | Tài khoản                   | Đăng ký/đăng nhập/đăng xuất; refresh còn phiên; logout và hết hạn chặn REST/socket/media              |
| WS-01      | Workspace                   | Tạo, liệt kê, sửa tên, xóa; một owner, admin/member; tạo owner membership nguyên tử                   |
| WS-02      | Lời mời                     | Link có hạn dùng, thu hồi và giới hạn lượt; join lặp không trùng thành viên                           |
| WS-03      | Thành viên                  | Xem, đổi admin/member, loại thành viên, chuyển owner; không tự nâng quyền                             |
| CH-01      | Kênh TEXT/LIVE              | Tạo/đổi tên/xóa; loại bất biến; kênh còn khi phòng trống; quyền WORKSPACE/RESTRICTED đơn giản         |
| CHAT-01    | Chat                        | Tin văn bản, ảnh/tệp đính kèm, phân trang lịch sử kênh; có pending/error và chống gửi trùng           |
| FILE-01    | Tài liệu                    | Upload/download qua API kiểm quyền; chưa có sửa nội dung hay quản lý phiên bản                        |
| LIVE-01    | Vào/rời                     | Lobby thiết bị, danh sách tham gia; một phiên sống/kênh và một call owner/tài khoản                   |
| LIVE-02    | Mic và camera               | Bật/tắt, chọn thiết bị cơ bản; truyền thật qua Internet; từ chối thiết bị vẫn có thể vào xem          |
| LIVE-03    | Screen share                | Một nguồn chính, có lease; quyền share rõ; browser Stop dọn nguồn; screen audio khi môi trường hỗ trợ |
| HOST-01    | Điều hành                   | FREE/MODERATED, nhận/chuyển host có thông báo và xác nhận; không chiếm host đang hợp lệ               |
| GRP-01     | Nhóm nhỏ                    | Host tạo/phân/chuyển/đóng nhóm; thành viên nhìn thấy nhóm và phạm vi hiện tại                         |
| GRP-02     | Nguồn chung, trao đổi riêng | Screen chung; mic/camera/chat/board riêng đúng nhóm; chuyển nhóm thu đường nhận cũ                    |
| BOARD-01   | Vẽ cơ bản                   | Bút, màu, con trỏ, undo nét gần nhất của mình, clear theo quyền; không làm tẩy theo từng điểm         |
| FREEZE-01  | Freeze/resume               | Một frame chung/scope, audio tiếp tục; resume đến hình hiện tại, ẩn nét cũ                            |
| HELP-01    | Hỗ trợ riêng                | Gửi tin/ảnh hỏi host; host vào hỗ trợ có thông báo; tiếng hỗ trợ không sang nhóm khác                 |
| FLOOR-01   | Phát biểu nhóm              | Mời toàn bộ nhóm; từng người consent; chỉ mic đang bật của người đồng ý phát toàn phòng               |
| PRESENT-01 | Công bố bài làm             | Một projection của context đã chọn, hình+nét; không công bố chat/history hay camera nhóm              |
| AUDIO-01   | Âm lượng                    | Mỗi người 0–100% cục bộ; giảm tiếng thảo luận khi announcement rồi khôi phục đúng                     |
| REC-01     | Reconnect                   | Xác thực lại, snapshot lọc quyền, khôi phục media theo trạng thái hiện tại; không lấy lại grant cũ    |

Camera chưa có nền ảo, bộ lọc, làm đẹp. Vẽ chưa có hình khối, text, transform, nhận dạng chữ, bảng vô hạn hoặc CRDT. Quản lý quyền không có permission override nhiều tầng.

### 1.3. Ngoài scope của đợt này

- Quiz, câu hỏi/bình chọn A/B/C/D; đồng hồ; trạng thái tiến độ nhóm.
- Thư viện bài làm, lưu/export ảnh lời giải lâu dài thành artifact.
- Freeze cá nhân tách khỏi board nhóm; screen share riêng song song từng nhóm.
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

**UC-01 — Tổ chức việc học:** đăng ký/đăng nhập → tạo Workspace → mời thành viên → tạo TEXT/LIVE → gửi tin/ảnh/tệp → thành viên khác đọc/tải đúng quyền. Người ngoài không tải được tệp bằng ID/URL lấy được.

**UC-02 — Học nhóm tự do:** vào LIVE → bật mic/camera → một người share → cả phòng cùng freeze, vẽ và chỉnh âm lượng → resume → rời/vào lại. Không cần bật chế độ host để gọi tự do.

**UC-03 — Buổi học có hướng dẫn:** nhận host → share bài giảng → chia ít nhất hai nhóm → riêng tư mic/camera/chat/board, chung screen và tiếng giảng → freeze/vẽ → hỏi host, host hỗ trợ riêng → quay lại hướng dẫn → mời nhóm, từng người consent → công bố bài làm → thu quyền → đóng nhóm/phiên.

Kiểm lỗi và reconnect được chèn vào cả ba luồng, không chỉ demo đường đi thành công.

### 2.2. Mô hình và thời gian tồn tại

```text
User
└── Workspace
    ├── Membership: owner / admin / member
    ├── Channel TEXT → Conversation CHANNEL → Message / Attachment
    └── Channel LIVE → LiveSession hiện tại
                        ├── Participants + host + MAIN
                        ├── BreakoutGroup A → chat + BoardContext riêng
                        ├── BreakoutGroup B → chat + BoardContext riêng
                        └── FloorGrant + PresentationView tạm
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

Các bất biến: tối đa một session ACTIVE/ENDING giữ chỗ mỗi LIVE channel; một call owner generation/tài khoản; một main share; một floor active; một presentation active; một Consumer cho mỗi participant/producer.
