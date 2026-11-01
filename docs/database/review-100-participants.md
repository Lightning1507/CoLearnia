# Review database và tính khả thi của LIVE 100 người

**Ngày:** 01/11/2026. **Trạng thái:** review và đề xuất; chưa sửa baseline, schema, runtime, migration, quota hoặc giới hạn phát hành. Đầu vào mới từ người dùng: một LIVE khoảng 100 người, dùng như Google Meet, không phải tất cả cùng bật mic/camera; khi share, nội dung lớn và ô người tham gia ở bên cạnh. Số camera đang bật, số camera được nhận, số mic đồng thời và cấu hình máy chưa chốt.

Đây là review của agent, gồm xem lại chính những lựa chọn đã đề xuất trước đó; không phải đánh giá độc lập của thành viên thứ hai. Không có benchmark DB/media trong đợt này. Các phép tính là mô hình tải minh họa, không là kết quả đo.

**Quyết định sau review:** người dùng đã chọn hướng 25 người là mốc thử trước, 50 là mở rộng có điều kiện. [Capacity hiện hành](../capacity.md) sở hữu baseline; các tính toán 100 người và đề xuất trong báo cáo này giữ làm lịch sử phân tích, không tự ghi đè gate/aggregate/stamp hoặc quota hiện hành.

## 1. Kết luận

**MongoDB vẫn phù hợp để triển khai tiếp; chưa có lý do kỹ thuật từ mục tiêu 100 người để đổi DB hoặc thêm sharding. Nhưng thiết kế điều phối và vận hành hiện tại chưa đủ bằng chứng để cam kết LIVE 100 người.**

13 collection không phải vấn đề chính: message/member/file được tách để không có mảng tăng vô hạn, scope nhỏ được nhúng, khóa retry và PRIVATE rejoin có cơ sở. Không cần viết lại toàn bộ collection chỉ vì một phiên tăng lên 100 participant. MongoDB khuyến nghị chọn nhúng/tham chiếu theo truy vấn, mức tăng và tần suất ghi; có reference không tự biến mô hình thành “SQL sai cách”. [MongoDB modeling](https://www.mongodb.com/docs/manual/data-modeling/best-practices/).

Điểm yếu thực tế là gate chung qua I/O DB, quota tính lại theo lịch sử file, ngân sách frame theo session, đường đọc/fanout chưa định lượng và một máy chia sẻ DB–app–SFU–TURN–disk. Với đội 5 người/4 tuần, không nên vừa xây mọi feature vừa hứa tương đương năng lực Google Meet. 100 người là mục tiêu capacity cần spike và evidence riêng, không phải đổi con số trong config.

Review bước 6 trước đó chủ yếu kiểm nhất quán nghiệp vụ/thiết kế. “Hoàn thành thiết kế để giao task” không đồng nghĩa kiến trúc đã được kiểm chứng cho tải 100 người.

## 2. Học gì từ Google Meet, và giới hạn suy luận

Google mô tả Sidebar là nội dung/người nói chính lớn và thumbnail người tham gia ở bên; Auto điều chỉnh theo cửa sổ, người tham gia và có presentation. [Google Meet layouts](https://support.google.com/meet/answer/10550593?hl=en-GB).

Google cũng có cấu hình chất lượng gửi/nhận, chế độ single feed tắt thumbnail, và video tự giảm chất lượng khi mạng thiếu băng thông. [Video settings](https://support.google.com/meet/answer/9302964/change-your-computer%E2%80%99s-video-and-audio-settings-computer?co=GENIE.Platform%3DDesktop&hl=en-GB), [network guidance](https://knowledge.workspace.google.com/admin/meet/prepare-your-network-for-meet-meetings-and-live-streams). Học cách phân bổ tài nguyên theo nhu cầu xem và ưu tiên nội dung là hợp lý.

**Đề xuất cho CoLearnia, chưa là quyết định sản phẩm mới:**

- Presentation chiếm vùng chính; sidebar chỉ nhận/render một tập camera phù hợp viewport và cấu hình thử. Người còn lại vẫn hiện trong danh sách, không bị loại khỏi cuộc họp.
- Thay đổi tile/pin/chất lượng là runtime/UI, không ghi MongoDB mỗi lần thay.
- Media adapter chọn Consumer/chất lượng thật; không chỉ thu nhỏ hoặc display:none 99 video đã nhận.
- Tập camera nhận có thể ít hơn số người đang bật camera; không đồng nhất “quyền bật camera” với “mọi client phải nhận camera đó”.
- Audio có chính sách riêng; ẩn camera không được làm mất tiếng người hợp lệ đang nói. Cần đo audio Consumer, mute/DTX và số người nói cùng lúc, không tự đặt quy tắc chỉ host được nói.
- Không cần sao chép tính năng AI, co-host, Meet API, hoặc toàn bộ cơ chế nội bộ Google. Các hướng dẫn UI không chứng minh chính xác topology server hoặc database của Meet.

## 3. Findings theo mức ảnh hưởng

P1 = cần giải quyết/kiểm chứng trước khi cam kết 100 người, không có nghĩa phải xây hệ phân tán ngay. P2 = rủi ro thiết kế/triển khai cần xử lý theo workload, không khẳng định đã có lỗi production.

### R100-01 · P1 — Baseline và media topology chưa tương ứng mục tiêu mới

**Nguồn:** [plan 14.1](../technical-plan.md#141-workload-nghiệm-thu), [ADR-001](../adr/001-media-foundation.md), [media runtime](../../apps/server/src/live/media/runtime.ts). Baseline chỉ yêu cầu thử 5, mở rộng đo 10/12; code mới có factory worker/router, chưa là cuộc gọi 100 người.

Một Router/session thuộc một worker, nên thêm CPU không tự chia cùng phiên sang nhiều lõi. Theo mediasoup, capacity phụ thuộc CPU/Consumer; tài liệu có ví dụ cỡ vài trăm Consumer, không phải bảo đảm một số participant cố định. Cần đo trước khi chọn một/nhiều Router/worker. [mediasoup scalability](https://mediasoup.org/documentation/v3/scalability/).

Ví dụ riêng cho tính toán: 100 người, mỗi người nhận tối đa 4 camera từ xa → tối đa 400 video Consumer; một screen tới 99 người → thêm 99; chỉ một nguồn mic tới 99 người → thêm 99. Tổng có thể tới 598 Consumer ngay cả khi không ai xem 99 camera. Camera tắt và mic mute có thể giảm traffic, nhưng nếu tạo trước mọi Consumer rồi pause, số object/tài nguyên không tự bằng 0.

**Đề xuất:** xác định workload bằng số nguồn và số Consumer/bitrate, không bằng số tài khoản kết nối. PoC 100 signaling socket không thay thử RTP thật. Giữ camera trong scope; thử giới hạn nhận theo viewport trước khi nghiên cứu chia Router. Nếu không đạt, review topology hoặc SFU thay thế theo quy trình thay đổi, không đổ vấn đề media cho MongoDB.

### R100-02 · P1 — Một Workspace gate serialize cả chat/file qua DB commit

**Nguồn:** [integrity 4.1–4.2](integrity-and-migrations.md#41-cơ-chế-chung). Chat của nhóm A, DM của B và thao tác cấu trúc có thể chờ cùng gate, ngay cả khi dữ liệu tách biệt; một Workspace còn có nhiều kênh/LIVE.

Nếu mỗi lần giữ gate mất trung bình 50 ms, trần tuần tự minh họa chỉ khoảng 20 mutation/giây; một burst 100 mutation phải xếp hàng khoảng 5 giây để xử lý hết, chưa tính mạng/retry. Đây là giả định để thấy rủi ro, không phải số đo MongoDB. Tăng connection pool không làm các thao tác đang chờ mutex chạy song song.

**Đề xuất:** giữ gate làm phương án MVP có đo, thêm queue length/wait/hold time, deadline và backpressure; không gọi đây là thiết kế scale đã xác nhận. Chỉ giữ vùng commit thật ngắn. Tin root text-only không attachment/counter/audit quyền chéo có thể chỉ cần insertOne + unique, sau ACL dưới cơ chế bảo vệ hiện hành; không bắt mọi tin vào multi-document transaction.

Nếu đo không đạt, tách điều phối ACL độc quyền với các thao tác độc lập được chạy đồng thời, và serialize theo conversation khi thực sự cần. Phải chứng minh revoke vẫn chặn write/fanout cũ; không chỉ xóa gate hoặc đổi tên mutex. Đây là thay đổi cần thiết kế/race test riêng, chưa áp dụng ở review này.

### R100-03 · P1 — Quota frame 20 MiB/session không khớp nhiều nhóm

**Nguồn:** [plan 13.2](../technical-plan.md#132-cấu-hình-khởi-đầu), [quota](integrity-and-migrations.md#43-quota-và-upload). Mỗi frame tối đa 2 MiB, tổng tạm phiên 20 MiB, còn phải tính reservation và byte chờ dọn.

Kịch bản minh họa 100 người chia 20 nhóm ×5: riêng 20 frame nhóm ở mức tối đa đã là 40 MiB; MAIN nếu còn frame thêm 2 MiB. Không bảo đảm 20 nhóm đều freeze được khi quota chỉ 20 MiB. Mốc 40/42 là phép tính biên, không khẳng định mọi ảnh luôn 2 MiB.

Một frame MAIN 2 MiB được 99 người tải tạo 198 MiB payload download; có thể tranh egress với media dù DB chỉ có một metadata record. File I/O/network là một phần capacity của freeze.

**Đề xuất:** ngân sách theo board đang mở + tổng session + toàn server/in-flight, có nén ảnh và đo chất lượng; dự trù frame cũ chờ dọn. Chọn giá trị sau PoC và số nhóm dự kiến, không tự nâng quota vô hạn hoặc hứa p95 freeze hiện tại cho 100 người.

### R100-04 · P2 — Aggregate quota lặp theo số file làm chi phí tăng theo lịch sử

**Nguồn:** [integrity 4.3](integrity-and-migrations.md#43-quota-và-upload). Mỗi reservation tính lại byte/reserved từ files trong Workspace dưới gate. Index workspaceId thu hẹp phạm vi nhưng không biến phép cộng tất cả file liên quan thành O(1). Byte quota không giới hạn số metadata nhỏ hoặc DELETE_PENDING.

**Đề xuất:** benchmark bằng lịch sử files cũ, không chỉ DB trắng. Nếu scan chiếm đáng kể thời gian gate, dùng counter used/reserved cập nhật nguyên tử cùng file transition, kèm reconcile định kỳ. Có thể là field trên document sở hữu quota hoặc bản ghi quota theo scope; chưa cần collection mới ngay. Counter cũng có contention và crash/retry invariant, không là sửa miễn phí. Chỉ bổ sung sau quyết định kỹ thuật có test, không coi aggregate hiện tại chắc chắn thất bại ở 100 người.

### R100-05 · P2 — Stamp channel revision làm upload của người không liên quan bị hủy

**Nguồn:** [files.authorization](collection-design.md#310-files), [grant revision](collection-design.md#37-channelaccessgrants). Add/remove/re-add bất kỳ grant tăng revision kênh; mọi upload trong kênh chụp revision đó. Owner thêm một bạn có thể làm upload của 20 người khác bị stale dù quyền họ không đổi.

Đây là đánh đổi bảo thủ đã ghi ở bước 6, nhưng trải nghiệm kém hơn khi nhiều người hoạt động đồng thời. Nó bảo vệ quyền, song phạm vi invalidation quá rộng.

**Đề xuất:** giữ chặn upload trước revoke/rejoin; xem xét version theo đúng membership/grant bị tác động thay vì mọi mutation kênh. Version cấu hình hiển thị không nên làm hủy file. Chốt field version sau spike/race test; không tự bỏ stamp hay để re-add cứu callback cũ. READY vẫn tải theo ACL hiện tại như đã chốt.

### R100-06 · P2 — Chưa có ngân sách query cho read/fanout

**Nguồn:** [query shapes bước 4](collection-design.md#4-truy-vấn-chính-định-hình-document), [policy/architecture](../architecture.md). Có mô tả các lớp ACL, nhưng chưa có cách thực hiện/budget query cho history, danh sách thành viên, sender displayName và fanout 100 người.

Nếu hydrate tác giả từng tin, 50 tin có thể thành 50 query user. Nếu đọc membership DB cho từng recipient hoặc từng preview, fanout nhân tải. Đây là bẫy implementation chưa được phòng bằng query plan cụ thể, không phải lỗi code đã tồn tại.

**Đề xuất:** batch theo user IDs, projection và lean cho read-only; phân trang/cursor đúng filter; query count instrumentation. Runtime audience đã xác thực dùng revision/deny barrier và invalidation, không query DB cho từng RTP/điểm vẽ/heartbeat. Không dùng cache quyền có TTL đơn thuần để trì hoãn revoke. Không tự snapshot tên vào mọi message nếu batch query đã đủ.

34 index tùy biến không tự quá nhiều, cũng không chứng minh tối ưu. Xét từng collection/query, giữ unique invariants, đo keys/docs examined, sort và write cost. Mỗi write chỉ cập nhật các index liên quan trên collection đó, không phải cả 34 index. [MongoDB query optimization](https://www.mongodb.com/docs/manual/core/query-optimization/).

### R100-07 · P1 cho vận hành ổn định — Một failure domain cho cả DB/file/app/media

**Nguồn:** [topology](../technical-plan.md#171-topology-bản-đầu), [lifecycle](lifecycle.md), [Compose](../../docker-compose.yml). Một VPS, Mongo replica set một node, file local và nhóm/board trong RAM.

Một node hỗ trợ môi trường dev/transaction của baseline nhưng không có bản sao trên máy khác để chịu mất host. majority trên một node không tạo thêm bản sao vật lý. Backup cũng không phải automatic failover. [MongoDB replication](https://www.mongodb.com/docs/manual/replication/).

Mất/restart app kết thúc cả phiên theo thiết kế; 100 người phải vào lại. Thêm app replicas ngay sẽ phá khóa RAM/audience/call ownership. Container worker riêng CPU không đồng nghĩa tách failure domain nếu cùng host.

**Đề xuất:** MVP có thể chấp nhận restart-end-session nhưng cần nói rõ với team; nếu mục tiêu sau này yêu cầu giữ lớp khi app rolling deploy/crash thì phải thiết kế lại session ownership/recovery, không chỉ chuyển DB sang managed. Đo tài nguyên để cân nhắc tách DB/file trước khi tối ưu phân tán app. Số replica và backup theo availability/budget, không theo riêng con số 100. File service dùng storage abstraction để sau này chuyển kho private mà giữ ACL; không biến file thành public URL để giảm tải.

### R100-08 · P1 trước cam kết capacity — Thiếu workload, backpressure và bằng chứng tải kết hợp

**Nguồn:** [DB-01–12](integrity-and-migrations.md#7-ma-trận-kiểm-thử-trước-nghiệm-thu-implementation), [database connector](../../apps/server/src/lib/database.ts), [plan 13.2/14](../technical-plan.md#14-kiểm-thử-và-tiêu-chí-hoàn-thành). Matrix DB hiện nặng correctness/race; chưa thành benchmark 100 người với dữ liệu cũ và media cùng máy. Connector hiện mới có serverSelectionTimeoutMS; chưa có pool wait/query deadline/buffering policy vận hành theo workload.

Limiter chat 5 tin/giây/user cho 100 người cho phép mức trần dài hạn tới 500 tin/giây trước limiter scope, không kể burst; nó là mức cho phép, không phải server đã chịu được. Mongo pool không phải mỗi participant một connection; pool size phải đo theo query concurrency/CPU và timeout, không đặt 100 chỉ vì có 100 người. [Driver pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/).

**Đề xuất:** giới hạn queue/rate/bytes theo session và server, phản hồi bận rõ, client backoff có jitter; job cleanup batch nhả gate và nhường foreground. Không để queue vô hạn rồi hết RAM. Kiểm mất ack sau message commit bằng history/retry đã có; Socket.IO mặc định không bảo đảm replay mọi event khi mất kết nối. [Socket.IO delivery](https://socket.io/docs/v4/delivery-guarantees/). Không cần thêm durable broker/outbox trước khi có yêu cầu bền ngoài history.

## 4. Phần nên giữ, phần nên đơn giản hóa

| Giữ                                      | Điều kiện / tránh làm quá                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| MongoDB/Mongoose, 13 collection có nguồn | Không thêm sharding/microservices chỉ để có “tầm nhìn”; chưa có bằng chứng cần đổi DB.                                            |
| Messages riêng, cursor, dedupe           | Root text-only có thể dùng write đơn; transaction nơi có invariant nhiều document.                                                |
| Membership incarnation + PRIVATE grants  | Tối ưu query/version nhưng giữ thu quyền ngay và rejoin không hồi grant.                                                          |
| RAM cho cursor/preview/media objects     | Không persist từng event; nhóm/round recovery bền là quyết định khác nếu sau này cần.                                             |
| File metadata tách byte                  | Reserve/cleanup đúng, bổ sung query budget và đường di chuyển kho khi cần.                                                        |
| Kiểm Zod + Mongoose + Mongo validator    | Shared constants/test để tránh ba bản semantics lệch; DB tập trung invariant cấu trúc, service giữ cross-reference/ACL.           |
| OwnerId và role cập nhật nguyên tử       | Không thêm unique ownerId toàn hệ thống hoặc quay lại unique role chuyển key chưa kiểm. Chưa cần redesign owner chỉ vì 100 người. |
| Index/migration có kiểm chứng            | Migration runner tối thiểu, checklist đúng rủi ro; không xây framework migration trước schema đầu tiên.                           |

## 5. Workload thử nghiệm đề xuất, chưa phải cam kết

Chọn máy/region/DB topology/browser/codec/bitrate và budget trước khi so kết quả. Các lượng dưới là fixture đề xuất, không phải giới hạn sản phẩm được người dùng chốt.

| Profile              | Workload và điều cần quan sát                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W-01 · Dữ liệu cũ    | 100 membership; thử 10.000 rồi 100.000 messages, 1.000 rồi 10.000 file metadata có trạng thái hợp lệ, không giả có byte để làm quota sai. History cùng/khác người gửi; index/query counts/quota scan.    |
| W-02 · Join          | Tăng 10→25→50→100 participant; thử ramp và burst 100 trong 10 giây. Đo wait/hold gate, ticket, DB pool, time-to-first-media; socket join không thay RTP.                                                 |
| W-03 · MAIN như Meet | 100 kết nối; lần lượt 5/10/20 camera bật, 1/3/5 mic đang phát tiếng, một screen. Thử K=4 camera từ xa/client rồi đổi viewport; avatar không Consumer; audio không bị mất do ẩn camera.                   |
| W-04 · Chat/upload   | 10 rồi 20 message/giây tổng trong một Workspace, thêm burst 100 tin/5 giây. Chạy text-only, reply, ảnh, quota sát ngưỡng và revoke/re-add lúc upload; queue phải có giới hạn và không lỗi quyền.         |
| W-05 · ACTIVITY      | 10 nhóm ×10 rồi 20 nhóm ×5 là phép chia tải minh họa; chạy nguồn/audio/camera theo scope, nhiều share riêng và nhiều board freeze. Chốt cách bố trí host theo policy khi dựng fixture thực.              |
| W-06 · Deadline      | Cùng hết giờ, về MAIN, pause mic, đóng nguồn và khóa history nhóm; gate/session queue không kẹt vì hàng trăm DB writes. Không cần persist mọi participant trong một transaction lớn trước khi thu media. |
| W-07 · Board         | Một MAIN board nhiều người vẽ và nhiều board nhóm nhỏ; preview lossy có backpressure; stroke commit có ack/sequence và snapshot lọc quyền. Không ghi điểm vẽ vào DB.                                     |
| W-08 · Lỗi/vận hành  | 30 reconnect gần nhau, DB chậm, disk sát đầy, cleanup backlog, worker/app restart; xác nhận giới hạn recovery đã công bố, không giả phiên sống vì metadata còn.                                          |
| W-09 · Soak          | Chạy tải kết hợp ít nhất một buổi 60 phút đề xuất, thêm join/leave/revoke; quan sát resource slope và cleanup. Thời gian này để thử, không chứng minh ổn định dài hạn.                                   |

Một trần preview 20 batch/giây/user không là workload trung bình. Nếu cả 100 người đều preview ở MAIN: 2.000 input batch/giây, có thể tới 198.000 lượt gửi recipient/giây nếu naïve fanout 99 người/event. Batch/throttle/audience nhỏ thay đổi chi phí, cần đo chứ không dựa một limit/client.

Metrics tối thiểu: p50/p95/p99 của chat/history/join/freeze/leave; DB duration và query count; gate wait/hold/depth; transaction abort/retry; pool wait/timeouts; event-loop lag; worker CPU/Consumer/producer/transport; egress/RTT/loss; file bytes/reservation/orphan/cleanup lag; denied/stale đúng quyền. Giữ mục tiêu Q-01–07 làm đầu vào, chưa tự mở rộng lời hứa p95 của profile 5 lên profile 100.

Máy tải phải tạo media thật và có nhiều client/thiết bị đại diện; 100 tab một laptop có thể đo giới hạn laptop trước server. Test DB/control-plane có thể dùng clients script, nhưng không được đổi tên thành nghiệm thu Meet-like video 100 người.

## 6. Thứ tự đầu tư thực tế cho nhóm

1. Giữ baseline collection và triển khai một lát cắt schema + PRIVATE/DM + message/upload có correctness test, đồng thời làm spike media như Meet. Không hoàn thiện mọi UI mới bắt đầu thử camera.
2. Đo gate/quota/query trên dữ liệu đủ lớn và burst; sửa R100-02/04/05 theo bằng chứng trước khi đóng các service thành nhiều lớp khó thay.
3. Đo MAIN và ACTIVITY 25/50/100; quyết định subscription/camera quality, frame budgets và topology sau số đo.
4. Chọn mô hình deploy/budget/availability đúng mục tiêu; sau đó cập nhật plan/ADR/schema/DBML có review. Tách data-plane và control-plane theo nhu cầu, không tự thêm Redis/Kafka/Kubernetes.
5. Chỉ công bố “hỗ trợ 100 người” cho profile đã thử, nêu số nguồn camera/mic/share, giới hạn thiết bị/mạng và cách xử lý overload. Nhiều LIVE 100 người đồng thời là mục tiêu khác, không suy từ một phiên.

Các findings là đề xuất review, chưa thay đổi quyết định hiện hành. Chưa chạy DB-01–12 hoặc benchmark/media PoC, chưa sửa schema/code/config, chưa commit. Google Meet là tham khảo trải nghiệm và nguyên tắc phân bổ tài nguyên; không dùng năng lực hạ tầng của Google làm bằng chứng cho CoLearnia.
