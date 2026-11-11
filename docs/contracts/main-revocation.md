# Thu quyền MAIN và hủy pending — SCRUM-83

## Cổng M1 → M4

`registry.revoke(event)` là hàm nội bộ server, không phải endpoint hoặc socket event. Dùng `liveAccessRevocationSchema`, chính là `accessRevocationSchema` của M1, và trả `AccessCleanupResult`:

```ts
await registry.revoke({
  operationId,
  revision,
  kind: 'AUTH_SESSION',
  authSessionId,
});
// { operationId, permissionRevoked, pendingInvalidated, cleanupPending }
```

M1 commit auth/access và cài deny/version fence của mình trước khi gọi. Không gọi `revoke()` trong lúc còn giữ User/Workspace gate: hàm sẽ lấy các Workspace gate cần thiết. Sau khi nhả gate của mutation M1, gọi cổng này và nhận kết quả cleanup. M1 fence vẫn phải chặn quyền trong khoảng chờ; không dùng kết quả đọc ACL cũ hoặc callback luôn trả true trong production.

Registry chưa được mount vào composition app. Logout/mutation ACL phát revocation production và terminal fanout còn phải nối ở luồng tích hợp. Task này không thêm endpoint logout hoặc dựng provider quyền thay M1.

## Phạm vi thu quyền

| Kind                   | Đích                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH_SESSION           | Đúng authSessionId                                                                                                                                 |
| USER_AUTH_SESSIONS     | Tập authSession đã bị M1 thu trong đúng operationId/userId/revision, lấy qua `revokedAuthSessions(event)`; không gom theo thời điểm nhận thông báo |
| WORKSPACE_MEMBERSHIP   | Đúng user/Workspace/membershipId/incarnation; committed membershipRevision không mới hơn revision thu quyền                                        |
| PRIVATE_CHANNEL_ACCESS | Đúng user/Workspace/channel/membershipId/incarnation; committed channelRevision không mới hơn revision thu quyền                                   |
| CHANNEL_DELETED        | Đúng Workspace/channel và revision không mới hơn lệnh                                                                                              |
| WORKSPACE_DELETED      | Các ownership/ticket thuộc Workspace đó                                                                                                            |

M1 phải từ chối authSession đã revoke dù session đó chưa từng xuất hiện trong registry. Cohort USER_AUTH_SESSIONS không thay truy vấn và invalidation toàn bộ authSession của M1. ID được chuẩn hóa chữ thường sau validation. Không suy việc mất field nghĩa là thu tất cả.

Port `revokedAuthSessions(event)` trả đồng bộ danh sách ID mà M1 đã commit cho đúng operation/revision, kể cả khi thông báo đến sau một login mới. Thiếu port, lookup lỗi, dữ liệu không hợp lệ hoặc vượt cap `maxIntents` thì trả DEPENDENCY_UNAVAILABLE trước khi đăng ký record/hủy ticket. Không fallback sang sessions hiện có trong registry. M1 giữ kết quả operation để lookup có tính ổn định; retry đã có record dùng lại cohort đã chụp.

Reservation host chưa join giữ riêng authSession/access stamp lúc tạo phòng. Revocation đúng đời sẽ vô hiệu reservation và con trỏ host, kể cả ticket đã hết hạn; khi ownership host đã commit thì reservation được xóa. Hủy một ticket cũ không được block ownership có stamp mới hơn.

Join chỉ được dùng reservation khi authSessionId và stamp khớp chính xác dữ liệu lúc tạo phòng, auth chưa hết hạn và fence M1 xác nhận quyền liên tục. Registry kiểm trước khi chọn participant host và kiểm lại sau DB await trước commit runtime. Phiên đăng nhập mới hoặc stamp khác sẽ làm mất reservation, vào như MEMBER dù thông báo revoke chưa đến. Nếu fence thay đổi trong lúc ghi DB thì không công bố host; giữ deny/lỗi CONFLICT để đối chiếu metadata đã ghi, không suy rollback.

Lệnh thu quyền cũ không xóa membership incarnation mới hoặc quyền kênh có revision mới hơn. Khi kiểm tính liên tục của ownership, registry đối chiếu stamp đã commit: revoke rồi cấp lại không tự làm quyền cũ hợp lệ. Muốn vào lại phải tạo ticket và join mới sau khi cleanup được xác nhận.

## Thứ tự thực hiện

1. Validate event và đăng ký record/intent ổn định. Record deny cục bộ được đọc trong `currentFence`, kể cả sau await của Router/DB/authority. Nó đóng khoảng trống cho operation đang chờ nhưng không thay M1 fence lâu dài.
2. Dưới Workspace gate, hủy ticket khớp đích; block participant, hạ currentAccess, tăng policyRevision và xóa con trỏ host hiện hành nếu đúng người bị thu quyền. Peer khác không bị block. Host cũ không được tự nhận lại host chỉ vì metadata ban đầu vẫn trỏ tới user đó.
3. Tạo request cleanup PARTICIPANT gắn session/epoch/participantId/callGeneration/token ổn định cho media/messaging/board. Media revoke đồng bộ có thể đóng transport và invalidate pending ngay dưới gate. I/O async chạy sau khi nhả gate, dùng coordinator SCRUM-72.
4. Các Workspace chuẩn bị song song, cùng deadline monotonic 10 giây. Timeout chờ gate tối đa 2 giây và không vượt phần deadline còn lại. Không chờ toàn bộ native allocation kết thúc mới báo đã invalidate pending; `cleanupPending` vẫn true khi native I/O hoặc byte/ref còn được dọn.
5. Chỉ khi tất cả domain xác nhận thu quyền và hủy pending, vào lại Workspace gate để bỏ đúng ownership/participant cũ. Kiểm lại object ownership, epoch, participantId và generation; callback cũ không được xóa đời mới.

Thiếu adapter bị từ chối trước khi đăng ký record hoặc hủy ticket. Cleanup lỗi/sai echo/timeout giữ block và ownership; không mở quyền vì Promise đã settle. Kết quả false hoặc exception không chứa lỗi DB/native thô. Việc kết thúc phiên rỗng, kế vị host và metadata leave/end tiếp tục theo lifecycle; DB metadata không cấp lại quyền runtime.

## Retry và giới hạn

- Cùng operationId và payload trả cùng kết quả, không gọi cleanup lần hai. Cùng operationId nhưng đổi target/revision trả CONFLICT.
- Mặc định tối đa 128 record. Record đã xác nhận thu quyền giữ replay 60 giây; retry không kéo dài TTL. Record chưa xác nhận giữ deny, tiếp tục chiếm slot để không quên một cleanup đang lỗi; cần đối chiếu vận hành/lifecycle. Quá cap trả SERVER_BUSY, M1 vẫn giữ fence và xử lý bàn giao chưa hoàn tất.
- Sau TTL, M1 tiếp tục là nguồn deny/version có hiệu lực; cache cục bộ không phải danh sách thu quyền bền. Restart không phục hồi grant từ metadata.
- Kết quả cleanupPending được giữ theo snapshot của operation. Nếu native I/O kết thúc sau response, replay không đổi kết quả cũ thành một xác nhận mới. Consumer có thể cần đối chiếu trạng thái hiện hành.

## Ví dụ và kiểm chứng

- Allow: AUTH_SESSION thu đúng ticket/ownership, cleanup xác nhận rồi bỏ ownership. Các peer còn quyền vẫn lấy context được.
- Deny: callback join có DB ACK đến sau revocation không cấp ownership; Router allocation chưa cấp ticket trả muộn phải đóng; transport create muộn không được ACK thành công.
- Stale: old incarnation/revision không thu đời mới. Cleanup đã chụp generation cũ không xóa generation được lifecycle thay sau đó.
- Unit test dùng coordinator/policy/registry thật, authority và cleanup điều khiển được. Ca ABA mô phỏng commit lifecycle dưới gate, chưa là implementation reconnect.
- Integration dùng MongoDB/native mediasoup Router, registry và M3 transport service thật: đóng transport hiện có, invalidate allocation đang chờ và đóng native transport trả muộn, giữ Router/context của peer khác. M1 authority và M2/M5 cleanup vẫn là fixture; chưa kiểm browser audio, TURN hay hai mạng.

Nguồn: [MAIN registry](main-join-registry.md), [cleanup coordinator](session-transitions.md), [M1 Workspace/access](workspace-channels.md), [policy](session-policy.md).
