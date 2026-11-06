# Quy ước làm việc

## Nhánh và PR

- Nhận task trên Jira theo [AI workflow](docs/ai/workflow.md) và [task brief](docs/ai/task-template.md). Cập nhật dự kiến bàn giao/blocker trong Comments của ticket. Khi gửi review, gắn PR vào Jira, request reviewer trên GitHub và gửi link vào nhóm kèm tag người review chính; xem [quy trình và mẫu comment](docs/ai/workflow.md#cập-nhật-tiến-độ-và-gửi-review).
- `main` là nhánh tích hợp. Tạo nhánh `feat/<feature-id>-<short-name>`, `fix/<short-name>` hoặc `chore/<short-name>`.
- Commit: `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `test(scope): ...`.
- PR nhỏ theo một đầu ra có thể kiểm tra; có feature ID, reviewer và lệnh/evidence đã chạy.
- **PR title bằng tiếng Anh:** `<type>(<scope>): <short description> (#<issue>)`. Dùng động từ hiện tại dạng mệnh lệnh, bắt đầu subject bằng chữ thường, mô tả cụ thể thay đổi và không có dấu chấm cuối; không giữ title tự điền từ tên nhánh. Type: feat/fix/docs/refactor/test/chore/ci/build/perf; scope là miền như auth/workspace/chat/media/database/workflow. Chỉ thêm `(#issue)` khi có GitHub Issue thật; chưa có thì bỏ, không tạo mã giả. Ví dụ: `feat(auth): add cookie-based session login (#23)`, `fix(media): close screen sharing when a participant leaves (#31)`, `docs(workflow): standardize PR descriptions`.
- Số Issue như `#23` là mã công việc trên GitHub; Projects là góc nhìn quản lý Issue/PR, không thay số Issue bằng mã PB/UC/feature. Description dùng `Closes #23` khi PR hoàn tất Issue, `Refs #23` khi chỉ đóng góp một phần; không tự đóng Issue cho mọi PR liên quan. Với nhiều Issue, dẫn đầy đủ trong description thay vì kéo dài title. PR template chỉ điền phần body; hiện chưa có CI kiểm format title.
- PR description viết bằng tiếng Việt theo [PR template](.github/pull_request_template.md), đủ để reviewer chưa biết task hiểu trước khi mở diff. Luôn có **What** (kết quả/hành vi thay đổi), **Why** (vấn đề/lý do), **Environment Variables** và **Developer Test**. **How** chỉ giữ khi cần giải thích cách làm/lựa chọn kỹ thuật; **Limits / Follow-up** chỉ giữ khi có giới hạn, rủi ro hoặc việc tiếp theo đáng lưu ý. PR nhỏ viết ngắn, không điền cho đủ heading hoặc kể lại lịch sử thảo luận.
- Environment Variables không đổi thì ghi “Không có”; có đổi thì nêu tên/mục đích, bắt buộc/default phù hợp, ảnh hưởng dev/production và cập nhật .env.example/runbook, không ghi secret. Developer Test ghi loại kiểm tra phù hợp (Unit/Integration/Manual/kiểm tài liệu), lệnh/bước và kết quả thật; `pnpm check` chưa chạy phải nêu lý do. Không bắt mọi PR có đủ mọi loại test, không gọi mock/native smoke là feature đã chạy; không bịa issue, reviewer hoặc bằng chứng. Chi tiết thu quyền/cleanup/reconnect và migration/deploy/rollback cần nêu khi liên quan.
- `main` được bảo vệ: cần PR, một review, required checks thành công và xử lý hết hội thoại. Quy tắc áp dụng cả admin, chặn force push/xóa nhánh. Dùng squash merge để giữ lịch sử tuyến tính.
- Không tự merge thay đổi policy/media khi chưa có review chéo; không tự approve PR của mình.

## Local hooks

`pnpm install` cài Husky qua `prepare` trong repo local có `.git`.

- `pre-commit`: lint-staged chạy Prettier và ESLint trên code đã staged, format các file văn bản khác; không chạy toàn bộ build mỗi lần commit.
- `commit-msg`: commitlint yêu cầu `type(scope): subject`, tối đa 100 ký tự ở dòng đầu. Ví dụ `feat(channels): add channel creation`.
- Lỗi hook chặn commit; sửa rồi commit lại. Hooks có thể bị bỏ qua trên máy cá nhân nên CI kiểm lại source và commit messages.
- Kiểm chủ động: `pnpm lint:staged`, `pnpm exec commitlint --from origin/main --to HEAD --verbose`, `pnpm check`.
- CI/Docker không cài hooks; không commit `.husky/_` do Husky sinh ra.

## Source và format

- TypeScript strict; không dùng `any` để bỏ qua contract. Validate input bằng Zod.
- Hai dấu cách, UTF-8, LF, một newline cuối file; ESLint + Prettier là cấu hình chung.
- Giữ import runtime/type riêng; backend ESM dùng đuôi `.js` cho import nội bộ.
- Contracts không import model Mongoose hoặc runtime mediasoup.
- Không commit `dist`, `node_modules`, `.env`, dữ liệu upload hoặc logs.
- Thư mục rỗng dành sẵn có `.gitkeep`; xóa khi có source thực trong thư mục.

## Hoàn thành một chức năng

Chạy `pnpm check`, bổ sung kiểm thử có ý nghĩa cho thay đổi. Các thay đổi auth/quyền/file/media phải có ca từ chối. Tài nguyên phải có cleanup; socket/track không được lưu vào localStorage hoặc persist store.

`pnpm check:harness` chạy test guard và kiểm nguồn/links/runtime; được nối đầu `pnpm check` trong local/CI. Ranh giới import được kiểm qua ESLint. Các check này không chứng minh nghiệp vụ đúng, sandbox đúng hoặc media chạy thật. Xem [mục lục nguồn](docs/README.md) trước khi thay quy tắc; tác giả giải thích được contract, quyền và cleanup với reviewer khác.

Ghi rõ phần mới chỉ là scaffold hoặc mock, không đánh dấu hoàn thành luồng gọi khi chưa truyền thật trên mạng. Gặp thay đổi contract thì người sử dụng contract review cùng PR.
