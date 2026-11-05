# Bàn giao hoàn thiện UI CoLearnia

**Ngày bàn giao: 05/11/2026.** Tài liệu dành cho thành viên tiếp tục bản Figma Make hiện tại. Mục tiêu là hoàn thiện các màn và hành trình MVP để team thống nhất giao diện, sau đó triển khai vào ứng dụng. Đây chưa phải nghiệm thu phần mềm chạy thật.

**Kết luận sau rà tổng thể:** chưa hoàn thiện toàn diện. Các luồng chính đã có, nhưng còn nhánh nghiệp vụ thiếu và nhiều ca chưa kiểm. Bắt đầu bằng **current-state mục 19 → các lượt R1–R6 ở mục 5.1 bên dưới**. A1–E3 là kế hoạch gốc đã thực hiện một phần/đã có bằng chứng, không phải lệnh dựng lại toàn bộ. Chưa có xác nhận team duyệt cuối; chưa publish các chỉnh sửa mới.

### Đọc nhanh cho Codex đã có context dự án

Người tiếp nhận cũng dùng Codex và đã có context nghiệp vụ. Không cần học lại toàn bộ dự án hoặc đọc lại cả thư mục `docs`:

1. Đọc **mục 2**, phần **“Những thay đổi mới phải giữ khi đọc nguồn cũ” ở mục 3** và **mục 5.1** của tài liệu này.
2. Đọc **mục 19 của [current-state](figma-current-state.md)**: tổng kết, độ phủ toàn bộ FR, phát hiện từ mã, ca chưa kiểm và điều kiện khép UI. Mục 6 là tóm tắt ưu tiên; mục 8–18 chỉ mở khi cần bằng chứng của ca cụ thể.
3. Bắt đầu **R1**, rồi R2–R6; không chạy lại A1–E3. Brief chỉ dùng tham khảo phong cách; prompt lịch sử không phải danh sách việc tiếp theo.
4. Làm theo quy trình review **mục 9**. **Mục 10** để tra khi browser gặp sự cố, không phải thủ tục bắt buộc trước mọi lần mở preview.

**Phân vai ba file:** tài liệu này giữ cách làm/lộ trình; `figma-current-state.md` giữ hiện trạng và kết quả kiểm; `figma-make-brief.md` giữ hướng thị giác/lịch sử prompt. Quy tắc sản phẩm vẫn lấy ở nguồn nghiệp vụ cùng các quyết định đã xác nhận bên dưới. UI sinh ra và lời Make báo hoàn tất không tự thay các nguồn đó.

## 1. Nhận việc và bắt đầu ở đâu?

Mở các nguồn theo thứ tự sau:

1. Đọc [onboarding mục 1–4](../team-onboarding.md) để hiểu CoLearnia và ba bối cảnh học.
2. Đọc [hiện trạng Figma](figma-current-state.md), đặc biệt mục 19: kết luận hiện hành, phần đã làm và phần còn thiếu; mục 4 là lịch sử lượt kiểm cũ.
3. Mở [file Make đang dùng](https://www.figma.com/make/4ATlhcdwYqUYUlcRgB9jCn/D%E1%BB%B1ng-Workspace-v%C3%A0-Chat-CoLearnia). Tiếp tục trong file này; không dựng lại ứng dụng từ đầu.
4. Xem thứ tự tiếp tục R1–R6 ở mục 5.1 dưới đây và đọc nguồn nghiệp vụ tương ứng ở mục 3.
5. Kiểm tra màn đó đã có chưa, rồi mới gửi prompt sửa hoặc bổ sung.

**Quyền file:** người phụ trách đã mời bạn tiếp nhận vào file và cấp quyền edit. Không cần yêu cầu mời lại nếu mở/sửa được; chỉ báo nếu tài khoản đang dùng thực tế bị chặn. Quyền edit không xác nhận tài khoản có credit Make hoặc quyền publish.

Khi review dùng **mục 9**; khi browser không mở/điều khiển được hoặc nghi đang kiểm nhầm bản cũ, dùng **mục 10**. Đừng gửi prompt sửa tiếp trước khi xác định đúng bản và tái hiện được lỗi.

[Bản public](https://twins-mark-73137923.figma.site/) là bản đã publish, có thể chậm hơn preview. Trong lần kiểm ngày 05/11, public vẫn bật camera ở prejoin trong khi preview đã tắt. Dùng preview làm điểm bắt đầu; sau khi publish phải mở lại public và thử luồng chính.

**Credit của người bàn giao đã dùng hết ở lượt sửa vừa rồi.** Người tiếp nhận kiểm tra quyền sửa file và credit của mình trước khi chạy Make. Nếu chưa có credit, vẫn có thể đọc nguồn, kiểm preview, chuẩn bị prompt và ghi lỗi. Không mua credit, tạo lại file hoặc đổi công cụ thay team. Nếu sửa code prototype trực tiếp được, chỉ sửa trong bản thiết kế đã thống nhất và vẫn kiểm preview; việc này khác với đưa code vào repo ứng dụng.

Đầu ra đầu tiên của người nhận: xác nhận mở được file, nêu đợt sẽ làm, các màn đã có/chưa kiểm và điểm cần hỏi. Không cần đọc toàn bộ repository trước khi bắt đầu.

Nếu người nhận đã được giao triển khai một đợt, phần tóm tắt này là cập nhật tiến độ, không phải yêu cầu duyệt lại kế hoạch. Tiếp tục công việc đã được giao; chỉ hỏi khi thiếu quyết định ảnh hưởng tới phần sắp làm. Nếu mới được giao đọc/chuẩn bị prompt, dừng ở đầu ra đó, chưa gửi Make. Gửi prompt tiêu credit và publish theo phạm vi người dùng giao trong phiên của người nhận; tài liệu bàn giao không tự cấp quyền cho hai hành động này.

## 2. Hiện tại đã tới đâu?

**Cập nhật sau các lượt A–E ngày 05/11:** đã thêm auth/Workspace/invite/profile, quản trị kênh/thành viên và recording mô phỏng; đã chạy một hành trình xuyên suốt. Card mới nhất là v14 (B2+B3); do hết AI credit, các lượt C/D/E sửa trực tiếp trong code editor và kiểm preview tải mới. F05 đã bổ sung sửa mic ở nhánh disconnect khi đang hỗ trợ ngoài roster. Người phụ trách đã chốt mỗi ACTIVITY cần ít nhất một thành viên trước start. Xem [hiện trạng mục 10–18](figma-current-state.md#10-lượt-a3--chat-và-deadline-05112026) để biết ca đạt/chưa kiểm và hạn chế picker; không chạy lại các prompt từ đầu.

Đây là tóm tắt để nhận việc; bằng chứng từng ca nằm tại [bản ghi hiện trạng](figma-current-state.md), không nhân bản toàn bộ kết quả vào đây.

| Khu vực            | Đã có / đã kiểm                                                                                          | Việc tiếp theo                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Workspace/chat     | Có sidebar, TEXT, PRIVATE, DM, thread, ảnh/file và tình huống gửi lỗi                                    | Kiểm lại tương tác và quyền; bổ sung màn quản trị nếu thiếu         |
| Lobby/MAIN         | Vào phòng được; camera mặc định tắt trên preview; share stage, camera, chat và điều khiển cuộc gọi đã có | Kiểm share, chat, chuyển host, rời/kết thúc và các trạng thái nguồn |
| DISCUSSION         | Tạo ngay không duyệt, tự bấm vào; disconnect người cuối đóng nhóm; còn người thì vào lại được            | Kiểm board và ca chủ động rời sau thay đổi mới                      |
| ACTIVITY           | Chọn người/số nhóm, random và sửa preview; host không bị phân nhóm; hỗ trợ, về sớm/vào lại đã thử        | Countdown 1 phút và mất help đã thử; xem E2 mục 18                  |
| Host tạm           | Chuyển tên/nhãn ngay và hoàn quyền host gốc đã thử                                                       | A1/E2 đã kiểm; xem current-state mục 8 và 18                        |
| Recording          | Đã có control/trạng thái MAIN và danh sách/player mô phỏng, xem current-state mục 17–18                  | Review luồng mô phỏng; chưa có video/media/storage thật             |
| Tài khoản/quản trị | Đã thêm/kiểm luồng chính B/C; ảnh/tệp/avatar và các nhánh còn thiếu xem current-state                    | Kiểm picker/avatar và các ca quản trị còn thiếu                     |

**Lỗi F05 tại thời điểm bàn giao v8 — đã sửa các ca A1 ở v9/v10:** từ demo Member, cho Lan Chi mất kết nối → Gia Khoa làm host tạm → Gia Khoa mất kết nối → Minh Anh, tức người đang thao tác, làm host tạm. UI hiện ghi tên/badge host tạm nhưng vẫn ghi “Bạn là thành viên”, không có công cụ vẽ và tổ chức ACTIVITY. Quyền hiển thị phải lấy theo host hiện hành, không chỉ theo lựa chọn Member/Host trong công cụ demo. Khi mất quyền phải thu lại các thao tác tương ứng.

Tên/thứ tự trên là ca đã quan sát, không phải quy tắc chọn người kế vị. Nếu demo chọn ngẫu nhiên khác, dùng tình huống phù hợp để chính người xem trở thành host tạm rồi kiểm control; không sửa random thành chuỗi tên cố định để tái hiện ca thử.

Các lượt C/D/E là sửa code trực tiếp sau v14, đã tải lại preview và đối chiếu nguồn trong editor. Không restore v14 khi bàn giao. Các nút thử hiện nằm trong menu **Tình huống demo**. Danh sách ca chưa kiểm và kết quả check cuối ở mục E3 trong current-state.

Các ca đạt chỉ là prototype: chưa chứng minh media cách ly, lưu tệp, auth, ACL hoặc recording thật. Đã thử countdown thật bằng lượt 1 phút trong A3/E2; chưa chờ đủ 15 phút. Không dựng lại những luồng đã đạt chỉ vì chưa có backend.

## 3. Đọc tài liệu nào, vào lúc nào?

**FR** mô tả chức năng cần có; **AC** là tiêu chí chấp nhận. **Miền M1–M5** phân trách nhiệm phát triển, không phải năm ứng dụng hay năm theme giao diện. **UC** giúp hiểu mục tiêu/vai trò; UI không bắt buộc có một màn cho mỗi UC. **Proposal** giải thích hướng triển khai của miền; phần còn đề xuất không tự thành quyết định sản phẩm.

| Khi làm gì                                        | Nguồn cần đọc                                                                                                                                                     | Cần lấy ra để đưa vào prompt                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Hiểu sản phẩm, phạm vi                            | [Onboarding](../team-onboarding.md), [scope](../product/scope.md)                                                                                                 | Ai dùng, hành trình chính, chức năng MVP và phần để sau                               |
| Kiểm đủ chức năng                                 | [FR/AC](../product/functional-requirements.md), [5 miền](../product/delivery-domains.md)                                                                          | FR liên quan, kết quả người dùng cần đạt, miền phối hợp                               |
| Xem nghiệp vụ bằng hình                           | [Mục lục sơ đồ UC/Astah](../product/diagrams/README.md), [Activity tổng thể](../product/diagrams/activity-overview.md)                                            | Vai trò và flow chính; đối chiếu chữ nếu hình chưa phản ánh delta mới                 |
| Auth, hồ sơ, Workspace, lời mời, thành viên, kênh | [Workspace/channels](../product/workspace-channels.md), [proposal M1 mục 3–6](../proposals/m1-workspace-auth.md)                                                  | Màn/điều hướng, ai có quyền, lỗi chính; không nạp WBS/API/DB vào Make nếu chỉ dựng UI |
| TEXT, DM, thread và chat cuộc họp                 | [Messaging](../product/messaging.md)                                                                                                                              | Loại nội dung, đích gửi, quyền và cách đổi ngữ cảnh                                   |
| Lobby, mic/camera/share, host                     | [LIVE](../product/live-session.md)                                                                                                                                | Ai thao tác, nguồn nào, phạm vi âm thanh và cách rời                                  |
| DISCUSSION/ACTIVITY, countdown, hỗ trợ            | [Group modes](../product/group-modes.md), [groups/media policy](../product/groups-media-policy.md)                                                                | Điều kiện vào/rời, nguồn nhận, ai nghe/xem, kết quả hết giờ                           |
| Freeze/vẽ/resume                                  | [Board](../product/board-collaboration.md)                                                                                                                        | MAIN khác nhóm thế nào; quyền vẽ/clear và ảnh/nét sau khi đổi nguồn                   |
| Ghi hình và xem video                             | [Recording](../product/recording.md)                                                                                                                              | Chỉ ghi MAIN, host điều khiển, trạng thái xử lý, quyền xem                            |
| Giữ phong cách đang có                            | [Brief](figma-make-brief.md)                                                                                                                                      | Slack cho cấu trúc, Meet cho bố cục họp, Linear cho phân cấp/tiết chế                 |
| Đưa code sang ứng dụng                            | [FE AGENTS](../../apps/web/AGENTS.md), [architecture](../architecture.md), [contracts](../contracts/README.md), [local runbook](../runbooks/local-development.md) | Ranh giới component, state và API; chỉ đọc ở giai đoạn tích hợp                       |

Không cần gửi toàn bộ file nghiệp vụ cho Make. Người nhận đọc phần liên quan, trích quy tắc đã chốt thành một khối ngắn rồi dán cùng prompt. Link repo không bảo đảm Make tự đọc được nội dung, nhất là tài liệu chưa push.

### Những thay đổi mới phải giữ khi đọc nguồn cũ

Các quyết định sau đã được người phụ trách xác nhận và đã có trong nguồn product sau merge main ngày 05/11. Đọc nguồn hiện hành trước prompt phụ thuộc; prompt lịch sử và một số đoạn tổng kết cũ có thể chưa phản ánh đủ các delta. Đây là phần nhắc để tránh dùng nhầm, không phải thay đổi mới do người viết tự chọn:

- Host tạm được chọn ngay khi server phát hiện host mất kết nối; không chờ hết grace mới bầu. Việc giữ cơ hội hoàn quyền cho host gốc là vấn đề khác với thời điểm bầu host tạm.
- DISCUSSION đã có người tự đóng khi không còn ai kết nối, kể cả người cuối mất kết nối. Kết nối lại về MAIN; chỉ được chủ động vào lại nếu nhóm còn mở và người đó còn trong danh sách hợp lệ. Nhóm mới chưa ai vào vẫn chờ.
- ACTIVITY cho thành viên về MAIN sớm rồi vào lại **đúng nhóm đã phân** khi lượt còn mở; không điều chuyển/xáo nhóm trong lượt. Hết giờ tự về MAIN và tạm tắt mic; không có nút host kết thúc lượt thủ công.
- DISCUSSION không cần host duyệt và host không vào hỗ trợ; trao đổi riêng với host qua chat. ACTIVITY có host vào hỗ trợ đúng nhóm.
- MAIN không freeze; host hiện hành ở MAIN được vẽ LIVE, kể cả người khác share. Freeze/vẽ chung nằm ở nhóm.
- Avatar dùng URL Cloudinary công khai; chỉ chính chủ đổi/xóa. Link mời Workspace hiện hành có thể sao chép lại, không hạn/lượt; owner/admin tắt hoặc tạo lại, link cũ mất hiệu lực. Không dựng nhiều link hết hạn theo proposal cũ.
- Recording: mỗi đoạn tối đa 3 tiếng từ capture bắt đầu; đủ hạn tự dừng ghi/xử lý nhưng cuộc gọi tiếp tục. Đổi/hoàn quyền host không ngắt hoặc reset thời lượng bản ghi; host mới điều khiển. READY giữ vô thời hạn; danh sách xem lại thông thường chỉ hiện READY. Chi tiết UI bắt buộc ở đợt D bên dưới, nguồn tại [recording](../product/recording.md).

Đối chiếu proposal mới nhất trong các PR miền khi cần: [M1 #29](https://github.com/Lightning1507/CoLearnia/pull/29), [M2 #30](https://github.com/Lightning1507/CoLearnia/pull/30), [M3 #27](https://github.com/Lightning1507/CoLearnia/pull/27), [M4 #28](https://github.com/Lightning1507/CoLearnia/pull/28), [M5 #24](https://github.com/Lightning1507/CoLearnia/pull/24). Trạng thái PR có thể thay đổi; phần này không xác nhận các PR đã merge hoặc mọi phương án trong đó đã chốt.

Nếu gặp mâu thuẫn khác, ghi rõ hai nguồn và hỏi người phụ trách trước prompt phụ thuộc. Không để Make tự chọn nghiệp vụ, cũng không sửa tài liệu sản phẩm để khớp giao diện sinh ra.

## 4. Quy tắc giữ xuyên suốt UI

- Tiếp tục cùng file, layout và component; UI tiếng Việt, nội dung chính dễ đọc. Workspace sáng, vùng media tối. Giữ một kiểu button/input/dialog/panel và một bộ icon.
- Desktop trước: kiểm 1440×900 và 1280×800. Không biến mobile hoàn chỉnh thành điều kiện mới cho lượt bàn giao này; phạm vi thiết bị cuối cần team thống nhất.
- Luôn thấy mình đang ở đâu, nguồn đang xem và ai nghe được mic. “Về phòng chung” khác “Rời cuộc họp”; về Workspace chưa chắc đã rời call.
- WORKSPACE/PRIVATE là quyền truy cập; TEXT/LIVE là loại kênh. Owner/admin quản trị không mặc nhiên đọc nội dung PRIVATE hoặc DM. Host cuộc họp độc lập owner/admin Workspace.
- TEXT/DM có text/ảnh/file; chỉ TEXT có thread một cấp. Chat cuộc họp chỉ text/ảnh; Everyone theo phòng/nhóm hiện tại, Host là trao đổi riêng đúng người.
- MAIN và mỗi ACTIVITY có một share tại một thời điểm; người khác đợi, không giành nguồn. DISCUSSION không share riêng, kế thừa bài giảng MAIN. ACTIVITY không fallback MAIN khi nhóm chưa share.
- Board nhóm tạm dừng **hình của cả nhóm**, âm thanh vẫn tiếp tục. Resume về live hiện tại, không phát lại đoạn bỏ qua; không công bố ảnh/nét nhóm lên MAIN.
- Không thêm quiz, thư viện bài làm, search/reaction/AI summary, đổi theme hay công cụ vẽ mở rộng chỉ vì ảnh Slack/Meet có. Không tự cắt camera, chat, nhóm hoặc recording để gọi UI hoàn tất.
- Công cụ đổi vai trò/mất mạng/hết giờ phục vụ demo phải nằm ngoài điều khiển sản phẩm. Dữ liệu giả không được gọi là kết nối/lưu/ghi hình thật.

## 5. Lộ trình gốc A–E và cách tiếp tục

Các đợt A–E dưới đây giữ phạm vi thiết kế ban đầu, không biểu thị tất cả đã đạt. Tiến độ hiện hành lấy ở current-state mục 19; công việc tiếp theo ở mục 5.1. Không dùng mốc kế hoạch cũ để tự giảm scope hoặc báo hoàn tất.

Đây là thứ tự đề xuất, không phải estimate hoặc sprint đã cam kết. Mục tiêu ban đầu là hoàn thiện trong ngày 05/11 để bắt đầu triển khai 06/11; người nhận cần báo phần làm được và phần còn thiếu theo thời gian/credit thực có. Không đánh dấu đủ chỉ để kịp mốc.

### Đợt A — Khép lỗi và luồng đang có

1. Sửa F05; kiểm host tạm có đúng công cụ, host cũ mất quyền và host gốc quay lại được hoàn quyền hợp lệ.
2. Kiểm share/board/chat theo ma trận mục 7. Sửa sai nghiệp vụ và lỗi ngăn thao tác trước; không chỉnh màu/spacing nhỏ ở lượt này.
3. Kiểm countdown tự chạy bằng một thời lượng hợp lệ ngắn, không chỉ bấm nút demo hết giờ.

**Xong khi:** các flow cũ dùng để demo được, không hiển thị sai role/phòng/nguồn. Ghi phần chưa kiểm, không gửi lại prompt dựng Prompt 1–3.

### Đợt B — Tài khoản và đường vào Workspace

Kiểm hiện có rồi bổ sung: đăng ký/đăng nhập/đăng xuất; danh sách Workspace, trạng thái chưa có Workspace và tạo Workspace; mở link mời → auth nếu cần → xác nhận tham gia → vào Workspace. Giữ lời mời qua bước auth; đăng ký thành công tự đăng nhập nhưng không tự nhận lời mời. Có ca đã là thành viên và link đã tắt/đổi.

Thêm hồ sơ tên hiển thị/avatar thay/xóa; đổi mật khẩu có mật khẩu hiện tại, thông báo sẽ đăng xuất mọi phiên, thành công quay lại đăng nhập. Quên mật khẩu để sau; không tự thêm Google login hoặc chuyển owner.

**Xong khi:** người xem bắt đầu từ chưa có tài khoản/Workspace và đi tới shell đang có, không bị mắc ở màn độc lập.

### Đợt C — Quản trị Workspace, thành viên và kênh

Bổ sung những phần thiếu: đổi tên/xóa Workspace; danh sách thành viên, cấp/gỡ ADMIN và loại thành viên theo quyền M1; link mời sao chép/tắt/tạo lại; tạo/đổi tên/xóa TEXT/LIVE; tạo PRIVATE và thêm/gỡ thành viên. Thao tác xóa/thu quyền phải có hậu quả rõ và xác nhận phù hợp.

Danh sách kênh để sử dụng chỉ hiện kênh có quyền nội dung. Nếu cần quản trị PRIVATE ngoài quyền đọc, mở màn thông tin quản trị/danh sách quyền, không mở chat/video của kênh. Không cho sửa type/accessMode sau tạo nếu nguồn chưa cho phép. Không tự bảo vệ `general` thành bất biến hoặc tự tái tạo sau xóa.

**Xong khi:** thử được MEMBER, ADMIN và OWNER qua công cụ demo; phân biệt quyền quản lý với quyền xem; mất quyền đóng đúng nội dung đang mở và đưa về nơi còn quyền.

### Đợt D — Hoàn thiện chat và recording

- Chat: gửi text/ảnh/file trong TEXT/DM; thread đúng root, không có trong DM; trạng thái pending/error/retry không tạo bản sao. Chat cuộc họp Everyone/Host đúng ngữ cảnh, đổi đích không mang nháp hoặc lịch sử riêng sang nhầm người.
- Recording: host bắt đầu/dừng tại MAIN; mọi người thấy chỉ báo kể cả vào sau. Minh họa đang khởi động/đang ghi/đang xử lý/sẵn sàng/lỗi bằng dữ liệu giả; lỗi không kết thúc call. Chỉ đưa bản sẵn sàng vào luồng phát video.
- Từ kênh LIVE, có lối tìm bản ghi theo phiên và mở video giả lập; người còn quyền kênh xem được, người mất quyền bị chặn. Ghi MAIN gồm màn hình/camera/âm thanh MAIN, không ghi nhóm riêng.

**Delta sau merge main 05/11 — đưa vào lượt D3/D4:**

- Trạng thái UI phân biệt đang khởi động → đang ghi → đang dừng → đang xử lý → sẵn sàng hoặc lỗi. Đang khởi động có thể hủy/dừng; callback mô phỏng cũ không làm hiện lại “đang ghi”. Không cho bắt đầu đoạn tiếp trong cùng phiên khi đoạn trước còn xử lý/upload; thông báo lý do thay vì nút không phản hồi.
- Mỗi đoạn tối đa **3 tiếng** tính từ khi bắt đầu ghi thực sự. Hiện thời lượng ghi, cảnh báo trước cho host; mốc cảnh báo chưa chốt, giá trị demo phải được ghi là minh họa. Đến hạn tự dừng và xử lý, **cuộc gọi vẫn tiếp tục**; không tự ghi đoạn mới. Có thể dùng tình huống demo gần hết hạn, không cần chờ 3 tiếng để review UI.
- Đổi host hoặc host vào hỗ trợ ACTIVITY: bản ghi vẫn tiếp tục từ MAIN, không reset đồng hồ và không thu nội dung nhóm. Chỉ host hiện hành có control ghi/dừng; người bàn giao mất control. Kết thúc call ngừng ghi rồi trở về kênh, không bắt người dùng chờ video sẵn sàng mới rời được.
- Trang Bản ghi chỉ liệt kê video **READY** cho người xem thông thường. Trạng thái đang ghi/xử lý/lỗi nằm ở ngữ cảnh phiên và người nhận phù hợp; không dựng một lịch sử lỗi nội bộ cho mọi thành viên. Chọn bản sẵn sàng mở player có phát/tạm dừng/tua và quay lại; UI mô phỏng có thể dùng clip mẫu, không coi đó là recorder đã chạy.
- READY giữ **vô thời hạn**, không có nhãn tự hết hạn hoặc tự xóa sau vài ngày. Mất quyền kênh vẫn bị chặn. Quyền xóa thủ công, quota cụ thể và xử lý byte sau xóa Workspace/kênh còn mở: không tự thêm nút xóa hoặc giá trị giới hạn mới.
- Không lấy bố cục/pin/âm lượng cá nhân của host làm bản ghi: khi có share MAIN, profile dùng share cùng camera MAIN hợp lệ; không share thì camera, không có hình thì nền thông báo. Chưa cần dựng trình cấu hình bố cục recording riêng.

Đọc nguồn [recording hiện hành](../product/recording.md) và proposal M3/M4/M2 trước lượt này. Pipeline PlainTransport → GStreamer, MP4/H264/AAC và kho R2 riêng tư là thông tin để dev tích hợp, **không cần thêm chữ GStreamer/R2, nút chọn provider hay cấu hình codec vào giao diện người dùng**. Avatar Cloudinary công khai không làm file chat/frame/video thành công khai. Clip vài phút chỉ phục vụ demo. Bố cục danh sách/player mới vẫn là đề xuất UI để team review.

**Xong khi:** có hành trình ghi → dừng → xử lý → xem lại và nhánh lỗi/quyền cơ bản, không chỉ có một nút Ghi hình trang trí.

### Đợt E — Review chung và bàn giao sang FE

Đi một hành trình liên tục ở mục 7, kiểm hai kích thước desktop, thống nhất chữ/component và sửa lỗi cản demo. Người phụ trách review nội dung rồi mới cập nhật public khi được giao publish. Ghi màn nào đã chốt, màn nào còn đề xuất và phần nào chưa kiểm.

Bàn giao code prototype nếu cần, cùng ảnh/luồng, trạng thái và component dùng chung. Team tích hợp từng miền vào app hiện tại; không thay toàn bộ app bằng code Make. Mock role, media và timer phải được nhận diện để thay bằng auth/contracts/runtime thật ở task phát triển.

Nếu thiếu thời gian, giữ thứ tự: **sai nghiệp vụ/cản thao tác → đường vào và màn MVP còn thiếu → trạng thái lỗi/quyền → đồng nhất trình bày**. Báo rõ phần chưa xong thay vì tự bỏ scope. Không cần hoàn hảo mọi pixel để team bắt đầu FE.

### Chia từng đợt thành lượt làm cụ thể

Các mã A1–E3 dưới đây chỉ giúp chỉ tới lượt làm trong bàn giao, không phải Jira task hoặc cam kết số prompt/credit. Một lượt có thể không cần gửi Make nếu màn đã có và kiểm đạt; cũng có thể cần tách tiếp nếu phát sinh lỗi. Không gửi tất cả các hàng trong một prompt.

| Lượt                             | Điểm bắt đầu và việc làm                                                                                                  | Đầu ra / điều kiện chuyển tiếp                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 — Host tạm                    | Dùng kịch bản F05 ở mục 2; sửa nguồn role của header, menu và toolbar                                                     | Chính người xem thành host tạm dùng được control đúng scope; mất host thu control. Không chỉ đổi badge                                          |
| A2 — Share và board              | Tại MAIN thử member/host và nguồn trống/có share. Tại DISCUSSION/ACTIVITY thử freeze → vẽ → resume                        | MAIN không freeze; nhóm dùng đúng nguồn; nguồn LIVE đổi/dừng bỏ overlay cũ. Frame nhóm đã freeze hợp lệ không bị xóa nhầm chỉ vì nguồn live đổi |
| A3 — Chuyển phòng và kết thúc    | Thử chat khi đổi phòng/host, rời hỗ trợ, member về sớm/vào lại. Chạy một lượt ACTIVITY thời lượng ngắn hợp lệ tới hết giờ | Nhãn phòng/mic/chat nhất quán, không mang nội dung riêng sang nhầm đích; hết giờ về MAIN/mic tắt. Chỉ sửa phần sai, không dựng lại nhóm         |
| B1 — Auth và danh sách Workspace | Mở app từ trạng thái chưa đăng nhập; dựng/kiểm đăng ký, đăng nhập, đăng xuất; màn có/chưa có Workspace                    | Người dùng đi tới danh sách Workspace và có lối tạo mới; validation/lỗi/loading có cách tiếp tục, không dùng đổi role demo thay auth            |
| B2 — Tạo và nhận lời mời         | Từ danh sách tạo Workspace. Từ link mời đi qua auth và xác nhận tham gia                                                  | Tạo xong mở Workspace/general; lời mời được giữ qua auth; đã là member không gia nhập trùng; link cũ/tắt báo không dùng được                    |
| B3 — Hồ sơ và mật khẩu           | Từ menu tài khoản mở hồ sơ, sửa tên, thay/xóa avatar; mở form đổi mật khẩu                                                | Lưu/hủy rõ; ảnh có preview/lỗi mô phỏng. Đổi mật khẩu sai giữ form/phiên; thành công thông báo và về đăng nhập, mô phỏng thu mọi phiên          |
| C1 — Thành viên và lời mời       | Từ menu Workspace mở danh sách thành viên và quản lý link                                                                 | Có cấp/gỡ ADMIN đúng quyền, loại thành viên với xác nhận; sao chép lại cùng link, tạo lại/tắt có hậu quả rõ. Không có chuyển OWNER              |
| C2 — Kênh và PRIVATE             | Từ sidebar/menu quản trị tạo TEXT/LIVE và WORKSPACE/PRIVATE; đổi tên/xóa; quản lý danh sách PRIVATE                       | Dùng đúng hai thuộc tính type/accessMode, quyền tạo đúng vai trò; thêm/gỡ PRIVATE không tự mở nội dung cho người quản trị chưa được cấp         |
| C3 — Thu quyền trên màn đang mở  | Dùng tình huống demo để thu membership hoặc quyền kênh khi đang ở chat/LIVE                                               | Đóng đúng nội dung/tài nguyên UI bị mất quyền, thông báo dễ hiểu và có đường quay lại; không đá khỏi các Workspace/kênh không liên quan         |
| D1 — Chat Workspace              | Tại TEXT/DM thử gửi text, ảnh, file; mở thread; thử pending/error/retry                                                   | Tin/reply nằm đúng nơi, retry không nhân bản; DM không thread; composer không vỡ khi panel mở                                                   |
| D2 — Chat cuộc họp               | Tại MAIN/nhóm chọn Everyone/Host; host trả lời đúng người; đổi phòng/host                                                 | Chỉ text/ảnh, đích gửi rõ, lịch sử/nháp riêng không đi sang người khác. Panel dùng lại shell, không dựng trang gọi thứ hai                      |
| D3 — Điều khiển recording        | Đọc nguồn recording và proposal miền đã review, kiểm hiện có rồi bổ sung control host, chỉ báo và trạng thái giả lập      | Đi được bắt đầu → đang ghi → dừng → xử lý, cùng ca lỗi. Không gắn recorder vào nhóm riêng hoặc báo sẵn sàng khi chưa xử lý                      |
| D4 — Danh sách và xem video      | Từ kênh LIVE mở bản ghi của phiên, chọn bản sẵn sàng, quay lại; thử mất quyền                                             | Có player/bản ghi mô phỏng dùng được, phân biệt xử lý/lỗi/sẵn sàng; không mở video khi mất quyền kênh. Bố cục mới được team review              |
| E1 — Một hành trình xuyên suốt   | Chạy kịch bản show team từ tài khoản tới họp/nhóm/xem lại; thử cả member và host                                          | Không có màn cụt hoặc bắt buộc sửa state trong code để đi tiếp; demo controls được phân biệt rõ                                                 |
| E2 — Rà trình bày và hồi quy     | Mở panel ở hai kích thước desktop; kiểm các control/component dùng chung vừa thay                                         | Không cắt chữ/composer/nút chính; không làm hỏng luồng đã đạt. Sửa chữ cũ và lỗi nhỏ đã gom ở đây                                               |
| E3 — Chốt bản bàn giao FE        | Tổng hợp kết quả, ảnh cần thiết và điểm còn mở; cập nhật public nếu được giao                                             | current-state phản ánh đúng bản cuối, team biết phần đã chốt/chưa chốt và mock cần thay; public được kiểm riêng sau publish                     |

**Quan hệ giữa các lượt:** A1 trước khi kết luận quyền host/recording đúng; B1 trước B2/B3; C1/C2 cần shell Workspace đã có; C3 kiểm sau khi có control quản trị. D3 trước D4; E1–E3 sau các đợt tính năng. D1/D2 có thể kiểm sớm trong A3 nếu đã có, không cần đợi dựng xong mọi màn M1. Những lỗi dùng chung như role/composer nên sửa một chỗ rồi kiểm các màn sử dụng, tránh gửi prompt riêng để vá từng bản sao.

Trước mỗi lượt, người nhận ghi ba dòng: **sẽ làm gì — cần nguồn/quyết định nào — kiểm bằng hành trình nào**. Kết thúc lượt, ghi đạt/cần sửa/chưa kiểm và chọn lượt tiếp theo. Nếu bị thiếu nguồn hoặc quyết định, chuyển sang phần độc lập có thể làm; không tự thiết kế thay nghiệp vụ còn mở.

### 5.1. Các lượt tiếp theo sau rà tổng thể

Đây là thứ tự khép khoảng trống prototype, không là sprint/estimate hoặc bảng trạng thái cạnh tranh với GitHub Issues. Một lượt có thể tách nhỏ; giữ một kết quả kiểm được mỗi lần chỉnh. **Đọc 19.4 để phân biệt phát hiện từ mã với lỗi đã tái hiện.** Lượt rà tổng thể chỉ đọc nguồn/Figma và cập nhật tài liệu; chưa sửa các phát hiện mới.

| Lượt                                         | Việc người nhận làm                                                                                                                                                       | Nguồn và đầu ra cần có                                                                                                        | Cách kiểm trước bàn giao                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — Khép lỗi nghiệp vụ có nguy cơ sai luồng | Tái hiện chat người trong DISCUSSION gửi host MAIN và chiều trả lời; kiểm hai LIVE khi đang gọi. Sửa lọc private theo đúng cặp/quyền, điều hướng không giả vào phòng khác | FR-09-02; policy 8.1; LIVE 6.1/FR-05-02. Ghi bước lỗi trước/sau, không mở chat nhóm cho host hoặc tự end call                 | Tin riêng đúng người qua hai phòng, Everyone vẫn riêng; host mới không nhận lịch sử cũ. Bấm LIVE khác không âm thầm đưa về call cũ dưới kỳ vọng phòng mới; chuyển/Hủy có kết quả rõ theo nguồn |
| R2 — Bổ sung luồng còn thiếu                 | Ưu tiên hướng dẫn chung; ACTIVITY bắt đầu lỗi một phần/đang hủy; tải lịch sử kênh/DM/thread theo trang                                                                    | FR-08-02; group modes phần Hai giai đoạn; FR-04-03/12-01/13-01. State mô phỏng rõ, không backend mới                          | Announcement chỉ MAIN/DISCUSSION và restore mức nghe cũ; start lỗi thu lượt dở/về MAIN/không hồi DISCUSSION; lịch sử nhiều trang có chờ/lỗi/hết, không lẫn reply/kênh                          |
| R3 — Thu quyền và phục hồi                   | Hết hạn phiên, quyền đổi khi reconnect, kết quả thao tác chưa rõ, phiên ended/restart; quản trị ngoài PRIVATE và re-add; host chính thức/tạm, hết ứng viên                | FR-01-02/03/06, FR-03-04, FR-07-09, FR-11. Đọc nhánh chi tiết LIVE trước thiết kế. Đã có banner không đồng nghĩa đã có resync | Thu quyền khi mở dialog/thread/file/call/player; offline bị kick không mở lại private; không hồi nhóm/thiết bị/đích cũ; Hủy end giữ call. Báo phần chưa thể mô phỏng thay vì tự chọn nghiệp vụ |
| R4 — Tệp, avatar và ca quản trị còn lại      | Thử picker bằng dữ liệu giả; ảnh/file TEXT/DM/thread, chỉ ảnh chat họp; avatar Lưu/Hủy/lỗi/xóa; copy/link cũ, gỡ Admin, Hủy loại; hoàn thiện lỗi player/PROCESSING        | Current-state 19.5, nguồn M1/M2/recording. Nếu picker vẫn chặn, mô tả blocker và cần người kiểm thao tác; không giả đạt       | Upload lỗi giữ ảnh cũ; retry không trùng; file đúng đích; mất quyền đóng preview; host cũ/member không ghi; thư viện chỉ READY, không đưa FAILED nội bộ ra chung                               |
| R5 — Rà trình bày và hồi quy cuối            | Tên/danh sách dài, loading/rỗng/lỗi, nhãn/focus/bàn phím; auth/invite/dialog/call mở panel/thư viện ở hai desktop; chạy hành trình team                                   | Handoff mục 7/9, current-state 19.5. Giữ phong cách, không dựng lại layout hoặc tự mở scope mobile                            | Nút/ô soạn không bị che; chữ dễ hiểu; call control vẫn dùng được; chạy một hành trình liên tục sau tất cả sửa, ghi ảnh và giới hạn                                                             |
| R6 — Team review và bàn giao FE              | Tổng hợp bản cuối, quyết định còn mở, state giả và contract cần thay; giữ code sau v14; cập nhật public khi được giao publish                                             | Current-state 19.7 và workflow repo. Ghi bản team đã duyệt, không tự nhận đã chốt                                             | Mở lại preview mới; nếu publish thì thử public riêng. Người FE biết màn/interaction/state/error/quyền nào phải triển khai và phần nào chưa chốt                                                |

**Thao tác với bản Make hiện tại:** prompt đã bị khóa do hết credit ở lần kiểm gần nhất; code editor vẫn sửa được. Sao lưu nguồn hiện tại trước chỉnh, giữ cùng file, tự kiểm preview chạy thực thay lớp cached. Không restore v14 vì sẽ mất C/D/E. Không cần mua credit hoặc nhập lại app. Không dùng file backup trong máy người bàn giao làm phụ thuộc bắt buộc: nguồn tiếp nhận nằm trong code editor của file Make.

**Hai quyết định không hỏi lại:** helper ngoài roster mất host → MAIN/mic tắt/camera giữ; mỗi nhóm ACTIVITY phải có ít nhất một thành viên hợp lệ trước start. Mốc fade nét, cảnh báo recording, giới hạn upload hoặc thông số giảm tiếng còn mở thì chỉ dùng minh họa có nhãn hoặc hỏi trước khi chốt. Nghiệp vụ đã có nguồn rõ thì làm theo nguồn, không hỏi lại để trì hoãn.

## 6. Cách viết và gửi prompt

### Một lượt làm một mục tiêu kiểm được

Mỗi prompt cần: màn đang sửa, vai trò/trạng thái đầu, thay đổi cần làm, quy tắc phải giữ, kết quả sau thao tác và ca thử. Gộp lỗi cùng nguyên nhân; chia lượt nếu có nhiều hành trình độc lập. Tránh “hoàn thiện toàn bộ app”, “làm giống Slack/Meet” hoặc dán cả database/API/WBS.

Khi sửa lỗi, kèm ảnh cắt đúng vùng và bước tái hiện. Khi thêm màn, dẫn về component/shell đang có và nói rõ điểm vào/điểm ra. Giá trị chưa chốt chỉ dùng minh họa có ghi chú, không viết thành validation sản phẩm.

### Prompt khởi động cho AI tiếp nhận

Khối này dành cho AI làm việc cùng repository. Không giả định Figma Make truy cập được các file local:

```text
Bạn tiếp tục hoàn thiện UI prototype CoLearnia, không triển khai backend.
Đọc AGENTS.md và docs/README.md, sau đó:
- docs/ui/figma-handoff.md: cách nhận việc, lộ trình, cách prompt và kiểm.
- docs/ui/figma-current-state.md: hiện trạng và bằng chứng gần nhất.
- docs/ui/figma-make-brief.md: phong cách và lịch sử prompt; không dùng nguyên prompt cũ.
Chọn nguồn nghiệp vụ theo đợt đang làm, không nạp toàn bộ lịch sử.
Ưu tiên current-state mục 19 và handoff mục 5.1; A–E là lịch sử phạm vi,
không phải yêu cầu chạy lại. Bản hiện tại có sửa code trực tiếp sau v14; không restore v14.

Trước khi sửa, tóm tắt phần hiện có, phần chưa kiểm, đợt tiếp theo và mâu thuẫn nguồn nếu có.
Tôi đã có context nghiệp vụ và quyền edit file; không yêu cầu onboarding/mời lại nếu không bị chặn thực tế.
Giữ cùng file Make và component. Làm đúng phạm vi tôi giao ở cuối prompt này:
- Nếu chỉ đọc/review/soạn prompt: chưa gửi Make.
- Nếu đã giao triển khai một đợt: tiếp tục trong phạm vi đó, không hỏi lại việc đã được phép.
- Chỉ gửi Make tiêu credit hoặc publish khi được giao hành động tương ứng; quyền edit không thay ủy quyền này.
Review theo mục 9; nếu browser lỗi, làm theo mục 10, kiểm công cụ hiện tại trước khi yêu cầu bật lại cài đặt.
Sau mỗi lượt, kiểm preview và cập nhật current-state, phân biệt đã thấy/đã thử/chưa kiểm.
Không coi prototype là bằng chứng auth/media/ACL/recording thật đã chạy.

Việc được giao trong lượt này: tiếp tục R1, tái hiện trước khi sửa; sau đó cập nhật
current-state với kết quả/ảnh/ca chưa kiểm. Giữ cùng file Make, không publish/commit/push.
```

Có thể thay ba dòng cuối bằng lượt được giao thực tế. Người dùng đã giao rõ phạm vi bằng tin nhắn thì Codex dùng phạm vi đó, không bắt nhập lại theo mẫu. Prompt này dành cho Codex đọc repo; khi gửi vào Make cần trích ngắn quy tắc và bước lỗi vì Make không tự đọc tài liệu local.

### Mẫu prompt gửi vào Make

Điền đủ phần trong ngoặc vuông; bỏ các mục không áp dụng trước khi gửi:

```text
Tiếp tục trong file CoLearnia hiện tại. Lượt này chỉ [mục tiêu].
Giữ nguyên Workspace/chat, shell cuộc họp, component và phong cách đang có.
UI tiếng Việt, desktop 1440×900 và 1280×800. Chỉ mô phỏng; không nối backend/dịch vụ thật.

HIỆN TRẠNG
[Màn đang có, kết quả đang sai hoặc màn cần bổ sung.]

LUỒNG CẦN LÀM
- Điểm vào: [màn/nút, vai trò, phòng, dữ liệu ban đầu].
- Các bước và kết quả: [...].
- Điểm ra/quay lại/hủy: [...].
- Trạng thái loading/rỗng/lỗi/quyền cần minh họa: [...].

QUY TẮC ĐÃ CHỐT
[Trích đúng quy tắc liên quan từ nguồn đã đọc; không dán toàn bộ tài liệu.]

GIỮ NGUYÊN
[Các hành vi đã đạt có thể bị ảnh hưởng; không dựng lại hoặc đổi nghiệp vụ khác.]

KIỂM SAU KHI SỬA
[3–6 ca cụ thể, mỗi ca có thao tác và kết quả mong đợi.]
Chỉ báo những ca thực sự đã thử; liệt kê phần còn thiếu/chưa kiểm.
Không tự thêm chức năng hoặc quyết định nghiệp vụ ngoài lượt này.
```

### Ví dụ dùng ngay — sửa F05

```text
Chỉ sửa quyền UI theo host hiện hành trong prototype CoLearnia; giữ nguyên các màn/luồng khác.
Tái hiện: demo Member, Lan Chi là host → mô phỏng host mất kết nối → Gia Khoa host tạm
→ mô phỏng host tạm mất kết nối → Minh Anh (người đang thao tác) thành host tạm.
Hiện badge đã đổi nhưng header vẫn “Bạn là thành viên”, không có công cụ host.

Cho toàn bộ control đọc cùng trạng thái host hiện hành: host tạm hợp lệ có đúng thao tác host
theo phòng/phase, gồm toolbar vẽ MAIN và tổ chức ACTIVITY khi được phép.
Không cấp host chỉ vì chọn một nhãn demo; không hiện công cụ ngoài scope hiện hành.
Khi mất quyền, thu control cũ; host gốc quay lại hợp lệ được hoàn quyền theo kịch bản đã có.
Không tự bật mic/camera, không mở lại nhóm đã đóng hoặc đổi phân nhóm ACTIVITY.

Kiểm: người thường không có control; chính người xem thành host tạm có control;
host gốc quay lại thì host tạm mất control; host cũ disconnect mất toolbar;
đang ACTIVITY không xuất hiện chia lại/điều chuyển/kết thúc lượt thủ công.
Chỉ sửa state/UI giả lập, không thêm API hoặc dịch vụ thật.
```

Không chạy lại ví dụ nếu người tiếp nhận đã sửa F05 và ghi bằng chứng mới. Đối với đợt B/C/D, dùng mẫu trên cùng phạm vi ở mục 5; đọc nguồn trước để điền chi tiết, không coi mô tả ngắn trong bàn giao là toàn bộ AC.

### Sau khi Make trả kết quả

1. Đọc phần Make nói đã sửa, nhưng chưa coi là đạt.
2. Mở preview, tái hiện ca cần sửa và thử một luồng lân cận dễ bị ảnh hưởng.
3. Ghi lỗi bằng bước tái hiện + mong đợi + thực tế + ảnh nếu cần. Một ảnh đẹp không chứng minh flow đúng.
4. Chỉ gửi prompt sửa tiếp nếu lỗi cản thao tác, sai nghiệp vụ hoặc thuộc phạm vi đợt. Gom lỗi chữ/spacing nhỏ để sửa cuối.
5. Cập nhật [current-state](figma-current-state.md); nếu chưa đủ credit thì dừng gửi, ghi phần còn lại để người sau tiếp tục.

## 7. Checklist nghiệm thu UI và kịch bản demo

Đánh dấu từng ca sau khi **thực sự thao tác**, kèm ngày và preview/public trong current-state. Bảng này là checklist cần kiểm, không phải kết quả đã đạt.

| Nhóm                | Ca cần kiểm                                                      | Kết quả cần thấy                                                                           |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Đường vào           | Đăng ký/đăng nhập → danh sách Workspace → tạo hoặc nhận lời mời  | Không mất lời mời sau auth; không bắt tạo Workspace riêng nếu đang được mời                |
| Quản trị            | OWNER/ADMIN tạo kênh, quản lý PRIVATE; MEMBER dùng kênh được cấp | Không dùng quyền quản trị để đọc nội dung chưa được cấp; thu quyền đóng đúng màn           |
| Hội thoại           | general → thread → DM; gửi/retry ảnh/file                        | Thread một cấp chỉ TEXT; không trùng tin hoặc nhầm hội thoại                               |
| Vào LIVE            | LIVE → lobby → MAIN, đổi mic/camera, quyền thiết bị bị từ chối   | Camera mặc định tắt; có thể vào xem khi không cấp thiết bị; trạng thái nút khớp            |
| Share/MAIN          | Nguồn trống → chọn/hủy share → share → dừng; đổi người share     | Một nguồn; không giành; overlay cũ được xóa khi đổi/dừng nguồn                             |
| Quyền board         | Member/host tại MAIN                                             | MAIN không freeze; chỉ host hiện hành đúng scope vẽ/clear; mất host thu quyền              |
| DISCUSSION          | Tạo hợp lệ → tự vào → freeze/vẽ/resume → về MAIN                 | Không duyệt; không share riêng; hình nhóm dừng, tiếng giảng tiếp tục; MAIN không bị freeze |
| Vòng đời DISCUSSION | Người cuối rời/disconnect; còn người thì reconnect               | Rỗng sau đã có người thì đóng; reconnect MAIN; chỉ vào lại nhóm còn mở                     |
| ACTIVITY            | Chọn người/số nhóm → random/chỉnh preview → start                | Cân số lượng, không trùng; host không trong phân nhóm thường; đóng DISCUSSION trước        |
| Trong ACTIVITY      | Share nhóm, host hỗ trợ A rồi rời, member về sớm/vào lại         | Nhóm độc lập, không fallback MAIN; host chỉ ở nhóm đích; member về đúng nhóm cũ            |
| Deadline            | Đặt thời lượng ngắn hợp lệ và để tự hết giờ                      | Tự kết thúc đúng lượt, về MAIN/mic tắt, không vào lại lượt cũ                              |
| Chat họp            | Everyone/Host ở MAIN và nhóm; chuyển phòng/host                  | Rõ đích; không file/thread; không mang nháp/lịch sử riêng sang nhầm người                  |
| Host                | Tạm thời, hoàn quyền, chuyển chính thức, hủy/đồng ý kết thúc     | Control đúng host hiện hành; chuyển trực tiếp không accept; hủy không end call             |
| Recording           | Ghi/dừng → xử lý → sẵn sàng/xem; lỗi; mất quyền                  | Chỉ MAIN, chỉ host điều khiển; không báo video sẵn sàng sớm; mất quyền không xem           |
| Bố cục              | Hai kích thước desktop, mở chat/participants/nhóm/thread         | Không tràn ngang app hoặc cắt composer; mic/camera/rời luôn dùng được                      |

**Kịch bản show team:** tài khoản/Workspace → chat general và thread → LIVE/lobby → MAIN/share → tạo DISCUSSION và freeze nhóm → về MAIN → host tổ chức ACTIVITY/random → share nhóm/hỗ trợ → tự hết giờ → bản ghi sẵn sàng trong kênh. Có thể dùng nút demo để rút ngắn buổi trình bày, nhưng phải nói rõ; nghiệm thu countdown vẫn cần ca tự chạy riêng. Chuyển vai trò bằng công cụ demo, không diễn giải là chức năng tự cấp quyền.

Đủ để bàn giao UI khi các hành trình MVP có điểm vào/ra, vai trò và trạng thái chính dễ hiểu; các lỗi còn lại được ghi rõ và người phụ trách chấp nhận phạm vi. Không yêu cầu mọi edge case được vẽ riêng; không gọi UI đầy đủ nếu màn chức năng chính còn thiếu.

## 8. Người nhận cần để lại gì sau mỗi đợt?

- Cập nhật **current-state**: màn/luồng mới, lỗi đã sửa, lỗi còn lại, ca đã thử và chưa thử. Không chỉ nối thêm lịch sử trong khi hiện trạng phía trên còn cũ.
- Ghi nguồn quyết định mới; nếu chưa chốt thì giữ nhãn đề xuất/cần hỏi. Không sửa lịch sử prompt thành bằng chứng đã kiểm.
- Giữ bảng tiến độ/owner/deadline trên Jira của team; không tạo một backlog cạnh tranh trong tài liệu này.
- Trước khi giao FE: danh sách màn, điểm điều hướng, component dùng chung, dữ liệu/trạng thái giả cần thay và phần UI còn chờ review. Nếu có ảnh, ghi màn/vai trò/ngày; thay ảnh khi flow đổi. Không cần chụp mọi modal.
- Nếu publish được giao: ghi ngày cập nhật public, mở mới và thử một hành trình chính. Không kết luận public mới chỉ từ thông báo publish thành công.

Mẫu báo cáo ngắn gửi nhóm:

```text
Đợt vừa làm: ...
Đã sửa/thêm: ...
Đã thử trên preview/public: [các bước + kết quả]
Còn lỗi/chưa kiểm: ...
Cần chốt với team: [nếu có, kèm nguồn và lựa chọn]
Lượt tiếp theo: ...
File Make: ... | Bản ghi hiện trạng: ...
```

Tài liệu bàn giao giữ cách làm và thứ tự; hiện trạng sống ở current-state, nghiệp vụ sống ở nguồn product/FR đã được team chốt. Khi bàn giao tiếp, gửi cả ba phần để người nhận hiểu **đang ở đâu, phải làm gì và vì sao làm như vậy**.

## 9. Review thế nào để không bỏ sót flow?

### Trước khi mở preview

Chọn phạm vi một lượt và viết ca thử từ FR/AC, không chỉ từ những nút Make đã dựng. Cách này giúp phát hiện cả màn thiếu, quyền sai hoặc lối đi không có, thay vì chỉ xác nhận các nút đang thấy là bấm được.

Mỗi hành trình cần ba góc nhìn: **người được phép làm**, **người không được phép**, và **đổi trạng thái sau thao tác**. Chọn nhánh lỗi có ảnh hưởng trực tiếp, chẳng hạn hủy share, gửi lỗi, hết giờ hoặc mất quyền; chưa cần thử mọi tổ hợp sự cố cho bản draft.

Ví dụ, review “host tạm” không dừng ở tên host mới. Cần kiểm chính người xem được bầu có công cụ; host cũ mất công cụ; hoàn quyền thu lại công cụ của host tạm; phòng/mic/camera không tự đổi sai. Review “freeze nhóm” phải vào nhóm thật trong prototype rồi thao tác vẽ/resume, không chỉ nhìn toolbar.

### Bốn vòng review cho mỗi đợt

1. **Độ phủ và đường đi:** điểm vào ở đâu, bấm qua được các bước không, hủy/quay lại đi đâu, trạng thái rỗng/lỗi có đường tiếp tục không. Đối chiếu mục tiêu FR để nhận ra phần chưa được dựng.
2. **Nghiệp vụ và quyền:** ai làm được, ảnh hưởng mình/nhóm/cả lớp, nguồn hình/âm thanh/chat thuộc đâu; đổi host/phòng/quyền có thu trạng thái cũ không. Đây là ưu tiên cao nhất cùng lỗi cản thao tác.
3. **Trình bày:** tên nút có dễ hiểu không, nội dung có xuống dòng/cắt mất không, vị trí điều khiển ổn định không. Kiểm panel mở và đóng; avatar không co giãn thành thanh dài, chat không đè composer, vùng share vẫn đọc được.
4. **Hồi quy:** chạy lại ca vừa sửa và một luồng lân cận dùng chung component/state. Nếu thay role toàn cục, kiểm MAIN và panel nhóm; nếu thay composer, kiểm TEXT/DM/chat họp; nếu chỉ sửa câu chữ, không cần lặp toàn bộ hệ thống.

Không xem thông báo “đã sửa” của Make là kết quả review. Nếu chỉ đọc được ảnh mà chưa thao tác được, ghi “đã thấy/chưa kiểm tương tác”. Nếu không nghe được âm thanh thật trong prototype, chỉ xác nhận nhãn/phạm vi mô phỏng, không kết luận isolation đã đạt.

### Ghi kết quả để người khác kiểm lại được

Với mỗi lỗi đáng sửa, dùng mẫu sau; tránh nhận xét chung như “chat đang lỗi” hoặc “flow chưa hợp lý”:

```text
Màn / phiên bản: preview hay public, ngày kiểm
Vai trò và trạng thái đầu: ...
Bước tái hiện: 1. ... 2. ... 3. ...
Mong đợi: ... [nguồn FR/quy tắc liên quan]
Thực tế: ...
Ảnh: ... [nếu cần minh họa, không thay bước tái hiện]
Ảnh hưởng: cản thao tác / sai nghiệp vụ / khó hiểu / trình bày nhỏ
Sau sửa: đã kiểm lại ...; còn chưa kiểm ...
```

Thử lại từ trạng thái đầu xác định, tránh lấy state còn sót của ca trước làm lỗi sản phẩm. Nếu không có thao tác reset demo, mở preview mới sau khi đã lưu ghi chú; việc tải lại có thể mất dữ liệu mẫu trong bộ nhớ. Không reset/xóa dữ liệu tài khoản hoặc dự án để làm sạch prototype.

### Phân loại để tiết kiệm thời gian và credit

| Mức                          | Ví dụ                                                                                                                  | Cách xử lý                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Cần sửa trước khi chốt luồng | Host tạm không có control; member thấy nội dung không có quyền; không vào/rời nhóm được; ACTIVITY nhận nhầm nguồn MAIN | Ghi ca tái hiện, sửa rồi kiểm lại trước khi coi hành trình đạt                                 |
| Cần làm rõ trước bàn giao FE | Thiếu đường vào lời mời hoặc bản ghi; nhãn mic/phòng dễ gây hiểu nhầm; hủy dialog mất ngữ cảnh                         | Bổ sung trong đợt tương ứng, hoặc ghi rõ phần chưa xong để người phụ trách quyết định kế hoạch |
| Gom chỉnh cuối               | Chữ “hai nhóm” khi chọn ba, spacing/icon chưa đều nhưng vẫn đọc và thao tác được                                       | Gom E2; không tiêu từng lượt Make chỉ cho một lỗi nhỏ                                          |

Lỗi khác nghiệp vụ đã chốt thì yêu cầu sửa. Điểm chỉ là sở thích bố cục thì nêu đề xuất và tác dụng, không gọi là lỗi bắt buộc. Khi hai nguồn mâu thuẫn, ghi “cần chốt” thay vì dùng ý riêng làm tiêu chí pass/fail.

**Điểm dừng của review draft:** hành trình chính dễ hiểu, thao tác được, đúng vai trò/phòng/nguồn và có ghi nhận phần còn thiếu. Không mở rộng thành kiểm thử backend, tải 25/50 người, bảo mật URL thật hoặc mọi edge case. Các phần đó thuộc task triển khai/PoC riêng.

## 10. Browser và Figma: tránh lặp lại sự cố truy cập

### Bài học từ phiên làm việc này

Đã có lúc AI nhận lỗi “Local browser use is disabled in Work settings”, trong khi người dùng đưa ảnh cho thấy tùy chọn **Browser** đang bật. Đã có lúc Chrome không gắn được phiên điều khiển, hoặc thao tác trên app/native chỉ đọc được màn hình mà chưa đổi trạng thái preview ổn định. Sau đó, trình duyệt tích hợp (IAB) thao tác được preview.

Không đủ bằng chứng để quy tất cả lỗi trên về một cài đặt. Tùy chọn Browser trong ảnh mô tả trình duyệt tích hợp; nó không tự chứng minh mọi đường điều khiển Chrome/app đều đã hoạt động. Người tiếp nhận cần thử đúng công cụ hiện có và báo kết quả, không lặp lại yêu cầu người dùng “bật browser” chỉ dựa trên lỗi của lần trước.

### Chọn đúng nơi kiểm

| Nơi mở                                               | Dùng để làm gì                                                              | Điểm cần lưu ý                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Make editor cùng file hiện hành                      | Xem yêu cầu/code prototype, gửi prompt khi được giao và mở preview mới nhất | Nhìn màn editor hoặc thông báo hoàn tất chưa phải đã kiểm ứng dụng                                   |
| Preview từ editor, ưu tiên mở thành tab riêng khi có | Thử tương tác bản vừa sửa, vào LIVE/nhóm và kiểm các trạng thái             | Đường dẫn preview có thể đổi; lấy link đang có trong editor, không tự ghép hoặc dùng mã tab cũ       |
| Public đã publish                                    | Thử bản team sẽ mở bằng link chia sẻ                                        | Có thể chưa nhận bản mới; so một thay đổi dễ nhận biết trước khi review                              |
| Figma app/native                                     | Xem file/editor hoặc dùng khi browser không khả dụng                        | Chỉ dùng kết quả bấm nếu đã xác nhận màn đổi đúng; ảnh đọc được không chứng minh thao tác thành công |

### Quy trình xử lý khi công cụ báo không truy cập được

1. **Kiểm tra lại công cụ ở phiên hiện tại.** Xem có browser/native/connector nào thực sự dùng được, đọc hướng dẫn công cụ rồi lấy danh sách app/tab hoặc trạng thái mới. Không suy khả năng hiện tại từ lỗi của phiên trước. Với CUA, dùng API được tài liệu công cụ cho phép; không dùng chỉ số phần tử/tab đã lưu từ phiên cũ.
2. **Xác định đang mở đúng gì.** Là editor, preview hay public? Đúng file CoLearnia không? Có hộp Share/đăng nhập che nội dung không? Nếu cần người dùng tự đăng nhập, dừng ở bước đó và nói chính xác màn đang chặn.
3. **Thử một thao tác ít ảnh hưởng và xem kết quả.** Ví dụ mở/đóng panel chat hoặc mở kênh LIVE tới lobby, lấy trạng thái/ảnh mới rồi mới bấm tiếp. Nếu không đổi, chưa được gọi là đã test flow; đừng tiếp tục chuỗi click theo tọa độ cũ.
4. **Nếu Chrome không gắn được, thử trình duyệt tích hợp nếu công cụ có hỗ trợ.** Mở file/preview đã quan sát được trong IAB rồi kiểm lại. Không cần yêu cầu người dùng bật lại cùng cài đặt nhiều lần khi đã có bằng chứng nó bật. Trong phiên này IAB là đường đã dùng được; đó không phải bảo đảm cho mọi máy/phiên sau.
5. **Nếu tab hoặc phần tử hết hiệu lực, lấy lại trạng thái.** Chọn lại tab đúng hoặc mở lại URL hợp lệ đang có. Đọc giao diện mới trước hành động kế tiếp; không dùng lại handle/chỉ số từ bản ghi bàn giao.
6. **Nếu người dùng đang thao tác cùng browser, tránh nhập nhầm.** Dừng ngay khi tab/trang đích đổi bất ngờ. Xác nhận lại đúng tab trước khi nhập, đặc biệt trước gửi prompt. Chỉ nhờ người dùng tạm để nguyên tab khi thực sự cần dùng chung bề mặt đó.
7. **Nếu vẫn không dùng được, báo giới hạn cụ thể.** Ghi công cụ nào, lỗi nguyên văn, bước đã thử và phần chưa kiểm. Có thể tiếp tục đối chiếu tài liệu/ảnh, nhưng không kết luận tương tác đạt. Nhờ người dùng thử một ca cụ thể hoặc cung cấp kết quả khi cần; không đoán thêm tên menu/công tắc chưa xác minh.

Không tự đổi quyền/cài đặt bảo mật, cài extension, xóa cache/cookie hoặc dùng đường tự động hóa khác để né việc browser chưa được cấp quyền. Nếu cần đổi cấu hình, nêu lý do và chỉ dẫn dựa trên giao diện/tài liệu đã kiểm, để người dùng thực hiện phần cấp quyền.

### Cách tránh kiểm nhầm bản cũ

Trước mỗi đợt review, ghi **ngày + Make preview/public + thay đổi nhận diện**. Ví dụ ở lượt 05/11, camera tắt ở prejoin và form nhóm không có duyệt là các dấu hiệu có thể đối chiếu với bản sửa. Đây chỉ là dấu hiệu nhận phiên bản, không thay việc kiểm cả flow.

Nếu preview đúng nhưng public khác, ghi “public chưa đồng bộ”, không gửi prompt sửa lại tính năng đã đúng trên preview. Publish là hành động riêng khi được giao; sau publish mở mới public và thử lại. Đường dẫn preview tạm không dùng thay link Make trong bàn giao lâu dài.

### Trước khi nhập prompt vào editor

- Đúng file Make và đúng ô nhập yêu cầu; đã đọc màn hiện tại, không nhập theo tọa độ cũ.
- Nội dung prompt đã review, phạm vi rõ và người thực hiện có quyền/credit để gửi.
- Không có tab/hộp thoại khác đang nhận focus. Nếu không chắc, dừng và kiểm lại; đừng gửi nhiều lần để “thử xem”.
- Sau gửi, chờ trạng thái xử lý hoàn tất, mở preview mới và review theo mục 9. Không gửi lại chỉ vì tab preview cũ chưa tự cập nhật.
