# SCRUM-91 — Worker chết và restart runtime

Nền main `5bfbdde`, gồm bootstrap/end/revocation. Kiểm trên Windows, Node 26.12.1, pnpm 11.5.2 và MongoDB 8.2.6 replica test riêng trên loopback. Không đổi staging/env/schema hoặc chạy migration lên DB ứng dụng.

## Kết quả

| Kiểm tra             | Kết quả                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime/registry mới | 11 ca: notification died/close, immutable Router IDs, listener, failed Router isolation, end lặp, join/create ACK muộn và metadata chưa rõ |
| Unit suite           | 638 test, 41 file đạt; giới hạn Vitest một worker do bộ nhớ local                                                                          |
| MongoDB integration  | 142 test, 10 file đạt; có ca dừng đúng subprocess mediasoup do test tạo                                                                    |
| Check repo           | Các bước tương đương pnpm check qua entrypoint Node: harness, format, lint, typecheck contracts/server/web, unit test và build             |

Ca worker thật dùng runtime, binder, coordinator, registry, repository MongoDB và native Router. Sau khi tạo phiên/participant, test dừng đúng PID worker do nó tạo. Runtime nhận died, giữ đúng Router ID dù Router đã bị worker đóng trước; pipeline end chuyển metadata sang ENDED, hostUserId=null, participation có leftAt và xóa ownership. `/health/ready` chuyển 200→503, `/health/live` giữ 200; runtime không tạo Router mới. Listener đăng ký sau sự cố nhận cùng notification.

Ca pending create giữ metadata ACK tới sau failure. Không phát ticket; sau khi nhả gate, room được đưa vào pipeline end. Ca metadata chưa rõ vẫn cleanup nhưng không gọi begin/complete mù. Unit test xác nhận room thuộc Router khác giữ context và end đã chạy không bị ghi lần hai.

## Giới hạn

- App hiện chưa mount registry MAIN/provider cleanup đầy đủ. `main.ts` dùng entrypoint `startLiveRuntime`, entry này tự nối binder khi composition cung cấp `mountRegistry`. SCRUM-88 do M4 thực hiện/M3 review ghép registry/provider/socket/routes thật; không dùng fixture authority/cleanup trong production.
- Authority M1 và cleanup M2/M5 trong ca native là fixture. Không chứng minh browser audio/video, hai mạng hoặc TURN. Không tự tạo worker thay thế.
- Cold bootstrap SCRUM-80 được giữ trong gate startup và bộ integration hiện có; không chạy bootstrap trên runtime đang phục vụ để bỏ qua cleanup.
- Một lượt test gặp thiếu RAM local, đã chạy lại Vitest một worker. Replica test dừng sau lần ngắt phiên, được khôi phục đúng đường dẫn/port riêng rồi chạy lại; không coi các lượt lỗi môi trường là đạt.
- MongoDB baseline 8.0.16/Docker cần CI xác nhận. Web build còn cảnh báo chunk trên 500 kB.

Xem [contract worker failure](../contracts/worker-failure.md).

## Cập nhật review PR #87 — 12/11/2026

- Tái hiện `maxEndRecords=1`: end A, tạo/join B, để replay A quá TTL rồi báo Router B chết. Trước sửa trả PENDING và không chạy end B; sau sửa dọn replay hết hạn trong Workspace gate trước lookup/cap, B ENDED và cả ba cleanup domain được gọi. Notification lặp không ghi metadata lại. Không xóa record PENDING chưa được đối soát.
- Thêm `startLiveRuntime` dùng chung ở `main.ts` và integration. Test không gọi binder thủ công: entrypoint gọi callback mount registry rồi nối failure; worker subprocess thật bị dừng, admission đóng và registry end/cleanup đúng phiên với MongoDB thật. Health qua `createApp` xác nhận ready 503/live 200.
- Bốn unit test entrypoint kiểm gắn admission/registry, thiếu mount không giả có cleanup, mount lỗi đóng runtime và lỗi registry chỉ báo mã an toàn; close tháo listener.
- Test này dùng entrypoint khởi động LIVE của app và HTTP app thật, chưa chạy subprocess `main.ts` với auth/access/cleanup production. Kiểm composition đầy đủ được bàn giao rõ cho SCRUM-88.
- Sau cập nhật review: 643 unit test/42 file, 142 DB integration test/10 file, native media smoke, harness, format, lint, typecheck và build đạt. Vitest vẫn một worker; cảnh báo Vite bundle lớn giữ nguyên.
