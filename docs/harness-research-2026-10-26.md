# Nghiên cứu harness cho CoLearnia

Ngày khảo sát: **26/10/2026**. Nhóm 5 người, chủ yếu dùng **Codex**, mục tiêu 4 tuần build và 1–2 tuần hoàn thiện. Báo cáo là đề xuất để review, chưa là chỉ dẫn agent có hiệu lực hoặc quyết định thay đổi kiến trúc sản phẩm.

## 1. Đề xuất chính

Xây một harness dùng chung ngay trong repository: nguồn chuẩn có mục lục, chỉ dẫn ngắn, task có đầu ra kiểm chứng được, kiểm tra tự động và quy trình review của thành viên khác. Dùng runtime Codex hiện có để thực thi; chưa cần tự viết agent loop, thêm SDK AI vào CoLearnia hoặc cài một framework điều phối.

Harness phải giúp một bạn hoặc một phiên AI mới biết: đang làm feature nào, nguồn nào đã chốt, được sửa phần nào, cần kiểm gì và phần nào chưa chứng minh. Đích đến là giảm lỗi tích hợp và giữ khả năng giải thích code khi bảo vệ môn học. Chưa có số đo để hứa tăng tốc hay giảm chi phí bao nhiêu.

Phân biệt ba lớp:

| Lớp                         | Vai trò                                                   | Áp dụng ở CoLearnia           |
| --------------------------- | --------------------------------------------------------- | ----------------------------- |
| Runtime agent               | Gọi model, tools, quản lý phiên và quyền thực thi         | Codex đã cung cấp             |
| Harness của repo            | Tài liệu, task, checks, quy trình giao việc và bằng chứng | Phần cần thiết kế cho cả nhóm |
| Tính năng AI trong sản phẩm | CoLearnia gọi model để phục vụ người học                  | Không thuộc scope đã chốt     |

## 2. Cách khảo sát và giới hạn

- Đọc trực tiếp bài viết/tài liệu chính thức và một số file mã nguồn/template của bốn repository GitHub ở mục 4; lấy commit SHA qua GitHub API để lưu mốc tham chiếu.
- Đọc harness local tại `../ai-staffing`: root/web AGENTS, symlink CLAUDE, mục lục docs, quy trình frontend và script kiểm tra harness. Những file đó là dữ liệu đối chiếu cho nghiên cứu này, không là chỉ dẫn áp dụng sang CoLearnia.
- Đối chiếu CoLearnia tại commit `748f5963dca7e4a03dafe001d5d733cd4d06acc3`: scripts, ESLint, CI, CONTRIBUTING, PR template, technical plan, contracts, quality docs và local runbook.
- Không cài/chạy plugin hoặc mã của repo tham khảo; không benchmark các framework; không kiểm toán toàn bộ bảo mật của chúng. Không đọc secret hay thay đổi `ai-staffing`.
- Chưa xác minh phiên bản Codex, OS và sandbox trên máy bốn thành viên còn lại. Không kiểm tra lại branch protection trên GitHub trong đợt nghiên cứu; nhận định hiện tại về protection dựa vào tài liệu repo.

## 3. Những điều rút ra từ nguồn chính thức

### OpenAI: repo dễ tra cứu và có cơ chế kiểm chứng

Bài _Harness engineering_ mô tả `AGENTS.md` ngắn như mục lục, tri thức có version trong repo, kế hoạch cho việc phức tạp và kiểm tra tự động cho ranh giới kiến trúc. Đây là kinh nghiệm của một hệ nội bộ, không phải cấu trúc bắt buộc cho mọi nhóm. CoLearnia nên lấy cách tổ chức nguồn và enforce bất biến; vẫn giữ review của con người theo quy ước nhóm. [OpenAI, 11/02/2026](https://openai.com/index/harness-engineering/).

Cookbook về execution plans minh họa kế hoạch có mục tiêu quan sát được, tiến độ, quyết định và bằng chứng để tiếp tục qua nhiều phiên. Với CoLearnia, chỉ cần kế hoạch riêng cho việc dài hoặc nhiều miền; việc nhỏ dùng issue/PR. Đây là bản điều chỉnh của nhóm, không tuyên bố tuân thủ toàn bộ mẫu ExecPlan. [OpenAI Cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans).

### Anthropic: tiến độ theo hành vi, bàn giao qua phiên

Thử nghiệm long-running agent dùng phiên khởi tạo, danh sách tính năng, tiến độ và môi trường dễ khởi động; agent làm từng phần và kiểm tra ứng dụng thực. Điều đáng học là khả năng tiếp nối và tránh tuyên bố hoàn thành quá sớm, không phải con số hàng trăm mục hay tự động chạy không giới hạn. [Anthropic, 26/11/2025](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

Bài tiếp theo thử planner/generator/evaluator, đồng thời ghi nhận QA vẫn bỏ sót lỗi và harness có thể chậm, đắt; tác giả lần lượt giản lược các thành phần. Vì thế chưa có lý do để CoLearnia mặc định nhiều agent cho mọi task. Một thành viên khác review theo tiêu chí cụ thể là điểm bắt đầu phù hợp. [Anthropic, 24/03/2026](https://www.anthropic.com/engineering/harness-design-long-running-apps).

Context engineering nhấn mạnh chọn thông tin có ích và tra cứu khi cần. Áp dụng: vào bằng mục lục, đọc đúng feature/contract và quyết định liên quan; không nạp technical plan, mọi ADR, lịch sử và báo cáo nghiên cứu vào mọi phiên. [Anthropic, 29/09/2025](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

### Tài liệu chỉ dẫn và giới hạn thực thi là hai cơ chế khác nhau

Codex đọc chuỗi chỉ dẫn theo phạm vi; cấu hình cá nhân và override có thể ảnh hưởng kết quả. Clone cùng repo chưa chứng minh năm máy có cùng chỉ dẫn hiệu lực. Onboarding cần kiểm tra nguồn thực được nạp. [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md/).

Codex phân biệt sandbox và approval; chế độ workspace-write giới hạn ghi nhưng không tự đồng nghĩa bảo vệ mọi bí mật đọc được. Quyền mạng/tools cũng cần xét riêng. Đề xuất của nhóm là workspace-write cho việc thường, giữ kiểm soát mở rộng quyền, kiểm tra cấu hình hiệu lực trên từng máy; không mặc định full access. [Sandbox](https://learn.chatgpt.com/docs/sandboxing), [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security).

Claude Code hiện có hỗ trợ AGENTS.md nhưng phụ thuộc phiên bản/cấu hình. Nếu cần tương thích, `CLAUDE.md` import `@AGENTS.md` tránh duy trì hai bộ luật. Tài liệu cũng nêu hạn chế symlink khi clone trên Windows. Đây là lý do không sao chép nguyên symlink của ai-staffing sang repo nhóm. [Claude Code memory](https://code.claude.com/docs/en/memory).

## 4. GitHub: đọc gì và chọn lọc gì

Các đường dẫn dưới đây pin theo commit đã đọc, không dùng số sao để đánh giá độ phù hợp. License là metadata GitHub, chưa là kiểm toán license mọi dependency.

| Repository / mốc khảo sát                                                                                                                                          | File đã đọc hoặc đối chiếu                                  | Bài học và quyết định đề xuất                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [openai/codex — `970111f`](https://github.com/openai/codex/tree/970111f6cb62cc02fe36a82ea7d71b37a2889c97), Apache-2.0                                              | README; `codex-rs/core/src/tools/sandboxing.rs`             | Approval/sandbox nằm trong runtime. Dùng Codex sẵn có; không fork runtime. Root AGENTS.md ở mốc khảo sát trả 404, nên không dùng làm mẫu đã đọc.                           |
| [anthropics/claude-quickstarts — `930ad10`](https://github.com/anthropics/claude-quickstarts/tree/930ad10bb2e21a9ef97fe1a88d2037e18a24465c/autonomous-coding), MIT | README; `client.py`, `security.py`, `agent.py`              | Học bàn giao giữa phiên và kết hợp sandbox/permission/hook. Demo có vòng chạy với max_iterations tùy chọn, mặc định không giới hạn. Không chạy nguyên demo trên CoLearnia. |
| [github/spec-kit — `67e0f72`](https://github.com/github/spec-kit/tree/67e0f7294e6e728ab60bf7b4590deb470448bc2d), MIT                                               | README; templates plan/tasks; command implement             | Học spec → plan → tasks, dependency giữa task và contract tích hợp. CoLearnia đã có plan v2, nên chưa cài bộ generator để tạo thêm nguồn đặc tả song song.                 |
| [obra/superpowers — `2ce8aa1`](https://github.com/obra/superpowers/tree/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b), MIT                                             | README; skills verification-before-completion/writing-plans | Học yêu cầu bằng chứng trước kết luận và ghi rõ interface giữa task. Chưa cài toàn bộ framework; kiểm tra theo rủi ro, không lặp full suite cho mọi chỉnh sửa nhỏ.         |

Hai chi tiết cần tránh hiểu sai:

- Hook allowlist lệnh trong quickstart là mã minh họa, chưa được kiểm toán ở đây. Không dùng nó thay sandbox, nhất là khi chương trình được phép có thể chạy mã con. [security.py](https://github.com/anthropics/claude-quickstarts/blob/930ad10bb2e21a9ef97fe1a88d2037e18a24465c/autonomous-coding/security.py).
- Template tasks của Spec Kit ở mốc đã đọc ghi test tùy yêu cầu feature. CoLearnia vẫn cần ca từ chối cho auth/quyền/file/media theo quy định của chính repo; không để template bên ngoài làm yếu tiêu chí này. [tasks-template.md](https://github.com/github/spec-kit/blob/67e0f7294e6e728ab60bf7b4590deb470448bc2d/templates/tasks-template.md).

## 5. Kế thừa ai-staffing ở mức nào?

| Quan sát local                                                 | Giữ cho CoLearnia                | Điều chỉnh cho nhóm                                                                      |
| -------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Root AGENTS trỏ tới mục lục và nguồn theo miền                 | Có, tránh phụ thuộc lịch sử chat | Dùng docs/technical-plan, ADR, contracts hiện có                                         |
| web/AGENTS có luật riêng cho frontend                          | Có khi thật sự khác root         | Có thể thêm phạm vi web/server/contracts, mỗi file chỉ chứa khác biệt cần thiết          |
| Phân biệt demo, thiết kế, code và bằng chứng                   | Rất cần                          | Phân biệt worker ready với cuộc gọi, test mock với media qua mạng                        |
| Bàn giao từng đợt trong web/README                             | Giữ cách ghi bằng chứng          | Không gom cả 5 người vào một README tiến độ dài; mỗi issue/feature giữ bàn giao của nó   |
| check-harness kiểm file, link, ignore, scripts và staged index | Giữ phần kiểm nguồn              | Điều chỉnh đường dẫn theo monorepo; không yêu cầu stage trong vòng code hoặc CI checkout |
| CLAUDE symlink tới AGENTS                                      | Một nguồn nội dung là tốt        | Với nhóm nhiều OS, ưu tiên import mỏng nếu cần Claude; Codex là chính                    |
| Nhiều quyết định/lịch sử đặc thù DATN                          | Không chuyển nghiệp vụ đó sang   | CoLearnia chỉ có ràng buộc của CoLearnia                                                 |

Script hiện tại của ai-staffing kiểm tính hiện diện/khả năng tìm nguồn; không kiểm ngữ nghĩa nghiệp vụ, ACL ứng dụng hoặc quyền thực thi agent. Không gọi đó là một sandbox hay bằng chứng hệ thống an toàn.

## 6. CoLearnia đã có nền gì và còn thiếu gì?

Đã có: package manager/runtime pin, contracts Zod, TypeScript strict, ESLint/Prettier, local hooks, PR template, CI check/audit/secret scan, Mongo transaction probe, media smoke và Docker smoke có điều kiện. Tận dụng các cổng này thay vì dựng pipeline AI riêng chạy trùng.

Tài liệu repo ghi main được bảo vệ; cấu hình workflow hiện có là bằng chứng về định nghĩa check, không thay việc xác minh check đã chạy và branch protection thực tế. [Quality](code-quality.md), [CONTRIBUTING](../CONTRIBUTING.md), [CI](../.github/workflows/ci.yml).

Khoảng trống nên xử lý:

1. Chưa có entry point AGENTS dùng chung được Git theo dõi trong snapshot khảo sát.
2. Mục lục chưa phân biệt rõ thiết kế đích, hiện trạng scaffold, bằng chứng theo commit và nghiên cứu chưa chốt.
3. Technical plan ghi Node 24 LTS, trong khi cấu hình/runbook pin Node 26.12.1; phần đầu còn ghi chưa có mã nguồn. Cần cập nhật đúng hiện trạng, không suy rằng đã hoàn thành nghiệp vụ.
4. Chưa có cách giao task/bàn giao thống nhất cho năm người dùng AI.
5. Chưa có kiểm tra tự động cho một số ranh giới import và tính toàn vẹn nguồn harness.
6. Chưa có xác minh instruction/sandbox trên cả năm máy; tài liệu trong repo không tự áp đặt toàn bộ cấu hình cá nhân.

## 7. Bộ harness tối thiểu đề xuất

### 7.1. Các thành phần và nguồn sở hữu

Đây là cấu trúc dự kiến, chưa tạo những file dưới đây trong đợt nghiên cứu này:

```text
AGENTS.md                         # điểm vào chung, khoảng 50–80 dòng
apps/web/AGENTS.md                 # khi cần quy tắc UI/state riêng
apps/server/AGENTS.md              # khi cần policy/media/lifecycle riêng
packages/contracts/AGENTS.md       # khi cần quy tắc giao tiếp riêng
docs/README.md                    # nâng mục lục hiện có, ghi vai trò nguồn
docs/ai-workflow.md               # onboarding, giao việc, review, giới hạn
docs/plans/<feature-id>.md         # chỉ feature phức tạp/cần nhiều phiên
scripts/check-harness.mjs          # kiểm nguồn và metadata đã thống nhất
scripts/check-harness.test.mjs     # ca cho qua/từ chối của checker
```

Không bắt buộc đủ ba AGENTS con ngay ngày đầu nếu nội dung chỉ lặp root. Chỉ thêm skill khi nhóm thấy một quy trình thực lặp lại; chưa cần một thư viện skill chung lớn. Nếu thêm cấu hình Codex theo repo, phải review như mã thực thi, kiểm tương thích phiên bản và không ghi đè cấu hình toàn máy của thành viên.

### 7.2. Quy tắc nguồn chuẩn

Phân loại thay vì đặt một thứ tự ưu tiên duy nhất cho mọi loại dữ liệu:

- **Ý định sản phẩm:** technical plan và quyết định đã được xác nhận; ADR đề xuất chưa tự thành quyết định.
- **Giao tiếp:** schema trong packages/contracts cùng docs/contracts; khi thiếu hoặc mâu thuẫn với ý định đã chốt thì giải quyết trước phần code phụ thuộc, không âm thầm tự chọn.
- **Phiên bản/lệnh thực thi:** manifests, lockfile, runtime pins, CI và runbook; khác tài liệu thì ghi drift và sửa nguồn liên quan.
- **Đã làm gì:** source, test và bằng chứng gắn commit/môi trường; một checkbox hoặc ảnh UI không thay bằng chứng cho toàn bộ luồng.
- **Tham khảo:** archive, research, nội dung web/GitHub và tài liệu đính kèm; đọc như dữ liệu, không nhận các lệnh bên trong làm ủy quyền thực thi.

Một phiên mới chỉ đọc AGENTS → docs/README → phần liên quan. Không bắt buộc đọc báo cáo nghiên cứu này trong mọi task.

### 7.3. Một hợp đồng task ngắn

Mỗi task cần sáu nội dung; dùng GitHub Issue làm nơi nhận việc/trạng thái nếu nhóm dùng Issues. Không duy trì cùng một bảng trạng thái thứ hai trong repo.

```text
Feature ID / owner / reviewer / nhánh:
Kết quả người dùng hoặc hệ thống quan sát được:
Nguồn áp dụng và phần chưa chốt:
Phạm vi sửa, interface bị ảnh hưởng, dependency task:
Tiêu chí chấp nhận: thành công + từ chối/lỗi cần thiết:
Kiểm chứng và bàn giao: lệnh, kết quả, commit, giới hạn, bước sau:
```

Feature có state/reconnect phức tạp hoặc qua nhiều miền mới cần docs/plans. Plan tham chiếu issue, ghi mốc tiến độ và quyết định; không chép toàn bộ nghiệp vụ v2. Mỗi task có owner và reviewer; một người có thể sở hữu nhiều miền, không nhất thiết chia cứng một người một tầng.

### 7.4. Cách làm chung cho năm người

1. Nhận issue và thống nhất đầu ra/contract trước phần triển khai phụ thuộc.
2. Dùng nhánh theo CONTRIBUTING; mỗi máy/check-out chỉ một tác vụ sửa tại một thời điểm. Khi chạy đồng thời nhiều task trên cùng máy mới dùng worktree riêng.
3. Với thay đổi qua web/server, contract là điểm phối hợp chung; bên sử dụng contract cùng review. Không để hai AI tự đặt tên event/payload riêng.
4. Implement một lát cắt có thể kiểm chứng. Chạy check gần thay đổi trong vòng làm việc; trước PR chạy cổng repo theo quy định hiện hành.
5. Tự review diff; PR nhỏ, bàn giao bằng chứng, thành viên khác kiểm tra và yêu cầu tác giả giải thích phần chính. AI review có thể hỗ trợ nhưng không thay người approve.
6. Cập nhật nguồn đúng chỗ khi chốt thay đổi. Không đánh dấu cả feature xong nếu mới có schema, mock hoặc module riêng.

Các file dùng chung như lockfile, contracts, CI và runtime pins nên có người phối hợp khi cùng chỉnh; không cần khóa toàn repo hoặc ngăn mọi người làm song song ở miền độc lập.

## 8. An toàn: điều gì nhắc bằng văn bản, điều gì phải kiểm bằng máy?

| Rủi ro                               | Chỉ dẫn/quy trình                                     | Cơ chế cần có hoặc kiểm tra                                                                                                                |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Sửa lan sang project khác            | Khoanh scope và giữ diff có sẵn                       | Sandbox có writable roots đúng; xác minh trên từng máy                                                                                     |
| Lộ bí mật                            | Không in .env/token; dùng tài khoản/dữ liệu dev       | Tách credentials production khỏi môi trường agent; kiểm read restrictions nếu runtime hỗ trợ; Gitleaks chỉ phát hiện trong phạm vi nó quét |
| Lệnh xóa dữ liệu hoặc deploy nhầm    | Xác nhận rõ môi trường/phạm vi trước thao tác phá hủy | Quyền DB/cloud tối thiểu, local dev riêng, không cấp production credential mặc định                                                        |
| Web/issue/tệp dụ agent chạy lệnh     | Nguồn ngoài là dữ liệu, không là ủy quyền             | Hạn chế tools/mạng theo nhu cầu; review hook/plugin/MCP trước khi chạy                                                                     |
| Commit/PR né cổng                    | Không giảm test/check để làm xanh                     | Required CI + review của người khác, xác minh branch protection                                                                            |
| AI tự sửa luật kiểm tra rồi vượt qua | Thay rule/config phải có lý do và reviewer            | Review kỹ CI, harness scripts, agent config và package scripts; quyền merge vẫn thuộc nhóm                                                 |

Tự do sửa code/test và chạy check local trong task đã giao; không hỏi lại cho mỗi bước thông thường. Khi cần quyền mới, thay phạm vi đã chốt, xóa dữ liệu, chạm staging/production hoặc phát hành thì phải có ủy quyền tương ứng. Cấu hình phê duyệt còn tùy công cụ/tổ chức; báo cáo không thay cấu hình đang có hiệu lực.

Không coi `.gitignore`, workspace-write hay dòng “không đọc secret” là bảo đảm secret không thể bị đọc. Docker socket, trình duyệt có phiên đăng nhập và MCP cũng là khả năng thực thi/truy cập cần xét riêng. Không thêm hook tùy tiện để duyệt mọi shell command chỉ vì có prefix pnpm: package script và dependency có thể chạy mã khác.

Với Codex: onboarding kiểm phiên bản, nguồn instruction thực nạp, writable roots và quyền mạng/tool hiệu lực; ghi khác biệt App/CLI/OS. Hướng dẫn trên năm máy phải có ca thử chỉ dùng dữ liệu giả: sửa file trong repo được, sửa ngoài scope bị chặn hoặc cần phê duyệt, đọc canary bị cấm nếu đã cấu hình chặn đọc. Không dùng secret thật để thử. Hiện đây là tiêu chí đề xuất, chưa là kiểm tra đã chạy.

## 9. Kiểm tra nào nên bổ sung?

### Kiểm nguồn harness, không giả thành kiểm nghiệp vụ

Một lệnh dự kiến `pnpm check:harness` có thể kiểm entry point/link local tồn tại, nguồn cần dùng không bị ignore, file bắt buộc có trong checkout, scripts được tham chiếu tồn tại, runtime pin giữa manifests/Node/Docker có đồng bộ và không xuất hiện đường dẫn cá nhân trong chỉ dẫn dùng chung.

Checker phải có test: link hỏng, nguồn thiếu, đường dẫn ngoài repo, runtime lệch và trường hợp hợp lệ. Thiết kế rõ giới hạn Markdown/parser; không tuyên bố kiểm mọi anchor/ngữ nghĩa. CI là cổng chung; local hook chỉ hỗ trợ, không thay CI. Không yêu cầu git staging sạch để agent được phép tiếp tục code.

### Ranh giới kiến trúc

Dùng ESLint hiện có cho các import bị cấm rõ ràng, thay vì thêm hệ thống build mới:

- web không import server internals; không đưa secret/config server vào bundle.
- contracts không import Mongoose, mediasoup hoặc ứng dụng web/server.
- Khi module policy/session được triển khai: policy thuần tách khỏi I/O, handler REST/socket gọi service chung; thêm quy tắc đúng với đường dẫn thực, không dựng tầng rỗng để thỏa sơ đồ.

Import lint không tự phát hiện mọi đường gián tiếp hoặc hành vi runtime. Permission/revoke cần test hành vi riêng. Chưa có các rule kiến trúc trên trong ESLint snapshot đã khảo sát.

### Chọn bằng chứng đúng rủi ro

| Loại thay đổi            | Bằng chứng cần nhắm tới                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Tài liệu/chỉ dẫn         | Format, link/source checks và review nội dung; không cần gọi media                       |
| UI/state                 | Lint/typecheck, kiểm hành vi bị đổi, xem browser với trạng thái thành công/lỗi phù hợp   |
| Contract                 | Schema tests, bên gửi/nhận tương thích, reviewer bên sử dụng                             |
| Auth/Workspace/kênh/file | API/socket integration với quyền cho phép và từ chối; không chỉ ẩn nút UI                |
| Policy/media             | Test cùng/khác nhóm, revoke, stale epoch/generation, cleanup; quan sát tài nguyên server |
| TURN/triển khai          | Luồng thật qua hai mạng, forced relay khi nghiệm thu TURN, log/stats không lộ dữ liệu    |

Cổng trước PR vẫn theo CONTRIBUTING. Không diễn giải test chọn lọc trong lúc code thành quyền bỏ required checks. Browser/E2E tự động bổ sung cho hành trình thật khi có feature chạy; các cổng hiện tại chưa chứng minh những hành trình đó.

## 10. Bất biến quan trọng để AI không vô tình phá

Đây là chỉ mục rút từ plan v2, cần dẫn về nguồn khi triển khai; không mở rộng scope:

1. Server quyết định quyền publish/consume và thu tài nguyên khi revoke; client không tự cấp quyền bằng groupId/source truyền lên.
2. Không rò mic/camera/chat/board của nhóm sang nhóm khác; danh sách nguồn và event cũng phải lọc đúng quyền.
3. Một main share; camera vẫn thuộc scope. Quiz/timer/thư viện bài làm và công cụ vẽ nâng cao vẫn ngoài scope.
4. REST/socket không tạo hai bản policy khác nhau; packages/contracts là hợp đồng chia sẻ.
5. Epoch/callGeneration/policyRevision có vai trò riêng; kết quả async cũ không được làm sống lại quyền/tài nguyên đã thu.
6. Reconnect nhận snapshot theo quyền hiện tại; không replay gói private cũ hoặc lấy lại grant đã mất.
7. Freeze/resume là context chung theo scope đã chốt; audio tiếp tục; nét vẽ gắn đúng board/context.
8. Worker/Router khởi động thành công không đủ để ghi camera/mic, breakout hay TURN đã hoàn thành.

[Nguồn phạm vi và kiến trúc](technical-plan.md), [quy ước contracts](contracts/README.md).

Ví dụ task kiểm quyền khi đã có membership: thành viên nhóm A đoán ID Producer của B và yêu cầu consume. Tiêu chí đúng là server từ chối, không tạo Consumer trái phép; UI không hiện nguồn B chưa đủ. Khi chuyển nhóm hoặc revoke, Consumer cũ phải được đóng. Test này có giá trị hơn một checkbox “đã làm breakout”.

## 11. Triển khai theo hai đợt, không kéo dài thành dự án riêng

### Đợt nền dùng chung

Ước lượng ban đầu khoảng một buổi đến một ngày làm việc, cần điều chỉnh theo thực tế:

- Cập nhật drift hiện trạng/Node trong technical plan và mục lục.
- Thêm AGENTS ngắn, hướng dẫn giao task/bàn giao; giữ nguồn nghiệp vụ hiện có.
- Thêm checker nhỏ có test và nối CI; tránh rule hình thức không bắt được lỗi thực.
- Chuẩn bị onboarding Codex theo môi trường hiệu lực. Chưa cần plugin/MCP mới, hệ multi-agent hoặc vòng chạy qua đêm.

### Đợt pilot trong feature đầu tiên

- Hai thành viên dùng phiên mới, cùng commit và cùng task brief; kiểm họ tìm đúng nguồn và nêu được ca từ chối trước code.
- Chạy một thay đổi nhỏ thuộc feature đầu tiên đã chọn, ví dụ contract/API auth khi scope chi tiết được chốt; review tích hợp và bằng chứng. Không triển khai feature auth trong đợt nghiên cứu này.
- Thử checker bằng lỗi giả trong fixture/repo tạm: link sai và import bị cấm phải fail nếu rule tương ứng đã có; bản hợp lệ phải pass.
- Clone/install/check trên máy thành viên khác để chứng minh bộ dùng chung không phụ thuộc file/cấu hình chỉ có trên máy hiện tại.
- Sau 2–3 PR, bỏ luật gây tốn công mà không bắt được lỗi; bổ sung guard cho lỗi thực lặp lại.

## 12. Khi nào coi harness đủ dùng?

- Một phiên mới nhận task mà không cần lịch sử chat vẫn tìm đúng nguồn và hiểu ranh giới.
- Repo chứa đủ file đã review; một clone khác cài/chạy được bằng các lệnh đã ghi.
- Checker bắt được ít nhất các lỗi drift/nguồn cụ thể mà nó cam kết kiểm.
- Các kiểm tra auth/media quan trọng có ca từ chối, và bàn giao nói rõ phần chưa kiểm.
- Một người khác review PR; tác giả giải thích được contract, quyền và cách kiểm.
- Không có bước mặc định tắt sandbox, cấp production credentials hoặc bỏ CI.

Theo dõi đơn giản: số PR bị trả vì lệch contract/scope, số lỗi nguồn/checker phát hiện, thời gian review và số lần phải nhắc lại cùng quy tắc. Ghi nhận giới hạn so sánh; không quy mọi thay đổi thời gian cho harness khi độ khó task khác nhau.

**Trạng thái sau báo cáo:** chỉ thêm tài liệu nghiên cứu này. Chưa tạo AGENTS, rules, skills, hooks, config agent hoặc checker; chưa sửa source, CI, dependency, technical plan hay quyền của bất kỳ thành viên nào.
