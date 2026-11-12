# SCRUM-90 — Fixture kế vị host và phối hợp recording

Nền mã `0afc3e3`, kiểm ngày 11/11/2026. Task dùng ngân sách tối đa 4 giờ để đánh giá Q1/Q7, không phải chạy fixture liên tục 4 giờ. Nguồn nghiệp vụ: [host/reconnect](../product/live-session.md), [recording](../product/recording.md), [proposal M4](../proposals/m4-session-groups.md).

## Kết luận

Có thể giữ một đích hoàn host gốc, kiểm role/scope bằng policy chung và dùng cleanup coordinator để chặn grant trước khi thu quyền xong. Recording cần gắn session/epoch/attempt riêng, không gắn socket hoặc callGeneration của người bấm Record; đổi host không tạo attempt mới hoặc reset hạn ghi.

Đây là fixture, chưa là implementation kế vị host/recorder trong ứng dụng. Mô hình ở `apps/server/test/fixtures/host-recording/host-recording-fixture.ts`, chỉ được import bởi test. Không thêm route, DB model, encoder hoặc storage adapter.

## Cách kiểm và kết quả

`host-recording.spike.test.ts` dùng mô hình sự kiện nhưng lấy quyết định role/scope/quyền nguồn từ `resolveSessionPolicyContext` và `canPublishMedia` thực trên main. Handoff dùng `OperationCoordinator`/`beginSessionTransition` thực; ca end dùng `createSessionEndOperation` thực. Adapter cleanup, DB callback và recorder/storage receipt là test double.

| Ca kiểm                     | Kết quả fixture                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A → B tạm → C tạm           | Đích hoàn quyền vẫn A; B quay lại không giành host từ C. A join lại hợp lệ sau grace nhận lại host trong mô hình.                                                                                     |
| B bàn giao chính thức cho C | Chỉ xóa đích A sau cleanup và commit thành công; A quay lại là member.                                                                                                                                |
| Revoke/regrant              | Revoke A xóa đích A; cấp lại rồi join không phục hồi host. Revoke B tạm không xóa đích A còn hợp lệ.                                                                                                  |
| Không còn ứng viên          | Không cấp role cho socket rớt; giữ phiên theo grace hiện có; đúng biên 30.000 ms chuyển ENDING, không empty grace.                                                                                    |
| Chọn host                   | Picker inject kiểm hai đầu danh sách; policy loại auth hết hạn/blocked. Chưa đo phân bố ngẫu nhiên production.                                                                                        |
| Cleanup đang chờ            | Workspace gate vẫn nhận việc khác; chưa grant host mới. Plan/revision/epoch cũ không commit được sau cleanup muộn.                                                                                    |
| Host hỗ trợ nhóm            | Ghi nhận chuyển MAIN/pause mic khi mất quyền hỗ trợ độc quyền, giữ roster/deadline nhóm. Chưa pause hoặc thu private resource thật.                                                                   |
| Start/Stop và đổi host      | Giữ cùng recording/attempt/generation; chỉ host hiện hành điều khiển. Cùng actor/requestId replay cùng attempt; host mới dùng cùng requestId không nhận nhầm reservation và không mở attempt thứ hai. |
| Stop trong STARTING         | Callback capture-ready muộn bị từ chối, không đặt captureStartedAt hoặc trở lại RECORDING. Trace xử lý input muộn chưa chứng minh native input đã đóng.                                               |
| Hạn ghi                     | 10.800.000 ms từ capture-ready, không từ click; đổi host không reset. Đến hạn dừng input trong mô hình, call tiếp tục. Fake clock không thay soak ghi thật 3 tiếng.                                   |
| End call                    | End operation thực chưa hoàn tất trước xác nhận input-stopped đúng attempt. Sau đó trả ENDED/cleanupPending khi recorder còn PROCESSING, không chờ READY.                                             |
| Finalize/storage            | Cần input dừng, đúng attempt, stored receipt và không storage deny trước READY. PROCESSING/terminal chưa release vẫn giữ slot. Chưa kiểm byte/R2/transaction READY thật.                              |
| Callback cũ/lỗi recorder    | Stop/deadline/input-stopped của attempt cũ không đổi attempt mới. Recorder lỗi không end call hoặc tự mở recorder thay thế.                                                                           |
| Nguồn ghi                   | Policy chỉ chọn nguồn MAIN còn quyền/active, loại host hỗ trợ và ACTIVITY. Thiết bị tắt không tự bật; localGain không quyết định eligibility. Chưa có mixer/Consumer/pipeline thật.                   |

## Bổ sung sau review ngày 12/11/2026

- Giữ đích hoàn quyền A trong lúc B bàn giao cho C; chỉ xóa khi plan hiện hành commit thành công. Cleanup chưa xác nhận hoặc plan bị thay thế không xóa đích A. Test kiểm cả retry commit thành công và A quay lại trước khi bàn giao hoàn tất.
- Recorder lỗi ở PROCESSING chuyển ngay sang FAILED và tăng revision một lần. Callback finalize muộn không đưa về READY; cuộc gọi vẫn ACTIVE, không tự mở attempt mới. STARTING/RECORDING vẫn cần xác nhận input-stopped trước khi giải phóng tài nguyên.
- Ba regression test mới đều tái hiện lỗi trước bản sửa và đạt sau bản sửa; tổng fixture 26 ca đạt. Toàn bộ unit đạt 676 ca trong 41 file; harness, format, lint, typecheck và build đạt. Vite giữ cảnh báo bundle trên 500 kB.

## Phần cần bổ sung khi triển khai

1. **Kế vị host:** registry trên main chưa giữ `returnHostUserId` hoặc có đầy đủ kế vị/hoàn quyền. Repository đã có `changeHost` dùng CAS và kiểm participation; M4-T7.3 cần ghép cổng này với current authority và callback generation, không tạo luồng ghi host thứ hai. Fixture chưa chứng minh DB write hoặc reconnect trình duyệt.
2. **Thu quyền host riêng:** không dùng cleanup toàn participant cho mọi lần đổi host. Host chuyển quyền nhưng vẫn ở MAIN phải giữ mic/camera/share hợp lệ. Port cleanup hiện có chỉ có participant/scope, chưa mô tả riêng host/help/announcement/overlay. M4–M3–M2–M5 cần chốt phần thu quyền này, không đóng mọi tài nguyên MAIN. Ca disconnect toàn participant đã thử không chứng minh ca transfer chính thức.
3. **Recording có một owner state:** M3 giữ attempt/helper/đầu vào; M2 giữ reservation/byte/READY. M4 chỉ điều phối intent/quyền/projection, không tạo state machine hay repository recording thứ hai. Descriptor cần session/epoch, recordingId, attemptId, generation, revision và inputStopped; generation recorder độc lập callGeneration.
4. **Ý nghĩa cleanup ACK:** chỉ xác nhận `permissionRevoked/pendingInvalidated` sau khi M3 thực sự chặn nguồn của đúng attempt. EOS/finalize/upload/verify chạy ngoài gate. Khung end đã tách cleanup khỏi video READY; adapter recorder thật còn thiếu. Budget input-stop đề xuất 5 giây cần M3 quản lý riêng, không mặc nhiên bằng foreground 10 giây của M4.
5. **Sink còn review:** đã đối chiếu [PR #83 / SCRUM-37](https://github.com/Lightning1507/CoLearnia/pull/83), snapshot `6c2bdf061ec61e1163551870c84c0ebc5df4ba6f`. Start key theo actor/requestId, một attempt mở, reserve trước capture và input-stopped trước finalize phù hợp fixture. Chưa có schema TypeScript/adapter trên main; M2/M3/M1 cần review trước tích hợp. Không import nhánh đó hoặc coi receipt giả là bằng chứng lưu bền.

Ưu tiên tiếp: M4-T7.3 cho kế vị host, M4-T8.3 cho điều phối recording; phối hợp SCRUM-37/51 và contract recorder M3. Giữ hướng pipeline, hạn 3 tiếng/đoạn và READY vô thời hạn đã chốt. Quota, quyền xóa và xử lý khi xóa cha vẫn mở. Đã sửa tham chiếu cuối `live-session.md` còn ghi pipeline/retention chưa chọn, theo nguồn recording hiện hành.

## Kiểm tra thực chạy

```bash
pnpm exec vitest run apps/server/src/live/session-manager/host-recording.spike.test.ts --maxWorkers=1
pnpm --filter @colearnia/server typecheck
pnpm check
```

Fixture: **23 ca đạt**. Toàn bộ unit test: **673 ca đạt trong 41 file**. Harness: 54 ca đạt, 1 ca symlink bỏ qua trên Windows; kiểm 128 nguồn/link/runtime đạt. Format, lint, typecheck, build và `git diff --check` đạt. Vite giữ cảnh báo bundle trên 500 kB; build thành công.

Cổng tương đương `pnpm check` chạy tuần tự bằng entrypoint Node của từng công cụ trên Windows, Node 26.12.1; Vitest một worker để hạn chế bộ nhớ local. Không chạy DB integration hoặc media smoke riêng vì không thay runtime DB/media; fixture không thay PoC mediasoup → GStreamer → lưu/xem video, hai mạng, sync tiếng–hình hoặc đo CPU/RAM/disk.
