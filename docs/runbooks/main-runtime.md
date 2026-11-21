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

Chat trong phiên và board cần adapter của miền phụ trách khi bật. Guard xác nhận truy vấn MongoDB và giữ cleanup pending khi còn dữ liệu chưa được xử lý. Nghiệm thu thay phiên đăng nhập cần SCRUM-94. SCRUM-89 kiểm cuộc gọi thật trên hai mạng và TURN.

## Kiểm lại

```sh
pnpm --filter @colearnia/contracts build
pnpm exec vitest run --config vitest.database.config.ts apps/server/test/main-entry.integration.ts apps/server/test/main-runtime.integration.ts --maxWorkers=1
```
