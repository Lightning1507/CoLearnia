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

#### Kết quả thử cấu hình chung SCRUM-42

Profile `COLEARNIA_TEST_DB_PROFILE=scrum42` chỉ được đọc bởi fixture test. Mỗi suite dùng client/pool riêng của suite. Trong một suite, auth, repo, TEXT và thu quyền dùng chung client và coordinator theo cách khởi tạo của ca. Mặc định boot server và thứ tự FIFO giữ nguyên. Suite TEXT dùng pool size 2 để tạo ca nghẽn có thể tái lập. Các suite auth, Workspace và kênh chạy logic tích hợp trong tiến trình với profile thử. Các ca Workspace khởi chạy `main.ts` bằng tiến trình con vẫn dùng cấu hình mặc định.

```powershell
docker run --rm -d --name colearnia-pr117-trial -p 127.0.0.1:27242:27017 mongo:8.0.16 --replSet rs0 --bind_ip_all --setParameter enableTestCommands=1 --setParameter transactionLifetimeLimitSeconds=5
docker exec colearnia-pr117-trial mongosh --quiet --eval 'rs.initiate()'
$env:COLEARNIA_DB_TEST_PORT = '27242'
$env:COLEARNIA_TEST_DB_FAILPOINTS = '1'
$env:COLEARNIA_TEST_DB_PROFILE = 'scrum42'
pnpm --filter @colearnia/contracts build
pnpm exec vitest run --pool=threads --reporter=verbose --config vitest.database.config.ts apps/server/test/text-transport.integration.ts apps/server/test/scrum42-selection.integration.ts apps/server/test/registration.integration.ts apps/server/test/create-workspace.integration.ts apps/server/test/create-channel.integration.ts
docker stop colearnia-pr117-trial
```

Dùng replica set tạm và chỉ bind cổng host trên loopback. `transactionLifetimeLimitSeconds=5` chỉ rút thời gian chờ thu dọn transaction phía server trong fixture. Kết quả retry sau timeout không đại diện cho thời gian DB dùng chung. Log `SCRUM42_TRACE` ghi timestamp tương đối, sự kiện checkout, từng lệnh Mongo, chờ/giữ từng gate, lookup, endSession và trả slot. Log không chứa ID hay payload.

| Ca                       | Kết quả một lượt đo                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chặn commit ghi 2.000 ms | Lookup xong ở 8,2 ms. User và Workspace được lấy ở 8,2 ms và cùng nhả ở 513,9 ms, tức giữ 505,7 ms. Slot giữ 513,7 ms. Có 9 find, 1 update, 1 insert và 2 commit (ACL thành công và commit ghi timeout). Commit ghi chờ 404,7 ms, endSession sau đó dưới 1 ms.                                                                               |
| Chặn abort 2.000 ms      | Lookup xong ở 3,3 ms, hai gate giữ khoảng 462,4 ms, slot giữ 465,7 ms. Có 9 find, 1 update, 1 commit ACL, 2 abort. Abort đầu timeout sau 421,8 ms. Driver gửi abort thứ hai và nhận phản hồi sau 3,9 ms. endSession gồm cleanup mất 435 ms.                                                                                                  |
| Mất ACK sau commit       | Lỗi ACK được mô phỏng sau commit thật. Retry trả tin cũ, sequence 1 và đúng một bản ghi.                                                                                                                                                                                                                                                     |
| Pool đầy                 | Hai lệnh find chiếm hai kết nối. Lookup TEXT không checkout được trong 151,2 ms, slot nhả sau 160,9 ms. Không lấy khóa Workspace. Lượt gửi sau khi pool phục hồi thành công.                                                                                                                                                                 |
| Server selection         | Kết nối thử riêng tới seed loopback không hoàn tất handshake trả lỗi sau 224 ms. Tiến trình test đó chỉ tạo một client.                                                                                                                                                                                                                      |
| Revoke với FIFO          | Thu hồi session dùng service M1 và coordinator thật. Một lượt đang giữ gate, ba lượt đứng trước revoke và ba lượt gửi TEXT tiếp tục đến sau đó. Deny quan sát được sau 224 ms. Ba lượt gửi đang chờ và một lượt gửi sau deny đều trả `AUTH_REQUIRED`. Ca này đo deny và từ chối gửi. Phần adapter cleanup M2/M4 chưa được gắn trong fixture. |

Kết quả profile thử là 108 test đạt trên 5 suite, 3 skip. Hai ca skip là phép đo baseline của cấu hình cũ. Ca failpoint Workspace còn lại dùng cờ opt-in riêng chưa bật ở lượt này. Suite kiểm auth, tạo Workspace/kênh, phát lại yêu cầu, rollback và luồng Workspace/kênh hỗn hợp. Lượt thăm dò đầu với lifetime mặc định gặp `WriteConflict` khi retry ngay và timeout ở thao tác dọn DB test. Với lifetime fixture 5 giây, sau khi chờ failpoint tắt, cùng mã gửi gặp 5 lần lỗi tạm rồi ghi được sau khoảng 4.019 ms kể từ lúc bắt đầu thử lại. Lượt abort cho phép ghi lại sau 59 ms. Cả hai cuối cùng có đúng một bản ghi cho mỗi mã và `commitSeq` tăng đúng hai lần.

**P2 còn mở.** Timeout của client đã giảm thời gian giữ gate/slot trong các mẫu đã đo, nhưng trace ghi nhận MongoDB vẫn giữ transaction sau khi app trả timeout. Chưa xác nhận mốc cứng hoặc tính an toàn cho thu quyền đồng thời với commit chưa rõ. M1/M4 cần quyết định tiếp tục thử cơ chế liên kết revision quyền với thao tác ghi và thu hồi, hoặc thử driver có API deadline phù hợp. Trước khi chốt, phải chạy ca revoke cạnh tranh ngay trong lúc commit mất phản hồi, kết hợp tải auth/Workspace/kênh trong cùng tiến trình và kiểm môi trường nhiều node. Các số trên là bằng chứng đo cấu hình thử, chưa là nghiệm thu.
