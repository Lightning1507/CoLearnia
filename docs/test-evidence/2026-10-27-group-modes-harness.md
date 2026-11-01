# Evidence — đồng bộ group modes v2.3 và harness

> Ghi chú cập nhật 29/10/2026: nội dung countdown chỉ nhắc/chờ host dưới đây là snapshot trước quyết định mới. Nguồn hiện hành là [group modes](../product/group-modes.md) và HS-03 bản 3: ACTIVITY hết thời lượng tự kết thúc/về MAIN. Không sửa ngược kết quả kiểm tra lịch sử thành bằng chứng cho hành vi mới.

**Ngày:** 27/10/2026. Working tree branch `chore/project-harness`, base `ccc9566`; bao gồm các chỉnh sửa tài liệu chưa commit trước đó. Đây là kiểm tra tài liệu/checker, không là nghiệm thu media.

## Phạm vi

- Ba bối cảnh MAIN, DISCUSSION xin host duyệt và ACTIVITY độc lập; request có tên/mục đích/danh sách, tự về MAIN, countdown chung chỉ nhắc.
- Nguồn hiện hành [group modes](../product/group-modes.md), technical plan v2.3, scope/backlog, quyền/media/board, architecture/DB/contracts và root/scoped AGENTS đã đồng bộ.
- ADR-001 vẫn Proposed; mở rộng điều kiện PoC cho cả hai group mode. Không thay source ứng dụng, schema executable, migration, dependency hoặc runtime pin.
- Checker đọc trực tiếp group-modes; test fixture chèn link hỏng trong tài liệu này phải bị từ chối, tương tự messaging.

## Kết quả thực chạy

- `pnpm check:harness`: exit 0; **31/31 tests đạt**, kiểm nguồn/runtime đạt.
- `pnpm exec eslint scripts/check-harness.mjs scripts/check-harness.test.mjs`: exit 0.
- Prettier trên các file docs/instructions/checker thuộc cấu hình: đạt. Technical plan nằm trong `.prettierignore`, không được coi là đã qua formatter; đã kiểm bảng và diff riêng.
- Script rà tài liệu: **21 feature IDs duy nhất, 14 nhóm PB**, số cột bảng Markdown nhất quán; không coi các điểm share ACTIVITY còn mở là quyết định đã chốt.
- Rà ngữ nghĩa các nguồn hiện hành để bỏ quy tắc mọi nhóm luôn nhận MAIN hoặc cap một share cho toàn session; các mô tả lịch sử giữ rõ thời điểm.

## Giới hạn và điểm mở

Không chạy lại build, app tests, Docker hoặc media smoke do không đổi ứng dụng/hạ tầng; các test harness không chứng minh routing/isolation/countdown đã chạy. Checker không kiểm mọi anchor hoặc ngữ nghĩa. Link/format/diff check cuối được báo trong bàn giao.

Tại snapshot trước lượt xác nhận sau review, chưa chốt concurrency/quyền cấp-thu share và chọn nguồn board ACTIVITY; admission/request TTL/chuyển loại/coexistence nhóm; duration limits và controls countdown mở rộng. Chi tiết nằm trong [trạng thái quyết định](../decision-status.md), không tự lựa chọn để làm tài liệu trông hoàn tất. A–E chỉ tham khảo; cần xem lại capacity/PoC khi triển khai.

## Theo sau xác nhận nghiệp vụ sau review

Người dùng đã xác nhận ACTIVITY: mọi member tự share không xin host, một nguồn/group, không giành share, board theo nguồn đó; DISCUSSION: host duyệt rồi người được chọn bấm Vào nhóm; hai phase không chồng nhau và không nhận DISCUSSION trong lượt ACTIVITY. Các điểm mở tương ứng ở snapshot phía trên đã được đóng trong nguồn hiện hành. Timer ngoài scope còn sót trong backlog đã sửa thành chỉ loại đồng hồ ngoài TIMER-01. Không có schema/migration/code nghiệp vụ được triển khai bởi đợt chỉnh tài liệu này. Kiểm tra sau thay đổi ghi trong bàn giao.
