# SCRUM-83 — Thu quyền MAIN và hủy pending

Nền cập nhật: main `83dfaf2`, gồm SCRUM-86 và history-sync. Đã giải conflict giữ cả end/revocation. Windows, Node 26.12.1, pnpm 11.5.2; MongoDB 8.2.6 replica set tạm trên loopback. Không thay staging, env hoặc schema/index ứng dụng.

## Kiểm tra

| Phần                     | Kết quả                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry và matching mới | 40 test mới: sáu scope M1, stale revision/incarnation/ticket, pending Router/DB, peer còn quyền, cleanup lỗi, replay/cap/TTL, reservation host, cohort M1 và callback khác generation |
| Test thường              | 627 test, 40 file đạt                                                                                                                                                                 |
| DB integration           | 141 test, 10 file đạt, gồm ba ca mới, trong đó hai ca nối registry → M3 transport service → native mediasoup                                                                          |
| Check repo               | Các bước tương đương pnpm check qua entrypoint Node: harness, format, lint, typecheck contracts/server/web và build đạt. Harness 54 đạt, 1 ca symlink bỏ qua trên Windows             |
| Media smoke              | Native worker/Router khởi động với Opus/VP8                                                                                                                                           |

## Hai ca native media

1. Tạo WebRtcTransport thật qua M3 service và ACK create thành công. Thu AUTH_SESSION của owner; transport đóng, Router chung và context của peer khác vẫn còn.
2. Tạo WebRtcTransport thật nhưng giữ response native create. Thu AUTH_SESSION trong lúc chờ; cleanup xác nhận quyền/pending đã thu, cleanupPending=true. Thả kết quả: client không nhận ACK thành công, native transport được đóng. Không dừng Router của peer còn quyền.

Các ca dùng MongoDB repository, coordinator, registry, M3 transport service và native Router/transport thật. Authority M1 và cleanup messaging/board là fixture; chưa kiểm auth logout/ACL publisher production hoặc media browser.

Ca mới dùng MongoDB thật: A reserve host, B join trước; login mới của A đến trước thông báo revoke vẫn vào MEMBER và host pointer null, dù repository trả lại participant metadata đã reserve. Fixture kiểm login mới và fence M1 mất tính liên tục trước/sau DB await; không công bố host cũ. Hai ca membershipRevision/channelRevision tăng kiểm cả continuity hợp lệ giữ HOST và revoke/regrant gap chỉ nhận MEMBER; replay không ghi DB lần hai.

Ca ghép end/revocation dùng cùng cleanup adapters và coordinator: end đang chờ messaging thì AUTH_SESSION bị thu; end chỉ gọi begin/complete một lần, kết thúc không còn ownership và replay từ auth cũ bị từ chối.

## Giới hạn

- Chưa mount registry MAIN/revocation publisher vào app production. M1 phải cài fence bền theo auth/access trước gọi cổng; cache 60 giây không thay nguồn quyền M1.
- USER_AUTH_SESSIONS dùng cohort M1 đã commit theo operation/revision qua port đồng bộ; lookup lỗi không fallback sang sessions hiện tại. M1 vẫn chịu trách nhiệm revoke authSession chưa có mặt trong registry.
- Ca ABA sửa generation dưới coordinator để kiểm callback cũ; chưa là implementation reconnect. Kế vị host/phiên rỗng và metadata leave/end tiếp tục theo lifecycle.
- Chưa kiểm mic/camera/audio thật, TURN hoặc hai mạng. Native transport close không chứng minh cuộc gọi tích hợp hoàn tất.
- MongoDB baseline 8.0.16 và Docker cần CI xác nhận; local dùng 8.2.6. Web build còn cảnh báo chunk trên 500 kB.

Xem [contract thu quyền](../contracts/main-revocation.md).
