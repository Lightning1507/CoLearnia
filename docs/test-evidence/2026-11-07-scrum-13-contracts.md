# SCRUM-13 — kiểm contract Workspace/kênh

Nhánh: `feat/SCRUM-13-workspace-channel-contract`. Working tree ngày 07/11/2026; chưa commit. Phạm vi: `workspace.ts`, chữ ký hàm server, type shell frontend, ví dụ consumer và tài liệu contract. Không sửa schema MongoDB hoặc thêm handler.

## Kiểm đã chạy

- `pnpm --filter @colearnia/contracts build`: PASS.
- `pnpm exec vitest run packages/contracts/src/workspace.test.ts packages/contracts/src/contracts.test.ts apps/server/src/workspaces/ports.test.ts`: PASS ở lượt đầu, 3 file / 10 test; lượt bổ sung được kiểm trong `pnpm check` bên dưới.
- `pnpm check`: lần đầu dừng tại 4 HTTP test do sandbox chặn listen loopback (EPERM). Chạy lại ngoài sandbox: PASS toàn bộ harness (55 test), format, lint, typecheck contracts/server/web, Vitest (7 file / 52 test, gồm 7 ca consumer bổ sung) và build 3 package.
- `git diff --check`: PASS.
- Web build có cảnh báo bundle lớn hơn 500 kB; build vẫn thành công, task này không sửa frontend bundle.

## Đã kiểm được gì?

- TEXT/LIVE độc lập WORKSPACE/PRIVATE; RESTRICTED không còn hợp lệ ở input mới.
- ID sai loại, revision sai, field actor/owner giả và PATCH field bất biến bị từ chối.
- Tên đếm code point; mutation phải có requestId.
- Snapshot phân biệt quyền quản lý và đọc nội dung; scope revoke bắt buộc đúng bộ ID.
- Server typecheck dùng được identity từ SCRUM-12, snapshot shared và ClientSession trong chữ ký M2.
- Ví dụ consumer M2 phân biệt TEXT/LIVE và từ chối đọc dù có quyền quản lý; ví dụ M4 đóng resource chuẩn bị khi recheck sau await cho thấy đã mất quyền. Kết quả cleanup thiếu permissionRevoked hoặc pendingInvalidated không được coi là hiệu lực; cleanupPending không thay hai cờ này. Tất cả dùng fixture/mock, chưa gọi adapter thật của M2/M4.
- Type shell/sidebar/panel/slot được web typecheck và build; chưa thêm component hoặc thay hành vi UI nên không có browser test trong lượt này.
- Tài liệu ghi rõ CAS target cho từng mutation và trách nhiệm cung cấp membership revision trước thao tác thành viên.

## Chưa kiểm / cần review

Chưa có HTTP API, resolver ACL, transaction tạo general, gate hoặc cleanup thực tế trong task này. Chưa chạy migration RESTRICTED. Chưa có xác nhận M2/M4: cần review contract và các điểm mở tại [tài liệu bàn giao](../contracts/workspace-channels.md#5-bàn-giao-và-phần-còn-mở). Chưa chuyển task Done chỉ dựa vào local checks.

## Đồng bộ factory với SCRUM-14 sau review PR #41

- Thay `channelType` trong input factory bằng `conversationId` và `createdAt: Date`, khớp `GeneralConversationFactory<ClientSession>.create` tại commit `46a218f19d4d482ab326d0492bdab9104ea4b297` của PR #41. Caller vẫn chỉ gọi factory cho TEXT; LIVE có lifecycle conversation riêng.
- M1 chuẩn bị ID/thời gian trước callback transaction và giữ nguyên khi callback chạy lại. Thêm ví dụ caller gọi lại với cùng ID, thời gian và dbSession; đây chưa là kiểm rollback MongoDB.
- Typecheck đối chiếu trực tiếp hai chiều giữa type M1 mới và type M2 thật trong bản PR #41 được giải nén tại thư mục tạm: `tsc -p apps/server/tsconfig.json --noEmit`, exit 0. Probe không được thêm vào repo. Test type trong repo ghi hình dạng input và commit M2 dùng đối chiếu; chưa tự theo dõi thay đổi tương lai của PR #41.
- Chạy lại `pnpm check` ngoài sandbox: PASS, 55 harness test và 53 Vitest test; format/lint/typecheck/build đều đạt. Cảnh báo web bundle >500 kB vẫn còn.
- Việc dùng factory chung cho general và kênh TEXT tạo sau cần M2 xác nhận trên PR; kiểm tương thích kiểu không thay xác nhận hành vi hoặc review M4.
