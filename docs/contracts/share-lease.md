# Slot chia sẻ và media gate — SCRUM-73

Module [share-lease](../../apps/server/src/live/session-manager/share-lease.ts) giữ slot runtime cho từng session/epoch. Dùng policy SCRUM-65 để kiểm danh tính, membership, quyền kênh, generation, scope, phase và deadline hiện tại. MAIN có một slot. Mỗi ACTIVITY có một slot riêng. DISCUSSION bị từ chối. Thành viên có thể giữ slot mà không cần host duyệt.

## API nội bộ

`createShareLeaseRegistry(sessionId, epoch)` tạo registry gắn đúng một đời phiên. Composition layer giữ registry cùng SessionRuntime và hủy khi phiên kết thúc. Mọi hàm nhận `HeldShareContext`, gồm `SessionPolicyInput` và `assertHeld()` của gate phiên đang giữ. Riêng `revokeHeld` cần thêm `isCurrent(cleanupRequest)` từ context transition SCRUM-72 để từ chối cleanup đã lỗi thời. Chỉ composition layer cung cấp context từ identity/access hiện hành. Client gửi yêu cầu qua handler xác thực, không cung cấp context hay cleanup handle.

| Hàm                                                               | Hành vi                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acquireHeld(held)`                                               | Kiểm quyền và giữ slot đồng bộ. Trả `{ ok: true, value: { leaseId, leaseGeneration, expiresAtMs } }`, hoặc lỗi `SHARE_BUSY`, `AUTH_REQUIRED`, `FORBIDDEN`, `CONFLICT`. Lease picker có hạn 30 giây.         |
| `canPublishHeld(held, source, stage, leaseRef?)`                  | Kiểm quyền Producer ở CREATE/READY. SCREEN cần đúng lease. CREATE SCREEN dùng được khi đang giữ chỗ. READY SCREEN và CREATE/READY SCREEN_AUDIO cần ownership đã commit. MIC/CAMERA theo policy hiện tại.    |
| `commitHeld(held, publication)`                                   | Sau khi reserve publication và tạo SCREEN Producer paused, kiểm lại quyền, scope, round, generation, audience và access stamp. Chuyển sang ownership. Commit lặp trên đúng ownership hợp lệ trả thành công. |
| `canReceiveHeld(held, publisherParticipantId, source, leaseRef?)` | Kiểm quyền Consumer ở cả create và ready/resume. SCREEN/SCREEN_AUDIO cần ownership đang hoạt động và cặp leaseId/leaseGeneration gốc gắn trong registry nguồn của M3.                                       |
| `cancelHeld(held, leaseRef)`                                      | Chủ hiện hành hủy picker đang chờ. Lặp lại trả false.                                                                                                                                                       |
| `beginReleaseHeld(held, leaseRef)`                                | Callback server từ track-ended/Stop chuyển ownership đúng lease sang RELEASING. Pending lease được xóa.                                                                                                     |
| `revokeHeld(held, cleanupRequest)`                                | Thu quyền pending/ownership theo target SCRUM-23. Kiểm session/epoch, participant/generation hoặc scope/audience. Trả lease reference bị ảnh hưởng để M3 đóng nguồn.                                        |
| `releaseHeld(held, leaseRef)`                                     | Xóa slot RELEASING sau khi adapter xác nhận đã đóng cả SCREEN và SCREEN_AUDIO. Handle cũ không xóa slot mới.                                                                                                |

Các mã lỗi ở bảng là kết quả nội bộ. Handler SCRUM-74 sẽ định nghĩa schema command/ack, kiểm expected revision và ánh xạ lỗi riêng theo quy ước API khi nối luồng browser picker.

## Generation và lượt tạo SCREEN

`ShareLeaseRef` gồm `{ leaseId, leaseGeneration }`, khớp payload media.producer.create. Generation tăng theo mỗi lần acquire trong session incarnation; publish, consume, cancel, beginRelease và release đều so sánh cả hai field. Cleanup trả lease reference để callback giữ nguyên generation gốc.

M4 giữ chỗ lượt tạo bằng `reservePublishHeld(held, leaseRef, publicationId)` trước await. `publicationId` là requestId của lệnh tạo SCREEN. Hàm trả lease kèm publicationId. Lệnh khác trên cùng lease bị CONFLICT; commit cần đúng publication đã reserve. Khi đã commit, gate CREATE SCREEN bị chặn. Retry cùng publication vẫn có thể kiểm lại reservation rồi lấy kết quả cũ.

M3 giữ single-flight và mapping publication → pending/result/Producer. Retry phải kiểm quyền hiện hành, dùng lại pending hoặc kết quả đã xác nhận và không tạo Producer thứ hai. Lease grant không thay việc dedupe tài nguyên. Nếu tạo thất bại/hủy, đóng tài nguyên đang tạo rồi cancel hoặc release đúng lease; lần thử mới acquire lease mới.

## Thứ tự tích hợp M3/M4

1. Giữ gate phiên, lấy policy input hiện hành và acquire slot. Thả gate trước khi chờ người dùng chọn màn hình.
2. Click của người dùng gọi `getDisplayMedia()` theo flow [live session](../product/live-session.md#63-share-lease-và-browser-picker). Hủy thì gửi cancel. Hết 30 giây, pending lease mất hiệu lực ngay khi kiểm bằng đồng hồ server. Acquire mới có thể thay pending lease đã hết hạn.
3. Trước tạo SCREEN Producer, reserve publication dưới gate rồi gọi gate CREATE với lease reference và publicationId. Tạo tài nguyên ngoài gate ở trạng thái paused. Khi hoàn tất, vào lại gate, lấy context mới rồi commit publication và kiểm READY trước khi resume. Callback đến muộn phải đóng đúng tài nguyên vừa tạo khi commit/gate bị từ chối.
4. SCREEN_AUDIO gắn lease của SCREEN đã commit. Registry nguồn của M3 giữ cặp leaseId/leaseGeneration gốc cùng mapping Producer/Consumer. Gọi receive gate trước create Consumer và kiểm lại sau await, ngay trước ready/resume. Không tra lease mới chỉ bằng participant ID để gắn vào callback nguồn cũ.
5. Khi đổi scope/mất quyền/disconnect, gọi revoke dưới cùng gate với deny barrier của SCRUM-72 trước khi cleanup media. Gọi beginRelease với lease gốc khi Stop/track-ended. RELEASING chặn phát/nhận ngay và vẫn giữ slot bận khi media cleanup lỗi hoặc chưa xong. Chỉ gọi release với cặp leaseId/leaseGeneration gốc sau xác nhận cả hai nguồn đã đóng. Các hàm cleanup nhận handle do server giữ, không nhận lease reference của client làm bằng chứng đã đóng media.

Thời hạn picker chỉ áp dụng pending lease. Ownership đã publish chịu vòng đời signaling/cleanup. Đổi host không thu một share MAIN còn hợp lệ. M3 quản lý source revision và báo board dọn overlay/intent của nguồn bị đóng theo [proposal M4](../proposals/m4-session-groups.md#622-share-lease-và-điểm-kiểm-quyền-media).

Khi revision quyền thay đổi, policy chặn đến khi coordinator xác nhận lại access stamp đã commit. Nếu quyền liên tục còn hợp lệ và vẫn đúng membership/incarnation, ownership được giữ. Deny barrier, đổi incarnation, call generation, audience hoặc round đều chặn dùng lease cũ.

## Kiểm chứng

[Test](../../apps/server/src/live/session-manager/share-lease.test.ts) kiểm slot bận, phạm vi độc lập, biên 30 giây, publish sau await, stale lease/call generation/audience/round/access, thu quyền, giữ slot khi chờ cleanup, callback cũ và gate Producer/Consumer dùng policy thực. Dùng fixture runtime và clock có kiểm soát. Luồng browser picker/SCREEN Producer nằm ở SCRUM-74 và bước pause/ready media tích hợp của M3. Chưa kiểm chia sẻ màn hình trên trình duyệt hoặc mạng thật từ module này.
