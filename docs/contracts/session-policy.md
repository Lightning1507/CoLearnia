# Policy và projection phiên — SCRUM-65

M4 cung cấp các hàm policy thuần trong [session-policy.ts](../../apps/server/src/live/policy/session-policy.ts). M3 review chính, M1 đối chiếu việc cung cấp danh tính và snapshot quyền. Quy tắc nghiệp vụ theo [quyền media và nhóm](../product/groups-media-policy.md), [vòng đời nhóm](../product/group-modes.md) và [contract context](session-context.md).

## Đầu vào và kết quả

`SessionPolicyInput` gồm request nội bộ của SCRUM-23, snapshot quyền đọc kênh do M1 cấp cho đúng actor, thời gian server `nowMs` và một bản nhìn nhất quán của runtime phiên. `SessionPolicyState` mô tả phần dữ liệu policy cần đọc, gồm trạng thái phiên, phase, host, lượt ACTIVITY, người tham gia và nhóm. Map participant giữ đúng participation đang sở hữu cuộc gọi của mỗi user. `PolicyParticipant.scope` là vị trí đã được coordinator commit, còn roster chỉ là danh sách đủ điều kiện vào nhóm.

Caller lấy dữ liệu dưới cổng điều phối chung. M1 kiểm auth, quyền kênh và deny barrier hiện hành trước khi cấp input. `PolicyParticipant.access` là dấu quyền của lần join/đổi quyền đã commit, còn `currentAccess` là snapshot M1 vừa kiểm cho người đó. M1 cũng cấp `SessionPolicyInput.access` cho đúng caller. Các dấu membership/incarnation/revision phải khớp, kể cả với publisher và participant được đưa vào projection. Quyền cấp lại với incarnation mới không hợp thức hóa membership nhóm cũ. Khi một barrier ảnh hưởng participant, caller đặt `blocked` trong bản nhìn runtime.

Các hàm trả kết quả theo đúng dữ liệu ở thời điểm gọi. Service chạy lại policy sau `await` và ngay trước grant/read/fanout dưới cổng chung. Binding socket, token, nguồn media và việc thu tài nguyên thực tế tiếp tục do service/adapter tương ứng kiểm theo [kiến trúc](../architecture.md).

| Hàm                              | Kết quả và điều kiện                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveSessionPolicyContext`    | `LiveContextResult` của SCRUM-23. Kiểm auth còn hạn, quyền đọc đúng LIVE, session/epoch, đời ownership, access stamp và tư cách nhóm thực tế. Role và host lấy từ runtime                     |
| `canPublishMedia`                | Quyền publish loại MIC/CAMERA/SCREEN/SCREEN_AUDIO trong phạm vi hiện tại. MAIN và ACTIVITY cho member share, DISCUSSION chặn screen/screen audio                                              |
| `canReceiveMedia`                | Kiểm cả viewer và publisher. Cùng scope hợp lệ được nhận. DISCUSSION nhận thêm MAIN screen/audio và mic/camera của host ở MAIN. ACTIVITY nhận trong đúng nhóm, kể cả host đang hỗ trợ nhóm đó |
| `canReadScope`                   | Quyền đọc chat/board theo phạm vi hiện tại. Host ở MAIN không đọc nội dung nhóm chỉ nhờ vai trò host                                                                                          |
| `canDrawBoard`, `canFreezeBoard` | MAIN chỉ host hiện hành vẽ. Nhóm đã tham gia có quyền vẽ/freeze trong nhóm đó. Nguồn, phiên bản board và quyền undo/clear cụ thể do M5 kiểm thêm                                              |
| `canJoinGroup`                   | Member đang MAIN, đúng roster, phase và nhóm còn mở. ACTIVITY phải đúng lượt/phân công, còn hạn. Đây là kiểm điều kiện trước khi coordinator cấp membership                                   |
| `canHelpGroup`                   | Host hiện hành được vào hỗ trợ ACTIVITY còn mở/còn hạn. Đổi nhóm hỗ trợ cần thu scope cũ theo coordinator                                                                                     |
| `projectSessionFor`              | Metadata phiên và viewer, participant cùng scope hợp lệ, tên/mode/số member của các nhóm mở và nút join theo quyền. Projection chọn từng field, không gửi raw runtime map                     |

`canPublishMedia` quyết định quyền theo scope. M3 và task share lease SCRUM-73 còn kiểm nguồn, ownership, trạng thái track và slot share trống trước create/ready. Người đang reconnect không được cấp quyền mới qua các hàm này. Coordinator giữ và thu tài nguyên cũ theo reconnect grace và các ngoại lệ host/DISCUSSION trong [live session](../product/live-session.md#111-control-lease-và-resume).

## Các ranh giới được kiểm

- Người chỉ có tên trong roster có thể thấy metadata nhóm/nút join, nhưng chưa đọc chat/board hoặc nhận media riêng của nhóm. ACTIVITY chỉ cho vào lại đúng nhóm đã phân.
- Quyền quản lý kênh không thay quyền đọc nội dung PRIVATE. Auth hết hạn, context cũ, participant bị chặn hoặc phiên đang kết thúc đều bị từ chối.
- Host ở MAIN tiếp tục có quyền điều hành, nhưng không được đọc nhóm riêng. Khi host có scope ACTIVITY và `helpingGroupId` khớp thì được xem/nghe/vẽ trong đúng nhóm đó. DISCUSSION không có luồng host hỗ trợ.
- Deadline được kiểm bằng `nowMs` tại mỗi lần gọi. Tới đúng deadline, group đã đóng hoặc sai round đều mất quyền cấp/đọc mới, dù timer cleanup chưa chạy.
- Projection giữ metadata tối thiểu. Không có danh sách roster, auth session, access stamp, producer, frame, board hoặc nội dung chat riêng. Số member không tính host hỗ trợ như người được phân vào nhóm.

## Kiểm chứng và phần tích hợp

[Unit test](../../apps/server/src/live/policy/session-policy.test.ts) chạy trực tiếp các hàm policy, bao phủ ma trận MAIN/DISCUSSION/ACTIVITY, từng loại media, host hỗ trợ, roster chưa join, PRIVATE, access stamp mới, deadline và projection không sửa input. Các test dùng runtime fixture để kiểm thuật toán policy. Handler/registry, adapter media và sự kiện runtime được ghép ở các task phụ thuộc.

Thứ tự triển khai tiếp theo là coordinator SCRUM-72, snapshot/event theo người nhận SCRUM-66 và registry SCRUM-82 theo kế hoạch. SCRUM-66 bổ sung schema/giao thức truyền projection, `projectionSequence`, chia phần và budget theo SCRUM-23.
