# Contract xác thực, context và cleanup phiên — SCRUM-23

M4 cung cấp context phiên và điều phối thu quyền. M3 là reviewer chính. M1 review phần danh tính, quyền kênh và thứ tự khóa. M2 và M5 review phạm vi cleanup của chat, tệp và board. Tên và giới hạn dưới đây là đề xuất để các bên review trước khi dùng trong handler. [Proposal M4, Appendix B](../proposals/m4-session-groups.md#b-đề-xuất-contract-và-profile-kỹ-thuật-khởi-đầu)

Schema và interface nằm trong [session-context.ts](../../packages/contracts/src/session-context.ts). Các ca mẫu chạy được nằm trong [session-context.test.ts](../../packages/contracts/src/session-context.test.ts). Đây là giao tiếp nội bộ giữa các module backend. Handler lấy danh tính từ kết nối hoặc phiên đã xác thực và chỉ trả DTO công khai đã lọc cho client.

## Danh tính và quyền trong phiên

1. M1 xác thực và trả `AuthenticatedContext` gồm `userId`, `authSessionId`, `expiresAt`. Quyền đọc nội dung kênh được kiểm riêng qua `ChannelAccessStamp`, gồm Workspace, kênh, membership, incarnation, revision và `canReadContent`. [Contract auth](auth-profile.md)
2. M4 chỉ tạo `LiveContext` khi auth còn hiệu lực, quyền đọc kênh LIVE còn hiệu lực và server xác minh đúng participant đang sở hữu kết nối đó. Đầu vào `ResolveLiveContext` mang `auth`, `sessionId`, `epoch` và `callGeneration` đã xác định tại server. Bên gọi kiểm binding đến đúng socket hoặc cơ chế chứng minh ownership dành cho đường REST trước khi gọi resolver. Một cookie hợp lệ có thể được dùng ở nhiều tab, nên cần kiểm cả binding kết nối.
3. Context thành công mang `participantId`, role hiện hành, scope, `audienceEpoch` và `policyRevision`. DISCUSSION có `groupId`; ACTIVITY có thêm `roundId` và `deadline` UTC. `scope` nội bộ mang metadata của nhóm. Khi cần gửi `SessionScopeRef`, chỉ lấy `type` và `groupId` nếu là GROUP theo [SCRUM-22](session-commands.md). Role `HOST` và vị trí hiện tại chưa đủ để cấp quyền thay cho policy, ví dụ khi host được vào ACTIVITY để hỗ trợ.
4. Kiểm lại auth, access stamp, ownership, scope và deadline trước commit/grant và sau thao tác bất đồng bộ có thể thay đổi quyền. Cùng `userId` với incarnation mới không khôi phục quyền của lượt tham gia cũ. `AUTH_REQUIRED` dùng khi mất danh tính hợp lệ, `FORBIDDEN` khi thiếu quyền, `CONFLICT` khi context đã cũ nhưng caller còn quyền biết tài nguyên, `DEPENDENCY_UNAVAILABLE` khi chưa thể xác minh đầu vào. Nhánh từ chối chỉ có mã lỗi.

## Thu quyền và cleanup

M1 xác định loại thu quyền theo `accessRevocationSchema` tại [workspace.ts](../../packages/contracts/src/workspace.ts). M4 import trực tiếp schema này và alias thành `liveAccessRevocationSchema`; `LiveAccessRevocation` tiếp tục infer từ alias. Hai miền dùng cùng schema, không đổi tên hoặc bỏ field khi chuyển payload. Phần schema thu quyền dùng chung được cung cấp cùng contract SCRUM-23; các input/DTO Workspace và kênh còn lại thuộc SCRUM-13.

`operationId` là UUID ổn định cho một lần thu quyền. `revision` là mốc của nguồn quyền mà coordinator xác minh, không phải `policyRevision` của phiên. Adapter đối soát phạm vi và mốc đó trước khi áp dụng một lần gọi lại.

| Loại thu quyền                          | Phạm vi phải khớp                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SESSION`                          | Đúng `authSessionId`                                                                                                                                     |
| `USER_AUTH_SESSIONS`                    | Các phiên xác thực của user bị thao tác thu quyền này tác động. Lần chạy lại giữ cùng tập đã xác định từ nguồn quyền M1, kể cả khi user đã đăng nhập lại |
| `WORKSPACE_MEMBERSHIP`                  | Đúng Workspace, user, membership và incarnation cũ                                                                                                       |
| `PRIVATE_CHANNEL_ACCESS`                | Đúng Workspace, kênh, user, `membershipId`, `membershipIncarnation` cũ và channel revision của lần thu                                                   |
| `CHANNEL_DELETED` / `WORKSPACE_DELETED` | Đúng kênh trong Workspace hoặc toàn Workspace tương ứng                                                                                                  |

Coordinator cố định đích membership và incarnation của lần thu, không lấy membership mới nhất của cùng user để thay đích cũ khi retry. Incarnation phân biệt các lần rejoin Workspace; gỡ rồi cấp lại PRIVATE trong cùng membership không tăng incarnation. Vì vậy, vẫn phải đối chiếu operation, channel revision và đời tài nguyên đã gắn với lần thu; incarnation riêng lẻ không bảo vệ kết nối mới sau khi được cấp lại quyền.

M4 chuyển phạm vi thu quyền thành request nội bộ cho adapter liên quan. Request mang `operationId`, `sessionId`, `epoch`, `transitionToken`, `target` và `reason`. Đích `PARTICIPANT` thu đúng đời sở hữu `callGeneration`. Đích `PARTICIPANT_SCOPE` còn chỉ rõ scope và `audienceEpoch` cũ để cleanup sau chuyển phạm vi không đóng tài nguyên của audience mới. Đích `SCOPE` dùng khi đóng một scope, gắn với đời phiên và token đóng scope do coordinator kiểm. Adapter dùng cùng định danh khi trả kết quả. Các schema cleanup runtime này vẫn riêng với schema thu quyền M1; callback chỉ được tác động đúng tài nguyên cũ, không tìm lại theo userId để đóng tài nguyên mới.

| Kết quả                                               | Điều kiện và việc tiếp theo                                                                                                                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionRevoked: true`, `pendingInvalidated: true` | Đã chặn cấp mới, đóng luồng/fanout trái quyền và vô hiệu công việc đang chờ. `cleanupPending` có thể còn phần dọn byte, ref hoặc finalize. Coordinator chỉ tiến tiếp khi đối chiếu đúng operation, target, đời phiên và token hiện hành |
| `permissionRevoked: false`, `cleanupPending: true`    | Chưa xác nhận thu quyền. Giữ chặn truy cập, chưa cấp scope mới. `errorCode` và `retryable` cho caller biết có thể đối soát/thử lại hay cần dừng và báo lỗi                                                                              |
| Timeout `DEPENDENCY_UNAVAILABLE`                      | Coordinator tạo kết quả chưa xác nhận. Slot I/O vẫn tính nếu tác vụ thật chưa dừng hoặc chưa được cô lập. Trước khi retry, đối chiếu tác vụ đang chạy. Callback đến muộn kiểm token/đời, tự đóng tài nguyên cũ và không mở lại quyền    |

## Thứ tự khóa và giới hạn

Thứ tự lấy khóa là **user ownership → Workspace gate → vòng đời kênh → queue phiên**. Chỉ lấy những khóa thao tác cần. Đặt deny barrier và ghi operation/token trong đoạn điều phối ngắn, sau đó nhả queue trước khi chờ I/O. Callback muốn cập nhật state phải vào lại theo thứ tự trên và kiểm token, đời, quyền và deadline. Adapter được gọi trong đoạn đang giữ gate không lấy lại gate bên ngoài. Barrier tiếp tục có hiệu lực trong lúc nhả khóa để đợi hoặc đối soát. [Kiến trúc](../architecture.md) · [Quy tắc đồng thời và toàn vẹn](../database/integrity-and-migrations.md#41-cơ-chế-chung)

Các giá trị thử được export qua `sessionControlBudget`, dùng cho control M4 và snapshot trạng thái phiên.

| Giới hạn thử                  | Giá trị và hành vi khi tới giới hạn                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control và từng phần snapshot | Tối đa 16 KiB JSON UTF-8, tính cả envelope sau serialize. Socket server hiện có mức nhận 32 KiB                                                   |
| Lắp snapshot                  | Tối đa 64 phần, 1 MiB và 5 giây. Các phần cùng snapshot ID và mốc phiên/quyền. Thiếu phần hoặc quá ngưỡng thì bỏ bộ đang lắp và resync có backoff |
| Đệm event M4 khi resync       | Tối đa 64 event, 256 KiB và 5 giây. Tới bất kỳ ngưỡng nào thì bỏ buffer và đồng bộ lại                                                            |
| Cleanup foreground            | 2 giây mỗi lần và tối đa 2 lần thử lại cùng operation, backoff 250/750 ms có jitter. Toàn bộ transition tối đa 10 giây từ lúc nhận                |
| Đối soát hậu cảnh             | Mốc thử 1/3/10 giây. Mỗi adapter/operation chỉ một lần đang chạy. Hết budget thì báo lỗi vận hành, giữ chặn với phần chưa xác nhận                |

Ba ca chính để review là context LIVE hợp lệ và thu quyền đã được xác nhận, từ chối vì thiếu quyền, và timeout khi chưa xác nhận cleanup. Unit test kiểm shape của request/result và các tổ hợp cờ. Khi SCRUM-65 và SCRUM-72 có implementation, cần kiểm lại việc thu quyền thực tế, callback muộn và thứ tự khóa. Schema snapshot/event cụ thể nằm ở SCRUM-66.
