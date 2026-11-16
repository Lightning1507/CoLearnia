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

### Gửi và đọc tin nhắn TEXT (SCRUM-42)

REST dùng `POST /api/v1/channels/:channelId/messages` để gửi và `GET` cùng đường dẫn để đọc lịch sử. Socket.IO dùng `message.send` với ACK theo contract. REST POST và kết nối socket cần CSRF gắn với phiên. Hai transport chia sẻ khóa retry và kiểm quyền nội dung TEXT qua cùng service.

Để chạy trên môi trường riêng, cần `SESSION_SECRET`, các collection/index của auth/Workspace và hai index trong [manifest tin nhắn](../../apps/server/src/messaging/text-message.ts). Server chỉ kiểm index lúc khởi động. Tạo index theo [quy trình preflight](mongodb-transactions.md#kiểm-db-và-indexmigration-trên-môi-trường-riêng), rồi khởi động lại.

`MESSAGING_BUDGET_JSON` nhận cấu hình theo [schema budget](../../apps/server/src/messaging/budget.ts). Điền `handlers.text` cho gửi và `handlers.history` cho đọc. Handler thiếu budget hoặc chưa qua preflight trả 503. Phần giới hạn pool và chờ kết nối do các biến `MONGO_*` của server quản lý. Dùng budget trong [fixture tích hợp](../../apps/server/test/text-transport.integration.ts) để tái lập kiểm thử trên DB riêng. Môi trường dùng chung cần budget được nhóm review cùng media và tải kết hợp trước khi bật. [Quy tắc budget](../contracts/messaging-access.md#7-giới-hạn-xử-lý-để-hệ-thống-không-bị-quá-tải)

Phạm vi SCRUM-42 là tin gốc và lịch sử thường. Feed realtime, subscribe và snapshot/catch-up thuộc SCRUM-43. Một timeout hoặc mất ACK có thể xảy ra sau commit. Client retry với cùng `clientMessageId` và nội dung để lấy kết quả đã lưu.

Budget của history giữ chỗ theo số dòng yêu cầu, gồm một dòng đọc thêm để xác định trang kế. Ước lượng bao gồm BSON, DTO và JSON, nên một trang lớn có thể trả `SERVER_BUSY` nếu không đủ byte. Giảm `limit` hoặc cân lại `handlers.history.processBytes` và `process.bytes` khi review cấu hình. Budget test dùng trang mặc định 30 dòng.

Các truy vấn TEXT dùng phần thời gian còn lại và tín hiệu hủy của driver. Transaction chừa trước thời gian cho commit và kiểm đủ phần đó trước khi gửi commit. Driver hiện dùng giới hạn mạng chung cho commit và cleanup, nên mất kết nối vẫn có thể kéo dài hơn deadline dự kiến. Khi kết quả commit chưa rõ, giữ nguyên mã gửi và nội dung khi retry.

#### Kiểm commit và cleanup chậm của SCRUM-42

Trên MongoDB 8.0.16 replica set test riêng, bật `enableTestCommands=1`, đặt `COLEARNIA_TEST_DB_FAILPOINTS=1` rồi chạy `pnpm exec vitest run --reporter=verbose --config vitest.database.config.ts apps/server/test/text-transport.integration.ts`. Không bật failpoint trên DB dùng chung.

Với `executionMs=650`, hai ca giữ lệnh commit hoặc abort 2.000 ms xác nhận khóa Workspace và slot vẫn bận tại mốc 900 ms. Đây là phép đo giới hạn hiện tại, chưa đạt điều kiện nghiệm thu deadline. Sau khi thao tác kết thúc, khóa và slot được trả, retry cùng `clientMessageId` chỉ có một tin. Ca riêng mô phỏng mất ACK sau khi MongoDB đã commit kiểm rằng retry trả `existing` với cùng sequence.

M1 và M2 cần chốt hỗ trợ timeout mạng cho commit và abort/endSession, hoặc thống nhất budget riêng cho giai đoạn xác minh commit và thu hồi quyền. Driver MongoDB 7.8.0 ghi `timeoutMS` của commit/abort/withTransaction không có hiệu lực. Số đo trên chưa cho phép coi tổng thời gian giữ khóa là 650 ms. Giữ khóa và slot đến khi lệnh kết thúc để thao tác cũ không vượt qua bước thu quyền.

#### Đề xuất M2 cho deadline transaction SCRUM-42

Trạng thái: chờ M1/M4 review. Các số dưới đây là cấu hình thử nghiệm đề xuất, chưa áp vào mặc định runtime. Dùng cùng MongoClient, pool và coordinator của ứng dụng.

| Giai đoạn                                    | Mức đề xuất để đo                                                                                          | Cách áp dụng và giới hạn                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chờ vào gate và xử lý truy vấn               | Tách đo thời gian xếp hàng. Dùng 650 ms làm budget truy vấn thử nghiệm                                     | Dùng deadline monotonic chung cho các lệnh ACL, lookup và write. Truyền `maxTimeMS` và `AbortSignal` vào lệnh có hỗ trợ. Dừng trước khi bắt đầu lệnh mới hoặc bước commit nếu hết thời gian.                                                                                                                                                                                      |
| Lựa chọn server, checkout, kết nối, chờ mạng | 200 / 150 / 250 / 400 ms mỗi lần thử                                                                       | Thử trên client dùng chung với `serverSelectionTimeoutMS`, `waitQueueTimeoutMS`, `connectTimeoutMS` và `socketTimeoutMS`. Ba giá trị đầu giới hạn các bước tương ứng. Socket timeout giới hạn chờ thao tác socket. Tổng 1.000 ms là ước lượng bảo thủ cho ca lỗi thử nghiệm, chưa là giới hạn cứng của toàn lệnh.                                                                 |
| Commit, abort và endSession                  | Tối đa một lần gọi commit của ứng dụng cho mỗi transaction. Tính cả hai lượt abort driver có thể thực hiện | Thử `maxAdaptiveRetries: 0` trên client chung để đường commit của 7.8.0 giới hạn một lần thử. Đường abort có thể gọi lại một lần kể cả khi đặt option này. Với TEXT, đề xuất tối đa một lượt chạy transaction cho mỗi giai đoạn ACL hoặc ghi trong cùng request. `endSession()` có thể gọi abort nếu transaction vẫn active. Tính đường này vào cleanup và đo số command thực tế. |
| Tổng giữ khóa và slot                        | Mốc thử 5.000 ms kể từ khi giữ khóa đầu tiên. Slot tính thêm lookup và chờ gate trước đó                   | Đường send có hai transaction theo thứ tự: đọc ACL và ghi tin. Mô hình thử giữ chỗ cho tối đa hai lượt commit và hai lượt abort, cộng 650 ms truy vấn và 350 ms dự phòng. Chỉ dùng con số sau khi trace số lần thử, thời gian xếp hàng và các kết quả cleanup xác nhận giả định.                                                                                                  |

Trên 7.8.0, `maxCommitTimeMS` và `wtimeoutMS` giới hạn xử lý phía MongoDB và chờ write concern tương ứng. `timeoutMS` của `commitTransaction`, `abortTransaction` và `withTransaction` không có hiệu lực. `endSession()` dọn trạng thái phía client và có thể đợi abort. Giá trị hiện tại của `MONGO_SERVER_SELECTION_TIMEOUT_MS`, `MONGO_WAIT_QUEUE_TIMEOUT_MS`, `MONGO_SOCKET_TIMEOUT_MS` là 5.000, 5.000 và 15.000 ms theo mặc định. `connectTimeoutMS` đặt 5.000 ms trong lớp DB. Cấu hình thử sẽ cần expose connect timeout và giới hạn retry nếu M1 chốt, đồng thời kiểm tác động lên auth, tạo kênh và LIVE trước khi thay đổi các giá trị dùng chung. [MongoDB Node driver 7.8.0: commit và abort](https://github.com/mongodb/node-mongodb-native/blob/v7.8.0/src/sessions.ts) · [MongoDB: giới hạn theo giai đoạn](https://www.mongodb.com/docs/drivers/node/v6.x/connect/connection-options/csot/)

M1/M4 cần chốt riêng thời gian từ lúc yêu cầu thu quyền đến lúc lấy được khóa và cài deny. Coordinator mặc định chờ 5.000 ms. Mốc thử giữ khóa 5.000 ms đã dùng hết khoảng chờ đó ngay cả khi chỉ có một thao tác đứng trước. Mốc cleanup adapter 2.000 ms bắt đầu sau bước cài deny nên cần đo riêng. Đề xuất thử mốc vào gate của revoke 6.000 ms với tối đa một thao tác TEXT đang giữ khóa và revoke được phục vụ kế tiếp. Nếu hàng đợi chung có thể có thêm việc đi trước, phải đo và tính các lượt đó vào budget hoặc review cơ chế ưu tiên revoke. Việc tăng timeout chung không tự bảo đảm thứ tự này.

Khi vượt budget truy vấn, ngừng phát lệnh mới và kết thúc transaction có kiểm soát. Nếu kết quả commit chưa rõ, trả `DEPENDENCY_UNAVAILABLE` và kiểm lại bằng cùng `clientMessageId`. Khóa và slot chỉ được trả sau khi đường DB hiện tại đã kết thúc, hoặc khi có cơ chế bảo vệ được review để thao tác cũ không vượt quyền. Nếu trace cho thấy driver hiện tại không đáp ứng mốc thu quyền, ưu tiên đánh giá bản driver tương thích có API công khai và đã xác minh deadline commit/cleanup. Nếu chưa có, M1/M4 cần review phương án gắn revision quyền với thao tác ghi trong DB và cơ chế đối chiếu commit trước khi thử thay đổi vòng đời khóa. Giữ P2 mở trong cả hai trường hợp cho đến khi có số đo nghiệm thu.

Ca hiện tại tại head `98f2dea` cho thấy với failpoint 2.000 ms, commit/abort cùng vượt 650 ms và slot/gate còn bận ở mốc 900 ms. Kết quả 27/27 bao gồm ca mô phỏng mất ACK trả về tin cũ khi retry. Bộ nghiệm thu sau khi chốt phải đo riêng thời gian request, giữ từng gate và slot, từ lúc yêu cầu revoke đến khi deny có hiệu lực, và số lần thử của commit/abort. Chạy với commit chậm/mất ACK, abort/cleanup chậm, pool đầy, server selection chậm và một lượt thu quyền thật đang chờ. Kiểm retry đúng một tin với sequence ổn định, xác nhận lượt gửi sau deny bị từ chối và chạy các luồng dùng pool chung. Chỉ đóng P2 khi toàn bộ số đo nằm trong mốc đã review.
