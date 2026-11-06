# Làm một task FE từ đầu tới bàn giao

**Playbook đề xuất · 07/11/2026.** Dùng cho người nhận task và Codex. Mục tiêu: mở đúng nguồn, sửa đúng nơi, dùng chung pattern và để người khác kiểm lại được. Quy tắc nghiệp vụ/kiến trúc hiện hành có hiệu lực theo [README](README.md); không tự chốt điểm mâu thuẫn hoặc chưa rõ.

## Bản ngắn để dùng mỗi ngày

Nếu dùng Codex, mở [quy trình thao tác với AI](codex-task-workflow.md): giao task để đọc/đề xuất trước, cho triển khai sau, tự thử lại và rà trước PR. Trang đó có prompt sao chép và ví dụ; các bước dưới giải thích cách thực hiện task FE.

1. **Hiểu đầu ra:** người dùng nào, màn nào, bấm gì, mong đợi gì; lấy FR/AC và Figma liên quan.
2. **Tìm phần có sẵn:** component, hook, API/schema, style và test cùng miền; xem trạng thái implemented/mock/chưa có.
3. **Chọn phạm vi file:** view ở feature, dữ liệu ở hook/API, shared chỉ khi thực sự dùng chung; xác định nguồn state và cleanup.
4. **Làm hành vi đủ dùng:** thành công + pending/rỗng/lỗi/Hủy/quyền theo task; dùng pattern/token đã có, không bịa backend.
5. **Kiểm:** lint/typecheck/test liên quan, browser flow và hồi quy gần thay đổi; `pnpm check` trước PR theo repo.
6. **Bàn giao:** thay gì, đã thử gì, còn mock/lỗi/chưa kiểm gì; dẫn ticket/nguồn và evidence thật. Gửi review/cập nhật Jira theo workflow; Done sau đủ AC, review/checks đạt và đã merge.

Task đổi chữ/spacing không cần dựng hook/API. Task có async/quyền cần kiểm lifecycle tương ứng. Không hoàn tất bằng cách chỉ cho luồng thành công chạy.

## 1. Làm rõ sáu điều trước khi sửa

Ghi gọn trong ticket hoặc brief đang dùng, không tạo file kế hoạch riêng nếu task không cần:

Nếu task đã có, thành viên chỉ đưa mã Jira thật hoặc WBS đầy đủ và thông tin mới ngoài repo. Codex tra [mapping](../../planning/jira/jira-key-mapping.csv), ticket nếu truy cập được, Sprint/WBS và code rồi tự điền sáu điều dưới để đối chiếu; không yêu cầu người nhận chép lại AC, dependency hoặc viết brief thứ hai. Jira giữ trạng thái/assignee/lịch thực tế, mapping không chứng minh dependency đã hoàn thành. Không truy cập được ticket phải ghi rõ; chỉ dùng mẫu để bổ sung chỗ nguồn thật sự còn thiếu. Cách trao đổi ở [quy trình Codex](codex-task-workflow.md).

```text
Đầu ra: [vai trò] tại [màn/context] làm [thao tác] và thấy [kết quả].
Nguồn: [FR/AC + mục product] và [màn Figma/kết quả UI gần nhất].
Phạm vi: [phần sửa]; ngoài phạm vi: [phần dễ nhầm nhưng không làm].
Điểm giao: [schema/API/component/port đã có hoặc đang chờ; owner/consumer].
State/lifecycle: [ai sở hữu dữ liệu; khi đổi đích/mất quyền/unmount thì xử lý gì].
Cách kiểm: [luồng đúng, nhánh lỗi/Hủy/quyền liên quan, hồi quy].
```

Đây là phần cụ thể hóa FE của [task brief chung](../../ai/task-template.md), không là mẫu tracker/PR mới. Không tự điền người, mã ticket, deadline hoặc API chưa chốt. Thiếu nghiệp vụ thì hỏi người phụ trách trước phần phụ thuộc, tiếp tục phần độc lập nếu có.

**Phân biệt đầu ra:** task UI mock, task FE nối API và feature tích hợp toàn hệ thống là ba phạm vi khác nhau. Fixture giúp dựng view khi provider chưa có; không đánh dấu nối API hoặc feature Done từ fixture.

## 2. Tìm code trước khi tạo mới

Tìm theo tên màn, hành vi và component bằng `rg`/IDE; đọc chỗ gọi để hiểu API và consumer. Kiểm trong app chính trước, rồi mới tham khảo export. Code export nằm trong docs không mặc nhiên là shared component dùng được.

| Cần biết                        | Xem ở đâu                                                                              | Quyết định cần lấy ra                        |
| ------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| Nghiệp vụ/quyền                 | Product/FR theo [mục lục](../../README.md)                                             | Ai được làm, phạm vi và hậu quả              |
| UI hiện có/chưa kiểm            | [Current-state](../../ui/figma-current-state.md), Figma/export liên quan               | Giữ gì, sửa gì, không lấy ảnh cũ làm policy  |
| Component/style đang triển khai | `apps/web/src` và public API feature                                                   | Dùng lại được chưa, state/props nào thiếu    |
| API/schema/lỗi                  | `packages/contracts`, API feature và [conventions](../../contracts/api-conventions.md) | Input/output/error thực có, phần còn đề xuất |
| Cách đặt file                   | [Code architecture](code-architecture.md)                                              | Owner và chiều dependency                    |

Hiện catalog trong [components](components.md) là **thiết kế đề xuất**, chưa phải thư viện đã có đủ Button/Dialog/Field. Nếu thiếu primitive cần dùng, chỉ triển khai phần tối thiểu của task cùng consumer review; không yêu cầu người khác tự tìm một API chưa tồn tại. Sau triển khai cập nhật tài liệu/component example theo phạm vi, để task sau biết phần nào dùng được.

## 3. Chọn chỗ đặt code bằng bảng này

| Công việc                        | Chỗ sửa trước                                        | Không làm                                              |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Đổi label/spacing của một màn    | Component/style của feature đó                       | Tạo helper hoặc global state mới                       |
| Thêm form nghiệp vụ              | Feature component + hook khi có async/logic cần tách | Đặt form quản trị vào shared UI                        |
| Nối API                          | `feature/api` + hook Query/mutation + schema task    | Fetch trong từng row hoặc hardcode response thành công |
| Thêm state panel/selection       | Local component/hook                                 | Store toàn app cho một menu                            |
| Lấy REST data                    | Query cache của miền                                 | Copy nguyên data sang Zustand                          |
| Dùng session/host/group state    | Projection M4 qua public API đã review               | Tự suy host từ vai trò Workspace hoặc demo             |
| Quản lý track/audio/subscription | Runtime owner và cleanup API tương ứng               | Tạo media/socket trong panel                           |
| Ghép nhiều feature vào màn       | `app/layouts`/entry composition                      | Deep import store miền khác để sửa trực tiếp           |
| Sửa UI dùng chung                | Primitive/pattern hiện có + consumer                 | Copy thêm một bản Button riêng của mình                |

Một file view và một hook có thể đủ cho task nhỏ. Thêm `model/api/runtime` khi trách nhiệm thực sự xuất hiện. Đề xuất cây tối thiểu cho task form có API:

```text
features/channels/
  components/RenameChannelDialog.tsx  # View, field/error/focus
  hooks/useRenameChannel.ts          # Pending, gọi API, cập nhật đúng cache
  api/channelsApi.ts                 # Dùng lại module có sẵn nếu đã có
  index.ts                           # Chỉ thêm export khi consumer bên ngoài cần
```

Tên/file là ví dụ tổ chức, không là danh sách phải sinh đủ hoặc chứng minh API đã triển khai. Kiểu DTO từ contracts; state chỉ phục vụ view để trong feature.

## 4. Thực hiện theo cùng một pattern

### View và hành vi

View nhận dữ liệu/action có kiểu; hook/use case xử lý async và cập nhật state/cache. Primitive không biết quyền/endpoint. Native field có label, nút có type/name, pending có phản hồi; giữ focus và input an toàn khi lỗi. Chi tiết ở [UX patterns](ux-patterns.md) và [accessibility](accessibility.md).

Reuse primitive/token đang có; nếu chưa có, đánh dấu phần cần triển khai trong task. Palette/scale mới trong bộ này còn đề xuất, không tự đổi toàn app để một màn trông khớp. Không mang selector global/lockfile/Vite config Figma sang app chính.

### API và nguồn state

- Giữ một nguồn cho mỗi dữ liệu: REST cache ở Query, projection phiên ở M4, input tạm local, native resource ở controller.
- Dùng schema/envelope/error code chung; không so chuỗi message để phân nhánh. UI chỉ báo thành công khi kết quả xác định.
- Cập nhật/invalidate đúng đích và context; không invalidate toàn app để tránh thiết kế key. Mất quyền phải remove dữ liệu private, không chỉ invalidate để chờ fetch lại.
- Response của request cũ phải kiểm identity/context trước ghi hoặc đóng dialog mới. Abort không thay kiểm này.
- Mutation không tự retry trừ khi contract cho phép và có identity/idempotency phù hợp. Chưa rõ kết quả thì đối soát, không tạo operation mới mù.

### Khi chưa có backend hoặc gặp lỗi môi trường

| Tình huống                                | Cách tiếp tục thống nhất                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Có contract, provider chưa chạy           | Fixture/adapter có nhãn theo cùng shape; dựng states và ghi chưa tích hợp                              |
| Chưa có contract hoặc hai nguồn mâu thuẫn | Ghi input/output/error cần chốt và hỏi owner/consumer; làm view độc lập nếu không phụ thuộc quyết định |
| Auth/quyền chưa tích hợp                  | Không dùng role switch làm quyền sản phẩm; giới hạn task ở mock nếu được giao                          |
| Picker/browser/API không thao tác được    | Ghi bước bị chặn và lỗi thật; chưa gọi ca đó đạt                                                       |
| Shared primitive cần thay API             | Review với consumer và chuyển chỗ gọi liên quan; không tạo fork để né review                           |

Fixture để cạnh feature/test hoặc demo entry cô lập, không fallback sang dữ liệu giả khi API production lỗi. Chọn provider ở điểm khởi tạo đã review, không rải `if (demo)` trong mọi view. Không cần thêm DI framework để làm điều này.

## 5. Ví dụ hoàn chỉnh: đổi tên kênh

Ví dụ minh họa cách nhận một task FE M1, không phải task mới đã giao. Nghiệp vụ/quyền lấy từ [Workspace/kênh](../../product/workspace-channels.md); payload, revision và lỗi theo contract của task.

| Bước                            | Cách thực hiện                                                             | Kết quả cần kiểm                                                    |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Mở form                         | Entry nhận kênh hiện hành còn quyền; điền tên đang có                      | Đúng tên/đúng kênh, focus vào field                                 |
| Sửa và Hủy                      | Input local; Hủy chưa submit                                               | Tên ở sidebar/header không đổi                                      |
| Submit                          | Hook gửi payload hợp lệ với revision/context theo contract                 | Pending rõ, không gửi trùng do click lặp                            |
| Thành công                      | Cập nhật hoặc invalidate các query đúng kênh/Workspace theo kết quả server | Sidebar/header liên quan nhất quán; đóng đúng form của operation đó |
| Validation/network lỗi xác định | Error gần field/form, giữ tên đã nhập                                      | Có thể sửa/thử lại khi còn quyền; không giả đã đổi tên              |
| Conflict                        | Đồng bộ trạng thái mới và hướng người dùng xem lại                         | Không âm thầm ghi đè tên mới của người khác                         |
| Mất quyền/kênh bị xóa/đổi đích  | Dọn view/pending theo context; phản hồi cũ không áp vào đích mới           | Không hiện lại nội dung cũ, không đóng nhầm form mới                |

Task này không sửa TEXT/LIVE hoặc accessMode, không thay policy server. Unit/integration cần chọn nhánh rủi ro thực; browser kiểm form, cache consumer và focus. Nếu chỉ nối mock thì ghi đúng mức mock, chưa đánh dấu API/quyền server đạt.

## 6. Chọn kiểm tra vừa đủ nhưng có bằng chứng

### Chọn cách kiểm theo tooling thực có

Hiện [Vitest config](../../../vitest.config.ts) chạy `environment: 'node'` và chỉ nhận `apps/**/src/**/*.test.ts`, `packages/**/src/**/*.test.ts`. Repo chưa cấu hình môi trường DOM hoặc browser/component test runner; `.test.tsx` chưa nằm trong include. Lệnh Vitest bên dưới dùng cho test logic chạy được trong Node, không phải bằng chứng đã render React hay kiểm keyboard/focus.

| Cần kiểm                                                         | Cách làm hiện tại                                                                                                              | Giới hạn phải ghi                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Logic thuần, reducer, chuyển trạng thái, xử lý response/context  | Test `.test.ts` cạnh code, không cần DOM; chạy đúng file bằng Vitest                                                           | Fixture/mock không chứng minh browser, mạng hoặc ACL thật                                           |
| Component, form/dialog, focus, layout và flow tương tác          | Mở app bằng browser; thao tác theo AC và ghi bước/kết quả thực                                                                 | Đây là kiểm thủ công, chưa có component/browser test tự động                                        |
| Hành vi chỉ tái hiện được qua DOM/browser và cần hồi quy tự động | Nêu ca kiểm, đề xuất task bổ sung runner/environment/dependency cùng consumer review; trong lúc đó kiểm thủ công phần làm được | Nếu chưa kiểm được thì ghi chưa kiểm/blocker; không tạo `.test.tsx` rồi coi `pnpm check` đã chạy nó |

Không đổi đuôi test sang `.test.ts` để né thiếu DOM, hoặc tự thêm runner/dependency từ task UI. Nếu task đã giao bao gồm hạ tầng test, triển khai trong phạm vi đó và kiểm test mới thực sự được discover/chạy; không thêm `skip` hay sửa gate để có kết quả xanh. Khi cấu hình thay đổi, cập nhật bảng này theo code thực.

### Lệnh và kiểm browser

Chạy từ repo root, thay đường dẫn minh họa bằng file thực của task:

```sh
# Khi vừa chuẩn bị môi trường: theo runbook, không lặp install mỗi task.
pnpm exec node --version
pnpm doctor

# Lint gần thay đổi; <file-thực-tế> là placeholder, không chạy nguyên dòng.
pnpm exec eslint <file-thực-tế>
pnpm --filter @colearnia/web typecheck

# Test logic chạy trong Node: thay bằng file .test.ts thực của task.
pnpm exec vitest run <test-file-thực-tế>

# Cổng trước PR theo repo.
pnpm check
```

Nếu contracts thay đổi hoặc dist chưa có, build `@colearnia/contracts` trước kiểm consumer. Media thay đổi cần smoke và bằng chứng media tương ứng; task đổi chữ không cần dựng media test. Không viết test chỉ sao chép JSX/implementation hoặc tạo test file cho đủ checklist.

**Browser:** mở màn trong app thực, kiểm thành công và nhánh rủi ro liên quan; UI/layout ở 1280×800 và 1440×900 khi bị ảnh hưởng. Nếu đổi shell/panel responsive, kiểm thêm các biên và ca chuyển bố cục trong [layouts](layouts.md#responsive-và-kiểm-bố-cục). Thử keyboard/focus với form/dialog; thử tên dài, loading/rỗng/lỗi với danh sách. Thay shared component thì kiểm consumer lân cận. Ghi browser, viewport, mức zoom, bước thử và kết quả; không coi build hoặc `pnpm check` pass là đã thử flow/DOM.

**Tài liệu:** chỉ kiểm format/link/harness phù hợp nếu không thay code. Lỗi môi trường phải ghi, không sửa ignore/test/gate để làm xanh. Bảng đầy đủ ở [workflow](development-workflow.md).

## 7. Tự rà rồi bàn giao

Dùng [checklist](review-checklist.md), chuyển kết quả sang PR template của repo. Một cập nhật ngắn đủ dùng:

```text
Đã đổi: [hành vi/file chính và lý do].
Đã kiểm: [lệnh + kết quả; bước browser + môi trường/viewport].
Mức tích hợp: [UI mock / FE nối provider thật / tích hợp đã kiểm].
Còn lại: [lỗi, ca chưa kiểm, blocker hoặc quyết định cần chốt].
Nguồn/evidence: [ticket, FR/AC, tài liệu và ảnh/log an toàn nếu cần].
```

Không yêu cầu mọi task có một file evidence mới. UI prototype cập nhật current-state khi thực sự review/sửa Make; task app implementation ghi PR/ticket/evidence phù hợp, không tự nâng trạng thái prototype. Commit/push/publish theo ủy quyền, không tự làm chỉ vì code/check đã xong.

Thành viên cập nhật dự kiến gửi PR/blocker trên Jira, gắn PR và request reviewer/tag nhóm khi gửi review theo [workflow FE](development-workflow.md#cập-nhật-tiến-độ-và-gửi-review). Dùng cùng mã Jira thật trong nhánh/commit/PR nếu có ticket; không tạo GitHub Issue trùng. Chỉ Done khi đủ tiêu chí task, review/checks bắt buộc đạt và đã merge; consumer xác nhận đầu ra dùng được. Codex không tự cập nhật ticket/gửi tin từ yêu cầu triển khai code.

## Tra nhanh khi phân vân

| Câu hỏi                              | Mở tài liệu                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| File/hook/state/import đặt ở đâu?    | [Code architecture](code-architecture.md)                                    |
| Có nên tạo shared component?         | [Components](components.md)                                                  |
| Dùng màu/chữ/spacing nào?            | [Foundations](foundations.md), [Tokens](tokens.md) và implementation đang có |
| Pending/error/retry/Hủy ra sao?      | [UX patterns](ux-patterns.md)                                                |
| Panel/dialog/toolbar co giãn ra sao? | [Layouts](layouts.md)                                                        |
| Keyboard/focus/label kiểm gì?        | [Accessibility](accessibility.md)                                            |
| Naming/style/TypeScript theo đâu?    | [Coding conventions](coding-conventions.md)                                  |
| Chuyển đoạn code Figma này thế nào?  | [Figma adoption](figma-adoption.md)                                          |
