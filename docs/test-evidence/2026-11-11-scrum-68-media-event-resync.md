# SCRUM-68 — Media delta và resync

M3-T4.7 tiếp nối snapshot SCRUM-67. [Task](https://faker1652005.atlassian.net/browse/SCRUM-68) · [Contract media](../contracts/media-source-sync.md) · [Planning Sprint 1](../planning/sprint-1.md)

## Điểm ghép

- CallController giữ cùng MediaSnapshotRuntime từ SCRUM-67. Media adapter gọi `bindMediaSourceSocket(runtime, socket, signal)` để nối delta, ack và part với call hiện hành. Luồng session cung cấp cursor M4 qua `updateContext`.
- Frontend giữ tối đa 64 event hoặc 256 KiB trong thời hạn snapshot 5 giây. Runtime kiểm toàn bộ chuỗi sau watermark trước khi cập nhật state và đối soát tài nguyên. Gap, event cùng sequence nhưng khác dữ liệu, overflow và timeout yêu cầu snapshot mới. Mỗi call có một lượt chờ và tối đa ba retry với backoff 0,5/1/2 giây và jitter.
- Callback Consumer kiểm source, đời call, audience và các event đóng kể từ snapshot đã dùng. Nếu Consumer hoặc RECV transport đã đóng, callback dọn handle thay vì gắn lại. Đổi audience, ACK từ chối quyền hoặc kết thúc call dọn dữ liệu và tác vụ cũ.
- Server dùng `createMediaSourceSync` với `withContext` của M4, transport signaling và paused-ready signaling. Resync chụp projection từ registry, lọc nguồn theo policy của người nhận và chỉ lấy own resources của người đó. Server kiểm lại quyền và projection trước khi gửi. Một socket chỉ có một lượt resync đang chạy, tối đa 64 lượt đồng thời cho một instance service theo profile PoC.
- `attach(socket)` đăng ký resync và trả `publish(name, payload)` cho bên gọi sau khi mutation đã commit. Publisher kiểm quyền và cấp sequence theo từng người nhận. Stream giữ nguyên qua resync cùng đời call/audience và đổi khi đời call/audience thay đổi. Nếu snapshot đổi trong lúc chuẩn bị, server trả SERVER_BUSY để client retry.

## Kiểm chứng và phần còn thiếu

- `pnpm check` đạt toàn bộ harness, format, lint, typecheck, 568/568 test Vitest và build. Harness bỏ qua một ca symlink trên Windows, build web còn cảnh báo chunk vượt 500 kB.
- `pnpm media:smoke` đạt với native mediasoup worker và Router Opus/VP8.
- Bộ test media liên quan đạt 64/64. Ba ca frontend kiểm callback đến muộn sau khi đóng Consumer hoặc RECV, và kiểm delta mâu thuẫn không ghi dở state. Các ca server kiểm stream riêng từng người nhận, quyền thay đổi trước khi gửi và snapshot sau khi publisher bị thu quyền.
- Test server dùng policy M4 và registry media qua fixture socket. Việc mount trong luồng LIVE và nối các điểm commit tài nguyên vào publisher thuộc điểm ghép T7.4. Chưa kiểm ACL end-to-end trên môi trường chạy ứng dụng, thiết bị thật hoặc TURN.
