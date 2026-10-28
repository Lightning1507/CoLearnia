# Tài liệu CoLearnia — đọc đúng nguồn

## Nguồn nào có hiệu lực?

- [Trạng thái quyết định](decision-status.md) phân biệt nội dung đã chốt, thiết kế khung, phần chờ PoC và thông tin cần nhóm cung cấp; “có trong plan” không đồng nghĩa “đã chọn mọi chi tiết implementation”.
- [Technical plan v2.3](technical-plan.md) giữ kế hoạch tổng thể, lộ trình, feature/test IDs và quyết định baseline. Các mục đã chuyển chỉ dẫn tới nguồn chi tiết ở bảng dưới; sửa quy tắc tại nguồn đích, không nhân bản lại trong plan.
- Tài liệu product/architecture/database mô tả **thiết kế đích**, chưa chứng minh đã triển khai. [README](../README.md), code và [evidence](test-evidence/2026-10-25-initialization.md) ghi hiện trạng theo thời điểm/commit.
- Schema giao tiếp thực nằm ở packages/contracts; [quy ước](contracts/README.md) hướng dẫn mở rộng. Thiếu schema hoặc mâu thuẫn với nghiệp vụ đã chốt cần xử lý trước code phụ thuộc, không âm thầm lấy code cũ làm quyết định sản phẩm.
- ADR Proposed là phương án cần xác nhận. Archive, nghiên cứu và project-overview là nguồn tham khảo; không tự mở rộng scope. Nếu có mâu thuẫn chưa được giải quyết, ghi hai nguồn và hỏi trước phần triển khai bị ảnh hưởng.

## Chọn nguồn theo việc

| Công việc                                           | Nguồn chính                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Phạm vi / use case / điều chưa xác nhận             | [Scope](product/scope.md), plan mục 15–18                           |
| Tài khoản, Workspace, kênh, chat, tệp               | [Bản đồ nghiệp vụ](product/workspace-channels.md)                   |
| General, DM 1–1, thread trong kênh                  | [Messaging](product/messaging.md)                                   |
| Call, thiết bị, share, host, volume, reconnect      | [Live session](product/live-session.md)                             |
| Quyền, chat Everyone/Host, hỗ trợ, về phòng chung   | [Groups/media policy](product/groups-media-policy.md)               |
| MAIN, DISCUSSION, ACTIVITY; request/leave/countdown | [Group modes v2.3](product/group-modes.md)                          |
| Frame, freeze/resume và nét vẽ                      | [Board collaboration](product/board-collaboration.md)               |
| Module, state owner, thứ tự mutation                | [Architecture](architecture.md)                                     |
| Collections / index / DB so với RAM                 | [Database model](database/model.md)                                 |
| Transaction / retention / file cleanup              | [Database lifecycle](database/lifecycle.md)                         |
| REST/socket schema và quy ước                       | [Contracts](contracts/README.md), plan mục 10                       |
| Local / runtime / Mongo / media smoke               | [Local development](runbooks/local-development.md)                  |
| Checks / hooks / review / giới hạn CI               | [Code quality](code-quality.md), [CONTRIBUTING](../CONTRIBUTING.md) |
| Giao việc / Codex onboarding / bàn giao             | [AI workflow](ai/workflow.md), [task template](ai/task-template.md) |
| PoC mediasoup và điều kiện Accepted                 | [ADR-001](adr/001-media-foundation.md)                              |

## Lịch sử và tham khảo — không nạp mặc định

- [Định hình Use Case](product/use-case-outline.md): actor và cấu trúc tổng quan đã được đồng ý sau review; chưa chốt đặc tả/quan hệ/layout Astah, không thay nguồn quyền nghiệp vụ.
- [Danh mục Use Case chi tiết](product/use-case-catalog.md): danh mục giữ/gộp đã được đồng ý sau review; có mục tiêu, actor, điều kiện, kết quả và điểm mở; chưa chốt đặc tả/quan hệ/layout Astah.
- [Review mức mục tiêu UC](product/use-case-review.md): kết quả đã được đồng ý, cơ sở nghiên cứu và lý do giữ/gộp các mục ứng viên; nhóm truy cập đặt trực tiếp trên tổng quan, không cắt feature khi giảm oval.
- [Evidence group modes v2.3/harness](test-evidence/2026-10-27-group-modes-harness.md): kiểm đồng bộ nguồn và guard, chưa là bằng chứng media đạt nghiệm thu.
- [Evidence đồng bộ messaging/harness 27/10](test-evidence/2026-10-27-messaging-harness.md): kiểm nguồn, guard và giới hạn; chưa là bằng chứng feature đã chạy.
- [Product backlog sơ bộ](product/backlog-draft.md): đề xuất nhóm tính năng/ưu tiên/phụ thuộc để review trước khi tạo Issues/Projects; không giữ trạng thái công việc hoặc thay baseline.
- [Evidence harness 26/10](test-evidence/2026-10-26-harness.md): kiểm tra bộ nền trên working tree và các bước chưa xác minh cho toàn nhóm.
- [Project overview](../project-overview.html): giới thiệu ý tưởng; scope hiện hành ở tài liệu product.
- [Plan v1](archive/TECHNICAL-PLAN-v1.md): lịch sử, không làm nguồn cho feature mới.
- [Nghiên cứu harness](harness-research-2026-10-26.md): phân tích trước triển khai; không phải workflow vận hành hiện tại.
- [Evidence init 25/10](test-evidence/2026-10-25-initialization.md): kết quả ở snapshot/môi trường cũ, không chứng minh mọi máy hoặc mọi feature hiện tại.

## Duy trì nguồn

Thay quy tắc/contract phải cập nhật nguồn chính và bên dùng liên quan trong cùng PR. Giữ đề xuất, quyết định và bằng chứng tách bạch. GitHub Issues giữ task/trạng thái; Projects sẽ cấu hình sau để quản lý chung. Không tạo sổ backlog khác trong repo. `pnpm check:harness` kiểm nguồn/links/runtime, không kiểm ngữ nghĩa hoặc cấp quyền cho agent.
