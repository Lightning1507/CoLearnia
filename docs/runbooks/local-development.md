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

#### SCRUM-42 — Tái hiện ghi sau deny với lifetime mặc định

Ca opt-in dưới đây ghi lại lỗi hiện tại. Test đạt khi tái hiện được ghi xuất hiện sau deny. Chỉ bật failpoint trên replica set test riêng.

```powershell
docker run --rm -d --name colearnia-pr117-default-race -p 127.0.0.1:27242:27017 mongo:8.0.16 --replSet rs0 --bind_ip_all --setParameter enableTestCommands=1
docker exec colearnia-pr117-default-race mongosh --quiet --eval 'rs.initiate()'
$env:COLEARNIA_DB_TEST_PORT = '27242'
$env:COLEARNIA_TEST_DB_FAILPOINTS = '1'
$env:COLEARNIA_TEST_DB_PROFILE = 'scrum42'
$env:COLEARNIA_TEST_REVOKE_COMMIT_RACE = '1'
pnpm --filter @colearnia/contracts build
pnpm exec vitest run --pool=threads --reporter=verbose --config vitest.database.config.ts apps/server/test/text-transport.integration.ts -t 'reproduces a write appearing'
docker stop colearnia-pr117-default-race
```

Test xác nhận lifetime là 60 giây, chặn lệnh commit ghi 900 ms sau khi ACL đã commit và gọi service revoke M1 khi lệnh ghi đang chờ. Profile thử có socket timeout 400 ms. Trace ghi thời điểm gửi commit, nhả gate/slot và quan sát deny. Test đọc majority ngay sau deny, đọc lại đến khi thấy tin rồi xác nhận số bản ghi và sequence lần cuối sau khoảng 65 giây. Retry cùng mã và gửi mã mới sau deny đều phải bị từ chối. Deny trong fixture là barrier của service M1. Fixture chưa gắn adapter cleanup M2/M4. Kết quả này tách khỏi ca chẩn đoán lifetime 5 giây phía trên.

Lượt chạy lifetime 60 giây: commit ghi bắt đầu ở 85,3 ms, yêu cầu revoke ở 100,4 ms, socket trả lỗi ở 508,9 ms, gate và slot được nhả ở 510,0 ms. Deny được quan sát ở 511 ms. Đọc majority ở 554 và 808 ms chưa thấy tin. Lần đọc 1.073 ms thấy đúng một tin. Đọc cuối ở 65.023 ms vẫn là một tin và sequence 1. Hai lượt gửi sau deny đều trả lỗi xác thực. Ca opt-in này đạt 1/1 theo tiêu chí **tái hiện lỗi**. Lượt riêng trên mongod lifetime mặc định và cấu hình client mặc định có 27 test đạt, 4 skip (các ca chỉ bật khi dùng profile thử hoặc probe).

#### Phương án bảo vệ để M1/M4 review

Đề xuất hai mốc thu quyền. Khi tiếp nhận revoke, cài **deny đang xử lý** để từ chối lượt gửi/đọc mới và khởi động thu tài nguyên. Chỉ công bố **thu quyền hoàn tất** khi giao dịch đổi quyền và hàng rào ghi đã được xác nhận bằng majority, đồng thời các adapter đã xác nhận phần thu tài nguyên. Với thao tác gửi đã bắt đầu trước pending deny, cần M1/M4 chốt việc dùng mốc durable này làm điểm phân thứ tự. Nếu yêu cầu nghiệp vụ là cấm mọi commit kể từ lúc barrier trong RAM được cài, phương án hai mốc chưa đáp ứng yêu cầu đó.

Đường gửi ghi có điều kiện lên cùng bản ghi hàng rào mà đường revoke sẽ cập nhật. Giao dịch gửi kiểm trạng thái active/revision và **thực sự thay đổi** hàng rào trước khi ghi tin và tăng sequence trong cùng transaction. Revoke chuyển trạng thái hoặc tăng revision trên những hàng rào liên quan, đồng thời ghi thay đổi quyền và ID thao tác trong cùng transaction. Với session revoke, hai đường phải chạm cùng hàng rào của AuthSession. Với Workspace, membership hay channel revoke, M1/M4 cần chốt tài liệu nào là hàng rào cho từng phạm vi và thứ tự chạm chúng. Kiểm revision bằng thao tác đọc hoặc ghi không làm thay đổi dữ liệu không tạo bảo đảm xung đột cần thiết.

Nếu giao dịch gửi lấy được thứ tự trước, tin có thể xuất hiện trước khi revoke được xác nhận. Nếu revoke lấy thứ tự trước, lượt ghi dựa trên quyền cũ phải gặp xung đột hoặc điều kiện ghi không còn khớp, rồi bị từ chối khi kiểm quyền mới. Cần kiểm thêm chi phí tranh ghi trên các hàng rào Workspace/kênh dùng chung trước khi quyết định phạm vi.

Khi commit của send chưa rõ, vẫn trả `DEPENDENCY_UNAVAILABLE` và đối chiếu bằng đúng `clientMessageId`. Khi commit của revoke chưa rõ, giữ deny đang xử lý và dùng cùng ID thao tác để tra dấu ghi durable bằng majority. Kết quả chưa tìm thấy dấu ghi chưa đủ để kết luận rollback. Không báo hoàn tất hay phát lại với ID mới khi chưa xác minh được. Theo dõi và giới hạn số thao tác chưa phân giải riêng. Khi hết dung lượng, từ chối yêu cầu mới rõ ràng. Cần review cách tính gate/slot, ngân sách fence, phục hồi sau restart và ưu tiên thu quyền trước khi đổi runtime. Không thêm client/pool hoặc thay FIFO trong lượt này.

**Ca nghiệm thu sau khi chốt thiết kế:** Giữ probe ở trên làm bằng chứng lỗi cũ. Ca nghiệm thu dùng đường revoke có persistence và cleanup đã review, quan sát pending và durable deny riêng, rồi yêu cầu số tin và sequence không tăng từ lượt cũ sau durable deny. Chạy cả thứ tự send thắng/revoke thắng, commit mất ACK, abort chậm, hàng đợi revoke và tải auth/Workspace/kênh trong cùng tiến trình/pool với lifetime mặc định. Đối chiếu thời gian giữ gate/slot và mức chờ thu quyền với budget được chốt. P2 còn mở cho tới khi ca nghiệm thu này đạt.

#### Đề xuất M2 về hàng rào AuthSession

Trạng thái: đề xuất để M1/M4 chọn thiết kế cho bản thử `AUTH_SESSION`. Hành vi production và contract hiện hành vẫn áp dụng. Ca lifetime 60 giây ở trên là bằng chứng lỗi cũ.

- **Mốc quyền.** Pending deny hiện hành chặn yêu cầu mới, fanout và cấp resource mới ngay khi được cài. Một send đã qua kiểm quyền có thể được xếp trước giao dịch revoke tại DB. Chỉ giao dịch ghi thắng thứ tự đó mới được tạo tin. Sau mốc majority-confirmed revoke, không giao dịch gửi cũ nào được tạo tin hoặc tăng sequence. Revoke trả hoàn tất sau mốc DB và cleanup đúng cohort/generation. Nhờ M1/M4 xác nhận đây là semantics nghiệp vụ. Nếu nghiệp vụ cấm ghi ngay từ lúc cài pending deny, bản thử này không giải quyết điều đó.
- **Hàng rào bản thử.** Dùng đúng document `authSessions[_id]` của phiên xác minh từ server. Với send tạo tin mới, trong transaction hiện tại, cập nhật có điều kiện theo `_id`, `userId`, `revokedAt: null`, và `expiresAt` còn hợp lệ tại lúc thực thi update. Dùng `$inc` một trường serial riêng để tạo ghi thật. Sau đó mới cập nhật counter Conversation và insert Message trong cùng transaction. Nếu update không match, từ chối theo quyền phiên. Nếu xung đột, retry chỉ sau khi kiểm lại quyền trong lượt mới. Với lượt replay trả DTO, vẫn kiểm phiên và quyền hiện hành như bình thường.
- **Revoke và thứ tự.** Bản thử dùng cùng document AuthSession để đặt `revokedAt` và ghi dấu operation ID trong một lần ghi nguyên tử có majority. Bảo toàn thứ tự coordinator User → Workspace hiện có. Thứ tự ghi DB của send là AuthSession → Conversation → Message. Revoke session chỉ chạm AuthSession. Phải rà writer khác có thao tác ngược thứ tự trước khi bật. Hai đường ghi cùng document cho biết bên nào thắng. Trường serial không thay membership revision. Session bị thu không mở lại. Đăng nhập mới có AuthSession ID mới, nên retry từ session cũ không chuyển quyền sang session mới. Tranh chấp chủ yếu trên mỗi AuthSession, còn các phiên khác vẫn có thể tranh counter Conversation.
- **Phạm vi mở rộng cần chốt riêng.** Cho membership/rejoin, ứng viên là document membership theo ID và incarnation, hoặc hàng rào bền theo cặp Workspace/user nếu membership có thể bị thay document. Cho PRIVATE/regrant, ứng viên là hàng rào bền theo channel và membership incarnation nếu grant có thể bị thay. Xóa Workspace/kênh cần hàng rào/tombstone bền theo ID của chính tài nguyên. Send phải ghi cùng hàng rào mà mutation đổi quyền sử dụng và khóa bằng thứ tự cố định đã được M1/M4 review. Những scope này có nguy cơ tranh ghi trên toàn kênh/Workspace và chưa nằm trong bản thử session. Quyền LIVE và cleanup vẫn dùng cohort/watermark theo contract M4.
- **Kết quả chưa rõ và restart.** Với send, retry từ actor còn quyền dùng đúng `clientMessageId` trong cùng scope và đối chiếu bản ghi đã lưu. Với revoke, giữ deny và tra marker majority bằng ID thao tác ổn định hiện dùng cho revoke session. Không thấy marker chưa chứng minh rollback. Với bản thử, dùng ledger hiện có và đo giới hạn số lượt pending, thời gian chiếm gate/slot và thời gian chờ majority. Vượt dung lượng trả lỗi chưa hoàn tất và giữ deny. Trước khi bật runtime cần thiết kế journal durable theo operation ID, lưu đủ scope/cohort để nhận diện việc dở. Startup phải đóng admission liên quan cho đến khi nạp lại pending deny và đối chiếu marker. Nếu việc ghi intent chưa rõ tại thời điểm crash, không dựa vào ledger RAM để khẳng định có thể mở lại quyền. M1/M4 cần chốt thứ tự ghi intent và quy tắc khôi phục trước khi dùng ngoài fixture.
- **Budget và test.** Không đổi FIFO, giới hạn mặc định, pool hoặc hợp đồng adapter cho bản thử. So với phép đo baseline, đo riêng lần ghi AuthSession, xung đột, availability, số lần thử và thời gian giữ từng khóa/slot. Dùng MongoDB lifetime mặc định. Kiểm send thắng trước majority revoke và revoke thắng làm send cũ không thể tạo tin. Chặn ACK, làm chậm cleanup, thử retry cùng mã và xác nhận sequence/majority visibility sau mốc DB và mốc hoàn tất. Đo nhiều lượt gửi cùng một phiên và khác phiên, chạy chung auth/Workspace/kênh để thấy tác động lên pool. Nếu chỉ khi giữ pending lâu mới bảo đảm thứ tự, báo cả thời gian tới pending deny và tới hoàn tất. Không đổi nghĩa phép đo deadline để đóng P2.

Điểm cần M1/M4 xác nhận trước khi triển khai bản thử: semantics của send thắng trước majority revoke, quyền sở hữu field serial và marker operation trên AuthSession, thứ tự ghi của writer M1, và phần cleanup/recovery được kiểm trong fixture. Sau khi chốt, cập nhật quyết định ở contract dùng chung. [Contract quyền M1/M2](../contracts/messaging-access.md) · [Runbook thu quyền M1/M4](access-revocation.md)

#### Bản thử AUTH_SESSION của SCRUM-42

M1 đã xác nhận phạm vi bản thử và thứ tự coordinator trên PR #117. Hai factory send/revoke chỉ bật hàng rào khi fixture truyền opt-in trực tiếp. Main không đọc cờ thử. Giữ một client/pool, FIFO và lifetime 60 giây. Pending deny và phạm vi cleanup dùng coordinator hiện hành.

Đề xuất schema để M1 review gồm `AuthSession.textWriteSerial` kiểu số nguyên an toàn, vắng mặt tương đương 0 khi cập nhật lần đầu, và `AuthSession.textRevokeOperationId` kiểu chuỗi do server sinh, vắng mặt khi chưa có marker. Cả hai mặc định không được select. Gửi tin ghi thật serial có điều kiện session đúng user, chưa revoke, chưa hết hạn theo đồng hồ DB. Chỉ khi matched mới cập nhật counter và ghi tin trong transaction. WriteConflict đi qua đường lỗi DB, lượt thử sau kiểm quyền lại. Revoke cập nhật cùng document sau cleanup, ghi marker và bảo toàn revokedAt lần đầu. Marker đối chiếu bằng majority. Nếu không thấy marker, lượt retry chỉ lặp lại cập nhật có điều kiện, cùng ID và đúng phạm vi đã cleanup. Không suy từ marker vắng sang rollback.

Registration và login tạo AuthSession mới, hai field vắng mặt. Login thay token vẫn cập nhật revokedAt trên document cũ nên tranh chấp với ghi serial của session đó. Bản thử logout luôn đi qua cùng operation khi đọc thấy revokedAt để tránh báo hoàn tất chỉ dựa trên giá trị đó. Session reader không dùng serial/marker làm nguồn quyền. Bản thử không chạy migration hoặc đổi writer mặc định. Cần M1 review field và luồng thay phiên, M4 review adapter thật, và thiết kế journal durable trước rollout.

Khởi động container disposable như ca lifetime mặc định phía trên. Bật `COLEARNIA_TEST_DB_FAILPOINTS=1`, `COLEARNIA_TEST_DB_PROFILE=scrum42` và `COLEARNIA_TEST_AUTH_SESSION_FENCE=1`, rồi chạy:

```powershell
pnpm exec vitest run --pool=threads --reporter=verbose --config vitest.database.config.ts apps/server/test/text-transport.integration.ts -t 'serializes an unacknowledged|keeps deny during cleanup|reconciles a write|measures fenced sends'
```

Ca tái hiện lỗi cũ vẫn bật riêng qua `COLEARNIA_TEST_REVOKE_COMMIT_RACE=1`. Không dùng kết quả đó làm nghiệm thu bản thử. Các ca bản thử dùng service revoke và coordinator thật, adapter M2/M4 là fixture có điều khiển. Kiểm callback muộn ở đây chứng minh cách gọi theo session/watermark trong fixture, chưa chứng minh đóng native resource trên LIVE runtime.

Một lượt đo MongoDB 8.0.16, lifetime mặc định 60 giây, profile socket 400 ms và pool 2 cho thấy:

| Ca                                              | Bằng chứng                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send thắng, ACK commit bị mất do socket timeout | Commit ghi bắt đầu ở 56,4 ms, revoke được gọi ở 57,2 ms, send nhả gate/slot ở 461 ms và pending deny được quan sát ở 466,3 ms. Lệnh update revoke đầu timeout, driver gửi lại và nhận ACK majority ở 1.073,2 ms. Đã quan sát hoàn tất ở 1.082,4 ms. Đọc majority ngay sau response thành công có đúng một tin, sequence 1. Retry từ phiên bị thu trả AUTH_REQUIRED.   |
| Revoke thắng, cleanup chậm và ACK revoke mất    | Timeout cleanup giữ pending deny, chưa ghi revokedAt và chỉ chiếm một slot pending. Yêu cầu thu quyền khác vượt cap trả SERVER_BUSY. Sau đó callback của phiên cũ chỉ tác động tài nguyên cũ trong fixture. Revoke ghi được marker nhưng mất ACK. Logout cùng token lần đầu trả chưa hoàn tất, lần sau đối chiếu marker majority rồi hoàn tất, không gọi lại cleanup. |
| Lượt gửi cũ sau durable revoke                  | Gọi repository bằng thông tin admission cũ bị chặn ngay bởi matched-count của hàng rào. Majority read thấy 0 tin và sequence chưa cấp. Phiên thay thế vẫn gửi được và retry trả đúng sequence 1. Phiên khác và tài nguyên mô phỏng của nó còn nguyên.                                                                                                                 |
| Chi phí trên cùng pool                          | Hai lượt gửi kèm đọc auth/Workspace. Cùng phiên mất 120 ms baseline, 119 ms khi bật fence. Khác phiên 107/117 ms. Có đúng hai update AuthSession bổ sung mỗi lượt đo bật fence. Sau bốn đợt có tám tin, sequence 8 và không còn operation giữ gate. Một mẫu nhỏ chưa đủ chốt budget hoặc throughput.                                                                  |

Bốn ca chọn chạy đạt. Ca mất ACK do lệnh đã commit nhưng lỗi được đưa vào giữa ứng dụng và driver cũng nằm trong lượt kiểm. Bảng trên ghi lượt thử ban đầu. Lượt kiểm tải ghép và native LIVE tiếp theo được ghi bên dưới.

#### Regression LIVE ghép với AUTH_SESSION

Hai ca shared dùng MongoDB 8.0.16 replica set disposable với lifetime mặc định 60 giây, cùng MongoClient cho AuthSession và LIVE, `createSessionRevocation(..., true)`, coordinator/barrier và `live: registry` thật. mediasoup Worker, Router và WebRTC transport chạy native. Authority xác thực và thao tác tạo phiên mới là fixture lưu AuthSession vào MongoDB. Port messaging/board và callback đóng socket là fixture.

Hai biến thể kiểm transport trả ngay và trả muộn, board cleanup lỗi rồi retry. Pending deny có hiệu lực trong lúc majority read còn thấy phiên cũ chưa có revokedAt và marker. Khi retry hoàn tất, majority read xác nhận revokedAt và marker trùng operation ID ban đầu. Transport cũ đóng, phản hồi cấp transport đến muộn trả lỗi. Transport và ownership của phiên thay thế còn hoạt động, peer vẫn truy cập registry, hai AuthSession mới/peer còn hiệu lực.

```powershell
pnpm exec vitest run --pool=threads --config vitest.database.config.ts apps/server/test/main-join-registry.integration.ts
pnpm exec vitest run --pool=threads --config vitest.database.config.ts apps/server/test/text-transport.integration.ts
```

Cùng cấu hình trial ở trên, mỗi đợt tải ghép chạy hai lượt gửi TEXT song song với đọc phiên, mở Workspace và tạo Workspace/kênh TEXT trên cùng pool. Một lượt đo cục bộ với pool 2 cho kết quả cùng phiên 224/175 ms và khác phiên 174/151 ms (tắt/bật fence). Hai đợt bật fence có đúng hai update AuthSession mỗi đợt. Cả bốn đợt có tám tin và sequence cuối 8. Mẫu này kiểm các đường chạy đồng thời và đếm update. Cần mẫu tải lớn hơn để chốt budget hoặc capacity.

P2 tiếp tục mở. Runtime mặc định vẫn dùng đường hiện hành. Recovery qua restart, deadline và các scope ngoài AUTH_SESSION cần được chốt trước quyết định merge.
