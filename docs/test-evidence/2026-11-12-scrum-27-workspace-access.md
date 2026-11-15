# SCRUM-27 — policy Workspace/kênh dùng chung

Ngày kiểm: 12/11/2026. Nhánh `feat/SCRUM-27-workspace-access-policy`.

## Phần triển khai

- Policy thuần cho membership/role và channel access; action riêng cho Workspace,
  target membership server-loaded và bảo vệ OWNER/self.
- Provider `ResolveChannelAccess` + `requireWorkspacePermission` dùng connection và
  coordinator được inject; hàm Held tránh lấy gate lồng.
- Read transaction snapshot trên primary; revalidate auth session/User và expiry,
  đọc grant đúng Workspace/channel/membership/incarnation. Không cache quyền.
- Tái sử dụng preflight/index, pool/admission/retry của DB chung; không migration,
  không thêm collection/index hoặc thay schema.

## Kiểm thực tế

Môi trường: Node 26.12.1 qua pnpm 11.5.2, MongoDB Docker `mongo:8.0.16`, replica set
`rs0`, cổng host riêng 27227; DB `colearnia_test_scrum27_<UUID>` tạo riêng và dọn sau
test. Không dùng DB dev/production hoặc file .env/credential.

- Unit policy: 12 test pass; vòng lặp kiểm role × TEXT/LIVE × WORKSPACE/PRIVATE × grant,
  target MEMBER/ADMIN/OWNER, role HOST/enum legacy bị từ chối, revoke/incarnation/scope sai và state thiếu/xóa.
- Integration MongoDB: 12 test pass. Preflight index thật; PRIVATE admin quản lý mà
  không đọc, grant/revoke/rejoin, revision mới, session revoked/expired/disabled/sai
  user, context hết hạn sau đọc/chờ, uppercase ObjectId, gate sai/lồng/hết lifetime,
  đợi mutation chung gate rồi đọc quyền mới, DB network failure mô phỏng và readiness.
  Consumer kiểm lại bằng provider thật sau revoke: không publish, close resource tạm.

Lệnh đã chạy:

```sh
pnpm exec vitest run apps/server/src/workspaces/access-policy.test.ts
COLEARNIA_DB_TEST_PORT=27227 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/workspace-access.integration.ts
pnpm --filter @colearnia/contracts build
pnpm --filter @colearnia/server typecheck
pnpm exec eslint apps/server/src/workspaces/access-*.ts apps/server/test/workspace-access.integration.ts
```

- `pnpm check`: pass harness (55 test + 134 nguồn/link/runtime pin), format, lint,
  typecheck, 46 file/745 unit test và build. Lượt đầu sandbox chặn listen loopback của
  HTTP test; chạy lại với quyền local phù hợp đã pass, không sửa/bỏ test.
- Gitleaks 8.30.1 với output redact: không phát hiện secret trong thư mục Workspace
  và file integration mới.
- Build web vẫn có cảnh báo chunk >500 kB; task này không thay bundle/frontend.

## Giới hạn và bàn giao

M2/M4 có thể inject provider thật theo [runbook](../runbooks/workspace-access.md), sau
review M4 và composition/preflight. Chưa gắn vào transport/chat/LIVE; không kiểm
subscription/media/file thật hoặc deny barrier/cleanup runtime (SCRUM-28). Mẫu consumer
chỉ có resource giả để quan sát close; dữ liệu/quyết định quyền dùng MongoDB thật.
Chưa thử tải kết hợp 25/50 người hay nhiều process; khóa RAM chỉ cho một app process.
Snapshot không phải quyền vĩnh viễn, CAS hoặc thu quyền runtime.
