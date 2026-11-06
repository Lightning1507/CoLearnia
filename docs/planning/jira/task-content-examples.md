# Ví dụ task sau chuẩn hóa

Bản xem nhanh của nội dung trong CSV, không phải bảng trạng thái. Mã nguồn và phạm vi giữ theo WBS; key, assignee, estimate và Parent vẫn quản lý trên Jira.

## [M1-T1.1] Thống nhất contract xác thực và hồ sơ cá nhân

### Mục tiêu

Thống nhất dữ liệu và lỗi cho đăng ký, đăng nhập, phiên đăng nhập và hồ sơ cá nhân để FE/BE triển khai cùng một contract.

### Phạm vi

Xác định input/output, quyền, mã lỗi và giới hạn cho auth/profile.

### Tiêu chí hoàn thành

- Có ví dụ hợp lệ và không hợp lệ cho dữ liệu, quyền và lỗi.
- Giới hạn chưa chốt có đầu mối và task xử lý; M4 review trước khi các bên dùng contract.

### Phụ thuộc / phối hợp

- Phụ thuộc: Không chờ task khác; kiểm điều kiện môi trường/contract trong kế hoạch Sprint 1.
- Reviewer: M4.

### Tham chiếu

- [Thiết kế và WBS M1-T1.1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/proposals/m1-workspace-auth.md#L447)
- [Phân công và phụ thuộc Sprint 1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/planning/sprint-1.md#L128)

## [M2-T4.1] Triển khai gửi và đọc tin nhắn TEXT trên REST/socket

### Mục tiêu

Triển khai gửi/đọc tin TEXT chỉ có văn bản trên cùng service cho REST và socket.

### Phạm vi

Dùng cùng service cho send/history, chống gửi lặp và trả lỗi; chỉ xử lý văn bản.

### Tiêu chí hoàn thành

- Hai người gửi/đọc được tin văn bản.
- Retry cùng mã không trùng; khác payload trả conflict.
- Không chờ upload, DM hoặc thread để kiểm luồng text.

### Phụ thuộc / phối hợp

- Phụ thuộc: M2-T1.6, M2-T2.2, M1-T1.1, M1-T1.2.
- Reviewer: M1.

### Tham chiếu

- [Thiết kế và WBS M2-T4.1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/proposals/m2-messaging-files.md#L545)
- [Phân công và phụ thuộc Sprint 1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/planning/sprint-1.md#L157)

## [M3-T4.3] Theo dõi tài nguyên đang tạo và xử lý callback cũ

### Mục tiêu

Theo dõi tài nguyên đang tạo và đóng kết quả đến muộn sau khi quyền hoặc kết nối đã đổi.

### Phạm vi

Lưu pending registry; đóng tài nguyên tạo xong sau khi context hoặc quyền đã mất hiệu lực.

### Tiêu chí hoàn thành

- Thu quyền lúc đang await vẫn đóng được object khi tạo xong.
- Số tài nguyên trở về mức nền sau cleanup, không giữ kết quả từ callback cũ.

### Phụ thuộc / phối hợp

- Phụ thuộc: M3-T4.2.
- Reviewer: M4.

### Tham chiếu

- [Thiết kế và WBS M3-T4.3](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/proposals/m3-media.md#L806)
- [Phân công và phụ thuộc Sprint 1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/planning/sprint-1.md#L180)

## [M4-T9.3] Đối chiếu kết quả chưa rõ và kết thúc phiên không còn người

### Mục tiêu

Đối chiếu kết quả thao tác chưa rõ và kết thúc phiên khi không còn call ownership hợp lệ.

### Phạm vi

Đọc lại kết quả DB và kiểm call ownership khi join/end chạy đồng thời.

### Tiêu chí hoàn thành

- Mất DB ack không gây thực hiện lại mù; join và end có thứ tự xử lý.
- Ownership còn trong reconnect grace giữ phiên; khi ownership cuối mất hiệu lực thì end ngay.

### Phụ thuộc / phối hợp

- Phụ thuộc: M4-T2.1, M4-T2.2, M4-T3.2.
- Reviewer: M3.

### Tham chiếu

- [Thiết kế và WBS M4-T9.3](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/proposals/m4-session-groups.md#L732)
- [Phân công và phụ thuộc Sprint 1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/planning/sprint-1.md#L210)

## [M5-W1.1] Định nghĩa schema lệnh board và Freeze/Resume

### Mục tiêu

Định nghĩa boardCommandEnvelopeSchema và contract Freeze/Resume cho board nhóm.

### Phạm vi

Viết boardCommandEnvelopeSchema cùng lệnh Freeze/Resume cho nhóm.

### Tiêu chí hoàn thành

- Envelope Zod có sessionId kiểu ObjectId, epoch và callGeneration.
- Contract giữ đúng phạm vi Freeze/Resume của nhóm.

### Phụ thuộc / phối hợp

- Phụ thuộc: M4-T1.2, M3-T1.3.
- Reviewer: M3.

### Tham chiếu

- [Thiết kế và WBS M5-W1.1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/proposals/m5-board.md#L1032)
- [Phân công và phụ thuộc Sprint 1](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/planning/sprint-1.md#L228)
