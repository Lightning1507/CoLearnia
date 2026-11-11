# Reconnect và resync MAIN — SCRUM-84

Registry dùng chung của [SCRUM-82](main-join-registry.md) có `disconnect`, `resume` và `resync`. Schema join/resume ở `packages/contracts/src/session-join.ts`; resync dùng lại schema [SCRUM-66](session-projection.md). Adapter `main-reconnect-signaling.ts` gắn thêm vào socket cùng adapter join.

## Contract gửi nhận

| Thao tác              | Input                                                                                                         | Kết quả                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `session.join`        | Contract join hiện có                                                                                         | Bổ sung `resumeTicket` trong result ACK riêng của owner; không có trong snapshot.                     |
| Callback `disconnect` | Socket ID lấy trực tiếp từ server                                                                             | Thu quyền kết nối cũ, cố định deadline grace và bắt đầu cleanup; không phải command từ client.        |
| `session.resume`      | `{requestId,sessionId,epoch,callGeneration,resumeTicket}`; generation/ticket của ownership trước khi mất mạng | ACK completed như join, cùng participant, generation mới, ticket mới và descriptor snapshot.          |
| `session.resync`      | `{requestId,sessionId,epoch,callGeneration,payload:{lastProjectionSequence?,lastPolicyRevision?}}`            | ACK completed với result `{snapshotId,partCount}`, sau đó các part `session.snapshot` đúng requestId. |

Actor luôn lấy từ socket auth của M1. Resume phải khớp user/authSession đã join, epoch, generation và ticket; auth session mới hoặc tab khác không được dùng đường này để takeover call còn kết nối. Input strict không nhận actor, role hoặc quyền do client khai. Resync không yêu cầu revision cũ khớp, vì đây là đường đọc state mới; vẫn kiểm đúng socket/generation hiện hành.

`resumeTicket` là 32 byte ngẫu nhiên, base64url 43 ký tự. Chỉ gửi qua ACK riêng, giữ trong RAM controller; không đặt trong URL, localStorage, projection, DB hoặc log. Registry giữ token hiện hành và một digest replay/owner để xử lý mất ACK, có giới hạn theo số ownership. Sau resume thành công token xoay; khi socket mới còn kết nối, token cũ chỉ replay đúng requestId/socket đó. Nếu ACK chưa tới client và socket mới cũng bị phát hiện disconnect, intent/ticket cũ có thể nối lại qua socket khác trong grace của lần disconnect mới, sau cleanup đúng generation hiện hành. Không cho đổi intent hoặc chiếm socket đang kết nối. Intent dùng token mới sẽ thay bản replay cũ; revoke/hết grace vô hiệu cả đường phục hồi này. Retry đồng thời không nhân generation hoặc ghi lại participant.

## Disconnect → cleanup → resume

1. Phát hiện disconnect đặt deny cho socket cũ ngay, tăng audienceEpoch/policyRevision. Deadline reconnect là thời điểm phát hiện cộng tối đa **30.000 ms**, cấu hình không được vượt baseline này. Callback lặp hoặc retry không gia hạn deadline.
2. Port `reconnectCleanup` bắt buộc có media revoke đồng bộ cùng messaging/board cleanup. Media revoke đóng và vô hiệu pending theo đúng participant/generation cũ trước khi chờ gate. Kết quả được chuyển vào coordinator cleanup chung để tránh gọi native revoke lần hai.
3. Chuẩn bị cleanup dưới Workspace gate rồi chạy I/O bên ngoài gate. Resume đợi cùng cleanup đang chạy, không giữ User/Workspace gate để chờ I/O. ACK cleanup phải khớp operation/epoch/generation/target và xác nhận đã thu quyền, vô hiệu pending. Cleanup thiếu, lỗi hoặc chưa được xác nhận thì không cấp ownership mới.
4. Dưới User → Workspace gate chung, đọc lại auth/access và continuity từ M1, kiểm deadline sau await, deny barrier, phiên/Router và socket mới. Membership/incarnation đổi, revision lùi hoặc revoke/regrant gap đều từ chối. Quyền đã bị thu không tự mở lại khi provider sau đó trả allow. Lỗi đọc tạm có thể retry trong deadline gốc.
5. Commit binding mới, tăng callGeneration, về MAIN, xoay resume ticket và dựng snapshot mới theo quyền hiện tại. Không gọi lại repository.join và không khôi phục media/chat/board grant cũ. Client reconcile tài nguyên qua các controller bằng context mới; scope, role và resource riêng không lấy từ cache.
6. Adapter kiểm lại `withContext` ngay trước ACK/snapshot fanout. Callback disconnect muộn của socket cũ không tác động socket mới; socket mới dùng generation cũ cũng bị từ chối.

Khi hết grace, resume bị từ chối ngay cả khi sweep chưa chạy. Registry bỏ ownership hết hạn sau khi cleanup xác nhận đã thu quyền; cleanup chưa xác nhận vẫn giữ deny. `sweepExpired()` hoặc thao tác dưới gate dọn phần hết hạn. SCRUM-87 xử lý read-back và quyết định end khi ownership cuối mất hiệu lực; task này không thêm empty grace. Cơ chế host tạm/hoàn quyền đầy đủ thuộc lifecycle host, không được suy từ một ACK resume.

## Composition và lỗi

Composition tạo một registry và một coordinator dùng chung. Inject `reconnectCleanup` của M3/M2/M5; media phải cung cấp `{revoke(request): result}` đồng bộ. Không dùng adapter always-success trong production. Gắn `attachMainJoinSocket(...)` và `attachMainReconnectSocket(registry,socket,readAuth,onLifecycleError)` đúng một lần trên mỗi socket. Error callback chỉ nhận mã lỗi an toàn, không nhận raw exception hoặc token.

- Allow: cùng owner mất mạng, cleanup đạt, nối lại trong grace với quyền liên tục → participant giữ nguyên, generation và ticket thay mới.
- Deny: đã thu auth/quyền, cleanup chưa đạt hoặc auth session khác → không phục hồi call grant.
- Stale: socket/generation/epoch/ticket cũ hoặc quá grace → `CONFLICT`; quyền nền bị thu → `FORBIDDEN`/`AUTH_REQUIRED`; provider/cleanup chưa sẵn sàng → `DEPENDENCY_UNAVAILABLE`.

Registry và adapter chưa được mount vào app production trong task này, cùng giới hạn composition của SCRUM-82. Heartbeat/control-lease detection và controller FE cần ghép bằng provider thật; không dùng callback disconnect thử nghiệm làm bằng chứng reconnect trình duyệt hoàn chỉnh.

## Kiểm chứng

Unit kiểm socket cũ, generation mới, ACK mất/retry đồng thời, deadline cố định và qua await, continuity gap, lỗi provider tạm, pending cleanup không giữ gate và resync không replay snapshot cũ. Contract kiểm token/generation/identity giả; signaling kiểm auth trước dispatch và quyền trước fanout.

Integration dùng MongoDB replica set riêng và mediasoup native: đóng WebRtcTransport cũ trước resume, giữ một participant/DB revision khi retry và deny sau revoke/regrant. Auth provider, messaging và board là fixture. Đây chưa là kiểm mic/camera, TURN, host succession hoặc gate hai mạng; các phần đó giữ nguyên task và tiêu chí riêng.

Kết quả và lệnh chạy lại nằm trong [báo cáo SCRUM-84](../test-evidence/2026-11-11-scrum-84-main-reconnect.md).
