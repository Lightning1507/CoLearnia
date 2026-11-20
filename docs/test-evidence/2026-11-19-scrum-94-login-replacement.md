# SCRUM-94 — Thu tài nguyên phiên cũ khi đăng nhập thay phiên

Ngày kiểm: 19/11/2026. Nhánh `fix/SCRUM-94-login-session-cleanup`, kiểm trên working tree từ baseline `226f2ebf103b339677cfa891fbcb8fe75ef567bd`. Kết quả dưới đây được ghi trước commit; commit chứa evidence này là mốc bàn giao. Refs [issue #130](https://github.com/Lightning1507/CoLearnia/issues/130).

## Hành vi và thứ tự xử lý

Login xác minh credentials trước, kiểm lại hash dưới User gate, rồi dùng shared session revocation để chuẩn bị thu đúng phiên từ cookie. Coordinator cài deny và chụp messaging generation; cleanup LIVE/messaging và đóng socket chạy ngoài User/Workspace gate, không giữ Mongo transaction. Chưa có adapter hoặc cleanup pending thì trả 503, không cấp phiên mới.

Khi cleanup xác nhận, ledger claim một lượt ghi cho phiên cũ. Login kiểm lại hash trong transaction, CAS phiên cũ theo `_id/userId/revokedAt:null` và tạo phiên mới trong cùng transaction. Chuyển tài khoản không lồng hai User gate: dùng gate User đích, CAS document phiên nguồn. Sau commit xác nhận, finalize cùng revocation operation rồi trả cookie/CSRF mới. Phiên độc lập khác của cùng user không bị thu.

Claim ở trạng thái chưa rõ không nhả chỉ vì hàm transaction đã trả về, gate đã nhả hoặc pool slot đã trả. Retry khi chưa rõ chỉ tiếp tục durable revoke đúng phiên cũ; không tạo transaction login thứ hai trong request đối soát. CAS trên document phiên cũ là điểm ghi chung với transaction gốc: durable revoke không cho một transaction dùng phiên cũ chưa thắng thứ tự ghi commit muộn qua nó. Một lần login chủ động tiếp theo có thể cấp phiên mới sau khi đã xác nhận thu phiên cũ.

Lỗi không clear cookie: phản hồi cũ đến muộn không được xóa cookie vừa cấp ở tab khác. Nếu insert thất bại, DB rollback cả hai thay đổi; socket/quyền runtime đã thu không được khôi phục. Cleanup retry/callback cũ giữ nguyên session/generation, không nhắm tài nguyên của phiên mới.

Không thêm schema, collection, index, biến môi trường, worker hoặc pool. Ledger không lưu bearer token mới; không hứa trả lại token của response bị mất hoặc exactly-once qua restart.

## Kiểm đã chạy

Runtime: Node 26.12.1 do pnpm quản lý. MongoDB 8.0.16 replica set `rs0` trong container test tạm, cổng loopback 37194; fixture tạo/dọn database test tên ngẫu nhiên. Không mount volume hoặc thay đổi database ứng dụng.

| Kiểm                                                                                                                                                                                                                                                                                       | Kết quả                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm exec vitest run apps/server/src/workspaces/access-revocation.test.ts`                                                                                                                                                                                                                | 55/55 đạt                                                            |
| `COLEARNIA_DB_TEST_PORT=37194 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/registration.integration.ts apps/server/test/main-join-registry.integration.ts tests/integration/login-replacement.integration.ts tests/integration/main-auth-media.integration.ts` | 84/84 đạt, bốn file                                                  |
| `pnpm check`                                                                                                                                                                                                                                                                               | Đạt: harness 55/55, format, lint, typecheck, unit 1002/1002 và build |
| `COLEARNIA_DB_TEST_PORT=37194 pnpm exec vitest run --config vitest.login-replacement.config.ts`                                                                                                                                                                                            | 3/3 đạt, lệnh diagnostic gốc                                         |
| `pnpm media:smoke`                                                                                                                                                                                                                                                                         | Đạt: native worker/Router với Opus/VP8                               |
| `git diff --check`                                                                                                                                                                                                                                                                         | Đạt                                                                  |

Lượt `pnpm check` đầu bị sandbox chặn mở loopback (`listen EPERM`) ở HTTP/R2 fixture. Đã chạy lại với quyền mở loopback; không đổi assertion, ignore hoặc test gate. Build có cảnh báo chunk web lớn hơn 500 kB; build vẫn hoàn tất.

### Ma trận regression

- Login thay phiên đang ở MAIN: HTTP cũ bị chặn, socket cũ đóng, native transport cũ đóng, ownership cũ được thu.
- Phiên mới cùng tài khoản xác thực HTTP/Socket.IO, join MAIN và tạo native transport; generation mới lớn hơn. Chờ callback cleanup cũ hoàn tất rồi xác nhận transport mới vẫn mở.
- Giữ socket/HTTP của phiên độc lập cùng tài khoản và tài khoản khác.
- Đổi tài khoản A sang B bằng cookie A: chỉ thu phiên A được trình bày, giữ phiên B độc lập và cho phiên B mới join MAIN.
- Native create đang pending: login trả 503, không insert phiên mới; deny chặn HTTP/ticket, đóng socket; transport hoàn thành muộn được đóng. Retry sau cleanup cấp đúng một phiên mới.
- Hai login cùng cookie đã qua chuẩn bị cleanup: chỉ một yêu cầu cấp phiên; yêu cầu còn lại 503, không có thêm row.
- Sai password/Origin/CSRF, validation và hai quota login tiếp tục qua bộ auth regression hiện có.
- Password đổi trong lúc cleanup: có thể lấy User gate, login kiểm lại hash rồi từ chối cấp phiên từ mật khẩu cũ.
- Adapter cleanup lỗi: deny giữ nguyên, không cấp phiên; adapter phục hồi thì tiếp tục cùng scope. Không truyền dependency revocation thì thay phiên thất bại an toàn.
- Insert phiên mới lỗi: DB vẫn chỉ có phiên cũ chưa thu ở DB, nhưng HTTP bị shared deny chặn; không gọi DB rollback là đã hồi quyền runtime.
- Mất ACK sau transaction thực đã commit: 503, không phát cookie; retry đối soát không tạo thêm row.
- Fault chưa rõ với commit label và lỗi network không label, trong khi majority read vẫn thấy phiên cũ chưa thu: chỉ một lần gọi transaction login, retry thực hiện durable revoke; lần đăng nhập chủ động tiếp theo phục hồi được.
- Logout lặp sau đối soát và regression registry AUTH_SESSION/MAIN/logout/reconnect vẫn đạt.

Diagnostic cũ đã chuyển vào `tests/integration/login-replacement.integration.ts`, thuộc suite integration mặc định. `vitest.login-replacement.config.ts` giữ lệnh tương thích qua file alias diagnostic; không còn diagnostic đỏ được tách khỏi gate.

## Bổ sung sau review trước commit

Hai probe review đã xác nhận thiếu kiểm expiry ở login và slot của replacement chắc chắn rollback không được thu hồi. Sau bản sửa, chạy lại đúng hai probe gốc ngoài repo đạt 2/2; các ca tương ứng và ca bảo vệ đã được đưa vào suite chính. Bản sửa phân biệt phiên còn hiệu lực với cookie hết hạn còn document; không dùng TTL làm nguồn xác thực. Nếu ledger có replacement đang chạy/chưa rõ, expired cookie vẫn không được mở transaction login mới.

Kết quả rollback chắc chắn được giữ bằng `replacementWrite: not_committed`. Record chỉ được thu hồi sau absolute auth expiry, không có persistence write attempt/active/running/unknown write, không còn pending adapter và mọi cleanup leg đã hoàn tất. Retry trước expiry tiếp tục claim được cùng operation; record unresolved tiếp tục chiếm slot và giữ deny.

Regression được đưa vào suite chính:

- HTTP login với expired cookie còn row, CSRF mới hợp lệ: thành công cả khi không truyền revocation dependency và khi provider chưa bind; không gọi prepare/không tạo revocation record.
- Cookie expired khi replacement đang chạy hoặc outcome unknown: không gọi thêm transaction login.
- Slot của replacement cleanup xong, rollback chắc chắn: chưa hết hạn vẫn giữ; sau expiry nhường được slot cho phiên khác.
- Từng nhánh running, unknown, LIVE pending, messaging pending và persistence unknown: expiry không làm mất record/deny hoặc nhường slot.

## Bằng chứng thật và giới hạn

Harness MAIN dùng auth/ACL, MongoDB, HTTP, Socket.IO, M4 registry và M3 native mediasoup transport thật. Messaging fence/revoke và board/messaging cleanup trong harness vẫn là test double được ghi rõ tại nguồn. Không coi kết quả này là bằng chứng fanout/file/board production đã đóng.

Ca commit mất ACK dùng wrapper fault sau commit thật; hai ca outcome chưa rõ dùng fault model có label/không label. Chưa chạy wire-level failpoint giữ transaction commit chậm, process kill/restart hoặc tải hỗn hợp. Không thay thế ma trận recovery TEXT của issue #126.

Không có browser mic/camera/share, DTLS/RTP hai máy, staging/hai mạng/forced TURN hoặc gate năm người trong evidence này. Native transport/worker đạt không chứng minh những phần đó.

## Bàn giao cho M4 / SCRUM-88

- `main.ts` đã truyền cùng `sessionRevocation` vào `createLogin`; tiếp tục dùng một `operationCoordinator` và một `accessRevocations` cho HTTP/Socket.IO/MAIN.
- SCRUM-88 mount registry và bind đúng adapter messaging/LIVE thật qua shared composition hiện có. SCRUM-94 không tự bind adapter thành công giả tại entry ứng dụng; thiếu provider thì login thay phiên giữ 503/deny.
- M4 tiếp tục đọc shared deny khi DB vẫn ghi `revokedAt:null` ở pha chuẩn bị, và giữ cleanup chính xác theo authSession/epoch/callGeneration. Không mở rộng thành thu toàn user.
- Chạy lại regression này trên composition ứng dụng và thêm ca logout/login replacement qua endpoint/socket thật khi SCRUM-88 đã mount đầy đủ. SCRUM-93/89 tiếp tục chịu trách nhiệm UI, hai browser và gate năm người.
- Reviewer M4 kiểm thứ tự prepare/claim/commit/finalize và ca unknown commit. Đây là đầu ra code + kiểm cục bộ; trạng thái Done còn cần review/merge và bên nhận xác nhận dùng được.
