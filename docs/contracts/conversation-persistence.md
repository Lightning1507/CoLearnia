# SCRUM-31 — Lưu hội thoại cho kênh TEXT

Khi tạo Workspace, M1 tạo Workspace, tư cách OWNER và kênh TEXT mặc định `general`. M2 tạo thêm bản ghi hội thoại để tin nhắn sau này có nơi lưu. Bốn bản ghi cùng nằm trong một lần lưu do M1 điều phối. Nếu một bước lỗi, hệ thống hủy lần lưu đó để tránh Workspace thiếu kênh hoặc kênh thiếu hội thoại.

## Cách M1 dùng phần của M2

M1 dùng kết nối MongoDB từ SCRUM-15 và tạo hàm M2 bằng `createChannelConversationFactory(database.connection)`. Chuẩn bị mã Workspace, kênh, hội thoại và thời điểm tạo trước khi bắt đầu transaction để lần thử lại dùng cùng dữ liệu.

```ts
const factory = createChannelConversationFactory(database.connection);

await database.transaction(async (dbSession) => {
  // M1 lưu Workspace, OWNER và kênh TEXT general bằng dbSession.
  return factory.create({ workspaceId, channelId, conversationId, createdAt, dbSession });
});
```

`factory.create` trả `{ conversationId }` khi bản ghi hội thoại đã được ghi trong transaction. M1 chỉ báo thành công cho người dùng sau khi `database.transaction` hoàn tất. M2 truyền đúng `dbSession` khi ghi. Hàm từ chối khi session không có transaction đang chạy. Driver MongoDB từ chối session đến từ một client khác. Lỗi ghi được chuyển lên M1 để transaction xử lý.

Hàm dùng được cho `general` và các kênh TEXT tạo sau đó. M1 chịu trách nhiệm kiểm quyền, xác nhận kênh thuộc đúng Workspace và chỉ gọi hàm cho kênh TEXT. Kênh LIVE dùng luồng hội thoại cuộc họp riêng. Xem [thỏa thuận SCRUM-14](messaging-access.md#4-tạo-general-đầy-đủ-khi-tạo-workspace) và [kết nối dùng chung SCRUM-15](../runbooks/mongodb-transactions.md).

## Model và index

`conversationModel(connection)` lấy model từ cùng connection. Bản ghi `conversations` lưu `_id`, `workspaceId`, `kind`, `scope`, thời điểm tạo/cập nhật và hai mốc đóng/dọn. Các mã Workspace, hội thoại và kênh được lưu dưới dạng MongoDB ObjectId. Hội thoại CHANNEL chứa `scope.channelId` và bắt đầu với `closedAt` và `purgeAt` bằng null. Model kiểm hình dạng phạm vi theo từng loại hội thoại. SCRUM-31 cung cấp hàm ghi cho CHANNEL, còn luồng tạo DM và hội thoại cuộc họp thuộc các task tiếp theo. Xem [thiết kế dữ liệu hội thoại](../database/collection-design.md#38-conversations).

`channelConversationIndex` mô tả index unique `uq_conv_channel`, chỉ áp dụng cho bản ghi CHANNEL. Sau khi index được tạo, MongoDB từ chối hội thoại CHANNEL thứ hai cho cùng kênh. Theo cấu hình SCRUM-15, đăng ký model không tự tạo collection/index. Trước khi mở luồng ghi trên môi trường chung, người triển khai cần áp dụng index qua quy trình DB đã review và xác nhận bằng `preflightIndexes(connection, [channelConversationIndex])`. Trong ca tích hợp, collection và index được tạo tường minh trong database thử riêng. Xem [quy tắc index và transaction](../database/integrity-and-migrations.md).

## Đầu vào cho các ticket tiếp theo

Sprint 1 cần nhóm 5 người đăng nhập, vào cùng Workspace, gửi tin và gọi trên staging. SCRUM-31 mở đường cho luồng tạo kênh và lưu tin TEXT. Danh sách sau khớp liên kết trực tiếp trong [kế hoạch Sprint 1](../planning/sprint-1.md) và [file liên kết Jira](../planning/jira/sprint-1-jira-links.csv).

| Ticket   | Đầu vào có từ SCRUM-31                                                       | Phần cần hoàn tất ở ticket đó                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCRUM-32 | Hàm tạo CHANNEL nhận đúng chữ ký M1 và session từ SCRUM-15.                  | Nối model Workspace/OWNER/kênh và quyền thật. SCRUM-26, 27, 30 và 19 là các phụ thuộc khác của SCRUM-32. SCRUM-33 kiểm rollback/retry trên luồng Workspace đã tích hợp. |
| SCRUM-35 | Dùng lại hàm tạo CHANNEL cho kênh TEXT mới, với mã kênh/hội thoại do M1 cấp. | Nối API và form, kiểm quyền owner/admin và bỏ qua việc tạo CHANNEL đối với LIVE. Còn phụ thuộc SCRUM-34 và 19.                                                          |
| SCRUM-41 | Model và mã hội thoại ổn định để bản ghi tin nhắn tham chiếu.                | Tạo model tin nhắn, khóa chống gửi lặp và index đọc lịch sử. Schema gửi/đọc/nhận tin thuộc SCRUM-40.                                                                    |

M1 review cách gọi, kiểu ID, thứ tự ghi và cách chuẩn bị index trước khi mở luồng tạo Workspace/kênh. Bài kiểm của SCRUM-31 dùng MongoDB thật với các bản ghi đại diện cho phần M1. Việc kiểm API, quyền và rollback toàn bộ luồng sản phẩm dùng model M1 thật tiếp tục theo các ticket trên.

## Kiểm chứng

Trên Windows, `pnpm check` đạt với 133 test ứng dụng, typecheck và build. Harness có 54 ca đạt và 1 ca liên kết tượng trưng bỏ qua trên Windows.

Ngày 08/11/2026, nhánh `feat/SCRUM-31-conversation-general` từ `5c85eb7`. Bộ kiểm database có 24 ca đạt, gồm 6 ca SCRUM-31. Chạy trên MongoDB 8.0.16 replica set `rs0` riêng trên loopback, cổng 27031, bằng cấu hình Vitest database. Cổng mặc định trên máy đang có MongoDB standalone nên lượt đầu dừng ở bước xác nhận replica set. Hướng dẫn chạy bộ kiểm với cổng riêng ở [runbook MongoDB](../runbooks/mongodb-transactions.md).

- Lần lưu thành công có đủ bốn bản ghi. Trước khi commit, chỉ phiên lưu đang thực hiện thấy các bản ghi đó.
- Lỗi chèn sau khi ghi hội thoại hủy cả bốn bản ghi. Lỗi trùng kênh do index cũng hủy các bản ghi M1 đang tạo và giữ hội thoại đã có.
- Hàm từ chối session không có transaction đang chạy. MongoDB driver từ chối session thuộc client khác.
- Model từ chối phạm vi sai loại và khóa cặp không khớp.

Sau review commit `b28a347`, ba ca được bổ sung vào bộ kiểm tích hợp SCRUM-31:

- Lỗi tạm thời sau khi ghi làm lần lưu chạy lại với cùng mã và thời điểm. Cuối cùng chỉ có một hội thoại.
- Hai lần lưu đồng thời tạo hội thoại CHANNEL cho cùng kênh. Một lần thành công, lần còn lại nhận lỗi trùng mã kênh từ MongoDB.
- CHANNEL và SESSION cùng dùng một mã kênh vẫn lưu được trong cùng transaction vì index chỉ áp dụng cho CHANNEL.

Chạy trên Windows PowerShell với MongoDB 8.0.16 replica set `rs0` thử riêng:

```powershell
$env:COLEARNIA_DB_TEST_PORT = '27057'
pnpm test:database
```

Kết quả thực chạy là **2 file và 27 ca đạt**, gồm 9 ca SCRUM-31. Ba ca mới có thể đối chiếu trong [conversation.integration.ts](../../apps/server/test/conversation.integration.ts) theo tên sau:

| Ca kiểm                                                                    | Điều kiện đạt                                                                                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `retries a transient failure after insert with the same ID and timestamps` | Callback chạy 2 lượt. MongoDB lưu đúng 1 hội thoại với ID, `createdAt` và `updatedAt` đã chuẩn bị.                     |
| `allows only one of two concurrent CHANNEL inserts for the same channel`   | Hai transaction cùng bắt đầu. Một lượt commit, lượt còn lại nhận mã lỗi `11000`. ID còn lại trong DB khớp lượt commit. |
| `allows CHANNEL and SESSION to share a channel ID under the partial index` | Cùng một transaction lưu được 1 CHANNEL và 1 SESSION có chung `channelId`.                                             |

`pnpm check` cũng đạt với 217 test ứng dụng. Các bài kiểm dùng database riêng và tạo index tường minh trong bước chuẩn bị test.
