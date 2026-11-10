# Model kênh và quyền PRIVATE — SCRUM-26

Module [channel-models.ts](../../apps/server/src/workspaces/channel-models.ts) cung cấp `channelModels(connection)`, trả `Channel` và `ChannelAccessGrant` trên connection chung từ `createDatabase`. Gọi lại trên cùng connection trả cùng model. Mongoose dùng `strict: 'throw'`, timestamps và không lưu `__v`.

## Dữ liệu và index

| Collection            | Field chính                                                                                                      | Index                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channels`            | `workspaceId`, `name`, `type`, `accessMode`, `order`, `revision`, `deletedAt`                                    | `ix_channel_workspace` theo `{ workspaceId, deletedAt, order, _id }`                                                                                                 |
| `channelAccessGrants` | `workspaceId`, `channelId`, `membershipId`, `membershipIncarnation`, `grantedByUserId`, `grantedAt`, `revokedAt` | Unique `uq_channel_membership_grant` theo `{ channelId, membershipId }`, cùng `ix_grant_member` theo `{ membershipId, membershipIncarnation, revokedAt, channelId }` |

TEXT/LIVE và WORKSPACE/PRIVATE độc lập. Model yêu cầu caller truyền `accessMode` đã xử lý bằng contract. Tên trim, dài 1–80 Unicode code point theo `channelNameSchema`. `order`/`revision` mặc định 0; `deletedAt`/`revokedAt` mặc định null. Incarnation bắt buộc do service lấy từ membership hiện hành, là số nguyên an toàn từ 1.

Tên kênh có thể trùng trong Workspace. `general` là tên khởi tạo, có thể đổi hoặc xóa theo quyền. `workspaceId`, `type`, `accessMode` của kênh và ba reference của grant được khai báo immutable trên Mongoose. Với document đã lưu, `save()` từ chối thay immutable; query update loại field immutable và có thể vẫn cập nhật `updatedAt`. Handler cần whitelist payload theo contract và trả lỗi nghiệp vụ phù hợp.

Unique grant giữ cả bản ghi đã revoke và incarnation cũ. Cấp lại phải cập nhật cùng document, đổi `membershipIncarnation`/người cấp/thời điểm cấp và đặt `revokedAt: null`. Không insert grant mới theo incarnation.

## Tích hợp service M1/M2/M4

1. SCRUM-27 kiểm Workspace/kênh còn sống, membership ACTIVE, cùng Workspace và quyền người gọi. Owner/admin quản lý danh sách vẫn cần grant riêng để đọc PRIVATE. Các điều kiện liên collection cần được service kiểm trước khi ghi hoặc trả nội dung.
2. Query grant hiện hành cần đủ `workspaceId`, `channelId`, `membershipId`, `membershipIncarnation` từ membership và `revokedAt: null`. Sau rejoin, incarnation mới không khớp grant cũ. Chỉ cấp lại rõ ràng mới mở quyền PRIVATE.
3. Cấp/gỡ/re-add quyền và tăng `Channel.revision` chạy trong cùng transaction do `database.transaction` cấp, theo coordination và CAS của M1. Việc retry/no-op, audit và thu quyền runtime thuộc service tương ứng. Quyền LIVE còn cần kiểm state phiên hiện hành.
4. SCRUM-32 dùng `Channel` trong transaction tạo Workspace/OWNER/general/conversation. Factory conversation M2 nhận cùng `ClientSession` và connection.

## Validator và triển khai

Pattern tên trong native validator dùng đúng tập WhiteSpace/LineTerminator của JavaScript `trim`, gồm NBSP và BOM. Raw insert/update phải có tên đã trim; khoảng trắng bên trong tên được giữ. Test kiểm đủ tập ký tự trim ở hai đầu và các ký tự như U+0085/U+180E/U+200B vốn được contract giữ nguyên.

`channelIndexRequirements` dùng với `preflightIndexes`. `channelCollectionValidators` chứa validator MongoDB cho từng collection, kiểm shape/enum, ObjectId/date, nullable bắt buộc và số nguyên an toàn. BSON numeric chấp nhận int/long/double, từ chối Decimal128. Validator bảo vệ cả raw update và `$inc` vượt miền; bất biến so với giá trị cũ và các điều kiện liên collection tiếp tục do service kiểm.

Factory chỉ đăng ký model. Connection chung tắt autoCreate/autoIndex; collection, validator, index cần được provision rõ ràng. Test tự tạo chúng trong DB tên ngẫu nhiên và chỉ xóa đúng DB test đó. Startup/readiness hiện giữ hành vi trước task này; các bước provision cần được tích hợp khi consumer bắt đầu dùng persistence.

Trước khi dùng trên môi trường có dữ liệu, cần migration được review theo [integrity và migration](integrity-and-migrations.md). Kiểm dữ liệu/enum cũ, duplicate grant và index options, áp validator với `validationLevel: 'strict'`, `validationAction: 'error'`, tạo đúng ba index rồi đọc lại options và chạy preflight. Dữ liệu lỗi cần đối chiếu trước khi bật mutation.

## Kiểm chứng

- [Unit test](../../apps/server/src/workspaces/channel-models.test.ts) kiểm model factory, enum, Unicode, default, field lạ, refs và miền số nguyên.
- [Integration test](../../apps/server/test/channel-models.integration.ts) kiểm index/validator thực, unique cả revoked/incarnation cũ, query incarnation mới, regrant cùng document, transaction commit/rollback, bất biến Mongoose và raw writes sai shape/counter/null.
- Chạy `pnpm exec vitest run apps/server/src/workspaces/channel-models.test.ts`. DB test cần replica set `rs0` ở localhost, dùng `COLEARNIA_DB_TEST_PORT` nếu khác cổng 27017, rồi chạy `pnpm exec vitest run --config vitest.database.config.ts apps/server/test/channel-models.integration.ts`.

Đã kiểm bộ DB test trên MongoDB 8.2.6 tạm ở loopback cổng 27126. Phiên bản 8.0.16 theo baseline còn cần kiểm riêng. Policy, endpoint cấp/gỡ quyền và cleanup runtime tiếp tục ở các task phụ thuộc.
