# Chạy và kiểm tra local

## Node/pnpm

Project nhắm Node 26.12.1 và pnpm 11.5.2. `.node-version` phục vụ version manager; `devEngines.runtime` phục vụ pnpm tải/chạy đúng runtime khi máy dùng phiên bản khác. Sau install, kiểm bằng `pnpm exec node --version` và `pnpm doctor`.

Cài pnpm bằng `npm install --global pnpm@11.5.2`; CI và Docker dùng cùng lệnh này. Node 26 không tích hợp Corepack nên không chạy `corepack enable`/`corepack prepare`. Nếu npm báo `EEXIST` do shim Corepack từ cài đặt cũ, chạy `corepack disable` rồi thử lại.

Khi nâng runtime, cập nhật đồng bộ `.node-version`, `engines.node`, `devEngines.runtime`, `@types/node`, lockfile và cả build/runtime image trong hai Dockerfile. Chạy `pnpm check`, `pnpm media:smoke` và Docker smoke trước khi merge; một PR chỉ nâng image không đủ chứng minh cả project tương thích.

## MongoDB

Khởi động Docker Desktop Linux engine trước `pnpm infra:up`. `mongo-init` khởi tạo rs0 và chờ primary. URI local dùng `directConnection=true` vì replica member được đăng ký bằng hostname Compose `mongo:27017`; container app cũng dùng hostname này.

```sh
docker compose ps -a
docker compose logs mongo-init
docker compose exec mongo mongosh --quiet --eval 'db.hello()'
```

Cấu hình local hiện tại ở [docker-compose.yml](../../docker-compose.yml): image mongo:8.0.16, database colearnia, replica set rs0 một node và named volume mongo-data tại /data/db. mongo-init chạy script chỉ để khởi tạo rs0/chờ primary, không tạo collection nghiệp vụ. Có thể dùng Compass kết nối mongodb://127.0.0.1:27017/colearnia?replicaSet=rs0&directConnection=true sau khi container sẵn sàng. Container được recreate thông thường dùng lại volume; volume không thay backup, không tự chịu được mất host. Đừng dùng down -v/reset/seed chỉ để kiểm kết nối.

Mongo local không có auth, chỉ bind `127.0.0.1`; cấu hình này dành cho phát triển. Xóa volume là mất dữ liệu. Chưa có migrations/schema nghiệp vụ: A bổ sung theo feature, không bật readiness nghiệp vụ chỉ vì kết nối database được. Connection/transaction M1/M2, cấu hình pool/timeout và lệnh kiểm DB riêng xem [runbook SCRUM-15](mongodb-transactions.md).

## Media

Chạy `pnpm media:smoke` để kiểm native worker. Để khởi động WebRtcServer cùng app, đặt `MEDIA_ENABLED=true`, chọn cổng trống và restart `pnpm dev`.

Nếu native worker không tải được trên Windows: xem stderr của media smoke; build theo yêu cầu C++/Python của mediasoup hoặc dùng Linux/Docker cho PoC. Không fake trạng thái media connected. Staging phải thử trên Linux ngay tuần 1.

## Kết nối web → API

Vite proxy `/api`, `/health`, `/socket.io` tới local server. Production build dùng đường dẫn tương đối; Nginx proxy cùng origin. Chỉ biến bắt đầu `VITE_` mới được đưa vào frontend; tuyệt đối không dùng prefix này cho secret.

## Lệnh kiểm tra

```sh
pnpm check
pnpm media:smoke
pnpm infra:config
```

`/health/live` chỉ cho biết process nhận HTTP. `/health/ready` trả 503 khi database/worker chưa sẵn sàng; không đổi thành 200 để giao diện đẹp hơn. Socket auth chưa triển khai thì mọi handshake đều nhận `AUTH_REQUIRED`.

## Staging chưa cấu hình

Trước khi mở Internet: TLS, `APP_ORIGIN`, database authentication, secret thực, public announced IP, media/TURN ports, private storage, quota, backup và bảng kiểm quyền nhóm. Không dùng nguyên profile local public.

## Profile capacity

Theo [capacity](../capacity.md), local start/health hoặc media smoke không chứng minh 25/50 người. Các profile cần DB test/dữ liệu cũ, config pool/queue/quota hữu hạn và media thật trên hạ tầng ghi rõ; không đo 50 tab trên một laptop rồi suy capacity server. Một VPS/DB node là phương án thử, chưa là HA. Đợt đồng bộ tài liệu không start/stop container hoặc chạy migration.
