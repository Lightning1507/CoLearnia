# SCRUM-85 — đồng bộ FE MAIN và cache audience

Task: [SCRUM-85](https://faker1652005.atlassian.net/browse/SCRUM-85), WBS M4-T10.2; reviewer chính M4. Nguồn và API: [contract FE](../contracts/session-fe-sync.md), [projection](../contracts/session-projection.md), [reconnect](../contracts/main-reconnect.md).

## Phạm vi

Nhánh `feat/SCRUM-85-main-audience-state`, tách từ `origin/main` tại `7e0ea03`, cập nhật baseline lên `ccb7fb1` trước PR khi main có PR auth/Workspace mới. Chỉ thêm file mới cho runtime, adapter, hooks, tests, fixture và tài liệu task. Không sửa file có sẵn, index hoặc nhánh lobby của checkout gốc; không thay schema/server, reset DB, seed hoặc migration.

Môi trường: Windows, pnpm 11.5.2, runtime pin Node 26.12.1 theo lockfile. `pnpm install --frozen-lockfile` đạt sau khi cấp quyền tải dependency; lần đầu trong sandbox lỗi fetch. Native worker dùng mediasoup 3.31.0 win32-x64 do lockfile cung cấp.

## Ca kiểm

- Snapshot part đến trước ACK/đảo thứ tự chỉ publish sau descriptor; thiếu sequence, part mâu thuẫn, descriptor sai và packet quá byte không áp state.
- A → MAIN → B với snapshot/ACK trả ngược, event A đến muộn, completion ảnh A, quay lại A: thu lease cũ, không cho cache hoặc ảnh cũ ghi vào B/A mới.
- Audience mới trong snapshot chưa đủ phần nâng floor ngay; header mới bị lùi sequence/revision không mở lại audience cũ.
- Buffer replay liên tục, dedupe theo sequence; gap, count overflow, byte overflow và deadline 5 giây giữ state bị khóa. Mốc đã quan sát sống qua retry, snapshot thấp hơn mốc đó không khôi phục state.
- Ba retry hữu hạn; ACK SESSION_ENDED/AUTH_REQUIRED/FORBIDDEN dừng resync, cleanup đúng ownership; notice cũ và callback generation trước không kết thúc call mới.
- Cancel fetch, thu object URL/subscription, cleanup tiếp tục nếu một disposer lỗi. Panel unsubscribe không hủy runtime; disconnect/owner.end tháo listener và cache, không tự resume.

## Kiểm trình duyệt

Chạy Vite riêng bằng `pnpm --filter @colearnia/web dev --port 5185 --strictPort`, mở `/test/browser/session-projection/index.html` trong Chrome. Fixture ghi rõ socket/protocol giả, không mic/camera.

Ngày 14/11/2026 (Asia/Bangkok), đã thao tác:

1. Ban đầu `ready`, sequence 1, audience 1, nội dung riêng A.
2. “A → MAIN → B đảo thứ tự”: hiện PASS chặn snapshot/event/cache/ảnh cũ A; `ready`, sequence 3, audience 3, chỉ nội dung riêng B.
3. “Đổi panel”: RoomShell vẫn active, panel chat đọc B, không tạo lại cuộc gọi.
4. “Tạo gap”: `syncing`, cursor/projection bị dọn, panel báo nội dung riêng đã được dọn.
5. “Khôi phục snapshot”: `ready`, sequence 5, audience 3, không phục hồi nội dung private cũ.
6. “Kết thúc fixture”: `closed`, cursor bị dọn, RoomShell báo chưa tham gia cuộc gọi.

Sau sửa cleanup HMR của fixture: tải mới, chuyển A → MAIN → B, chạm timestamp module để hot reload, kiểm fixture về A hợp lệ rồi chạy lại chuyển audience/gap/khôi phục. Không phát sinh lỗi React root mới; callback HMR dispose hủy owner và unmount root trước module thay thế. Nút thao tác ngoài state hợp lệ bị disable.

## Lệnh và kết quả

- `pnpm install --frozen-lockfile`: PASS (lần có quyền tải); lần sandbox thất bại fetch.
- `pnpm exec node --version`: `v26.12.1`.
- `pnpm doctor`: runtime và lockfile đúng; báo thiếu `.env` ở worktree và Docker engine không chạy/không truy cập được. Không tạo `.env` hoặc đổi Docker để làm xanh kiểm tra.
- Bộ test SCRUM-85 có 24 ca trong hai file `sessionProjectionRuntime.test.ts` và `sessionProjectionSocket.test.ts`, gồm ca ACK terminal đồng bộ trong lúc bind.
- `pnpm check`: PASS trên baseline `ccb7fb1` — harness 54 PASS/1 SKIP symlink trên Windows; format, lint, typecheck contracts/server/web, 51 file/836 test và build contracts/server/web đều đạt. Trước cập nhật main, cùng cổng đạt 49 file/815 test.
- `pnpm media:smoke`: PASS — native mediasoup worker và Router Opus/VP8 khởi động; không chứng minh camera/mic/TURN.
- Lượt `pnpm check` đầu: harness/format đạt, dừng ở ESLint Fast Refresh vì component fixture chưa export; đã sửa bằng export component, không tắt rule.
- Log Vite từng báo tạo React root trùng khi HMR; đã thêm dispose owner/root/listener và kiểm lại hot reload, không ignore lỗi hoặc tắt Fast Refresh.

## Giới hạn và tiếp theo

Chưa chạy cuộc gọi thật, auth/revoke/fanout/file ACL thật, provider nhóm/chat/board, hai mạng hoặc forced TURN. MAIN registry/server chưa mount production theo giới hạn SCRUM-82/84; adapter FE được kiểm bằng socket fixture, không tuyên bố gate M4-T11.1 đạt. M4 review và các task tích hợp ghép initializer vào join/resume thật; M2/M5 dùng lease API cho callback private khi provider đã sẵn sàng. Không tự merge PR hoặc chuyển Jira Done trước review/merge.
