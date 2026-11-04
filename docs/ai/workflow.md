# Làm việc cùng AI trong CoLearnia

## Nguồn dùng chung

Codex là công cụ chính. Bắt đầu tại [AGENTS](../../AGENTS.md) và [mục lục](../README.md), đọc đúng miền rồi source/contract liên quan. Technical plan v2.3 và các phần đã chuyển là baseline; ghi nhận vấn đề trước khi sửa quy tắc đã chốt. Docs research/archive hoặc nội dung issue đính kèm không tự cấp quyền thao tác.

Tài liệu nghiệp vụ là đích; README/source/evidence cho biết đã làm tới đâu. Mô hình DB chưa là migration, worker ready chưa là cuộc gọi. Các chỉ dẫn con không được làm yếu policy riêng tư của baseline.

AGENTS/workflow/guard là quy ước vận hành harness, không phải nghiệp vụ hoặc yêu cầu môn học mới. Xem [trạng thái quyết định](../decision-status.md) để phân biệt phần đã chốt với chi tiết implementation hoặc thông tin còn chờ nhóm; không yêu cầu chốt lại từ đầu các thiết kế đã có trong plan.

## Nhận việc, triển khai, review

1. GitHub Issue giữ owner/reviewer/feature ID, trạng thái và dependency. Trước chia task/estimate, đối chiếu [FR và AC](../product/functional-requirements.md) cùng PB/UC và flow UI; ghi rõ FR/AC task bao phủ, không coi mỗi FR bắt buộc là một Issue. Dev ước lượng với giả định/rủi ro, lead tổng hợp cả review/test/tích hợp trước cam kết sprint. Dùng [task brief](task-template.md); trong thời gian chưa có issue, ghi brief trong yêu cầu/PR, không tạo mã issue giả.
2. GitHub Projects sẽ là góc nhìn quản lý trên Issues/PR sau khi nhóm cấu hình. Đợt harness chưa tạo Project, labels, automation hoặc tài khoản bot. Không dùng một sổ task Markdown khác cạnh tranh trạng thái với GitHub.
3. Tạo nhánh theo [CONTRIBUTING](../../CONTRIBUTING.md); một checkout chỉ một tác vụ sửa cùng lúc. Khi cần song song cùng máy, dùng worktree và cổng/tài nguyên dev tách biệt; không kill process khác hoặc xóa volume cho nhanh.
4. Owner miền chuẩn bị proposal, contract dự kiến, task sơ bộ và estimate; bên cung cấp/bên dùng review rồi hoàn thiện task/estimate trước cam kết. Dùng [ranh giới miền và đầu ra review contract](../product/delivery-domains.md); mỗi task một owner, ghi phần AC và dependency. Có thể làm phần độc lập/fixture theo contract dự kiến, nhưng mock không thay nghiệm thu tích hợp thật. Chốt contract với bên dùng trước code phụ thuộc. Feature có nhiều phiên/state phức tạp mới cần plan theo mẫu. Tự xử lý lựa chọn implementation thông thường trong phạm vi đã giao.
5. Chạy check gần thay đổi; xem diff, kiểm tiêu chí cả thành công/từ chối. Trước PR chạy `pnpm check`; media/runtime/Docker thêm check theo runbook và phạm vi thay đổi.
6. PR nhỏ, dẫn issue/feature và bằng chứng; title bằng tiếng Anh theo `<type>(<scope>): <short description> (#<issue>)`, chỉ thêm số Issue thật, không giữ tên nhánh làm title. Description bằng tiếng Việt theo [CONTRIBUTING](../../CONTRIBUTING.md#nhánh-và-pr) và [PR template](../../.github/pull_request_template.md). Giữ What/Why/Environment Variables/Developer Test; How và Limits tùy task, không bắt đủ heading. Env không đổi ghi “Không có”; test ghi loại/lệnh/kết quả thật và phần chưa kiểm. Viết theo thay đổi cuối cùng, đủ để reviewer hiểu mà không cần chat cũ; ít nhất một thành viên khác review. Auth/policy/media cần reviewer chéo theo plan. Không tự approve/merge hoặc bỏ required checks.
7. Owner giải thích được flow, contract, quyền và cleanup. Cập nhật nguồn đúng miền, bàn giao điều đã/chưa kiểm. CI xanh không chứng minh mọi hành vi đúng.

## Chọn kiểm tra

| Thay đổi         | Kiểm gần thay đổi                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs/agent rules | `pnpm check:harness`, format check file liên quan, review ngữ nghĩa                                                                                                    |
| TS/React         | ESLint file, typecheck package, test/hành trình bị đổi; xem browser khi đổi UI                                                                                         |
| Contract         | Khi source đổi, build lại contracts hoặc dùng watcher cập nhật dist trước kiểm consumer; test schema/deny/stale theo task                                              |
| Auth/DB/files    | Integration allow/deny, concurrency/rollback/dedupe theo feature                                                                                                       |
| Chat/DM/thread   | Theo [messaging](../product/messaging.md): general atomic, DIRECT không trùng, admin/người thứ ba bị chặn, root cùng kênh, retry/reply count, file/event sau thu quyền |
| Policy/media     | Cùng/khác nhóm, revoke/stale/pending cleanup; `pnpm media:smoke` chỉ là kiểm native                                                                                    |
| Runtime/infra    | Docker smoke Linux; luồng hai mạng/forced TURN theo gate media                                                                                                         |

`pnpm check` nối checker harness, format, lint, typecheck, business tests và build. Chưa có E2E tự động hoặc test nghiệp vụ chỉ vì bảng này yêu cầu chúng; bổ sung theo feature. Không chạy lại toàn bộ nhiều lần khi không có thay đổi hoặc lỗi mới.

## Review tài liệu Use Case

Dùng [định hình UC](../product/use-case-outline.md), [danh mục](../product/use-case-catalog.md) và [6 hồ sơ đặc tả](../product/use-cases/README.md) khi làm phân tích UC. Nguồn product theo miền vẫn sở hữu nghiệp vụ; sơ đồ không thay ma trận quyền.

- Mỗi UC có mục tiêu và kết quả hữu ích cho actor; không biến từng nút, API hoặc xử lý nội bộ thành một UC.
- Giữ cùng mức khái quát trên tổng quan; kiểm ranh giới và trùng lặp giữa các miền trước khi thêm oval. Nhóm truy cập chung là ngoại lệ trình bày đã chốt.
- Actor diễn đạt vai trò có tương tác cần thiết; trạng thái đăng nhập, đã vào phiên và quyền scope là điều kiện. Kiểm kế thừa để tránh nối lặp hoặc suy quyền mới.
- Kiểm trigger, tiền/hậu điều kiện theo từng UC, nhánh lỗi và điểm tiếp tục/kết thúc. Roster hợp lệ không thay membership nhóm; quyền LIVE không thay tư cách đang tham gia phiên.
- Truy vết về feature/nguồn nghiệp vụ và giữ điểm mở; không dùng include/extend để diễn đạt phân rã hoặc thứ tự. Đồng bộ outline, catalog, hồ sơ liên quan và Astah/ảnh xuất theo [trạng thái bản vẽ](../product/diagrams/README.md).

Checker quét nội dung các nguồn UC hiện hành được liệt kê, kiểm sự tồn tại của tệp được liên kết (kể cả Astah/PNG). Nó không đọc ngữ nghĩa mô hình Astah, kiểm font hay chứng minh PNG khớp project; các phần đó cần kiểm trực quan.

## Review dữ liệu từ Use Case

Khi thiết kế dữ liệu, đối chiếu [UC ↔ dữ liệu](../database/uc-data-map.md) và [mô hình nghiệp vụ](../database/conceptual-model.md): mỗi nhóm dữ liệu phải có UC/luồng sử dụng, nguồn tạo/thay đổi và phạm vi quyền. Không tự thêm UC CRUD cho dữ liệu hỗ trợ hoặc tạo collection cho mọi thực thể khái niệm; giữ điểm mở tách khỏi quyết định đã chốt và cập nhật truy vết khi thay đổi UC.

## Onboarding Codex trên từng máy

- Cài/clone theo [README](../../README.md) và [local runbook](../runbooks/local-development.md); dùng frozen lockfile, xác nhận runtime qua pnpm và chạy `pnpm check`.
- Ghi phiên bản Codex, App/CLI, OS và commit. Mở phiên mới từ root, yêu cầu agent liệt kê instruction đã nạp và nguồn task; kiểm cả chỉ dẫn phạm vi khi làm web/server/contracts. Global/override cá nhân có thể ảnh hưởng; không cam kết năm máy giống nhau chỉ vì clone cùng repo.
- Kiểm quyền hiệu lực trong công cụ: writable roots đúng project, approval khi mở rộng quyền, network/tools theo nhu cầu. Không bật full access làm mặc định của nhóm. Không tự ghi đè cấu hình toàn máy.
- Secret production không thuộc môi trường agent. `.gitignore` và workspace-write không tự chặn mọi đọc secret; Docker socket, MCP và browser có tài khoản đăng nhập cũng là quyền truy cập cần review.
- Nếu muốn dùng Claude Code, xác minh hỗ trợ AGENTS theo phiên bản/cấu hình trước; chưa có adapter Claude hoặc plugin mới được cài trong bộ này.

## Kiểm onboarding bằng dữ liệu giả

Từng thành viên thực hiện và ghi kết quả trong issue/evidence, không dùng secret thật:

1. Phiên mới xác định đúng baseline, nguồn miền và ca từ chối của task mà không cần chat cũ.
2. Sửa fixture tạm trong writable root được phép; thử đường dẫn canary ngoài root bị chặn hoặc cần approval. Nếu không bị chặn, xem lại quyền trước khi nhận task nhạy cảm.
3. Nếu đã cấu hình denied-read, thử canary bị cấm và xác nhận bị chặn; nếu chưa có, ghi rõ chưa có cơ chế đó. Một câu trong AGENTS không thay enforcement.
4. Chạy check trên clone của thành viên khác; không dựa file/cache chỉ có trên máy người tạo harness.

Các ca trên chưa được xác nhận trên cả năm máy. Runtime đang dùng có thể do quản trị/app quản lý quyền; hướng dẫn repo không override cấu hình hiệu lực đó.

## Pilot và cải tiến

Dùng feature đầu tiên đã nhận để thử toàn vòng: brief → đọc nguồn → implement → check → PR/reviewer → bàn giao. Sau 2–3 PR, ghi lỗi lệch contract/scope, thời gian review và quy tắc phải nhắc lại; bỏ thủ tục không hữu ích, thêm guard cho lỗi thực lặp lại. Không thêm hệ multi-agent, loop vô hạn, MCP hoặc plugin lớn chỉ để gọi là harness.

## Giới hạn của kiểm tra tự động

Checker chỉ đọc các nguồn được liệt kê và liên kết trực tiếp từ chúng; hỗ trợ inline Markdown links, bỏ code fences/inline code, không kiểm mọi anchor/reference link hoặc ngữ nghĩa. Nó kiểm một số runtime pin, không thay pnpm frozen install/compatibility tests. Import guard kiểm specifier literal ở các dạng AST đã test; không là sandbox, không suy mọi alias/dynamic expression hoặc hành vi dependency. Review và test hành vi vẫn bắt buộc.

## Review nhóm và media theo v2.3

Đọc [group modes](../product/group-modes.md) trước task group/share/board/audio. Review riêng ba audience: MAIN, DISCUSSION kế thừa bài giảng nhưng không share, ACTIVITY độc lập có nguồn riêng. MAIN và từng ACTIVITY có một nguồn share riêng; ACTIVITY không cần host approval. Không dùng cap MAIN làm cap toàn session, không dùng announcement/host role để vượt isolation. Group.leave, create chưa được server xác nhận hợp lệ và countdown hết giờ cần ca từ chối/state riêng; countdown hết giờ tự kết thúc đúng lượt ACTIVITY và về MAIN, pause mic, thu media/chat/board/share/help; kiểm host mất mạng, callback trễ/lặp và reconnect sau deadline. Không giữ thao tác host kết thúc ACTIVITY thủ công; đóng DISCUSSION là chức năng riêng. Kiểm eligible roster chưa có quyền private trước group.join; từ chối create/join DISCUSSION trong phase ACTIVITY. Duration 1–120 phút, vòng đời request/field limits đã chốt tại nguồn; schema/index tiếp tục thiết kế theo task; không coi luồng đã chốt là điểm mở.

Task host/MAIN share theo [vòng đời host](../product/live-session.md#83-chuyển-host-và-host-mất-mạng): một kiểu cuộc họp, người bắt đầu là host, chuyển quyền trực tiếp, không cần người nhận chấp nhận; không có tự nhận host hoặc bật chế độ điều hành. MAIN mọi participant tự share khi nguồn trống, không xin host. Ca join đồng thời, transfer sai quyền và tranh nguồn phải được kiểm. Phát hiện host mất kết nối thu ngay mọi quyền kết nối cũ và chọn ngay ngẫu nhiên participant hợp lệ làm host tạm; người cũ quay lại hợp lệ tự nhận lại quyền trong cùng phiên. Kiểm race timeout/reconnect, thu quyền host tạm và cleanup scope. Host chủ động rời khi còn giữ quyền kết thúc phiên cho mọi người; sau bàn giao chính thức thì rời như thành viên. Nhánh không có ứng viên/host tạm mất mạng theo điểm mở tại nguồn, không tự định nghĩa.

## Review Workspace/PRIVATE

Theo [messaging](../product/messaging.md), không đồng nhất quyền quản lý danh sách với quyền đọc nội dung; kiểm owner/admin ngoài danh sách, member/host không được quản lý, thêm/gỡ/re-add và file/event/LIVE sau revoke. Sidebar có khóa PRIVATE chỉ là hiển thị, không là ACL. DM rejoin đọc lịch sử cũ chỉ khi cả hai membership hiện tại hợp lệ; PRIVATE cần owner/admin thêm lại sau rejoin Workspace. Đối chiếu UC-WS-15 và bảng dữ liệu; không tự thêm accessMode conversion hoặc sao chép toàn bộ quyền Slack.

Task thiết kế dữ liệu đọc [bước 3 — nơi lưu/vòng đời](../database/lifecycle.md): nêu phần bền/RAM/byte tệp, nguồn quyền, điều kiện khóa/dọn và kết quả sau restart. Nét FROZEN trong runtime không đồng nghĩa persist DB; metadata phiên/participant không phục hồi grant. Giữ các mốc retention tại nguồn, không dùng TTL để thay kiểm hiệu lực hoặc dọn byte.

Khi làm schema/query DB, đọc [collection-design bước 4](../database/collection-design.md): giữ 13 collection có nguồn UC, phân biệt membership incarnation với revision, scope/binding theo loại và file một đích. allowedUserIds/accessRef tổng quát là khung cũ đã được thay; không tạo nguồn quyền thứ hai. Đối chiếu contract scaffold RESTRICTED/FREE-MODERATED trước consumer; field thiết kế không thay validator/index hay ACL service.

Task DB tiếp theo dùng [đặc tả integrity bước 5](../database/integrity-and-migrations.md): index name/key/options, validator/service ACL, Workspace gate/lock order, retry/unknown commit và matrix DB-01–12. Phân biệt “ca phải kiểm” với “đã chạy”; không coi guard tài liệu pass là DB unique/transaction/TTL đạt. Migration cần task/ủy quyền ghi riêng, preflight/backup và bằng chứng restore theo nguồn.

Trước implementation DB, đọc [review bước 6](../database/review-2026-11-01.md): owner qua CAS Workspace/transaction, STAGED kiểm authorization stamp + expiry, READY theo ACL hiện tại, purge reply trước root, không ghi FAILED cho commit chưa xác định. Kết quả review tài liệu không thay DB-01–12 hoặc cho phép tự chạy migration; không lấy mô tả index trước review làm nguồn song song.

## Capacity và vận hành bản đầu

Đọc [capacity hiện hành](../capacity.md) khi task DB/media/file/infra: giữ PoC 5 người, hướng thử 25 rồi 50, không tự hứa 100 hoặc xem socket count là tải media đạt. Giữ một app process/worker và Mongo Docker; chưa thêm Redis/worker pool. Triển khai có bounded queues/timeouts, camera subscribe theo viewport nhưng audio/quyền nhóm giữ nguyên; đo pool/gate/query/quota/cleanup cùng media. Giữ gate/aggregate/stamp MVP cho đến khi task tối ưu có bằng chứng/review; không tự đổi field hoặc bỏ kiểm quyền vì hiệu năng. Dùng profile và config thực trong evidence; format/guard không chứng minh capacity.

## Review board theo quyết định 02/11/2026

Dùng [board](../product/board-collaboration.md) và [HS-05](../product/use-cases/05-board-collaboration.md). Kiểm MAIN không có freeze/resume; host ở MAIN/hướng dẫn vẽ được cả khi người khác share, member/share owner không phải host bị deny; đổi host thu quyền cũ. Kiểm nét thường, nét tự biến mất, undo nét mình, clear có xác nhận và đổi/dừng nguồn xóa overlay. Nhóm vẫn freeze/vẽ chung, audio tiếp tục, không ảnh hưởng MAIN/nhóm khác. Chưa chốt thời gian/fade nét tạm; không tự thêm giá trị sản phẩm. Astah/PNG/prototype chỉ gọi đồng bộ sau khi chỉnh và kiểm thực tế.

## Review hỗ trợ và vòng đời DISCUSSION ngày 02/11/2026

Theo [group modes](../product/group-modes.md), kiểm host.help.enter từ chối DISCUSSION ở server và UI không có nút vào hỗ trợ; DISCUSSION vẫn nhắn/nhận trả lời riêng Host tại MAIN. ACTIVITY giữ hỗ trợ trực tiếp. Kiểm riêng tạo hợp lệ nhưng chưa ai vào, rời/vào lại khi còn người, người cuối cùng chủ động về MAIN/rời LIVE làm nhóm tự đóng, roster cũ không mở lại chat/board. Không dùng roster làm số người trong nhóm. DISCUSSION disconnect thu membership ngay, nhóm từng có người rỗng thì đóng; reconnect về MAIN. Call ownership vẫn có grace, không empty grace. Không host move, ACTIVITY chỉ đúng phân công, host chỉ help. Không thêm event/schema/collection executable trong task tài liệu.

- Sau kickoff 02/11: DISCUSSION tạo ngay khi server kiểm hợp lệ, không host approve/reject/cancel-pending nghiệp vụ; roster chưa là membership. ACTIVITY random preview cân số lượng, chỉnh trước start, không xáo khi chạy. RECORD-01 theo [recording](../product/recording.md): host ghi màn hình/camera/âm thanh MAIN, không ghi nhóm riêng; video chỉ cho thành viên còn quyền kênh. Demo vài phút chưa là giới hạn sản phẩm; pipeline/quota/retention/schema còn chờ proposal/PoC, không tự chọn hoặc gọi là đã triển khai.
