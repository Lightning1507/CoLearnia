# Viết description cho task Jira

Description giúp người nhận biết **cần giao gì và kiểm thế nào để hoàn thành**. Viết theo từng task; không dán toàn bộ proposal hoặc quy trình chung vào mọi ticket. Không có một format bắt buộc cho mọi task; dưới đây là quy ước của team.

## Đặt tên task

Dùng **`[mã nguồn] Động từ + đầu ra chính`**, diễn đạt bằng tiếng Việt; giữ tên kỹ thuật khi cần xác định đúng đối tượng. Không đổi mã nguồn khi đổi tên.

- `[M3-T5.1] Triển khai bật/tắt mic và camera`.
- `[M3-T4.3] Theo dõi tài nguyên đang tạo và xử lý callback cũ`.
- `[M2-T9.1] Thử tích hợp output ghi hình M3 với sink M2`.

Tên cho biết cần làm gì; điều kiện lỗi, checklist và cách kiểm đặt trong description. Tránh tên chỉ liệt kê danh từ như “Pending registry và callback stale”, dịch máy như “phong bì”, hoặc ghi Q1/Q3 mà không nói đó là vấn đề gì. Giữ nguyên định danh code như SourceDescriptor, CallController, Freeze/Resume khi cần. Không ép task PoC thành tên cam kết feature đã hoạt động.

## Mẫu dùng chung

```markdown
## Mục tiêu

Kết quả cần đạt và lý do cần làm, trong 1–2 câu.

## Phạm vi

Phần cần thực hiện; ghi ranh giới khi dễ hiểu nhầm.

## Tiêu chí hoàn thành

- Đầu ra cụ thể, kiểm được.
- Ca lỗi/từ chối hoặc điều kiện nghiệm thu liên quan trực tiếp.

## Phụ thuộc / phối hợp

Task cần hoàn thành trước; bên cung cấp/tích hợp và reviewer cần phối hợp.

## Tham chiếu

- Link trực tiếp tới thiết kế/WBS liên quan.
- Link kế hoạch hoặc contract cần dùng, nếu cần.
```

Bỏ mục Phạm vi nếu đã rõ từ mục tiêu và tiêu chí; bỏ phần phụ thuộc nếu không có, nhưng vẫn ghi reviewer khi Jira chưa có trường tương ứng. Thông thường 2–4 tiêu chí và 1–2 link là đủ; không cắt mất ca quan trọng để đạt số dòng. Người nhận phải hiểu đầu ra ngay trong ticket, không cần mở mọi link mới biết mình làm gì.

## Viết theo loại việc

| Loại task   | Tiêu chí cần làm rõ                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Contract    | Input/output, quyền, lỗi, ví dụ hợp lệ/không hợp lệ và bên dùng đã review.                                            |
| API/dữ liệu | Kết quả thành công, ràng buộc và ca từ chối/lỗi thuộc phạm vi task.                                                   |
| Giao diện   | Hành vi quan sát được, trạng thái lỗi/loading khi liên quan; dùng fixture hay API thật.                               |
| Tích hợp    | Các thành phần thật tham gia, hành trình kiểm và bằng chứng cần giao.                                                 |
| PoC         | Câu hỏi cần kiểm chứng, timebox, cấu hình/số đo và kết luận hoặc blocker. PoC không đồng nghĩa feature đã hoàn thành. |

Không ép task kỹ thuật thành câu “Là người dùng, tôi muốn…”. Dùng tên hàm/schema đã thống nhất khi cần, giải thích các từ dễ nhầm; tránh chỉ ghi “chốt Q3” mà không nói Q3 là vấn đề gì.

## Thông tin chung đặt ở đâu?

- Assignee, estimate, priority, Parent và sprint dùng trường Jira. Mã nguồn vẫn giữ trong summary/label để đối chiếu WBS; M1–M5 là miền, không phải tài khoản Jira.
- Tạo liên kết `blocks` cho phụ thuộc thực tế; description nêu ngắn phần cần chờ/phối hợp. Trước khi đủ Jira key, dùng mã nguồn trong kế hoạch.
- Quy tắc hoàn thành chung: có bằng chứng kiểm đúng phạm vi trong PR, nêu phần chưa kiểm, reviewer kiểm trước Done. Không lấy mock làm bằng chứng tích hợp thật. Tuân thủ cổng kiểm trong CONTRIBUTING; description không lặp toàn bộ checklist này.
- Báo PM ngay khi bị chặn hoặc dự kiến vượt estimate: kết quả đã có, thời gian đã dùng, phần còn thiếu và bên bị ảnh hưởng. Task 2–8 giờ theo WBS, không mặc định mọi task đều 4 giờ.

Tiêu chí riêng của task bổ sung cho quy tắc hoàn thành chung, không thay thế quy tắc chung. Khi đổi phạm vi, PM cập nhật kế hoạch và ticket trước phần triển khai phụ thuộc.

## Cơ sở tham khảo

- [Atlassian — User stories](https://www.atlassian.com/agile/project-management/user-stories): diễn đạt đơn giản, tập trung kết quả và trao đổi; không có format cố định cho mọi trường hợp.
- [GOV.UK — Writing user stories](https://www.gov.uk/service-manual/agile-delivery/writing-user-stories): tiêu chí chấp nhận cần kiểm chứng được.
- [Atlassian — Definition of Done](https://www.atlassian.com/agile/project-management/definition-of-done): phân biệt tiêu chí riêng của từng việc với tiêu chuẩn hoàn thành dùng chung.

Xem [ví dụ của 5 miền](task-content-examples.md) và [bảng đối chiếu nội dung](task-content-review.csv). Chỉ các task đã chọn cho Sprint 1 và 6 task tùy sức được chuẩn hóa ở lượt này; chưa đổi tên toàn bộ 247 task WBS hay các proposal nguồn.

Mẫu trên là cách team áp dụng các nguyên tắc này cho task triển khai CoLearnia, không phải mẫu bắt buộc do Jira quy định.
