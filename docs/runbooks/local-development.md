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

## Đăng ký tài khoản

Tạo `SESSION_SECRET` bằng `openssl rand -hex 32` và lưu riêng trong cấu hình server. Biến này bật các endpoint auth. Đặt `APP_ORIGIN` khớp địa chỉ web dùng để kiểm, gồm scheme, host và port nếu có. Dùng HTTPS khi kiểm bằng trình duyệt vì cookie có cờ `Secure`. `AUTH_TTL_SECONDS` mặc định 604800 giây, tối thiểu 60 giây. Giữ `AUTH_TRUST_PROXY=false` nếu truy cập server trực tiếp. Chỉ bật khi server nhận HTTP qua đúng một proxy tin cậy.

Đăng ký dùng các index trong [manifest auth](../../apps/server/src/auth/models.ts). Để chuẩn bị **DB local mới, riêng cho thử nghiệm**, chạy các lệnh dưới đây trong `mongosh` đã kết nối vào replica set local và chọn đúng DB khớp `MONGO_URI`. Tạo index trên DB đã có dữ liệu theo [quy trình preflight và migration](mongodb-transactions.md#kiểm-db-và-indexmigration-trên-môi-trường-riêng).

```javascript
db.users.createIndex({ emailNormalized: 1 }, { name: 'uq_user_email', unique: true });
db.authSessions.createIndex({ tokenHash: 1 }, { name: 'uq_auth_token', unique: true });
db.authSessions.createIndex({ expiresAt: 1 }, { name: 'ttl_auth_expiry', expireAfterSeconds: 0 });
db.authSessions.createIndex({ userId: 1, revokedAt: 1 }, { name: 'ix_auth_user' });
```

Khi cấu hình `SESSION_SECRET`, server kiểm các index auth lúc khởi động. Nếu preflight thất bại, readiness, đăng ký và tra phiên với cookie đúng định dạng trả 503. Xem log đã lọc và restart sau khi xử lý migration. Lệnh `pnpm test:database` tạo các fixture trong DB test riêng.

Để thử khôi phục phiên, gọi GET `/api/v1/auth/csrf` rồi POST `/api/v1/auth/register` với token trong header `X-CSRF-Token`. Sau khi đăng ký thành công, tải lại trang và gọi GET `/api/v1/auth/me` bằng cookie của trình duyệt. Response trả chính hồ sơ vừa đăng ký và cùng hạn phiên.

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

## Chuẩn bị staging

Xem [checklist cấu hình staging SCRUM-54](staging-configuration.md) để đối chiếu HTTPS, địa chỉ web/media, cổng, MongoDB và quyền cần cấp. Compose local dành cho phát triển trên máy cá nhân.

## Profile capacity

Theo [capacity](../capacity.md), local start/health hoặc media smoke không chứng minh 25/50 người. Các profile cần DB test/dữ liệu cũ, config pool/queue/quota hữu hạn và media thật trên hạ tầng ghi rõ; không đo 50 tab trên một laptop rồi suy capacity server. Một VPS/DB node là phương án thử, chưa là HA. Đợt đồng bộ tài liệu không start/stop container hoặc chạy migration.

### Private R2 (SCRUM-52)

Use a team-provided private test bucket with both the R2.dev URL and public custom domains disabled. Issue an Object Read & Write token limited to that test bucket. Configure R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY from the server-only secret store or a local ignored environment file. The adapter targets the standard R2 S3 endpoint.

From the repository root, run:

```powershell
pnpm --filter @colearnia/server exec tsx --env-file-if-exists=../../.env scripts/r2-smoke.ts
```

The smoke writes a randomly named disposable object, compares downloaded bytes, checks that anonymous HEAD is denied while the object exists, deletes it and verifies that a signed read then reports not found. Check bucket-level public access in the Cloudflare dashboard as well. An anonymous request to the S3 endpoint cannot verify that separate public domains are disabled.

Use one adapter instance for file and video consumers. Both use the same bucket and credentials, with server-generated object keys. Single PUT requires a known byte length. Reads stream into a caller-provided writable, and the adapter owns both supplied streams until the operation settles. R2_TIMEOUT_MS defaults to 15000 and bounds the complete operation, including streaming the response. Callers can supply an AbortSignal. Failed or aborted writes/deletes can have an unknown remote result, so follow-up consumers must reconcile the same key before publishing or releasing quota. Multipart lifecycle, video range reads and metadata/ACL integration belong to the consumer tasks.

Upload nguồn Readable dùng pipeline qua PassThrough với backpressure, rồi truyền stream đó vào SDK. Nếu nguồn hoặc request lỗi, adapter hủy signal dùng chung cho upload và chờ cả pipeline lẫn request kết thúc. Lỗi I/O nguồn trả UNAVAILABLE; caller hủy và deadline vẫn được phân loại ABORTED/TIMEOUT. [Node pipeline](https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-callback)

Fixture local gồm bảy ca. Ca nguồn encoder phát một phần rồi lỗi xác nhận put reject, nguồn bị destroy và HTTP request đóng với complete=false, socketDestroyed=true, bytes>0. Cùng tiến trình tiếp tục upload/xóa thành công. Ca caller hủy upload xác nhận ABORTED và đóng request; các ca timeout upload/download vẫn kiểm TIMEOUT.

Nghiệm thu R2 thật còn chờ người có quyền bucket. Lần chạy smoke sau sửa dừng trước I/O vì thiếu R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID và R2_SECRET_ACCESS_KEY. Người có quyền cần chạy lệnh trên với cấu hình server-only, ghi lại kết quả đã lọc của upload/read/delete/not-found, rồi xác nhận trong dashboard rằng r2.dev và public custom domains đều tắt. Chưa có bằng chứng nghiệm thu dịch vụ thật trong lượt này.

#### Bàn giao nghiệm thu dịch vụ thật sau review PR #123

M1 đã xác nhận bản sửa lỗi nguồn upload ở `b2a9532` và adapter tại `4e2a041` phù hợp với phạm vi fixture. Chưa có bằng chứng nghiệm thu R2 thật; SCRUM-52 còn mở, không coi adapter/CI đạt là đủ đóng task. Nếu muốn merge riêng adapter trước, cần M1 chốt lại phạm vi bàn giao trên PR.

Kiểm tra ngày 18/11/2026 tại `4e2a041`: chạy lại lệnh smoke ở trên, exit 1 trước I/O vì thiếu `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Không có object thử được tạo trong lượt này. Chưa tìm thấy file cấu hình tại các checkout local/WSL đã kiểm; SSH tới staging timeout nên chưa kiểm được server. Các kết quả này không xác nhận bucket chưa tồn tại trong tài khoản Cloudflare.

Người có quyền bucket thử nghiệm chạy smoke tại SHA đề nghị nghiệm thu và ghi kết quả đã lọc, không đưa credential vào log/PR. M2 tổng hợp evidence, M1 review. Giữ đủ các bước:

1. Ghi SHA (`git rev-parse HEAD`), thời điểm, lệnh smoke và exit code.
2. Upload object thử với key ngẫu nhiên; đọc có chữ ký và so sánh đúng byte.
3. HEAD ẩn danh bị từ chối (401/403) khi object còn tồn tại.
4. Delete rồi đọc có chữ ký trả `NOT_FOUND`; xác nhận object thử đã dọn. Nếu cleanup lỗi, dùng đúng key script báo để đối soát, không khẳng định đã xóa.
5. Xác nhận riêng trên dashboard cùng bucket rằng r2.dev và public custom domains đều tắt. PASS tại endpoint S3 không thay bước này.

Chỉ báo smoke đạt sau đầy đủ chuỗi I/O. Thiếu cấu hình hoặc chưa xác nhận dashboard thì giữ bước nghiệm thu mở. Multipart/Range và metadata/ACL consumer vẫn ngoài phạm vi PR này.

#### Phạm vi ngoại lệ audit ở PR #123

[Issue #127](https://github.com/Lightning1507/CoLearnia/issues/127) ban đầu ghi nhận ngoại lệ tạm thời cho [PR #117](https://github.com/Lightning1507/CoLearnia/pull/117). Người dùng cũng đã yêu cầu áp dụng cùng ngoại lệ cho [PR #123](https://github.com/Lightning1507/CoLearnia/pull/123); commit `4e2a041` chỉ thêm cùng `GHSA-fc5q-39xc-vjpf` vào `auditConfig.ignoreGhsas` của workspace, không thêm advisory khác. Mốc rà soát vẫn là 25/11/2026 và điều kiện gỡ vẫn theo issue #127. CI/audit đạt với ngoại lệ không có nghĩa advisory đã được vá. Nghiệm thu R2 và việc gỡ ngoại lệ là hai việc độc lập.
