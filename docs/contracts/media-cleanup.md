# Contract thu quyền và cleanup media — SCRUM-56

**M3-T1.2 · Bản gửi M4 review.** M4 quyết định quyền, đặt chặn và điều phối chuyển trạng thái. M3 xác nhận kết quả thu quyền trên tài nguyên media mà M3 quản lý. Adapter dùng trực tiếp `CleanupSessionResources`, `sessionCleanupRequestSchema` và `sessionCleanupResultSchema` của SCRUM-23. SCRUM-44 cung cấp ví dụ về ownership và context sau join. [Context SCRUM-23](session-context.md#thu-quyền-và-cleanup) · [Ví dụ SCRUM-44](media-join-source.md) · [Proposal M4 §B.2](../proposals/m4-session-groups.md#b2-cleanup-result-deadline-và-lỗi--q4)

## Phạm vi thu quyền

Request nội bộ mang `operationId`, `sessionId`, `epoch`, `transitionToken`, `target` và `reason`. Kết quả trả lại cùng định danh và `outcome`. Dùng `operationId` ổn định khi thử lại cùng lần thu quyền. Trước khi áp kết quả, M4 đối chiếu toàn bộ định danh và token với transition còn hiệu lực.

| Target              | Đời tài nguyên M3 được phép tác động                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PARTICIPANT`       | Đúng participant và `callGeneration` của lần thu quyền                                                          |
| `PARTICIPANT_SCOPE` | Đúng participant, `callGeneration`, `scope` và `audienceEpoch` cũ khi chuyển phạm vi                            |
| `SCOPE`             | Đúng scope của `sessionId`/`epoch` và token đóng scope. Request cấp scope không có `callGeneration` của cá nhân |

M3 chặn grant mới cho đúng target, đóng Producer/Consumer, transport và đường phát media thuộc target bị thu quyền. Công việc đang chờ như tạo transport, tạo/ready Consumer, thay track hoặc publish sau picker phải bị vô hiệu trước khi xác nhận thu quyền. Callback đối chiếu token, ownership, scope và đời tài nguyên đã ghi khi bắt đầu. Nếu đã tạo tài nguyên cho thao tác cũ, callback chỉ tự dọn đúng tài nguyên đó, kể cả khi cùng participant đã vào lại scope mới. [Thiết kế M3 về cleanup và giới hạn](../proposals/m3-media.md#627-contract-media-và-budget-tích-hợp-theo-28)

## Xác nhận cleanup

| Kết quả                                                                            | Ý nghĩa với coordinator                                                                                                     |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `permissionRevoked: true`, `pendingInvalidated: true`, `cleanupPending: false`     | Đã chặn cấp mới, đóng luồng trái quyền và vô hiệu công việc cũ. Cleanup đã xong                                             |
| Hai cờ đầu là `true`, `cleanupPending: true`                                       | Đã thu quyền hiệu lực. Có thể còn dọn byte, ref hoặc finalize phía sau                                                      |
| `permissionRevoked: false`, `cleanupPending: true`, kèm `errorCode` và `retryable` | Chưa xác minh thu quyền. M4 giữ deny và chưa cấp scope mới. `pendingInvalidated` phản ánh việc M3 đã xác minh được hay chưa |

Ví dụ đang chuyển phạm vi từ `audienceEpoch = 4`. M4 hết thời gian chờ khi M3 đang tạo Consumer. Kết quả timeout có `permissionRevoked: false`, `pendingInvalidated: false`, `cleanupPending: true`, `errorCode: 'DEPENDENCY_UNAVAILABLE'` và `retryable: true`. Trước khi thử lại, M4 đối soát lượt đang chạy. Nếu callback trả Consumer sau khi token đã hết hiệu lực, M3 đóng Consumer vừa tạo cho lượt cũ. Một kết quả đến muộn mang token hoặc audience cũ không được dùng để tiến transition hiện hành.

## Giới hạn thử cho PoC

- Dùng `sessionControlBudget` của SCRUM-23. Mỗi lần chờ cleanup tối đa 2 giây. Tối đa hai lần thử lại cùng operation với backoff 250/750 ms có jitter. Toàn bộ transition foreground tối đa 10 giây tính từ lúc nhận.
- Đặt deny và ghi token trong đoạn điều phối ngắn. Nhả queue trước khi chờ I/O. Giữ slot đến khi tác vụ thật đã dừng hoặc được cô lập. Đối soát trước khi retry để tránh chạy chồng. Khi áp completion, vào lại đúng thứ tự khóa của SCRUM-23 và kiểm lại quyền, deadline và token.
- Profile M3 thử tối đa 4/64/512 mục chờ và 2/8/32 tác vụ control I/O theo user/session/process. Thời gian chờ queue tối đa 2 giây. End, revoke và deadline dùng đường ưu tiên/coalescing của M4 khi queue đầy. [Admission control M3](../proposals/m3-media.md#627-contract-media-và-budget-tích-hợp-theo-28)
- Đối soát hậu cảnh tại mốc 1/3/10 giây, tối đa một tác vụ đang chạy trên mỗi adapter/operation. Hết budget thì giữ deny với phần chưa xác minh và báo lỗi vận hành. Encode, finalize và upload theo deadline riêng.

## Kiểm và bàn giao

[Fixture SCRUM-56](../../packages/contracts/src/media-cleanup.test.ts) kiểm ack đã thu quyền dù còn dọn hậu cảnh, timeout chưa xác minh và ack đến muộn từ target hoặc đời cũ. Ca callback Consumer trong ví dụ timeout mô tả tài nguyên cần dọn. Fixture ack chỉ kiểm định danh trả về, chưa chạy callback đóng Consumer. M4 review chính về đối chiếu identity và xử lý timeout. WBS cũng ghi M1 review phần giao với nguồn quyền. Việc đặt deny, đóng media thật và đo deadline thuộc các task tích hợp. SCRUM-58 dùng contract này cùng đầu ra riêng của SCRUM-57.
