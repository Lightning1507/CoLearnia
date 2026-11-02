# Phân tích FR từ backlog — 02/11/2026

## Phạm vi

Theo yêu cầu người dùng sau trao đổi với mentor: làm rõ yêu cầu để review scope, nhìn phụ thuộc/rủi ro và chuẩn bị chia task/estimate. [Bản FR](../product/functional-requirements.md) diễn giải nghiệp vụ hiện hành, không thêm/cắt tính năng, không gán người, tạo Issue/Project hoặc tự cam kết lịch.

Đã tạo 53 FR theo 14 PB, với UC/feature truy vết, yêu cầu chức năng, AC, nguồn, phụ thuộc và rủi ro. Tách yêu cầu chất lượng/PoC/vận hành khỏi FR người dùng; giữ nhánh host nhiều sự cố, nét tạm, cấu hình auth/media và thông tin delivery chưa chốt. Task template/workflow dùng FR/AC khi chia việc; checker bắt nguồn FR thiếu hoặc link hỏng.

## Review

- Đối chiếu scope, catalog, messaging, live session, group modes, board/policy và decision status. Không lấy backlog cũ trong đoạn chat mentor làm nguồn ghi đè quyết định mới.
- Kiểm tạm bằng script: 53 mã FR duy nhất, 14 nhóm PB; toàn bộ 46 UC đang giữ có truy vết trong các dòng FR; các bảng Markdown liên tục, không tách hàng thành paragraph.
- MAIN không freeze, chỉ host vẽ LIVE; nhóm giữ freeze/vẽ/resume. ACTIVITY hết giờ tự về MAIN; DISCUSSION host đóng; không chuyển host cần chấp nhận.
- Giữ phân biệt PRIVATE/DM/chat họp và trạng thái hiện tại so với lịch sử. Sửa ghi chú cũ trong backlog về TTL/field limits DISCUSSION và trong catalog về DM rejoin cho khớp nguồn đã chốt.
- PB-07/10/14 và FR retry/reconnect chỉ dẫn phần dùng chung, không cộng effort nhiều lần cho cùng một cơ chế.

## Kiểm tra thực chạy

- Node bundled chạy `scripts/check-harness.mjs`: PASS nguồn/liên kết/runtime.
- Node bundled chạy `--test scripts/check-harness.test.mjs scripts/architecture.test.mjs`: 53/53 PASS, gồm ca FR source có liên kết hỏng phải bị từ chối.
- ESLint hai file checker/test đã sửa: PASS.
- Prettier các file của lượt FR và `git diff --check`: PASS.

Đây là kiểm tài liệu/harness, không phải 53 FR đã được kiểm nghiệm trên sản phẩm. Chưa chạy full `pnpm check`, DB integration hoặc media benchmark. Không đổi schema, migration hoặc code sản phẩm; không sửa Figma/Astah, commit/push. Giữ các thay đổi board/UI đang có trong working tree từ lượt trước.

## Bước tiếp

Team review FR cùng UI, người phụ trách đề xuất contract/task và estimate với giả định, rồi lead tổng hợp phụ thuộc, tích hợp, review, dự phòng và lịch trước khi cam kết scope/sprint. FR không chứng minh toàn bộ scope làm kịp 4 tuần phát triển chính + 1–2 tuần hoàn thiện.

## Hoàn thiện sau review FR và miền phụ trách — 02/11/2026

Theo review đã được người dùng đồng ý, giữ nguyên scope, 53 mã FR và phương án 5 miền; chưa gán người hoặc cam kết cân tải/lịch:

- FR hướng dẫn tách AC cho hành vi ghép khi viết task; phụ thuộc PB không phải thứ tự bắt mọi miền chờ nhau hoàn thành.
- FR-06-05 và nguồn board phân biệt người rời với nhóm đóng/resume: thu quyền người rời không xóa frame/nét chung còn được dùng. M5 phân biệt overlay MAIN đổi nguồn, freeze pending stale và frame nhóm đã FROZEN hợp lệ.
- [Miền phụ trách](../product/delivery-domains.md) làm rõ M4 điều phối vòng đời hội thoại còn M2 sở hữu schema/query/thao tác conversation/message/file. Bổ sung đầu ra review contract, ví dụ freeze, hướng tích hợp từng chặng và review chung M3–M4.
- Workflow/task brief ghi cùng cách chuẩn bị proposal + task/estimate sơ bộ, review bên cung cấp/bên dùng rồi hoàn thiện task. CI/staging vẫn cần chọn đầu mối và tính effort khi giao người; không tự giao cho M5.

Kiểm tra thực chạy sau chỉnh sửa:

- Node bundled chạy `scripts/check-harness.mjs`: PASS 88 nguồn/liên kết/runtime.
- Node bundled chạy `--test scripts/check-harness.test.mjs scripts/architecture.test.mjs`: 54/54 PASS.
- Script kiểm tạm: 53 FR duy nhất, mỗi FR đúng một miền chính; số FR M1–M5 lần lượt 15/10/7/16/5; bảng Markdown liên tục.
- Prettier các file lượt sửa và `git diff --check`: PASS.

Chỉ sửa tài liệu. Không thay code sản phẩm/schema/migration, Figma/Astah hoặc chạy DB/media benchmark/full `pnpm check`; chưa commit/push. Kết quả không chứng minh FR đã chạy hoặc 5 người đã cân tải. Bước tiếp là team review phạm vi, chọn owner/reviewer và giờ thực tế để chuẩn bị proposal/task/estimate.
