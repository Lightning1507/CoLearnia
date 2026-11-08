# MongoDB dùng chung — SCRUM-15

Áp dụng cho một app process, MongoDB Docker replica set `rs0`. Connector ở `apps/server/src/lib/database.ts`; sau khi `await database.connect()` thành công, M1/M2 đăng ký model trên **cùng `database.connection`** do bootstrap tạo. Không dùng `mongoose.model()` trên default connection, không tạo pool theo user/miền. Đây là nền transaction; chưa triển khai model nghiệp vụ hoặc tạo Workspace/general.

## Khởi động và cấu hình

```sh
pnpm infra:up
docker compose ps -a
pnpm dev
```

`pnpm infra:down` dừng stack, giữ named volume. Không dùng `down -v` để sửa lỗi kết nối. URI local và lưu dữ liệu theo [local runbook](local-development.md#mongodb). Connector đặt `autoCreate`, `autoIndex`, `bufferCommands` thành false ngay khi tạo Mongoose instance riêng, trước lúc đăng ký model hoặc connect; không đổi cấu hình global của module khác. Query model trước connect bị từ chối ngay. Chỉ connection được bootstrap mở mới tạo pool. Migration được review phải tạo collection/index trước khi handler nghiệp vụ sử dụng.

| Biến                                | Mặc định | Ý nghĩa                                                                                                          |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `MONGO_MAX_POOL_SIZE`               | 10       | Số connection tối đa trong pool; đồng thời là trần transaction đang chạy, không xếp hàng transaction ở connector |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | 5000     | Trần chờ chọn MongoDB server                                                                                     |
| `MONGO_WAIT_QUEUE_TIMEOUT_MS`       | 5000     | Trần chờ lấy connection từ pool                                                                                  |
| `MONGO_SOCKET_TIMEOUT_MS`           | 15000    | Trần chờ socket không có hoạt động                                                                               |

Connect timeout là 5 giây cho mỗi lần thiết lập socket. Preflight đặt `maxTimeMS` 5 giây cho từng lệnh đọc. Transaction dùng primary, snapshot read concern và majority write concern. Commit đặt giới hạn 5 giây cho lệnh phía MongoDB và 5 giây chờ write concern. Đây là các giới hạn từng giai đoạn, không phải deadline chung cho cả callback.

Bỏ `MONGO_OPERATION_TIMEOUT_MS` khỏi cấu hình cũ và dùng hai biến mới trong bảng khi cần. Connector từ chối `timeoutMS` trong `MONGO_URI`. Consumer tránh truyền `timeoutMS` cho session/query vì driver 7.7 có rủi ro sai phản hồi giữa các request khi bật CSOT. [Cảnh báo MongoDB Node.js Driver](https://github.com/mongodb/node-mongodb-native/releases/tag/v7.8.0)

Khi đủ transaction đang chạy, connector từ chối ngay bằng `DatabaseBusyError` và nhả suất cả khi lỗi. Handler tương lai ánh xạ sang lỗi phụ thuộc/bận phù hợp contract; không retry vô hạn. Query ngoài transaction vẫn chia sẻ pool và timeout. Workspace/User gate, limiter theo scope và tải kết hợp thuộc task service/capacity; trần connector không thay ACL hoặc các gate đó.

## M1 gọi M2 trong cùng transaction

Provider M2 nhận connection tại khởi tạo và thực thi `GeneralConversationFactory<ClientSession>` ở `apps/server/src/messaging/ports.ts`. Mỗi lần ghi phải truyền `{ session: input.dbSession }`. Caller M1 chuẩn bị ID/time trước callback:

```ts
const result = await database.transaction(async (session) => {
  await workspaceModel.create([workspaceDocument], { session });
  return conversationFactory.create({
    workspaceId,
    channelId,
    conversationId,
    createdAt,
    dbSession: session,
  });
});
```

Ví dụ minh họa thứ tự ghi cho TEXT theo [contract](../contracts/workspace-channels.md#3-các-hàm-nội-bộ). Toàn bộ model của provider dùng `database.connection`. Connector quản lý commit, abort và kết thúc session. Trong callback, chờ từng thao tác DB theo thứ tự, truyền session, để lỗi DB truyền ra ngoài và tránh transaction lồng nhau. Mỗi lượt retry phải đọc/tạo lại document trong callback vì connector dùng API session của driver, không tự đặt lại trạng thái document Mongoose trong bộ nhớ.

Connector chạy callback tối đa hai lượt khi lỗi có nhãn `TransientTransactionError`. Dùng lại ID/time đã chuẩn bị. Để publish socket, gọi storage hoặc thu quyền sau khi commit được xác nhận. Với `UnknownTransactionCommitResult`, connector chỉ thử lại lệnh commit một lần trên cùng transaction. Driver vẫn có retry nội bộ cho lệnh commit. Nếu kết quả còn chưa rõ, caller nhận lỗi gốc và cần đọc lại theo ID/revision để đối soát trước khi thử lại nghiệp vụ hoặc báo kết quả. Unit test mô phỏng lỗi ở lệnh commit.

## Kiểm DB và index/migration trên môi trường riêng

```sh
pnpm infra:up
pnpm test:database
pnpm check
```

`test:database` cần MongoDB replica set `rs0` thật trên loopback. Cổng mặc định là `27017`. Nếu cổng đó đang dành cho một MongoDB khác, có thể đặt `COLEARNIA_DB_TEST_PORT` cho replica set thử riêng. Mỗi suite tạo database thử với hậu tố UUID và chỉ dọn database do chính suite tạo. Test dùng endpoint loopback cố định và không đọc `MONGO_URI` của ứng dụng. Nếu dừng tiến trình trước khi dọn xong, xác minh đúng tên và lượt sở hữu trước khi dọn database thử.

Consumer test của M2 ghi MongoDB thật theo port đã chốt; kiểm commit, abort, retry và session khác client. Chưa là provider conversation sản phẩm; rollback Workspace/OWNER/general đầy đủ kiểm ở M1-T6.2.

`preflightIndexes(connection, requirements)` là bước **chỉ đọc**, không chạy tự động ở bootstrap. Manifest do server/task migration cung cấp, không nhận từ request. Hàm kiểm collection, tên/thứ tự key/options và dữ liệu trùng trước unique index; chỉ trả mã vấn đề, không trả email/token/nội dung hoặc khóa trùng. Missing collection/index, options lệch hay dữ liệu trùng phải dừng để review, không tự sửa/xóa dữ liệu. Lỗi quyền/timeout DB được ném ra, không coi là ready.

Helper hỗ trợ index scalar với field thường/đường dẫn lồng, unique, `partialFilterExpression` và TTL qua `expireAfterSeconds` (kể cả 0). So sánh đúng key order, unique, TTL và toàn bộ partial filter. Kiểm trùng chỉ trên các document khớp partial filter dự kiến; mảng ở field hoặc bất kỳ cấp cha đều bị từ chối để không chứng nhận nhầm multikey. Collection/index collation, sparse, hidden và prepareUnique vẫn bị từ chối. `ready` chỉ nói **các index trong manifest này** phù hợp, không chứng minh toàn bộ schema/migration đã hợp lệ. Unique multikey, validator nghiệp vụ, refs và migration ledger/checksum cần preflight riêng theo task model và [kế hoạch DB](../database/integrity-and-migrations.md#6-kế-hoạch-migration-và-rollback).

Rehearsal tự động trong DB riêng:

1. Collection chưa có: báo thiếu, không tự tạo.
2. Dữ liệu trùng: preflight báo lỗi, unique build bị Mongo từ chối, dữ liệu không bị sửa.
3. Fixture hợp lệ: tạo validator/index tường minh, chạy createIndex lần hai không nhân index; `listCollections`/`listIndexes` đối chiếu và thử insert bị từ chối.
4. TTL auth expiry, partial CHANNEL theo `scope.channelId` và partial ACTIVE/ENDING: kiểm options đúng/sai, trùng trong/ngoài filter, mảng ở cấp cha; index sai giữ nguyên. Không đợi TTL monitor xóa document để kiểm auth expiry; handler vẫn phải kiểm thời hạn trực tiếp.
5. Rollback fixture: chỉ drop đúng index fixture do lượt test tạo, giữ document; cuối suite dọn DB test.

Không dùng cách rollback fixture này để drop index đang bảo vệ dữ liệu sản phẩm. Với DB có dữ liệu thật: kiểm kê và backup/restore cô lập, dừng writes khi cần, review migration version/checksum/khả năng tương thích; chỉ rollback ứng dụng khi schema tương thích. Backfill mất thông tin cần backup hoặc forward-fix; không khôi phục token/quyền đã thu. SCRUM-15 không áp migration lên DB ứng dụng, không triển khai runner/ledger hay tất cả index của các miền.

CI chạy `pnpm check`, khởi động rs0, giữ smoke `mongosh` hiện có rồi chạy `pnpm test:database`. Bằng chứng SCRUM-15 ở [evidence](../test-evidence/2026-11-07-scrum-15-database.md).

## Bàn giao cho các task phụ thuộc

Sau review/merge SCRUM-15, các bên dùng cùng connector và manifest index của model mình. Bảng này mô tả đầu vào kỹ thuật, không thay trạng thái Jira hoặc xác nhận các phụ thuộc khác đã xong.

| Task nhận | Đầu vào đã có                                                   | Phần task nhận tiếp tục làm                                                     |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| SCRUM-16  | Connection, unique index preflight, TTL preflight               | User/authSession model, validator, index thật và ca auth expiry                 |
| SCRUM-26  | Connection, transaction, compound unique preflight              | Channel/PRIVATE grant model và incarnation/ACL                                  |
| SCRUM-30  | Connection, transaction, membership/invitation unique preflight | Model và invariant OWNER/membership/link mời                                    |
| SCRUM-31  | ClientSession khớp port M2, partial/dotted index preflight      | Conversation model và factory thật, truyền session vào mọi ghi                  |
| SCRUM-38  | Connection và ngân sách DB/retry                                | Fixture spike history/checkpoint/Q9; chưa coi commit DB là event đã publish     |
| SCRUM-79  | Connection, transaction, partial ACTIVE/ENDING preflight        | Metadata model/repository, CAS và lifecycle phiên                               |
| SCRUM-18  | Transaction dùng chung                                          | Handler đăng ký sau khi model SCRUM-16, hash SCRUM-17 và contract auth sẵn sàng |

Consumer xác nhận trên PR bằng cách inject `database.connection`, tạo fixture với index/validator tường minh trong DB riêng và chạy `pnpm test:database`. Bộ SCRUM-15 chưa có toàn bộ model các miền. Preflight trả thiếu index trước migration là kết quả cần xử lý; không bỏ index, đổi manifest hoặc bật autoIndex để làm xanh.
