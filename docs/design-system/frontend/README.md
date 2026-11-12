# CoLearnia — Frontend Design & Development Standards

**Ngày soạn: 07/11/2026 · Trạng thái: đề xuất để team review.** Bộ tài liệu thống nhất cách thiết kế UI, tổ chức frontend và bàn giao giữa các miền M1–M5. Bộ chuẩn đầy đủ vẫn là đề xuất; SCRUM-25 đã triển khai tập token/form auth tối thiểu theo [bằng chứng](../../test-evidence/2026-11-12-scrum-25-auth-ui.md). Việc tạo tài liệu không là nghiệm thu accessibility.

## Vừa nhận task FE thì bắt đầu ở đây

**Làm với Codex:** theo [quy trình giao task cho AI](codex-task-workflow.md). Đưa mã Jira thật hoặc WBS đầy đủ để Codex tự tra mapping và nguồn; có ví dụ `SCRUM-45` ↔ `M1-T7.2` từ lúc nhận việc tới trước PR.

1. Làm theo [hướng dẫn một task FE](fe-task-guide.md): xác định đầu ra → chọn file → thực hiện → kiểm → bàn giao. Không cần đọc hết bộ chuẩn mỗi task.
2. Dùng [checklist tác giả và reviewer](review-checklist.md) trước gửi review; chỉ áp dụng các dòng liên quan.
3. Tra phần chuyên sâu trong bảng dưới khi gặp quyết định cụ thể. Nếu chuyển code từ export, đọc thêm [Figma adoption](figma-adoption.md).

Playbook là cách áp dụng đề xuất của bộ chuẩn, chưa phải quy trình đã được team duyệt hoặc guard đã enforce. Task nhỏ dùng cách ngắn nhất đáp ứng hành vi và quy ước hiện có; không bắt tạo đủ layer, tài liệu riêng hay component catalog mới cho từng task.

## Đọc theo việc

| Phần    | Tài liệu                                         | Kết quả cần thống nhất                            |
| ------- | ------------------------------------------------ | ------------------------------------------------- |
| 1       | [Design Principles](principles.md)               | Nguyên tắc và cách đánh đổi khi thiết kế          |
| 2       | [Design Foundations](foundations.md)             | Màu, chữ, khoảng cách, icon và kích thước         |
| 3       | [Design Tokens](tokens.md)                       | Tên token, semantic surface và cách thay đổi      |
| 4       | [UI Components](components.md)                   | Ownership, API, variants, states và hành vi       |
| 5       | [UX Patterns](ux-patterns.md)                    | Form, bất đồng bộ, lỗi, retry, quyền và thông báo |
| 6       | [Page Layouts](layouts.md)                       | Workspace, chat/thread, lobby và call shell       |
| 7       | [Accessibility](accessibility.md)                | Bàn phím, focus, semantics và cách kiểm           |
| 8       | [Code Architecture](code-architecture.md)        | Cây thư mục, dependency, state, API và runtime    |
| 9       | [Coding Conventions](coding-conventions.md)      | TypeScript, React, styling và nội dung UI         |
| 10      | [Development Workflow](development-workflow.md)  | Review, kiểm thử, thay đổi và bàn giao            |
| Áp dụng | [Chuyển code Figma từng phần](figma-adoption.md) | Mapping code export, thứ tự chuyển và giới hạn    |

Người thiết kế bắt đầu ở phần 1–7; người làm FE đọc thêm phần 8–10 và kế hoạch chuyển code. Khi nhận task chỉ cần mở các mục liên quan; không bắt mọi người đọc toàn bộ lịch sử.

## Hiệu lực và nguồn sở hữu

- Quy tắc sản phẩm lấy từ [mục lục nguồn](../../README.md), [trạng thái quyết định](../../decision-status.md) và [FR/AC](../../product/functional-requirements.md). Bộ này không thay quyền, scope, hạn mức hoặc vòng đời đã chốt.
- Kiến trúc nền theo [architecture](../../architecture.md); API và lỗi theo [contracts](../../contracts/README.md), [API conventions](../../contracts/api-conventions.md), [error codes](../../contracts/error-codes.md). Git/checks theo [CONTRIBUTING](../../../CONTRIBUTING.md), [code quality](../../code-quality.md) và [workflow AI](../../ai/workflow.md).
- UI tham chiếu nằm ở [handoff](../../ui/figma-handoff.md), [current-state](../../ui/figma-current-state.md). Export [figma-ui](../../figma-ui/) là prototype tham khảo, không phải frontend sản phẩm đã tích hợp.
- **Kế thừa:** các quy tắc sản phẩm và kỹ thuật đã được nguồn hiện hành xác nhận. **Đề xuất mới:** palette, scale, component API, cấu trúc chi tiết và tiêu chí review trong bộ này; cần team review trước áp dụng rộng. **Chưa kiểm:** mọi khẳng định về runtime, tương phản trên màn thật hoặc thiết bị chưa có evidence.

Nếu hai nguồn hiện hành mâu thuẫn, nêu hai nguồn và hỏi người phụ trách trước phần phụ thuộc. Không sửa nghiệp vụ để khớp prototype. Các hình cũ còn bước host duyệt DISCUSSION hoặc chuyển owner không là căn cứ thêm lại chức năng.

## Hướng scale

Một app, một bộ primitive và một call controller. Module chia theo nghiệp vụ; người phụ trách miền giữ interface/review kể cả khi người khác hỗ trợ triển khai. Shared UI không biết workspace role, host hoặc server ACL. Các miền ghép qua props/public API tại composition root, tránh import vòng và store toàn cục chứa mọi thứ.

Khởi đầu trong `apps/web`; chưa tách package UI hoặc cài Storybook/form library/icon library chỉ vì tài liệu đề cập. Chỉ cân nhắc package riêng khi có consumer thứ hai thực tế và đã rõ owner, public API, build/version. Có thể làm trang catalog nội bộ bằng hạ tầng đang có trong task riêng; không mở nó thành tính năng sản phẩm.

## Các điểm cần review trước khi áp dụng

| Điểm               | Phạm vi cần review                                                                             | Phần vẫn làm độc lập được                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Palette/font/scale | Visual review và đo contrast trên Workspace/media                                              | Tách semantic token và xác định ownership                                                |
| Primitive phức tạp | Dialog/menu/focus, dùng native hay thư viện sau đánh giá                                       | Định nghĩa hành vi và ca kiểm; không tự thêm dependency                                  |
| Board/recording    | Fade nét tạm, cảnh báo trước 3 giờ, quota/quyền xóa còn mở theo nguồn                          | Layout/state không phụ thuộc giá trị chưa chốt                                           |
| Chỉ dẫn cũ         | Web AGENTS còn câu host mất mạng quá grace; nguồn product/root hiện hành yêu cầu thay tạm ngay | Dùng nguồn chuyên biệt để mô tả UI; báo người phụ trách trước code phụ thuộc nếu chưa rõ |

**Workflow đã cập nhật trên main:** [AI workflow](../../ai/workflow.md) và [CONTRIBUTING](../../../CONTRIBUTING.md) dùng Jira nhận việc/trạng thái, GitHub lưu code/PR/review. Root AGENTS vẫn còn câu GitHub Issues nhận việc; đây là chỉ dẫn cũ cần người phụ trách đồng bộ, không là quyết định tracker còn chờ chọn. Bộ chuẩn dẫn quy trình hiện hành, không tạo tracker khác hoặc tự sửa chỉ dẫn ngoài phạm vi. Các thao tác ngoài repo cần được giao rõ theo [workflow FE](development-workflow.md#cập-nhật-tiến-độ-và-gửi-review).

Thứ tự đề nghị: review nền và primitive → thử một lát cắt TEXT trong app chính → ghép call shell/controller → các panel miền → hồi quy. Chưa có assignee, lịch cam kết hoặc xác nhận team duyệt bộ chuẩn.
