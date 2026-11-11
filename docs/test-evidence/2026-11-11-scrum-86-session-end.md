# SCRUM-86 — Host kết thúc phiên hoặc chủ động rời

Nền kiểm tra: `134d2cd` trên main. Windows, Node 26.12.1, pnpm 11.5.2; MongoDB 8.2.6 replica set một node trên loopback, DB test có tên ngẫu nhiên riêng. Không chạy migration hoặc đổi staging. Native mediasoup worker/Router thật; authority và cleanup M2/M3/M5 trong fixture không thay provider production.

## Kết quả

| Kiểm tra                                    | Kết quả                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry, operation, socket và contract mới | 28 ca mới đạt: host end/rời, member/stale bị từ chối, đổi host trước acceptance, gate được nhả khi cleanup chờ, lỗi adapter/DB, deadline, callback muộn, retention/cap và replay kiểm lại quyền |
| Toàn bộ test thường                         | 582 test, 39 file đạt                                                                                                                                                                           |
| MongoDB integration                         | 129 test, 9 file đạt; hai ca mới dùng transaction và native Router thật                                                                                                                         |
| Các bước tương đương `pnpm check`           | Harness, format, ESLint, typecheck contracts/server/web và build đạt; chạy trực tiếp bằng Node qua cùng entrypoint trong scripts. Harness 54 đạt, 1 ca symlink bỏ qua trên Windows              |
| Native media smoke                          | Worker/Router khởi động với Opus/VP8                                                                                                                                                            |
| Diff whitespace                             | `git diff --check` đạt                                                                                                                                                                          |

Ca tích hợp host leave tạo hai participant, gửi end đồng thời rồi kiểm một begin/complete, DB ENDED, hostUserId=null, mọi participation có leftAt và Router closed. Sau đó tạo phiên mới và replay end phiên cũ; Router mới vẫn mở.

Ca mất ACK thực hiện completeEnding/commit thật rồi ném `UnknownTransactionCommitResult` mô phỏng. DB đã ENDED nhưng registry trả pending/giữ deny, không chạy complete lần hai. Ca này không mô phỏng failover mạng hoặc chứng minh đã có reconciliation SCRUM-87.

Ca đổi host dùng commit state có kiểm soát dưới coordinator thật; implementation chuyển/kế vị host chưa thuộc task này. Test deadline tách completion đã gửi khỏi callback begin đến muộn; timeout không tự chứng minh rollback.

## Giới hạn

- Chưa mount registry MAIN và adapter `session.end` trong composition app; chưa có terminal fanout theo cursor từng người hoặc FE end UI. Xem [contract](../contracts/session-end.md).
- Cleanup chat/file/board và invalidation pending media dùng fixture. Router close được kiểm native, chưa kiểm cuộc gọi browser, mic/camera, hai mạng hoặc TURN.
- Recording chưa được triển khai; khi tích hợp cần thu input đúng đời, không đợi finalize video.
- Web build còn cảnh báo chunk trên 500 kB. MongoDB baseline 8.0.16 và Docker stack cần CI xác nhận; test local dùng 8.2.6.
- Không thay env, schema/index hoặc chạy migration. Pending operation giữ chặn tới khi được đối chiếu; phần đó tiếp tục ở SCRUM-87.
