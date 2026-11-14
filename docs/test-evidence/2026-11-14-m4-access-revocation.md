# M4 — shared deny, cohort logout-all và retry cleanup

Ngày kiểm: 14/11/2026. Nguồn yêu cầu: PR #95 và issue #97.
Base: main `22c074d`.

## Phạm vi

- MAIN nhận ledger M1 bắt buộc, kiểm dùng cùng coordinator; kiểm shared deny dưới
  Workspace gate trước `isAuthorityCurrent`, kể cả access stamp đã commit.
- Logout-all lấy đúng cohort M1 đã chụp, không query lại các phiên đang có khi nhận event.
- Cùng operation incomplete được cleanup tiếp với token/target/epoch/generation ban đầu.
  Retry đồng thời dùng chung promise; không lặp adapter đã xác nhận, không mở I/O mới
  khi promise cũ còn chạy. Cùng ID khác payload bị từ chối.
- Factory application dùng singleton đang có và bind M2/LIVE một lần; chưa mount MAIN
  vào `main.ts` khi thiếu các port runtime thật.

## Các ca đã kiểm trực tiếp

- Lỗi board rồi khắc phục: retry hoàn tất và bỏ ownership cũ; media/messaging không gọi lại.
- Retry đồng thời và replay: giữ cùng request cleanup, từ chối payload khác.
- Adapter quá hạn còn chạy: retry chờ I/O cũ, không gọi adapter lần hai.
- Lỗi synchronous media và lỗi lấy Workspace gate: retry cùng operation tiếp tục được.
- M1 đã install deny, chưa gửi LIVE notification: ticket cũ không được join/ghi metadata.
- Logout-all từ cohort M1 thật: login mới được tạo trước khi LIVE nhận event vẫn sử dụng được.
- MongoDB replica set + mediasoup thật + transport signaling M3: board lỗi khiến M1 giữ
  deny và không gọi persistence commit; retry cùng operation hoàn tất rồi mới commit.
  Có cả native create đang chờ. Login/generation mới tạo transport mới trước callback
  cũ kết thúc; callback trễ và replay không đóng transport mới hoặc Router dùng chung.
- Factory bind đúng singleton; bind lần hai bị từ chối, không thay adapter đang hoạt động.

## Kiểm tra toàn bộ

- Chuỗi kiểm tương đương `pnpm check`: gọi trực tiếp CLI qua Node 26.12.1,
  Vitest một worker. Harness 54 đạt/1 bỏ qua (symlink Windows), kiểm links/runtime
  đạt; Prettier, ESLint, contracts/server/web typecheck và server/web build đạt.
  Unit: **799/799**, 48 file. Web build còn cảnh báo bundle lớn hơn 500 kB.
- DB suite: **210 đạt, 1 bỏ qua**, 12 file, MongoDB 8.2.6 replica set `rs0`
  riêng trên loopback. Ca bỏ qua là failpoint của create Workspace, yêu cầu
  `COLEARNIA_DB_TEST_FAILPOINTS=1`; không thay cấu hình DB ứng dụng.
  Riêng MAIN registry/native media: **16/16**.
- `node_modules/tsx/dist/cli.mjs scripts/media-smoke.ts` từ server:
  mediasoup worker/Router với Opus/VP8 khởi tạo thành công.
- `git diff --check`: đạt. MongoDB thử nghiệm đã được dừng sau kiểm tra.

## Giới hạn

MongoDB và mediasoup/transport signaling trong kiểm tích hợp là thật. Authority,
persistence thu quyền, messaging và board là fixture; chưa kiểm CRUD thu quyền từ
endpoint thật, chat/tệp/board runtime thật hoặc hai trình duyệt trên staging.
Không dùng kết quả này để nghiệm thu toàn bộ runtime của issue #97/SCRUM-88.
Chưa có durable recovery qua crash hoặc kiểm tải 25/50 người. Các giới hạn ledger,
foreground/replay budget và thứ tự khóa giữ theo runbook hiện hành.
