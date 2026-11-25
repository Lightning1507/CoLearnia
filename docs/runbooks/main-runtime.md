# SCRUM-88 — Chạy MAIN và bàn giao cho SCRUM-93

## Khởi động

1. Chuẩn bị MongoDB replica set, collection và index auth/Workspace theo [hướng dẫn local](local-development.md). Áp index theo [manifest metadata phiên](../../apps/server/src/live/session-manager/session-models.ts) trước khi bật MAIN. Startup chỉ đọc để xác nhận index.
2. Đặt `SESSION_SECRET`, `APP_ORIGIN`, `MEDIA_ENABLED=true` và cấu hình địa chỉ/cổng media. Đặt `TEXT_SYNC_LIMITS_JSON` để nối cleanup M2 vào coordinator chung. Ví dụ cấu hình test dùng `{"subscriptions":32,"perUser":4,"leaseMs":60000,"revocationRecords":128}`. Budget này cần được review trước khi dùng trên staging. Phần MAIN có thể kiểm khi chưa bật budget subscribe TEXT.
3. Chạy server và kiểm `/health/ready`. Khi chưa cấu hình MAIN, endpoint vé và media trả 503. Với TURN, cấu hình credential riêng phía server theo [runbook Cloudflare](cloudflare-turn.md).

## Nối giao diện

| Bước              | Contract                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lấy vé            | `POST /api/v1/channels/:channelId/live-session/join`, cookie M1 + CSRF, body `{ requestId }`. Server lấy Workspace từ channel.                                                                                                                                 |
| Vào MAIN          | Mở Socket.IO cùng cookie/CSRF. Gửi `session.join` với `requestId` và `ticket`. Dùng ACK và các phần `session.snapshot` cùng request/snapshot ID.                                                                                                               |
| Bootstrap media   | Gọi `media.httpContext.issue` trên socket hiện tại, gửi token qua `X-Media-Context` khi đọc `GET /api/v1/live-sessions/:sessionId/media/bootstrap`. ICE dùng endpoint `POST /api/v1/live-sessions/:sessionId/media/ice-credentials` và cùng ngữ cảnh xác thực. |
| Reconnect         | Dùng `session.resume` với `resumeTicket` trên socket mới. Thay generation từ ACK, bỏ transport/cursor cũ rồi đồng bộ lại bằng `session.resync` và `media.sources.resync`.                                                                                      |
| Rời hoặc kết thúc | Thành viên gửi `session.leave`, host gửi `session.end`. Khi ACK `pending`, giữ cùng request ID và dữ liệu để retry. Khi nhận `session.ended`, bỏ projection của đúng ownership.                                                                                |

Các lệnh dùng schema trong [package contracts](../../packages/contracts/src/index.ts). Khi server đóng socket do không thể gửi dữ liệu đúng hạn, mở kết nối đã xác thực và resync trước khi hiển thị lại trạng thái phòng.

Nếu phòng trước đang kết thúc, endpoint cấp vé trả HTTP 409 `SESSION_END_PENDING` khi kết quả chưa được xác nhận. Khi không còn thao tác kết thúc đang chạy, yêu cầu cấp vé có thể tiếp tục đối soát đúng thao tác cũ. Vé của epoch mới chỉ được cấp sau khi việc kết thúc phiên cũ đã được xác nhận.

Chat trong phiên và board cần adapter của miền phụ trách khi bật. Guard xác nhận truy vấn MongoDB và giữ cleanup pending khi còn dữ liệu chưa được xử lý. Nghiệm thu thay phiên đăng nhập cần SCRUM-94. SCRUM-89 kiểm cuộc gọi thật trên hai mạng và TURN.

## Giao diện Workspace → MAIN (SCRUM-93)

`MainCallProvider` giữ một cuộc gọi trong vòng đời ứng dụng đã đăng nhập, dùng lại `CallControllerOwner`. Chọn kênh LIVE có quyền rồi bấm **Vào phòng trực tiếp** để mở lobby. Sau khi vào phòng, **Workspace** thu nhỏ cuộc gọi; đổi sang TEXT không tạo owner/socket mới. Host thấy **Kết thúc phiên**, thành viên thấy **Rời**; quyền lấy từ projection server.

URL kênh là `/workspaces/:workspaceId/channels/:channelId`; lobby/MAIN dùng hậu tố `/live`, không chứa ticket hay identity phiên. F5 đọc lại auth và danh sách kênh có quyền rồi mở lobby của đúng kênh, không tự join/capture. Theo [contract reconnect](../contracts/main-reconnect.md), resume ticket chỉ ở RAM nên không lưu nó để phục hồi xuyên reload. Sau khi bấm tham gia lại, nếu server trả `CALL_ALREADY_ACTIVE` do ownership cũ còn trong grace, FE đợi 5 giây giữa các lần thử, tối đa khoảng 35 giây/8 lần; mỗi từ chối xác định cho phép xin vé chưa consume mới vì epoch cũ có thể đã kết thúc. Không gửi takeover hoặc dọn quyền của browser khác. Hết budget vẫn chặn và báo rõ; Hủy/logout dừng lượt chờ. Reconnect khi trang còn sống vẫn dùng resume ticket RAM và generation mới theo contract.

SEND/RECV được tạo khi có nguồn cần phát/nhận, tránh hết hạn DTLS trên transport chưa dùng. Bootstrap/ICE đi qua HTTP context proof của socket hiện hành. Khi mất kết nối, đóng media generation cũ, thử `session.resume` có giới hạn và resync; mic/camera vẫn tắt sau nối lại. Khi máy chủ chưa xác nhận cleanup, giao diện giữ cảnh báo và cùng request để thử lại, không coi tắt track local là đã rời thành công.

### Kiểm local trên cùng máy, không dùng TURN

`MEDIA_LOCAL_DIRECT=true` là lựa chọn **tường minh**, mặc định `false`. Chỉ hợp lệ ngoài production và khi `HOST`, `MEDIA_LISTEN_IP`, `MEDIA_ANNOUNCED_ADDRESS`, hostname `APP_ORIGIN` đều là loopback. ICE endpoint vẫn kiểm cookie/CSRF/context proof, nhưng trả danh sách ICE server rỗng để dùng kết nối trực tiếp. Không tự chuyển sang chế độ này khi Cloudflare lỗi. Không dùng cho thiết bị khác, hai mạng hoặc bằng chứng TURN của SCRUM-89.

Có thể dùng server kiểm thử riêng [main-ui-local-test.ts](../../apps/server/scripts/main-ui-local-test.ts): không đọc `.env`, chỉ tạo DB tên ngẫu nhiên trên Mongo test port khác 27017, tạo collection/index bằng manifest hiện hành và chạy entry `main.ts` thật. Không dùng DB này lưu dữ liệu cần giữ; script xóa đúng DB test của nó khi thoát. Chuẩn bị Mongo replica set riêng tại port 27193 trước khi chạy:

```powershell
pnpm --filter @colearnia/server exec tsx scripts/main-ui-local-test.ts
```

Terminal web riêng:

```powershell
$env:PORT = '3193'
pnpm --filter @colearnia/web dev --host localhost --port 5193
```

Mở `http://localhost:5193`, đăng ký tài khoản test, tạo Workspace và kênh LIVE bằng UI thật. Kiểm hai tài khoản bằng hai browser/profile độc lập. Script không cấp identity/ticket/ACK hay snapshot giả cho browser. Dừng cả hai terminal khi xong; không khởi động thêm backend cùng cổng.

Bằng chứng hiện tại và những ca chưa kiểm: [SCRUM-93 local](../test-evidence/2026-11-22-main-ui-integration.md).

## Kiểm lại

```sh
pnpm --filter @colearnia/contracts build
pnpm exec vitest run --config vitest.database.config.ts apps/server/test/main-entry.integration.ts apps/server/test/main-runtime.integration.ts --maxWorkers=1
```
