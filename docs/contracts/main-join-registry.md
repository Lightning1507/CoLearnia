# Registry và ticket vào MAIN — SCRUM-82

Source: `apps/server/src/live/session-manager/main-join-registry.ts`, `main-join-signaling.ts`; schema wire ở `packages/contracts/src/session-join.ts`. Dùng [repository SCRUM-79](../database/session-models.md), [policy](session-policy.md), [projection](session-projection.md), [coordination](../runbooks/operation-coordination.md) và [contract M3](media-join-source.md).

## Phạm vi và tích hợp

Có registry một process, cấp/consume ticket, adapter socket `session.join`, quyền MAIN tối thiểu và `withContext` cho M3. Registry tạo một Router/phiên qua factory, ghi metadata qua repository MongoDB chung. Production inject đúng coordinator dùng chung của M1/M2, không tạo lock/connection riêng.

Chưa mount REST hoặc socket vào app hiện hành: M1 cung cấp adapter auth/access thực tế trước composition. Factory không có chế độ bỏ qua auth. Test M1 dùng fixture kiểm context khóa; MongoDB/Router trong integration test là thật. Đây chưa là luồng đăng nhập–gọi trên trình duyệt hoặc kiểm TURN.

Takeover, revoke, reconnect/grace, host succession và end phiên đang có người thuộc SCRUM-83/84/86/87/90/91. Schema nhận cấu trúc xác nhận takeover của ví dụ M3 nhưng registry chưa chuyển ownership: khi user có call vẫn trả CALL_ALREADY_ACTIVE, giữ call cũ và ticket mới chưa consume. Không tự tăng generation/chiếm call khi chưa cleanup đúng đời.

## API và socket

| Thao tác                                       | Input                                                                                     | Kết quả                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| POST `/api/v1/channels/:cid/live-session/join` | Body `{requestId}`; auth/CSRF/Origin do M1 kiểm; Workspace của channel do server xác định | HTTP 200, `{data:{sessionId,epoch,ticket,expiresAt},requestId:traceId}`                  |
| Socket `session.join`                          | `{requestId,ticket,takeover?}` trên socket đã xác thực                                    | Ack `completed`, result `{participantId,callGeneration,snapshot:{snapshotId,partCount}}` |
| Event riêng `session.snapshot`                 | Server phát sau ack                                                                       | Các part SCRUM-66 cùng requestId/snapshotId/đời quyền                                    |

REST handler khi được mount gọi `registry.issue(auth,{workspaceId,channelId},body)` rồi bọc response bằng trace ID của HTTP; requestId trong body là intent, không thay trace ID. Dùng `Cache-Control: no-store`. HTTP không trả native Router hoặc transport. Socket dùng `attachMainJoinSocket(registry,socket,readAuth)`; readAuth lấy context M1 từ server, không lấy identity trong payload.

Input strict, không nhận actorId/sessionId/callGeneration giả khi join lần đầu. Takeover nếu có bắt buộc `{confirmed:true,expectedCallGeneration:số nguyên dương}`. Chỉ server cấp generation. Ticket không đi vào log, URL, projection hoặc metadata DB.

Ví dụ allow: A xin ticket với intent R; retry REST R còn hạn trả cùng ticket. Socket A consume bằng intent J; retry J trên đúng socket còn ownership trả snapshot mới của cùng participant/generation, không ghi DB lần hai. Không replay body projection cũ.

Ví dụ deny: ticket của authSession A dùng từ B bị FORBIDDEN; kênh TEXT hoặc canReadContent=false bị từ chối trước tạo resource. Stamp membership/incarnation/channel revision đã đổi thì CONFLICT, không lấy quyền trong ticket để phục hồi quyền.

Ví dụ stale: ticket hết hạn 60 giây bị VALIDATION_ERROR. Ticket đã consume dùng bằng requestId hoặc socket khác bị CONFLICT. Cùng intent REST nhưng đổi kênh/stamp trong cửa sổ lưu cũng bị CONFLICT.

## Thứ tự xử lý

1. Giữ User rồi Workspace gate của coordinator chung; kiểm lại auth/access. Workspace gate serialize lifecycle các kênh trong Workspace, chưa có lock riêng cạnh tranh giữa các miền.
2. Khi chưa có phiên runtime, chuẩn bị ID/epoch/thời gian ổn định, tạo Router với deadline, kiểm quyền sau await rồi transaction tạo session và metadata host. Người khởi tạo thành công giữ host pointer; người vào sau không giành host. Metadata participant ở đây là reservation, chưa là ownership/quyền media.
3. Sinh ticket ngẫu nhiên 32 byte dạng base64url, hạn 60 giây, gắn intent/user/authSession/channel/session/epoch/access stamp. RAM giữ token để replay issuance trong hạn, tra consume bằng digest. Không persist token hoặc cache snapshot/private body.
4. Consume dưới User + Workspace gate; kiểm auth hiện hành, stamp, ticket, Router/phiên và socket connected. Kiểm ownership toàn tài khoản trước consume: một user không có hai call.
5. Ghi participant MAIN bằng repository CAS. Sau await kiểm quyền, socket, deadline, ticket và Router rồi commit ownership vào RAM. Generation tăng riêng trong process; DB revision và policyRevision là hai counter riêng.
6. Dựng snapshot qua policy/projection. Socket adapter vào lại `withContext` trước ack/fanout; policy/audience/scope đổi thì không phát projection đã chuẩn bị. Enqueue đồng bộ vào đúng socket, không đợi client ack trong gate.

`withContext(socketId,{sessionId,epoch,callGeneration},use)` khớp authority transport/paused-ready M3. Nó kiểm binding, auth/access hiện hành, Router/epoch/generation và policy. Callback use phải đồng bộ, không mutate state/lấy gate ngược. Router chỉ trả nội bộ khi context hợp lệ. Binding dùng `isConnected()` hiện hành; socket đã rớt không được cấp quyền dù lifecycle reconnect chưa nối vào registry.

Trước policy media hoặc snapshot, registry đọc lại authority của mọi participant có liên quan trong room, không chỉ người gọi. Peer mất auth/quyền/stamp bị đặt deny và tăng policyRevision; quyền đã bị thu không tự phục hồi từ snapshot join cũ. Publisher bị deny không được dùng cho canReceiveMedia và không còn trong projection của người khác, kể cả socket publisher vẫn connected. Provider lỗi bất thường làm thao tác thất bại an toàn, không dùng quyền peer đã cache.

Provider M1 cần hai hàm: `resolveAuthority(auth,target,held)` đọc auth/access hiện hành, và `isAuthorityCurrent(authority,held)` kiểm đồng bộ deny/version fence ngay trước grant/projection. Lần đọc peer chạy dưới Workspace gate của người gọi; provider chỉ kiểm Workspace gate cho phần đọc này, không lấy User gate của peer từ bên trong để tránh đảo thứ tự khóa. Sau tất cả await, registry kiểm lại fence của cả room và auth người gọi. Fence phải đọc trạng thái/barrier thật của M1, không dùng callback luôn trả true trong composition production; callback true chỉ có trong fixture không có revocation. Port này bắt buộc, không có fallback bỏ qua.

Nhánh replay issuance kiểm lại expiresAt sau await kiểm quyền. Nếu ticket vừa hết hạn thì xóa intent/token và trả VALIDATION_ERROR, không trả response thành công chứa token cũ. Client đối chiếu trạng thái rồi dùng intent mới theo luồng hết hạn. Việc refresh authority peer nằm trong deadline/admission hiện có; chưa có bằng chứng capacity từ lượt đọc này.

`isAuthorityCurrent(authority,held,committedAccess?)` còn xác nhận tính liên tục so với stamp đã commit khi có tham số thứ ba. Cùng membership/incarnation, revision không lùi và M1 xác nhận không có revoke/regrant gap thì registry cập nhật cả access/currentAccess sau revalidation, giữ nguyên participantId/callGeneration/scope. Revision tăng đơn thuần không đặt blocked. Provider phải kiểm lịch sử barrier/version của M1, không suy tính liên tục chỉ từ canReadContent=true ở lần đọc cuối. Đã blocked do thu quyền thật thì không tự mở lại khi callback sau trả true.

Lỗi provider tạm thời trong lúc dựng snapshot làm lần join/replay trả DEPENDENCY_UNAVAILABLE, nhưng không tự biến ownership đã commit thành bị thu quyền. Retry cùng ticket/requestId/socket còn hạn sẽ đọc lại authority/continuity và dựng snapshot mới; không chạy lại repository.join hoặc cấp generation mới. Ticket đã consume không bị đối chiếu với stamp cấp ticket cũ để chặn một revision tăng hợp lệ; quyền của ownership hiện hành được kiểm lại thay thế. Nếu M1 từ chối quyền hoặc continuity thì vẫn giữ deny, không dùng nhánh phục hồi lỗi tạm để bỏ barrier.

## Lỗi và cleanup

Create/join metadata thất bại làm phiên ở trạng thái chưa rõ, chặn ticket/grant mới. Create lỗi đóng Router vừa tạo. Không suy từ revision rằng intent đã commit; E11000 cũng không cho phép adopt phiên có trong DB. SCRUM-87 đối chiếu kết quả, SCRUM-80 bootstrap; không retry insert hoặc phục hồi runtime từ metadata mù.

Auth hết hiệu lực/socket rớt sau commit DB thì không công bố ownership. Intent đã qua bước ghi được đánh dấu đã xử lý để retry không ghi lại. Metadata không chứng minh participant đang có quyền. Khi không có participant runtime/ticket hợp lệ, orphan cleanup kết thúc metadata reservation.

Composition gọi `sweepExpired()` định kỳ, đề xuất cùng nhịp 60 giây của lifecycle, bắt lỗi qua logger an toàn. Dưới Workspace gate, phiên chưa có ownership và hết mọi ticket chuyển ENDING→ENDED, đóng Router và reservation participant. Issue mới cũng dọn orphan hết hạn của chính kênh. Không áp dụng cho phiên đã có người; ticket đã consume hết hạn không khiến người đang học bị rời. Đây là dọn reservation, không thêm empty grace cho phiên hoạt động.

Router create timeout sau 2 giây nhưng slot pending giữ tới khi native I/O thật kết thúc; Router đến muộn bị close. Shutdown `registry.close()` đóng Router, xóa token/ownership RAM, close cả Router đang tạo đến muộn. Close không thay end/revoke và không tự sửa metadata đã commit. Restart phải bootstrap metadata cũ trước readiness; không adopt phiên ACTIVE trên DB.

## Admission và bộ nhớ

| Phần                             | Giới hạn khởi đầu                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Operation join/context được nhận | 4/user, 64/channel, 512/process; chờ coordinator tối đa 2 giây                        |
| Foreground                       | Deadline 10 giây từ lúc nhận; kiểm sau await, timeout không là bằng chứng rollback DB |
| Router native đang tạo           | 32/process; cùng channel một pending, giữ slot sau timeout                            |
| Room/reservation                 | 128/process, giữ chỗ xuyên await                                                      |
| Ownership                        | 1/user, 1.024/process, giữ chỗ xuyên DB await                                         |
| Ticket intent                    | 64/user, 1.024/room, 4.096/process; hạn tối đa 60 giây                                |

Đây là admission để đo PoC, không là cam kết số người/lớp. Coordinator chung phải cho phép wait budget ≥2 giây; registry không tăng giới hạn coordinator. Overflow dùng SERVER_BUSY. Token dài 43 ký tự, identity/stamp/tên có giới hạn; không cache snapshot/private body. Expiry quét theo thao tác hoặc periodic sweep. Sau eviction không hứa trả ack cũ: ownership hiện hành và unique DB/CAS vẫn ngăn nhân call/metadata; client đối chiếu state rồi tạo intent mới, không retry mù ticket hết hạn.

`stats()` chỉ trả số lượng room/ownership/intent/pending/queue, không ID/token. Sweep chỉ dùng Workspace gate, không lấy ngược User gate.

Khi lỗi provider khiến ACK join chưa gửi được và ticket đã hết hạn sau sweep, đúng socket/authSession có thể xin ticket mới cho cùng room/epoch rồi gọi join. Registry kiểm auth/access/stamp/continuity hiện hành và dựng lại snapshot của ownership cũ, không ghi participant hoặc tăng generation lần nữa. Ticket mới được gắn với intent mới; retry cùng intent tiếp tục hội tụ. Socket khác, authSession khác, room khác hoặc takeover không đi đường này và vẫn CALL_ALREADY_ACTIVE. Ticket cũ hết hạn vẫn VALIDATION_ERROR; expiry không tự kết thúc người đã vào phòng hoặc phục hồi ownership đã bị revoke.

## Kiểm chứng

Unit kiểm race, replay đúng socket, expiry/auth/stamp, revoke/disconnect qua await, queue/cap đồng thời, Router muộn/shutdown và deny khi DB chưa rõ. Adapter socket kiểm ack, identity giả, lỗi an toàn và chặn snapshot trước fanout khi mất quyền. Integration dùng replica set riêng + mediasoup native: một phiên/host khi join đồng thời, hai participant MAIN, DB unique ngăn registry khác adopt phiên, lost-ack mô phỏng sau commit thật và dọn orphan hết hạn.

Chạy `pnpm exec vitest run apps/server/src/live/session-manager/main-join-registry.test.ts apps/server/src/live/session-manager/main-join-signaling.test.ts packages/contracts/src/session-join.test.ts`; integration: `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/main-join-registry.integration.ts`. Native Router/capabilities không chứng minh mic/camera hoặc TURN. Không provision/migrate DB ứng dụng từ registry/test; suite chỉ dọn database ngẫu nhiên tự tạo.
