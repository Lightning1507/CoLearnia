# Quy ước làm việc

## Nhánh và PR

- `main` là nhánh tích hợp. Tạo nhánh `feat/<feature-id>-<short-name>`, `fix/<short-name>` hoặc `chore/<short-name>`.
- Commit: `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `test(scope): ...`.
- PR nhỏ theo một đầu ra có thể kiểm tra; có feature ID, reviewer và lệnh/evidence đã chạy.
- Không tự merge thay đổi policy/media khi chưa có review chéo. Cấu hình branch protection thực hiện khi tạo remote.

## Source và format

- TypeScript strict; không dùng `any` để bỏ qua contract. Validate input bằng Zod.
- Hai dấu cách, UTF-8, LF, một newline cuối file; ESLint + Prettier là cấu hình chung.
- Giữ import runtime/type riêng; backend ESM dùng đuôi `.js` cho import nội bộ.
- Contracts không import model Mongoose hoặc runtime mediasoup.
- Không commit `dist`, `node_modules`, `.env`, dữ liệu upload hoặc logs.
- Thư mục rỗng dành sẵn có `.gitkeep`; xóa khi có source thực trong thư mục.

## Hoàn thành một chức năng

Chạy `pnpm check`, bổ sung kiểm thử có ý nghĩa cho thay đổi. Các thay đổi auth/quyền/file/media phải có ca từ chối. Tài nguyên phải có cleanup; socket/track không được lưu vào localStorage hoặc persist store.

Ghi rõ phần mới chỉ là scaffold hoặc mock, không đánh dấu hoàn thành luồng gọi khi chưa truyền thật trên mạng. Gặp thay đổi contract thì người sử dụng contract review cùng PR.
