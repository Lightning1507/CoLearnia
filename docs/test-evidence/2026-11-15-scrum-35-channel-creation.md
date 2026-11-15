# SCRUM-35 — API và form tạo kênh TEXT/LIVE

Snapshot working tree trên nhánh `feature/SCRUM-35-create-channels`, nền `8434e3d`, ngày 15/11/2026. Chưa commit/push. Reviewer: M4.

## Kết quả thực chạy

- `pnpm check`: exit 0; harness 55 test đạt, 137 nguồn/link/runtime pin đạt; format, lint, typecheck contracts/server/web, 869 unit test và build đạt. Web vẫn cảnh báo chunk lớn hơn 500 kB (khoảng 704 kB trước gzip); không đổi ngưỡng để bỏ cảnh báo.
- `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/create-channel.integration.ts apps/server/test/create-workspace.integration.ts apps/server/test/workspace-access.integration.ts apps/server/test/registration.integration.ts`: exit 0, 116 đạt / 1 skip. Ca skip có sẵn ở Workspace rollback, chỉ chạy khi bật `COLEARNIA_DB_TEST_FAILPOINTS=1`; không gọi ca đó là pass.
- Suite mới `create-channel.integration.ts`: 19 test đạt trên MongoDB local replica set rs0, DB tên UUID riêng. Factory M2 và model M1/M2 thật. Không reset/provision DB dev.

## Ca đã kiểm

- OWNER/ADMIN được tạo; MEMBER, outsider, removed membership, Workspace đã xóa, session hết hạn/revoked và deny barrier đang thu membership bị từ chối.
- TEXT/LIVE × WORKSPACE/PRIVATE. TEXT ghi Channel + conversation CHANNEL + audit cùng ClientSession. Test kiểm write M1 nhìn thấy trong transaction M2 và chưa nhìn thấy ngoài transaction. LIVE không gọi factory TEXT. PRIVATE không sinh grant ngầm; policy trả canReadContent=false ngay cả với OWNER tạo kênh.
- Lỗi factory trước/sau khi ghi conversation, provider trả sai ID và lỗi audit đều rollback nguyên tử. TransientTransactionError chạy lại callback với cùng ID/time, chỉ còn một graph/audit.
- Retry đồng thời, UUID requestId khác hoa/thường, cùng khóa khác payload, requestId mới cùng tên, scope actor/Workspace độc lập, capacity và TTL/restart với replayOnly. Lost commit ACK được reconcile bằng majority success marker; unknown chưa xác nhận giữ entry và không gọi M2 lại.
- Pending channel deletion và kênh đã xóa không được replay như còn hợp lệ. Mutation đứng sau thao tác loại membership trong gate đọc quyền mới và bị từ chối.
- Preflight chưa ready chặn mutation. Workload nhỏ gồm bốn Workspace tạo kênh song song với đọc Workspace dùng chung coordinator/pool; không là benchmark capacity 25/50 người.
- HTTP: cookie/Origin/CSRF, body strict, enum/tên sai, HTTP 201/400/401/403/409/410 và DTO/no-store.
- Contract/client: replayOnly chỉ nhận true, không nhận memberIds; tên Unicode hợp lệ được giữ, lone surrogate bị từ chối; client gửi credentials/CSRF và không tự replay khi mạng lỗi hoặc nhận response sai schema.

## Kiểm browser thực

Chrome trên macOS, Vite `127.0.0.1:5185`, server thật `127.0.0.1:3135`, tài khoản tổng hợp và DB `colearnia_test_scrum35_browser_<UUID>` riêng:

1. Đăng nhập, mở Workspace OWNER, thấy nút Tạo kênh và dialog có focus vào tên.
2. Submit tên rỗng hiển thị lỗi, không mất input; Escape đóng dialog và trả focus về trigger.
3. Tạo thành công cả bốn tổ hợp TEXT/LIVE × WORKSPACE/PRIVATE; form PRIVATE giải thích chưa cấp quyền cho ai.
4. Proxy test trên cổng 3136 chỉ trì hoãn response đầu sau khi backend đã commit 14 giây, vượt timeout client 12 giây. UI chuyển trạng thái chưa xác nhận, khóa payload và cho chủ động đối chiếu. Lần sau gửi đúng requestId cũ với replayOnly=true và nhận lại kênh cũ.
5. Đối chiếu DB: tổng 6 kênh gồm general + 5 lần tạo (4 tổ hợp và ca mất ACK); 4 conversation gồm general + 3 TEXT mới; 5 audit CHANNEL_CREATE; 0 PRIVATE grant; kênh ca mất ACK chỉ có một bản ghi.
6. Đã sửa modal bị CSS reset đẩy lên góc, kiểm lại modal căn giữa. Đã dừng server/Vite/proxy test và xóa đúng DB browser test được tạo trong lượt này.

Ảnh kiểm form đã lưu trong artifact local `/tmp/colearnia35-create-channel.jpg`; không chứa credential hoặc dữ liệu người dùng thật. Chưa audit screen reader, mobile/reflow hoặc toàn bộ WCAG. Browser chưa mô phỏng thu quyền ngay trong lúc form mở; ACL/deny/race đã được kiểm ở integration.

## Bàn giao và giới hạn

- [Contract](../contracts/workspace-channels.md#scrum-35--tạo-kênh) và [runbook](../runbooks/channel-creation.md) ghi provisioning, rollback triển khai, retry/unknown commit và điểm nối.
- Không thêm env, collection, index, Redis hoặc pool. Dùng preflight tạo Workspace hiện hành.
- T10.2 còn nối list nội dung/list quản trị/sidebar; T13 quản lý PRIVATE. Không xem metadata quản trị là quyền nội dung. LIVE mới chỉ là Channel metadata, chưa khởi động cuộc gọi.
- Retry RAM hữu hạn, không cam kết xuyên restart hoặc quá TTL. Form giữ attempt theo user/Workspace trong component; reload không giữ attempt. Khi mất entry cần đối chiếu kênh đã tạo trước khi gửi mới.
- M2 đã tích hợp factory thật cho TEXT. M4 cần review phần khóa/deny, kiểm lỗi và hợp đồng LIVE ở task consumer; đây chưa là bằng chứng media/TURN hoặc gate tích hợp MAIN đạt.

## Kiểm lại sau review

- Chạy lại ca mất phản hồi commit trên replica set thật với DB test riêng và driver đặt `maxAdaptiveRetries=0`. Bộ tạo kênh giữ được kết quả của yêu cầu cũ và số bản ghi không tăng khi đối chiếu bằng cùng khóa.
- Thêm hồi quy DB cho commit đã ghi thành công nhưng mất phản hồi không có nhãn, sau đó lần thử lại commit cũng lỗi. Cả hai kiểu gọi lại bằng cùng requestId trả đúng kênh đã tạo. Unit test ở lớp DB cũng xác nhận lỗi mạng trong callback không được phân loại là lỗi commit.
- Thêm test cho phản hồi 401 và CSRF đến sau khi cache đã chuyển sang lượt đăng nhập mới của cùng tài khoản. Phiên mới được giữ và form không phát thêm request.
- Bốn suite integration đạt 117 test, skip một ca failpoint có sẵn. Ca race phiên của bản sửa được kiểm bằng test frontend.
