# Capacity, ổn định và giới hạn vận hành bản đầu

**Baseline bổ sung ngày 01/11/2026, đã được người dùng đồng ý về định hướng.** Tài liệu này sở hữu profile thử tải và cách công bố capacity; [plan](technical-plan.md) giữ quality targets, [live session](product/live-session.md) giữ quyền/media và [integrity DB](database/integrity-and-migrations.md) giữ transaction/khóa/quota. Đây là thiết kế đích, chưa có bằng chứng chạy đạt các profile.

## 1. Mục tiêu và điều được công bố

- Giữ profile 5 người ở plan 14.1 làm gate PoC chức năng ban đầu, gồm mic/camera/share, hai mode nhóm và TURN.
- Tăng tải 10 → **25 người trong một LIVE** là mốc hướng tới kiểm chứng trước; **50 người** là mốc thử mở rộng khi 25 đạt. Chưa đặt 25/50 thành lời hứa phát hành hoặc ngầm giảm điều kiện kiểm.
- 100 người trong báo cáo review là kịch bản phân tích trước đây, không là mục tiêu bắt buộc của đợt hiện tại.
- Chỉ công bố mức cao nhất có bằng chứng về chức năng, chất lượng và ổn định, kèm cấu hình server/browser/mạng, số nguồn mic/camera/share, camera nhận và bố trí nhóm. Một LIVE đạt không chứng minh nhiều LIVE cùng mức chạy đồng thời.
- Nếu chỉ đạt mức thấp hơn, ghi đúng kết quả và nguyên nhân. Không đổi số config rồi coi là đã hỗ trợ; không hạ isolation hoặc bỏ chức năng chính để đạt số người.

## 2. Media theo nhu cầu xem

Trải nghiệm đích: khi share, nội dung lớn và camera ở sidebar; danh sách participant vẫn đủ người có quyền. Camera nhận có chọn lọc theo viewport/pin, thử khởi đầu tối đa 4 camera từ xa/client. Đây là giới hạn nhận để thử và điều chỉnh sau đo, không là giới hạn số người được bật camera, không thêm role người xem/chỉ host được phát biểu.

Server kiểm cả quyền lẫn nhu cầu nhận trước tạo/resume Consumer. Khi không còn xem, điều chỉnh Consumer thật bằng pause/close theo lifecycle và đo tài nguyên còn giữ; không chỉ display:none. Chọn layer/chất lượng nếu cấu hình codec đã được kiểm; chưa bắt buộc simulcast/SVC phức tạp. Đổi tile/layout/pin là runtime/client, không ghi MongoDB theo từng thay đổi. Audio có đường chọn/nhận riêng, không bị tắt chỉ vì camera ngoài viewport; vẫn giữ MAIN/DISCUSSION/ACTIVITY/help isolation.

Giữ một app process, một mediasoup worker/WebRtcServer và một Router/LIVE cho PoC bản đầu. Chưa thêm pool nhiều worker hoặc Router/group. Nếu worker thành nút thắt sau subscription/bitrate tuning, review topology theo số đo; thêm worker không tự chia cùng Router lên nhiều lõi.

## 3. Các cơ chế ổn định bắt buộc khi triển khai

| Phạm vi                    | Yêu cầu triển khai / bằng chứng                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admission và hàng đợi      | Giới hạn queue depth/in-flight/bytes theo scope và toàn process, có deadline/hủy và phản hồi bận rõ. Giá trị cụ thể phải có trong config/contract được review trước handler; không queue vô hạn hoặc tự drop lệnh quyền quan trọng. Đo wait/hold/depth và cách recovery.       |
| DB                         | Tái sử dụng connection pool qua Mongoose/driver; đặt giới hạn pool/wait/query deadline và buffering policy trước workload tích hợp. Không một connection/user, không tăng pool để che gate tuần tự; không ghi heartbeat/preview/track vào DB.                                  |
| Lock và transaction        | Giữ Workspace gate bảo toàn ACL trong MVP; vùng commit ngắn, không chờ upload/client. Có số đo contention; nhánh text-only root chỉ insert đơn khi không có invariant nhiều document. Tách khóa/counter/version chưa đo theo mục 4, không tự bỏ barrier để tăng throughput.    |
| Event và board             | Fanout chỉ audience hiện tại, batch/throttle preview lossy và giới hạn payload; stroke commit vẫn ack/dedupe/sequence. Batch query displayName/metadata, không DB query cho từng recipient hoặc điểm vẽ; cache quyền phải invalidation cùng revoke, không chỉ TTL.             |
| File và background cleanup | Stream bounded, reservation trước ghi, kiểm quyền/version lại trước bind. Sweeper idempotent/batch, nhả gate giữa lô để foreground không bị chiếm; không upload/nén ảnh/scan disk dài trong mutation queue. Tác vụ JS CPU nặng chỉ tách worker pool nếu đo event-loop bị chặn. |
| Retry và lỗi               | Timeout/backoff có jitter, retry có giới hạn theo loại lệnh; không replay lệnh quyền cũ. Unknown commit read-back/resync; không nhân tin/file hoặc báo thành công giả.                                                                                                         |
| Đo và vận hành             | Đo event-loop lag, DB duration/query count/pool wait, gate wait/hold/depth, worker CPU/RAM/Consumer/egress, file/quota/cleanup lag và denies. Mỗi ngưỡng overload phải có hành vi kiểm chứng được.                                                                             |

Đường thu quyền/ending phải có chỗ xử lý ưu tiên hoặc hủy pending cấp quyền khi quá tải; không để hàng đợi chat/file đầy ngăn deny barrier. Chi tiết admission/config được kiểm bằng ca overload + revoke, không chỉ kiểm throughput.

**Không bổ sung Redis, job broker, Node worker pool, nhiều app instance hoặc sharding trong bước này.** Redis chỉ được cân nhắc cho nhu cầu cache/jobs/coordination có bằng chứng và task riêng; không thay media SFU hoặc tự phục hồi runtime. Node worker và mediasoup worker là hai cơ chế khác nhau. Giữ adapter media/file rõ ràng để có thể thay topology/kho private sau này mà không đổi ACL.

## 4. Findings DB: quyết định hiện tại và cổng kiểm chứng

Giữ 13 collection, field, index invariants và lifecycle đã review. Đợt này không thêm counter quota, grant version hoặc đổi cách lưu. Các đường tối ưu phải có task/test riêng nếu cần.

| Chủ đề              | Baseline bản đầu                                                                                                        | Điều phải kiểm và khi nào xem lại                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace gate      | Giữ để serialize quyền/commit liên quan; thêm instrumentation và queue bounded                                          | Đo chat + upload + join/deadline cùng Workspace. Nếu gate làm trễ quality target hoặc queue tăng liên tục ở profile thử, chưa công bố profile; thiết kế coordination hẹp hơn rồi chạy lại revoke/race.                                                                                                                  |
| Quota upload        | Aggregate metadata/reservation dưới gate, giữ byte DELETE_PENDING tới khi dọn                                           | Đo trên lịch sử files cũ; nếu scan chiếm thời gian gate đáng kể/vi phạm mục tiêu, đề xuất counter used/reserved nguyên tử + reconcile. Không tự thêm nguồn quota thứ hai.                                                                                                                                               |
| Authorization stamp | Giữ stamp membership/channel revision bảo thủ của bước 6, không reauthorize STAGED cũ                                   | Có test add/remove người khác khi upload để ghi tỷ lệ stale. Nếu ảnh hưởng thao tác hợp lệ, thu hẹp version theo membership/grant trong task schema/policy có review; giữ chống revoke/re-add. Chưa chọn field thay thế.                                                                                                |
| Frame budget        | Mỗi ảnh vẫn tối đa 2 MiB/1920×1080; 20 MiB/session là cấu hình thử profile nhỏ, không là cấu hình đã xác nhận cho 25/50 | Trước profile lớn, khai báo số board tối đa của fixture và tính frame active + reservation + frame cũ chờ dọn theo per-board/session/server. Config hữu hạn cần được review trước chạy; nếu quota không đủ thì thử phải báo lỗi đúng hoặc chưa đạt, không tự cấp vượt quota. Không đổi DB schema/retention để cứu test. |
| Truy vấn/index      | Cursor, projection/batch author và ACL hiện tại; 34 index tùy biến là bộ đích cần xác minh                              | explain trên dữ liệu cũ, query count và write cost. Không coi mỗi reference là một query riêng; không bỏ unique để benchmark đẹp.                                                                                                                                                                                       |

Thư viện hash, input limits thiếu, retention audit/metadata và nhánh host không có ứng viên/host tạm mất mạng vẫn theo [decision-status](decision-status.md). Các điểm này không được giả chốt bởi việc thống nhất capacity.

## 5. Profile và bằng chứng nghiệm thu

Các số camera/mic/nhóm bên dưới là **fixture khởi đầu để thử**, không phải cắt quyền hoặc mức hỗ trợ đã đạt. PoC phải ghi chính xác người đang bật nguồn, người đang phát tiếng, nguồn được subscribe và Consumer thực, kể cả paused.

| Profile                 | Nội dung                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-05 · chức năng        | Theo plan 14.1: 1 host + 2 nhóm ×2, chạy riêng DISCUSSION/ACTIVITY, camera đủ, screen và forced TURN, 30 phút/hai mạng/browser đã chỉ định.                                                                                                                                                    |
| C-10 → C-25 · mốc chính | Tăng 10 rồi 25 participant. MAIN thử 5/10 camera bật, 1/3/5 mic phát tiếng và một screen; tối đa 4 camera từ xa/client là cấu hình thử. Chia nhóm ví dụ 1 host MAIN +4 nhóm ×6; kiểm cả DISCUSSION kế thừa/cấm share và ACTIVITY có nguồn độc lập, host help, leave và tự về MAIN khi hết giờ. |
| C-50 · mở rộng          | Chỉ sau C-25 đạt; thử 50 với 10/20 camera bật, 1/3/5 mic phát tiếng, một MAIN screen; fixture chia nhóm ví dụ 1 host +7 nhóm ×7. Không suy C-50 MAIN đạt thì C-50 nhóm cũng đạt.                                                                                                               |
| Tải kết hợp             | Dữ liệu cũ: thử 10.000 rồi 100.000 messages, 1.000 rồi 10.000 file metadata/byte hợp lệ trong DB test cô lập. 10→20 message/giây tổng và burst 100 tin/5 giây là mức stress đề xuất; có upload, freeze nhiều board, sweep và DB chậm cùng media.                                               |
| Chuyển tiếp và lỗi      | Burst join/reconnect, tranh share, revoke khi upload, đổi nhóm, deadline đồng thời, disk đầy, DB lỗi, worker/app restart. Queue phải hồi phục, không rò quyền, không nhân dữ liệu hoặc giữ resource vô hạn.                                                                                    |
| Soak                    | Sau PoC chức năng, thử tải kết hợp khoảng 60 phút trên profile muốn công bố, thêm vòng join/leave; báo xu hướng RAM/resource/cleanup thay vì chỉ ảnh chụp một thời điểm. Thời lượng này chưa chứng minh ổn định dài hạn.                                                                       |

Giữ Q-01–08 và T-01–14 trong plan làm tiêu chí đầu vào; đo riêng trên mỗi profile, không tự hạ ngưỡng. Safety/ACL sai là chặn phát hành bất kể p95. Khi không đạt quality target ở profile lớn, ghi chưa đạt và tune/review ngưỡng có lý do trước công bố, không âm thầm đổi kết quả.

PR/evidence cần: commit, config hữu hạn/version thực, máy và browser/network, topology, số nguồn/Consumer, workload/fixture, p50/p95/p99 và lỗi, CPU/RAM/network, pool/queue/quota/cleanup, phạm vi đã/chưa thử. 100 socket hoặc tab trên một laptop không chứng minh 100 media client; tách DB/control load script khỏi thử browser/RTP thật. Không cần dựng 100 người để nghiệm thu mục tiêu hiện tại.

Mẫu công bố sau khi có bằng chứng: “Đã kiểm chứng một LIVE N người trên cấu hình X, số nguồn Y, tối đa K camera từ xa/client, bố trí nhóm Z, thời gian T và điều kiện mạng được ghi trong báo cáo.” Không điền N=25/50 trước khi chạy đạt.

## 6. Docker MongoDB và giới hạn bản đầu

Local chạy **mongo:8.0.16 bằng Docker Compose**, database colearnia, replica set rs0 một node, named volume mongo-data. Service mongo-init chạy [init-replica-set.js](../infra/mongo/init-replica-set.js), chỉ khởi tạo rs0/chờ primary, không tạo 13 collection nghiệp vụ. Đây là cấu hình trong repo, không xác nhận container đang chạy ở thời điểm đọc.

Một VPS/một app process là topology thử ban đầu. DB/media/TURN/file chia sẻ tài nguyên phải được đo cùng nhau. Replica set một node không chịu mất host; volume tồn tại qua recreate container thông thường nhưng không thay backup ngoài máy. Xóa volume có thể mất dữ liệu. Local chưa auth và chỉ publish loopback, không đem nguyên cấu hình local mở Internet.

Chấp nhận giới hạn bản đầu: app/worker restart làm kết thúc LIVE, không phục hồi nhóm/board/media từ DB; deploy khi đã drain/không có phiên sống. Health/readiness phản ánh lỗi thật. Chưa có zero-downtime/HA; muốn thêm app replicas hoặc giữ phiên qua crash cần quyết định kiến trúc riêng. Không mua/chốt VPS theo profile 2 vCPU/4 GiB chỉ vì có trong plan; đó là máy thử, chưa chứng minh C-25/C-50.

Xem [local runbook](runbooks/local-development.md) để khởi động MongoDB và [plan vận hành](technical-plan.md#17-triển-khai-và-vận-hành) về staging/TLS/auth/backup/restore. Đợt tài liệu này không start/stop Docker, sửa Compose, chạy migration hoặc đổi dependency.
