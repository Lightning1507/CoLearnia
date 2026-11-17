# SCRUM-78 — Camera tiles và trạng thái server pause

M3-T5.3 / FR-05-03; reviewer theo kế hoạch: M3. Nhánh `feat/SCRUM-78-camera-server-state`, base `867e72c` ngày 17/11/2026. Nguồn: [Sprint 1](../planning/sprint-1.md), [thiết kế media §6.2.3–4, §6.3.6](../proposals/m3-media.md), [contract hiện hành](../contracts/media-source-sync.md). Prompt tham chiếu `a5fce0a`; implementation dùng schema/code tại checkout hiện tại. Jira trực tiếp yêu cầu đăng nhập, chưa đối chiếu được cập nhật riêng trên ticket.

## Khảo sát dependency và khoảng trống

- Chưa có CameraTile. RoomShell có stage tùy chọn và binding video mượn stream; không có camera projection để React subscribe.
- M3-T5.1 đã có trong SCRUM-71 / PR #120: `DeviceMedia` giữ ý định/lifecycle capture; `createDeviceMediaSocket` dùng `media.producer.create` và `media.producer.close`. Tắt đóng nguồn, không tự bổ sung protocol toggle pause/resume.
- Contract export `MediaSourceDescriptor`, `media.source.changed/ended`, `media.producer.stateChanged` và `media.consumer.closed` đã có. Descriptor chỉ có `PUBLISHING/PAUSED/SWITCHING`; `CLOSED` là event riêng, không tạo enum mới trong UI.
- `MediaSnapshotRuntime` đã ghép snapshot, kiểm audience/sequence, revision/generation, tombstone và đối soát Consumer. Paused-ready và adapter audio đã có; track và tài nguyên thuộc runtime, không thuộc store/UI.
- Trạng thái nút thiết bị không chứng minh server đang publish. Trước task chưa có camera tile dùng toggle/stream để báo active, cũng chưa có state camera bị nhân bản trong UI store.
- Participant roster thuộc projection M4. Task không suy người tham gia từ camera, không thêm pin/viewport, không đổi policy hoặc schema backend.

## Thay đổi và điểm ghép

- Camera projection chỉ đọc từ runtime hiện có, chuyển qua `CallControllerOwner` / `useSyncExternalStore`. `ownProducers` ưu tiên hơn public source cho owner-only pause đến trước public delta.
- Local preview chỉ được liên kết với descriptor từ ACK create bằng `bindCameraPreview`. Association này không tạo source và không tự cấp trạng thái publishing. Khi ghép MAIN, truyền runtime media làm đối số thứ năm của `createDeviceMediaSocket(socket, send, lifetime, preferences, media)`.
- Adapter Consumer video hiện hành có thể truyền `videoTrack` vào `attachConsumer(snapshot, binding, handle)`, sau đó đi `confirmConsumerReady` khi ACK ready hợp lệ. Tile không tạo Consumer/Producer hay join phiên. Chưa thêm một luồng receive/transport khác trong task này.
- Chỉ source `PUBLISHING`, projection còn đồng bộ, đúng binding và Consumer ready/không paused mới cung cấp track cho tile. Local preview cũng cần source owner đã đối soát. UI chờ sự kiện playback của video trước nhãn đang phát/nhận; lỗi, chờ hoặc track kết thúc làm ẩn hình cũ.
- PAUSED/SWITCHING tháo video và hiện placeholder. Ended/CLOSED/revoke bỏ tile; generation và callback cũ không đóng binding mới. Tombstone đối chiếu revision owner hiện hành để source-ended cũ không ẩn camera mới hơn.
- Gap, policy thay đổi hoặc signaling disconnect hạ trạng thái về đang đồng bộ, không tự đóng RTP. Reconnect cần snapshot mới. Đổi audience/thu context dọn nguồn cũ.
- Video luôn muted, playsInline và chỉ chứa một video track. Cleanup tháo `srcObject`/listeners, không stop track mượn và không ảnh hưởng AudioGraph.
- Nhãn người tham gia hiện dùng “Camera người tham gia” / “Camera của bạn”; chưa có display name từ roster được ghép trong RoomShell. Không đưa raw participant/source ID ra UI.

## Môi trường và cách kiểm

Windows; Node `v26.12.1`, pnpm `11.5.2`, React `19.3.1`, Vitest `5.1.0`. `pnpm.exe install --frozen-lockfile --fetch-retries=0` thành công, không sửa lockfile. Lượt đầu registry/TLS lỗi; không tắt kiểm chứng chữ ký, TLS hoặc supply-chain policy. `pnpm.exe doctor` xác nhận Node đúng target; Docker engine không chạy/không khả dụng. Không reset/seed/migration DB.

Fixture trình duyệt: chạy `pnpm --filter @colearnia/web dev --port 5191 --strictPort`, mở `http://127.0.0.1:5191/test/browser/camera-tiles/`. Trang tự chạy assertion và ghi PASS/FAIL. **Event/snapshot server là typed fixture mô phỏng; video track là canvas thật. Không có mediasoup server trong ca UI này.**

## Ma trận state transitions

| Ca                    | State/event                                                             | Kết quả thực                                                           | Bằng chứng                       |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| Publishing + ready    | Consumer chưa ready → ready → video playing                             | Chờ hình trước ready/frame; chỉ sau playback mới báo nhận hình         | PASS unit + Chrome fixture       |
| Server pause          | PUBLISHING → PAUSED                                                     | Không còn video; `srcObject` cũ bằng null; placeholder pause           | PASS unit + Chrome fixture       |
| Local enabled + pause | Track enabled/live, owner event PAUSED, public descriptor cũ PUBLISHING | Pause ưu tiên, không báo đang phát; track vẫn thuộc call               | PASS unit + Chrome fixture       |
| Resume                | PAUSED → PUBLISHING                                                     | Chờ frame mới, sau đó nhận hình; không tạo thêm Consumer               | PASS unit + Chrome fixture       |
| Switching             | PUBLISHING → SWITCHING → PUBLISHING                                     | Placeholder switching, sau resume vẫn cần readiness                    | PASS unit; Chrome kiểm switching |
| Ended                 | PUBLISHING → source.ended                                               | Bỏ tile, detach binding; participant còn nguyên                        | PASS unit + Chrome fixture       |
| Closed                | Own producer CLOSED                                                     | Bỏ camera dù track cục bộ còn enabled                                  | PASS unit                        |
| Stale/duplicate       | PAUSED revision mới → PUBLISHING revision cũ; event lặp                 | Giữ PAUSED, không nhân tile                                            | PASS unit                        |
| Generation cũ         | B đang active → ended/consumer.closed/callback A đến muộn               | B vẫn active; không đóng Consumer B                                    | PASS unit                        |
| Owner revision mới    | PAUSED revision 3 → ended revision 2                                    | Giữ camera PAUSED revision 3                                           | PASS unit                        |
| Consumer closed       | Đang ready → consumer.closed                                            | Đóng binding tương ứng; source còn nhưng chờ hình                      | PASS unit                        |
| Thu quyền             | ended PERMISSION_REVOKED hoặc updateContext(null)                       | Không giữ track/source trái quyền hoặc hồi từ cache                    | PASS unit                        |
| Mất đồng bộ           | Sequence gap / disconnect / policy / audience / abort                   | Không cung cấp track; reconnect cần snapshot mới                       | PASS unit                        |
| StrictMode/remount    | Mount → unmount → remount RoomShell khi active/paused                   | Một controller, một attachment; không đóng track, không hồi publishing | PASS Chrome fixture              |
| Server media thật     | Pause/resume Producer thực, physical camera, hai mạng/TURN              | Chưa kiểm; không suy từ mock/native smoke                              | NOT TESTED                       |

## Kết quả lệnh

- Regression camera: 22 test; runtime camera + snapshot: 52 test đạt.
- Trước khi cài lại dependency đúng lockfile: 980 test toàn repo đạt trên dependency có sẵn và Node 24; kết quả này chỉ là kiểm bổ sung, không thay cổng runtime chuẩn.
- `pnpm.exe check`: exit 0, harness 54 PASS / 1 skip Windows, format/lint/contracts + web + server typecheck đều đạt, Vitest 981/981 đạt (70 file), build cả ba package đạt. Web build vẫn có cảnh báo bundle trên 500 kB, không đổi ngưỡng cảnh báo.
- `pnpm.exe media:smoke`: exit 0, worker mediasoup và Router Opus/VP8 khởi động thành công. Smoke không chứng minh camera, isolation hoặc TURN.
- Chrome fixture hiển thị PASS cho ready/frame/pause/resume/remount/switching/ended và local enabled + server PAUSED. Đây là kiểm UI với media canvas, không là bằng chứng Producer phía server đã pause.

## Giới hạn và bước sau

SCRUM-88 / M4-T11.1 cần ghép join có xác thực, SEND/RECV, projection/context và lifecycle vào đường LIVE production. Camera tiles tái sử dụng cùng controller, source reconciler và toggle adapter; task này không tự ghép toàn bộ MAIN hoặc thêm orchestration pause backend. Trước gate MAIN cần kiểm native Producer pause/resume và frame remote qua luồng thật, physical camera và hai mạng/TURN. Chưa đánh dấu Jira Done hoặc nghiệm thu gate MAIN.
