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

Task chat dùng [messaging](../product/messaging.md): nêu conversation kind, audience được đọc/gửi/nhận event/tải file, phân trang root/reply và xử lý khi mất quyền. Không lấy session envelope của cuộc gọi làm contract bắt buộc cho DM/thread Workspace. DM rejoin và PRIVATE đã chốt tại messaging; nêu ca thêm/gỡ/re-add, lịch sử còn lưu và thu event/file/LIVE. Role quản lý không thay quyền nội dung; bị loại rồi rejoin Workspace không hồi PRIVATE cũ, owner/admin phải thêm lại. Schema/index còn cần thiết kế.

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

Task nhóm/media đọc [group modes](../product/group-modes.md): ghi group mode, audience, source scope, request/approval hay leave, ảnh hưởng pending share/board; MAIN và từng ACTIVITY có một share độc lập; member ACTIVITY không host approval. Kiểm bước Vào nhóm sau host duyệt, phase giảng/hoạt động không chồng nhau; giữ giới hạn request và duration đã chốt tại nguồn; ghi schema chi tiết cần thiết kế. Với TIMER-01, kiểm hết giờ tự kết thúc đúng lượt ACTIVITY và đưa người còn quyền về MAIN, pause mic/thu scope cũ; reconnect không reset hoặc mở lại nhóm hết giờ, callback lặp/trễ không đóng lượt mới. DISCUSSION không dùng countdown mặc định.

Task host/MAIN share theo [vòng đời host](../product/live-session.md#83-chuyển-host-và-host-mất-mạng): một kiểu cuộc họp, người bắt đầu là host, chuyển quyền trực tiếp, không cần người nhận chấp nhận; không có tự nhận host hoặc bật chế độ điều hành. MAIN mọi participant tự share khi nguồn trống, không xin host. Ca join đồng thời, transfer sai quyền và tranh nguồn phải được kiểm. Host mất mạng quá grace chọn ngẫu nhiên participant hợp lệ làm host tạm; người cũ quay lại hợp lệ tự nhận lại quyền trong cùng phiên. Kiểm race timeout/reconnect, thu quyền host tạm và cleanup scope. Host chủ động rời khi còn giữ quyền kết thúc phiên cho mọi người; sau bàn giao chính thức thì rời như thành viên. Nhánh không có ứng viên/host tạm mất mạng theo điểm mở tại nguồn, không tự định nghĩa.
