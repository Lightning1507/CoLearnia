# SCRUM-61 — Producer/Consumer theo luồng paused-ready

M3-T4.2 trên nhánh `feat/SCRUM-61-media-paused-ready`, nền `c681a06`. [Jira SCRUM-61](https://faker1652005.atlassian.net/browse/SCRUM-61) · [Sprint 1](../planning/sprint-1.md) · [Proposal media M3](../proposals/m3-media.md) · [Policy nhóm và media](../product/groups-media-policy.md)

## Contract và điểm ghép M4

- `media.producer.create` tạo MIC hoặc CAMERA trên SEND transport thuộc đúng binding hiện hành. Server cấp descriptor nguồn. Mỗi binding chỉ có một MIC và một CAMERA đang mở.
- `media.consumer.create` kiểm binding nguồn, quyền M4 và codec rồi tạo Consumer ở `paused: true`. Client dựng Consumer và gắn track cục bộ trước khi gửi `media.consumer.ready` với cùng source ID, generation và revision.
- `ready` kiểm lại quyền và codec ngay trước `resume()`. Nếu context hoặc quyền đổi khi native I/O đang chạy, kiểm tra trước ack sẽ từ chối và đóng Consumer cũ. Consumer chưa ready tự đóng sau 10 giây. Đóng transport khi thu quyền cũng đóng các Producer và Consumer thuộc transport đó.
- Create dùng chung ngân sách I/O của SCRUM-60. Request trùng đang chạy trả `OPERATION_IN_PROGRESS`. Khi tài nguyên còn sống, retry cùng intent có thể đọc lại kết quả sau khi kiểm quyền. Sau khi tài nguyên đóng, adapter chỉ giữ dấu vết intent trong 60 giây để trả `CONFLICT` cho request cũ. Ngân sách intent là 64/user, 1.024/session và 4.096/process. Callback native đến muộn tự đóng tài nguyên và chỉ trả slot khi I/O thực sự kết thúc. Adapter giới hạn 512 Producer và 512 Consumer mỗi process cho profile PoC, còn chờ đo khi kiểm tải.
- `consumer.create` trả cùng lỗi `NOT_FOUND` khi Producer không tồn tại hoặc nguồn nằm ngoài quyền nhận. `SOURCE_CHANGED` dành cho binding cũ của nguồn actor còn được phép nhận.
- M4 cung cấp `LiveContext`, Router và `SessionPolicyInput` của cùng lần kiểm dưới gate thông qua `withContext`. [Schema signaling](../../packages/contracts/src/media-paused-ready.ts) · [Adapter paused-ready](../../apps/server/src/live/media/paused-ready-signaling.ts)

## Chạy lại trên loopback

Chạy `pnpm --filter @colearnia/contracts build` ở root repo. Mở hai terminal và lần lượt chạy:

```powershell
pnpm --filter @colearnia/server exec tsx test/fixtures/media-transport/media-transport-fixture.ts --paused-ready
pnpm --filter @colearnia/web dev --port 5191 --strictPort
```

Mở [trình duyệt A](http://127.0.0.1:5191/test/browser/media-paused-ready/?browser=A) và [trình duyệt B](http://127.0.0.1:5191/test/browser/media-paused-ready/?browser=B) gần nhau. Fixture dùng audio oscillator và canvas video. Với headless, chạy cùng tùy chọn `--autoplay-policy=no-user-gesture-required`. Mỗi bên phải giải mã được frame hình, nhận gói audio và đo được tín hiệu audio của phía còn lại bằng Web Audio.

## Kết quả và giới hạn

- Chrome và Edge chạy headless trên Windows, dùng chung một Router mediasoup qua Socket.IO trên loopback. Server ghi nhận bốn kết nối DTLS. Lần kiểm cuối Chrome A giải mã 2 frame, nhận 10 gói audio, biên độ đỉnh 1,000. Edge B giải mã 1 frame, nhận 10 gói audio, biên độ đỉnh 0,774.
- `pnpm check` đạt. Vitest đạt 355/355 test, gồm 9 ca signaling kiểm paused → ready, thu quyền trước và trong khi resume, revision nguồn cũ, codec không còn tương thích, che nguồn ngoài audience, retry Producer/Consumer sau khi đóng và hết hạn replay. `pnpm media:smoke` đạt với native worker và Router Opus/VP8. Build web có cảnh báo kích thước chunk Vite.
- Hai trình duyệt dùng danh tính và nguồn discover qua fixture. Cần kiểm lại với registry/auth thật khi M4 ghép production, cùng camera/mic thiết bị, TURN, cách ly nhóm và profile tải. Share dùng lease M4 ở SCRUM-73. Phân phối snapshot/event và đổi revision nguồn tiếp tục ở các task sau. Reviewer của contract và điểm ghép là M4.
