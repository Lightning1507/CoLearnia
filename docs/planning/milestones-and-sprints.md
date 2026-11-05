# Milestone và kế hoạch 3 sprint

**Chốt khung ngày 05/11/2026:** 3 sprint, mỗi sprint 2 tuần; PM chốt ưu tiên và phân công, PR/contract vẫn cần reviewer. Sprint 1 có danh sách cụ thể tại [kế hoạch Sprint 1](sprint-1.md); Sprint 2–3 là dự kiến và được điều chỉnh theo kết quả thực chạy.

Tuần 1–2 / 3–4 / 5–6 tính từ ngày bắt đầu sprint trên Jira. Định hướng trước đó là bắt đầu thứ Sáu 06/11; chưa coi ngày báo cáo thực tế đã được cung cấp. Không tạo lịch/sprint trên Jira trong lượt tài liệu này. Jira giữ status/assignee/ngày; repo giữ mục tiêu, tiêu chí và cơ sở xếp việc.

Nguồn: [379 giờ việc chính Sprint 1](sprint-1.md), [247 task và estimate](task-consolidation.md), [FR/AC](../product/functional-requirements.md), [API/backend](../contracts/api-conventions.md), [capacity](../capacity.md). Không chia 1.378 giờ thành ba phần bằng nhau hoặc coi mỗi người có cùng tải chỉ vì số task giống nhau.

## 1. Ba milestone

| Mốc / thời điểm                                 | Sprint Goal                                                                                        | Tiêu chí nghiệm thu và demo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MS1 — Luồng đầu tiên chạy thật**, cuối tuần 2 | Người dùng đăng nhập, mở Workspace và sử dụng chat TEXT cùng cuộc gọi MAIN cơ bản trên staging.    | 1) Register tự đăng nhập, login/reload/logout và HTTP/socket từ chối phiên không hợp lệ. 2) Tạo Workspace/OWNER/general/conversation nguyên tử, rollback khi lỗi; tạo/mở kênh LIVE đúng quyền. 3) Hai danh tính có quyền gửi/đọc TEXT, retry không nhân tin, history/catch-up có kiểm ranh giới; người ngoài bị từ chối. 4) MAIN: lobby, mic/camera/share, một nguồn share tại một thời điểm, rời/end/revoke/resync tối thiểu; bộ kiểm 5 người, hai mạng và forced TURN có evidence. 5) PoC recording cố định và writer/sink có kết luận khả thi hoặc blocker cụ thể, chưa tuyên bố recording hoàn thành.                                                                                                                                      |
| **MS2 — Học nhóm tích hợp**, cuối tuần 4        | Lớp học được trong DISCUSSION và ACTIVITY, trao đổi và giải thích trên nguồn chia sẻ đúng phạm vi. | 1) Host transfer/tạm/hoàn quyền đúng quyết định; DISCUSSION auto-create/explicit join/close khi rỗng, không share và host không vào hỗ trợ. 2) ACTIVITY manual/random preview, start/partial failure, deadline tự về MAIN, vào lại đúng nhóm; help/announcement đúng audience. 3) Chat cuộc họp Everyone/Host, freeze/vẽ/resume nhóm, MAIN chỉ host vẽ; không rò media/chat/file/board giữa các phạm vi. 4) File/DM/thread và các luồng vào Workspace qua link được ghép; avatar/profile/password và quản trị quyền phát triển theo phụ thuộc, phần còn lại phải có task cụ thể trước MS3. 5) Mục tiêu recording là ghi MAIN → stop/end → R2/READY → xem/tua đúng quyền; chỉ chốt task pipeline sau PoC, ghi rõ phần chưa đạt nếu còn blocker. |
| **MS3 — MVP sẵn sàng báo cáo**, cuối tuần 6     | Team demo được một hành trình MVP xuyên suốt trên bản deploy đã kiểm, hiểu rõ giới hạn hệ thống.   | 1) Hoàn tất các FR trong scope, gồm quản trị/profile/avatar/password, thu quyền xuyên miền và recording; từng FR có AC/evidence tương ứng, không chỉ có UI. 2) F-05 đầy đủ theo capacity: 1 host + hai nhóm ×2, thử riêng DISCUSSION/ACTIVITY, camera/share, 30 phút/hai mạng/forced TURN và ca isolation. 3) Kiểm lỗi/reconnect/host/cleanup/restart, rollback app và giới hạn vận hành; người demo làm theo runbook không sửa DB thủ công. 4) Đo C-10→C-25; chỉ thử 50 nếu 25 đạt. Công bố đúng profile đã đạt, không lấy số mục tiêu làm năng lực đã có. 5) Hoàn thành kịch bản báo cáo, bản build/commit demo và danh sách giới hạn/lỗi còn lại.                                                                                           |

MS2 và MS3 là mục tiêu, không tự hạ tiêu chí khi thiếu thời gian. Nếu recording hoặc FR bắt buộc chưa đạt, milestone chưa đạt đầy đủ; PM xử lý lại kế hoạch với bằng chứng, không tự đánh dấu hoàn tất hoặc âm thầm bỏ tính năng. Không cam kết đạt 25/50 người trước đo tải; MVP chức năng và capacity là hai kết quả khác nhau.

Kịch bản trình bày MS1 khoảng 15–20 phút và danh sách evidence nằm tại [output/demo Sprint 1](sprint-1.md#7-output-và-kịch-bản-demo-cuối-sprint-1). PoC recording có checkpoint cuối tuần đầu: kết quả ban đầu hoặc blocker cụ thể; cuối sprint có kết luận trong timebox. Đây là mốc kiểm rủi ro, không yêu cầu video sản phẩm READY ngay tuần đầu.

### MS1 bao phủ tới đâu?

MS1 phát triển phần đầu FR-01-01–03, FR-02-01/02, FR-03-01/02, FR-04-01–03, FR-05-01/03/04/05, FR-07-02 và FR-11-01–03; không tự đánh dấu tất cả các FR này đã đủ AC. Ví dụ đổi tên Workspace, đính kèm, nhóm và takeover đầy đủ chưa thuộc demo MS1. Kết quả PoC recording là đầu vào FR-15, không là nghiệm thu FR-15-01–03.

Mời/gia nhập và danh sách quyền đầy đủ chưa xếp vào Sprint 1. Bộ dữ liệu kiểm 5 người có membership/kênh hợp lệ được chuẩn bị trong môi trường thử qua fixture kiểm thử của các task gate; không bypass auth hoặc mở quyền công khai để demo. Ghi rõ fixture trong evidence. Đến MS3, thành viên mới phải đi được bằng luồng sản phẩm, không nhờ người sửa DB. Lượt lập kế hoạch này không chạy seed hay thay dữ liệu.

**Gate MAIN của MS1 khác F-05:** chưa có hai mode nhóm hoặc bộ ca host nâng cao thì không tuyên bố đã đạt gate sản phẩm đầy đủ. Giới hạn và tính năng chưa triển khai phải hiện rõ trong demo; không thay bằng hành vi trái baseline.

## 2. Sprint 2–3: giữ thứ tự, chưa đóng toàn bộ ticket

| Miền | Sprint 2 — việc dự kiến cần trước                                                                                                                                                                             | Sprint 3 — hoàn thiện và kiểm chứng                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | Invitation/join và người dùng thật; member/role/PRIVATE; thu quyền, profile/avatar/password theo port M2/M4. Các T8/T9 mở đường tự gia nhập nên đi trước tính năng quản trị ít chặn miền khác.                | Hoàn tất delete/reconcile và các phần quản trị/profile còn lại sớm trong tuần 5; T15/T16 kiểm chéo/staging/runbook. Không dồn API quyền tới ngày demo.            |
| M2   | Upload/R2/stream và ACL → DM/thread → meeting chat/frame; avatar provider đi trước UI gắn ảnh. Recording metadata/writer/finalize sau kết luận G11.                                                           | READY/list/player/Range, cleanup/restart/quota và T10/T11 kiểm tích hợp/tải. Player do M2 cung cấp, M3 nhúng.                                                     |
| M3   | Media chuyển scope/help/host, source/reconcile/ICE/replacement còn lại; audio/board; recording spike động → pipeline khi đạt gate. UI/cấu hình tiếp tục có người hỗ trợ, không trả toàn bộ việc hỗ trợ về M3. | Recorder lifecycle/3 giờ, playback/revoke, camera demand và metrics/load; T15/T16/T17 hoàn thiện vận hành. Bắt đầu soak sớm khi pipeline đủ, không chờ ngày cuối. |
| M4   | Host transfer/tạm/hoàn quyền và takeover còn lại; DISCUSSION → ACTIVITY/deadline → help/announcement → recording lifecycle. Provider context trước consumer nhóm.                                             | Fault/restart/revoke xuyên nhóm/host, T11/T12 evidence, drain/rollback và phối hợp tải.                                                                           |
| M5   | Nếu chưa làm lượt E: normalizer/render/overlay trước; tiếp theo intent/runtime/ACL → handler/sync → frame M2 → hook/toolbar và capture gửi chat.                                                              | W10/W11 với source/context/file thật, sửa race/leak và bàn giao. Unit test vẫn đi cùng task, không chờ W10 mới viết.                                              |

Đầu tuần 3 dùng kết quả MS1 để chọn task cụ thể cho Sprint 2. Không chờ mọi chức năng của M1 hoặc mọi chức năng của M3 xong mới ghép nhóm. Task chưa đóng được payload/PoC chỉ nhận phạm vi khảo sát có timebox; implementation phụ thuộc chưa được kéo vào như việc sẵn sàng.

**Tích hợp mỗi tuần:** một luồng thật mới hoặc lỗi được tái hiện/khắc phục; staging từ Sprint 1. Bốn tuần đầu ưu tiên ra chức năng chính; Sprint 3 chủ yếu hoàn thiện, sửa lỗi, kiểm tải và báo cáo. Nếu giữa tuần 4 vẫn còn pipeline cốt lõi chưa triển khai, PM phải điều chỉnh kế hoạch ngay, không mặc định tuần 6 sẽ giải quyết hết.

## 3. Điều kiện Done dùng chung

- Đủ AC của **task**, có chỉ rõ FR nào mới được bao phủ một phần. Không đóng một FR chỉ vì xong một task con.
- Input/output/error đúng schema; bên cung cấp/bên dùng review interface thay đổi. Có ca success/deny/stale hoặc failure/cleanup phù hợp.
- Unit/service test đi cùng implementation; tích hợp thật có evidence và môi trường. Fixture/mock chỉ nghiệm thu phần thuần/port, không thay media/ACL/storage thật.
- PR được review; check theo phạm vi và `pnpm check` trước PR theo workflow. Không tắt check để kịp sprint.
- Có đường tái hiện, thay đổi cấu hình chỉ nêu tên biến; không secret/token hoặc nội dung private trong evidence.
- PoC Done khi hết timebox có kết quả/số đo/quyết định/blocker; feature liên quan chỉ Done khi đạt AC thật. Không kéo dài task cũ qua nhiều ngày mà không báo phạm vi còn lại.

## 4. Effort, review và rủi ro lịch

WBS hiện có **1.180 giờ cơ sở +198 giờ dự phòng =1.378 giờ**, chưa bao gồm toàn bộ công PM và chuẩn bị báo cáo chung. Với 5 người/6 tuần, trung bình khoảng **46 giờ/người/tuần** cho riêng estimate này; không thể gọi là vừa một kế hoạch 40 giờ/tuần rồi bỏ qua phần chênh. Đây là số dự kiến, không phải giờ thực đã đo hoặc yêu cầu làm thêm giờ mặc định.

PM đã xác nhận team ưu tiên dự án; không mở lại khảo sát khả năng tham gia. Vẫn giữ nguyên con số để theo dõi thực tế: phân lại task, giảm chờ, dùng kết quả PoC để ước lượng lại; không tự giảm giờ nhờ AI hoặc tăng giờ làm để làm đẹp kế hoạch. [Sprint 1](sprint-1.md#2-khối-lượng-và-phân-công) ghi tải từng người và ngân sách review/PM; số liệu này phải được đối chiếu từ tuần đầu.

Dành review hằng ngày, không đợi cuối sprint. Ưu tiên review contract/provider trên đường chặn; tác giả không tự approve. Vấn đề kéo dài, môi trường thiếu quyền hoặc nguy cơ vượt estimate phải báo ngay với đầu ra đã có, giờ đã dùng, phần thiếu và người cần xử lý. PM có thể đổi người hỗ trợ/thứ tự task nhưng không bỏ AC quyền/isolation.

## 5. Demo/báo cáo và nhịp theo dõi

S06 trong WBS được cụ thể hóa thành ba task chuẩn bị chung, không nhân lại runbook/evidence từng miền:

| Mã kế hoạch, chưa là mã Jira | Kết quả                                                                                                                 | Giờ | Người thực hiện / review | Phụ thuộc                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --: | ------------------------ | --------------------------------------------------------------------------------- |
| DEMO-01                      | Chốt kịch bản 10–15 phút, ai thao tác/ai giải thích, FR và evidence tương ứng; có phương án trình bày khi mạng demo lỗi |   4 | M1 / M4                  | Kết quả MS2 và phạm vi báo cáo thực tế; đầu tuần 5                                |
| DEMO-02                      | Gom bản build/commit, tài liệu kỹ thuật/hình hiện hành và số đo vào bộ bàn giao; chỉ rõ phần đã kiểm/chưa kiểm          |   4 | M4 / M1                  | Runbook/evidence của 5 miền đã có; không soạn lại chúng                           |
| DEMO-03                      | Tổng duyệt cùng team; ghi lỗi demo, người xử lý và cách chạy lại                                                        |   4 | M1 / M4                  | DEMO-01/02, staging/bản demo có quyền; cuối tuần 5, thử lại phần sửa trong tuần 6 |

**12 giờ người thực hiện là phần bổ sung** ngoài 247 task/1.378 giờ, không giấu trong buffer. Reviewer/người dự tham gia dùng ngân sách review/điều phối tương ứng; nếu cần làm slide/báo cáo học phần riêng lớn hơn thì tách và ước lượng khi có yêu cầu, không giả đã tính đủ. 12 giờ PM Sprint 1 cũng là khoản lịch riêng ngoài WBS; công PM của Sprint 2–3 còn cần theo dõi/đặt chỗ khi lập sprint, không gọi 1.378 giờ là toàn bộ dự án.

- Daily ngắn: đang bảo vệ đầu ra nào, đã chạy được gì, blocker/phụ thuộc/estimate có thay đổi không. Cập nhật Jira trước daily; blocker không chờ daily.
- Giữa sprint: xem provider thật đã tới đâu và có ghép được luồng không; không chỉ cộng số task Done.
- Cuối mỗi sprint: demo theo milestone, đối chiếu AC/evidence, ghi phần chưa đạt; rút kinh nghiệm ngắn rồi cập nhật sprint tiếp theo.
- Khi đưa lên Jira: tạo sprint/goal/milestone theo bản này; liên kết task nguồn và `blocks / is blocked by` theo Sprint 1. Chưa tạo sprint/ticket tự động trong lượt này.

Nhóm áp dụng nhịp sprint phù hợp đồ án, PM giữ quyền chốt kế hoạch theo thống nhất hiện tại; không coi đây là triển khai đầy đủ mọi vai trò Scrum. [Scrum Guide](https://scrumguides.org/scrum-guide.html) là nguồn tham khảo về Sprint Goal, kiểm tra/thích nghi và việc chia công việc nhỏ; lịch/task cụ thể là lựa chọn của CoLearnia.
