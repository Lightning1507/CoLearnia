# 10. Development Workflow

**Quy trình áp dụng bộ chuẩn · 07/11/2026.** Dẫn lại [CONTRIBUTING](../../../CONTRIBUTING.md), [AI workflow](../../ai/workflow.md), [task template](../../ai/task-template.md), [Sprint 1](../../planning/sprint-1.md) và [local runbook](../../runbooks/local-development.md). Bộ này không tạo tracker, CI gate hoặc chính sách merge mới.

**Thực hiện hằng ngày:** mở [playbook một task FE](fe-task-guide.md), rồi tự rà [checklist trước review](review-checklist.md). Trang này giải thích quy trình chung; playbook giúp chọn bước và đầu ra cụ thể, không thay ticket Jira hoặc mẫu PR của repo.

## Nhận một đầu ra nhỏ

Task ghi màn/flow, FR/AC, owner miền, reviewer/consumer, trạng thái đầu, giới hạn và evidence cần có. Nhận ticket thực trên Jira theo [workflow hiện hành](../../ai/workflow.md); Jira giữ trạng thái, assignee và lịch, GitHub giữ code/PR/review. Không tạo GitHub Issue trùng task hoặc bảng tiến độ riêng trong docs.

Tra mã Jira ↔ WBS bằng [mapping](../../planning/jira/jira-key-mapping.csv), rồi đọc Sprint/WBS và nguồn của task. Mapping là dữ liệu đối chiếu, không chứng minh dependency đã Done. Nếu chưa truy cập được ticket, ghi rõ giới hạn, dùng nguồn repo cho phần độc lập và hỏi thông tin thực sự còn thiếu; không báo đã kiểm trạng thái Jira.

Đổi component/token dùng chung phải có danh sách consumer và người review interface. M1/M3 review nền shell; M2/M4/M5 review slot họ dùng. Không bắt cả nhóm chờ một thư viện hoàn chỉnh; làm primitive tối thiểu và lát cắt có fixture đúng contract.

## Quy trình từ Figma tới app

1. Đọc current-state và FR liên quan; nhận diện bản sau v14 và các ca chưa kiểm.
2. Chụp/ghi flow mục tiêu với role/scope, pending/error/Hủy/revoke; ghi phần đề xuất thị giác.
3. Review interface nhỏ với consumer; tạo code trong app chính theo [architecture](code-architecture.md), không thay app bằng export.
4. Kiểm gần thay đổi, preview app thật và một flow lân cận; sửa rồi kiểm lại.
5. PR ghi kết quả thực chạy, ảnh/ca chưa kiểm và giới hạn mock. Người khác review trước merge theo quy trình repo.

Quy trình prototype vẫn là prompt trong chat → người phụ trách chạy Make → Codex review preview/test flow → prompt fix nếu cần → lượt mới. Không tạo file prompt hoặc tự publish. Khi triển khai app chính, không nhập state demo như authority thật.

## Kiểm tra theo mức thay đổi

| Thay đổi            | Kiểm tối thiểu phù hợp                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Docs                | Format, link/file, diff và harness nguồn; review ngữ nghĩa                                   |
| Token/CSS           | Màn consumer ở sáng/tối, hai desktop, keyboard/focus/contrast; build/typecheck khi liên quan |
| Primitive tương tác | Hành vi keyboard/dialog/error/disabled và consumer bị ảnh hưởng; test có ý nghĩa             |
| Feature/chat/quyền  | Allow/deny, pending/error/retry, revoke và stale callback theo AC                            |
| Media/controller    | Resource cleanup/generation/StrictMode; media smoke và evidence cuộc gọi thực tương ứng      |
| PR sản phẩm         | `pnpm check` và các kiểm chuyên biệt liên quan theo repo                                     |

Lệnh chuẩn, không thay bằng kết quả mock:

```sh
pnpm exec node --version
pnpm doctor
pnpm check:harness
pnpm --filter @colearnia/web typecheck
pnpm check
```

Lint/test gần thay đổi theo root AGENTS. Khi contracts source đổi hoặc thiếu dist, build contracts trước kiểm consumer. Dependency dùng frozen lockfile; không copy lockfile export. Media thay đổi chạy `pnpm media:smoke`, nhưng smoke native không chứng minh mic/camera/TURN. Nếu lệnh không chạy vì môi trường, ghi lỗi/chưa chạy; không sửa gate cho xanh.

Không bắt PR tài liệu chạy media hoặc mọi loại test. Không gọi harness/link pass là UI đã đạt, hay browser mock là server ACL đã đúng. Tool automation mới cần task và review dependency; Storybook/visual regression chưa là công cụ repo đã có chỉ vì được đề xuất.

Test logic Node, kiểm UI thủ công và hạ tầng DOM/browser chưa có được phân biệt trong [hướng dẫn chọn kiểm tra](fe-task-guide.md#6-chọn-kiểm-tra-vừa-đủ-nhưng-có-bằng-chứng). Vitest hiện không nhận `.test.tsx`; `pnpm check` pass không chứng minh component/flow browser đã được test. Khi thay shell/panel, dùng [ma trận responsive và ca chuyển bố cục](layouts.md#responsive-và-kiểm-bố-cục) cùng hai mốc desktop, không chỉ chụp một kích thước.

## Evidence và Definition of Done

Ảnh ở UI evidence theo quy trình hiện có, tên có ngày/flow/state, kèm bước thử và preview/app/public. Không ghi đè ảnh lỗi trước sửa để mất đối chiếu. Với app implementation ghi commit/môi trường/browser/viewport, kết quả thật và link PR; dữ liệu giả có nhãn. Không đưa dữ liệu cá nhân/secret vào ảnh.

Một component đủ để nhận khi API/ownership rõ, states/keyboard/surface được review, consumer dùng được và kiểm liên quan có kết quả. Một feature sản phẩm cần cả server/contracts/ACL/cleanup/tích hợp theo DoD nguồn; chỉ dựng UI chưa hoàn thành feature. Bộ chuẩn tài liệu chưa có nghĩa cả catalog đã implemented.

Theo [quy trình bàn giao](../../ai/workflow.md#cập-nhật-tiến-độ-và-gửi-review), Jira chỉ chuyển **Done** khi đủ tiêu chí task, PR liên quan đã được duyệt, checks bắt buộc đạt và đã merge. Bên nhận task phụ thuộc xác nhận đầu ra dùng được; không lấy việc có file, mở PR hoặc Codex báo xong làm bàn giao hoàn tất.

## Git và PR

Tuân [quy ước nhánh/commit/title/body](../../../CONTRIBUTING.md#nhánh-và-pr). Khi có ticket, giữ cùng mã Jira thật trong nhánh, commit và PR; WBS/PB/UC chỉ để truy vết nguồn, không thay mã Jira. Ví dụ cho task shell `SCRUM-45` (`M1-T7.2`):

| Nơi ghi  | Ví dụ                                             |
| -------- | ------------------------------------------------- |
| Nhánh    | `feat/SCRUM-45-workspace-shell`                   |
| Commit   | `feat(workspace): add workspace shell [SCRUM-45]` |
| PR title | `feat(workspace): add workspace shell [SCRUM-45]` |

Chưa có ticket thì bỏ mã, không tạo mã hoặc reviewer giả. Ví dụ docs không gắn ticket: `docs(ui): propose frontend design and development standards`. PR body tiếng Việt nêu What/Why, Environment Variables và Developer Test; thêm How/Limits khi cần. `Refs #...`/`Closes #...` chỉ dùng khi thật sự có GitHub Issue, không dùng để thay liên kết Jira.

### Cập nhật tiến độ và gửi review

Thành viên thực hiện theo [workflow và mẫu comment của team](../../ai/workflow.md#cập-nhật-tiến-độ-và-gửi-review), không chép nhật ký vào description của task:

1. Khi bắt đầu: kiểm đầu vào/reviewer, chuyển **In Progress**, comment dự kiến gửi PR và đầu vào còn chờ. Block hoặc có nguy cơ trễ thì cập nhật ngay, báo bên bị ảnh hưởng.
2. Sau tự kiểm: gắn PR vào ticket, chuyển **In Review**, request reviewer chính trên GitHub; contract thay đổi mời thêm consumer review. Reviewer không được trùng người thực hiện, cần PM phân công lại nếu trùng.
3. Gửi link PR vào nhóm kèm tag reviewer chính. Kết quả kiểm nằm trong PR; nhận xét và quyết định review giữ trên PR. Sửa xong trả lời comment và request review lại.
4. Sau khi push/mở PR: kiểm **Development** trên Jira có liên kết đúng nhánh/commit/PR. Kết nối không mặc định tự chuyển trạng thái ticket; điều kiện Done theo mục trên.

Các thao tác Jira/GitHub/nhắn nhóm ở đây là việc thành viên cần thực hiện. Codex chỉ thao tác ngoài repo hoặc gửi tin khi được giao rõ; có thể soạn nội dung để thành viên dùng, không tự cập nhật ticket hay gọi reviewer từ task code/docs.

Thay shared API có migration consumer; thay token có ảnh/contrast khi đã kiểm; thay runtime có cleanup/revoke evidence. Chưa chạy `pnpm check` phải ghi lý do. Chỉ commit/push/publish/merge khi được giao tương ứng; task viết docs không tự ủy quyền các bước đó.

## Duy trì khi scale

Thay quy tắc ở nguồn sở hữu, cập nhật link và consumer trong cùng PR; không sao chép policy/API ra nhiều file. Breaking change có hướng chuyển và kiểm consumer, không giữ fork component mỗi miền. Nếu cần exception, ghi lý do, phạm vi và việc xử lý ở ticket liên quan; không thêm ignore rộng.

Sau lát cắt đầu, review mức dùng lại và lỗi tích hợp để sửa bộ chuẩn. Không tạo bảng trạng thái dự án hoặc tỷ lệ hoàn thành riêng trong design-system. Danh mục ở đây mô tả quy chuẩn, trạng thái task giữ ở công cụ chung.
