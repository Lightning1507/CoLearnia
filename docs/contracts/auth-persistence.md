# SCRUM-16 — Lưu tài khoản và phiên đăng nhập

M1 dùng hai model trên cùng kết nối MongoDB của SCRUM-15. `User` lưu thông tin tài khoản. `AuthSession` lưu mỗi lần đăng nhập riêng để hệ thống biết phiên thuộc ai, còn hạn hay đã bị thu hồi.

| Model         | Dữ liệu lưu                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`        | Email đã bỏ khoảng trắng hai đầu và chuyển chữ thường, hash mật khẩu, tên hiển thị, trạng thái `ACTIVE` hoặc `DISABLED`, thông tin avatar hoặc `null`. |
| `AuthSession` | Mã người dùng, hash token đăng nhập, thời điểm hết hạn và thời điểm thu hồi. Phiên mới có `revokedAt: null`.                                           |

Hai model có mã MongoDB ObjectId và thời điểm tạo/cập nhật. Email và tên hiển thị dùng cùng quy tắc với SCRUM-12. Truy vấn thông thường và chuyển Mongoose document sang JSON/đối tượng loại bỏ hash. Service xác thực chỉ chọn hash khi cần và tự tạo dữ liệu trả về từ các trường được phép. Truy vấn `lean()` có chọn hash rõ ràng và truy vấn MongoDB trực tiếp cần được giữ nội bộ. Xem [contract auth/profile](auth-profile.md) và [thiết kế dữ liệu](../database/collection-design.md#31-users).

## Cách nối vào các task tiếp theo

`authModels(database.connection)` trả `User` và `AuthSession`. Khi SCRUM-18 đăng ký và cấp phiên, dùng chung `dbSession` từ `database.transaction` cho cả hai lần ghi. Mã dưới minh họa bước lưu sau khi service đã kiểm dữ liệu và chuẩn bị các giá trị hash cùng thời điểm hết hạn.

```ts
const { User, AuthSession } = authModels(database.connection);
await database.transaction(async (dbSession) => {
  const user = await new User({ emailNormalized, displayName, passwordHash }).save({
    session: dbSession,
  });
  await new AuthSession({ userId: user._id, tokenHash, expiresAt }).save({ session: dbSession });
});
```

SCRUM-21 có thể tìm phiên bằng `AuthSession.findOne({ tokenHash, expiresAt: { $gt: now }, revokedAt: null })`, rồi xác nhận User tương ứng còn `ACTIVE` trước khi cấp danh tính. So sánh bằng `$gt` loại phiên ngay tại thời điểm hết hạn. MongoDB dọn phiên hết hạn theo lịch nên bản ghi có thể còn tồn tại sau mốc đó. SCRUM-21 chịu trách nhiệm đọc cookie, kiểm token, xác thực User, cấp danh tính và kiểm CSRF.

## Chuẩn bị index trước khi bật luồng ghi

| Index             | Ý nghĩa                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `uq_user_email`   | MongoDB từ chối tài khoản thứ hai có cùng email đã chuẩn hóa. SCRUM-18 chuyển đúng lỗi trùng email thành `EMAIL_EXISTS`. |
| `uq_auth_token`   | Mỗi hash token chỉ thuộc một phiên.                                                                                      |
| `ttl_auth_expiry` | MongoDB dọn các phiên quá `expiresAt` bằng TTL với `expireAfterSeconds: 0`.                                              |
| `ix_auth_user`    | Hỗ trợ tìm các phiên theo người dùng và tình trạng thu hồi.                                                              |

Sau khi chuẩn bị collection và index theo quy trình DB đã review, chạy `preflightIndexes(database.connection, authIndexRequirements)` để xác nhận. SCRUM-15 tắt tự tạo collection và index khi đăng ký model. Bài kiểm tạo chúng tường minh trong database thử riêng. Xem [runbook MongoDB](../runbooks/mongodb-transactions.md) và [quy tắc dữ liệu](../database/integrity-and-migrations.md).

## Đối chiếu Sprint 1

Sprint 1 cần nhóm năm người đăng nhập, vào cùng Workspace, nhắn tin và gọi trên staging. SCRUM-16 cung cấp nền lưu tài khoản và phiên cho bước đăng nhập. Hai quan hệ chặn trực tiếp trong repo khớp danh sách Jira. Xem [Sprint Goal](../planning/sprint-1.md#sprint-1--nền-tảng-và-luồng-đầu-tiên) và [danh sách liên kết Jira](../planning/jira/sprint-1-jira-links.csv).

| Ticket   | Đầu vào có từ SCRUM-16                                                                        | Phần ticket tiếp tục làm                                                                           |
| -------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SCRUM-18 | Model tài khoản và phiên dùng chung transaction, index chống email trùng, quy tắc validation. | Nối thuật toán băm đã được review ở SCRUM-17, luồng đăng ký, cấp phiên và ánh xạ lỗi API.          |
| SCRUM-21 | Model tra phiên theo hash, ngày hết hạn, trạng thái thu hồi và liên kết đến User.             | Chờ SCRUM-18 cấp phiên thật, sau đó nối middleware HTTP, cookie, CSRF và kiểm quyền sử dụng phiên. |

M1 review các trường dữ liệu, index và cách sử dụng model trước khi bàn giao. MongoDB validator cấp collection thuộc bước migration được review. Các bài kiểm của task chạy qua model Mongoose và kiểm index thật trên MongoDB.

## Kết quả kiểm

`pnpm check` đạt trên Windows với 335 test ứng dụng. Harness có 54 ca đạt và 1 ca symlink bỏ qua trên Windows.

Trên nhánh `feat/SCRUM-16-user-auth-session-models` lấy từ `3ab2f86`, đã chạy 6 ca tích hợp trên MongoDB 8.0.16 replica set `rs0` riêng trên loopback. Bộ test dùng database tên riêng theo từng lượt chạy.

```powershell
$env:COLEARNIA_DB_TEST_PORT = '27058'
pnpm --filter @colearnia/contracts build
pnpm exec vitest run --config vitest.database.config.ts apps/server/test/auth-models.integration.ts
```

| Ca kiểm                | Kết quả                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kết nối và index       | Hai model dùng cùng connection. Đăng ký model chưa tạo collection. Sau khi chuẩn bị trong DB thử, preflight xác nhận đủ 4 index và đúng thông số TTL.       |
| Email trùng            | Email viết hoa và có khoảng trắng được chuẩn hóa. Lần lưu thứ hai nhận lỗi trùng `11000`.                                                                   |
| Tạo tài khoản và phiên | Hai bản ghi chỉ hiện ra ngoài transaction sau khi commit. Lưu trùng hash token bị từ chối.                                                                  |
| Hết hạn hoặc thu hồi   | Trong 4 phiên còn thấy trong transaction, chỉ phiên còn hạn và chưa thu hồi thỏa điều kiện truy vấn. Ca này kiểm quyền sử dụng ngay cả trước khi TTL dọn.   |
| Dữ liệu sai            | Email sai, hash rỗng hoặc sai kiểu, tên quá dài, trạng thái sai, avatar HTTP, ngày không hợp lệ, ID sai và field token nguyên bản đều bị từ chối qua model. |
| Hash riêng tư          | Truy vấn mặc định ẩn hash. Khi service chọn hash để kiểm nội bộ, JSON/đối tượng từ Mongoose document vẫn loại hash.                                         |

Việc quét TTL và xóa bản ghi chạy theo lịch của MongoDB. Ca hết hạn dùng điều kiện truy vấn và xác minh index, chưa đo thời gian dọn thực tế. Kiểm đăng ký, cookie và CSRF thuộc SCRUM-18/21.

Sau review `5605849`, ca thử `displayName: 123` tái hiện việc Mongoose lưu tên thành `"123"`. Thêm `cast: false` cho trường này để model báo lỗi kiểu tại `displayName` và không tạo tài khoản. Chạy lại Vitest với cấu hình database trên replica set thử cổng 27058, cả 34 ca đạt, gồm 7 ca SCRUM-16.
