# Policy và projection phiên — SCRUM-65

M4 cung cấp các hàm policy thuần trong [session-policy.ts](../../apps/server/src/live/policy/session-policy.ts). M3 review chính, M1 đối chiếu việc cung cấp danh tính và snapshot quyền. Quy tắc nghiệp vụ theo [quyền media và nhóm](../product/groups-media-policy.md), [vòng đời nhóm](../product/group-modes.md) và [contract context](session-context.md).

## Đầu vào và kết quả

`SessionPolicyInput` gồm request nội bộ của SCRUM-23, snapshot quyền đọc kênh do M1 cấp cho đúng actor, thời gian server `nowMs` và một bản nhìn nhất quán của runtime phiên. `SessionPolicyState` mô tả phần dữ liệu policy cần đọc, gồm trạng thái phiên, phase, host, lượt ACTIVITY, người tham gia và nhóm. Map participant giữ đúng participation đang sở hữu cuộc gọi của mỗi user. `PolicyParticipant.scope` là vị trí đã được coordinator commit, còn roster chỉ là danh sách đủ điều kiện vào nhóm.

Caller lấy dữ liệu dưới cổng điều phối chung. M1 kiểm auth, quyền kênh và deny barrier hiện hành trước khi cấp input. `PolicyParticipant.access` là dấu quyền của lần join/đổi quyền đã commit, còn `currentAccess` là snapshot M1 vừa kiểm cho người đó. M1 cũng cấp `SessionPolicyInput.access` cho đúng caller. Các dấu membership/incarnation/revision phải khớp, kể cả với publisher và participant được đưa vào projection. Quyền cấp lại với incarnation mới không hợp thức hóa membership nhóm cũ. Khi một barrier ảnh hưởng participant, caller đặt `blocked` trong bản nhìn runtime.

Các hàm trả kết quả theo đúng dữ liệu ở thời điểm gọi. Service chạy lại policy sau `await` và ngay trước grant/read/fanout dưới cổng chung. Binding socket, token, nguồn media và việc thu tài nguyên thực tế tiếp tục do service/adapter tương ứng kiểm theo [kiến trúc](../architecture.md).

### Cập nhật dấu quyền khi participant vẫn còn quyền

Revision khác nhau yêu cầu kiểm lại quyền, không tự buộc người tham gia join lại. Ví dụ đổi tên kênh làm `channelRevision` tăng, hoặc thay role làm `membershipRevision` tăng nhưng quyền đọc LIVE của participant vẫn liên tục còn hiệu lực:

1. Coordinator lấy snapshot mới từ M1, đối chiếu identity/auth còn hạn, đúng session/epoch/callGeneration, Workspace/kênh và cùng `membershipId`/`membershipIncarnation`. Chỉ revision tiến lên; không dùng snapshot cũ để ghi lùi dấu quyền.
2. Dưới gate theo thứ tự [SCRUM-23](session-context.md#thứ-tự-khóa-và-giới-hạn), coordinator xác minh snapshot còn hiện hành, `canReadContent: true`, loại LIVE và không có thao tác thu quyền/barrier xen giữa. Nếu cần chờ I/O, nhả queue rồi vào lại để kiểm; không giữ snapshot trước `await` làm bằng chứng cuối.
3. Sau khi xác minh quyền vẫn liên tục hợp lệ, coordinator commit `PolicyParticipant.access` từ snapshot mới, đồng thời dựng `currentAccess` và input `access` tương ứng trước lần gọi policy tiếp theo. Giữ `participantId`, `callGeneration`, scope và quyền host hiện tại; chỉ cập nhật dấu quyền không đổi audience hay `policyRevision` nếu quyền/phạm vi không đổi. Áp dụng cho từng participant bị ảnh hưởng, kể cả publisher; không chép snapshot của người gọi sang người khác.
4. Policy kiểm dấu quyền đã commit với snapshot mới rồi mới cho context/projection/media tiếp tục. Trong khoảng chưa commit, dấu lệch vẫn bị chặn. Tác vụ đã giữ dấu cũ phải lấy lại context và kiểm trước grant/read/fanout.

Ví dụ dấu đã lưu ở revision 0, M1 trả revision 1 và quyền đọc vẫn còn: chỉ đổi `currentAccess`/input `access` thì context vẫn `CONFLICT`. Sau commit ở bước 3, cùng ownership có thể tiếp tục. Policy thuần không tự ghi runtime hoặc bỏ so sánh revision để cho qua trường hợp này.

Không dùng quy trình này khi đã bị thu quyền rồi được cấp lại, ngay cả khi cùng membership và snapshot mới lại có `canReadContent: true`. PRIVATE có thể được gỡ/thêm lại mà incarnation không đổi; coordinator phải đối chiếu thao tác thu quyền/barrier theo SCRUM-23, không chỉ nhìn snapshot cuối. Giữ nhánh cleanup/deny, không xóa `blocked` để nối lại participation cũ. Workspace rejoin với `membershipId` hoặc incarnation mới cũng phải qua luồng join mới; không phục hồi nhóm/host/tài nguyên cũ bằng cách thay dấu.

### Các hàm policy

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

[Unit test](../../apps/server/src/live/policy/session-policy.test.ts) chạy trực tiếp các hàm policy, bao phủ ma trận MAIN/DISCUSSION/ACTIVITY, từng loại media, host hỗ trợ, roster chưa join, PRIVATE, access stamp mới, deadline và projection không sửa input. Fixture cập nhật dấu quyền mô phỏng commit sau revalidation: revision mới vẫn giữ ownership/phạm vi, context cũ bị chặn, membership/incarnation mới và barrier thu quyền tiếp tục bị từ chối. Đây là kiểm đầu vào/kết quả policy; coordinator và revalidation M1 thực tế được triển khai, kiểm tích hợp ở SCRUM-72/registry. Handler, adapter media và sự kiện runtime được ghép ở các task phụ thuộc.

Schema/giao thức truyền projection, `projectionSequence`, chia phần và budget theo SCRUM-23 nằm ở [snapshot/event SCRUM-66](session-projection.md). Coordinator SCRUM-72 và registry SCRUM-82 sẽ nối policy với quyền và runtime thực tế theo kế hoạch.
