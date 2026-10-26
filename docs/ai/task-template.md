# Task brief và bàn giao

Copy phần phù hợp vào GitHub Issue/PR; đây là mẫu, không là task đang thực hiện. Chưa có GitHub Project được cấu hình bởi harness.

## Brief trước triển khai

- Feature ID / issue / owner / reviewer / nhánh:
- Kết quả quan sát được:
- Nguồn áp dụng: đường dẫn + mục; quyết định đã chốt/điểm chưa rõ:
- Phạm vi sửa và ngoài phạm vi:
- Interface/contract bị ảnh hưởng, bên dùng và task phụ thuộc:
- Tiêu chí đạt: thành công, từ chối/lỗi và cleanup/reconnect nếu liên quan:
- Cách kiểm: lệnh/test/hành trình thật, điều kiện môi trường:

## Bàn giao

- Đã thay đổi / trạng thái scaffold, mock hoặc tích hợp thật:
- Bằng chứng: commit nếu đã có, hoặc nhánh + working-tree snapshot/ngày; lệnh thực chạy, exit code/kết quả, môi trường:
- Ca chấp nhận đã kiểm / chưa kiểm:
- Contract/nguồn tài liệu cập nhật:
- Lỗi môi trường, rủi ro còn lại và quyết định cần người khác:
- Reviewer / bước tiếp:

Chỉ đánh dấu hoàn thành khi đủ tiêu chí task và review; không tích checkbox cho lệnh chưa chạy. Log/ảnh trong evidence phải bỏ token, nội dung private và đường dẫn nhạy cảm.

## Plan cho việc nhiều phiên

Chỉ tạo `docs/plans/<feature-id>.md` khi cần: mục tiêu, nguồn, interfaces, milestones, tiến độ, quyết định, kết quả kiểm chứng và bước tiếp. Dẫn issue làm nơi nhận việc/trạng thái; plan giữ ngữ cảnh triển khai. Không tạo một bảng backlog thứ hai hoặc nhân bản toàn bộ nghiệp vụ.
