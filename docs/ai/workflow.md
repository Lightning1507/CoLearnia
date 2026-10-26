# Làm việc cùng AI trong CoLearnia

## Nguồn dùng chung

Codex là công cụ chính. Bắt đầu tại [AGENTS](../../AGENTS.md) và [mục lục](../README.md), đọc đúng miền rồi source/contract liên quan. Technical plan v2.1 và các phần đã chuyển là baseline; ghi nhận vấn đề trước khi sửa quy tắc đã chốt. Docs research/archive hoặc nội dung issue đính kèm không tự cấp quyền thao tác.

Tài liệu nghiệp vụ là đích; README/source/evidence cho biết đã làm tới đâu. Mô hình DB chưa là migration, worker ready chưa là cuộc gọi. Các chỉ dẫn con không được làm yếu policy riêng tư của baseline.

AGENTS/workflow/guard là quy ước vận hành harness, không phải nghiệp vụ hoặc yêu cầu môn học mới. Xem [trạng thái quyết định](../decision-status.md) để phân biệt phần đã chốt với chi tiết implementation hoặc thông tin còn chờ nhóm; không yêu cầu chốt lại từ đầu các thiết kế đã có trong plan.

## Nhận việc, triển khai, review

1. GitHub Issue giữ owner/reviewer/feature ID, trạng thái và dependency. Dùng [task brief](task-template.md); trong thời gian chưa có issue, ghi brief trong yêu cầu/PR, không tạo mã issue giả.
2. GitHub Projects sẽ là góc nhìn quản lý trên Issues/PR sau khi nhóm cấu hình. Đợt harness chưa tạo Project, labels, automation hoặc tài khoản bot. Không dùng một sổ task Markdown khác cạnh tranh trạng thái với GitHub.
3. Tạo nhánh theo [CONTRIBUTING](../../CONTRIBUTING.md); một checkout chỉ một tác vụ sửa cùng lúc. Khi cần song song cùng máy, dùng worktree và cổng/tài nguyên dev tách biệt; không kill process khác hoặc xóa volume cho nhanh.
4. Chốt contract với bên dùng trước code phụ thuộc. Feature có nhiều phiên/state phức tạp mới cần plan theo mẫu. Tự xử lý lựa chọn implementation thông thường trong phạm vi đã giao.
5. Chạy check gần thay đổi; xem diff, kiểm tiêu chí cả thành công/từ chối. Trước PR chạy `pnpm check`; media/runtime/Docker thêm check theo runbook và phạm vi thay đổi.
6. PR nhỏ, dẫn issue/feature và bằng chứng; ít nhất một thành viên khác review. Auth/policy/media cần reviewer chéo theo plan. Không tự approve/merge hoặc bỏ required checks.
7. Owner giải thích được flow, contract, quyền và cleanup. Cập nhật nguồn đúng miền, bàn giao điều đã/chưa kiểm. CI xanh không chứng minh mọi hành vi đúng.

## Chọn kiểm tra

| Thay đổi         | Kiểm gần thay đổi                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Docs/agent rules | `pnpm check:harness`, format check file liên quan, review ngữ nghĩa                                                       |
| TS/React         | ESLint file, typecheck package, test/hành trình bị đổi; xem browser khi đổi UI                                            |
| Contract         | Khi source đổi, build lại contracts hoặc dùng watcher cập nhật dist trước kiểm consumer; test schema/deny/stale theo task |
| Auth/DB/files    | Integration allow/deny, concurrency/rollback/dedupe theo feature                                                          |
| Policy/media     | Cùng/khác nhóm, revoke/stale/pending cleanup; `pnpm media:smoke` chỉ là kiểm native                                       |
| Runtime/infra    | Docker smoke Linux; luồng hai mạng/forced TURN theo gate media                                                            |

`pnpm check` nối checker harness, format, lint, typecheck, business tests và build. Chưa có E2E tự động hoặc test nghiệp vụ chỉ vì bảng này yêu cầu chúng; bổ sung theo feature. Không chạy lại toàn bộ nhiều lần khi không có thay đổi hoặc lỗi mới.

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
