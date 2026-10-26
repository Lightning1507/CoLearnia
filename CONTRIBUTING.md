# Quy ước làm việc

## Nhánh và PR

- Nhận task theo [AI workflow](docs/ai/workflow.md) và [task brief](docs/ai/task-template.md); GitHub Issues là nơi nhận việc/trạng thái. GitHub Projects sẽ được cấu hình sau; bộ harness chưa tạo Project hoặc automation.
- `main` là nhánh tích hợp. Tạo nhánh `feat/<feature-id>-<short-name>`, `fix/<short-name>` hoặc `chore/<short-name>`.
- Commit: `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `test(scope): ...`.
- PR nhỏ theo một đầu ra có thể kiểm tra; có feature ID, reviewer và lệnh/evidence đã chạy.
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
