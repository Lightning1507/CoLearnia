# SCRUM-77 · AudioGraph MAIN và autoplay

Adapter `receiveMainAudio` thực hiện create → consume cục bộ → gắn track vào runtime → ready, dùng signaling và RECV của cuộc gọi. Khi Consumer đóng hoặc ack ready không còn hợp lệ, adapter tháo đúng binding. AudioGraph dùng một gain chung bằng `1 / số track` để chừa biên độ cho tín hiệu trộn, giữ gain bằng 1 khi chỉ có một track. Fixture SCRUM-61 gọi chính adapter này với một Consumer mic thật qua mediasoup trên loopback và dùng nguồn âm thanh tổng hợp.

Đối chiếu [thiết kế M3-T8.1](../proposals/m3-media.md) và [vòng đời cuộc gọi](../product/live-session.md). CallController sở hữu AudioGraph theo đời cuộc gọi. Adapter nhận media truyền `audioTrack` của Consumer vào `MediaSnapshotRuntime.attachConsumer` sau khi đối chiếu binding theo luồng hiện có. AudioGraph mượn track; adapter giữ quyền đóng Consumer. Khi render video, giữ phần tử video ở trạng thái muted như RoomShell hiện tại.

Runtime chỉ nối MIC và SCREEN_AUDIO từ người khác trong MAIN. Snapshot, event đóng nguồn/Consumer/transport và việc mất context dùng chung đường tháo output. RoomShell chỉ quan sát trạng thái và gọi resume ngay trong sự kiện click **Bật âm thanh**.

| Kiểm tra                                                                                      | Kết quả                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run audioGraph.test.ts mediaSnapshotRuntime.test.ts callController.test.ts` | 41/41 đạt. Dùng Web Audio giả lập để kiểm một output mỗi track, biên độ trộn, callback cũ, mic local, nhóm, thu quyền, track kết thúc và thao tác resume. |
| Build contracts, typecheck web và ESLint trên file thay đổi                                   | Đạt.                                                                                                                                                      |
| `pnpm media:smoke`                                                                            | Native worker và Router Opus/VP8 khởi động được.                                                                                                          |
| `pnpm check`                                                                                  | Harness đạt 54 ca, skip một ca Windows. Cổng dừng ở Prettier do hai tài liệu trong worktree SCRUM-75 nằm dưới repo gốc.                                   |

Fixture SCRUM-61 chạy lại trên Chrome và Edge headless, loopback, bật autoplay bằng cấu hình trình duyệt. Cả hai đạt, mỗi bên nhận 15 gói audio và giải mã 2 frame, với biên độ đo lần lượt 0,925 và 0,578. Fixture cũng kiểm shutdown đóng Consumer audio ở client. Nguồn phát là tone tổng hợp, tín hiệu được đo ở analyser của fixture.

Màn LIVE của ứng dụng chưa gọi adapter qua luồng join và RECV production. Khi ghép MAIN cần kiểm mic thật, âm thanh chia sẻ, thao tác khôi phục khi browser chặn autoplay và thu quyền bằng context M4 thật.

Lượt sửa mất ACK và focus: nút khôi phục cao tối thiểu 40 px và trả focus về vùng điều khiển nếu nút đang giữ focus khi biến mất. Adapter thử lại `ready` một lần với cùng request ID rồi dùng [lệnh đóng Consumer](../contracts/media-source-sync.md#event-và-ví-dụ-watermark) khi không xác nhận được kết quả. Bộ kiểm liên quan đạt 66 ca, gồm retry sau mất ACK, đóng đúng Consumer và replay lệnh đóng. Build contracts, typecheck web/server, lint file thay đổi và `git diff --check` đạt. Chưa kiểm thao tác focus bằng bàn phím trên trình duyệt sau lượt sửa này.

Lượt kiểm revision: sau khi server đã resume Consumer và revision tăng, `ready` cũ trả `CONFLICT`, còn `close` đúng binding vẫn đóng được Consumer. Transport guard vẫn từ chối socket khác và revision tương lai. Nếu cả hai lần gửi `close` đều không xác nhận được, client báo lỗi cleanup và media phía server cần lifecycle thu quyền, rời hoặc mất kết nối để dọn.
