# SCRUM-28 — điều phối thu quyền

Ngày kiểm: 13/11/2026. Phạm vi: coordinator nội bộ, deny barrier và provider Mongo;
không phải nghiệm thu cleanup media/chat/file thật.

## Kiểm đã chạy

- `pnpm exec vitest run apps/server/src/workspaces/access-revocation.test.ts`:
  **43 tests pass**. Sáu scope, deny trước adapter, nhả gate trước cleanup, cohort bất
  biến, watermark không đóng resource mới, coalesce/replay/conflict, cleanup lỗi,
  timeout giữ single in-flight, commit unknown/read-back, giới hạn cohort/ledger/admission.
  Sau review: thêm 20 ca kiểm ObjectId viết hoa trong cả sáu scope khi pending/committed,
  snapshot thiếu channel ID/revision hoặc revision NaN/Infinity/âm/lẻ/quá giới hạn,
  membership sai và principal không hợp lệ; Workspace-only hợp lệ vẫn được giữ.
- Script tái hiện riêng sau sửa: snapshot đổi Workspace/membership sang chữ hoa và
  snapshot kênh thiếu revision đều trả `isCurrent:false`, khớp snapshot cũ chữ thường.
- `COLEARNIA_DB_TEST_PORT=27228 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/workspace-access.integration.ts`:
  **16 tests pass** (12 provider hiện có + 4 ca barrier). MongoDB 8.0.16, replica set rs0,
  container riêng `colearnia-scrum28-test`, DB `colearnia_test_scrum27_<UUID>` riêng của
  test suite và được dọn trong afterAll. Không mount volume hay thay DB dev.
- Provider từ chối Workspace/kênh khi membership Mongo vẫn ACTIVE, auth session vẫn
  chưa revoked và PRIVATE grant vẫn còn; retry commit CAS thu grant, regrant revision
  mới dùng được nhưng snapshot cũ bị chặn; unknown commit được read-back không ghi lặp.

- `pnpm check`: **pass** — harness 55 tests/135 nguồn và links, format/lint,
  typecheck, **47 files / 788 unit tests**, build cả ba package. Lượt đầu sandbox
  chặn 4 test HTTP với `listen EPERM`; chạy lại với quyền localhost thành công,
  không bỏ hoặc giảm test. Build web còn cảnh báo chunk 652 kB đã có từ trước.
- Gitleaks 8.30.1, `dir --redact --no-banner` cho thư mục Workspace và file
  integration đã thay đổi: không phát hiện secret.

## Giới hạn

Adapter M2/M4 là fake trong kiểm thử. Chưa kiểm tài nguyên thật, fanout/stream bị đóng,
HTTP/socket auth barrier trong composition thật, crash recovery hoặc tải kết hợp.
Callback authorize/CAS/read-back là trách nhiệm service nghiệp vụ tương ứng, chưa
triển khai endpoint thu quyền. M4 replay incomplete cần cơ chế tiếp tục cleanup khi
nối thực tế. Registry RAM có admission/ledger hữu hạn, không evict deny đã lưu.

Cách dùng và điều kiện tích hợp tại [runbook](../runbooks/access-revocation.md).
