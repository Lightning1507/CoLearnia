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

## Xử lý hai góp ý của M4 trên PR #40

- Chọn schema chung `accessRevocationSchema` làm nguồn duy nhất cho M1 và M4, đổi kind thành `USER_AUTH_SESSIONS`/`PRIVATE_CHANNEL_ACCESS`. PRIVATE giữ `membershipId`/`membershipIncarnation`, có test từ chối thiếu field, incarnation=0 và tên kind cũ.
- M4 cần cập nhật PR #39 để import/alias schema này thay union riêng. PR #39 gốc tại `f6979c992a1f6219babcc1f03f3973fab013e9c5` vẫn từ chối payload PRIVATE của M1 do strict fields. Chưa gọi hai PR hiện tại là đã tương thích.
- Kiểm phương án ghép trong thư mục tạm: lấy PR #39, ghép workspace schema mới và thay union thu quyền của M4 bằng import/alias schema chung. Chạy workspace tests, session-context tests và probe qua đầu vào M4 cho đủ sáu kind: 3 file / 21 test PASS. Probe đồng thời tái hiện lỗi strict PRIVATE của schema M4 gốc. Đây là kiểm phương án đã điều chỉnh, không phải kết quả của PR #39 nguyên trạng.
- Ví dụ M4 dùng try/finally: đóng resource chưa bàn giao khi resolver trả deny, revision cũ hoặc reject; lỗi reject được truyền nguyên về caller. Ca allow kiểm không đóng resource đã bàn giao. Vẫn là consumer fixture, chưa là implementation resolver/cleanup.
- `pnpm check` sau sửa: PASS 55 harness test, 109 nguồn/liên kết/runtime pins, 9 file / 74 Vitest test, format/lint/typecheck/build. Cảnh báo bundle web >500 kB không đổi.
- Cần M4 xác nhận field membership và cập nhật PR #39; không tự resolve review thread hoặc đánh dấu task Done.
