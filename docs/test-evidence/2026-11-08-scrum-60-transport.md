# SCRUM-60 — Transport create/connect qua signaling

M3-T4.1 trên nhánh `feat/SCRUM-60-media-transport-signaling`, nền `3ab2f86`. [Sprint 1 và điểm ghép M4](../planning/sprint-1.md) · [Proposal M3](../proposals/m3-media.md#633-phủ-toàn-bộ-thao-tác-m3-signaling-api-trình-duyệt-và-interface-nội-bộ)

## Giao diện cho M4 và FE

- `media.transport.create` nhận `{ direction: 'SEND' | 'RECV' }`, trả `{ transportId, iceGeneration: 0, iceParameters, iceCandidates, dtlsParameters }`. Factory dùng Router của phiên và WebRtcServer chung của worker, tắt SCTP. `media.transport.connect` nhận `{ transportId, dtlsParameters }`, trả `{ transportId, connected: true }` sau khi worker nhận DTLS parameters. Browser vẫn phải theo dõi trạng thái kết nối thực tế.
- Cả hai dùng envelope mutation SCRUM-22 và ack theo `requestId`. [Schema](../../packages/contracts/src/mediaTransport.ts) · [Signaling](../../apps/server/src/live/media/transportSignaling.ts)
- M4 cung cấp `withContext` để xác minh socket, auth, ACL, deny barrier và Router hiện hành. Callback kiểm và ghi trạng thái đồng bộ dưới gate. Native I/O chạy sau khi nhả gate. Kiểm lại context trước khi công bố tài nguyên và trả ack. Adapter cleanup dùng target/token của SCRUM-23. Pending bị vô hiệu ngay, slot I/O giữ tới khi native thực sự settle, kết quả cũ tự đóng tài nguyên vừa tạo. Transport đã kết nối chuyển theo lifecycle/cleanup của M4.
- Profile PoC dùng một SEND và một RECV cho mỗi binding, tối đa 512 slot/process. Chia sẻ admission I/O 2/user, 8/session, 32/process với cleanup. Command có budget 16 KiB. Chờ native tối đa 2 giây, transport chưa đạt DTLS connected hết hạn sau 10 giây. Replay giữ intent 60 giây, giới hạn 64/user, 1.024/session và 4.096/process. Descriptor nhạy cảm chỉ nằm trên transport còn sống. `SERVER_BUSY` và `OPERATION_IN_PROGRESS` dùng theo proposal, M4 review mã và ngưỡng PoC trước khi ghép vào handler thật.

## Chạy lại trên loopback

Chạy `pnpm --filter @colearnia/contracts build` một lần. Sau đó mở hai terminal ở root repo.

```powershell
pnpm --filter @colearnia/server exec tsx test/fixtures/media-transport/mediaTransportFixture.ts
```

```powershell
pnpm --filter @colearnia/web dev --port 5191 --strictPort
```

Mở `http://127.0.0.1:5191/test/browser/media-transport/?browser=A` trên Chrome và cùng URL với `browser=B` trên Edge. Fixture server lắng nghe ở `127.0.0.1:5192`, media WebRtcServer dùng port `41960`. Hai browser dùng context fixture M4 khác nhau trên cùng Router. Track im lặng chỉ kích hoạt đàm phán của `mediasoup-client`. Fixture không tạo Producer ở SFU hoặc chuyển tiếp audio.

Kết quả local trên Windows: Chrome và Edge đều báo `PASS · Socket.IO create/connect, WebRTC connected`. Worker ghi hai sự kiện DTLS `connected`. Test tự động kiểm dedupe, tab khác, generation cũ, connect lại với DTLS parameters khác, lỗi connect, thu quyền trong lúc native connect còn chờ, revoke/timeout khi create còn pending và hết hạn trước DTLS.

Socket production giữ middleware fail-closed hiện có. Khi ghép registry, M4 cần nối `withContext` và cleanup, đồng thời kiểm đường end/revoke/deadline dưới áp lực admission để barrier không phụ thuộc slot I/O. Chưa kiểm qua auth/registry thật, RECV media, chuyển tiếp RTP, TURN hoặc profile tải 5/25/50. SCRUM-61 ghép Producer/Consumer, SCRUM-64 ghép REST bootstrap/ICE, còn gate MAIN tích hợp kiểm auth, Router và context thật.
