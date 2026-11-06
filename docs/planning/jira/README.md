# Dữ liệu nhập Jira — Sprint 1

Dữ liệu lấy từ baseline `a5fce0a1dbf1db577f373047910fbb615c0fb731`, ngày 05/11/2026. Nguồn phạm vi/estimate: [Sprint 1](../sprint-1.md), [WBS](../task-consolidation.md), [milestone](../milestones-and-sprints.md). Đây là bộ chuyển giao một lần; Jira giữ trạng thái, tài khoản và ngày thực tế. Khi PM đổi kế hoạch, cập nhật nguồn và ticket liên quan.

## Hiện trạng và việc tiếp theo

**Theo xác nhận của PM ngày 05/11/2026:** đã nhập đủ 5 Epic và 80 task chính, cập nhật tên/description, gán assignee, khôi phục Parent sau import, gán Priority và hiển thị estimate giờ. PM đã chạy API và xác nhận kiểm đủ **171 liên kết phụ thuộc đúng chiều**. Sáu task tùy sức chưa nhập. Đây là kết quả do PM cung cấp, không phải một lượt kiểm trực tiếp mới của agent.

| Miền | Epic    |
| ---- | ------- |
| M1   | SCRUM-5 |
| M2   | SCRUM-6 |
| M3   | SCRUM-7 |
| M4   | SCRUM-8 |
| M5   | SCRUM-9 |

**PM đã xác nhận đưa đủ 80 task vào CoLearnia Sprint 1 trong phiên chuẩn bị ngày 06/11.** Goal và khoảng ngày đã được nhập trên Jira; giờ kết thúc cần đối chiếu lịch review. Việc tiếp theo là sắp thứ tự nhận việc theo [hướng dẫn đầu sprint](../sprint-1.md#thứ-tự-nhận-việc-đầu-sprint-trên-jira), kiểm đầu vào và review các provider chung. Chưa có xác nhận Rank đã cập nhật hoặc sprint đã bắt đầu; không nhập lại task.

Dùng [mapping WBS → Jira key](jira-key-mapping.csv) để tìm ticket. Miền sở hữu quyết định Epic; miền thực hiện quyết định assignee. Ví dụ M3-T2.1 do người phụ trách M5 làm, nhưng vẫn thuộc Epic M3 và do M3 review.

**Sắp thứ tự nhận việc:** dùng [hướng dẫn chạy script Rank](sprint-1-rank-guide.md) và [80 vị trí dự kiến](sprint-1-rank.csv). Chạy `plan` → `pilot` → kiểm Backlog → `apply` → `check`; chỉ đổi Rank qua API, không import lại CSV. Bộ script đã kiểm offline, chưa là xác nhận Rank trên Jira đã cập nhật.

## Các file dùng để tra cứu

| Tệp                                                                                                  | Nội dung / cách dùng                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [task-content-review.csv](task-content-review.csv)                                                   | Đối chiếu 86 mã nguồn, tên cũ, tên mới và description mới; **không import trực tiếp**, chưa có Jira key.                    |
| [sprint-1-tasks.csv](sprint-1-tasks.csv)                                                             | Nguồn nội dung mới cho 80 task chính /379 giờ; CSV tạo mới, **không import lại**.                                           |
| [sprint-1-pilot-2.csv](sprint-1-pilot-2.csv), [sprint-1-remaining-78.csv](sprint-1-remaining-78.csv) | Giữ để đối chiếu cách tách lượt nhập trước; nội dung đã đồng bộ nhưng **không dùng tạo thêm task**.                         |
| [optional-board-tasks.csv](optional-board-tasks.csv)                                                 | 6 task /24 giờ tùy sức chưa nhập; chỉ nhận khi PM quyết định.                                                               |
| [epics.csv](epics.csv)                                                                               | 5 Epic đã nhập; **không nhập lại**.                                                                                         |
| [task-mapping.csv](task-mapping.csv)                                                                 | Miền sở hữu/thực hiện/review, ưu tiên, lượt và giờ; không nhập như task. `EPIC-M1`… là bí danh nội bộ, không phải Jira key. |
| [dependencies.csv](dependencies.csv)                                                                 | 179 cặp provider `blocks` consumer theo mã nguồn; đổi sang key thật sau nhập, không nhập như task.                          |

Description dùng mục tiêu, phạm vi, tiêu chí hoàn thành, phối hợp và hai link trực tiếp. Tên bắt đầu bằng động từ, nêu đầu ra chính; không nhồi toàn checklist vào tên hoặc dùng câu cụt toàn thuật ngữ. Chỉ sửa Summary/Description; giữ mã nguồn, giờ, phân công, ưu tiên và phụ thuộc. Tiêu chí FR/thiết kế đầy đủ vẫn ở proposal được dẫn. Task nền/PoC không được coi là đã hoàn thành toàn FR.

## Những lưu ý sau lần nhập đầu tiên

- **Không nhập lại CSV tạo mới:** 5 Epic và 80 task đã có. Import lặp có thể tạo ticket trùng.
- **Không dùng lại CSV để sửa nội dung hàng loạt:** importer từng làm mất Parent, PM đã gán lại. File cập nhật pilot/remaining chỉ giữ để đối chiếu. Khi sửa tiếp, dùng đúng thao tác hoặc API cho trường cần sửa và thử một ticket trước.
- **Tên và description:** theo [quy ước viết task](task-description-guide.md), [ví dụ của năm miền](task-content-examples.md) và [bảng đối chiếu](task-content-review.csv). Mã WBS, giờ, phụ thuộc và phân công không đổi chỉ vì chỉnh cách diễn đạt.
- **Estimate:** dùng giờ, không dùng Story points cho bộ WBS hiện tại. CSV nguồn ghi giây: `14400` = 4 giờ. Trên Jira hiển thị qua Time estimation; không lấy tổng effort của cả team làm thời gian lịch.
- **Priority:** PM đã gán P0 → High, P1 → Medium. Label giữ mức kế hoạch; trường Priority là giá trị dùng trên Jira. Khi nhận việc, kiểm phụ thuộc trước rồi mới so ưu tiên.
- **Liên kết:** xem [hướng dẫn API và danh sách](sprint-1-link-guide.md), [171 cặp theo key thật](sprint-1-jira-links.csv). Không nhập file liên kết như task. Từ 179 cặp nguồn đã loại 8 cặp liên quan tới task tùy sức chưa nhập.
- **Sprint:** 80 task chính là phạm vi đã chọn; không thêm sáu task tùy sức trước khi PM quyết định. Jira giữ lịch và trạng thái; repo giữ cơ sở kế hoạch. Không xóa task mẫu hoặc đóng sprint mẫu chỉ dựa trên nội dung file này.

Epic gom công việc theo miền xuyên dự án; milestone là kết quả cần đạt ở cuối một giai đoạn. Không cộng estimate Epic vào task con. Ngân sách Sprint 1 gồm **379 giờ task +36 giờ review +18 giờ dự phòng +12 giờ PM =445 giờ**; không tạo thêm task buffer để cộng lại. Sprint 2–3 chưa nhập chi tiết từ bộ này.

## Thông tin cấu trúc CSV để đối chiếu

Các CSV tạo task giữ UTF-8 có BOM và dấu phẩy; description có nhiều dòng. Dùng CSV parser, không đếm dòng vật lý hoặc tách dấu phẩy thủ công. Năm cột Labels lặp đều có dữ liệu cần giữ. `Work item ID` là ID tạm trong lượt import; `Issue key` như `SCRUM-12` mới nhận diện ticket đã có. Parent là Epic dự kiến theo miền sở hữu; không suy Parent từ người thực hiện.

Lần nhập thành công dùng [External system import cũ](https://faker1652005.atlassian.net/secure/admin/ExternalImport1.jspa). Importer mới trước đó trả HTTP 422; nguyên nhân chưa xác định. Ghi lại để tra cứu sự cố, không phải yêu cầu nhập lại dữ liệu.

## Kiểm tra bộ dữ liệu

- 80 task chính /379 giờ; 6 tùy sức /24 giờ; 86 mã nguồn duy nhất, từng task 2–8 giờ.
- Giờ chính theo Executor: M1 78, M2 90, M3 78, M4 86, M5 47; reviewer khác Executor.
- Pilot 2 + remaining 78 bằng đúng file 80 task, không giao nhau.
- 179 cặp phụ thuộc không trùng, không tự trỏ, không có chu trình; task chính không chờ P2.
- Mỗi description có đầu ra, tiêu chí kiểm và tối đa hai link nguồn đúng snapshot.

Bộ CSV đã được kiểm cấu trúc tại local; file export xác nhận đủ 80 key, assignee, Parent và estimate. PM xác nhận đã cập nhật nội dung, khôi phục Parent và kiểm đủ 171 liên kết blocks trên Jira. Hướng dẫn giữ các kết quả thực tế đã xác nhận ở đầu trang để tránh lặp lỗi import.

## Nguồn hướng dẫn import

- [Atlassian — CSV mapping, nhiều label và estimate bằng giây](https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/).
- [Atlassian — Bulk CSV và giới hạn parent-child](https://support.atlassian.com/jira-software-cloud/docs/create-issues-using-the-csv-importer/).

Khả năng import phụ thuộc quyền, project và đường nhập. Với project này, dùng kết quả pilot đã kiểm; không coi lựa chọn field trong wizard là bằng chứng Parent đã gán thành công.

## Cập nhật tiến độ hằng ngày

Theo [quy trình và mẫu comment](../../ai/workflow.md#cập-nhật-tiến-độ-và-gửi-review): ghi dự kiến gửi PR khi bắt đầu, cập nhật ngay khi bị block/nguy cơ trễ; khi gửi review, gắn PR vào ticket, request reviewer trên GitHub và gửi link vào nhóm kèm tag người review chính. Không chép mẫu vào description của từng ticket hoặc import lại CSV để cập nhật tiến độ.
