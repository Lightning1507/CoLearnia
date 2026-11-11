# SCRUM-84 — Reconnect và resync MAIN

Nền mã `5bfbdde`, kiểm ngày 11/11/2026 trên Windows với Node 26.12.1. [Contract và cách tích hợp](../contracts/main-reconnect.md) ghi API, grace, cleanup và phần chưa được mount vào ứng dụng.

## Hành vi đã kiểm

- Join trả resume ticket riêng cho owner. Disconnect chặn context cũ ngay và gọi media revoke đồng bộ; messaging/board cleanup chạy ngoài gate.
- Resume trong grace giữ participant, không ghi lại metadata; cấp generation/ticket mới, về MAIN và dựng snapshot bằng quyền hiện hành.
- Retry cùng intent/socket sau mất ACK hoặc chạy đồng thời hội tụ về một generation. Ticket cũ không chiếm socket đang connected hoặc đổi intent; khi socket thay thế cũng disconnect trước khi ACK tới client, cùng intent có thể nối lại trong grace mới sau cleanup generation hiện hành.
- Grace tối đa 30.000 ms từ disconnect đầu tiên; callback lặp không kéo dài hạn. I/O qua deadline không cấp quyền mới. Callback disconnect của socket cũ không tác động kết nối mới.
- Auth session khác, continuity gap, quyền đã bị thu và generation/socket cũ đều bị từ chối. Lỗi provider tạm có thể thử lại trong hạn gốc.
- Resync dùng schema SCRUM-66, tạo snapshot mới thay vì replay nội dung đã cache; adapter kiểm quyền lại trước ACK/fanout.

## Kết quả kiểm tra

| Kiểm tra                                  | Kết quả                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract, registry và signaling liên quan | 117 test đạt, gồm 27 test mới so với main.                                                                                                                        |
| Toàn bộ unit test                         | 654 test đạt trong 41 file, một Vitest worker.                                                                                                                    |
| DB integration                            | 143 test đạt trong 10 file, MongoDB 8.2.6 replica set riêng trên loopback.                                                                                        |
| Native reconnect integration              | WebRtcTransport thật bị đóng trước resume; participant vẫn một bản ghi, session DB revision không tăng khi resume/retry. Revoke/regrant không phục hồi ticket cũ. |
| Media smoke                               | Worker/Router với Opus và VP8 khởi động thành công.                                                                                                               |
| Harness                                   | 54 ca đạt, 1 ca symlink bỏ qua trên Windows; kiểm 128 nguồn/link/runtime đạt.                                                                                     |
| Format, lint, typecheck và build          | Đạt. Vite giữ cảnh báo bundle trên 500 kB; build thành công.                                                                                                      |
| `git diff --check`                        | Đạt.                                                                                                                                                              |

Cổng tương đương `pnpm check` chạy tuần tự bằng entrypoint Node của từng công cụ; Vitest giới hạn một worker để tránh áp lực bộ nhớ local. DB integration chạy riêng với database tên ngẫu nhiên, chỉ dọn dữ liệu của suite; không reset hoặc migrate DB ứng dụng.

Lệnh kiểm gần thay đổi:

```bash
pnpm exec vitest run apps/server/src/live/session-manager/main-join-registry.test.ts apps/server/src/live/session-manager/main-reconnect-signaling.test.ts packages/contracts/src/session-join.test.ts --maxWorkers=1
pnpm exec vitest run --config vitest.database.config.ts apps/server/test/main-join-registry.integration.ts --maxWorkers=1
pnpm media:smoke
```

## Giới hạn

Auth/access provider và messaging/board trong integration vẫn là fixture; MongoDB, Router và WebRtcTransport là thật. Chưa kiểm cuộc gọi trình duyệt, RTP/audio thực, TURN, heartbeat/control-lease detection hoặc mount registry vào production. Các kết quả này không thay gate SCRUM-88/89.

SCRUM-87 tiếp tục read-back và end khi không còn ownership hợp lệ. Lifecycle host tạm/hoàn quyền, nhóm và takeover của call còn kết nối giữ nguyên task riêng. Không tự restore source/media, chat/board grant hoặc private scope từ metadata/cache sau reconnect.
