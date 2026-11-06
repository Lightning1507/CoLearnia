# Quy trình làm việc của team với Jira, GitHub và Codex

Jira dùng để nhận việc và theo dõi tiến độ. GitHub lưu code, PR và nhận xét review. Codex hỗ trợ triển khai; người nhận task chịu trách nhiệm hiểu, kiểm tra và giải thích phần mình làm.

## Nhận việc, triển khai, review

1. **Nhận task trên Jira.** Đọc mục tiêu, phạm vi, tiêu chí hoàn thành, phụ thuộc và reviewer. Chọn task theo thứ tự Sprint; kiểm đầu vào từ các task đang chặn trước khi bắt đầu. Có thể làm phần độc lập đã rõ, nhưng cần báo nếu đầu vào chưa đủ để hoàn thành.
2. **Đọc đúng nguồn.** Bắt đầu từ tài liệu được dẫn trong ticket và bảng bên dưới. Chưa rõ nghiệp vụ hoặc thấy nguồn mâu thuẫn thì hỏi PM/người phụ trách trước phần code phụ thuộc; không để AI tự chọn quy tắc sản phẩm.
3. **Tạo nhánh và triển khai.** Một nhánh cho một đầu ra có thể review. Khi giao Codex, nêu mã task, phạm vi, nguồn cần đọc và tiêu chí hoàn thành; dùng [task brief](task-template.md) nếu cần. Không cần viết plan dài cho thay đổi nhỏ.
4. **Tự kiểm trước PR.** Xem diff, chạy kiểm tra phù hợp và `pnpm check`. Với quyền truy cập, kiểm cả trường hợp được phép và bị từ chối; với UI, mở giao diện để thử luồng. Ghi rõ phần chưa kiểm, không coi mock hoặc bản mẫu là chức năng đã chạy thật.
5. **Gửi review và xử lý góp ý.** Làm theo mẫu bên dưới. PR thay đổi contract cần bên sử dụng cùng review; không tự approve hoặc bỏ checks để merge.
6. **Bàn giao.** Cập nhật tài liệu/contract nếu có thay đổi, báo bên nhận task phụ thuộc. Chỉ chuyển Done khi đạt tiêu chí, PR được duyệt, checks đạt và đã merge.

## Liên kết task Jira với GitHub

GitHub–Jira đã được kết nối cho repo CoLearnia. Để Jira nhận biết code thuộc task nào, dùng **mã ticket thật**, ví dụ `SCRUM-25`:

| Nơi ghi    | Ví dụ                                                       |
| ---------- | ----------------------------------------------------------- |
| Tên nhánh  | `feat/SCRUM-25-auth-ui`                                     |
| Commit     | `feat(auth): add login form [SCRUM-25]`                     |
| Tiêu đề PR | `feat(auth): add registration and login screens [SCRUM-25]` |

Giữ tiêu đề PR bằng tiếng Anh và description bằng tiếng Việt theo [CONTRIBUTING](../../CONTRIBUTING.md#nhánh-và-pr) và [PR template](../../.github/pull_request_template.md). Mã WBS như `M1-T4.1` dùng để đối chiếu kế hoạch; mã `SCRUM-25` dùng để liên kết Jira. Không cần tạo thêm GitHub Issue cho cùng task.

Sau khi push/mở PR, kiểm mục **Development** trên ticket Jira để thấy nhánh, commit hoặc PR tương ứng. Đồng bộ có thể mất một lúc; nếu chưa thấy, kiểm mã ticket và repo đã kết nối trước khi báo PM. Kết nối này giúp tìm code và PR từ Jira; **team vẫn chủ động cập nhật trạng thái ticket**, không mặc định mở PR hoặc merge sẽ tự chuyển trạng thái.

## Cập nhật tiến độ và gửi review

Mỗi người cập nhật tại **Activity → Comments** của ticket Jira ở các thời điểm dưới đây. Description giữ mục tiêu, phạm vi và tiêu chí hoàn thành; không thay bằng nhật ký tiến độ.

### Khi bắt đầu task

Kiểm đầu vào, chuyển sang **In Progress** và comment:

```text
Dự kiến gửi PR: [ngày/buổi hoặc giờ].
Đầu vào còn chờ: [nội dung và người cung cấp] / Không có.
```

Estimate là công sức dự kiến; thời điểm gửi PR cần tính cả giờ làm thực tế và đầu vào. Nếu task kéo dài sang ngày tiếp theo, cập nhật ngắn phần đã làm, phần còn thiếu và dự kiến bàn giao.

### Khi bị block hoặc có nguy cơ trễ

Báo ngay trên ticket; nếu cần hỗ trợ hoặc ảnh hưởng người khác, nhắn nhóm và tag người liên quan, không đợi tới cuối ngày.

```text
Đã hoàn thành: …
Đang vướng: …
Cần hỗ trợ từ: [tên người].
Dự kiến bàn giao mới: … / Chưa xác định, cần làm rõ …
```

### Khi gửi review

Sau khi tự kiểm và chuẩn bị PR theo template:

1. Gắn link PR vào ticket Jira, chuyển **In Review** và comment theo mẫu bên dưới.
2. Request người review chính trong **Reviewers** trên GitHub theo phân công của task. Nếu đổi assignee khiến reviewer trùng người làm, PM phân công reviewer khác. PR ảnh hưởng contract cần mời thêm bên sử dụng cùng kiểm.
3. **Gửi link PR vào nhóm và tag người review chính**; không chỉ gửi link rồi chờ mọi người tự nhận review.

```text
PR: [link].
Nhờ [tên reviewer] review.
```

Kết quả kiểm và phần chưa kiểm ghi trong description của PR, không cần lặp lại trong tin nhắn nhóm.

Assignee trên Jira vẫn là người thực hiện khi đang review. Nhóm chat dùng để gọi người và phối hợp; nhận xét, cách xử lý và quyết định review lưu trên PR. Khi sửa xong, trả lời comment và request review lại. Chỉ chuyển **Done** khi đủ tiêu chí của task, PR liên quan đã được duyệt, checks bắt buộc đạt và merge; không coi mở PR là hoàn tất bàn giao. Bên nhận task phụ thuộc xác nhận đầu ra đã dùng được.

## Dùng Codex khi làm task

- Mở Codex tại root repo, yêu cầu đọc [AGENTS.md](../../AGENTS.md) và nguồn liên quan tới task. [Mục lục tài liệu](../README.md) giúp tìm nguồn; [trạng thái quyết định](../decision-status.md) phân biệt điều đã chốt và phần còn cần kiểm chứng.
- Giao việc cụ thể: đầu ra cần có, phần không sửa, contract/phụ thuộc và cách kiểm. Khi kết thúc, yêu cầu agent báo file đã đổi, kiểm tra đã chạy, kết quả và phần còn thiếu.
- Đọc lại code và tự thử trước khi gửi review. Nếu chưa hiểu cách làm hoặc rủi ro, làm rõ trước khi nhận kết quả từ AI.
- Giữ thay đổi có sẵn của người khác. Không cho agent xóa dữ liệu, reset DB, chạy migration, push/merge/deploy khi chưa được giao việc đó. Không đưa secret vào prompt, log hoặc PR.
- Một checkout chỉ có một tác vụ sửa tại một thời điểm; nếu cần làm song song trên cùng máy, dùng worktree và tài nguyên dev riêng.

## Đọc gì theo task?

Workflow không lặp lại toàn bộ nghiệp vụ. Khi code hoặc review, đối chiếu nguồn hiện hành:

| Task liên quan                      | Nguồn cần đọc                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phạm vi và tiêu chí chức năng       | [FR/AC](../product/functional-requirements.md), [phân chia miền](../product/delivery-domains.md) và proposal được dẫn trong ticket                                                                                              |
| API, socket và mã lỗi               | [Contracts](../contracts/README.md), [quy ước API](../contracts/api-conventions.md), [mã lỗi](../contracts/error-codes.md)                                                                                                      |
| Workspace, kênh PRIVATE, DM, thread | [Workspace/kênh](../product/workspace-channels.md), [messaging](../product/messaging.md)                                                                                                                                        |
| Cuộc gọi, share và quyền host       | [Live session](../product/live-session.md), [group modes](../product/group-modes.md)                                                                                                                                            |
| Vẽ, freeze và hỗ trợ nhóm           | [Board](../product/board-collaboration.md), [groups/media policy](../product/groups-media-policy.md)                                                                                                                            |
| Ghi hình và lưu video               | [Recording](../product/recording.md)                                                                                                                                                                                            |
| Dữ liệu, truy vấn và thu quyền      | [Kiến trúc](../architecture.md), [DB model](../database/model.md), [collection design](../database/collection-design.md), [lifecycle](../database/lifecycle.md), [integrity/migration](../database/integrity-and-migrations.md) |
| Media, file và hạ tầng              | [Capacity](../capacity.md), [local runbook](../runbooks/local-development.md)                                                                                                                                                   |
| UI và tiếp tục Figma                | [Bàn giao Figma](../ui/figma-handoff.md), [hiện trạng Figma](../ui/figma-current-state.md)                                                                                                                                      |
| Sửa UC hoặc sơ đồ                   | [Định hình UC](../product/use-case-outline.md), [danh mục UC](../product/use-case-catalog.md), [đặc tả](../product/use-cases/README.md), [bản vẽ](../product/diagrams/README.md)                                                |

## Kiểm tra trước khi bàn giao

Chạy check gần thay đổi trước; lệnh chi tiết ở [local runbook](../runbooks/local-development.md) và [code quality](../code-quality.md).

| Thay đổi             | Kiểm tra cần chú ý                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tài liệu             | Format, `pnpm check:harness`, link và nội dung có thống nhất với nguồn hay không                            |
| TypeScript/React     | Lint, typecheck package, test phù hợp; thử luồng trên trình duyệt khi đổi UI                                |
| Contract             | Build contracts trước khi kiểm các bên sử dụng; kiểm dữ liệu hợp lệ, không hợp lệ và quyền                  |
| Auth, DB, chat, file | Luồng thành công/từ chối; retry, đồng thời và thu quyền khi có liên quan                                    |
| Media/runtime        | `pnpm media:smoke` và kiểm hành vi thực theo task; gate tích hợp cần bằng chứng hai mạng/TURN theo kế hoạch |

Trước PR chạy `pnpm check`; ghi lệnh, kết quả thật và phần chưa kiểm trong PR. CI xanh không thay việc review nghiệp vụ, kiểm quyền hoặc thử mic/camera trên mạng thật. Checker harness kiểm một số nguồn, liên kết và runtime pin; không xác nhận sơ đồ đúng, sandbox an toàn hay hệ thống đạt capacity.

## Thành viên mới bắt đầu

Đọc [onboarding dự án](../team-onboarding.md), cài môi trường theo [local runbook](../runbooks/local-development.md) và chạy `pnpm check`. Khi dùng Codex lần đầu, kiểm agent đọc đúng chỉ dẫn repo và quyền truy cập phù hợp; không bật full access làm mặc định. Gặp lỗi môi trường hoặc check chưa chạy được thì báo rõ, không ghi là đã pass.

Sau vài PR đầu, team cùng điều chỉnh quy trình theo vướng mắc thực tế để tránh lặp lại lỗi và bớt thủ tục không cần thiết.
