# SCRUM-88 — kiểm tích hợp MAIN với auth và media thật

## Môi trường và phạm vi

Kiểm local trên Windows, Node 26.12.1, pnpm 11.5.2, MongoDB 8.2.6 replica set một node `rs0` và mediasoup native theo lockfile. Database có tên ngẫu nhiên với tiền tố `colearnia_test_scrum88_`, tách khỏi dữ liệu ứng dụng; suite chỉ xóa database do chính nó tạo. HTTP/Socket.IO dùng loopback với cổng HTTP tự cấp; WebRtcServer dùng TCP/UDP loopback 40188.

Harness dùng `createRegistration`, `createLogin`, `createSessionReader`, cookie/CSRF của M1, `createWorkspaceAccessService`, coordinator/shared deny, repository session MongoDB, `startLiveRuntime` và transport signaling M3. Account được đăng ký qua HTTP; Workspace/membership/channel là dữ liệu test có kiểm soát qua model thật. Registry cấp ticket trực tiếp qua service, còn join/resume/resync và tạo transport đi qua Socket.IO đã xác thực.

FE `SessionProjectionRuntime` và socket binding nhận ACK/snapshot từ server thật trong Node. Không thay snapshot bằng fixture, nhưng chưa mở trang trên trình duyệt và chưa kiểm RoomShell, thiết bị hay autoplay.

## Kết quả

| Ca                                                                             | Kết quả thực chạy                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hai tài khoản có quyền join cùng MAIN; retry không thêm participant/generation | Đạt                                                                                                                                                                                                                        |
| Người ngoài Workspace, kênh TEXT và OWNER chưa có quyền đọc kênh PRIVATE       | Bị từ chối trước khi tạo room                                                                                                                                                                                              |
| HTTP bootstrap RTP capabilities                                                | Chỉ trả khi cookie và proof của đúng socket còn hợp lệ; proof chéo tài khoản hoặc sau disconnect bị từ chối                                                                                                                |
| Disconnect/resume                                                              | Transport cũ đóng; generation mới tăng; cleanup cũ chạy lại không đóng transport mới                                                                                                                                       |
| FE resync                                                                      | Projection cũ đóng và bỏ dữ liệu khi disconnect; runtime mới nhận snapshot đúng generation qua socket thật                                                                                                                 |
| Auth session đã bị revoke trong DB                                             | Không cấp ticket mới; Socket.IO từ chối handshake                                                                                                                                                                          |
| Resume sau khi membership bị gỡ                                                | Không phục hồi quyền bằng resume ticket cũ; không tạo native transport                                                                                                                                                     |
| Logout lúc native create đang chờ                                              | Shared deny có hiệu lực trước durable revoke; lần đầu HTTP 503 khi cleanup chưa xong, native transport trả muộn bị đóng; retry HTTP 200 và session được revoke trong DB; tài khoản khác vẫn dùng được                      |
| Đọc quyền peer dưới Workspace gate                                             | Đạt; cổng actor cũ vẫn yêu cầu User gate, peer không có Workspace gate bị từ chối, session đã revoke không được cấp quyền                                                                                                  |
| Ba query chậm nối tiếp trong ACL hoặc kết thúc bằng query display name         | Đạt; truy vấn MongoDB thật dùng `sleep(4000)` có kiểm soát. Hết ngân sách MAIN trả `DEPENDENCY_UNAVAILABLE`; thao tác thử lấy Workspace gate tại mốc 10,1 giây thành công trong cửa sổ kiểm 11 giây, không chờ đủ 12 giây. |

Bộ mới có 9 test tích hợp xuyên ứng dụng và 2 ca hồi quy bổ sung vào suite workspace access, gồm deny được cài trong lúc snapshot transaction hoàn tất. Hai ca deadline đã lỗi trên bản trước sửa do thao tác lấy gate bị timeout; đạt sau khi truyền cùng ngân sách xuống ACL và User query. Các nhóm kết quả trong bảng có thể nằm cùng một test để giữ liên tục cùng ownership/generation. Phát lại snapshot cũ qua socket sau resume không ghi đè projection mới. Phép mutation tạm bỏ listener disconnect đã làm ca reconnect thất bại đúng nguyên nhân; listener được khôi phục sau phép kiểm.

Kiểm tra local đã chạy:

- Bộ tích hợp SCRUM-88, workspace access và MAIN registry: **59/59 test đạt**, gồm MongoDB và mediasoup native.
- Toàn bộ database integration suite mặc định: **281 đạt, 15 bỏ qua**, 17 file đạt và 1 file bỏ qua. Các ca bỏ qua thuộc profile/failpoint opt-in có sẵn của Workspace/TEXT, không phải ca SCRUM-88 và không được tính là đã kiểm.
- Toàn bộ unit suite: **962/962 test đạt**. Harness/architecture guard: 54 đạt, 1 ca symlink bỏ qua trên Windows.
- Format, lint, typecheck contracts/server/web và test xuyên ứng dụng, build server/web: đạt. Chạy các bước tương đương `pnpm check` theo thứ tự, giới hạn Vitest một worker để phù hợp bộ nhớ local.
- `media:smoke`: worker/Router native khởi động với Opus/VP8. Web build có cảnh báo chunk lớn hơn 500 kB, không có lỗi build.

## Chạy lại

Sau khi bật replica set test theo [local runbook](../runbooks/local-development.md), đặt `COLEARNIA_DB_TEST_PORT` nếu không dùng cổng 27017. Không trỏ suite vào database ứng dụng. Chạy tại root repo:

```sh
pnpm --filter @colearnia/contracts build
pnpm exec tsc -p tests/integration/tsconfig.json
pnpm exec vitest run --config vitest.database.config.ts tests/integration/main-auth-media.integration.ts apps/server/test/workspace-access.integration.ts --maxWorkers=1
pnpm media:smoke
pnpm check
```

`pnpm test:database` và CI chạy cả suite mới. `pnpm typecheck` kiểm thêm test xuyên ứng dụng bằng cấu hình Bundler riêng; server và web không import implementation của nhau trong source ứng dụng.

## Giới hạn và phần còn lại

- M2/M5 cleanup dùng **test double**, được khai báo ngay trong harness; không có chat/board subscription hoặc nội dung riêng thực trong phép kiểm này. Kết quả không xác nhận thu quyền chat/board xuyên miền.
- Chưa mount registry, ticket REST và toàn bộ signaling MAIN vào `main.ts`. `createMainAuthority` là đầu vào thật đã kiểm để composition dùng tiếp; không cài adapter cleanup trả thành công giả vào ứng dụng.
- Nhánh login thay session cũ hiện ghi `revokedAt` trực tiếp, chưa đi qua shared deny/cleanup. Bộ này kiểm logout qua coordinator và session đã bị revoke trong DB; chưa xác nhận race login-replacement với thao tác media đang chờ. Cần M1 phối hợp trước nghiệm thu composition production, không suy rằng mọi đường thu quyền đã được serialize bởi adapter mới.
- Đã kiểm deadline với query DB chậm trong hai đường ACL/User nêu trên; chưa đo pool saturation, mạng DB mất hoàn toàn hoặc tải kết hợp. Không lấy hai ca local này làm cam kết thời gian đáp ứng hoặc capacity.
- Transport native và Router capabilities là thật; chưa có kết nối DTLS/RTP giữa hai browser, mic/camera/share hoặc âm thanh MAIN thực. Không tính native smoke thành cuộc gọi đã dùng được.
- Chưa kiểm staging, 5 người, hai mạng, forced TURN hay credential expiry. SCRUM-89 và issue TURN tiếp tục theo phạm vi riêng.

Bằng chứng này hoàn thành phần kiểm tự động M1–M4–M3 đã nêu, chưa đủ để tuyên bố toàn bộ runtime MAIN được nghiệm thu. Reviewer cần xác nhận giới hạn trên trước khi chốt SCRUM-88; không tự chuyển Done chỉ vì các test xanh.
