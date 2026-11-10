# SCRUM-62 — Pending media và callback cũ

M3-T4.3 trên nhánh `feat/SCRUM-62-media-pending-registry`, nền `bcd21ca`. [Sprint 1](../planning/sprint-1.md) · [Contract thu quyền media](../contracts/media-cleanup.md) · [Context và cleanup M4](../contracts/session-context.md#thu-quyền-và-cleanup)

## Điểm ghép M3 và M4

- Transport create/connect, Producer create, Consumer create và Consumer ready dùng chung [pending registry](../../apps/server/src/live/media/pending-media-operations.ts) và ngân sách I/O. Consumer đang chờ ghi cả binding người nhận lẫn binding của Producer nguồn. Thu quyền từ một trong hai phía vô hiệu đúng thao tác đang chờ.
- M4 dùng `media: { revoke: transportSignaling.cleanup }` dưới gate hiện hành. Hàm đối chiếu session/epoch, target, call generation và scope/audience theo contract. Registry vô hiệu callback trước khi cleanup transport. Native handle đã có được đóng ngay. Nếu handle trả muộn, chính callback đóng handle đó trước khi có thể công bố kết quả.
- Lệnh bị vô hiệu trả `CONFLICT`. `cleanupPending` vẫn là `true` trong khi thao tác đã vô hiệu còn chờ native I/O hoặc callback settle. Slot admission chỉ được trả sau khi tác vụ kết thúc. Lượt cleanup theo audience cũ giữ nguyên tài nguyên của audience mới.
- ACK thành công của Producer/Consumer được kiểm và gửi trong cùng lượt giữ gate. Sau khi native settle và trả slot, handler kiểm lại context, quyền và đúng handle còn mở trước khi gửi ACK, kể cả khi trả lại kết quả create từ intent đã hoàn thành.

## Kiểm chứng

- Test hồi quy trì hoãn Producer create, Consumer create và native resume. Test kiểm thu quyền ở phía nhận và phía phát, đóng handle đã trả về nhưng còn chờ kiểm context, giữ slot đến khi settle và giữ nguyên Producer thuộc audience mới.
- Ba ca hồi quy bổ sung đặt revoke sau khi bỏ pending và trước ACK của Producer create, Consumer create và Consumer ready. Cả ba phải trả lỗi, đóng handle cũ và để số slot I/O ở mức 0.
- Probe local dùng worker mediasoup thật và context fixture. Tạo hai transport, một Producer Opus và một Consumer paused. Giữ callback Consumer sau khi native trả handle, thu quyền bên phát rồi thả callback. Router dump theo thứ tự Transport/Producer/Consumer là `0/0/0 → 2/1/1 → 1/0/0 → 0/0/0`. Lệnh cũ trả `CONFLICT`, Consumer đã đóng, transport người nhận còn mở đến lượt cleanup riêng và số slot I/O trở về 0.
- Probe native cho khe sau settle đặt revoke bên phát trước ACK. Handler trả `NOT_FOUND`, Consumer cũ đã đóng, transport bên nhận vẫn mở và số tài nguyên về `0/0/0` sau cleanup cả hai phía.
- `pnpm check` đạt, gồm 369/369 test Vitest. Harness có một ca symlink bị skip trên Windows. Build web có cảnh báo kích thước chunk Vite. `pnpm media:smoke` đạt với native worker và Router Opus/VP8.

Probe dùng context và Socket.IO port giả lập, gọi qua các handler signaling và worker thật. Chưa kiểm revoke qua auth/registry production, truyền qua hai mạng hoặc TURN. Reviewer của điểm ghép cleanup là M4.
