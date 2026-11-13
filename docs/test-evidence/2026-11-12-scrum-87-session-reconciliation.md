# SCRUM-87 — Đối chiếu kết quả DB và phiên rỗng

Nền mã `3b59cdd`, kiểm ngày 12/11/2026 trên Windows, Node 26.12.1. [Contract](../contracts/session-reconciliation.md) ghi cổng nội bộ, bằng chứng read-back và điều kiện tích hợp.

## Hành vi đã kiểm

- Một write intent chỉ gửi mutation một lần. ACK mất sau commit được xác nhận bằng snapshot DB gồm session/participation; null, revision/epoch/timestamp/actor/scope sai vẫn giữ chưa rõ. Đọc lỗi rồi phục hồi không ghi lặp.
- Join upsert lấy đúng participantId hiện hữu. Read-back không cấp ownership khi quyền bị thu trong lúc đọc. Intent join chưa xác nhận không được dùng lại để ghi; join mới phải xác thực lại.
- Begin/complete end mất ACK và dịch vụ đọc chưa sẵn sàng trả pending, giữ deny. Sweep sau xác nhận DB rồi hoàn tất cùng operation; replay end trả kết quả completed, mỗi bước chỉ được ghi một lần.
- Create xác nhận muộn sau khi Router đã đóng được kết thúc, không phục hồi runtime từ metadata. Unique phiên mở được giải phóng bằng lifecycle ENDED, không xóa document để bỏ chặn.
- Ownership cuối còn grace giữ ACTIVE tới đúng biên 30.000 ms. Sau biên, ticket chưa dùng không giữ phiên; cleanup/CAS hoàn tất thì DB ENDED, host=null, participation có leftAt, Router đóng. Quyền bị thu không được tính là grace hợp lệ.
- Join thắng trước quyết định empty giữ phiên; ENDING thắng trước từ chối ticket cũ và không cho callback cũ tác động epoch mới. Cleanup chạy ngoài gate.

## Kiểm tra thực chạy

```bash
pnpm exec vitest run apps/server/src/live/session-manager/main-join-registry.test.ts apps/server/src/live/session-manager/session-end-operation.test.ts apps/server/src/live/session-manager/session-metadata-write.test.ts --maxWorkers=1
pnpm exec vitest run --config vitest.database.config.ts apps/server/test/main-join-registry.integration.ts --maxWorkers=1
```

127 test liên quan đạt; integration registry đạt 21 test với MongoDB 8.2.6 replica set riêng và mediasoup native. Test lost-ack ném lỗi sau commit thật, không giả DB đã lưu. DB test dùng tên ngẫu nhiên và chỉ dọn dữ liệu của suite.

Toàn bộ unit: **749 test đạt trong 46 file**. Toàn bộ DB integration: **151 test đạt trong 10 file**. Harness: 54 ca đạt, 1 ca symlink bỏ qua trên Windows; kiểm 134 nguồn/link/runtime đạt. Format, lint, typecheck, build, media smoke và `git diff --check` đạt. Vite còn cảnh báo bundle trên 500 kB; build thành công. Bộ kiểm tra tương đương `pnpm check` chạy qua entrypoint Node với một Vitest worker để hạn chế bộ nhớ local.

Ca cuối kiểm dọn orphan rồi tạo phiên mới dùng chung budget issue ban đầu; hết budget không tạo replacement trong cùng yêu cầu. Sau thay đổi guard, format/lint/typecheck, toàn bộ unit và build được chạy lại; DB integration đã kiểm lifecycle/read-back ở lượt trước.

## Bổ sung sau review ngày 13/11/2026

- Với maxEndRecords=1, tạo reservation A trước, B giữ slot end duy nhất do mất ACK beginEnding và lỗi đọc. Khi A hết ticket, sweep hoãn A riêng và vẫn read-back/hoàn tất B. Slot replay của B giữ đủ 60 giây; A chỉ được end sau khi slot hết TTL, không xóa sớm record hoặc ghi lại begin/complete của B.
- Replay issue có read-back hợp lệ tại đúng 10.000 ms và sau 10.001 ms đều trả DEPENDENCY_UNAVAILABLE. Request mới vẫn replay cùng ticket/expiresAt khi còn TTL, số write join và số lần đọc không tăng. Không biến ticket còn hạn thành lý do bỏ qua deadline request.
- Hai lỗi đã tái hiện trước sửa bằng integration MongoDB/mediasoup. Sau sửa, registry đạt 24 ca, toàn bộ DB integration đạt 154 ca trong 10 file, dùng replica set riêng.
- Kiểm lại toàn repo: 749 unit test trong 46 file; harness, format, lint, typecheck, build, media smoke và `git diff --check` đạt. Vite giữ cảnh báo bundle trên 500 kB.

## Bổ sung sau review ngày 14/11/2026

- Coordinator thật: giữ gate Workspace A, tạo hai room A đứng trước room B ở Workspace khác. Cả BUSY do đầy hàng đợi lẫn TIMEOUT đều chỉ hoãn Workspace A; trong cùng sweep, B được đọc lại DB và tới ENDED khi gate A vẫn đang bị giữ. Không lặp chờ trên room A thứ hai. Sau khi nhả gate, lượt sweep sau kết thúc cả hai room A.
- Replay issue: trong lúc readMutation đọc bằng chứng join đã commit, đổi riêng fence hoặc quyền đọc của M1 sang từ chối. Cả hai trường hợp đều bị từ chối trước trả ticket; không ghi lại join hoặc công bố ownership từ metadata. M1 là fixture, snapshot DB/commit là thật.
- Bốn regression mới đều tái hiện lỗi trước sửa và đạt sau sửa. Registry integration đạt 28 ca; toàn bộ DB integration đạt 158 ca trong 10 file với replica set riêng. Unit giới hạn retry được cập nhật theo hành vi hoãn Workspace: hết lượt thì không lấy lại cùng gate để xét phiên rỗng trong lượt sweep đó.
- Sửa hàng mô tả write intent trong bảng contract để danh sách kind không bị hiểu thành các cột Markdown riêng.
- Kiểm lại toàn repo: 749 unit test trong 46 file; harness, format, lint, typecheck, build, media smoke và `git diff --check` đạt. Giữ cảnh báo bundle Vite hiện có; không dùng smoke để kết luận cuộc gọi trình duyệt/TURN đã chạy.

## Giới hạn kiểm chứng

M1 auth/access và M2/M5 cleanup là fixture; MongoDB transaction/CAS/read-back, Router và worker trong integration là thật. Chưa mount registry/scheduler vào production, chưa kiểm gọi trình duyệt, RTP, TURN hoặc capacity. Composition cần gọi sweep tại deadline/lifecycle theo contract; kiểm fake clock không chứng minh timer production.

Không đổi schema/index/migration, môi trường hoặc runtime khôi phục sau restart. Kết quả thiếu bằng chứng giữ uncertain/deny để đối chiếu tiếp, không tự retry mutation hoặc khẳng định rollback.
