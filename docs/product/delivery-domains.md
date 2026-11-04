# Gom FR thành miền phụ trách — bước 1

**Ngày:** 02/11/2026. **Trạng thái:** đề xuất chia phạm vi để team review; chưa gán người/reviewer, chưa estimate, chưa tạo Issues hoặc chốt sprint. Giữ nguyên scope. Nhãn M1–M5 chỉ là tên gọi trong bản phân chia, không là mã task hoặc phân công A–E trong plan.

## Cơ sở và nguyên tắc

Dựa trên [57 FR](functional-requirements.md), [backlog](backlog-draft.md) và [ranh giới trạng thái trong kiến trúc](../architecture.md). Một người dự kiến phụ trách một miền xuyên FE–BE–dữ liệu/kiểm thử, tự chuẩn bị proposal, API/contract dự kiến, task sơ bộ và estimate. Người phụ trách chính chịu trách nhiệm đầu ra của miền, không có nghĩa tự làm mọi phần tích hợp mà không cần bên khác.

Các miền là phân chia công việc trong cùng ứng dụng/monorepo, không phải 5 microservice, 5 database hoặc 5 kiến trúc tự chọn. Dùng chung technical plan, contracts, MongoDB và quy tắc quyền. Test/review do từng miền chịu; không có một người chỉ làm tester hoặc ghép toàn bộ dự án vào cuối kỳ.

Khung thời gian người dùng hiện đề nghị là **6–7 tuần**, phần lớn code có AI hỗ trợ; chưa có ngày kickoff/nộp, số giờ thực/người hoặc estimate. Các mốc 4 tuần phát triển chính + thời gian hoàn thiện trong tài liệu trước là mục tiêu tham khảo, chưa chứng minh khối lượng vừa. Tích hợp, PoC và staging bắt đầu sớm; không đợi hết các proposal hoặc hết giai đoạn code mới ghép.

## Đề xuất 5 miền

| Miền                                          | Kết quả chịu trách nhiệm chính                                                                   | FR chính                                                        | Số FR |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----- |
| **M1 · Tài khoản, Workspace và quyền kênh**   | Người dùng đăng nhập, tạo/vào Workspace, quản lý thành viên và kênh đúng quyền                   | FR-01-01–06; FR-02-01–07; FR-03-01–04                           | 17    |
| **M2 · Hội thoại, tin nhắn và tệp**           | Chat TEXT/DM/thread/cuộc họp, file và xem lại video đúng quyền                                   | FR-04-01–04; FR-09-01–02; FR-12-01–02; FR-13-01–02; FR-15-03    | 11    |
| **M3 · Trải nghiệm cuộc gọi, media và audio** | Lobby/call/mic/camera/share/audio và pipeline recording MAIN                                     | FR-05-01–05; FR-08-01–02; FR-15-01–02                           | 9     |
| **M4 · Vòng đời phiên, host và nhóm**         | Session/host, DISCUSSION/ACTIVITY, hỗ trợ, deadline, chuyển phòng và đồng bộ quyền khi reconnect | FR-07-01–06/08–09; FR-09-03; FR-10-01; FR-11-01–03; FR-14-01–02 | 15    |
| **M5 · Board, freeze và vẽ**                  | Host vẽ LIVE tại MAIN; nhóm cùng freeze/vẽ/resume đúng nguồn và context                          | FR-06-01–05                                                     | 5     |

**57/57 FR có một miền phụ trách chính.** Các phần tích hợp có người phối hợp bên dưới, không đếm lại thành FR mới. Số FR chỉ kiểm độ phủ, không dùng để chia đều effort. Các miền hiện là phương án để thảo luận, chưa thể nói 5 người đã cân tải.

### M1 · Tài khoản, Workspace và quyền kênh

- **Phần sản phẩm:** form đăng ký/đăng nhập, hồ sơ tên hiển thị/avatar và đổi mật khẩu, khôi phục trạng thái đăng nhập/đăng xuất; danh sách Workspace, tạo/đổi tên/xóa; invitation; thành viên/role; tạo/đổi tên/xóa TEXT/LIVE và quản lý PRIVATE. UI Workspace/sidebar và các màn quản trị thuộc miền này; nội dung hội thoại do M2, vùng cuộc gọi do M3.
- **Trạng thái/dữ liệu:** danh tính, phiên xác thực, Workspace, membership, invitation, channel và PRIVATE access theo thiết kế DB. Sở hữu cách kiểm quyền Workspace/kênh, không sở hữu quyền nghe mọi nhóm vì có admin.
- **Cần cung cấp:** contract danh tính/phiên; tra quyền membership/channel hiện hành; luồng thu quyền khi logout/kick/gỡ PRIVATE/xóa; ngữ cảnh kênh để M2/M3 mở đúng khu vực.
- **Cần nhận:** cách tạo conversation CHANNEL từ M2 trong transaction tạo general; cách chặn/dọn tài nguyên đang mở từ M2/M4 (M4 phối hợp M3/M5). Thành công CRUD chưa đủ nếu nội dung/media cũ vẫn được cấp sau revoke.
- **Proposal cần tập trung:** transaction tạo Workspace/general, quyền owner/admin, bootstrap auth/CSRF và ranh giới revoke DB/runtime. Không tự viết schema của tất cả miền chỉ vì phụ trách nền MongoDB.
- **Demo miền:** một người tạo Workspace, mời người khác, tạo TEXT/LIVE/PRIVATE; người được cấp mở được, người chưa được cấp bị chặn; thu quyền tác động phiên đang dùng.

### M2 · Hội thoại, tin nhắn và tệp

- **Phần sản phẩm:** dòng tin/composer/lịch sử, DM list, thread panel, chat họp Everyone/Host và trả lời riêng; upload/download ảnh/file, pending/error/retry. Component chat họp gắn vào shell M3; không tự dựng một trang cuộc gọi thứ hai.
- **Trạng thái/dữ liệu:** conversation/message/reply/dedupe, attachment/file metadata và vòng đời byte. Cùng nền chat/file, khác ACL CHANNEL/DIRECT/SESSION/GROUP/HOST_PRIVATE. File FRAME vẫn thuộc dịch vụ file nhưng context/intent do M5 quyết định.
- **Cần cung cấp:** chức năng tạo/đọc/gửi hội thoại, phân trang, retry nhất quán, upload/bind/tải file có kiểm quyền và dọn byte; giao diện component chat cho M1/M3 tích hợp.
- **Cần nhận:** identity và channel access từ M1; session/group/host/audience hiện hành và thông báo đóng scope từ M4; intent/frame reference hợp lệ từ M5. Không tin scope/host client khai, không mở lịch sử riêng theo host mới.
- **Proposal cần tập trung:** dùng chung message/file service, tạo general nguyên tử với M1, file bind một đích, thu stream/event khi mất quyền. Không bắt DM phụ thuộc SessionRuntime hoặc ghi dữ liệu chat bền vào RAM thay MongoDB.
- **Demo miền:** chat TEXT có ảnh/file, retry không trùng, thread không trôi dòng chính, DM chỉ hai bên; sau đó chat họp đúng phòng/nhóm và host, tải ảnh/file bị chặn sau revoke.

### M3 · Trải nghiệm cuộc gọi, media và audio

- **Phần sản phẩm:** lobby/chọn thiết bị, trang cuộc gọi và call controller duy trì khi xem Workspace; camera/share stage, danh sách participant và panel slot, nút mic/camera/share/rời, volume. Nhúng panel nhóm/host M4, chat M2, board M5 vào cùng shell.
- **Trạng thái kỹ thuật:** worker/Router/transports/Producers/Consumers, source/share registry và tài nguyên đang tạo; track/audio graph và lựa chọn camera nhận ở client. Dùng đúng topology baseline, không tạo Router cho mỗi nhóm hoặc thêm worker pool theo cách chia người.
- **Cần cung cấp:** khả năng tạo/đóng media, đổi tập nguồn được nhận theo policy, bắt đầu/dừng share đúng scope, stats và lỗi thiết bị/media; nguồn video/source revision cho M5 chụp/vẽ.
- **Cần nhận:** participant/session epoch/call ownership, quyết định quyền publish/consume và chuyển phạm vi từ M4; quyền vào kênh từ M1 qua luồng phiên. M3 không tạo group membership/host thứ hai trong media registry.
- **Proposal cần tập trung:** signaling/pending resource cleanup, picker/hủy share, nguồn đồng thời MAIN/ACTIVITY, reconnect transport, audio routing và TURN. FR-08-02 giao miền này phụ trách kết quả audio; M4 cung cấp quyền và thao tác announcement, không dựng bus tiếng riêng.
- **Demo miền:** mic/camera/share thật 5 người, qua hai mạng/forced TURN; người bận nguồn không bị giành share; đổi scope thu Consumer thật; khi mở chat/Workspace không ngắt call hoặc nhân đôi tiếng.

### M4 · Vòng đời phiên, host và nhóm

- **Phần sản phẩm:** UI/tạo/Vào nhóm, host chuyển quyền/kết thúc cuộc họp, chuẩn bị/phân ACTIVITY, countdown, tự vào lại đúng ACTIVITY đã phân/về MAIN, đóng DISCUSSION, host vào/rời hỗ trợ ACTIVITY và thao tác hướng dẫn chung; DISCUSSION chỉ hỏi/trả lời riêng khi host ở MAIN. Các control nằm trong shell M3, không triển khai lại thiết bị/media.
- **Trạng thái/dữ liệu:** SessionRuntime, participant/call generation/epoch, host và host tạm, group/round/deadline/phase, session mutation queue, runtime policy và projection. Sở hữu điều phối chuyển scope/cleanup; session/participant metadata bền theo nguồn DB, không phục hồi grant từ metadata. M4 quyết định khi nào cần tạo/đóng hội thoại phiên/nhóm và gọi chức năng M2; schema, truy vấn và thao tác conversation/message/file do M2 sở hữu, không có repository conversation thứ hai trong M4.
- **Cần cung cấp:** contract vào/rời/resync/kết thúc phiên, policy/projection hiện hành, hành vi chuyển scope/host/deadline; cách yêu cầu M2/M3/M5 thu tài nguyên trước khi cấp quyền mới.
- **Cần nhận:** auth/channel access và revoke từ M1; lifecycle thực của media từ M3, chat/file từ M2 và board từ M5. Queue không chờ người dùng chọn màn hình/upload/client ack lâu.
- **Proposal cần tập trung:** một nguồn state/quyền, thứ tự mutation, eligible roster khác membership, rollback partial ACTIVITY, deadline và reconnect không phục hồi nhóm cũ. FR-11 là trách nhiệm điều phối kết quả phục hồi, không có nghĩa tự code lại mọi retry của chat/board/media.
- **Demo miền:** tạo nhóm chưa cấp private trước join; DISCUSSION và ACTIVITY không cùng active; host chỉ vào hỗ trợ ACTIVITY, từ chối DISCUSSION; DISCUSSION còn người cho vào lại, người cuối cùng chủ động rời thì tự đóng; hết giờ tự về MAIN/pause mic. Kiểm cùng M3/M2/M5, không dùng mock media để kết luận isolation đạt.

### M5 · Board, freeze và vẽ

- **Phần sản phẩm:** overlay/canvas, bút/màu/nét thường hoặc tự biến mất ở MAIN, undo/clear; freeze/resume và trạng thái frame/nét chung trong DISCUSSION/ACTIVITY. Nhúng vào stage M3, không sở hữu lại nguồn share hoặc cuộc gọi.
- **Trạng thái/dữ liệu:** board context/version/intent/frame reference/stroke sequence/author; tọa độ và rendering; log/snapshot runtime. Không tạo collection nét hoặc file FRAME MAIN.
- **Cần cung cấp:** thao tác board có quyền/context/source, snapshot và xử lý lệnh stale; kết thúc context khi nhóm đóng/resume; thu quyền và tài nguyên riêng của người rời mà không xóa board chung còn được dùng; xóa overlay MAIN khi nguồn MAIN đổi/dừng, nhưng giữ frame nhóm đã FROZEN hợp lệ khi nguồn trực tiếp đổi/dừng; từ chối freeze commit đang chờ nếu nguồn đổi; ảnh canvas được phép chụp để M2 gửi như attachment riêng.
- **Cần nhận:** video/source revision từ M3; host/scope/audience và barrier lifecycle từ M4; upload/private file/bind/dọn byte từ M2. M5 quản lý refs/context, M2 quản lý byte, không có hai quy trình upload cạnh tranh.
- **Proposal cần tập trung:** MAIN host-only, frame race, resize/letterbox, intent không giữ queue khi chờ I/O, upload lỗi và stale/reconnect. Thời gian/fade nét tạm còn chờ chốt; không tự chọn giá trị sản phẩm.
- **Demo miền:** host vẽ khi người khác share tại MAIN; member bị chặn; hai nhóm dừng hình độc lập, audio tiếp tục, undo/clear đúng quyền, resume tới live hiện tại; nguồn MAIN dừng xóa overlay, frame nhóm hợp lệ không bị xóa nhầm.

## Các điểm giao nhau phải review trước code phụ thuộc

Bảng dưới chỉ chốt trách nhiệm/semantics cần thống nhất. Tên endpoint/event, payload Zod, đường dẫn module và thứ tự PR sẽ do các proposal cụ thể hóa theo baseline.

| Điểm giao                           | Đầu mối và bên phối hợp                                                        | Ranh giới để không làm trùng / bỏ sót                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tạo general                         | M1 chính, M2 phối hợp                                                          | M1 điều phối transaction tạo Workspace/membership/channel/conversation; M2 cung cấp phần conversation/schema dùng chung. Không tạo general bằng request sau rồi chấp nhận lỗi một nửa.              |
| Auth và thu quyền Workspace/PRIVATE | M1 chính về quyền ngoài phiên; M4 về runtime phiên, M2 về hội thoại/file       | M1 phát sinh thay đổi quyền; từng miền chặn tài nguyên mình sở hữu. M4 gọi cleanup M3/M5 theo thứ tự nguồn; một deny barrier/chính sách hiệu lực, không chỉ ẩn UI.                                  |
| Vào LIVE / chuyển call              | M3 phụ trách trải nghiệm FR-05; M4 phụ trách trạng thái phiên/call ownership   | M4 giữ ticket/participant/host/epoch/generation và điều phối quyền; M3 dựng track/transport sau quyết định hợp lệ. Không có hai call registry hoặc hai cơ chế gán host.                             |
| Share và nguồn nhận                 | M3 chính về tài nguyên/registry; M4 quyết định quyền, scope và thứ tự mutation | M3 không coi source label là quyền; M4 không thao tác trực tiếp từng object mediasoup thay adapter. Lease độc quyền theo scope được phối hợp trong mutation hợp lệ, không giữ queue khi chờ picker. |
| Host hỗ trợ / announcement          | M4 chính về host/scope/action; M3 về audio/media; M2 về chat                   | Host vào hỗ trợ không có nghĩa đọc tất cả chat riêng. Rời chủ động khác cleanup tự động; một audio graph theo policy, không phát cùng mic vào nhóm và MAIN.                                         |
| Chat họp                            | M2 chính, M4 cung cấp scope/host/audience, M3 cấp panel slot                   | M2 kiểm audience hiện hành trước gửi/bind/fanout; host mới không nhận lịch sử người cũ. Không nhân chat họp thành DM Workspace hay tự broadcast Everyone toàn session.                              |
| Freeze/frame                        | M5 chính về intent/context, M3 cung cấp nguồn; M2 upload/file, M4 quyền phiên  | Chụp/upload ngoài queue, commit kiểm lại context/quyền/source. M2 không tự cho file READY làm frame có quyền; M5 không phục vụ byte bỏ qua ACL.                                                     |
| Kết thúc nhóm / hết giờ / về MAIN   | M4 chính, M2/M3/M5 cùng cleanup                                                | PB-07/10/14 dùng một vòng đời; callback trễ không đóng lượt mới. Chỉ báo hoàn thành khi thu quyền và chuyển scope xong; không tự mang ảnh/chat nhóm ra MAIN.                                        |
| Reconnect và resync                 | M4 chính về trạng thái/quyền; M3 kết nối/media; M2 message/file; M5 board      | M4 trả trạng thái hiện hành; mỗi miền reconcile tài nguyên/dedupe của mình. Không có một snapshot bỏ lọc quyền hoặc một task cuối kỳ “thêm reconnect cho tất cả”.                                   |

Policy là phần dùng chung có các quy tắc miền: M1 giữ membership/channel, M2 conversation/file, M4 runtime session/group, M5 board context/author. Proposal thống nhất cách gọi/ghép các predicate; bảng này không chuyển mọi ACL sang một người hoặc cho mỗi miền sao chép toàn policy.

### Đầu ra review mỗi điểm giao

Đầu mối trong bảng chuẩn bị bản contract dự kiến; người cung cấp và người sử dụng cùng review phần liên quan. Riêng luồng vào/rời phiên, share, chuyển nhóm và cleanup, M3–M4 phải review cùng nhau trước code phụ thuộc; M3 chủ trì phần media, M4 phần state/quyền. Không cần cả team duyệt mọi API.

Mỗi điểm giao chỉ cần ghi đủ các mục sau trong proposal hoặc Issue liên quan, rồi liên kết tới schema trong packages/contracts khi đã có:

- Bên cung cấp, bên gọi, người soạn và reviewer; với UI nêu component/shell nào tiếp nhận.
- Dữ liệu vào/ra, lỗi chính, quyền và trạng thái/version cần kiểm; interface nội bộ hoặc component cũng là contract, không bắt mọi giao điểm thành REST API.
- Bên gọi xử lý thế nào khi lỗi, hết hạn hoặc mất quyền; ai hủy pending/dọn tài nguyên. Bám lifecycle/lock order hiện hành, không tự chọn thứ tự mới trái baseline.
- Ít nhất một tình huống tích hợp quan sát được cùng ca từ chối/lỗi liên quan, để hai bên biết đã nối đúng chưa.
- Task cung cấp, task sử dụng và task kiểm tích hợp; mỗi task một owner, ghi dependency và phần AC bao phủ, chỉ dùng số Issue khi đã tạo thật.

**Ví dụ freeze nhóm, chưa là task đã giao:** M5 chủ trì luồng/context; M3 cung cấp nguồn video/source revision; M2 cung cấp upload/bind/file có ACL; M4 cung cấp quyền/scope hiện hành. Contract phải làm rõ intent/context/nguồn nào được nhận, kết quả upload và lỗi stale/deny. Có thể chia task nền file cho M2, task nguồn cho M3, task freeze cho M5 và ca tích hợp M5 chủ trì với các bên liên quan. Kiểm cả nhóm nhận cùng frame; đổi nguồn trước commit bị từ chối; nguồn đổi sau FROZEN không xóa frame hợp lệ; một người rời không xóa board của người còn lại. Không dùng mock để nghiệm thu tích hợp thật.

Task sơ bộ/estimate có thể viết ngay khi soạn proposal rồi điều chỉnh sau review. Bên dùng có thể dựng UI hoặc adapter bằng fixture theo contract dự kiến để tiến triển độc lập, nhưng phải ghi trạng thái mock và thay bằng luồng thật trước nghiệm thu. Khi đổi contract, cập nhật nguồn và báo các task dùng nó; không để mỗi bên giữ một payload khác nhau.

## Thứ tự xây dựng và tích hợp

Đây là hướng sắp xếp dependency để owner đề xuất task, không là sprint, ngày hoàn thành hoặc phân công người đã chốt. Phụ thuộc hai chiều của FR mô tả kết quả cuối, không buộc M3 chờ M4 hoàn thành mọi nhóm hoặc ngược lại.

| Chặng                      | Đầu ra để nối việc                                                                            | Trách nhiệm và điều kiện tiếp tục                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nền và interface tối thiểu | Identity/access, ID/error/envelope, contract vào/rời phiên, nguồn media và slot UI dùng chung | M1 chuẩn bị auth/Workspace/Mongo; M3–M4 thống nhất phiên/media tối thiểu; M2/M5 review phần mình dùng. Chọn đầu mối CI/staging khi giao người và tính effort vào miền đó. Không đợi toàn package contracts hoàn thiện mới bắt đầu.         |
| Luồng cơ bản và PoC        | Auth/Workspace/general với nền chat/file; vào MAIN, mic/camera/share thật                     | M1–M2 nối general theo transaction; M3–M4 dựng vòng đời phiên tối thiểu và PoC media 5 người. M5 chuẩn bị overlay/rendering, nối nguồn và file khi interface sẵn. PoC fixture vẫn phải tách khỏi nghiệm thu auth/quyền thật.               |
| Tích hợp nhóm và board     | DISCUSSION, ACTIVITY/deadline, hỗ trợ, chat đúng audience, freeze/vẽ/resume                   | M4 điều phối state, M3 routing/media, M2 hội thoại/file, M5 board. Demo từng phần ngay khi nối được; DM/thread và các màn quản trị có thể phát triển theo dependency riêng, không phải chờ toàn bộ nhóm.                                   |
| Hoàn thiện và đo tải       | Thu quyền/reconnect xuyên miền, lỗi tích hợp, staging/deploy và bằng chứng tải kết hợp        | Mỗi miền thêm xử lý lỗi, cleanup/reconnect và test ngay trong task liên quan; chặng này kiểm xuyên miền/khắc phục phần còn thiếu, không phải lúc mới bắt đầu các xử lý đó. Giữ gate PoC/capacity theo nguồn hiện hành, chưa cam kết 25/50. |

M3–M4 cùng review kết quả PoC trước khi cam kết estimate phần media/nhóm còn lại. Nếu effort M4 quá tải, phân việc hỗ trợ UI/adapter/kiểm tích hợp có đầu ra rõ cho người khác theo khả năng thực tế; một đầu mối vẫn giữ state phiên. Không mặc định chuyển toàn bộ phần chung sang M5, và không tự cắt FR.

## Công việc mở đường và phần chung

Chia miền vẫn phải bao phủ EN-01–04 trong [backlog](backlog-draft.md). Đây là đầu việc kỹ thuật/delivery để người phụ trách đưa vào proposal và estimate, không phát sinh thêm module nghiệp vụ hoặc người thứ sáu.

| Công việc                                                           | Đầu mối đề xuất                                                                                 | Phần phải phối hợp                                                                                                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nền MongoDB Docker, kết nối và cách chạy migration/index dùng chung | M1                                                                                              | Mỗi miền sở hữu schema/query/kiểm chứng của dữ liệu mình dùng theo thiết kế DB; M2 file/chat, M4 metadata phiên. M1 không viết hết DB cho cả team.                                             |
| Đồng bộ contracts nền, error/envelope và ID                         | M1 chuẩn bị phần identity/Workspace; M4 phần session/scope; M3 media; M2 message/file; M5 board | Bên gửi/nhận cùng review. Không giao nguyên package contracts cho một người rồi mọi miền chờ người đó viết API hộ.                                                                             |
| PoC media/nhóm/board 5 người                                        | M3 đầu mối media, M4 routing/policy                                                             | M5 freeze/vẽ, M2 ảnh/chat trong tải kết hợp; M1 identity/access khi tích hợp. Có thể dùng fixture cô lập trong PoC, không gọi fixture/mock là auth/isolation hoàn thành.                       |
| App CI, staging và quy trình build/deploy/rollback dùng chung       | Cần chỉ định đầu mối kỹ thuật ở bước 2; lead điều phối để không bị bỏ sót                       | M1 Mongo/config auth, M3 media/TURN/port/TLS, các miền còn lại cấu hình/health/check của mình. Chưa giao mặc định toàn bộ cho M5 hoặc cho lead tự làm hết. Chưa chọn dịch vụ hoặc mua hạ tầng. |
| UI/component dùng chung từ Figma                                    | M1 phối hợp M3 chốt shell Workspace/cuộc gọi; mỗi miền dùng và đóng góp component               | Một bộ typography/token/component/interface đã review. Figma Make là draft tham khảo, không tự đổi router/auth/library hoặc business rule theo code sinh ra.                                   |
| Demo, kiểm thử tích hợp và phát hành                                | Mỗi miền cung cấp bằng chứng; lead tổng hợp mốc demo                                            | Review chéo, các bên giao tiếp kiểm cùng. Không chờ một người test thay cả team; chưa tạo milestone/sprint hoặc lịch cam kết ở bước 1.                                                         |

Đầu mối CI/staging là điểm giao việc **còn phải điền ở bước 2**, không phải phần đã được phân công. Khi chọn người thật phải tính effort này cùng miền của họ; nếu quá tải thì điều chỉnh phạm vi trách nhiệm kỹ thuật, không tự cắt FR.

## Dùng Figma để team hiểu cùng một sản phẩm

Dùng [brief UI và file Figma Make hiện có](../ui/figma-make-brief.md), demo theo một hành trình: đăng nhập/chọn Workspace → chat TEXT/DM/thread → vào LIVE → share → DISCUSSION → ACTIVITY → hỗ trợ/về MAIN. Màn chưa có chỉ dẫn FR/UC và ghi rõ thiếu draft, không dựng thêm trong bước gom miền.

| Khu vực khi demo                                                  | Người chuẩn bị proposal cho miền nào |
| ----------------------------------------------------------------- | ------------------------------------ |
| Auth, sidebar, Workspace, thành viên, kênh/PRIVATE                | M1                                   |
| Nội dung chat, composer/ảnh/file, DM, thread, chat họp            | M2                                   |
| Lobby, share stage/camera/control bar, audio và mở/đóng panel     | M3                                   |
| Chuyển host, tạo/đóng nhóm, phân nhóm, countdown, hỗ trợ, về MAIN | M4                                   |
| Annotation MAIN, freeze/vẽ/resume nhóm                            | M5                                   |

UI vẽ trên cùng một trang có thể do nhiều miền cung cấp component; không đồng nghĩa chia người theo từng trang hoặc mỗi miền làm lại layout. Cần chốt interface cho panel/stage trước khi cùng sửa shell.

**Lưu ý bản mẫu:** Figma/ảnh/Astah minh họa cần áp ba thay đổi sau kickoff (DISCUSSION tự tạo, ACTIVITY random, recording MAIN). Không dùng bước duyệt cũ trên prototype để ghi đè nghiệp vụ hoặc kết luận media thật đã chạy.

## Review khả năng giao việc

- **M1** nhiều FR nhưng chủ yếu CRUD/quyền; vẫn nặng ở revoke/transaction và màn quản trị. Không mặc định AI khiến phần này rẻ.
- **M2** có nhiều nơi dùng chung, dễ trở thành nút chờ nếu API/file chưa thống nhất. Ưu tiên nền message/file, nhưng chat họp cần contract runtime M4, không chờ toàn bộ UI nhóm mới bắt đầu.
- **M3** ít FR hơn nhưng media/browser/network có độ bất định cao. Cần người muốn tìm hiểu WebRTC và review chéo M4, PoC trước khi hứa lịch.
- **M4** chứa nhiều state/quyền và phối hợp xuyên miền, là **điểm có nguy cơ quá tải lớn**. Nên có reviewer hiểu media/board; người khác hỗ trợ adapter/UI hoặc ca tích hợp đã có ranh giới khi estimate cho thấy quá tải, còn session state giữ một đầu mối chính.
- **M5** ít FR nhưng có canvas, frame race, source/version, file/ACL và phối hợp 3 miền. Không tự giao thêm toàn bộ FE hoặc QA chỉ vì số FR nhỏ.

Giữ 5 miền là phương án ban đầu; sau khi người thật review proposal/estimate có thể phân lại phần hỗ trợ hoặc ranh giới. Chưa thể khẳng định cân tải, hoàn thành trong 6–7 tuần, hay phân công cố định không được đổi.

## Ranh giới của bước tiếp theo

1. Team review cách gom này cùng Figma và xác nhận có miền nào quá rộng/thiếu hoặc phần giao nhau khó hiểu.
2. Chọn người phụ trách/reviewer, giờ làm thực tế và đầu mối CI/staging. Không suy người A–E trong technical plan đã là phân công mới.
3. Mỗi người chuẩn bị **proposal + API/contract dự kiến + task sơ bộ + estimate**, rồi các bên review contract và hoàn thiện task/estimate. Không đợi proposal hoàn hảo mới được ghi đầu việc hoặc ước lượng sơ bộ.
4. Sau review mới tổng hợp mốc demo/milestone/sprint và tạo Issues/Projects. Tài liệu này chỉ mô tả phạm vi trách nhiệm, không giữ tên người, trạng thái hoặc bảng tiến độ cạnh tranh GitHub.

## Điều chỉnh sau kickoff — recording và nhóm

- M4 cập nhật FR-07-03/04: DISCUSSION tự tạo khi hợp lệ, không host xét/hủy pending; FR-07-05 thêm random preview/chỉnh trước start.
- M3 chủ trì recording MAIN, sở hữu FR-15-01/02: capture/compose/encode, trạng thái và hoàn tất bản ghi; phối hợp M4 về quyền host/scope và kết thúc phiên.
- M2 sở hữu FR-15-03: danh sách/xem lại theo phiên/kênh, lưu/phục vụ byte đúng ACL; M1 cung cấp quyền hiện hành. M2–M3 thống nhất một owner metadata/schema, file lifecycle và lỗi/quota; không tách thành hai hệ lưu trữ.
- Tổng 57 FR: M1 17, M2 11, M3 9, M4 15, M5 5. Recording tăng tải M3/M2/M4; cần estimate lại và PoC sớm. Chưa gán tên người hoặc cam kết cân tải.
- Điểm giao recording cần ghi trong proposal: tập nguồn MAIN hiện hành, host hỗ trợ nhóm không bị ghi, control theo host hiện tại, chuyển trạng thái, quyền xem, lỗi storage/encode, cleanup và tải kết hợp. Demo clip vài phút; hướng pipeline/vòng đời theo quyết định 04/11; công cụ/quota/retention/quyền xóa cần PoC/contract.

Nguồn [recording](recording.md); không tự chọn thư viện hay thêm Redis/worker pool từ task tài liệu.

### Bổ sung hồ sơ ngày 03/11/2026

FR-01-04–06 do M1 phụ trách chính; M2 cung cấp nền file avatar và cleanup, không nhận thêm FR chính. Cập nhật 04/11: avatar lưu Cloudinary, công khai qua URL; chỉ chính chủ thay/xóa. M1 lưu metadata trên User, M2 phối hợp upload đã xác minh và cleanup; không dùng scope tin nhắn. Tổng hiện hành 57 FR: M1 17, M2 11, M3 9, M4 15, M5 5; cần tính thêm effort hỗ trợ M2 trong proposal của M2.
