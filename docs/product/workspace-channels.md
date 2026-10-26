# Tài khoản, Workspace, kênh, chat và tệp

**Trạng thái:** hướng dẫn triển khai theo baseline v2.1; các module nghiệp vụ này chưa có trong scaffold. Đây là bản đồ theo luồng công việc, không thêm quyền hay endpoints mới.

## Nguồn chính theo câu hỏi

| Câu hỏi                             | Nguồn chi tiết                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Phải hoàn thành gì?                 | [Scope: AUTH-01, WS-01/02/03, CH-01, CHAT-01, FILE-01; UC-01](scope.md)                                                      |
| Ai được làm gì?                     | [REST chính, mục 10.2](../technical-plan.md#102-rest-chính), [ba lớp quyền, mục 5.1](groups-media-policy.md#51-ba-lớp-quyền) |
| Cookie/auth/CSRF và lỗi?            | [Quy ước giao tiếp, mục 10.1](../technical-plan.md#101-quy-ước-chung)                                                        |
| Dữ liệu và index?                   | [Model, mục 9.1](../database/model.md#91-mongodb-bền-vững)                                                                   |
| Transaction, attachment và lịch sử? | [Lifecycle, mục 9.3–9.4](../database/lifecycle.md)                                                                           |
| Upload, quota và trust boundary?    | [Bảo mật, mục 13.1–13.2](../technical-plan.md#13-bảo-mật-giới-hạn-và-retention)                                              |

## Lát cắt để giao việc

- Tài khoản: form → bootstrap CSRF → register/login → cookie session → me/logout; expiry/logout phải tác động socket/media liên quan. Không dùng mock identity làm auth thật.
- Workspace: tạo kèm owner membership nguyên tử; mọi truy cập tra membership hiện tại. Chuyển owner và nhận invitation cần kiểm đồng thời theo lifecycle.
- Kênh: phân biệt TEXT/LIVE lâu dài với một lượt LiveSession; type bất biến, list lọc access. Owner/admin quản lý cấu hình không tự có quyền nghe nhóm riêng.
- Chat/tệp: service chung cho REST/socket, dedupe bền, phân trang; attachment STAGED được bind đúng conversation trong transaction. ID/URL biết trước không cấp quyền tải.

Các dòng trên giúp chọn phạm vi issue, không thay chi tiết trong các nguồn được dẫn. Khi thấy mâu thuẫn, ghi lại nguồn/điều kiện cụ thể và xử lý trước phần code phụ thuộc.

## Nghiệm thu theo feature

Đối chiếu T-01/T-02/T-10/T-13 tại [test matrix](../technical-plan.md#143-test-matrix-bắt-buộc): ca sai Workspace/kênh, tự nâng role, invitation đồng thời, owner transfer, message retry và attachment sai scope. Luồng hạnh phúc có UI chưa đủ để nghiệm thu các quyền này.

## Điểm cần chốt khi triển khai

- Implementation băm mật khẩu và cấu hình đo thực tế, như mục 13.1 của plan.
- Field types, nullability, validation chi tiết và index migration theo [model](../database/model.md); không phát sinh collections ngoài scope.
- Đặc tả Zod còn thiếu phải được thống nhất với bên dùng contract trước hoặc cùng PR.
