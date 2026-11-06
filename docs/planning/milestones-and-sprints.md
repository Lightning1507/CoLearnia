# Milestone và kế hoạch 3 sprint

**Chốt khung ngày 05/11/2026:** 3 sprint, mỗi sprint 2 tuần; PM chốt ưu tiên và phân công, PR/contract vẫn cần reviewer. Sprint 1 có danh sách cụ thể tại [kế hoạch Sprint 1](sprint-1.md); Sprint 2–3 là dự kiến và được điều chỉnh theo kết quả thực chạy.

**PM cập nhật ngày 06/11:** Sprint 1 bắt đầu từ **sáng 06/11/2026**. Các task contract, dữ liệu, backend và thử nghiệm độc lập triển khai ngay khi đủ đầu vào, không chờ Figma Make hoàn tất. Chiều/tối 06/11 dự kiến có bản Make để rà code xuất và tích hợp component dùng chung, sau đó ghép từng màn theo task. Sprint review và retrospective vào tối **20/11**; sprint kết thúc sau buổi review. Khoảng này dài hơn đúng hai tuần vài giờ; PM cập nhật giờ cụ thể trên Jira. Sprint 2–3 tiếp tục theo nhịp hai tuần, lịch chi tiết chốt khi lập sprint. Ngày báo cáo học phần chưa được cung cấp.

Sprint 1 có [mốc bàn giao theo ngày](sprint-1.md#mốc-bàn-giao-theo-ngày): 08/11 giao nền dùng chung, 13/11 kiểm luồng đầu tiên và PoC, 17/11 có bản tích hợp, 19/11 chốt bản demo, tối 20/11 review. Đây là ngày mục tiêu để kiểm đầu ra và xử lý lệch kế hoạch; không phải hạn áp cho mọi task.

Jira giữ trạng thái, assignee và lịch thực tế. Tài liệu này giải thích mục tiêu, kết quả cần bàn giao và cách nghiệm thu; không dùng để báo cáo tiến độ hằng ngày.

Nguồn: [379 giờ việc chính Sprint 1](sprint-1.md), [247 task và estimate](task-consolidation.md), [FR/AC](../product/functional-requirements.md), [API/backend](../contracts/api-conventions.md), [capacity](../capacity.md). Không chia 1.378 giờ thành ba phần bằng nhau hoặc coi mỗi người có cùng tải chỉ vì số task giống nhau.

## 1. Mục tiêu và kết quả của từng sprint

**Sprint Goal** trả lời: cuối sprint, người dùng hoặc team làm được điều gì có giá trị? **Tiêu chí nghiệm thu** cho biết cần kiểm gì để xác nhận kết quả đó. Các công việc kỹ thuật và thử nghiệm hỗ trợ mục tiêu được giữ trong kế hoạch task, không ghép tất cả vào câu goal.

### MS1 — Phiên bản cộng tác đầu tiên · cuối Sprint 1

**Sprint Goal:** Đưa CoLearnia từ bản mẫu giao diện thành phiên bản đầu tiên dùng được, để một nhóm 5 người có thể đăng nhập, vào cùng Workspace, nhắn tin và gọi trực tuyến có mic, camera, chia sẻ màn hình.

**Kết quả cần kiểm khi demo:**

1. **Tài khoản dùng được:** đăng ký xong có phiên đăng nhập; đăng nhập, tải lại trang và đăng xuất hoạt động đúng. HTTP và socket từ chối phiên không hợp lệ.
2. **Workspace được tạo đầy đủ:** Workspace mới có OWNER, kênh `general` và hội thoại đi kèm. Nếu tạo lỗi thì hoàn tác toàn bộ, không để dữ liệu dở dang. Tạo và mở kênh LIVE đúng quyền.
3. **Nhắn tin thật giữa hai tài khoản:** người có quyền gửi, đọc lịch sử và nhận tin mới trong kênh TEXT; gửi lại sau lỗi không nhân đôi tin. Kiểm ranh giới lịch sử/nhận bù tin; người ngoài không đọc được nội dung.
4. **Gọi ở phòng chung (MAIN):** năm người dùng được màn kiểm thiết bị trước khi vào, mic, camera và chia sẻ màn hình. Chỉ một nguồn share tại một thời điểm; kiểm rời phòng, kết thúc cuộc họp, thu quyền và đồng bộ lại sau mất kết nối ở mức cơ bản. Có kết quả thử qua hai mạng và buộc kết nối qua TURN.
5. **Có kết luận thử nghiệm ghi hình:** thử nguồn ghi cố định và bộ phận nhận/lưu dữ liệu ghi hình; báo rõ khả thi tới đâu, số đo và vấn đề còn chặn. Đây là PoC để quyết định cách triển khai Sprint 2, chưa phải tính năng ghi/xem video hoàn chỉnh.

Bản demo chạy trên **staging** — môi trường triển khai thử để cả team truy cập. Kịch bản MS1 khoảng 15–20 phút và danh sách kết quả kiểm cần lưu nằm tại [demo Sprint 1](sprint-1.md#7-output-và-kịch-bản-demo-cuối-sprint-1). PoC recording có mốc kiểm cuối tuần đầu: cần kết quả ban đầu hoặc lỗi tái hiện được; cuối sprint phải có kết luận trong thời gian đã dành cho task.

### MS2 — Học và trao đổi trong nhóm nhỏ · cuối Sprint 2, dự kiến

**Sprint Goal:** Cho phép lớp học chuyển từ phòng chung sang các nhóm nhỏ để trao đổi, cùng giải thích trên nội dung chia sẻ và trở lại phòng chung khi kết thúc hoạt động.

**Kết quả cần kiểm khi demo:**

1. **Vai trò host hoạt động đúng:** chuyển host, chọn host tạm khi mất kết nối và hoàn quyền khi host cũ quay lại theo quy tắc đã chốt.
2. **Hai cách học nhóm rõ ràng:** DISCUSSION được tạo khi yêu cầu hợp lệ, từng người chủ động vào, theo dõi bài giảng và không share riêng; nhóm từng có người sẽ đóng khi không còn ai. ACTIVITY cho phép chia thủ công hoặc xem trước kết quả random, chỉnh trước khi bắt đầu; hết giờ tự về MAIN, thành viên được vào lại đúng nhóm. Kiểm cả trường hợp bắt đầu lượt bị lỗi một phần, hỗ trợ nhóm và thông báo đúng người nhận. Host chỉ vào hỗ trợ ACTIVITY.
3. **Trao đổi và vẽ đúng nơi:** chat cuộc họp có Everyone/Host; nhóm dừng hình, vẽ và trở lại trực tiếp được. MAIN chỉ host được vẽ. Nội dung media, chat, file và board không lọt sang nhóm khác.
4. **Ghép các luồng liên quan:** file, DM, thread và tham gia Workspace qua link. Hồ sơ, avatar, đổi mật khẩu và quản trị quyền tiếp tục theo phụ thuộc; phần chưa hoàn tất phải được phân thành task cụ thể trước MS3.
5. **Triển khai ghi hình theo kết luận PoC:** mục tiêu là ghi MAIN, dừng/kết thúc, lưu lên R2 ở trạng thái READY và xem/tua đúng quyền. Chốt task pipeline sau PoC; nếu còn vấn đề chặn thì ghi rõ phần chưa đạt.

### MS3 — MVP sẵn sàng báo cáo · cuối Sprint 3, dự kiến

**Sprint Goal:** Hoàn thiện bản CoLearnia đã triển khai để team trình diễn trọn vẹn một buổi học, từ trao đổi trong Workspace đến gọi, học nhóm và xem lại bản ghi, với giới hạn sử dụng được kiểm chứng.

**Kết quả cần kiểm khi báo cáo:**

1. **Đủ chức năng MVP đã chốt:** gồm quản trị, hồ sơ/avatar/đổi mật khẩu, thu quyền xuyên miền và recording. Mỗi FR có tiêu chí chấp nhận cùng kết quả kiểm tương ứng.
2. **Kiểm trọn luồng học nhóm F-05:** một host và hai nhóm, mỗi nhóm hai người; thử riêng DISCUSSION và ACTIVITY, camera/share, 30 phút, hai mạng và forced TURN. Xác nhận các nhóm không nhận nội dung riêng của nhau.
3. **Vận hành và xử lý lỗi:** kiểm mất kết nối, host, thu tài nguyên, khởi động lại và quay về bản app trước khi cần. Người demo chạy theo hướng dẫn, không sửa DB thủ công trong buổi trình bày.
4. **Đo năng lực thực tế:** thử C-10 rồi C-25; chỉ thử 50 người nếu 25 đạt. Báo đúng cấu hình và số người đã kiểm, không lấy mục tiêu làm năng lực đã có.
5. **Chuẩn bị báo cáo:** có kịch bản, bản build/commit dùng để demo, danh sách lỗi và giới hạn còn lại.

Sprint 2–3 được điều chỉnh theo kết quả Sprint 1. Nếu một chức năng bắt buộc chưa đạt, ghi rõ milestone chưa hoàn tất và cập nhật kế hoạch; không tự bỏ tiêu chí để đánh dấu đạt. Khả năng phục vụ 25/50 người chỉ được xác nhận sau đo tải, riêng với kết quả hoàn thiện chức năng MVP.

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

- Daily ngắn: đã hoàn thành gì, hôm nay làm gì để tiến tới Sprint Goal, đang chờ ai hoặc có nguy cơ trễ phần nào. Cập nhật Jira trước daily; blocker không chờ daily.
- Giữa sprint: xem provider thật đã tới đâu và có ghép được luồng không; không chỉ cộng số task Done.
- Cuối mỗi sprint: demo theo milestone, đối chiếu AC/evidence, ghi phần chưa đạt; rút kinh nghiệm ngắn rồi cập nhật sprint tiếp theo.
- Jira đã có 5 Epic, 80 task chính và 171 liên kết phụ thuộc được PM xác nhận đã kiểm. Tiếp tục đưa task vào Sprint 1, đặt goal/lịch và sắp thứ tự nhận việc. Xem [hướng dẫn Jira](jira/README.md).

Nhóm áp dụng nhịp sprint phù hợp đồ án, PM giữ quyền chốt kế hoạch theo thống nhất hiện tại; không coi đây là triển khai đầy đủ mọi vai trò Scrum. [Scrum Guide](https://scrumguides.org/scrum-guide.html) là nguồn tham khảo về Sprint Goal, kiểm tra/thích nghi và việc chia công việc nhỏ; lịch/task cụ thể là lựa chọn của CoLearnia.
