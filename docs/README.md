# Tài liệu CoLearnia — đọc đúng nguồn

**Thành viên mới bắt đầu tại [Hướng dẫn nhập môn cho team](team-onboarding.md):** hướng dẫn bằng hình gồm cấu trúc sản phẩm, luồng học nhóm, ví dụ freeze, cách nhận miền/đọc FR và chuẩn bị đóng góp; Figma là nguồn tham khảo đang phát triển; chưa cần đọc toàn bộ tài liệu bên dưới.

## Nguồn nào có hiệu lực?

- [Trạng thái quyết định](decision-status.md) phân biệt nội dung đã chốt, thiết kế khung, phần chờ PoC và thông tin cần nhóm cung cấp; “có trong plan” không đồng nghĩa “đã chọn mọi chi tiết implementation”.
- [Technical plan v2.3](technical-plan.md) giữ kế hoạch tổng thể, lộ trình, feature/test IDs và quyết định baseline. Các mục đã chuyển chỉ dẫn tới nguồn chi tiết ở bảng dưới; sửa quy tắc tại nguồn đích, không nhân bản lại trong plan.
- Tài liệu product/architecture/database mô tả **thiết kế đích**, chưa chứng minh đã triển khai. [README](../README.md), code và [evidence](test-evidence/2026-10-25-initialization.md) ghi hiện trạng theo thời điểm/commit.
- Schema giao tiếp thực nằm ở packages/contracts; [quy ước](contracts/README.md) hướng dẫn mở rộng. Thiếu schema hoặc mâu thuẫn với nghiệp vụ đã chốt cần xử lý trước code phụ thuộc, không âm thầm lấy code cũ làm quyết định sản phẩm.
- ADR Proposed là phương án cần xác nhận. Archive, nghiên cứu và project-overview là nguồn tham khảo; không tự mở rộng scope. Nếu có mâu thuẫn chưa được giải quyết, ghi hai nguồn và hỏi trước phần triển khai bị ảnh hưởng.

## Chọn nguồn theo việc

**Chuẩn bị proposal:** xem [nơi nộp và hướng dẫn review](proposals/README.md), dùng [proposal mẫu](templates/feature-proposal-sample.md).

| Công việc                                           | Nguồn chính                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dựng draft UI bằng Figma Make                       | [Brief và prompt theo lượt](ui/figma-make-brief.md) — Workspace/chat, phòng họp và nhóm; chưa là UI đã duyệt                                                         |
| Phạm vi / use case / điều chưa xác nhận             | [Scope](product/scope.md), plan mục 15–18                                                                                                                            |
| Đặc tả luồng UC trọng tâm trước khi vẽ Astah        | [6 hồ sơ đặc tả](product/use-cases/README.md) — HS-01 bản 3, HS-03 bản 4, HS-04 bản 2, HS-05 bản 3; HS-02 bản 5 và HS-06 bản 3 theo quyết định DISCUSSION ngày 02/11 |
| Tài khoản, Workspace, kênh, chat, tệp               | [Bản đồ nghiệp vụ](product/workspace-channels.md)                                                                                                                    |
| General, DM 1–1, thread trong kênh                  | [Messaging](product/messaging.md)                                                                                                                                    |
| Call, thiết bị, share, host, volume, reconnect      | [Live session](product/live-session.md)                                                                                                                              |
| Quyền, chat Everyone/Host, hỗ trợ, về phòng chung   | [Groups/media policy](product/groups-media-policy.md)                                                                                                                |
| MAIN, DISCUSSION, ACTIVITY; request/leave/countdown | [Group modes v2.3](product/group-modes.md)                                                                                                                           |
| Frame, freeze/resume và nét vẽ                      | [Board collaboration](product/board-collaboration.md)                                                                                                                |
| Module, state owner, thứ tự mutation                | [Architecture](architecture.md)                                                                                                                                      |
| Collections / index / DB so với RAM                 | [Database model](database/model.md)                                                                                                                                  |
| Transaction / retention / file cleanup              | [Database lifecycle](database/lifecycle.md)                                                                                                                          |
| REST/socket schema và quy ước                       | [Contracts](contracts/README.md), plan mục 10                                                                                                                        |
| Capacity 25/50, workload / giới hạn vận hành        | [Capacity hiện hành](capacity.md) — mục tiêu thử, chưa phải mức đã đạt                                                                                               |
| Local / runtime / Mongo / media smoke               | [Local development](runbooks/local-development.md)                                                                                                                   |
| Checks / hooks / review / giới hạn CI               | [Code quality](code-quality.md), [CONTRIBUTING](../CONTRIBUTING.md)                                                                                                  |
| Giao việc / Codex onboarding / bàn giao             | [AI workflow](ai/workflow.md), [task template](ai/task-template.md)                                                                                                  |
| PoC mediasoup và điều kiện Accepted                 | [ADR-001](adr/001-media-foundation.md)                                                                                                                               |

## Phân tích Use Case hiện hành

- [Gom FR thành 5 miền phụ trách](product/delivery-domains.md): phạm vi FE/BE/dữ liệu, phần dùng chung và điểm giao nhau; đề xuất để team review cùng Figma, chưa gán người hoặc estimate.

- [Functional Requirements MVP](product/functional-requirements.md): 55 FR theo 15 PB, có truy vết UC, tiêu chí chấp nhận, phụ thuộc/rủi ro và điểm chưa chốt; cơ sở chia Issue/estimate, chưa là lịch hoặc việc đã giao.

- [Định hình Use Case](product/use-case-outline.md): 5 actor, 8 oval tổng quan và ranh giới các miền đã thống nhất; không thay nguồn quyền nghiệp vụ.
- [Danh mục Use Case chi tiết](product/use-case-catalog.md): 43 UC nghiệp vụ và 3 UC truy cập chung; giữ mã truy vết cho các mục gộp.
- [6 hồ sơ đặc tả](product/use-cases/README.md): luồng trọng tâm, điều kiện, nhánh lỗi và điểm mở; không đặc tả mọi UC trong danh mục.
- [Sơ đồ Astah và trạng thái ảnh xuất](product/diagrams/README.md): có tổng quan, 5 sơ đồ phân rã và Activity; file Astah và ảnh UC đã được người phụ trách xác nhận là bản mới nhất; xem mục lục bản vẽ để mở nguồn.

- [Activity Diagram tổng thể](product/diagrams/activity-overview.md): luồng chính rút gọn với 3 swimlane, 19 action và ảnh xuất; chỉnh trong cùng file Astah hiện hành.

## Thiết kế dữ liệu từ Use Case

- [Bước 1 — UC ↔ dữ liệu](database/uc-data-map.md): truy vết UC tới dữ liệu đọc/ghi (bản trước recording có 46 UC, delta LIVE-11/12 và GRP-03 ở cuối tài liệu), tác nhân và các khoảng trống cần làm rõ.
- [Bước 2 — mô hình nghiệp vụ](database/conceptual-model.md): 16 khái niệm, quan hệ/số lượng và quy tắc; bản để review, chưa là 16 collection hoặc schema MongoDB. Khung và nguồn chi tiết ở [model](database/model.md).
- [Bước 3 — nơi lưu và vòng đời](database/lifecycle.md): ma trận đủ E01–E16 theo MongoDB/RAM/kho tệp/client, trạng thái, thu quyền, restart và cleanup.
- [Bước 4 — collection/document](database/collection-design.md): 13 collection, field/type/null, nhúng/tham chiếu và truy vấn chính; PRIVATE grant gắn lần gia nhập Workspace. Chưa tạo Mongoose schema/index/migration.
- [Bước 5 — integrity và migration](database/integrity-and-migrations.md): index/options, validation, transaction/CAS/khóa/quota, cleanup và kế hoạch migration/rollback, matrix DB-01–12. Chưa chạy các ca DB; điều chỉnh sau review được cập nhật tại nguồn.

- [Bước 6 — review chéo database](database/review-2026-11-01.md): độ phủ UC, findings đã sửa, điểm mở và điều kiện trước code; hoàn tất review tài liệu, chưa nghiệm thu DB thực tế.

- [Delta recording — schema recordings và files](database/recordings-schema.md): đề xuất cho M2 review field/index, commit READY, quota và cleanup; chưa tạo schema executable hoặc migration.

- [Sơ đồ database dạng DBML](database/diagrams/README.md): copy 13 collection vào dbdiagram.io để xem/xuất ảnh; không là SQL hay script khởi tạo MongoDB.

## Lịch sử và tham khảo — không nạp mặc định

- [Review tính khả thi LIVE 100 người](database/review-100-participants.md): đánh giá DB/control/media theo định hướng như Google Meet; lịch sử findings/tính toán; hướng 25 trước/50 sau và cổng áp dụng hiện ở [capacity](capacity.md), chưa có capacity đạt.

- [Review mức mục tiêu UC](product/use-case-review.md): kết quả đã được đồng ý, cơ sở nghiên cứu và lý do giữ/gộp các mục ứng viên; nhóm truy cập đặt trực tiếp trên tổng quan, không cắt feature khi giảm oval.
- [Evidence group modes v2.3/harness](test-evidence/2026-10-27-group-modes-harness.md): kiểm đồng bộ nguồn và guard, chưa là bằng chứng media đạt nghiệm thu.
- [Evidence đồng bộ messaging/harness 27/10](test-evidence/2026-10-27-messaging-harness.md): kiểm nguồn, guard và giới hạn; chưa là bằng chứng feature đã chạy.
- [Product backlog sơ bộ](product/backlog-draft.md): đề xuất nhóm tính năng/ưu tiên/phụ thuộc để review trước khi tạo Issues/Projects; không giữ trạng thái công việc hoặc thay baseline.
- [Evidence harness 26/10](test-evidence/2026-10-26-harness.md): kiểm tra bộ nền trên working tree và các bước chưa xác minh cho toàn nhóm.
- [Project overview](../project-overview.html): giới thiệu ý tưởng; scope hiện hành ở tài liệu product.
- [Plan v1](archive/TECHNICAL-PLAN-v1.md): lịch sử, không làm nguồn cho feature mới.
- [Nghiên cứu harness](harness-research-2026-10-26.md): phân tích trước triển khai; không phải workflow vận hành hiện tại.
- [Evidence init 25/10](test-evidence/2026-10-25-initialization.md): kết quả ở snapshot/môi trường cũ, không chứng minh mọi máy hoặc mọi feature hiện tại.

## Review trước push

[Review đồng bộ tài liệu/database 01/11](review-before-push-2026-11-01.md): findings đã sửa, chênh lệch Astah/contracts còn lại và kết quả kiểm tra thực; không phải nghiệm thu DB/media.

## Duy trì nguồn

Thay quy tắc/contract phải cập nhật nguồn chính và bên dùng liên quan trong cùng PR. Giữ đề xuất, quyết định và bằng chứng tách bạch. GitHub Issues giữ task/trạng thái; Projects sẽ cấu hình sau để quản lý chung. Không tạo sổ backlog khác trong repo. `pnpm check:harness` kiểm nguồn/links/runtime, không kiểm ngữ nghĩa hoặc cấp quyền cho agent.

## Thay đổi sau kickoff 02/11

[Recording MAIN](product/recording.md) là nguồn RECORD-01 / PB-15 / FR-15-01–03 / UC-LIVE-11–12. DISCUSSION tạo tự động theo [group modes](product/group-modes.md); UC-GRP-03 xét duyệt và UC-GRP-07 host điều chuyển ngừng áp dụng. Tổng hiện hành 55 FR/15 PB; HS-02 bản 5, HS-03 thêm random preview. Hướng pipeline/vòng đời recording đã xác nhận 04/11; công cụ và thiết kế DB còn cần contract/PoC, chưa thay code/schema. Astah/PNG/Figma cần áp delta mới, không ghi đè file hoặc coi đã sửa hình trong lượt tài liệu này.
