# SCRUM-36 — danh sách và quản trị kênh

Nhánh `feature/SCRUM-36-channel-lists`, nền `cd78605`, working tree ngày 15/11/2026. Reviewer M4. Nguồn quyền là policy SCRUM-27 và [contract Workspace/kênh](../contracts/workspace-channels.md#scrum-36--danh-sách-nội-dung-và-quản-trị-kênh).

## Phần đã nối

Hai API list nội dung/quản trị chạy trên connection/coordinator/barrier dùng chung. List nội dung lọc theo membership/grant/incarnation. List quản trị chỉ trả metadata và cờ quyền đọc cho OWNER/ADMIN. Query có giới hạn, dùng index hiện hành và cursor có mã hóa/xác thực, gắn người/Workspace/membership/loại list. Không có migration hoặc env mới.

Workspace thật dùng WorkspaceShell với sidebar TEXT/LIVE, chọn kênh, tải thêm, tạo kênh hiện có và màn quản trị. Cache phân theo tài khoản, phiên, Workspace, mục đích list. Khi lỗi quyền hoặc hủy, response cũ không được đưa trở lại projection.

## Kiểm tự động

- `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/channel-list.integration.ts` kiểm API/policy/phân trang trên DB UUID riêng của MongoDB 8.0.16 replica set local. Lần đầu thất bại ECONNREFUSED vì container Mongo dừng. Sau khi khởi động container hiện có, 9 ca pass.
- Các ca tích hợp gồm OWNER/ADMIN/MEMBER; PRIVATE chưa có grant, grant bị thu, grant cũ sau rejoin; cursor sai mode/người/Workspace/incarnation; phân trang có trang rỗng và cùng order; xóa kênh giữa trang; membership bị loại, Workspace bị xóa, phiên bị thu, preflight chưa sẵn sàng. Một ca cài deny giả sau DB read xác minh lọc trước response và nhả coordinator.
- Test contract kiểm giới hạn query và DTO strict. Test cursor kiểm vị trí và xác thực phạm vi/tampering. Test web API kiểm cookie/no-store/cancellation.
- Test query dùng QueryClient thật và transport deferred để kiểm CSRF refresh cùng phiên, response sau logout/đăng nhập mới/đổi tài khoản và response sau khi đã hủy/xóa cache.
- Lần chạy cuối `pnpm check` exit 0, 66 file và 943 test pass; harness 55 ca/137 nguồn, format, lint, typecheck và build pass. Build web còn cảnh báo chunk lớn.
- Lần hồi quy cuối `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/channel-list.integration.ts apps/server/test/workspace-access.integration.ts apps/server/test/create-channel.integration.ts` exit 0, 3 suite/45 ca pass.
- `git diff --check` pass.

## Kiểm Chrome với API và DB thật

Server test 3366, Vite 5366 và DB `colearnia_test_scrum36_browser_<uuid>` riêng. Script khởi tạo tài khoản test và phiên để đổi role, sau đó UI gọi auth/Workspace/channel API thật. Không dùng credential của người dùng. Dữ liệu test gồm 26 kênh WORKSPACE và hai PRIVATE với grant khác nhau.

| Ca                            | Kết quả quan sát                                                    |
| ----------------------------- | ------------------------------------------------------------------- |
| OWNER mở sidebar              | Thấy PRIVATE đã được cấp, không thấy PRIVATE chưa được cấp          |
| OWNER mở quản trị             | Thấy metadata PRIVATE và trạng thái quyền đọc                       |
| Tải thêm hai danh sách        | Tải được kênh sau trang đầu, hết trang thì bỏ nút                   |
| Chọn kênh sau tải thêm        | Header và vùng thông tin chuyển đúng kênh                           |
| Tạo PRIVATE qua form SCRUM-35 | Sau thành công thấy trong quản trị, không thêm vào sidebar          |
| ADMIN chưa có grant PRIVATE   | Sidebar không thấy PRIVATE; quản trị thấy metadata, cờ chưa cấp     |
| MEMBER                        | Thấy PRIVATE có grant, không có nút tạo/quản trị                    |
| Mobile 390×844                | Chọn kênh PRIVATE được cấp; sidebar cuộn và nội dung bố trí một cột |
| Về danh sách Workspace        | Chuyển đúng màn, danh sách kênh cũ không còn render                 |

Ảnh local `/tmp/colearnia36-admin.png` và `/tmp/colearnia36-mobile.png`. Các process UI test được dừng sau kiểm; handler chỉ drop DB UUID do script tạo. Container Mongo local đã được khởi động để kiểm.

## Giới hạn

Chọn kênh hiện hiển thị metadata và quyền đọc. Panel chat/cuộc gọi thật tại Workspace cần consumer M2/M3/M4. Không lấy fixture chat/media làm kết quả tích hợp. Cấp/gỡ PRIVATE và đổi tên/xóa theo task tương ứng. Thu quyền đang kiểm qua API/barrier, refresh focus/manual và ca tự động; chưa kiểm push event thu quyền toàn hệ thống. Chưa đo tải kết hợp 25/50 người. Build web có cảnh báo chunk lớn đã có.

## Cập nhật sau tự review — 16/11/2026

- Trang nội dung rỗng nhưng còn cursor hướng dẫn tải tiếp; chỉ báo không có kênh khi đã hết trang. Hai test render component phân biệt hai trạng thái này.
- PRIVATE giữ biểu tượng khóa cùng biểu tượng loại TEXT/LIVE, kể cả mobile; nút có nhãn loại/quyền riêng tư cho trình đọc màn hình và title tên đầy đủ. Hai test shell kiểm cả TEXT và LIVE.
- Test hồi quy tạo kênh dùng spy đồng hồ `performance.now` để kiểm capacity khi chưa hết TTL và hết hạn đúng biên, thay việc chờ 110 ms. Timer MongoDB/network vẫn chạy thật; spy được khôi phục trong finally.
- `pnpm check` chạy ngoài sandbox exit 0: 67 file/947 test pass, harness 55 ca/137 nguồn, format/lint/typecheck/build pass. Lần chạy trong sandbox trước đó bị EPERM ở 5 test HTTP mở cổng loopback; không ghi nhận là pass.
- Bộ DB gồm channel-list, workspace-access và create-channel: 3 suite/45 ca pass trên DB test UUID riêng. `git diff --check` pass. Build web vẫn cảnh báo chunk lớn.
- Chưa chạy lại trình duyệt cho các chỉnh sửa UI trong lượt này; kiểm render component/shell và build đã pass. Bằng chứng Chrome trước đó ở mục trên.
