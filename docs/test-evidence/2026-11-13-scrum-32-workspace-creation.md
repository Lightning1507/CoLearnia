# SCRUM-32 — tạo Workspace/general trong transaction M1/M2

Ngày kiểm: 13/11/2026. Nhánh `feat/SCRUM-32-create-workspace`, dựa trên checkout có SCRUM-28
(commit `06d43ca`). Không push/merge hoặc áp migration lên DB ứng dụng trong lượt này.

## Phạm vi

Service dùng model M1 thật, factory conversation M2 thật và shared connection/session.
Audit SUCCEEDED ghi cùng transaction; router dùng HTTP auth/Origin/CSRF hiện có. Route đã
mount trong `main.ts`, dùng singleton barrier/ledger thật và factory M2 thật. Đã kiểm process
entry point thật với env/DB test riêng; chưa thử giao diện hoặc DB dev của người dùng. Hướng dẫn tại [runbook](../runbooks/workspace-creation.md).

## Môi trường và cách kiểm

MongoDB 8.0.16 trong container `colearnia-scrum32-test` (lượt đầu),
`colearnia-scrum32-update` (regression sau review), `colearnia-scrum32-bootstrap` (entry point thật), không volume/mount, loopback 27232,
replica set rs0. Suite dùng DB `colearnia_test_scrum32_<UUID>` riêng, tự provision model/index
và validator Workspace/membership/channel. Chỉ drop database do suite tạo. Không đọc `.env`,
không dùng token/tài khoản thật; cookie/CSRF tạo ngẫu nhiên cho fixture.

```sh
COLEARNIA_DB_TEST_PORT=27232 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/create-workspace.integration.ts
pnpm check
```

## Kết quả

- Integration: **25 test pass**, dùng MongoDB thật và model M1/factory M2 thật.
  Kiểm graph/audit và thời gian tạo; visibility trong/ngoài cùng session; rollback khi M2 lỗi;
  input giả/sai; session expired/revoked/sai user, User disabled, auth barrier; expiry trong
  callback M2; preflight false; stable IDs/time khi callback retry; reconcile commit mất ack;
  không tự retry khi chưa rõ commit; không hứa POST dedupe; HTTP cookie/Origin/CSRF/201.
- Regression sau review: phiên hết hạn sau commit đã xác nhận trực tiếp hoặc qua reconcile
  đều trả 401 với thông báo Workspace đã được tạo, không trả DTO, không tạo transaction
  thứ hai; đủ năm bản ghi vẫn tồn tại. Log success/unknown/committed-auth-expired nối
  trace HTTP với operation UUID trong audit bằng các field riêng, không raw input/token.
- Kiểm `src/main.ts` trong process con: auth cookie + CSRF từ server thật, POST trả 201,
  đủ Workspace/OWNER/general/conversation/audit. Khi bỏ index audit ở DB test, startup
  giữ route 503 và không ghi. Process con dùng env tường minh, không nạp .env ứng dụng.
- Unit revocation: **46 test pass**, thêm ca chưa có adapter vẫn deny/pending và không commit,
  bind adapter tiếp tục operation cũ mà không chụp cohort lại; prepare từ chối không đặt deny;
  không cho cấu hình nửa cặp hoặc thay adapter đã bind.
- `pnpm check`: **pass** — harness 55 test / 136 nguồn và link, format/lint/typecheck,
  47 file / 791 unit test, build cả ba package. Không thay gate hoặc bỏ test.
- Gitleaks 8.30.1 quét thư mục source Workspace và file integration với output redacted:
  **không phát hiện secret**.
- `git diff --check`: pass.
- Build web có cảnh báo chunk >500 kB đã tồn tại (652.22 kB); build vẫn thành công.

Container test được dọn sau khi hoàn tất kiểm. Không tạo commit hoặc push trong lượt triển khai.

## Giới hạn

Suite Workspace dùng barrier thật chưa bind cleanup; không có adapter giả trả thành công.
Unit coordinator dùng fake port để kiểm retry/binding. Chưa nghiệm thu media, fanout hoặc
cleanup runtime M2/M4 thật; các task runtime phải bind port thật vào cùng singleton và kiểm
freshness của consumer trước khi bật luồng tương ứng. Transient/unknown commit dùng lỗi chèn có kiểm soát,
không là kiểm mất mạng/primary stepdown. Ma trận rollback/retry đầy đủ thuộc M1-T6.2.
Chưa có REST dedupe, API danh sách/UI Workspace, tải kết hợp 25/50 hoặc multi-process.
