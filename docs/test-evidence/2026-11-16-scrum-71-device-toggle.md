# SCRUM-71 — Bật/tắt mic và camera

M3-T5.1 trong [Sprint 1](../planning/sprint-1.md). Phần này kiểm thao tác với thiết bị và quyền MAIN.

- Lựa chọn thiết bị từ lobby được truyền vào adapter dưới dạng device ID trong bộ nhớ. Lượt gọi bắt đầu với mic và camera tắt. Nút bật mở đúng loại thiết bị sau thao tác người dùng. Khi tắt hoặc mất context, runtime ngắt track cục bộ trước khi chờ signaling.
- Tắt dùng `media.producer.close`. Bật lại theo thao tác mới tạo Producer mới. Payload có `transportId` và `target` là `{ producerId }` hoặc `{ createRequestId }`. Khi mất ACK create, client dùng ID của intent để dọn nguồn chưa xác định, rồi xác nhận cleanup trước lần bật mới. Server giữ slot pending đến khi native I/O kết thúc và dọn Producer trả muộn. Close lặp trên transport hợp lệ hội tụ về `closed: true`.
- Adapter media source phát thay đổi qua stream hiện có. Gate recipient lọc nguồn theo quyền hiện hành. Nếu ACK đóng không xác định, client vẫn dừng track cục bộ và báo chưa xác nhận được việc đóng nguồn trên server.

## Kiểm lại trên loopback

```powershell
pnpm --filter @colearnia/contracts build
pnpm --filter @colearnia/server exec tsx test/fixtures/media-transport/media-transport-fixture.ts --paused-ready
```

Chạy Vite ở terminal khác.

```powershell
pnpm --filter @colearnia/web dev --port 5191 --strictPort
```

Mở fixture ở `http://127.0.0.1:5191/test/browser/media-paused-ready/?browser=A&device-toggle`.

- Chrome headless với mic/camera giả lập ở 1280 × 800 và 1440 × 900. Đã kiểm nút ở trạng thái tắt ban đầu, bật mic bằng Enter, bật camera khi mic đang bật, tắt mic mà camera vẫn bật, tắt camera và bật/tắt lại mic. Network ghi nhận ba ACK đóng Producer từ server.
- Unit test kiểm quyền sở hữu Producer, close lặp, delta kết thúc nguồn, từ chối cấp quyền thiết bị, callback capture/publish muộn và giữ thiết bị tắt khi context được cấp lại.
- `pnpm media:smoke` khởi động worker mediasoup và Router Opus/VP8 thành công.

## Kiểm hồi quy sau review

- Mất cả hai ACK create: cleanup bằng `createRequestId`; nếu ACK cleanup tiếp tục mất, lần bật sau đối soát lại cleanup trước khi tạo intent mới. Track đã tắt luôn được dừng ngay tại client.
- Create đang chờ native I/O hoặc command create đến sau close: giữ slot đến khi I/O kết thúc, đóng Producer trả muộn và ngăn intent cũ phát lại. Kiểm đối chứng user khác không đóng Producer của owner.
- Owner đã snapshot trước khi tạo nguồn vẫn nhận event `CLOSED` đúng Producer. Source delta cập nhật own resources và ACK resource grant giữ bằng chứng cấp nguồn đúng binding.
- `pnpm test`: 956 test đạt. `pnpm typecheck`, `pnpm build`, ESLint các file sửa, `git diff --check` và `pnpm media:smoke` đạt. Build web cảnh báo bundle trên 500 kB. `pnpm check` qua harness 54 PASS/1 skip Windows, dừng ở format hai file Markdown trong `.scrum75-worktree`; kiểm format các file SCRUM-71 riêng đạt.

## Kiểm lại phản hồi sau hủy bật

- Hủy khi đang chờ ACK create vẫn dừng track ngay. Nếu server chưa xác nhận cleanup, điều khiển hiển thị trạng thái tắt kèm cảnh báo. Nếu ACK create timeout sau khi người dùng đã hủy, client chuyển sang cleanup theo ID create và không gửi lại lệnh tạo.
- Test controller kiểm publication trả muộn với cả hai kết quả cleanup. Test adapter kiểm ca ACK create bị mất, ca ACK đến sau thao tác hủy và ca timeout sau thao tác hủy. Cả ba xác nhận giữ intent để đối soát cleanup trước lần bật tiếp theo.

## Điểm tích hợp

Đường LIVE của Workspace đang hiển thị panel kênh. Luồng MAIN có xác thực cần cung cấp SEND transport, context có quyền và vòng đời call cho adapter. Khi ghép với screen share trên cùng transport, dùng hàm `produce` của adapter làm `publishOther` để giữ một listener produce. Đưa đối tượng `devices` vào `RoomShell` và cập nhật context khi projection thay đổi hoặc quyền bị thu.

Đầu mối ghép luồng MAIN thật là SCRUM-88 / M4-T11.1, theo [phạm vi composition hiện hành](../contracts/worker-failure.md). Camera tiles và trạng thái server pause ở SCRUM-78 / M3-T5.3; đổi/rút thiết bị và replacement thuộc các task T5.2/T5.4 trong proposal.

Bằng chứng trình duyệt ở trên là fixture WebRTC loopback. Luồng MAIN từ workspace với phiên đăng nhập, thiết bị vật lý và TURN chưa được nghiệm thu.
