# SCRUM-67 — Đồng bộ snapshot media trên frontend

M3-T4.6 trên nhánh `feat/SCRUM-67-media-snapshot-reconcile`, nền `221a075`. [Jira SCRUM-67](https://faker1652005.atlassian.net/browse/SCRUM-67) · [Contract nguồn media](../contracts/media-source-sync.md) · [Projection M4](../contracts/session-projection.md)

## Điểm ghép

- CallController sở hữu một runtime snapshot theo đời cuộc gọi. Khi tích hợp, luồng session sẽ truyền cursor M4 đã chấp nhận vào `updateContext`, mở một lượt bằng `begin`, gửi input qua socket rồi đưa ack và các part vào đúng lượt. Runtime chỉ áp đủ bộ khớp cursor, request, descriptor và watermark. Lượt thiếu phần hết hạn sau 5 giây.
- Snapshot giữ nguyên descriptor và trạng thái của own Producer, transport và Consumer. Adapter truyền kết quả Consumer đã được signaling kiểm quyền vào `attachConsumer`. Callback qua lượt resync tương đương được chấp nhận khi stream, audience, policy và binding nguồn vẫn khớp. Callback thuộc đời cũ tự dọn handle vừa tạo. Runtime giữ một attachment cho mỗi nguồn và dọn attachment cũ ngay khi audience đổi.
- Adapter đăng ký handle local qua `trackOwnProducer` và `trackOwnTransport`. Runtime đóng đúng handle khi tài nguyên biến mất hoặc khác định danh. Với replacement đã đăng ký, runtime chỉ giữ khi token, revision và deadline còn khớp, hủy nếu context đổi hoặc hết hạn. ICE generation là metadata đối soát. Việc retry cùng intent và áp ICE parameters thuộc M3-T4.5.
- Khi ack thuộc policy revision khác cursor đang có, consumer cần cập nhật projection M4 rồi lấy snapshot mới. Delta, replay và backoff thuộc SCRUM-68. Việc ghép nguồn được phép giữ xuyên chuyển phòng thuộc M3-T7.1.

## Kiểm chứng

- `pnpm check` đạt, gồm 372/372 test Vitest. Build web có cảnh báo chunk Vite vượt 500 kB.
- `pnpm exec vitest run apps/web/src/features/live/runtime` đạt 18/18. Các ca bổ sung kiểm callback Consumer đến sau replay hoặc đổi revision, giữ và dọn handle Producer/transport, hủy replacement sai revision và hết hạn.
- Lượt trước khi bổ sung registry own resources, Chrome headless trên Vite loopback chạy fixture cục bộ với audio tổng hợp từ Web Audio. Sau hai lần áp snapshot, DOM có một phần tử audio với cùng một track còn live và adapter chỉ gắn một lần. Abort dọn phần tử, xóa `srcObject` và đưa track về `ended`.
- `pnpm media:smoke` đạt với native mediasoup worker và Router Opus/VP8.
- Các ca trên dùng packet fixture và adapter audio cục bộ. Chưa kiểm socket snapshot với registry/auth thật, đồng bộ native Producer/transport, luồng LIVE qua hai mạng hoặc TURN. M4 review điểm ghép cursor và vòng đời khi tích hợp.
