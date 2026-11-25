# SCRUM-97 — chuyển cuộc gọi có xác nhận

Ngày bàn giao: 25/11/2026 (Asia/Bangkok). Working tree nhánh `feat/SCRUM-97-active-call-tab-awareness`, base `1125e48`, chưa commit/deploy. SHA base không chứa thay đổi này.

## Phạm vi

Theo yêu cầu điều chỉnh của người dùng, bổ sung handoff có xác nhận trong cùng phiên, thay cho UX chỉ quay về tab cũ. Lobby giữ thiết bị preview, có nút **Chuyển qua thiết bị này**. Server thu đời cũ trước khi cấp đời mới, giữ participant/host và không gọi host leave/end. Tab cũ nhận notice đúng context, thu tài nguyên và hiện **Đã chuyển cuộc gọi sang thiết bị khác**, có nút **Chuyển trở lại**. Không tự chuyển từ cuộc họp khác hoặc thực hiện contract F5 recovery.

Ownership hint qua GET chỉ đọc có auth/access; không tạo session/ticket. BroadcastChannel chỉ mang ID tab/loại tín hiệu, không mang credential hoặc quyền. Server kiểm ticket/auth/access/generation, khóa intent chuyển và đối chiếu cleanup; callback cũ không được đóng binding mới.

## Kiểm tự động đã chạy

- `pnpm test`: 82 file, 1.105 test đạt. Bao gồm xác nhận chuyển, generation cũ, actor sai, hai đích cạnh tranh, giữ host, replay ACK, chuyển trở lại, lệnh nguồn trong lúc cleanup, provider cleanup chưa hoàn tất rồi retry, UI lobby và teardown notice cũ.
- `COLEARNIA_DB_TEST_PORT=27193 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/main-runtime.integration.ts --maxWorkers=1`: 23/23 đạt với Mongo replica set test riêng. HTTP/Socket.IO qua composition thật, transport ở harness được mô phỏng; kiểm disconnect nguồn, đóng transport, một participant/ownership và chuyển trở lại. Không coi fixture transport là RTP browser thật.
- Typecheck contracts/server/web và `pnpm exec tsc -p tests/integration/tsconfig.json`: đạt.
- `pnpm build`: đạt. Còn cảnh báo bundle web trên 500 kB.
- ESLint và Prettier các file thay đổi, `git diff --check`: đạt.
- `pnpm media:smoke`: đạt Worker/Router native Opus/VP8; không chứng minh mic/camera/TURN.
- `pnpm check`: harness 54 đạt, 1 bỏ qua; kiểm 141 nguồn/link/runtime đạt. Cổng dừng tại format do hai file có sẵn trong thư mục untracked `.scrum75-worktree/docs/archive/TECHNICAL-PLAN-v1.md` và `.scrum75-worktree/docs/technical-plan.md`. Không sửa thư mục đó hoặc thêm ignore để làm xanh.

Sandbox ban đầu chặn HTTP/Mongo loopback bằng EACCES; đã chạy lại unit/integration ngoài giới hạn đó và nhận các kết quả đạt nêu trên. Không ghi lượt EACCES là pass.

## Chưa nghiệm thu

Chưa có bằng chứng browser/mic/camera thật cho handoff của working tree này. Chưa restart backend local đang mở của tester hoặc deploy AWS. Sau khi backend tải code mới, kiểm cùng tài khoản ở hai tab: A đang gọi → B chọn chuyển → A dừng mic/camera/share, B vào; A chọn chuyển trở lại → B dừng. Kiểm host và member với người thứ hai vẫn ở phiên, thiết bị thực, stale callback, quyền bị thu, cleanup lỗi và thao tác đồng thời. Khác browser/profile còn phụ thuộc chính sách phiên đăng nhập M1; không thay chính sách đó trong task này.

Không có bằng chứng hai mạng/TURN/năm người; không đóng gate SCRUM-89 hoặc các ticket ICE/recovery riêng từ kết quả này. Không commit/push/merge/deploy trong lượt triển khai.
