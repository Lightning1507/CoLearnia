# Worker chết và khởi động lại runtime — SCRUM-91

## Luồng đang có

`createMediaRuntime()` phát thông báo `onFailure({runtimeId, routerIds})` một lần khi mediasoup worker phát `died`. ID runtime là UUID mới; danh sách Router được chụp bất biến. Mediasoup đóng Router trước khi phát died, nên runtime giữ ID của các Router bị đóng theo worker để thông báo không mất đích. Router đã đóng bình thường trước đó không thuộc danh sách bị ảnh hưởng.

`isReady()` trả false khi worker chết; createSessionRouter mới bị từ chối. Main đóng cờ nhận LIVE runtime và readiness vốn phụ thuộc media chuyển 503; liveness vẫn trả 200. Không tự tạo worker hoặc phục hồi Router/grant cũ.

Khi composition đã có registry, gọi một lần:

```ts
const detach = bindWorkerFailure(mediaRuntime, registry, (result) => {
  // SETTLED: đã nhận kết quả lifecycle, có thể còn phiên PENDING.
  // FAILED: không nhận được kết quả; giữ readiness/deny và kiểm vận hành.
});
```

`registry.handleRouterFailure(routerIds)` là cổng nội bộ server, không nhận trực tiếp payload từ browser. Trả danh sách `{sessionId, epoch, state: 'ENDED' | 'PENDING'}` cho những room khớp Router hiện tại. Không suy SETTLED nghĩa là mọi phiên đã ENDED. Binder bắt lỗi callback để tránh unhandled rejection; lỗi phải được đầu mối vận hành ghi nhận.

App hiện chưa mount registry MAIN và các provider cleanup đầy đủ. Main đã nối việc mất readiness; binder registry được kiểm qua integration thật và phải nối vào composition khi MAIN được mount. Không gọi cold bootstrap ngay trong runtime đang phục vụ call để thay cleanup liên miền.

## Chặn ngay, kết thúc đúng phiên

1. Khi nhận danh sách Router lỗi, đặt cờ mediaFailed và hủy ticket của các room liên quan ngay trước mọi await. Context/join mới bị từ chối, kể cả DB/native callback đang chờ. Room thuộc Router khác không bị chặn.
2. Lấy Workspace gate chung và đăng ký operation end theo session/epoch. Nếu host end đã có operation thì dùng lại; không ghi DB hoặc cleanup lần hai. Mỗi room giữ một failure task, thông báo lặp hội tụ cùng kết quả.
3. Dùng pipeline SCRUM-86: ENDING, block ownership, đóng Router; cleanup PARTICIPANT và SCOPE MAIN/nhóm; transaction beginEnding/completeEnding có guard và deadline. Đây là hành động lifecycle của server, không giả mạo authSession hay yêu cầu quyền host đang online.
4. Cleanup vẫn chạy khi DB lỗi. Room có metadata chưa rõ không được begin/complete lại mù; trả PENDING và giữ deny để SCRUM-87/cold startup đối chiếu. Thiếu adapter/cap/timeout gate cũng giữ room lỗi bị chặn, không báo thành công.
5. Room đang tạo chưa xuất hiện lúc notification đến vẫn được nhận diện bằng Router ID đã lỗi. Nếu create ACK trả muộn, không cấp ticket; sau khi nhả gate, registry đưa room vào cùng pipeline end. Không lấy gate lồng từ trong operation M1. Allocation thất bại trước khi có metadata chỉ đóng tài nguyên và không tạo quyền.

Ngân sách ID lỗi tối đa maxRooms + 32 (room đã nhận và Router allocation đang chờ), giữ tới khi registry đóng. Không dùng ID cũ để đóng room mới. Operation end giữ budget/replay/cap hiện có; PENDING không tự reset deadline hoặc được bỏ qua bằng retry.

## Restart và xử lý vận hành

Sau worker chết, runtime tiếp tục không sẵn sàng. Triển khai hiện giữ một process/worker; không tăng số worker hoặc tự khởi động worker thay thế. Trước restart, kiểm kết quả lifecycle/DB, cleanup M2/M5 và log đã lọc; kết quả PENDING cần đối chiếu, không suy timeout là rollback.

Process mới chạy cold bootstrap SCRUM-80 trước khi tạo media/nhận LIVE: đối chiếu ACTIVE/ENDING, kiểm index và cleanup conversation/frame. Không đạt thì readiness giữ 503. Không phục hồi quyền host, nhóm hoặc transport từ metadata. Người học phải vào một phiên hợp lệ mới sau khi startup được xác nhận.

Shutdown chủ động `runtime.close()` không phát worker failure. Tháo binder khi hủy composition; callback lỗi đời cũ không được gắn sang registry mới. Không publish token, auth/access stamp hoặc chi tiết lỗi native trong thông báo.

## Kiểm chứng

- Fixture kiểm worker chết sau khi Router đã đóng, listener lặp/đến muộn, Router đóng bình thường và shutdown chủ động.
- Registry kiểm đích Router, end cạnh worker failure, pending join/create, metadata chưa rõ, reservation-only room và peer còn quyền.
- Integration dùng worker subprocess/native Router và MongoDB thật: chỉ dừng PID worker do test tạo, readiness 200→503, live 200; metadata ENDED, host null, participant leftAt và không còn ownership. Thử create Router sau failure bị từ chối.
- M1 authority và cleanup M2/M5 là fixture; chưa là cuộc gọi browser/mic/camera/TURN hay failover máy chủ. Cold bootstrap có bộ integration riêng, không thay bằng worker smoke.

Nguồn: [end](session-end.md), [bootstrap](session-bootstrap-metadata.md), [capacity](../capacity.md).
