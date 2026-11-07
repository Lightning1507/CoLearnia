# SCRUM-15 — shared MongoDB connection/transaction

Nhánh `feat/SCRUM-15-shared-mongo-transactions`, working tree ngày 07/11/2026. M4 review chính; M2 xác nhận cách nhận connection/session. Chưa commit/push.

## Phạm vi

Connector Mongoose dùng chung, trần transaction không queue, pool/timeout và tắt auto DDL/buffering ngay khi tạo instance trước connect; consumer ghi MongoDB thật theo `GeneralConversationFactory<ClientSession>`. Preflight chỉ đọc cho manifest index scalar/simple, TTL, partial và field lồng; rehearsal index/validator trong DB test riêng. Runbook: [MongoDB transactions](../runbooks/mongodb-transactions.md).

## Kết quả

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm infra:up`: PASS, `rs0 ready`; dùng volume Mongo local hiện có, không reset.
- `pnpm test:database`: PASS **17 ca**, không skip. MongoDB thực `8.0.16`, `rs0`, writable primary; Mongoose `9.11.4`, driver `7.7.0`.
- `pnpm check` sau cập nhật review: PASS harness **55 ca / 110 nguồn**, format, lint, typecheck, **81 unit/contract tests**, build. `pnpm test:database` lượt cuối PASS **17/17**, không skip. Build web còn cảnh báo bundle >500 kB có sẵn.
- `pnpm infra:config`: PASS; `git diff --check`: PASS.
- Node qua pnpm: `v26.12.1`; pnpm `11.5.2`.

## Giới hạn

Fixture không là model/provider M2 sản phẩm. Chưa nghiệm thu Workspace/OWNER/general đầy đủ (M1-T6.2), ACL/thu quyền, migration toàn miền, restore backup hoặc tải media kết hợp. Retry dùng lỗi transient chủ động trong callback trên transaction thật; unknown commit chỉ kiểm giữ nguyên error/label bằng unit, chưa ngắt mạng ở thời điểm commit. Rehearsal validator/index không thay migration ledger/checksum hay validator nghiệp vụ. CI được nối lệnh nhưng chưa chạy remote.

Test tạo DB `colearnia_test_scrum15_<UUID>` tại loopback rồi drop chính DB đó; không đọc `.env`/app `MONGO_URI`, không ghi vào `colearnia`. Đầu ra test không chứa credential hoặc nội dung người dùng.

## Các ca đã kiểm

- Commit hai collection qua cùng connection/session, dữ liệu chưa commit không thấy từ bên ngoài session; return value đúng và session kết thúc.
- M2 báo lỗi hoặc caller lỗi sau cả hai ghi: không còn bản ghi hai bên, giữ đúng lỗi callback.
- Lỗi transient chủ động: driver retry callback, vẫn chỉ một bản ghi mỗi bên, ID/time không đổi. Retry liên tục hết ngân sách 200 ms nhận `MongoOperationTimeoutError`, session kết thúc và không có dữ liệu dở dang.
- Session thuộc client khác bị driver từ chối; ghi M1 rollback.
- Model khai báo unique không tự tạo collection/index sau connect.
- Preflight không tạo collection, báo duplicate/options sai/multikey; fixture unique index áp hai lần không nhân, validator từ chối sai dữ liệu; rollback đúng index fixture giữ document.
- Unit kiểm query model trước connect bị từ chối ngay (không buffer 10 giây), từ chối transaction trước connect, giới hạn cấu hình, admission từ chối quá tải/nhả suất sau lỗi và giữ nguyên unknown-commit error/label. Mock admission/unknown chỉ là unit, không chứng minh lỗi mạng thật.

## Xử lý review bàn giao

- Bổ sung TTL `ttl_auth_expiry`, partial/dotted `uq_conv_channel`, partial ACTIVE/ENDING `uq_live_open_channel`. Đã kiểm options không khớp, trùng trong filter, bản ghi ngoài filter không báo trùng giả, mảng ở ancestor bị từ chối. Dùng fixture DB riêng, chưa tạo index trên collection ứng dụng.
- Mongoose instance riêng đặt mặc định trước đăng ký model; không thay global Mongoose của các module khác. Unit trước connect PASS, integration không tự tạo collection/index PASS.
- Test deadline của bản trước review chỉ kiểm lỗi timeout/session/data cleanup. Lượt cập nhật dưới đây thay test đó bằng kiểm số lần retry và rollback dữ liệu.
- Bảng bàn giao SCRUM-16/18/26/30/31/38/79 tại runbook; các task nhận vẫn cung cấp model/validator/provider và các test nghiệp vụ riêng.

## Sau review CSOT

- `pnpm check` đạt 55 ca harness, 86 ca unit/contract, format, lint, typecheck và build. Build web vẫn có cảnh báo kích thước bundle trên 500 kB.
- `pnpm test:database` đạt 18/18 trên MongoDB Docker `rs0`. Kiểm cấu hình pool thực tế không có CSOT. Khi lỗi transient ở cả hai lượt, connector trả đúng lỗi, kết thúc session và không để lại dữ liệu ở hai collection.
- Unit test kiểm từ chối `timeoutMS` trong URI và mô phỏng commit chưa rõ kết quả. Cả nhánh commit lại thành công và thất bại đều chỉ gọi callback một lần. Chưa mô phỏng ngắt mạng trong lúc commit thật.
