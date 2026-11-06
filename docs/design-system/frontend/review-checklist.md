# Checklist một task FE

**Đề xuất áp dụng · 07/11/2026.** Dùng cùng [playbook](fe-task-guide.md), [task brief](../../ai/task-template.md) và PR template repo. Đây là checklist hành vi cần xem, không là danh sách mọi mục phải triển khai/test cho mọi task. Chọn dòng liên quan; mục không áp dụng bỏ qua, không tích đạt cho ca chưa chạy.

## Tác giả: trước khi nhờ review

### Mọi task FE

- [ ] Đầu ra/phạm vi rõ, có nguồn FR/AC/UI liên quan; quyết định chưa rõ được ghi và hỏi trước phần phụ thuộc.
- [ ] Mã Jira/WBS đã đối chiếu khi có ticket; nhánh/commit/PR dùng cùng mã Jira thật theo CONTRIBUTING, không tạo Issue trùng hoặc mã giả.
- [ ] Đã tìm code/component đang có; file mới đặt đúng feature/lớp, không dồn handler vào App hoặc copy UI dùng chung.
- [ ] Public API/props rõ, không deep import hoặc sửa store nội bộ feature khác; không tạo vòng phụ thuộc.
- [ ] Chữ tiếng Việt, tên/icon/focus phù hợp, style/token theo implementation đã thống nhất; phần đề xuất mới được nhận diện.
- [ ] Đã kiểm gần thay đổi và hồi quy liên quan; ghi lệnh/bước/kết quả thật, chưa chạy hoặc lỗi môi trường ghi rõ.
- [ ] PR nói rõ mock hay tích hợp thật, phần còn thiếu và nguồn/evidence; không chứa secret/dữ liệu private.

### Có form, async hoặc API

- [ ] Label/validation/loading/lỗi/Hủy và submit lặp được xử lý theo hành vi task.
- [ ] Schema/envelope/error theo contract, không bịa endpoint hoặc dùng message text làm mã lỗi.
- [ ] Một nguồn state/cache cho dữ liệu; cập nhật các consumer đúng context, không invalidate toàn app tùy tiện.
- [ ] Outcome chưa rõ được đối soát; retry đúng identity theo contract, không giả thành công hoặc mutation tự chạy lại mù.
- [ ] Đổi đích, response trễ và unmount không ghi vào view/context mới hoặc đóng nhầm dialog mới.
- [ ] Keyboard, focus vào/ra, error association và tên dài được kiểm ở mức thay đổi.

### Có quyền, file, realtime hoặc call

- [ ] Role/permission lấy từ context server đã xác nhận; UI demo không cấp quyền thật.
- [ ] Mất quyền đóng nội dung/cache/subscription/pending đúng phạm vi; không ảnh hưởng nơi vẫn còn quyền.
- [ ] Timer/listener/object URL/track/transport/audio có owner và cleanup đúng đời; chuyển panel không nhân socket hoặc ngắt call.
- [ ] Reconnect/re-add không tự hồi nhóm/share/thiết bị/đích gửi; callback cũ không phục hồi quyền.
- [ ] Allow/deny và lỗi lifecycle liên quan có kết quả; media thật/ACL thật chưa kiểm được ghi riêng với kết quả mock.

### Có thay shared component, token hoặc layout

- [ ] Nêu consumer bị ảnh hưởng, kiểm các surface/màn liên quan và hai desktop khi layout đổi.
- [ ] Không mất vùng bấm/composer/focus khi panel/banner/dialog mở; nội dung dài và zoom có đường thao tác.
- [ ] Rename/breaking API có cách chuyển chỗ gọi; không để fork component hoặc token cũ vô thời hạn.
- [ ] Thay cặp màu có đo contrast phù hợp; chưa đo không ghi đạt accessibility.

## Reviewer: đọc theo thứ tự để dễ bắt lỗi

| Thứ tự              | Cần xác nhận                                              | Dấu hiệu cần yêu cầu sửa                                         |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Mục tiêu         | Diff giải đúng task/FR và không thêm policy ngoài phạm vi | UI theo ảnh cũ, tự thêm quyền hoặc scope                         |
| 2. Tổ chức          | View/hook/API/state/runtime đúng owner, API nhỏ           | App/store toàn cục phình ra, import vòng/deep import             |
| 3. Hành vi          | Thành công, pending/lỗi/Hủy/quyền phù hợp                 | Chỉ đường happy path, ack bị coi success, lỗi cũ còn sau retry   |
| 4. Lifecycle        | Đổi context/revoke/unmount/late callback an toàn          | Callback cũ cập nhật kênh mới, track/socket bị tạo lại mỗi panel |
| 5. UI/accessibility | Đọc được và thao tác được bằng chuột/keyboard             | Icon không name, focus mất, control bị đè hoặc chữ quá nhỏ       |
| 6. Evidence         | Lệnh/bước thật, mức mock/tích hợp đúng                    | Chỉ ảnh đẹp/build pass hoặc lời AI báo đã thử                    |

Ghi finding bằng **bước tái hiện → mong đợi theo nguồn → thực tế → ảnh hưởng**. Phân biệt lỗi cần sửa với gợi ý tổ chức/trình bày. Không yêu cầu viết thêm layer/test chỉ vì template có chỗ trống.

## Khi nào có thể bàn giao?

Task FE đạt phạm vi đã giao, các nhánh quan trọng có bằng chứng và review theo repo; phần chưa kiểm/blocked được nêu rõ. Một task UI mock không hoàn tất feature thật; một task FE nối API không tự chứng minh server ACL/media/capacity đã nghiệm thu. Nếu còn thiếu AC bắt buộc, báo phần chưa hoàn thành để người phụ trách quyết định, không tự đánh Done.

Khi gửi review, thành viên gắn PR vào ticket, chuyển In Review, request reviewer chính trên GitHub và gửi nhóm kèm tag theo [workflow team](../../ai/workflow.md#cập-nhật-tiến-độ-và-gửi-review); sửa xong request review lại. Kiểm liên kết Development trên Jira, không giả định tự chuyển trạng thái. Chỉ chuyển Done khi đủ tiêu chí task, PR được duyệt, checks bắt buộc đạt và đã merge; bên nhận task phụ thuộc xác nhận dùng được. Đây là bước thành viên thực hiện, không tự ủy quyền Codex gửi tin/cập nhật dịch vụ ngoài.

Checklist không thay required checks hoặc [DoD hiện hành](../../technical-plan.md#144-definition-of-done). `pnpm check` chưa chạy phải ghi lý do trong PR. Không cần copy nguyên checklist vào PR; dùng các mục liên quan để viết Developer Test và Limits ngắn, đủ để reviewer kiểm lại.
