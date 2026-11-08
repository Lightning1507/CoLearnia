# SCRUM-19 — kiểm điều phối User/Workspace

Ngày 08/11/2026, working tree trên nhánh `feat/SCRUM-19-user-workspace-coordinator`.
Reviewer chính: M4; consumer M2/M4 cần review điểm nối trước tích hợp.

## Đầu ra

- Khóa RAM dùng chung theo User → Workspace, FIFO mỗi khóa, scope độc lập song song.
- Context kiểm scope/lifetime/async execution; từ chối gọi lồng `run`, kể cả qua instance khác. Context User-only cho phép
  `withWorkspace` lần lượt; context con bao gồm User + Workspace.
- Queue/admission hữu hạn, hủy và một ngân sách chờ chung cho cả hai khóa; nhả khóa
  đã lấy một phần nếu bước sau lỗi. Callback lỗi vẫn nhả; callback đang chạy không
  bị cưỡng bức nhả vì timeout/hủy.
- App-owned instance, env mẫu và runbook cho M1/M2/M4; thống kê aggregate không ID.

## Lệnh và kết quả

- `pnpm exec vitest run apps/server/src/lib/operation-coordinator.test.ts`: exit 0,
  **26 tests pass**. Có ca hai consumer chia sẻ Workspace, User trước Workspace,
  cùng User khác cách viết ObjectId, lỗi sync/async, context stale, hủy, timeout qua
  hai khóa, overload theo khóa/toàn process và cấu hình không hợp lệ. Bổ sung chuỗi
  nhiều Workspace giữ User, lỗi/hủy/timeout/overload con, signal cha, drain con khi
  cha trả về/lỗi và ngăn giữ hai Workspace cùng lúc. Test handoff kiểm pending=0
  trước khi abort, xác nhận waiter đã rời queue mà callback chưa bắt đầu.
- `pnpm check`: exit 0, **159 tests / 13 files pass**, **55 harness tests pass**;
  format, lint, build contracts, typecheck ba package và build đều đạt. Web build
  có cảnh báo bundle >500 kB; không thuộc thay đổi coordinator.
- Lượt typecheck trực tiếp ban đầu gặp contracts dist cũ; full check build lại
  contracts trước consumer và đã đạt. Test thời gian mới ban đầu chưa đồng bộ
  clock monotonic với fake timers; đã sửa clock của test, giữ nguyên assertion.
- Lượt check trong sandbox bị `listen EPERM` ở test HTTP loopback; lượt đầy đủ cuối
  chạy với quyền loopback phù hợp, không bỏ test hoặc đổi cổng kiểm.

## Giới hạn và bước nhận

Các consumer trong test là fixture/callback, chưa là auth, ACL, transaction Mongo
hay session queue thật. Không chạy reset/seed/migration DB trong task này. Các test
DB/media không được chạy lại vì không đổi implementation của chúng.

M1-T5.3 nối deny barrier/revoke adapters; service login/Workspace/M2/M4 nhận cùng
instance và await mọi tác vụ được bảo vệ. Channel/session queue tuân thứ tự ở phía
M4; coordinator hiện không phát hiện được lock nội bộ của session manager.

Không có multi-process locking, timeout cưỡng bức cho callback, nhiều User hoặc
nhiều Workspace giữ cùng lúc, exporter metrics hoặc bằng chứng capacity 25/50.
Đã hỗ trợ nhiều Workspace **lần lượt** dưới cùng khóa User; mỗi lượt con dùng
ngân sách chờ riêng có giới hạn, không tăng admission của operation cha. Xem
[runbook](../runbooks/operation-coordination.md) để dùng context, xử lý lỗi và hiểu
số liệu chờ/giữ khóa. Không coi primitive hoàn tất là toàn bộ luồng thu quyền đã chạy.
