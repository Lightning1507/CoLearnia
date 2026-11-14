# SCRUM-33 — rollback và yêu cầu tạo Workspace lặp

Ngày kiểm: 14/11/2026. Nhánh `feat/SCRUM-33-workspace-rollback-retry`.

## Thay đổi

Bổ sung entry chống lặp trong instance creator dùng chung của main, theo actor/operation/requestId
và hash tên đã chuẩn hóa. Giữ IDs/time cho commit chưa rõ; không tạo transaction mới khi replay
chưa reconcile. Kết quả cũ vẫn qua session/User ACTIVE, membership và barrier hiện hành.
Không thêm collection/index, không đổi factory conversation M2 hoặc schema request/response.
Contract và giới hạn xem [runbook](../runbooks/workspace-creation.md).

## Môi trường và kiểm chứng

MongoDB 8.0.16, replica set rs0 trong container `colearnia-scrum33-update` khi kiểm lại sau review, loopback 27234,
không volume. Chỉ DB UUID `colearnia_test_scrum32_*` của suite; không đọc .env hoặc cấu hình
DB ứng dụng. Bộ suite SCRUM-32 được mở rộng tại `create-workspace.integration.ts`.

- Lỗi chèn sau từng write thật Workspace, OWNER, general, conversation, audit: rollback cả năm
  collection; không audit SUCCEEDED sót; gate nhả; cùng request thử lại thành công.
- Hai lượt transient lỗi sau insert conversation: IDs không đổi, rollback; request sau tạo đủ một bộ.
- Tám request đồng thời, tên sau trim và UUID hoa/thường: cùng ID, chỉ một bộ năm bản ghi.
- Cùng key khác tên: HTTP 409; khác actor hoặc requestId: thao tác độc lập.
- Replay qua HTTP: 201, cùng DTO/ID, trace HTTP mới; không thêm audit.
- Mất quyền/phiên/User disabled/deleted Workspace/pending barrier: không trả DTO khi replay.
- Commit xong nhưng response auth hết hạn: lưu kết quả, phiên mới cùng User nhận lại cùng ID.
- Mất ack + reconcile outage: request tiếp chỉ đọc lại, chưa rõ không tạo transaction mới;
  khi đọc được trả kết quả cũ. Không evict unknown sau TTL; đầy capacity từ chối key mới.
- Review fix: lost ack rồi đổi tên, xóa Workspace, chuyển OWNER/gỡ membership hoặc đóng
  conversation: xác nhận commit bằng audit ID giữ sẵn, sau đó kiểm ACL/trả DTO hiện hành.
  Entry đã xác nhận không quay về unknown khi mất quyền; không transaction/audit tạo thêm.
- Audit bị mất hoặc khác requestId: không xác nhận commit, không replay ghi mới.
- Capacity/TTL: replay được khi đầy, chỉ entry thành công hết hạn được dọn.
- Failpoint MongoDB từ chối commit một lần: transaction bị hủy, không bản ghi sót; retry được.
  Ca này chỉ chạy khi bật `COLEARNIA_DB_TEST_FAILPOINTS=1` trên container test riêng.
- Các ca SCRUM-32 (router main thật, auth/CSRF, preflight, visibility) vẫn được giữ.

Kết quả thực chạy:

```sh
COLEARNIA_DB_TEST_PORT=27234 COLEARNIA_DB_TEST_FAILPOINTS=1 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/create-workspace.integration.ts
pnpm check
```

- Integration: **49/49 pass**, bao gồm ca failpoint và server main chạy thật.
- `pnpm check`: pass (harness, format, ESLint, typecheck, **791 unit test**, build).
- Lượt check đầu trong sandbox bị EPERM khi HTTP test mở loopback; đã chạy lại đầy đủ với
  quyền loopback và pass. Không sửa test/cổng để bỏ lỗi môi trường.
- Build web còn cảnh báo chunk >500 kB đã có trước thay đổi; build thành công.
- `git diff --check`: pass. Container test được gỡ sau khi chạy; không đổi DB dev.

## Giới hạn

Lỗi transient/lost-ack/reconcile được chèn có kiểm soát; failpoint là lỗi server ở commit,
không phải mô phỏng primary stepdown hoặc network partition. Không tuyên bố đã đo tải 25/50,
crash recovery, đa process hoặc dedupe bền sau restart/quá TTL. Entry unknown không tự biến
thành rollback khi đọc không thấy dữ liệu. Chưa triển khai API danh sách/UI thuộc M1-T7.1.
