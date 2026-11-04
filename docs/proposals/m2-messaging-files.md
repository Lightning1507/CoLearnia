# M2 — Chat, tệp, avatar và xem lại bản ghi

**Status:** Draft để review · **Ngày:** 04/11/2026 · **Người phụ trách:** Minh Quân 15 · **Reviewer cần phối hợp:** M1, M4; M3/M5 review điểm giao · **Size đề xuất:** XL, chia thành nhiều task và kiểm lại sau phần tích hợp đầu tiên.

> **Tóm tắt** — Xây phần nhắn tin trong kênh TEXT, tin nhắn riêng 1–1, trả lời theo thread và chat trong cuộc họp. Người dùng có thể gửi văn bản, ảnh, tệp; đọc lại lịch sử; thử gửi lại khi lỗi mà không tạo hai tin giống nhau.
>
> M2 làm giao diện chat, lưu tin nhắn và quản lý tệp. M1 cung cấp tài khoản và quyền truy cập kênh; M4 xác định người dùng đang ở phòng nào và ai đang là host. M3 cung cấp khung cuộc gọi và chức năng ghi hình; M5 cung cấp phần giữ hình, vẽ và ảnh chụp bảng. M2 cũng làm phần lưu và xem lại video đúng quyền, đồng thời cung cấp upload và dọn avatar Cloudinary cho M1. Avatar công khai có luồng riêng, không dùng cách lưu/tải của tệp chat và video riêng tư.
>
> Phạm vi có 11 yêu cầu chức năng chính của M2 và phần phối hợp avatar FR-01-05 do M1 phụ trách chính. WBS giữ 12 nhóm T1–T12, tách task con 2–8 giờ theo đầu ra để giao việc và theo dõi phụ thuộc. Task và ước lượng ở cuối dùng để team thảo luận, chưa phải lịch cam kết. Proposal này mô tả cách làm, chưa triển khai chức năng hoặc thay cấu trúc dữ liệu thực tế.

## 1. Context

CoLearnia có hai nhu cầu trao đổi khác nhau. Ngoài giờ học, thành viên nhắn tin và gửi tài liệu trong Workspace. Trong buổi học, họ cần nói chuyện bằng tin nhắn với phòng hiện tại hoặc hỏi riêng host. Hai phần có thể dùng chung cách lưu tin và tệp, nhưng không có cùng quyền đọc và thời gian lưu.

Ví dụ: rời cuộc gọi không làm mất lịch sử DM. Ngược lại, một người đã về MAIN không được tiếp tục mở chat của nhóm nhỏ chỉ vì vẫn nhớ đường dẫn cũ.

Theo [phân chia miền](../product/delivery-domains.md), M2 phụ trách chat, tệp và xem lại bản ghi. Yêu cầu nghiệm thu lấy từ [FR/AC](../product/functional-requirements.md), [messaging](../product/messaging.md), [chat họp và hỗ trợ](../product/groups-media-policy.md), [recording](../product/recording.md). Thiết kế dùng chung theo [kiến trúc](../architecture.md), [dữ liệu](../database/collection-design.md), [vòng đời dữ liệu](../database/lifecycle.md), [quy tắc nhất quán](../database/integrity-and-migrations.md) và [sức chứa](../capacity.md).

Phần avatar đối chiếu với [proposal M1 tại commit 8243a8d](https://github.com/Lightning1507/CoLearnia/blob/8243a8d63f1f1e7f865468dfb3ff0bc2d7108269/docs/proposals/m1-workspace-auth.md): avatar lưu Cloudinary, URL công khai; chỉ chính chủ được thay/xóa. M1 làm giao diện và lưu thông tin ảnh trên User; M2 cung cấp upload đã kiểm tra và cleanup, tức dọn ảnh bỏ dở/không còn dùng. Một số nguồn trong checkout này còn ghi chưa yêu cầu avatar; phần bổ sung dưới đây là đầu ra phối hợp theo review M1, cần đồng bộ nguồn chung trước code phụ thuộc, chưa sửa baseline hoặc schema thực thi trong lượt này.

Source hiện có mới là bộ khung: web có màn trạng thái, server có các đường kiểm tra hoạt động, kết nối realtime chưa cho vào khi chưa có xác thực. Chưa có màn chat, xử lý tin nhắn, upload/download hoặc trang xem lại video. Các thiết kế trong tài liệu chưa chứng minh các chức năng này đã chạy.

## 2. Objective

Thành viên gửi được nội dung đến đúng người, tìm lại được cuộc trao đổi và biết tin đã gửi thành công hay chưa. Người không còn quyền phải bị chặn cả tin nhắn mới, lịch sử và tệp đang tải. Người mở lại kênh LIVE tìm được video của các phiên đã kết thúc và xem đúng quyền. M1 có thể dùng phần upload/dọn avatar M2 cung cấp mà không phải tự viết lại; ảnh công khai không làm thay đổi quyền tệp chat/video.

## 3. Goals / Non-goals

| Goal | Kết quả                                                                                                    | FR chính / phối hợp                             |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| G1   | Nhắn văn bản, ảnh, tệp trong TEXT; đọc lịch sử theo trang và đúng thứ tự                                   | FR-04-01, FR-04-03; M1                          |
| G2   | Hiện đang gửi/thành công/lỗi; thử lại không nhân tin, không âm thầm đổi nội dung tin đã gửi                | FR-04-02                                        |
| G3   | Upload, gắn tệp vào tin và tải xuống đúng quyền; kiểm dung lượng, loại tệp và dọn tệp bỏ dở                | FR-04-04                                        |
| G4   | DM đúng hai người trong cùng Workspace; mất quyền thì chặn, gia nhập lại hợp lệ thì đọc lịch sử còn lưu    | FR-12-01, FR-12-02; M1                          |
| G5   | Trả lời một cấp trong TEXT; có số trả lời, lịch sử riêng; không đẩy mọi câu trả lời vào dòng chat chính    | FR-13-01, FR-13-02                              |
| G6   | Chat họp gửi đến Everyone của phòng hiện tại hoặc đúng host; không lộ tin giữa các nhóm                    | FR-09-01, FR-09-02; M3/M4                       |
| G7   | Cung cấp ảnh giữ hình cho M5; lưu và tìm video theo kênh hoặc phiên để xem lại đúng quyền                  | FR-15-03 và phần phối hợp FR-04-04; M1/M3/M4/M5 |
| G8   | Cung cấp upload avatar Cloudinary đã kiểm tra đúng chủ, loại ảnh và giới hạn; dọn ảnh bỏ dở/ảnh cũ an toàn | Phối hợp FR-01-05; M1 chính, M2 hỗ trợ          |

**Ngoài phần M2 tự triển khai:** đăng nhập/quản lý thành viên, điều hành nhóm, truyền mic/camera và công cụ vẽ. M2 vẫn phải nối các phần này để luồng người dùng chạy đầy đủ.

Bản đầu không thêm DM nhóm, DM xuyên Workspace, thread trong DM/chat họp, sửa/xóa tin, biểu cảm, trạng thái đang gõ hoặc thông báo đã đọc. Không biến ảnh bảng thành thư viện bài làm. Không làm lại bộ ghi hình của M3 và không tự thêm Redis hay nhiều server chạy song song.

## 4. Các điểm cần thống nhất

Các bên thống nhất phần giao tiếp trước khi code phụ thuộc. Trong thời gian chờ, M2 vẫn có thể làm giao diện hoặc thử các luồng chat/tệp độc lập. Những quy tắc sản phẩm đã chốt tiếp tục theo nguồn hiện hành.

| ID  | Nội dung cần thống nhất                                                                                                                                                                                                                                                                                                        | Bên phối hợp                                                      | Cần chốt trước                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Q1  | M1 trả thông tin người dùng/quyền kênh thế nào; M2 tham gia tạo general cùng Workspace ra sao; cách báo khi người dùng bị gỡ quyền.                                                                                                                                                                                            | Minh Quân 15 – Minh Quân 16                                       | T2–T4                                                                                     |
| Q2  | M4 cung cấp phòng hiện tại, nhóm, host, giờ kết thúc và thông báo chuyển phòng thế nào; khi đóng nhóm, M2 phải dọn xong những gì.                                                                                                                                                                                              | Minh Quân 15 – Hoàng Quân                                         | T6                                                                                        |
| Q3  | Hướng thử Busboy nhận multipart dạng stream, file-type nhận diện định dạng và sharp kiểm/chuẩn hóa ảnh; chốt phần dùng chung và allowlist riêng cho chat/frame/avatar. Kiểm phiên bản trên Node/Linux đang pin, số liệu RAM/timeout trước chọn package.                                                                        | Minh Quân 15; Minh Quân 16 review quyền/avatar, Minh review frame | T1.4 khảo sát tối đa 4 giờ, kết luận trước T3.1/T3.2; không chặn TEXT text-only           |
| Q4  | Vị trí panel chat và mục Bản ghi theo kênh; dữ liệu kênh/phiên M4 cung cấp; kiểm profile MP4/H264/AAC và cách phát/tua trên trình duyệt.                                                                                                                                                                                       | Minh Quân 15 – Việt – Hoàng Quân; Minh Quân 16 review quyền kênh  | T5/T6/T9                                                                                  |
| Q5  | Chốt M2 cấp nơi ghi/dung lượng trước capture và M3 nối output vào writer; mã start/attempt, trạng thái, hết dung lượng tạm/hủy/hoàn tất/restart, upload R2 riêng tư, MP4/H264/AAC, deadline 3 giờ, READY vô thời hạn; còn chốt hạn mức, bản tạm/lỗi và quyền xóa khi cha bị xóa. Không chờ video ghi xong mới bàn giao cho M2. | Minh Quân 15 – Việt; Hoàng Quân và Minh Quân 16 review điểm giao  | T1.2, T9.1; trước PoC recording tích hợp và bật T9                                        |
| Q6  | M5 cấp yêu cầu giữ hình và xác nhận ảnh còn được dùng thế nào; khi trở lại hình trực tiếp hoặc đóng nhóm thì thông báo dọn ảnh ra sao.                                                                                                                                                                                         | Minh Quân 15 – Minh                                               | T7                                                                                        |
| Q7  | Chốt giới hạn số yêu cầu chờ/đang chạy, tổng byte, thời gian chờ/chạy và hủy cho từng loại thao tác, theo người/phạm vi và toàn app process; cả pool DB và phần dành cho thu quyền. Giá trị hữu hạn phải có trong config/contract trước khi bật handler.                                                                       | Minh Quân 15 cùng M1/M4 và các miền dùng tài nguyên chung         | T1 chốt khung; trước bật T3/T4/T6, T7/T9/T12 áp cùng nguyên tắc; T11 chỉ đo và điều chỉnh |
| Q8  | Chốt cách M1 gọi upload/dọn avatar M2, kiểm ảnh và giới hạn Cloudinary; dữ liệu trả đã xác minh, cách chọn/thay/xóa đồng thời, theo dõi ảnh bỏ dở và thử dọn lại sau restart. Thống nhất cấu hình phía server, không đưa credential vào frontend.                                                                              | Minh Quân 15 – Minh Quân 16                                       | Review T1; trước bật T12 và trước M1 tích hợp avatar                                      |

| Q9 | Chốt subscribe-first và mốc đồng bộ theo tin đã commit, cách tải bù nhiều trang và gộp theo ID. Không dùng timestamp hoặc ID tin realtime cuối cùng làm mốc an toàn nếu còn tin commit muộn. | Minh Quân 15; Minh Quân 16/Hoàng Quân review quyền và thứ tự ghi | T1.3 thử tối đa 4 giờ; chốt trước T4.2/T5.2 |

**Bản bàn giao đang dùng:** [schema recordings của M3](../database/recordings-schema.md) được tiếp nhận vào proposal ngày 05/11/2026 theo yêu cầu Minh Quân 15. Phần giới hạn/trạng thái/lưu trữ đã đồng bộ ở 6.5 và [nguồn recording](../product/recording.md). Các lựa chọn pipeline, đầu ghi và định dạng cần seek vẫn phải thử với Việt; việc nhận schema không là bằng chứng GStreamer hoặc ghi 3 tiếng đã chạy.

## 5. High-level design

Dùng một phần xử lý chat và một phần xử lý tệp chung cho cả ứng dụng. Khác biệt nằm ở việc người này có được đọc/gửi vào hội thoại đó ngay lúc này không.

```mermaid
flowchart LR
  User[Người dùng] --> UI[Giao diện chat hoặc xem video]
  UI --> Chat[M2: xử lý tin nhắn]
  UI --> File[M2: upload và tải tệp]
  M1[M1: tài khoản và quyền kênh] --> Chat
  M1 --> File
  M4[M4: phòng, nhóm và host hiện tại] --> Chat
  M4 --> File
  Chat --> DB[(MongoDB: tin nhắn và thông tin tệp)]
  File --> DB
  File --> R2[(Cloudflare R2: ảnh, tài liệu và video riêng tư)]
  Profile[M1: cài đặt hồ sơ] --> Avatar[M2: upload và dọn avatar]
  Avatar --> Cloud[(Cloudinary: avatar công khai)]
  Avatar -->|Thông tin ảnh đã xác minh| Profile
  Profile --> UserDB[(MongoDB: hồ sơ User do M1 quản lý)]
  M3[M3: bộ ghi video MAIN] -->|Xin chỗ ghi trước capture và truyền byte| File
  File -->|Mã bản ghi, writer có giới hạn, kết quả hoàn tất| M3
  M5[M5: yêu cầu giữ hình và ảnh bảng] --> File
```

**Cách đọc sơ đồ:** khi gửi tin hoặc mở tệp, giao diện gọi M2. M2 dùng thông tin tài khoản/quyền từ M1 và phòng/nhóm hiện tại từ M4 để kiểm người dùng có được thao tác không. MongoDB giữ tin nhắn và thông tin quản lý tệp. Ảnh chat, tài liệu, ảnh giữ hình và video đều lưu lâu dài trên Cloudflare R2 riêng tư. Ổ đĩa máy chủ không làm kho tệp của M2. M3 tạo video, M2 lo chỗ ghi và lưu video. M5 gửi ảnh giữ hình cho M2 quản lý.

**Quyết định cập nhật ngày 05/11/2026 của Minh Quân 15:** dùng Cloudflare R2 cho toàn bộ tệp riêng tư M2: ảnh chat, tài liệu đính kèm, ảnh giữ hình và video. R2 là kho tệp trên hạ tầng Cloudflare, tách khỏi máy chủ chạy ứng dụng. MongoDB chỉ giữ tin nhắn và thông tin quản lý tệp; avatar công khai tiếp tục ở Cloudinary. Không dùng ổ đĩa máy chủ để lưu tệp lâu dài. Việc có cần tệp tạm trong lúc ghi/xử lý video sẽ được M2 và M3 kiểm chứng trước triển khai, không cam kết bỏ mọi thao tác ổ đĩa. Đây là quyết định thiết kế, chưa là bằng chứng tích hợp đã chạy.

Avatar là nhánh riêng: ảnh nằm trên Cloudinary công khai, M1 lưu thông tin đã được M2 xác minh trên User. URL avatar cho phép đọc công khai, kể cả sau khi rời Workspace; không áp cách đọc này cho tệp chat/video. Không đưa nội dung video vào MongoDB hoặc gửi tệp qua Socket.IO. Socket.IO báo tin mới; HTTP truyền lịch sử và nội dung tệp.

Giao diện dùng chung ô soạn tin, danh sách tin, phần đính kèm và thông báo lỗi. TEXT có thêm panel thread; DM có danh sách riêng; chat họp nằm trong khung cuộc gọi M3. M2 không dựng thêm một trang gọi khác.

**Các lựa chọn đã cân nhắc:** tách mỗi loại chat thành một hệ thống riêng sẽ lặp cách gửi lại và quản lý tệp; lưu chat họp chỉ trong bộ nhớ sẽ không khớp thiết kế lịch sử hiện có. Vì vậy dùng chung nền lưu tin, kiểm quyền riêng cho từng loại. Tệp đi qua đường tải có xác thực, thay vì đường dẫn công khai mà ai biết cũng mở được.

## 6. Detailed design

### 6.1. Dữ liệu và trách nhiệm

Một **hội thoại** là nơi chứa tin nhắn, chẳng hạn chat của một kênh, một cặp DM hoặc một nhóm trong cuộc họp. **Thread** là chuỗi trả lời gắn với một tin gốc. **Thông tin tệp** gồm người tải lên, dung lượng, loại tệp, tệp thuộc hội thoại nào và khi nào được dọn; không phải toàn bộ nội dung tệp.

| Nơi lưu          | Nội dung                                                             | Điều cần giữ đúng                                                                      |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `conversations`  | Hội thoại của kênh TEXT, cặp DM, MAIN, nhóm hoặc cặp người dùng–host | Mỗi nơi/cặp chỉ có một hội thoại tương ứng. Hai người ở hai Workspace có hai DM riêng. |
| `messages`       | Người gửi, nội dung, thời gian, tệp đính kèm, tin gốc nếu là trả lời | Người gửi lấy từ đăng nhập. Trả lời phải thuộc đúng tin gốc trong cùng kênh.           |
| `files`          | Thông tin tệp, nơi lưu nội bộ, trạng thái, quyền và lịch dọn         | Một tệp chỉ gắn một đích. Ảnh giữ hình không tự biến thành tệp đính kèm chat.          |
| Kho tệp riêng    | R2 riêng tư cho ảnh, tài liệu, ảnh giữ hình và video                 | Không mở công khai; mỗi lần tải đều kiểm quyền.                                        |
| Bộ nhớ đang chạy | Các lượt upload/download và kết nối nhận tin đang mở                 | Dùng để hủy khi mất quyền, không dùng thay dữ liệu thành viên/nhóm của M1/M4.          |

M1 tạo Workspace, owner, kênh general và hội thoại của kênh trong cùng một lần lưu: hoặc có đủ, hoặc không tạo phần nào. M2 cung cấp thao tác tạo hội thoại cho M1 dùng, không tạo general bằng một yêu cầu chạy sau.

Giữ cấu trúc và các ràng buộc đã có trong [thiết kế DB](../database/collection-design.md). Database cần ngăn trùng cặp DM, trùng hội thoại theo phòng/nhóm và trùng lần gửi. Lưu tin có tệp hoặc trả lời thread phải hoàn tất cùng việc gắn tệp/cập nhật số trả lời; lỗi giữa chừng không để lại tin thành công nhưng thiếu tệp.

M1 sở hữu thông tin avatar trên User, theo đề xuất `{ publicId, secureUrl } | null`. M2 không tạo một bản hồ sơ người dùng thứ hai hoặc gắn avatar vào conversation. M1/M2 chốt nơi theo dõi lượt upload và việc dọn ảnh Cloudinary để có thể tiếp tục sau restart; đây là phần thiết kế bổ sung ở Q8, không mặc định dùng nguyên schema ATTACHMENT/FRAME của chat.

Recording là phần dữ liệu mới theo [schema bàn giao](../database/recordings-schema.md) và mục 6.5, cần kiểm fixture/adapter cùng M3. Không coi 13 collection trước recording đã đủ cho video. Khi triển khai có thay cấu trúc dữ liệu phải kiểm dữ liệu hiện có và có kế hoạch chuyển đổi/khôi phục riêng; proposal này không chạy các thao tác đó.

### 6.2. Gửi tin, đọc lịch sử và thử lại

**Gửi tin:** người dùng bấm Gửi → giao diện hiện Đang gửi → server kiểm quyền và nội dung → lưu tin cùng tệp nếu có → xác nhận thành công và gửi tới người được đọc. Chỉ hiển thị thành công sau khi có kết quả lưu xác định.

```mermaid
sequenceDiagram
  actor U as Người gửi
  participant C as Giao diện chat
  participant S as M2 xử lý tin
  participant D as Database
  U->>C: Nhập nội dung và bấm Gửi
  C->>S: Nội dung, đích gửi và mã của lần gửi
  S->>S: Kiểm tài khoản, quyền và đích hiện tại
  S->>D: Lưu tin và gắn tệp nếu hợp lệ
  D-->>S: Kết quả lưu
  S->>S: Kiểm người nhận còn quyền trước khi phát tin
  S-->>C: Xác nhận hoặc báo lỗi
  Note over C,S: Mất phản hồi: thử lại cùng mã, không tạo thêm tin
```

**Cách đọc sơ đồ:** giao diện gửi yêu cầu, M2 kiểm quyền rồi lưu tin. Chỉ sau khi lưu thành công mới xác nhận và gửi tới người còn quyền. Nếu phản hồi bị mất, giao diện gửi lại cùng mã để nhận đúng tin đã có, tránh gửi hai lần.

**Thử lại:** mỗi lần gửi có một mã `clientMessageId`. Nếu mạng đứt sau khi server đã lưu nhưng trước lúc giao diện nhận được phản hồi, thử lại bằng cùng mã sẽ trả về tin đã có. Nếu cùng mã nhưng nội dung khác, server báo xung đột thay vì ghi đè tin cũ. Kiểm quyền cả khi trả lại tin đã lưu; mã cũ không giúp đọc nội dung sau khi bị gỡ quyền.

Về kỹ thuật, khóa chống trùng gồm hội thoại + người gửi + mã lần gửi. Khi có tệp hoặc tăng số trả lời, các bước lưu chạy trong cùng transaction, tức cùng thành công hoặc cùng hủy. Nếu chưa biết lần lưu đã thành công hay chưa, server tra lại theo mã trước khi kết luận; không tự tạo tin mới hoặc báo chắc chắn thất bại.

**Lịch sử và thread:** tải từng trang, tối đa 50 tin/trang theo cấu hình hiện tại; đề xuất mặc định 30. Mốc tải tiếp dựa trên thời gian và ID tin để các tin cùng thời điểm vẫn có thứ tự ổn định. Dòng chính của TEXT chỉ có tin gốc; trả lời nằm trong panel thread, có lịch sử riêng và số trả lời. Thử lại không tăng số trả lời hai lần. Không cho lấy tin của kênh khác hoặc một câu trả lời làm gốc mới.

**Nối lịch sử với realtime khi mở hội thoại/reconnect — hướng đề xuất Q9:**

Nếu tải lịch sử xong mới đăng ký nhận realtime, tin được lưu giữa hai bước có thể bị sót. Socket.IO mặc định không tự gửi lại sự kiện server mà client đã bỏ lỡ; phần bù tin do ứng dụng thực hiện. Theo [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/), proposal chọn subscribe trước rồi tải bù có mốc, không bật replay packet private.

| Bước                     | Client và server thực hiện                                                                                                                                                                                                                     | Điều kiện để đi tiếp                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Chuẩn bị              | Client gắn listener nhận tin trước khi gửi `conversation.subscribe`; tạo lượt đồng bộ riêng cho conversation/root và context hiện tại.                                                                                                         | Bỏ lượt cũ khi logout, đổi hội thoại hoặc scope; chưa coi cache cũ là quyền.                                                                                                 |
| 2. Subscribe             | Server kiểm auth/ACL và context M4 nếu là chat họp, đăng ký audience rồi xác lập mốc tin đã commit H trong cùng điều phối với đường ghi/fanout. Ack trả `subscriptionId`, `syncToken`, H và context hiện hành.                                 | Mọi tin thuộc khoảng trước/đến H phải đọc được qua history có quyền; tin commit sau ranh giới đã có subscription tiếp nhận. Không có khoảng giữa “chốt H” và “bắt đầu nhận”. |
| 3. Giữ tin mới và tải bù | Trong lúc đọc history, client tạm giữ event của đúng subscription/context. Reconnect dùng mốc L của lần đồng bộ hoàn tất trước; đọc khoảng sau L tới H. Lần mở đầu lấy trang mới nhất tới H, còn lịch sử cũ tải tiếp bằng cursor thông thường. | L và H do server cấp/xác minh, không phải đồng hồ client hoặc ID cuối thấy trên UI. H cố định cho cả lượt tải để tin mới không đẩy lệch trang.                               |
| 4. Đọc đủ trang          | API trả `nextCursor/hasMore` trong cùng `syncToken`; reconnect tiếp tục từng trang cho tới hết khoảng (L,H], kể cả hơn 50 tin. Đọc replies dùng root riêng; timeline TEXT chỉ nhận root.                                                       | Không lấy một trang rồi báo đã bù xong. Mỗi trang kiểm lại auth/ACL/context/deadline; cursor không tự cấp quyền.                                                             |
| 5. Gộp                   | Gộp history, ack gửi và event tạm theo message ID; tin đang gửi đối chiếu thêm `clientMessageId`. Event reply chỉ cập nhật đúng thread/root, không tăng count hai lần.                                                                         | Sắp theo thứ tự server; mỗi tin chỉ hiện một lần. Không tự lấy event cuối cùng làm checkpoint mới.                                                                           |
| 6. Hoàn tất              | Khi đã nhận đủ tới H và xử lý event tạm hợp lệ, đánh dấu lượt đồng bộ hoàn tất, lưu checkpoint H trong bộ nhớ client và chuyển nhận live bình thường.                                                                                          | Nếu rớt mạng giữa lượt, giữ checkpoint hoàn tất trước đó; lần sau subscribe lại rồi tải bù, cho phép dữ liệu trùng nhưng loại theo ID.                                       |

**Mốc đồng bộ khác cursor hiển thị:** cursor lịch sử hiện có dùng `(createdAt, _id)` để phân trang. ID/timestamp có thể được cấp trước commit, nên không mặc định “tin có ID lớn nhất đang thấy” nghĩa là mọi tin trước đó đã lưu đủ. `syncToken/checkpoint` là hợp đồng server về ranh giới commit. T1.3 có 4 giờ thử hai send commit lệch thứ tự và DB chậm để chốt cách biểu diễn/truy vấn mốc này dưới gate hiện có. Nếu cursor hiện tại không chứng minh được ranh giới, phải review đề xuất mốc theo thứ tự commit và delta dữ liệu/index cần thiết trước T4.2; không tự thêm field/migration, không công bố giải pháp chống sót đã hoàn tất chỉ từ tuple thời gian. Đây là điểm phải đóng trước code phụ thuộc, không để triển khai bằng một giả định ngầm.

Subscription/catch-up và buffer có giới hạn số tin/byte/thời gian theo Q7. Buffer đầy hoặc token hết hạn trả trạng thái cần đồng bộ lại, không âm thầm bỏ tin rồi báo thành công; hủy lượt cũ và xin lượt mới theo quyền hiện tại. Server restart làm token runtime cũ hết hiệu lực; yêu cầu snapshot/lượt mới, không dùng token để hồi grant nhóm. Mất quyền/đổi scope trong bất kỳ bước nào phải dừng history, thu subscription, xóa buffer/cache private tương ứng. Việc chặn vẫn ở server, không chỉ dựa client bỏ event.

Contract dự kiến bổ sung `syncToken, afterCheckpoint, throughCheckpoint, nextCursor` cho đường history thích hợp và checkpoint/context cho ack subscribe. Tên/encoding cuối cùng chốt Q9 cùng consumer; không bắt DM/TEXT mang session epoch khi không tham gia cuộc gọi. Không lưu nội dung private hoặc dữ liệu upload nhạy cảm vào localStorage.

**Ca kiểm bắt buộc:** tin đến ngay trước/giữa/sau subscribe ack và truy vấn history; hơn hai trang tin bị bỏ lỡ; nhiều tin cùng timestamp; commit muộn khác thứ tự cấp ID; event đến trước ack hoặc trùng history; reply không nhân count; rớt mạng giữa trang; buffer đầy; gỡ quyền/chuyển nhóm/hết giờ ngay khi tải bù. Chỉ nghiệm thu không sót sau khi đóng Q9 và chạy các ca này.

### 6.3. Upload, tải xuống và dọn tệp

Luồng upload có hai bước khác nhau: truyền tệp qua backend lên R2 và gắn tệp đó vào tin nhắn. Upload xong chưa có nghĩa tệp đã thuộc một tin gửi thành công.

1. **Kiểm tra và giữ chỗ dung lượng:** xác thực người gửi, hội thoại đích, loại/kích thước được phép. Server ghi nhận quyền hiện tại và phần dung lượng dành cho lượt upload.
2. **Nhận tệp:** backend truyền từng phần lên R2 riêng tư, kiểm kích thước trong lúc nhận; không tạo bản lưu lâu dài trên ổ đĩa máy chủ. Kiểm loại tệp từ nội dung thực tế, không chỉ tin tên hoặc thông tin trình duyệt gửi lên. Ảnh phải kiểm đọc được và kích thước hợp lệ.
3. **Kiểm lại khi upload xong:** nếu quá hạn, người dùng mất quyền hoặc quyền đã thay đổi so với lần cấp upload thì hủy lượt cũ và yêu cầu tải lại. Không tự cấp quyền mới cho tệp đang chờ.
4. **Gắn vào tin:** khi bấm Gửi, kiểm đúng người upload/đúng hội thoại rồi lưu tin cùng việc gắn tệp. Hai tin tranh cùng một tệp thì chỉ một tin được dùng.
5. **Dọn khi lỗi hoặc bỏ dở:** hủy lượt ghi đang chạy, đánh dấu tệp cần xóa và dọn nội dung trước khi bỏ thông tin quản lý tệp.

Các trạng thái lưu trữ dùng theo thiết kế: `STAGED` là tệp tạm chưa gắn đích, `READY` là tệp đã gắn hợp lệ, `DELETE_PENDING` là chờ dọn. Trạng thái READY không tự cấp quyền đọc.

**Giới hạn khởi đầu:** 4.000 ký tự/tin, đếm thống nhất cả ký tự như emoji; tối đa 4 tệp/tin, 10 MiB/tệp, 500 MiB/Workspace và 2 lượt upload/người cùng lúc. Ảnh giữ hình tối đa 1920×1080, 2 MiB/ảnh; 20 MiB/phiên là cấu hình thử nhỏ. Video recording cần giới hạn riêng, không áp các mức này một cách máy móc.

**Tải xuống:** server kiểm quyền mỗi lần mở tệp, tải lại hoặc yêu cầu một đoạn video để tua. Tải đang mở được theo dõi để có thể dừng khi người dùng bị gỡ quyền, hết phiên đăng nhập hoặc nhóm đóng. Không giữ khóa xử lý chung trong suốt lượt tải. Nội dung không được phép chạy trực tiếp như mã trang web; cách kiểm loại tệp/thư viện cụ thể chốt ở Q3. Những byte đã gửi hoặc bản người dùng đã tải không thể thu hồi.

**Lưu trên R2:** dùng phần kết nối R2 chung của M2, nhưng tách mã tệp và mục đích chat/ảnh giữ hình/video; mỗi loại vẫn kiểm quyền và vòng đời riêng. Mã tệp do server tạo, không dùng tên client làm đường dẫn và không trả link R2 trực tiếp. Ảnh/tài liệu đi qua backend để kiểm nội dung trước khi cho gắn hoặc tải. Dữ liệu chưa kiểm xong nằm ở trạng thái STAGED trên R2 và không được đọc như tệp hoàn chỉnh; lỗi hoặc mất quyền thì hủy upload và lên lịch dọn. Phần kiểm ảnh dùng bộ nhớ có giới hạn; nếu thư viện buộc cần tệp tạm thì phải review trước, không âm thầm thêm kho tệp trên máy chủ.

Upload R2 không cùng một lần lưu nguyên tử với MongoDB. Vì vậy phải giữ mã tệp/mã lượt upload để tra lại khi mất phản hồi hoặc restart; chỉ báo upload thành công sau khi xác nhận nội dung đã lưu và kiểm hợp lệ. Xóa phải hủy lượt đọc/ghi trước, xóa nội dung R2 hoặc hủy các phần upload bỏ dở, rồi mới bỏ thông tin quản lý. Không coi xóa metadata trong MongoDB là đã xóa tệp trên cloud.

**Dung lượng và dọn tệp:** tính cả phần đang giữ chỗ và tệp chưa xóa xong; không trả dung lượng trong khi nội dung hoặc phần upload bỏ dở vẫn còn trên R2. Sau sự cố phải đối chiếu database với kho tệp trước khi nhận upload mới ở phần chưa kiểm xong. Tác vụ dọn chạy lại không được trừ dung lượng thêm hoặc báo lỗi chỉ vì tệp đã xóa ở lần trước.

Theo [vòng đời hiện hành](../database/lifecycle.md), tác vụ dọn chạy khởi đầu mỗi 60 giây; upload bỏ dở quá 15 phút được dọn; ảnh giữ hình hết tham chiếu dọn sau khoảng chờ tối đa 5 phút. Chat riêng trong cuộc họp khóa ngay khi đóng và dọn sau 24 giờ. Tệp kênh/Workspace bị xóa dọn sau 7 ngày khi không còn được dùng. Đây là cấu hình khởi đầu, không tự áp cho recording. Khi dọn thread, dọn trả lời trước tin gốc và giữ đủ thông tin để tiếp tục nếu máy chủ dừng giữa chừng.

**Phối hợp M5:** M5 quyết định nhóm có được giữ ảnh đó không và ảnh còn đang dùng không; M2 quản lý việc lưu/tải/dọn ảnh. MAIN không có freeze nên không tạo ảnh giữ hình MAIN. Nếu muốn gửi ảnh bảng vào chat, tạo một tệp đính kèm riêng; không lấy tệp giữ hình đang dùng rồi đổi quyền. Người rời nhóm không làm ảnh của những người còn lại bị xóa.

#### 6.3.1. Hướng thử thư viện và phần dùng chung

Đây là hướng kỹ thuật để khảo sát, chưa cài package hoặc chọn phiên bản production trong PR tài liệu. Ưu tiên thử bộ nhỏ dưới đây trên Node 26/ESM và Linux image dự án; chỉ pin version và sửa lockfile trong PR implementation sau review.

| Phần                | Hướng thử                                                                                                                                                                           | Kết quả cần kiểm                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhận multipart      | [Busboy](https://github.com/mscdex/busboy), nối stream vào writer bằng `node:stream/promises.pipeline` và hủy theo timeout/disconnect/revoke.                                       | Cấu hình rõ fileSize/files/fields/parts/header và giới hạn byte tổng; xử lý limit/truncated, drain hoặc hủy stream; không giữ cả file trong RAM, không dùng tên file client làm đường dẫn.                                   |
| Nhận diện định dạng | [file-type](https://github.com/sindresorhus/file-type), đọc mẫu đầu có giới hạn từ luồng dữ liệu, đối chiếu loại được phép.                                                         | Đây chỉ là dấu hiệu định dạng từ nội dung nhị phân, không chứng minh file hợp lệ/an toàn. Loại không nhận diện được xử lý theo allowlist Q3, không đoán từ đuôi; tệp text không dùng phép nhận diện ảnh để coi đã kiểm xong. |
| Kiểm và xử lý ảnh   | [sharp](https://sharp.pixelplumbing.com/api-constructor/): đọc kích thước và thử decode có kiểm soát; cấu hình `limitInputPixels`, lỗi ảnh hỏng, giới hạn số lượt xử lý và timeout. | Kiểm riêng JPEG/PNG/WebP và file giả/hỏng/pixel quá lớn; không bật unlimited, không rasterize SVG/PDF tùy ý. Thử đủ để chứng minh nhận/kiểm thực sự có giới hạn RAM/CPU, không coi chỉ đọc metadata là đã decode ảnh hợp lệ. |
| Avatar Cloudinary   | [Cloudinary Node SDK](https://cloudinary.com/documentation/node_image_and_video_upload#the_upload_stream_method), thử upload qua backend và cleanup phía server.                    | Nhận `uploadId/publicId/secureUrl` qua kết quả đã xác minh đúng chủ; thử timeout/unknown response/xóa lỗi. Không dùng upload unsigned công khai hoặc credential frontend để rút ngắn luồng.                                  |

Q3/Q8 chốt allowlist sản phẩm trước bật handler, đặc biệt ảnh động, SVG và tệp không nhận diện được. Việc thư viện hỗ trợ một định dạng không tự có nghĩa ứng dụng cho phép. sharp có thành phần native; phải kiểm cài/chạy trên runtime thật và mức dùng tài nguyên khi cùng media. Timeout request không mặc định đã dừng công việc native; T1.4 phải thử hủy/giới hạn và ghi giới hạn còn lại, chưa tự thêm worker pool.

| Loại nội dung            | Dùng chung                                                                                       | Tách riêng                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ảnh chat và tệp đính kèm | Parser stream, đếm byte, nhận diện nội dung; ảnh dùng bộ kiểm ảnh, lỗi và instrumentation chung. | ACL conversation, quota Workspace, STAGED → MESSAGE; file không ảnh không đi qua bộ resize ảnh. Meeting chỉ nhận ảnh.                                      |
| Frame nhóm               | Parser và kiểm ảnh có giới hạn.                                                                  | Intent/source/context M5, kích thước tối đa 1920×1080/2 MiB, quota frame, BOARD_FRAME; không tự crop/đổi tỷ lệ hoặc chuyển thành attachment.               |
| Avatar                   | Parser/kiểm ảnh và kiểu lỗi chung.                                                               | Chính chủ User, normalize/resize theo Q8, Cloudinary công khai, budget và cleanup riêng; không dùng quyền Workspace hoặc collection chat làm quyền avatar. |
| Video recorder           | Đầu ghi tạm và cách đếm dung lượng có thể dùng chung; video hoàn tất upload lên R2 riêng tư.     | Không đi qua multipart/decoder ảnh; M3 encode, M2 nhận output nội bộ như mục 6.5.                                                                          |

**Nghiên cứu có thời hạn:** T1.4 tối đa 4 giờ cho Busboy/file-type/sharp; đầu ra là thử nghiệm cô lập với ảnh/tệp giả, quá size, ngắt stream, nhiều lượt đồng thời, RAM/time và kết luận chọn/pin hoặc điểm không đạt. T1.5 tối đa 4 giờ cho contract/avatar SDK cùng M1, dùng môi trường thử được cấp, không lấy secret production. Nếu thiếu môi trường hoặc hết thời gian mà chưa chứng minh được, ghi kết quả/blocker và ước lượng task tiếp; không kéo dài vô hạn hoặc gọi PoC đã pass. Hai task này không chặn việc làm TEXT chỉ có văn bản.

### 6.4. Quyền chat và thay đổi phòng/nhóm

| Nơi trao đổi        | Ai được đọc/gửi/nhận tin và tải tệp?                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEXT                | Thành viên còn quyền kênh. PRIVATE cần được cấp quyền riêng; owner/admin ngoài danh sách không tự đọc được nội dung. Thread theo cùng quyền của kênh. |
| DM                  | Đúng hai người, cả hai còn là thành viên hợp lệ của Workspace. Admin không có quyền đọc thay.                                                         |
| Everyone tại MAIN   | Người hiện ở MAIN trong phiên còn hoạt động; không gửi sang mọi nhóm.                                                                                 |
| Everyone trong nhóm | Người thực sự đang ở đúng nhóm còn mở; có tên trong danh sách dự kiến chưa đủ quyền. Host chỉ đọc khi hỗ trợ đúng ACTIVITY.                           |
| Host riêng          | Người gửi và đúng host nhận ban đầu; phiên còn hoạt động và cả hai còn quyền kênh. Host mới không nhận lịch sử của cặp cũ.                            |

Chat họp chỉ có văn bản/ảnh, không có tệp bất kỳ hoặc thread. Khi đổi nhóm hay đổi host trong lúc người dùng đang soạn/upload, server báo đích cũ không còn hợp lệ để người dùng xác nhận lại. Không tự chuyển câu hỏi riêng thành Everyone hoặc gửi sang host mới. Host cũ vẫn đọc phần gửi cho mình theo quyền đã chốt khi phiên còn hoạt động, nhưng không nhận câu hỏi mới chỉ vì từng là host.

DISCUSSION tạo ngay khi hợp lệ, từng người chủ động bấm vào; chưa vào thì chưa được đọc chat nhóm. Nhóm chưa ai vào vẫn chờ. Theo main cập nhật ngày 04/11, DISCUSSION disconnect thu membership nhóm ngay; nếu nhóm đã từng có người trở thành rỗng thì đóng và khóa chat/ảnh, reconnect về MAIN. Người cuối chủ động rời cũng đóng nhóm. Grace của call ownership không giữ quyền chat nhóm cũ. ACTIVITY không đóng theo số người còn lại. Host không vào hỗ trợ DISCUSSION, mà hỏi/trả lời qua chat riêng khi ở MAIN.

**Khi bị thu quyền:** M1/M4 xác định thay đổi → chặn truy cập cũ → M2 ngừng phát tin, hủy upload/download liên quan và bỏ đăng ký nhận tin → giao diện bỏ dữ liệu riêng cũ → chỉ mở nội dung mới sau khi kiểm quyền. Nếu dọn chưa xong hoặc lưu quyền lỗi, giữ phần đã thu ở trạng thái chặn và kiểm tra lại; không báo hoàn tất giả.

DM giữ cùng hội thoại sau khi một người rời rồi gia nhập lại Workspace, nhưng chỉ mở khi cả hai tư cách thành viên đều hợp lệ. Quyền PRIVATE cũ không tự phục hồi, owner/admin phải thêm lại. Rời cuộc gọi không đóng lịch sử DM.

Phần kỹ thuật dùng cùng thứ tự xử lý đã chốt: quyền tài khoản nếu cần → Workspace → kênh → phiên. Không tạo một khóa riêng của M2 chạy trái thứ tự M1/M4; không giữ hàng đợi xử lý phiên khi chờ upload hoặc người dùng. Kiểm quyền trước lưu và trước phát tin. Với ACTIVITY, nếu hết giờ trong lúc chờ database thì không phát tin/cấp lại quyền nhóm cũ, dù tin có thể đã được lưu; xử lý kết quả và dọn theo vòng đời đã thống nhất.

### 6.5. Lưu và xem lại recording

M3 tạo video từ nội dung MAIN; M2 tham gia từ trước khi thu hình để giữ chỗ dung lượng và cấp đầu nhận dữ liệu; kết quả được lưu trên R2 riêng tư và cho xem lại qua API có kiểm quyền. Không chờ M3 ghi xong một video lớn rồi mới kiểm chỗ lưu. Người xem cần còn là thành viên Workspace và còn quyền kênh LIVE hiện tại, kể cả PRIVATE. Từng tham gia buổi học hoặc biết URL không đủ quyền.

**Trách nhiệm và nguồn đối chiếu:** dùng [schema recordings do M3 bàn giao](../database/recordings-schema.md) làm thiết kế dữ liệu cho proposal này. M2 sở hữu phần lưu/cập nhật `recordings` và `files`; M3 tạo video và báo kết quả, không tự sửa document; M4 kiểm quyền host và vòng đời phiên; M1 cung cấp quyền kênh. Đây là thiết kế cần kiểm thử khi triển khai, chưa tạo collection, index hoặc migration.

**Một đoạn ghi có hai phần thông tin:** `recordings` theo dõi quá trình ghi, còn một mục `files` có `purpose: RECORDING` theo dõi tệp. Hai phần liên kết bằng `fileId` và `binding.recordingId`, tạo cùng lúc trước khi mở đầu ghi. Không gắn video vào tin nhắn hoặc mượn loại ảnh giữ hình. Mỗi phiên có thể có nhiều đoạn đã hoàn tất; gửi lại cùng yêu cầu vẫn trả đúng đoạn/tệp cũ.

| Nhóm thông tin    | Nội dung và ý nghĩa                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Định danh         | Workspace, kênh LIVE, phiên và epoch xác định nơi bản ghi thuộc về; người bắt đầu chỉ để truy vết, không tự có quyền xem/dừng mãi mãi.                    |
| Chống trùng       | `startRequestId` cùng phiên/người bắt đầu và mã kiểm nội dung yêu cầu giúp trả lại kết quả cũ khi thử lại; cùng mã nhưng nội dung khác phải báo xung đột. |
| Lần xử lý         | `attemptId`, `generation` và `revision` ngăn kết quả trễ ghi đè; bản đầu một attempt/bản ghi, generation = 1, đổi host không tạo đời recording mới.       |
| Mốc thời gian     | Bắt đầu thu thực tế, hạn dừng, yêu cầu dừng đầu tiên, đầu vào đã dừng, bắt đầu xử lý, sẵn sàng hoặc lỗi. Không lấy giờ click/ack làm bằng chứng đã ghi.   |
| Tệp video         | Mã kho/mã tệp R2, MIME, số byte, kích thước hình, thời lượng và mã SHA-256 đã kiểm nằm ở `files`; không lặp thành hai nguồn dữ liệu khác nhau.            |
| Theo dõi thao tác | Bốn ô cố định `reserve`, `commit`, `abort`, `releaseTemporary` và `storedReceipt` để tra kết quả khi mất phản hồi, không lưu mảng retry tăng vô hạn.      |

**Trạng thái:** `STARTING → RECORDING → STOPPING → PROCESSING → READY`, nghĩa là chuẩn bị → đang ghi → đang dừng → đang hoàn tất/upload/kiểm → xem được. Lỗi đã xác định đi `FAILED`; hủy khi đang chuẩn bị không được giả đã thu hình. `files` vẫn dùng STAGED/READY/DELETE_PENDING. Khi công bố video, cập nhật cả recording và file sang READY trong cùng lần lưu MongoDB; không có trường hợp một bên báo xem được còn bên kia chưa xong. Callback cũ không đổi READY thành FAILED.

**Giới hạn đề xuất theo schema bàn giao:**

Sau khi merge main `4751079`, nguồn recording chung vẫn để quota/retention mở. Phần dưới giữ phương án M2 theo yêu cầu đồng bộ schema để team review; hạn 3 tiếng, profile và READY vô thời hạn chưa được gọi là chính sách sản phẩm đã duyệt chỉ từ PR này. Chỉ PoC trên kho thử cô lập có hạn mức; chưa bật lưu video sản phẩm trước khi nhóm xác nhận chính sách/giới hạn.

- Mỗi đoạn thu tối đa **3 tiếng**, tính từ lúc thực sự bắt đầu; đổi host không đặt lại đồng hồ. Hết hạn tự dừng đầu vào rồi hoàn tất phần đã thu. Thời lượng đo trong tệp có thể lệch do hoàn tất dữ liệu; ngưỡng chấp nhận phải qua PoC, không dùng validator cắt cứng theo thời lượng tệp.
- Cấu hình video đầu là **MP4, H264 cho hình, AAC cho tiếng**, MIME `video/mp4`. Phải thử phát/tua và kiểm hình/tiếng thật trước nghiệm thu; đây chưa là bằng chứng encoder đã chạy.
- Video READY **giữ vô thời hạn**, không có TTL hoặc lịch tự xóa chỉ vì đã cũ. Không áp 15 phút upload chat, 24 giờ chat riêng hoặc 7 ngày xóa tệp cha vào video. Khi kênh/Workspace bị xóa, chặn đọc ngay; quyền xóa byte và chính sách sau khi cha bị xóa còn cần quyết định riêng. Giữ vô thời hạn không có nghĩa dung lượng được dùng vô hạn: hạn mức video/chi phí phải có trước bật lưu.
- Mỗi phiên chỉ có một bản ghi ở STARTING/RECORDING/STOPPING/PROCESSING. Vì vậy đang upload đoạn trước thì chưa ghi đoạn mới. Bản PoC có **một slot ghi toàn process**, tính cả hoàn tất/upload/kiểm và cleanup còn giữ tài nguyên; FAILED chưa đồng nghĩa đã trả slot. M3 giữ admission, M2 cung cấp trạng thái tài nguyên để xác nhận trả slot; không dùng index MongoDB thay giới hạn này.

**Tìm video từ kênh:** mở kênh LIVE → mục Bản ghi → danh sách video READY của các phiên đã kết thúc hoặc còn hoạt động → chọn xem. M2 có API theo kênh, không yêu cầu biết sessionId và không chờ API lịch sử phiên M4. Danh sách theo kênh sắp mới nhất bằng `readyAt` và ID; đề xuất 30, tối đa 50 mục/trang. Danh sách theo phiên sắp theo `createdAt` và ID; chỉ trả các mục READY cho người xem thông thường. M4 cung cấp trạng thái đang ghi/xử lý hoặc thông báo lỗi cho đúng người đang được phép nhận trong phiên; không mặc định mở lịch sử FAILED/nội bộ qua REST cho cả kênh.

Mỗi mục chỉ trả ID, kênh/phiên được đọc, trạng thái, thời điểm và thông tin phát phù hợp. Không trả mã kho, đường dẫn, chi tiết thao tác/biên nhận nội bộ hoặc lỗi thô. Giao diện phân biệt chưa có video sẵn sàng, đang tải và lỗi lấy danh sách. Khi đoạn đang PROCESSING còn giữ slot, hiển thị chưa thể ghi đoạn mới, không giả nút ghi đã hoạt động.

Danh sách và nội dung đều kiểm membership Workspace, kênh còn tồn tại và quyền kênh hiện tại, kể cả PRIVATE. Phiên kết thúc không khóa video READY. Mỗi lần tua/tải tiếp đều kiểm quyền; bị gỡ quyền thì dừng truyền và chặn yêu cầu sau. Tệp chỉ được mở khi cả recording và file READY, liên kết khớp. Mã file hoặc quyền service ghi video không là quyền xem.

**Index cần kiểm trên DB thử:** chống trùng start theo phiên/người/mã yêu cầu, liên kết file hai chiều duy nhất, một recording chưa hoàn tất mỗi phiên, danh sách READY theo Workspace/kênh/readyAt/ID, lịch sử phiên và batch đối soát/dọn tạm. Dùng đúng điều kiện lọc của index; kiểm dữ liệu trùng và kế hoạch truy vấn trước nghiệm thu. Không tạo index/migration trên DB đang dùng trong task tài liệu.

Lỗi lưu không làm kết thúc cuộc gọi. Không giữ cả video dài trong RAM hoặc giữ khóa phiên khi chờ ghi/upload/kiểm. Sau restart chỉ đối soát dữ liệu và tài nguyên; không tự thu lại cuộc gọi hoặc cứu clip chưa hoàn tất. Hạn mức byte, thời gian xử lý/upload, thời hạn bản tạm/lỗi và quyền xóa còn phải chốt Q5/Q7; demo clip ngắn không chứng minh ghi 3 tiếng đạt.

#### Luồng lưu và xem video trên R2

```mermaid
flowchart TD
  A[Host bấm ghi hình] --> B[M4 kiểm quyền host và phiên]
  B --> C[M2 kiểm hạn mức, slot và cấp đầu nhận video]
  C --> D[M3 ghi MAIN, tối đa 3 tiếng mỗi đoạn]
  D --> E[M2 nhận dữ liệu có giới hạn]
  E --> F[Lưu R2: cách truyền và tệp tạm chốt sau thử nghiệm]
  F --> G[Dừng ghi: M3 hoàn tất video, M2 hoàn tất upload]
  G --> H[M2 kiểm kết quả lưu và đánh dấu sẵn sàng]
  H --> I[Người dùng mở mục Bản ghi của kênh]
  I --> J[M2 kiểm quyền xem hiện tại]
  J --> K[M2 đọc từng đoạn từ R2 và trả về trình phát]
```

**Cách đọc sơ đồ:** M2 kiểm hạn mức trước khi M3 ghi hình. M3 tạo nội dung, M2 nhận từng phần và quản lý việc lưu trên R2. Đến hạn 3 tiếng hoặc có lệnh dừng, phải hoàn tất cả video lẫn upload mới báo sẵn sàng. Trong lúc PROCESSING chưa thể ghi đoạn tiếp; chỉ sau khi trả slot mới nhận lượt mới. Khi xem lại, M2 kiểm quyền rồi đọc từng đoạn từ R2 về trình duyệt. Sơ đồ chưa chốt ghi thẳng lên R2 hay dùng tệp tạm trong lúc ghi; hai bên thử trước để chọn cách chạy được. Lỗi lưu phải báo rõ và không làm kết thúc cuộc gọi.

**Điểm cần thử cùng Việt:** ưu tiên truyền từng phần từ đầu ghi do M2 quản lý lên R2, với giới hạn bộ nhớ và tốc độ. T9.1 kiểm định dạng video có cần quay lại sửa phần đã ghi hay không; R2 không thay thế một tệp cho phép sửa ở vị trí bất kỳ. Nếu bộ ghi không hỗ trợ đường truyền này thì review phương án tệp tạm có hạn mức, có dọn và thuộc quản lý M2. Tệp tạm chỉ phục vụ ghi/xử lý, không là kho lâu dài hoặc đường cho người dùng tải. Chưa chọn một trong hai cách khi chưa có kết quả thử. M2 giữ mã tệp R2 và thông tin video trong MongoDB; mỗi bản ghi/lần xử lý dùng mã riêng để tránh ghi đè.

**Upload và xác nhận:** backend dự kiến dùng `@aws-sdk/client-s3` theo [hướng dẫn R2 cho Node.js](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/); chưa thêm dependency trong task tài liệu. T9.7 thử cách upload chia phần cho tệp lớn, có trần số phần đang gửi, bộ nhớ, thời gian và số lần thử lại. Ghi bền mã lượt upload và các phần cần đối soát để dọn được sau restart. R2 không cấp sẵn quota nghiệp vụ cho từng Workspace: M2 phải tự kiểm hạn mức trước ghi và trước upload. Đang upload vẫn là đang xử lý, chưa được phát.

Dù ghi thẳng hay qua tệp tạm, chỉ chuyển sang READY khi M3 đã hoàn tất video, R2 xác nhận lưu xong và M2 kiểm đúng mã tệp/dung lượng cùng kết quả phát theo định dạng đã thống nhất. Không coi ETag là mã kiểm nội dung toàn tệp trong mọi kiểu upload. Nếu upload có kết quả chưa rõ, tra lại đúng mã tệp trước khi gửi lại; không tạo video thứ hai. Nếu R2 lưu thành công nhưng MongoDB cập nhật lỗi, khôi phục bằng thông tin lần xử lý đã lưu. Không xóa tệp tạm chỉ vì nhận một phản hồi upload chưa xác định.

**Xem và thu quyền:** kho R2 không bật đọc công khai. `GET /api/v1/recordings/:rid/content` kiểm quyền rồi chuyển từng đoạn từ R2 về web, hỗ trợ Range và các header phát/tua phù hợp. Khi mất quyền hoặc người xem đóng trang, hủy cả luồng về trình duyệt lẫn yêu cầu đọc R2 tương ứng; không gom cả video vào RAM. Nội dung riêng tư không được cache công khai. Đường phát này không trả link R2 ký sẵn cho client, vì [link ký có thể dùng lại đến lúc hết hạn](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), không tự hết hiệu lực khi bị gỡ khỏi kênh.

**Dọn và lỗi:** giới hạn cả dung lượng tạm trên máy chủ và video đang upload/đã lưu trên R2, gồm phần bỏ dở/chưa xóa xong. Chỉ giải phóng từng phần dung lượng sau khi xác nhận đã dọn ở đúng nơi. Upload lỗi được thử lại có giới hạn; quá hạn chuyển lỗi và ghi việc cần dọn, không giữ tệp tạm vô hạn. Khi xóa video, chặn quyền đọc trước, rồi xóa tệp R2 và phần tạm; nếu xóa lỗi thì thử lại an toàn. Video READY giữ vô thời hạn theo schema. Thời hạn bản tạm/lỗi và quyền xóa khi cha bị xóa phải chốt Q5; không tự dọn video READY theo lịch chat.

**Khi deploy và tính chi phí:** tệp riêng tư nằm lâu dài trên R2, web đọc qua API M2 nên không phụ thuộc ổ đĩa máy chủ để xem lại. Nếu PoC yêu cầu tệp tạm cho video, tệp đó nằm ở backend, không phải laptop người viết code; phải quy định dung lượng, thời hạn và hành vi khi container bị tạo lại. Mất tệp tạm thì báo phần ghi chưa hoàn tất là lỗi, không giả khôi phục được video. Tài khoản R2, tên bucket và quyền truy cập chỉ cấu hình ở backend, khóa truy cập không đưa vào web hoặc log. Môi trường thử dùng kho tách khỏi dữ liệu thật. Theo [bảng giá R2](https://developers.cloudflare.com/r2/pricing/) được đối chiếu ngày 04/11/2026, Standard là 0,015 USD/GB-tháng, miễn phí 10 GB-tháng và có hạn mức thao tác miễn phí; vượt mức có phí. R2 miễn phí lưu lượng đi ra, nhưng đường phát qua M2 vẫn có chi phí/băng thông backend. Ngân sách, quota và cảnh báo chi phí phải thống nhất trước bật lưu thật; chưa tạo tài khoản hoặc cấu hình dịch vụ trong thay đổi này.

#### 6.5.1. Phối hợp M2–M3 trước, trong và sau capture

**Hướng ưu tiên để review với Việt:** M2 sở hữu đầu nhận dữ liệu có giới hạn; việc có tệp tạm hay không chốt qua T9.1; M3 đưa output đã encode vào sink nội bộ do M2 cấp. M3 không mặc định tạo thêm một bản video đầy đủ ở chỗ riêng rồi mới copy sang M2. Giao tiếp là interface trong backend, không thêm upload video qua Socket.IO hoặc một dịch vụ mạng công khai. M3 vẫn sở hữu capture/ghép hình/trộn tiếng/encode; M4 cấp quyền/intent và lifecycle phiên.

| Giai đoạn            | M2 — storage/metadata                                                                                                                                                                                          | M3 — recorder                                                                                                            | M4 / điều kiện công bố                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Trước capture        | Kiểm hạn mức R2, upload và bộ nhớ theo recording/session/process; kiểm ổ đĩa tạm nếu cách ghi đã chọn cần dùng, tạo metadata STARTING và giữ reservation. Cấp recording ID, attempt ID và handle writer riêng. | Chưa báo đang ghi hoặc tạo output không được theo dõi; chỉ khởi động sau reserve thành công.                             | M4 xác minh host, epoch, start intent còn hợp lệ; hết chỗ trả lỗi khởi động, call tiếp tục.                                                 |
| Capture đã chạy      | Ghi nhận trạng thái đã xác minh qua lời gọi M3; không tự suy đang ghi từ việc tệp xuất hiện.                                                                                                                   | Báo capture thực sự chạy với đúng ID/attempt; M3/M4 kiểm lại ý định chưa bị hủy trước khi công bố RECORDING.             | Người vào sau nhận trạng thái đã lọc; đổi host không tạo writer mới chỉ vì đổi người điều khiển.                                            |
| Đang ghi             | Writer ghi từng phần, đếm byte thật, giữ buffer hữu hạn. Reservation phải tăng được trước khi vượt phần đã cấp; không vượt quota bằng cách chờ sweep.                                                          | Chấp hành backpressure/error của sink, không gom video dài trong RAM hoặc tiếp tục ghi vào tệp khác khi sink bị đóng.    | Q5/Q7 chốt trần và nhịp mở rộng reservation, số job/byte đồng thời; không giữ queue phiên khi truyền output.                                |
| Stop/end/hủy         | Chặn cấp writer mới cho cùng attempt khi đã dừng; giữ sink đang hoàn tất đúng thời hạn, theo dõi byte cần dọn.                                                                                                 | Ngừng nhận nguồn mới ở mốc dừng, flush/EOS dữ liệu đã thu rồi đóng đầu ra. Callback start muộn bị hủy theo đúng attempt. | Kết thúc cuộc gọi không chờ encode/READY; phần finalize hợp lệ vẫn chạy dù session runtime đã kết thúc, với giới hạn và quyền nội bộ riêng. |
| Hoàn tất             | Sau writer đóng/flush, kiểm byte/tệp/thông tin M3 bàn giao; lưu READY và chuyển reservation thành byte đã dùng đúng một lần.                                                                                   | Gửi mô tả output đã kiểm: định dạng, thời lượng khi xác định, kết quả hoàn tất, số byte; phối hợp kiểm phát/tua.         | Chỉ READY sau khi upload R2 và kiểm kết quả thành công; không READY chỉ vì nhận Stop ack, process thoát hoặc tệp có đuôi video.             |
| Lỗi mạng/hết hạn mức | Writer từ chối/hủy và trả lỗi có recording ID; cập nhật trạng thái lỗi khi kết quả đã xác định, giữ byte chưa dọn trong quota, lên lịch cleanup.                                                               | Dừng recorder/đầu ra đúng attempt, báo lỗi cho M4; không kết thúc call hoặc tự ghi tệp thay thế.                         | M4 phát trạng thái thật tới người còn quyền, không mở grant cũ để “cứu” bản ghi.                                                            |

Hủy trong STARTING cần chặn cả callback capture muộn. Nếu đã có byte, đánh dấu tài nguyên tạm cần đối soát theo Q5, không tự công bố READY hoặc âm thầm xóa như một chính sách đã chốt. M2 là writer duy nhất của trạng thái lưu trữ bền; M3 giữ tiến trình recorder và yêu cầu chuyển trạng thái, M4 dùng projection, tránh mỗi miền ghi một trạng thái READY khác nhau.

**Interface tối thiểu, tên dự kiến cho review:**

| Bên gọi → M2                            | Dữ liệu / kết quả chính                                                                                                                         | Retry và lỗi                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| M4/M3: `reserveRecording`               | Context server đã xác minh: Workspace/kênh/session/epoch, start key ổn định, budget. Trả `recordingId, attemptId` và reservation.               | Cùng start key/payload trả cùng bản ghi; khác payload conflict. RequestId đơn lẻ không tự chứng minh dedupe bền.                 |
| M3: `openRecordingSink`                 | Đúng ID/attempt còn quyền xử lý; trả handle Writable/cancellation/deadline nội bộ, không đưa storageKey cho client.                             | Một writer hoạt động/attempt; mở lại không tự reset tệp hoặc tạo bản sao. Seek/container phải qua PoC trước chọn implementation. |
| M3: `markCapturing / markStopping`      | Kết quả capture/dừng đã xác minh và revision/attempt dự kiến; trả trạng thái bền hiện tại.                                                      | Lệnh trễ/sai attempt không ghi đè trạng thái mới. Runtime còn phải kiểm với M4 trước phát event.                                 |
| M3: `finalizeRecording` → M2 commit     | M3 gửi đúng ID/attempt/generation, mô tả output đã hoàn tất; M2 tự kiểm đích R2, commit hai document và trả storedReceipt hoặc kết quả chưa rõ. | Gọi lại cùng kết quả trả cùng artifact, không nhân file, reservation hoặc metadata. Kết quả khác của cùng attempt báo conflict.  |
| M3/M4: `abortRecording / failRecording` | Lý do hủy/lỗi an toàn, mốc cắt đầu vào, ID/attempt; trả tài nguyên đã dừng/phần đang dọn.                                                       | Gọi lại an toàn; không chuyển READY thành FAILED vì callback cũ.                                                                 |
| M3/M4: `getRecordingResult`             | Tra theo start key hoặc recording ID/attempt sau timeout.                                                                                       | Unknown commit phải read-back trước retry/fail; không báo “chưa tạo” rồi tạo thêm bản ghi.                                       |

Các tên hàm ở bảng là lớp gọi nội bộ của M2, ánh xạ tới bốn thao tác bền trong schema: reserve/commit/abort/releaseTemporary. `finalizeRecording` nhận mô tả đầu ra từ M3; chính M2 xác minh R2 và commit, không bắt M3 tự chứng minh upload do M2 thực hiện. Thêm thao tác `releaseTemporary` sau receipt bền và kiểm tệp đích tồn tại; gọi lại an toàn, lỗi dọn tạm không đổi READY thành FAILED. `getRecordingResult` trả trạng thái/receipt đúng start/operation, không yêu cầu capture còn ACTIVE hoặc cookie người bắt đầu còn hiệu lực cho việc hoàn tất nội bộ. Quyền người dùng vẫn kiểm riêng khi trả nội dung ra ngoài.

`recordingArtifact.temporary` theo dõi tài nguyên trước hoàn tất do M2 cấp; không cho phép M3 tự gửi đường dẫn tùy ý. Nếu bản tạm chính là tệp đích, adapter phải xác nhận chuyển quyền sở hữu trước receipt và không xóa chính tệp READY khi dọn tạm. Nếu dùng tệp tạm riêng, chỉ xóa phần đó sau xác nhận lưu đích. Chi tiết biểu diễn đường ghi trực tiếp trong adapter được chốt qua T9.1, không tự đổi field schema hoặc bắt buộc ghi ra disk.

Các thao tác metadata dùng kiểm revision/attempt và transaction/CAS khi cần; lời gọi ổ đĩa, R2 hoặc xử lý video không ở trong callback transaction. Mã start chống trùng phải được tra bền cùng scope; không chỉ giữ trong RAM rồi mất sau restart. Schema/index và thông tin reservation/attempt/cleanup theo bản bàn giao; Q5 chốt ánh xạ adapter và kiểm fixture trước implementation, không tự chạy migration trong proposal này.

**T9.1 — thử giới hạn 4 giờ trước PoC tích hợp:** dùng output thử do M3 cấp để kiểm sink/backpressure, container có cần seek hay không, EOS/flush, ngắt/hết disk, finalize lặp và giới hạn RAM. Kết quả là interface được hai bên xác nhận và số đo đầu ra. Nếu GStreamer/output đã chọn không nối được qua Writable mà cần tệp seekable, dừng phần phụ thuộc và review phương án M2 cấp lease cho tệp tạm có hạn mức trước capture; phải chứng minh ai cưỡng chế byte/disk, đóng handle và bàn giao duy nhất. Không âm thầm để M3 tự giữ tệp không được M2 quản lý. Task thử không là bằng chứng pipeline media thật đã chạy.

Cleanup/khôi phục sau restart chỉ đối soát bản ghi/tệp dở và kết quả xác minh được, không tự hồi cuộc họp/recorder. Mọi đường fail/cancel/finalize giữ tệp/reservation đủ để tra lại sau lỗi, chỉ trả quota khi byte đã được dọn hoặc chuyển thành byte READY hợp lệ.

**Kiểm R2 bổ sung:** ngắt mạng giữa upload, mất phản hồi sau khi lưu, restart trước cập nhật MongoDB, dọn upload chia phần bỏ dở, xóa R2 lỗi và retry không nhân tệp; phát/tua, Range sai phạm vi, mất quyền khi đang xem, đóng trang và R2 chậm không rò luồng đọc/bộ nhớ. Các ca này thuộc T9.7–T9.9 rồi ghép lại ở T10.4.

### 6.6. API và thông báo giữa các phần

API là cách giao diện gọi server để gửi/lấy dữ liệu. Socket.IO giúp server báo tin mới ngay khi có thay đổi. Bảng dưới giữ tên đường dẫn cho team triển khai; người đọc sản phẩm chỉ cần xem cột chức năng và điều kiện.

Các đường dẫn dùng tiền tố `/api/v1`. Tên có trong plan tiếp tục được dùng; tên sự kiện và API recording bổ sung là đề xuất cần review, chưa có nghĩa đã tồn tại trong code.

| API / lệnh                                                                  | Chức năng                                                                                       | Điều kiện chính                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /channels/:cid/messages`                                               | Lấy từng trang tin gốc của TEXT                                                                 | Còn quyền kênh; không trộn trả lời thread vào dòng chính.                                                                      |
| `POST /channels/:cid/messages`                                              | Gửi tin hoặc trả lời thread                                                                     | Có mã lần gửi; tin gốc/tệp đúng hội thoại.                                                                                     |
| `POST /workspaces/:wid/direct-conversations`                                | Mở hoặc tìm lại DM với một người                                                                | Cả hai còn là thành viên hợp lệ; không tạo DM trùng.                                                                           |
| `GET /workspaces/:wid/direct-conversations`                                 | Lấy danh sách DM của mình                                                                       | Không trả thông tin cặp khác.                                                                                                  |
| `GET /conversations/:id/messages`                                           | History thường bằng cursor; chế độ tải bù dùng syncToken + khoảng checkpoint L/H và nextCursor  | Mỗi trang kiểm quyền/context, phân trang hết khoảng; không coi một trang là đã bù đủ.                                          |
| `POST /conversations/:id/messages`                                          | Gửi DM theo plan                                                                                | Cùng xử lý gửi tin, không mở cách đi vòng quyền chat họp.                                                                      |
| `GET /channels/:cid/messages/:mid/replies`                                  | Lấy trả lời của một tin gốc                                                                     | TEXT, cùng kênh, không thread lồng nhau.                                                                                       |
| `POST /files`, `GET /files/:fid/content`                                    | Upload và tải tệp                                                                               | Kiểm người gửi/đích/dung lượng; tải kiểm quyền mỗi lần.                                                                        |
| `POST /sessions/:sid/freeze-frames`, `GET /sessions/:sid/boards/:bid/frame` | Lưu/tải ảnh giữ hình của nhóm                                                                   | M5 xác nhận yêu cầu và ảnh còn được dùng; không áp MAIN.                                                                       |
| `message.send`                                                              | Gửi tin qua kết nối realtime                                                                    | Dùng cùng xử lý với REST; chat họp phải kiểm phòng/host dự kiến còn đúng.                                                      |
| Đề xuất: `conversation.subscribe`, `conversation.unsubscribe`               | Đăng ký nhận trước khi tải history; ack có subscriptionId, syncToken, mốc H và context hiện tại | Auth/ACL trước đăng ký; ranh giới commit H theo Q9, revoke thu cả buffer/lượt tải bù.                                          |
| Đề xuất: `message.created`, `conversation.invalidated`                      | Báo tin mới hoặc yêu cầu bỏ nội dung không còn quyền                                            | Chỉ gửi cho đúng người; dữ liệu từ phòng cũ không được mở lại.                                                                 |
| Đề xuất: `GET /channels/:cid/recordings?before=...&limit=...`               | Danh sách video READY của mọi phiên trong kênh LIVE, mới nhất theo readyAt/ID                   | Còn membership và quyền kênh hiện tại; có phân trang, không cần sessionId.                                                     |
| Đề xuất: `GET /sessions/:sid/recordings?before=...&limit=...`               | Danh sách video READY của một phiên theo createdAt/ID                                           | Xác minh phiên thuộc kênh mà người xem còn quyền; phiên có thể đã kết thúc.                                                    |
| Đề xuất: `GET /recordings/:rid/content`                                     | Phát/tua nội dung một video                                                                     | Kiểm quyền kênh mỗi request, kể cả Range; chỉ mở khi video sẵn sàng.                                                           |
| Đề xuất nội bộ M1 → M2: upload/xác nhận sử dụng/dọn avatar                  | Trả thông tin Cloudinary đã xác minh và xử lý ảnh không còn dùng                                | Actor từ auth, chỉ chính chủ; không nhận URL/publicId tùy ý làm bằng chứng sở hữu. Không dùng endpoint tệp chat để đổi avatar. |

Đường history TEXT/thread cũng nhận chế độ tải bù của Q9 khi subscription tương ứng, giữ root/reply tách nhau; không tự dùng cursor của thread làm cursor timeline. Interface writer recording ở 6.5.1 chỉ nội bộ, không là HTTP handler mới.

Tin gửi gồm mã lần gửi, nội dung và ID tệp; thread có thêm tin gốc. Chat họp có thông tin phòng/host và phiên bản trạng thái dự kiến để server phát hiện đích đã đổi. Danh tính, vai trò và quyền luôn lấy từ server, không nhận theo lời khai của client.

Dữ liệu đầu vào được kiểm chặt bằng Zod trong `packages/contracts`. Các bên thống nhất dữ liệu gửi/nhận, lỗi và ví dụ thành công/sai quyền/trạng thái cũ trước khi làm phần phụ thuộc. Phản hồi theo cấu trúc chung của [contracts](../contracts/README.md), có mã yêu cầu để tra lỗi; không trả lỗi database thô. Phân biệt chưa đăng nhập, không đủ quyền, đích đã đổi, quá dung lượng và quá nhiều yêu cầu để giao diện báo rõ.

### 6.7. Triển khai từng phần và theo dõi

Làm lần lượt: TEXT + tệp → DM/thread → chat họp → ảnh giữ hình → xem lại video khi M3 sẵn sàng. Mỗi phần có cả giao diện, xử lý và kiểm thử để demo sớm. Không chờ đến cuối mới thêm thu quyền hoặc dọn tệp.

Giữ cấu hình khởi đầu 5 tin/giây/người, cho phép đợt ngắn tối đa 10 tin; upload 2 lượt/người. Đây chỉ là giới hạn theo người, chưa thay được giới hạn toàn process. Q7 phải được review và có giá trị hữu hạn trong config/contract trước khi mở handler upload/download T3, gửi tin T4 và chat họp T6; frame, video và avatar cũng tuân điều kiện này khi bật. T1 chốt khung và người sở hữu cấu hình; từng task cài giới hạn và kiểm quá tải ngay trong chức năng. T11 đo để điều chỉnh, không phải lần đầu thêm giới hạn. Không tạo một kết nối DB cho mỗi người. Khi quá tải phải còn xử lý được gỡ quyền/đóng nhóm, không để chúng mắc sau một hàng đợi chat vô hạn.

| Phạm vi                     | Cần chốt và cài trước khi nhận yêu cầu thật                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toàn app process            | Trần yêu cầu đang chạy/đang chờ và tổng byte đang xử lý; giới hạn stream/writer/upload R2 và Cloudinary, ngân sách RAM, dung lượng R2 và ổ đĩa tạm nếu có; các giới hạn từng người/Workspace/session nằm trong ngân sách chung này. |
| Từng thao tác               | Thời gian chờ hàng đợi và thời hạn chạy, hủy khi timeout/mất quyền/client ngắt; giới hạn payload, độ dài hàng chờ và dung lượng giữ chỗ.                                                                                            |
| Database và khóa dùng chung | Pool Mongo, thời gian chờ/query và xử lý khi quá tải; tuân lock order, không giữ khóa khi truyền tệp hoặc chờ Cloudinary.                                                                                                           |
| Thu quyền và đóng scope     | Có phần xử lý ưu tiên hoặc hủy pending để gỡ quyền/đóng nhóm không bị hàng chat/file chặn; không bỏ lệnh thu quyền khi đầy.                                                                                                         |

Trong bảng này, process là toàn bộ ứng dụng server đang chạy; in-flight là những yêu cầu đang xử lý, còn deadline là thời hạn phải hoàn tất hoặc hủy. Giới hạn theo từng người phải nằm trong giới hạn chung của ứng dụng.

Giá trị nào chưa được review thì phần nhận yêu cầu tương ứng chưa bật; không dùng giá trị không giới hạn để chờ benchmark. Khi hết chỗ, trả lỗi bận/quá giới hạn rõ ràng và thử lại có giới hạn, không xếp hàng vô hạn. Kiểm tổng nhiều tài khoản cùng upload/tải, không chỉ thử một tài khoản.

Theo dõi thời gian gửi/lưu tin, số lần thử lại, lượt bị từ chối quyền, thời gian chờ xử lý, dung lượng đã dùng/đang giữ, số upload/download đang mở, dung lượng R2, ổ đĩa tạm còn trống nếu có và tệp dọn chậm. Với recording, theo dõi thêm thời gian upload R2/hoàn tất, lỗi mạng, phần upload bỏ dở, tổng dung lượng cloud và lượng dữ liệu đi qua backend. Log dùng mã yêu cầu/tin/tệp, không ghi nội dung DM, ảnh, video hoặc thông tin đăng nhập.

Nếu cần quay lại bản cũ: ngừng nhận thao tác mới ở phần lỗi, dừng tài nguyên liên quan và giữ đủ dữ liệu để đối chiếu. Kiểm bản cũ có hiểu dữ liệu mới trước khi dùng lại; không xóa collection/tệp để xử lý nhanh. Thay đổi môi trường hoặc chuyển đổi dữ liệu cần ghi trong PR implementation, proposal hiện chưa đổi cấu hình chạy.

### 6.8. Avatar Cloudinary — phần M2 cung cấp cho M1

Avatar là ảnh hồ sơ công khai, không phải tệp riêng của Workspace. M1 làm giao diện chọn/thay/xóa ảnh và cập nhật User; M2 nhận upload, kiểm ảnh, trả thông tin đã xác minh và dọn ảnh không còn dùng. Người đọc URL avatar không cần quyền kênh, nhưng chỉ chính chủ được thay/xóa qua ứng dụng. Ảnh chat, frame và video không được chuyển sang Cloudinary công khai qua luồng này.

**Luồng đề xuất để review Q8:** người dùng chọn ảnh ở màn M1 → M1 gửi yêu cầu đã xác thực sang phần avatar M2 → M2 kiểm đúng chủ, nội dung ảnh, kích thước/dung lượng và giới hạn xử lý → upload Cloudinary bằng cấu hình phía server → M2 trả mã lượt upload và tham chiếu ảnh đã xác minh → M1 kiểm lại chính chủ và lưu tham chiếu vào User. Không báo đổi avatar thành công chỉ vì Cloudinary đã nhận file nếu User chưa cập nhật được.

Không tin URL, publicId hoặc userId do client tự khai. Kết quả phải gắn đúng tài khoản, đúng mục đích avatar và đúng lượt upload do server quản lý; M1 chỉ nhận tham chiếu qua interface đã xác minh của M2. Có thể dùng chung phần kiểm nội dung ảnh nhưng tách luồng, namespace lưu, quyền đọc và budget avatar khỏi tệp chat/video. Giới hạn byte/kích thước/định dạng, thời hạn upload tạm và ngân sách Cloudinary cần Q8/Q7, không tự lấy quota Workspace 500 MiB hoặc retention tệp chat áp cho avatar.

**Thay/xóa và dọn ảnh:** không ghi đè cùng một tài nguyên cho mọi lần upload. Mỗi lần thay tạo tham chiếu mới; M1 kiểm trạng thái hồ sơ dự kiến trước khi cập nhật để hai lần thay đồng thời không ghi đè kết quả mới hơn. Chỉ đưa ảnh cũ vào danh sách dọn sau khi biết User đã đổi thành công, và kiểm ảnh không còn được User dùng trước khi xóa. Lần upload thua, người dùng hủy hoặc cập nhật User thất bại phải được theo dõi để dọn ảnh mới bỏ dở. Xóa avatar thực hiện gỡ tham chiếu khỏi User rồi yêu cầu M2 dọn đúng ảnh; không dùng quyền admin Workspace để xóa ảnh của người khác.

Cloudinary và MongoDB không nằm trong cùng transaction. Server tạo mã lượt và khóa tài nguyên ảnh dự kiến, ghi nhận đủ để tra lại trước khi gọi upload; mất phản hồi không tự tạo ảnh khác hoặc bỏ quên ảnh đã nhận. Nếu kết quả lưu User hoặc kết quả upload/xóa chưa rõ, kiểm lại theo mã lượt và tham chiếu hiện tại trước khi thử lại; không xóa ảnh có thể vừa được gắn vào User. M1/M2 điều phối xác nhận sử dụng và đánh dấu chờ dọn theo cùng tài khoản; ảnh đã đưa vào trạng thái chờ xóa không được gắn lại vào User. Theo dõi tác vụ dọn đủ bền để không mất sau restart; thống nhất nơi lưu/trạng thái ở Q8 trước triển khai. Khi Cloudinary lỗi, báo trạng thái thật và thử dọn lại có thời hạn, số lần và nhịp hữu hạn; không retry vô hạn trong request hoặc giữ khóa hồ sơ khi gọi dịch vụ ngoài.

Ảnh chưa gắn hồ sơ có thời hạn và được dọn theo cấu hình Q8; ảnh User còn dùng không bị dọn chỉ vì upload đã lâu. Không mặc định xóa avatar khi rời Workspace. Do URL avatar công khai, xóa ảnh ở nguồn không chứng minh bản đã tải hoặc cache bên ngoài biến mất ngay; M1/M2 thống nhất cách xử lý ảnh cũ mà không hứa thu hồi tuyệt đối.

**Đầu ra M2:** interface upload trả kết quả đã xác minh; xác nhận ảnh được dùng/bỏ lượt; cleanup ảnh cũ/bỏ dở và cách tra kết quả sau lỗi; lỗi giới hạn/mất xác thực/Cloudinary không sẵn sàng. M1 sở hữu API hồ sơ, UI và trường avatar trên User; M2 không mở một bộ API cập nhật User thứ hai. Cấu hình Cloudinary/credential chỉ đặt phía server, bổ sung tên biến và hướng dẫn trong PR implementation, không ghi secret vào proposal.

### 6.9. Test strategy và kiểm tích hợp

Mỗi task kiểm cả luồng đúng, luồng bị từ chối và lỗi. Bảng này là kế hoạch, chưa phải kết quả đã đạt.

| Nhóm kiểm                       | Ca chính / kết quả bắt buộc                                                                                                                                                                                                                                                                                                        | Goals           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| TEXT và lịch sử                 | Tạo general đầy đủ cùng Workspace; gửi text/ảnh/file; tải nhiều trang đúng thứ tự, không lẫn trả lời vào dòng chính.                                                                                                                                                                                                               | G1/G3           |
| Thử lại và lưu đồng thời        | Mất phản hồi rồi thử lại chỉ có một tin; đổi nội dung cùng mã bị báo lỗi; hai tin dùng một tệp chỉ một thắng; lỗi lưu không để tin thiếu tệp.                                                                                                                                                                                      | G2/G3           |
| DM                              | Hai người mở cùng lúc vẫn một DM; người thứ ba/admin biết ID cũng không đọc; mất tư cách thành viên bị chặn, gia nhập lại hợp lệ mở lịch sử còn lưu.                                                                                                                                                                               | G4              |
| Thread                          | Chỉ trả lời tin gốc cùng TEXT; không tạo thread trong DM/chat họp; thử lại không tăng số trả lời hai lần.                                                                                                                                                                                                                          | G5              |
| Quyền kênh/tệp                  | Owner/admin ngoài PRIVATE bị chặn; gỡ người đang gửi/tải thì dừng; thêm lại không cứu lượt upload cũ nhưng đọc được tệp lịch sử còn lưu theo quyền mới.                                                                                                                                                                            | G1/G3/G5        |
| Chat họp                        | Everyone MAIN không sang nhóm; nhóm A không nhận nhóm B; host mới không thấy lịch sử cặp cũ; chuyển nhóm khi đang gửi không đổi đích tự động.                                                                                                                                                                                      | G6              |
| Nhóm và kết nối lại             | Danh sách dự kiến chưa vào nhóm không cấp quyền chat; host không vào chat DISCUSSION; người cuối chủ động rời hoặc DISCUSSION disconnect làm nhóm đã có người rỗng thì đóng; reconnect về MAIN; hết giờ ACTIVITY hoặc kết nối lại không mở quyền cũ. Thử DB chậm đúng lúc hết giờ.                                                 | G6              |
| Upload và dọn tệp               | Loại tệp giả/quá hạn/quá dung lượng/R2 lỗi; máy chủ dừng giữa upload hoặc giữa lượt dọn; chạy dọn lại không mất tệp còn dùng hoặc tính sai dung lượng.                                                                                                                                                                             | G3              |
| Ảnh giữ hình                    | MAIN bị từ chối; nguồn đổi trước khi chốt ảnh bị báo lỗi; một người rời không xóa ảnh của nhóm; ảnh gửi chat là tệp riêng.                                                                                                                                                                                                         | G7, M5          |
| Recording                       | Mở lại kênh chứa nhiều phiên đã kết thúc vẫn tìm được video, phân trang đúng thứ tự khi trùng thời điểm, không lẫn kênh; theo phiên lọc đúng buổi. Không có bản ghi/đang xử lý/lỗi hiển thị rõ; người mất quyền không đọc được danh sách hay phát bằng ID/URL cũ; video chưa sẵn sàng không phát, revoke khi đang xem dừng truyền. | G7, FR-15-03    |
| Lịch sử ↔ realtime              | Tin lưu trước/giữa/sau subscribe và đọc history, event trước ack, nhiều tin cùng giờ/commit lệch thứ tự, hơn hai trang bị bỏ lỡ, rớt giữa trang, buffer đầy và mất quyền khi tải bù. Đúng root/thread, không sót sau khi chốt Q9, không nhân tin/count, không replay private.                                                      | G1/G2/G4/G5/G6  |
| Storage recording trước capture | Reserve thất bại không bắt đầu capture; sink giới hạn/backpressure; disk đầy/hủy/EOS/finalize lỗi không READY giả hoặc dừng call. Cùng start/attempt retry không nhân bản ghi; restart/unknown commit tra lại và dọn phần dở theo Q5.                                                                                              | G7, M3/M4       |
| Giới hạn trước handler          | Trước bật T3/T4/T6/T7/T9/T12 có cấu hình hữu hạn đã review; nhiều user cùng tải/upload vượt trần toàn process bị từ chối đúng; queue/byte/deadline có giới hạn, timeout hủy tài nguyên và thu quyền vẫn chạy được khi đầy.                                                                                                         | G1–G8           |
| Avatar Cloudinary               | M1 đổi/xóa đúng chủ; metadata giả, ảnh sai/quá giới hạn bị chặn. Cloudinary nhận ảnh nhưng DB lỗi thì không báo thành công giả; thay đồng thời không xóa ảnh đang dùng; ảnh bỏ dở và cleanup lỗi/restart được kiểm lại/thử dọn. URL avatar đọc công khai, tệp chat/video vẫn private.                                              | G8, M1 FR-01-05 |
| Tải kết hợp                     | Chat, upload, avatar, giữ hình, dọn tệp và ghi hình cùng cuộc gọi; đo DB, ngân sách toàn process, R2 và ổ đĩa tạm nếu có; T11 đo lại giới hạn đã cài ở từng task, quá tải vẫn thu quyền được.                                                                                                                                      | Tất cả          |

Demo M2 cùng M1 thêm luồng chọn/thay/xóa avatar, có ca sai chủ và lỗi dọn; kiểm URL avatar công khai nhưng URL tệp chat/video vẫn cần quyền. Luồng xem lại bắt đầu từ kênh có nhiều phiên đã kết thúc, không nhập sessionId thủ công.

Demo chat M2: chat TEXT có ảnh/tệp → thử lại không trùng → trả lời thread → DM với ca người thứ ba bị chặn → chat Everyone/Host trong buổi học → chuyển nhóm/gỡ PRIVATE làm mất quyền nhận tin và tải tệp → xem clip MAIN thật khi nối được bộ ghi hình M3.

Giữ PoC 5 người, thử 25 rồi 50 nếu đạt điều kiện [capacity](../capacity.md). Dữ liệu mẫu hoặc video có sẵn chỉ giúp làm giao diện, không chứng minh luồng ghi/xem thật hay sức chứa đã đạt.

## 7. Impact on other services

Các miền cùng nằm trong một ứng dụng. Bảng ghi phần M2 cần nhận/cung cấp và người phối hợp; không có nghĩa các bên đã duyệt thiết kế.

| Miền / người phụ trách | Phần cần phối hợp với M2                                                                                                                                                                                                                                                  | Thứ tự và tình huống kiểm thử chung                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1 — Minh Quân 16**  | Cung cấp người đăng nhập, quyền kênh và thông báo mất quyền; M2 cung cấp general/chat và upload Cloudinary đã xác minh, cleanup avatar. M1 giữ UI, API hồ sơ và tham chiếu trên User.                                                                                     | Q1 trước T2–T4; Q8/T12 trước M1 tích hợp avatar. Kiểm general lỗi, revoke tệp, thay/xóa đúng chủ, thay đồng thời và DB/Cloudinary lỗi không xóa nhầm ảnh đang dùng.          |
| **M2 — Minh Quân 15**  | Chủ trì chat, dữ liệu tin/tệp, upload/download, dọn tệp, danh sách video theo kênh/phiên và phần upload/dọn avatar Cloudinary.                                                                                                                                            | T1/Q7 trước bật handler; T12 cung cấp cho M1. Giữ phần đọc avatar công khai tách tệp chat/video private, không triển khai lại API hồ sơ của M1.                              |
| **M3 — Việt**          | M2 reserve/cấp writer trước capture, nhận byte có giới hạn, quản lý metadata/finalize/fail; M3 nối output, dừng nguồn/encode và trả artifact descriptor. M2 upload video lên R2 riêng tư và làm danh sách/phát video qua API đúng quyền; M3 không tự upload vào kho khác. | T1.2/T9.1 và Q5 trước PoC tích hợp; kiểm deadline 3 giờ, một slot, receipt, READY vô thời hạn, hủy/EOS/finalize lặp và unknown commit; M4 nhận trạng thái theo đúng attempt. |
| **M4 — Hoàng Quân**    | Cung cấp phòng/nhóm/host/deadline và đóng scope; xác lập quan hệ phiên–kênh cho metadata recording. M2 tự cung cấp danh sách video theo kênh, không chờ M4 làm API lịch sử phiên.                                                                                         | Q2 trước T6; Q4/Q5 trước T9; Q7 dùng giới hạn/queue chung có đường ưu tiên thu quyền. Kiểm nhóm đóng và video phiên đã kết thúc vẫn theo quyền kênh hiện tại.                |
| **M5 — Minh**          | Cung cấp yêu cầu giữ hình và xác nhận ảnh còn được dùng. M2 cung cấp upload/lưu/tải/dọn ảnh và gửi ảnh chụp bảng thành tệp chat riêng.                                                                                                                                    | Q6 trước T7. Kiểm yêu cầu cũ, nguồn đổi, trở lại hình trực tiếp và người rời nhóm; không xóa ảnh còn dùng.                                                                   |

Phần cấu trúc dữ liệu trao đổi mới bổ sung vào `packages/contracts`; người cung cấp và người sử dụng cùng review. Nếu phải thay cấu trúc cũ, PR cần ghi rõ phần nào bị ảnh hưởng và thứ tự cập nhật. Không tự sửa mã các miền khác trong proposal này.

Mỗi điểm giao cần chốt: gửi dữ liệu gì, nhận kết quả gì, ai kiểm quyền, lúc nào hủy thao tác đang chờ và bên gọi hiển thị gì khi lỗi. Ít nhất có một ca dùng được và một ca bị từ chối để hai bên cùng kiểm trước khi coi đã ghép xong.

## 8. Design evaluation

### 8.1. Effort và tính khả thi

M2 là miền lớn vì cùng lúc có giao diện, dữ liệu, tệp và quyền thay đổi theo cuộc họp. Phần khó không chỉ là hiện tin nhắn, mà còn là gửi lại không trùng, không tải được nội dung sau mất quyền và dọn được tệp khi có sự cố.

Dùng React/Express/Socket.IO/MongoDB đã có trong dự án. Hướng thử Busboy/file-type/sharp ở Q3, có khảo sát giới hạn 4 giờ tại T1.4; phần Cloudinary/avatar chốt với M1 ở Q8 và có effort riêng T12. Không thêm hạ tầng chỉ để giảm thời gian viết code. Recording có nhiều điểm chờ M3 nên cần thử nối sớm, rồi ước lượng lại. AI hỗ trợ viết code không thay việc hiểu luồng, review và thử trên các tài khoản thật.

### 8.2. Risks

| Rủi ro                                                                 | Mức ảnh hưởng        | Cách giảm rủi ro                                                                                                                |
| ---------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tin hoặc tệp riêng tới sai người                                       | Cao, chặn nghiệm thu | Kiểm quyền tại server cho lịch sử/tin mới/tải tệp; thử khi đang chuyển nhóm hoặc bị gỡ quyền.                                   |
| Gửi lại tạo hai tin hoặc sai số trả lời                                | Cao                  | Mã lần gửi ổn định, ràng buộc chống trùng và lưu các phần liên quan cùng nhau; thử mất phản hồi.                                |
| Upload/tải quá nhiều làm chậm cả gỡ quyền                              | Cao                  | Giới hạn yêu cầu chờ, truyền tệp ngoài phần xử lý cần khóa; ưu tiên hoặc hủy tác vụ để thu quyền kịp.                           |
| Tệp/upload bỏ dở làm tăng dung lượng R2 hoặc tính sai hạn mức          | Cao                  | Giữ chỗ trước upload, chỉ trả dung lượng sau dọn thật, đối chiếu sau restart.                                                   |
| Thay quyền kênh khiến upload đang làm phải tải lại                     | Vừa                  | Báo rõ và cho thử lại bằng lượt mới; đo mức ảnh hưởng trước khi đề xuất tối ưu.                                                 |
| Các miền hiểu khác dữ liệu bàn giao                                    | Cao                  | Review mục 7 trước code phụ thuộc, demo ghép sớm và kiểm lỗi cùng nhau.                                                         |
| Video phát sinh dung lượng lớn hoặc không phát/tua được                | Cao                  | Chốt định dạng, giới hạn, thời gian lưu và cách bàn giao với Việt; PoC trước cam kết phần xem lại.                              |
| Avatar công khai lẫn với tệp riêng hoặc cleanup xóa nhầm ảnh đang dùng | Cao                  | Luồng/namespace/quyền riêng; xác minh chủ và phản hồi Cloudinary; kiểm trạng thái User trước dọn, theo dõi cleanup qua restart. |
| Bật handler khi chưa có trần toàn process                              | Cao                  | Q7 là điều kiện mở từng handler, kiểm overload trong T3–T6/T12; T11 chỉ kiểm tải và chỉnh cấu hình.                             |

## 9. WBS

T1–T12 là **nhóm công việc**; Tn.m là **task con để giao việc**, chưa phải Issue đã tạo. Minh Quân 15 chịu phần M2; các miền khác tự ước lượng provider và phần tích hợp họ sở hữu. Mỗi task dưới đây có đầu ra, kiểm thử/kiểm chứng, phụ thuộc và 2–8 giờ chủ động, gồm code, test gần thay đổi và review thông thường. Nghiên cứu có timebox ghi riêng, không mặc định PoC phải thành công trong số giờ đó.

### 9.1. Tổng hợp 12 nhóm

| Nhóm     | Phần việc                               | Số task con | Giờ cơ sở M2 | Phủ             |
| -------- | --------------------------------------- | ----------- | ------------ | --------------- |
| T1       | Chốt contract và thử các điểm chưa chắc | 6           | 24           | G1–G8           |
| T2       | Dữ liệu nền                             | 4           | 16           | G1–G5           |
| T3       | Upload và tải tệp riêng                 | 7           | 38           | G3              |
| T4       | Gửi tin và đồng bộ                      | 4           | 24           | G1/G2/G4/G5     |
| T5       | Giao diện chat Workspace                | 6           | 24           | G1–G5           |
| T6       | Chat cuộc họp                           | 4           | 24           | G6              |
| T7       | Ảnh giữ hình và canvas                  | 4           | 16           | G7 phần ảnh     |
| T8       | Dọn tệp và restart                      | 3           | 12           | G3/G6/G7        |
| T9       | Lưu và xem video trên R2                | 9           | 48           | FR-15-03        |
| T10      | Kiểm tích hợp xuyên miền                | 4           | 24           | G1–G8           |
| T11      | Tải kết hợp và bàn giao                 | 4           | 16           | G1–G8           |
| T12      | Avatar hỗ trợ M1                        | 5           | 24           | G8, M1 FR-01-05 |
| **Tổng** |                                         | **60**      | **290**      |                 |

### 9.2. Task con theo đầu ra

#### T1 — Chốt contract và thử các điểm chưa chắc

| ID   | Đầu ra có thể review                                                       | Phụ thuộc / bên cung cấp                    | Giờ | Cách kiểm và kết quả cần có                                                                                                              |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T1.1 | Chốt identity, general, quyền/thu quyền và ngân sách handler chung         | M1/M4 review Q1/Q2/Q7                       | 4   | Có input/output, lỗi và thứ tự khóa; ví dụ revoke không cấp lại quyền cũ.                                                                |
| T1.2 | Review port reserve/writer/finalize/fail với Việt, ghi trách nhiệm mỗi bên | M3/M4 review Q4/Q5                          | 4   | Hai bên xác nhận mã start/attempt, ai ghi byte và ai báo trạng thái khi hết disk/hủy.                                                    |
| T1.3 | Thử có giới hạn subscribe/history và checkpoint theo commit, chốt Q9       | T1.1; Mongo test/fixture cô lập             | 4   | Thử commit lệch thứ tự, tin đến giữa subscribe/history và hơn hai trang; ghi cơ chế mốc hoặc delta cần review, chưa đạt thì báo blocker. |
| T1.4 | Thử Busboy/file-type/sharp trên runtime pin; chốt hướng Q3                 | Môi trường thử Node/Linux, tệp giả          | 4   | Báo version thử, RAM/time, file giả/quá size/pixel và hủy stream; kết luận chọn hoặc việc cần thử tiếp.                                  |
| T1.5 | Chốt uploadId/avatar port và thử Cloudinary SDK với M1                     | T1.1; M1, Q8, tài khoản test được cấp       | 4   | Thử response giả/timeout và cleanup; ghi giới hạn, cách xác minh chủ; thiếu môi trường báo blocked.                                      |
| T1.6 | Viết contract strict cho send/history/subscribe và ví dụ consumer          | T1.1; T1.3; Review M1/M4, contracts package | 4   | Schema/fixture pass đúng/sai quyền/stale/cursor; tách phần text khỏi ảnh/avatar/recorder để làm sớm.                                     |

#### T2 — Dữ liệu nền

| ID   | Đầu ra có thể review                                           | Phụ thuộc / bên cung cấp                      | Giờ | Cách kiểm và kết quả cần có                                                                                        |
| ---- | -------------------------------------------------------------- | --------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------ |
| T2.1 | Model conversation chung và factory CHANNEL cho general        | T1.1; M1 transaction chung                    | 4   | Cùng connection/dbSession; inject lỗi không để Workspace/general/conversation dở dang.                             |
| T2.2 | Model tin gốc, khóa retry và index history TEXT                | T2.1; T1.6; DB test cô lập                    | 4   | Unique retry, trang đúng scope/thứ tự; không cần model upload/DM để kiểm text-only.                                |
| T2.3 | Ràng buộc DIRECT, root/reply và index riêng                    | T2.1; T1.6; Q9 đã chốt phần dữ liệu liên quan | 4   | Hai open DM hội tụ; root chéo kênh/reply lồng bị từ chối; query mẫu có kế hoạch index.                             |
| T2.4 | Model files theo source, reservation/stamp và truy vấn cleanup | T1.1; Thiết kế DB hiện hành                   | 4   | Validate variant/null/state; READY không thiếu binding, STAGED có hạn; không đổi schema avatar/recording tùy tiện. |

#### T3 — Upload và tải tệp riêng

| ID   | Đầu ra có thể review                                                  | Phụ thuộc / bên cung cấp                                    | Giờ | Cách kiểm và kết quả cần có                                                                                                       |
| ---- | --------------------------------------------------------------------- | ----------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------- |
| T3.1 | Nhận multipart stream, tạo STAGED/reserve trước ghi và cài trần chung | T1.4; T2.4; Auth M1, config Q7 được review                  | 6   | File quá size, quá queue/byte và client ngắt đều hủy writer; RAM không tăng theo toàn bộ file.                                    |
| T3.2 | Kiểm nội dung ảnh/tệp và metadata đã xác minh                         | T3.1; Allowlist Q3                                          | 6   | Ảnh giả/hỏng/quá pixel bị chặn; kích thước thật đúng; file không ảnh không chạy resize ảnh.                                       |
| T3.3 | Bind attachment cùng lưu tin, trả lỗi và giải phóng khi abort         | T3.2; T4.1; T2.3; Quyền conversation chung                  | 6   | Hai tin tranh một file chỉ một thắng; rollback không để READY sai hoặc tin thiếu attachment.                                      |
| T3.4 | Download/Range, registry stream và hủy sau revoke                     | T3.3; T3.7; M1 revoke adapter                               | 6   | URL/Range sai quyền bị chặn; đang tải bị hủy; không giữ gate suốt stream.                                                         |
| T3.5 | Kiểm lỗi/quota/overload của file handler R2 trước bật thật            | T3.1; T3.2; T3.3; T3.4; T3.7; Fixture nhiều user, R2/DB lỗi | 4   | Không vượt quota, không trả byte chưa xóa; hàng đợi đầy vẫn thu quyền được; có log/metric cần thiết.                              |
| T3.6 | Kết nối R2 chung, kho thử riêng tư và cấu hình backend                | T1.4; tài khoản/kho thử do team cấp; Q3/Q7                  | 4   | Upload/đọc/xóa tệp thử; không đọc công khai, không lộ khóa; timeout/hủy có giới hạn; video dùng lại cấu hình này.                 |
| T3.7 | Nối ảnh/tài liệu/ảnh giữ hình với R2 và kiểm lỗi lưu                  | T3.6; T3.1/T3.2; metadata được review                       | 6   | STAGED không tải được; R2 lưu xong nhưng DB lỗi hoặc mất phản hồi vẫn tra/dọn đúng mã; tải và thu quyền không qua link công khai. |

#### T4 — Gửi tin và đồng bộ

| ID   | Đầu ra có thể review                                                     | Phụ thuộc / bên cung cấp                        | Giờ | Cách kiểm và kết quả cần có                                                                                           |
| ---- | ------------------------------------------------------------------------ | ----------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------- |
| T4.1 | TEXT text-only: send/history/dedupe và lỗi trên cùng service REST/socket | T1.6; T2.1; T2.2; Auth/channel access M1        | 6   | Hai user gửi/đọc được text; retry cùng mã không trùng, khác payload conflict; hoàn toàn không phụ thuộc T3/DM/thread. |
| T4.2 | Subscribe-first, catch-up nhiều trang, mốc L/H và invalidation           | T4.1; T1.3; Q9 phải đóng trước implementation   | 6   | Tin ở ranh giới không sót, event/history trùng gộp ID; token hết hạn/mất quyền/buffer đầy không báo đã đồng bộ.       |
| T4.3 | Mở/list/history/send DM với quyền hai bên và rejoin                      | T2.3; T4.1; T3.3; M1 membership/incarnation     | 6   | Open đồng thời không trùng; admin/người thứ ba bị deny; text/ảnh/file và rejoin đúng hội thoại.                       |
| T4.4 | Thread một cấp, reply count và history riêng                             | T2.3; T4.1; T3.3; Contract root/reply đã review | 6   | Reply không lên timeline; retry không tăng count hai lần; root chéo kênh/file sai scope bị deny.                      |

#### T5 — Giao diện chat Workspace

| ID   | Đầu ra có thể review                                                   | Phụ thuộc / bên cung cấp                   | Giờ | Cách kiểm và kết quả cần có                                                                                                |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------ | --- | -------------------------------------------------------------------------------------------------------------------------- |
| T5.1 | Timeline/composer TEXT, đang gửi/lỗi/thử lại với fixture đúng contract | T1.6; Shell M1                             | 4   | UI có empty/loading/error; cùng clientMessageId khi retry, chỉnh ý định mới không ghi đè khóa cũ.                          |
| T5.2 | Nối TEXT thật và subscribe/history; demo hai tài khoản chỉ gửi văn bản | T5.1; T4.1; T4.2; Auth và kênh M1 thật     | 4   | Demo send/reconnect không sót/trùng, thu quyền bỏ cache; không chờ T3/T4.3/T4.4/T5.3–T5.5.                                 |
| T5.3 | Danh sách và panel DM, phân trang và chọn đích                         | T5.1; T4.3; M1 danh sách thành viên        | 4   | Chọn đúng người/Workspace, mất membership chặn và hiện lỗi; không lộ preview DM khác.                                      |
| T5.4 | Panel thread, root và số reply với cursor riêng                        | T5.1; T4.4; Shell M1                       | 4   | Trả lời/đọc thêm đúng root; đổi kênh đóng panel cũ, không nhân reply/count khi reconnect.                                  |
| T5.5 | Attachment UI: chọn/upload/gửi, lỗi và retry đúng loại chat            | T5.1; T3.3; File API M2                    | 4   | Upload chưa bind không hiện gửi thành công; chuyển đích cần xác nhận/upload mới theo quyền, không dùng lại file sai scope. |
| T5.6 | Kiểm UI đã ghép TEXT/DM/thread/file và dọn khi đổi user/quyền          | T5.2; T5.3; T5.4; T5.5; Hai tài khoản test | 4   | Tin hiện một lần; cache/private buffer bị bỏ đúng scope; không đưa nội dung nhạy cảm vào localStorage.                     |

#### T6 — Chat cuộc họp

| ID   | Đầu ra có thể review                                                | Phụ thuộc / bên cung cấp                           | Giờ | Cách kiểm và kết quả cần có                                                                                    |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------- |
| T6.1 | Ánh xạ MAIN/GROUP/HOST_PRIVATE từ context M4, ACL và target dự kiến | T1.1; T2.1; M4 context/guard thật trước nghiệm thu | 6   | Roster chưa join không đọc; host chỉ help ACTIVITY; Host đích cũ trả stale, không đổi Everyone.                |
| T6.2 | Subscription/catch-up meeting theo epoch/audience/deadline          | T6.1; T4.2; M4 projection/invalidation             | 6   | Rejoin sau đóng nhóm không cấp history cũ; tin đến trong reconnect hoặc DB chậm qua deadline không fanout sai. |
| T6.3 | Panel Everyone/Host trong shell M3, text/ảnh và lỗi chuyển đích     | T6.1; T5.1; T3.3; M3 panel slot, M4 UI context     | 6   | Chat không ngắt call; chỉ text/ảnh; scope/host đổi hiện xác nhận mới, không tự gửi lại.                        |
| T6.4 | Kiểm close/revoke/overload và cleanup meeting liên miền             | T6.2; T6.3; M4 transition và M3 shell              | 6   | Pending upload/tin bị thu, stream dừng; last leave DISCUSSION/ACTIVITY deadline đúng; queue đầy vẫn cleanup.   |

#### T7 — Ảnh giữ hình và canvas

| ID   | Đầu ra có thể review                                      | Phụ thuộc / bên cung cấp                   | Giờ | Cách kiểm và kết quả cần có                                                             |
| ---- | --------------------------------------------------------- | ------------------------------------------ | --- | --------------------------------------------------------------------------------------- |
| T7.1 | Port intent upload frame và xác minh nguồn/context với M5 | T3.1; T3.2; M4/M5 review Q6                | 4   | MAIN/sai intent/ảnh vượt giới hạn bị deny; upload không giữ queue phiên.                |
| T7.2 | Bind BOARD_FRAME và kiểm lại quyền/context sau I/O        | T7.1; T3.3; M5 intent/version, M4 deadline | 4   | Nguồn đổi/hết giờ trước commit bị từ chối; READY chưa gắn runtime vẫn có đường cleanup. |
| T7.3 | Tải frame có quyền, release refs và lifecycle             | T7.2; T3.4; M5 xác nhận ref đang dùng      | 4   | Một người rời không xóa ảnh chung; resume/close khóa quyền trước rồi lên lịch dọn.      |
| T7.4 | Gửi ảnh canvas qua attachment riêng và kiểm luồng ghép    | T7.3; T5.5; M5 canvas được phép chụp       | 4   | Không đổi purpose/binding FRAME; host nhận ảnh riêng không tự có quyền board nhóm.      |

#### T8 — Dọn tệp và restart

| ID   | Đầu ra có thể review                                             | Phụ thuộc / bên cung cấp                  | Giờ | Cách kiểm và kết quả cần có                                                                                           |
| ---- | ---------------------------------------------------------------- | ----------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------- |
| T8.1 | Sweeper STAGED/DELETE_PENDING theo batch, hủy luồng trước xóa R2 | T3.1; T3.4; T3.7; Lifecycle đã chốt       | 4   | Expiry deny dù chưa sweep; job lặp/ENOENT an toàn, chỉ trả quota sau byte được dọn.                                   |
| T8.2 | Close conversation, dọn reply trước root và release frame refs   | T7.3; T6.1; M4 close/revoke, M5 ref       | 4   | Khóa quyền không chờ purge; crash giữa batch vẫn tìm được scope/file cần dọn.                                         |
| T8.3 | Startup đối chiếu DB/R2/quota và hủy STAGED đời cũ               | T8.1; T8.2; Bootstrap M4 trước nhận grant | 4   | Không mở lại group/board từ metadata, không nhận upload vào scope còn reconcile; báo mã tệp/dung lượng R2 không khớp. |

#### T9 — Lưu và xem video trên R2

| ID   | Đầu ra có thể review                                            | Phụ thuộc / bên cung cấp                                              | Giờ | Cách kiểm và kết quả cần có                                                                                                                                     |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T9.1 | Thử có giới hạn output M3 → sink M2; chốt writer/seek/finalize  | T1.2; M3 output test, Q5                                              | 4   | Đo backpressure/RAM/EOS/disk lỗi; ghi port được hai bên review hoặc thay phương án có kiểm soát, không giả pipeline thật.                                       |
| T9.2 | Metadata/index và reserve theo start key/attempt trước capture  | T9.1; T2.4; Q5/schema bàn giao; fixture/index được review; M4 context | 6   | Một start/file duy nhất; kiểm ObjectId/UUID/null, binding RECORDING, index nonterminal và byteSize lớn; hết budget từ chối trước capture, không auto migration. |
| T9.3 | Writer nội bộ có byte budget, backpressure, timeout/cancel      | T9.2; T3.1; M3 kết nối output theo port                               | 6   | Không buffer video dài; tăng reservation trước vượt; sink lỗi dừng đúng recorder, call vẫn sống.                                                                |
| T9.4 | Finalize/fail/cancel và read-back, restart/cleanup đúng attempt | T9.3; T8.3; M3 descriptor/EOS, M4 end signal                          | 6   | Hai document READY cùng commit/rollback; receipt read-back khi mất ack; abort tranh commit không xóa nhầm; không READY tệp dở hoặc fail bản READY.              |
| T9.5 | Danh sách video theo kênh/phiên có phân trang/index và quyền    | T9.2; M1 channel access, M4 quan hệ phiên–kênh                        | 6   | Kênh nhiều phiên vẫn thấy READY; cursor readyAt/ID, explain index; không lộ FAILED/nội bộ, mất quyền chặn metadata.                                             |
| T9.6 | Trang phát/tua, trạng thái xử lý/lỗi và Range có ACL            | T9.5; T9.4; T3.4; M3 định dạng đã kiểm                                | 4   | Chỉ READY mới phát; trạng thái phiên do M4 cấp; PROCESSING chặn ghi mới; gỡ quyền dừng truyền, lỗi không hỏng call.                                             |
| T9.7 | Thử upload video lớn trên R2 với cấu hình chung                 | T3.6; T9.1; kho thử do team cấp; Q5/Q7                                | 4   | Kiểm chia phần video, số phần đang gửi và hủy khi nghẽn mạng; đo RAM/thời gian với đầu ra M3, không tính lại thử kho chung T3.6.                                |
| T9.8 | Upload video hoàn tất, đối soát và dọn trên R2                  | T9.7; T9.3/T9.4; schema lượt upload được review                       | 6   | Chia phần có giới hạn; ngắt mạng, phản hồi mất, restart, xóa lỗi không nhân video/READY giả; dọn cả phần upload bỏ dở và tệp tạm đúng quota.                    |
| T9.9 | Nối đường phát Range với R2 và kiểm thu quyền                   | T9.8; T9.6; quyền M1 và trần stream Q7                                | 6   | Phát/tua từ R2, đóng trang/thu quyền hủy đọc nguồn; không cache công khai; R2 chậm/lỗi không giữ stream/bộ nhớ vô hạn.                                          |

#### T10 — Kiểm tích hợp xuyên miền

| ID    | Đầu ra có thể review                                            | Phụ thuộc / bên cung cấp                                | Giờ | Cách kiểm và kết quả cần có                                                                            |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------ |
| T10.1 | Demo M1 → general → TEXT/DM/thread/file với provider thật       | T5.6; T3.5; M1 auth/Workspace thật                      | 6   | Ghi evidence allow/deny/rejoin/retry; không cần chờ recording để chạy demo chat.                       |
| T10.2 | Kiểm ranh giới history/realtime và scope khi ghép meeting/board | T4.2; T6.4; T7.4; M3/M4/M5 thật                         | 6   | Inject hơn hai trang, commit muộn, event trùng/buffer đầy và revoke ở từng bước; không sót/rò quyền.   |
| T10.3 | Ghép avatar với API hồ sơ M1, lỗi đồng thời/Cloudinary/DB       | T12.5; M1 avatar thật, Cloudinary test                  | 6   | Thay/xóa đúng chủ; DB lỗi giữ ảnh cũ, cleanup không xóa ảnh đang dùng, retry không bỏ quên tài nguyên. |
| T10.4 | Ghi → stop/end → lưu → tìm theo kênh → xem lại                  | T9.4; T9.6; T9.8/T9.9; M3 pipeline và M4 lifecycle thật | 6   | Cùng start không nhân, hết disk/hủy/finalize lỗi rõ; clip phát/tua được, không chứa nhóm riêng.        |

#### T11 — Tải kết hợp và bàn giao

| ID    | Đầu ra có thể review                                                      | Phụ thuộc / bên cung cấp                                     | Giờ | Cách kiểm và kết quả cần có                                                                                                    |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------ |
| T11.1 | Tổng hợp metric/budget và ca overload của chat/file/meeting               | T3.5; T6.4; Config Q7 đã cài từ từng handler                 | 4   | Có số đo queue/pool/wait/byte; đường revoke vẫn chạy, không mới bắt đầu thêm giới hạn ở T11.                                   |
| T11.2 | Chạy fixture 5 người với call/chat/file/frame/avatar/recording            | T10.1; T10.2; T10.3; T10.4; Staging và các provider sẵn sàng | 4   | Ghi máy/network/workload/kết quả; chưa có bằng chứng thật thì ghi chưa đạt, không thay bằng mock.                              |
| T11.3 | Chạy đợt đo profile đã review, dữ liệu cũ và stress có giới hạn thời gian | T11.1; T11.2; Capacity gate, M3/M4 và đầu mối vận hành       | 4   | Báo p95/tài nguyên/lỗi và phần chưa thử; tăng 25 rồi 50 chỉ khi gate trước đạt, 4 giờ không là cam kết nghiệm thu mọi profile. |
| T11.4 | Hoàn thiện runbook/evidence và kiểm cổng repo trước bàn giao              | T11.2; T11.3; Các quyết định/config được ghi nguồn           | 4   | Hướng dẫn thử lại được, env chỉ nêu tên/mục đích, pnpm check và giới hạn thật; cập nhật estimate còn lại.                      |

#### T12 — Avatar hỗ trợ M1

| ID    | Đầu ra có thể review                                            | Phụ thuộc / bên cung cấp                                      | Giờ | Cách kiểm và kết quả cần có                                                                                      |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------- |
| T12.1 | Theo dõi uploadId/ảnh dùng/bỏ và cleanup đủ bền                 | T1.5; M1 User metadata/CAS; Q8/Q7                             | 4   | Đúng chủ/mục đích, schema được review; restart còn tra được ảnh bỏ dở, không dùng files chat làm ACL avatar.     |
| T12.2 | Upload qua backend, kiểm ảnh và Cloudinary response             | T12.1; T1.4; T3.1; T3.2; Cloudinary test, auth M1             | 6   | Ảnh giả/quá giới hạn/metadata URL giả bị chặn; unknown response tra theo key, không upload bản sao mù.           |
| T12.3 | Xác nhận dùng/bỏ ảnh và phối hợp thay/xóa User                  | T12.2; M1 API hồ sơ thật hoặc contract test                   | 6   | CAS thua không xóa ảnh đang dùng; chỉ chính chủ đổi/xóa, avatar public không mở quyền tệp private.               |
| T12.4 | Cleanup Cloudinary có backoff/deadline và đối chiếu sau restart | T12.3; T8.1; Budget riêng Q8                                  | 4   | Ảnh chờ xóa không gắn lại; retry lặp an toàn, lỗi dọn được theo dõi và không giữ request/khóa vô hạn.            |
| T12.5 | Kiểm provider avatar và lỗi trước ghép với M1                   | T12.2; T12.3; T12.4; Fixture thay đồng thời/DB/Cloudinary lỗi | 4   | Có allow/deny/unknown-response/cleanup tests; ảnh User còn dùng không bị dọn, không hứa thu hồi cache công khai. |

### 9.3. Thứ tự làm sớm và báo vướng mắc

- **TEXT chỉ văn bản:** T1.1/T1.3/T1.6 → T2.1/T2.2 → T4.1/T4.2 → T5.1/T5.2. Có auth/kênh thật từ M1 thì demo hai người gửi/đọc/reconnect ngay; không chờ upload T3, DM/thread T4.3/T4.4, avatar hoặc recording. Factory general có thể review/test bằng transaction fixture trước, nhưng demo sản phẩm vẫn cần M1 thật.
- **Ảnh/file và DM/thread:** nối sau theo task con, không biến hoàn tất toàn nhóm T3 thành điều kiện cho send text. UI dùng fixture có ghi rõ để tiến triển độc lập, rồi thay bằng provider thật trước nghiệm thu.
- **Avatar:** T1.5/T12 có thể chạy khi contract và auth M1 sẵn sàng; chỉ phụ thuộc helpers file cụ thể, không chờ mọi chức năng video/board.
- **Recording:** T1.2/T9.1 phải ra kết quả thống nhất trước PoC tích hợp với Việt. T10.1 demo chat không phụ thuộc T10.4 recording; không dồn phát hiện disk/writer mismatch vào cuối.
- **Giới hạn/cleanup:** cài và kiểm trong chính task handler/writer. T10 là kiểm xuyên miền còn lại, T11 đo tải đã có giới hạn; không cộng lại unit tests hoặc đợi tới T11 mới thêm budget.

Mỗi task 6–8 giờ giả định contract/phụ thuộc đã rõ. Nếu người làm chỉ có 4 giờ/ngày thì tách tiếp theo đầu ra trước giao việc trong ngày; không gọi 8 giờ tập trung là “một ngày lịch” của mọi người. Task chưa có provider vẫn làm được fixture được ghi mock, nhưng không đánh dấu tích hợp thật đã xong.

Khi blocked hoặc có nguy cơ vượt estimate, báo ngay trong task/PR đang dùng: đầu ra đã có, kiểm nào đã chạy, phụ thuộc đang thiếu, thời gian đã dùng/còn dự kiến và quyết định cần người nào. Không chờ tới hết giờ hoặc buổi họp mới báo. Nếu khảo sát không đạt, ghi kết luận và đề xuất task tiếp có estimate; không lấy dự phòng để che đầu ra đã biết còn thiếu. WBS chỉ giữ thiết kế/phụ thuộc, không thêm bảng trạng thái cạnh tranh với công cụ giao việc chung.

## 10. Estimation

Đơn vị là giờ tập trung của M2. Tổng cơ sở được cộng từ **60 task con trong 12 nhóm**, không chia đều giờ để giữ tổng cũ. Công của M1/M3/M4/M5 và thời gian chờ provider tính riêng.

| Kịch bản      | Code / thiết kế | Kiểm thử / tích hợp | Review / tài liệu | Dự phòng | Tổng giờ M2 |
| ------------- | --------------- | ------------------- | ----------------- | -------- | ----------- |
| Thuận lợi     | 140             | 54                  | 14                | 28       | **236**     |
| Dự kiến sơ bộ | 180             | 76                  | 34                | 54       | **344**     |
| Bất lợi       | 254             | 112                 | 50                | 92       | **508**     |

**Đối soát bản cập nhật R2 ngày 05/11:** bản chỉ chuyển video lên R2 có 58 task, 280 giờ cơ sở + 52 giờ dự phòng = 332 giờ. Bản này thêm T3.6 (4 giờ kết nối/kho thử dùng chung) và T3.7 (6 giờ ghép ảnh/tài liệu/ảnh giữ hình và kiểm lỗi). Tổng mới **60 task, 290 giờ cơ sở + 54 giờ dự phòng = 344 giờ**. Phần tăng gồm 6 giờ code/thiết kế, 4 giờ kiểm thử và 2 giờ dự phòng. T9.7 chuyển sang kiểm riêng video lớn, dùng lại cấu hình R2 của T3.6; không tính lại cùng đầu ra. T9.1 quyết định đường ghi thẳng hay cần tệp tạm; nếu phải đổi lớn bộ ghi hoặc xử lý ảnh thì báo vướng mắc và ước lượng lại sau thử, không coi dự phòng là cam kết bao hết.

Khảo sát T1.3/T1.4/T1.5 và thử handoff T9.1 có giới hạn 4 giờ mỗi task. Nếu kết quả yêu cầu đổi cursor/schema, package không hợp runtime, output recorder không phù hợp sink hoặc thiếu môi trường, ghi blocker và ước lượng tiếp sau review; không coi 4 giờ là cam kết giải được mọi vấn đề. Chi phí implementation phát sinh được ghi lại, không âm thầm bổ sung vào task đã chốt.

| Giờ tập trung mỗi tuần | Đối chiếu 344 giờ dự kiến |
| ---------------------- | ------------------------- |
| 20 giờ                 | Khoảng 17,2 tuần          |
| 32 giờ                 | Khoảng 10,75 tuần         |
| 40 giờ                 | Khoảng 8,6 tuần           |

344 giờ tương đương 43 ngày công ở mức 8 giờ/ngày; chưa tính chờ review/provider hoặc PM. Vì vậy chưa đủ cơ sở hứa hoàn tất trong 6–7 tuần bằng một người. Sau khi tách task, Minh Quân 15 cần xác nhận giờ thực mỗi tuần và phần cần team hỗ trợ, nhất là UI/test tích hợp hoặc provider chung; chưa tự gán thêm người trong proposal.

Giả định auth/channel access M1 có sớm cho demo text; M4 cung cấp guard/context/close; M5 có intent/ref; Việt cùng chốt sink/output/lifecycle trước ghi tích hợp. T9 không bao gồm viết GStreamer/capture/encode của M3, T12 không gồm UI/API User của M1. Mỗi task có test gần thay đổi; T10 chỉ kiểm phần ghép còn lại, tránh tính trùng.

Ước lượng hiện tại giữ 60 task/344 giờ để đối chiếu, chưa coi việc nhận schema là đã hoàn thành T9.2/T9.4. Sau thử fixture/index, receipt và đầu ghi, nếu phát sinh effort phải cập nhật thay vì ép vào số cũ. Kiểm lại effort sau luồng TEXT hai người, kết quả nghiên cứu Q3/Q9, avatar M1 và PoC recording. Nếu thời gian không đủ hoặc có nguy cơ vượt estimate, báo sớm với bằng chứng để team phân hỗ trợ hoặc thống nhất lịch; không tự bỏ FR, hạ kiểm quyền hay đổi kết quả test thành pass. Các số là ước lượng để review, không phải lịch cam kết.

## Appendix — Thuật ngữ và giới hạn xác minh

- **Stored receipt:** biên nhận do M2 lưu bền sau khi xác nhận video đã lưu thành công; giúp trả lại kết quả nếu mất phản hồi. Biên nhận không cấp quyền xem.
- **Nonterminal / slot:** bản ghi chưa kết thúc xử lý / suất tài nguyên cho phép xử lý cùng lúc. Đang upload vẫn chiếm suất, dù đã dừng thu hình.
- **TTL:** cơ chế tự xóa dữ liệu theo thời hạn; không áp cho video READY giữ vô thời hạn.

Các tên kỹ thuật trong bảng API/WBS được giữ để team đối chiếu khi làm. Có thể đọc theo nghĩa gần gũi dưới đây:

| Thuật ngữ                            | Hiểu đơn giản trong M2                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend / frontend                   | Backend là phần xử lý trên máy chủ; frontend là giao diện chạy trên trình duyệt.                                                           |
| Cloudflare R2 / bucket / object key  | R2 là dịch vụ chứa tệp; bucket là kho chứa; object key là mã/đường dẫn nhận diện một tệp trong kho, không phải quyền xem.                  |
| Metadata                             | Thông tin mô tả: video nào, thuộc kênh nào, dung lượng và trạng thái; khác với nội dung hình/tiếng.                                        |
| Capture / encode / container         | Thu hình tiếng / chuyển thành dữ liệu video / đóng dữ liệu trong dạng tệp như MP4. Định dạng cuối cùng còn phải thử với M3.                |
| Stream / buffer / backpressure       | Truyền từng phần / phần dữ liệu đang chờ trong bộ nhớ / yêu cầu bên gửi chậm lại khi bên nhận chưa xử lý kịp.                              |
| Range                                | Yêu cầu lấy một đoạn của tệp, giúp phát và tua video mà không tải hết trước.                                                               |
| Multipart upload                     | Chia một tệp lớn thành các phần để tải lên R2; không phải tạo nhiều video riêng.                                                           |
| Reservation / quota / retention      | Phần dung lượng giữ trước / hạn mức được dùng / thời gian giữ trước khi dọn. Giữ chỗ trong M2 không phải đặt trước dung lượng vật lý ở R2. |
| ACL / scope / epoch                  | Ai được làm gì / phạm vi phòng hoặc kênh / mã lượt trạng thái để loại lệnh cũ.                                                             |
| Attempt / revision / CAS             | Một lần xử lý / phiên bản dữ liệu / chỉ cập nhật khi phiên bản vẫn đúng, tránh hai thao tác ghi đè nhau.                                   |
| Idempotency / dedupe / retry         | Gọi lại không tạo thêm kết quả / loại bản trùng / thử lại sau lỗi.                                                                         |
| Finalize / EOS / flush / READY       | Hoàn tất bản ghi / hết đầu vào / ghi hết dữ liệu đang chờ / sẵn sàng xem. Dừng thu chưa đồng nghĩa đã lưu xong lên R2.                     |
| Seek / signed URL / cleanup          | Di chuyển vị trí đọc/ghi trong tệp / link truy cập có thời hạn / dọn tài nguyên không còn dùng.                                            |
| Queue / in-flight / deadline / pool  | Việc đang chờ / việc đang chạy / hạn phải xong hoặc hủy / số kết nối dùng chung có giới hạn.                                               |
| Checkpoint / cursor / realtime       | Mốc đã đồng bộ / mốc lấy trang tiếp / thông báo mới nhận ngay khi có thay đổi.                                                             |
| Unknown commit / read-back / blocker | Chưa biết lần lưu đã thành công chưa / đọc lại để xác minh / vướng mắc đang chặn công việc.                                                |
| WBS / estimate                       | Bảng chia công việc / số giờ dự kiến, chưa phải lịch cam kết.                                                                              |

- **FR / AC:** yêu cầu chức năng và điều kiện dùng để kiểm chức năng đã làm đúng.
- **Thread:** chuỗi trả lời quanh một tin gốc trong TEXT.
- **API / contract:** cách các phần gọi nhau và thỏa thuận dữ liệu/lỗi giữa bên gửi, bên nhận.
- **Transaction:** nhóm thao tác lưu dữ liệu cùng thành công hoặc cùng hủy.
- **PoC:** thử nghiệm nhỏ để kiểm chứng cách làm trước khi triển khai đầy đủ.
- **Checkpoint / syncToken:** mốc và mã lượt đồng bộ do server cấp để nối lịch sử với tin mới; không tự cấp quyền đọc.
- **Writer / sink:** đầu nhận và ghi byte của video do M2 quản lý, có giới hạn và báo lỗi để M3 dừng recorder đúng lúc.
- **Timebox:** thời gian tối đa dành cho một lần thử/nghiên cứu; hết giờ phải báo kết quả hoặc blocker, không tự kéo dài.

Quyền và phạm vi theo nguồn product; dữ liệu theo [model DB](../database/model.md), chi tiết ở các nguồn đã dẫn. Phân biệt thiết kế đã chốt và phần chờ kiểm chứng theo [decision status](../decision-status.md). Mẫu M3 dùng để đối chiếu cách viết và điểm giao; không thay nguồn nghiệp vụ khi hai bên chưa đồng bộ.

Proposal chỉ sửa tài liệu M2 theo [hướng dẫn](README.md), không chứng minh chat/upload/recording đã chạy. Kết quả kiểm tài liệu ghi ở bàn giao/PR; không gán kết quả đó cho các ca sản phẩm ở mục 6.9.
