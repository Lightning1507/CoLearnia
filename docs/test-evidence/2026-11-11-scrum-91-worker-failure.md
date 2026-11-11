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

- App hiện chưa mount registry MAIN/provider cleanup đầy đủ. Main đã nối admission/readiness; binder registry được kiểm integration thật và cần được composition gọi khi mount MAIN.
- Authority M1 và cleanup M2/M5 trong ca native là fixture. Không chứng minh browser audio/video, hai mạng hoặc TURN. Không tự tạo worker thay thế.
- Cold bootstrap SCRUM-80 được giữ trong gate startup và bộ integration hiện có; không chạy bootstrap trên runtime đang phục vụ để bỏ qua cleanup.
- Một lượt test gặp thiếu RAM local, đã chạy lại Vitest một worker. Replica test dừng sau lần ngắt phiên, được khôi phục đúng đường dẫn/port riêng rồi chạy lại; không coi các lượt lỗi môi trường là đạt.
- MongoDB baseline 8.0.16/Docker cần CI xác nhận. Web build còn cảnh báo chunk trên 500 kB.

Xem [contract worker failure](../contracts/worker-failure.md).
