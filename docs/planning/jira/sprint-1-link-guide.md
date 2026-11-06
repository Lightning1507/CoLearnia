# Gắn phụ thuộc Sprint 1 trên Jira

Danh sách chuyển từ `dependencies.csv` qua `jira-key-mapping.csv`: **171 cặp cho 80 task chính**, gom thành 68 ticket có điều kiện trước. Tám cặp của task tùy sức chưa nhập được loại khỏi lượt này. Không thêm phụ thuộc mới hoặc biến lượt A–D thành chuỗi bắt buộc.

**Trạng thái ngày 05/11/2026:** PM đã chạy pilot, apply và xác nhận kết quả kiểm đủ 171 liên kết đúng chiều trên Jira. Agent không trực tiếp gọi API với token của PM. Giữ hướng dẫn dưới đây để tra cứu; không cần chạy lại lượt tạo nếu không có thay đổi. Tệp CSV đi kèm chỉ để đối chiếu, không import như task hoặc cập nhật ticket.

## Chạy bằng API trên máy PM

Dùng Python 3, không cần cài dependency. Script chỉ đọc ticket và gọi API tạo issue link; không gửi yêu cầu sửa Parent, assignee, estimate, Priority, description hoặc sprint. Không tự xóa liên kết ngược.

1. Mở [Atlassian API tokens](https://id.atlassian.com/manage-profile/security/api-tokens), chọn **Create API token** thông thường (không phải token có scopes). Đặt tên dễ nhận biết, chọn hạn ngắn phù hợp và sao chép token. Script này dùng site URL trực tiếp; chưa hỗ trợ token có scopes qua gateway.
2. Trong Terminal tại repo, chạy lần lượt các lệnh bên dưới. Script hỏi email và token mỗi lần; token được nhập ẩn, chỉ giữ trong bộ nhớ trong lượt chạy. Không dán token vào chat, file, command line hay commit.
3. Lượt pilot tạo đúng một cặp: **SCRUM-14 blocks SCRUM-15**. Kiểm trên UI: SCRUM-15 có **is blocked by SCRUM-14**, SCRUM-14 có **blocks SCRUM-15**. Nếu không đúng, dừng trước apply.
4. Sau khi kiểm pilot, chạy apply. Đọc số cặp còn thiếu rồi gõ `YES` để tạo. Cuối cùng chạy check lần nữa; kết quả mong đợi: **đã có đúng chiều 171; còn thiếu 0**.

```sh
# Chỉ kiểm file local; không cần token, không gọi Jira.
python3 docs/planning/jira/link-dependencies.py --mode plan

# Chỉ đọc Jira, kiểm mapping và thống kê liên kết đã có/còn thiếu.
python3 docs/planning/jira/link-dependencies.py --mode check

# Tạo hoặc xác minh một cặp thử.
python3 docs/planning/jira/link-dependencies.py --mode pilot

# Chỉ chạy sau khi đã kiểm pilot trên UI.
python3 docs/planning/jira/link-dependencies.py --mode apply

# Đối chiếu toàn bộ sau khi tạo.
python3 docs/planning/jira/link-dependencies.py --mode check
```

Nếu bị 401/403: kiểm token, tài khoản và quyền xem/link issues. Nếu bị 429, timeout hoặc 5xx: script dừng; chờ rồi chạy check trước khi tiếp tục. Một POST timeout có thể đã tạo liên kết; lượt sau đọc lại và bỏ qua cặp đã có. Không cần nhập lại task hoặc gán lại Epic. Hoàn tất thì thu hồi token trên trang Atlassian.

**Kiểm chứng:** agent đã kiểm dữ liệu/nhánh xử lý tại local; PM đã chạy trên Jira thật và xác nhận kết quả check đầy đủ sau apply. Chưa có export mới để agent đối chiếu độc lập. Liên kết mới có thể gửi thông báo theo cấu hình Jira.

## Cách gắn trên giao diện

1. Mở ticket ở cột **Task cần làm**.
2. Chọn **Add linked work item** (có thể nằm trong menu `…` → Link work item).
3. Chọn quan hệ **is blocked by**, rồi tìm các mã trong cột bên phải. Nếu hộp chọn cho phép nhiều ticket, thêm đủ rồi lưu một lượt; nếu không, lặp cho từng mã.
4. Kiểm trên ticket này có **is blocked by** các task cung cấp. Mở một task cung cấp để kiểm chiều ngược lại là **blocks** ticket này. Chỉ tạo một lần, không tạo lại chiều ngược.

Ví dụ đầu tiên: mở **SCRUM-15**, chọn **is blocked by → SCRUM-14**. Nghĩa là M1 cần đầu ra transaction port của M2 trước khi hoàn tất phần phụ thuộc tương ứng.

Liên kết mô tả phụ thuộc; không tự đổi status hoặc ngăn người dùng kéo ticket sang In Progress. Khi nhận việc vẫn cần kiểm đầu ra provider đã được review và dùng được.

## Danh sách theo ticket nhận đầu ra

| Task cần làm                                                   | Mã WBS   | Chọn **is blocked by** các ticket này                                                                                            |
| -------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [SCRUM-15](https://faker1652005.atlassian.net/browse/SCRUM-15) | M1-T2.4  | SCRUM-14                                                                                                                         |
| [SCRUM-16](https://faker1652005.atlassian.net/browse/SCRUM-16) | M1-T2.1  | SCRUM-12, SCRUM-15                                                                                                               |
| [SCRUM-18](https://faker1652005.atlassian.net/browse/SCRUM-18) | M1-T3.2  | SCRUM-12, SCRUM-16, SCRUM-15, SCRUM-17                                                                                           |
| [SCRUM-19](https://faker1652005.atlassian.net/browse/SCRUM-19) | M1-T5.2  | SCRUM-12, SCRUM-13                                                                                                               |
| [SCRUM-20](https://faker1652005.atlassian.net/browse/SCRUM-20) | M1-T3.3  | SCRUM-18, SCRUM-19                                                                                                               |
| [SCRUM-21](https://faker1652005.atlassian.net/browse/SCRUM-21) | M1-T4.4  | SCRUM-18, SCRUM-16                                                                                                               |
| [SCRUM-23](https://faker1652005.atlassian.net/browse/SCRUM-23) | M4-T1.2  | SCRUM-22                                                                                                                         |
| [SCRUM-24](https://faker1652005.atlassian.net/browse/SCRUM-24) | M1-T4.2  | SCRUM-21, SCRUM-23                                                                                                               |
| [SCRUM-25](https://faker1652005.atlassian.net/browse/SCRUM-25) | M1-T4.1  | SCRUM-20, SCRUM-21                                                                                                               |
| [SCRUM-26](https://faker1652005.atlassian.net/browse/SCRUM-26) | M1-T2.3  | SCRUM-13, SCRUM-15                                                                                                               |
| [SCRUM-27](https://faker1652005.atlassian.net/browse/SCRUM-27) | M1-T5.1  | SCRUM-26, SCRUM-13                                                                                                               |
| [SCRUM-28](https://faker1652005.atlassian.net/browse/SCRUM-28) | M1-T5.3  | SCRUM-27, SCRUM-19, SCRUM-23                                                                                                     |
| [SCRUM-29](https://faker1652005.atlassian.net/browse/SCRUM-29) | M1-T4.3  | SCRUM-25, SCRUM-24, SCRUM-28                                                                                                     |
| [SCRUM-30](https://faker1652005.atlassian.net/browse/SCRUM-30) | M1-T2.2  | SCRUM-13, SCRUM-15                                                                                                               |
| [SCRUM-31](https://faker1652005.atlassian.net/browse/SCRUM-31) | M2-T2.1  | SCRUM-14, SCRUM-15                                                                                                               |
| [SCRUM-32](https://faker1652005.atlassian.net/browse/SCRUM-32) | M1-T6.1  | SCRUM-30, SCRUM-26, SCRUM-27, SCRUM-19, SCRUM-31                                                                                 |
| [SCRUM-33](https://faker1652005.atlassian.net/browse/SCRUM-33) | M1-T6.2  | SCRUM-32                                                                                                                         |
| [SCRUM-34](https://faker1652005.atlassian.net/browse/SCRUM-34) | M1-T7.1  | SCRUM-25, SCRUM-33, SCRUM-27                                                                                                     |
| [SCRUM-35](https://faker1652005.atlassian.net/browse/SCRUM-35) | M1-T10.1 | SCRUM-34, SCRUM-19, SCRUM-31                                                                                                     |
| [SCRUM-36](https://faker1652005.atlassian.net/browse/SCRUM-36) | M1-T10.2 | SCRUM-35                                                                                                                         |
| [SCRUM-38](https://faker1652005.atlassian.net/browse/SCRUM-38) | M2-T1.3  | SCRUM-14, SCRUM-15                                                                                                               |
| [SCRUM-40](https://faker1652005.atlassian.net/browse/SCRUM-40) | M2-T1.6  | SCRUM-14, SCRUM-38                                                                                                               |
| [SCRUM-41](https://faker1652005.atlassian.net/browse/SCRUM-41) | M2-T2.2  | SCRUM-31, SCRUM-40                                                                                                               |
| [SCRUM-42](https://faker1652005.atlassian.net/browse/SCRUM-42) | M2-T4.1  | SCRUM-40, SCRUM-41, SCRUM-12, SCRUM-13                                                                                           |
| [SCRUM-43](https://faker1652005.atlassian.net/browse/SCRUM-43) | M2-T4.2  | SCRUM-42, SCRUM-38                                                                                                               |
| [SCRUM-45](https://faker1652005.atlassian.net/browse/SCRUM-45) | M1-T7.2  | SCRUM-13, SCRUM-44, SCRUM-14                                                                                                     |
| [SCRUM-46](https://faker1652005.atlassian.net/browse/SCRUM-46) | M2-T5.1  | SCRUM-40, SCRUM-45                                                                                                               |
| [SCRUM-47](https://faker1652005.atlassian.net/browse/SCRUM-47) | M2-T5.2  | SCRUM-46, SCRUM-43, SCRUM-33, SCRUM-34, SCRUM-21, SCRUM-27, SCRUM-24, SCRUM-28                                                   |
| [SCRUM-49](https://faker1652005.atlassian.net/browse/SCRUM-49) | M3-T9.2  | SCRUM-48                                                                                                                         |
| [SCRUM-50](https://faker1652005.atlassian.net/browse/SCRUM-50) | M3-T9.3  | SCRUM-49                                                                                                                         |
| [SCRUM-51](https://faker1652005.atlassian.net/browse/SCRUM-51) | M2-T9.1  | SCRUM-37, SCRUM-50                                                                                                               |
| [SCRUM-52](https://faker1652005.atlassian.net/browse/SCRUM-52) | M2-T3.6  | SCRUM-39                                                                                                                         |
| [SCRUM-53](https://faker1652005.atlassian.net/browse/SCRUM-53) | M3-T9.4  | SCRUM-50, SCRUM-51                                                                                                               |
| [SCRUM-55](https://faker1652005.atlassian.net/browse/SCRUM-55) | M3-T17.2 | SCRUM-54                                                                                                                         |
| [SCRUM-56](https://faker1652005.atlassian.net/browse/SCRUM-56) | M3-T1.2  | SCRUM-44, SCRUM-23                                                                                                               |
| [SCRUM-57](https://faker1652005.atlassian.net/browse/SCRUM-57) | M3-T1.3  | SCRUM-44, SCRUM-23                                                                                                               |
| [SCRUM-58](https://faker1652005.atlassian.net/browse/SCRUM-58) | M3-T1.4  | SCRUM-56, SCRUM-57                                                                                                               |
| [SCRUM-59](https://faker1652005.atlassian.net/browse/SCRUM-59) | M3-T3.1  | SCRUM-44                                                                                                                         |
| [SCRUM-60](https://faker1652005.atlassian.net/browse/SCRUM-60) | M3-T4.1  | SCRUM-58, SCRUM-59, SCRUM-23                                                                                                     |
| [SCRUM-61](https://faker1652005.atlassian.net/browse/SCRUM-61) | M3-T4.2  | SCRUM-60                                                                                                                         |
| [SCRUM-62](https://faker1652005.atlassian.net/browse/SCRUM-62) | M3-T4.3  | SCRUM-61                                                                                                                         |
| [SCRUM-63](https://faker1652005.atlassian.net/browse/SCRUM-63) | M3-T17.3 | SCRUM-54                                                                                                                         |
| [SCRUM-64](https://faker1652005.atlassian.net/browse/SCRUM-64) | M3-T4.4  | SCRUM-60, SCRUM-58, SCRUM-63                                                                                                     |
| [SCRUM-65](https://faker1652005.atlassian.net/browse/SCRUM-65) | M4-T3.1  | SCRUM-23                                                                                                                         |
| [SCRUM-66](https://faker1652005.atlassian.net/browse/SCRUM-66) | M4-T3.4  | SCRUM-65, SCRUM-23                                                                                                               |
| [SCRUM-67](https://faker1652005.atlassian.net/browse/SCRUM-67) | M3-T4.6  | SCRUM-61, SCRUM-57, SCRUM-66                                                                                                     |
| [SCRUM-68](https://faker1652005.atlassian.net/browse/SCRUM-68) | M3-T4.7  | SCRUM-67                                                                                                                         |
| [SCRUM-70](https://faker1652005.atlassian.net/browse/SCRUM-70) | M3-T2.2  | SCRUM-69                                                                                                                         |
| [SCRUM-71](https://faker1652005.atlassian.net/browse/SCRUM-71) | M3-T5.1  | SCRUM-70, SCRUM-62, SCRUM-64, SCRUM-68                                                                                           |
| [SCRUM-72](https://faker1652005.atlassian.net/browse/SCRUM-72) | M4-T3.2  | SCRUM-23                                                                                                                         |
| [SCRUM-73](https://faker1652005.atlassian.net/browse/SCRUM-73) | M4-T3.3  | SCRUM-65, SCRUM-72, SCRUM-57                                                                                                     |
| [SCRUM-74](https://faker1652005.atlassian.net/browse/SCRUM-74) | M3-T6.1  | SCRUM-62, SCRUM-57, SCRUM-73                                                                                                     |
| [SCRUM-75](https://faker1652005.atlassian.net/browse/SCRUM-75) | M3-T6.2  | SCRUM-74                                                                                                                         |
| [SCRUM-76](https://faker1652005.atlassian.net/browse/SCRUM-76) | M3-T3.2  | SCRUM-59                                                                                                                         |
| [SCRUM-77](https://faker1652005.atlassian.net/browse/SCRUM-77) | M3-T8.1  | SCRUM-62, SCRUM-76, SCRUM-23                                                                                                     |
| [SCRUM-78](https://faker1652005.atlassian.net/browse/SCRUM-78) | M3-T5.3  | SCRUM-71                                                                                                                         |
| [SCRUM-79](https://faker1652005.atlassian.net/browse/SCRUM-79) | M4-T2.1  | SCRUM-22, SCRUM-15                                                                                                               |
| [SCRUM-80](https://faker1652005.atlassian.net/browse/SCRUM-80) | M4-T2.4  | SCRUM-79, SCRUM-23                                                                                                               |
| [SCRUM-81](https://faker1652005.atlassian.net/browse/SCRUM-81) | M3-T17.4 | SCRUM-55, SCRUM-63, SCRUM-71, SCRUM-75, SCRUM-77, SCRUM-80                                                                       |
| [SCRUM-82](https://faker1652005.atlassian.net/browse/SCRUM-82) | M4-T2.2  | SCRUM-79, SCRUM-65, SCRUM-72, SCRUM-13, SCRUM-44                                                                                 |
| [SCRUM-83](https://faker1652005.atlassian.net/browse/SCRUM-83) | M4-T9.1  | SCRUM-82, SCRUM-72, SCRUM-13                                                                                                     |
| [SCRUM-84](https://faker1652005.atlassian.net/browse/SCRUM-84) | M4-T9.2  | SCRUM-82, SCRUM-66, SCRUM-12                                                                                                     |
| [SCRUM-85](https://faker1652005.atlassian.net/browse/SCRUM-85) | M4-T10.2 | SCRUM-66, SCRUM-84, SCRUM-76                                                                                                     |
| [SCRUM-86](https://faker1652005.atlassian.net/browse/SCRUM-86) | M4-T7.2  | SCRUM-82, SCRUM-72                                                                                                               |
| [SCRUM-87](https://faker1652005.atlassian.net/browse/SCRUM-87) | M4-T9.3  | SCRUM-79, SCRUM-82, SCRUM-72                                                                                                     |
| [SCRUM-88](https://faker1652005.atlassian.net/browse/SCRUM-88) | M4-T11.1 | SCRUM-28, SCRUM-24, SCRUM-82, SCRUM-83, SCRUM-84, SCRUM-85, SCRUM-64, SCRUM-68, SCRUM-77, SCRUM-29, SCRUM-35, SCRUM-86, SCRUM-87 |
| [SCRUM-89](https://faker1652005.atlassian.net/browse/SCRUM-89) | M3-T15.1 | SCRUM-68, SCRUM-78, SCRUM-75, SCRUM-77, SCRUM-81, SCRUM-88, SCRUM-35, SCRUM-29                                                   |
| [SCRUM-91](https://faker1652005.atlassian.net/browse/SCRUM-91) | M4-T9.4  | SCRUM-80, SCRUM-86                                                                                                               |

## Đối chiếu sau khi gắn

- 171 cặp đúng chiều, không có liên kết task với chính nó; không tạo trùng nếu một số cặp đã có.
- Parent/Epic, assignee, estimate, priority và description giữ nguyên; thao tác này chỉ bổ sung issue links.
- Không coi 171 cặp dự kiến là số mới cần tạo nếu Jira đã có một phần. Khi dùng API cần đọc liên kết hiện có, bỏ qua cặp đã đúng và dừng nếu thấy chiều ngược cần kiểm tra.

Nguồn: [Atlassian — Issue links API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/). API liên kết riêng không yêu cầu cập nhật các trường nội dung của ticket.
