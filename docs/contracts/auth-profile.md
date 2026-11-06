# Contract xác thực và hồ sơ cá nhân

**SCRUM-12 · M1-T1.1 · Chờ M4 review trước khi consumer dùng.** M1 cung cấp cho FE M1, M2 và M4. Bao phủ giao tiếp của FR-01-01–06, chưa triển khai endpoint hoặc nghiệm thu các FR này.

Nguồn: [nghiệp vụ tài khoản](../product/workspace-channels.md), [FR/AC](../product/functional-requirements.md), [proposal M1](../proposals/m1-workspace-auth.md), [quy ước API](api-conventions.md), [mã lỗi](error-codes.md), technical plan mục 10. Schema dùng chung: [auth.ts](../../packages/contracts/src/auth.ts). Các tên DTO/header dưới đây là thiết kế giao tiếp mới trong PR này, chưa phải API đã chạy.

## 1. Phạm vi và dữ liệu

Contract gồm đăng ký tự đăng nhập, đăng nhập/giữ phiên, đăng xuất, đọc/sửa tên và đổi mật khẩu của chính mình. Avatar chỉ có URL trong hồ sơ; contract upload/gắn/xóa ảnh tiếp tục ở M1-T1.3 với M2. Không thêm quên mật khẩu, đổi email hoặc API sửa hồ sơ người khác.

| Kiểu                   | Field                                     | Nơi sử dụng                                                                   |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `UserSummary`          | `id`, `displayName`, `avatarUrl`          | Thông tin hiển thị tối thiểu cho M2/M4; consumer vẫn kiểm quyền trước khi gửi |
| `OwnUser`              | Các field trên và `email`                 | Chỉ hồ sơ chính chủ                                                           |
| `AuthenticatedData`    | `user: OwnUser`, `expiresAt`, `csrfToken` | Register/login và GET `/auth/me`                                              |
| `AuthenticatedContext` | `userId`, `authSessionId`, `expiresAt`    | Chỉ server, không nhận từ FE hoặc trả trong JSON                              |

ID là chuỗi ObjectId 24 ký tự hex; thời gian là ISO UTC có `Z`. `avatarUrl` bắt buộc có: `null` khi không có ảnh, nếu có là URL HTTPS công khai. Không trả password/hash/token phiên, Cloudinary `publicId` hoặc role Workspace trong DTO tài khoản. Avatar công khai không làm API hồ sơ, email, file chat hoặc recording công khai.

## 2. Input và giới hạn

PM đồng ý hướng giới hạn tên/mật khẩu ngày 06/11; M4 review schema trước khi tích hợp. Email là lựa chọn kỹ thuật đề xuất trong PR này, cần M4 đối chiếu cùng index ở T2.1.

| Field                              | Quy tắc                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`                            | Bắt buộc, trim, viết thường toàn địa chỉ; định dạng theo `z.email()`, tối đa 254 ký tự. Không bỏ dấu chấm hoặc `+tag`; dùng cùng chuẩn hóa ở register/login/unique index. Chưa hỗ trợ email Unicode ngoài validator hiện tại |
| `displayName`                      | Bắt buộc, 1–80 Unicode code point sau trim; không chỉ có khoảng trắng                                                                                                                                                        |
| Password mới                       | 15–128 Unicode code point; cho phép Unicode/khoảng trắng, không bắt trộn hoa/số/ký hiệu; không trim/normalize/cắt ngắn                                                                                                       |
| Password login / `currentPassword` | 1–128 code point; giữ nguyên và kiểm hash. Không áp min 15 của mật khẩu mới để khóa dữ liệu tài khoản cũ                                                                                                                     |
| Body `requestId`                   | UUID bắt buộc với PATCH tên và đổi mật khẩu, độc lập ID trace server ngoài envelope                                                                                                                                          |

Object input strict, thiếu field hoặc field lạ đều bị từ chối; không nhận `actorId`, `userId`, `role`, `authSessionId` để xác định người thực hiện. Byte limit của body và quota auth kiểm ở server; validation schema không thay limiter hoặc kiểm mật khẩu phổ biến.

Hướng mật khẩu tham khảo [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver): min 15 khi chỉ dùng mật khẩu, cho phép max ít nhất 64. Max 128 là lựa chọn của dự án; giữ nguyên Unicode theo quy ước hiện hành, không tuyên bố đáp ứng toàn bộ NIST. M1 review blocklist/chi phí hash và tải đồng thời ở T3.1/T3.2 trước handler.

## 3. HTTP API

Prefix `/api/v1`. GET không có body/query nghiệp vụ. Response giữ `{ data, requestId }`; error giữ `{ error, requestId }`. ID trace do server tạo, không phải credential hoặc cơ chế chống trùng.

| Method / path                | Input JSON                                    | Thành công               | Quyền / tác động                                                                                          |
| ---------------------------- | --------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| GET `/auth/csrf`             | —                                             | 200, `{ csrfToken }`     | Không cần auth; cấp cookie CSRF có chữ ký, không tạo phiên auth                                           |
| POST `/auth/register`        | `email`, `password`, `displayName`            | 201, `AuthenticatedData` | CSRF/Origin hợp lệ; User và phiên cùng thành công rồi Set-Cookie, rotate CSRF                             |
| POST `/auth/login`           | `email`, `password`                           | 200, `AuthenticatedData` | CSRF/Origin hợp lệ; cấp phiên mới, thu phiên trình duyệt đang dùng nếu còn hợp lệ; giữ phiên độc lập khác |
| GET `/auth/me`               | —                                             | 200, `AuthenticatedData` | Phiên hợp lệ; khôi phục user/CSRF khi reload, không gia hạn auth                                          |
| POST `/auth/logout`          | `{}`                                          | 200, `data: null`        | CSRF/Origin hợp lệ; thu phiên hiện tại, clear cookie; lặp không thu phiên khác                            |
| GET `/users/me`              | —                                             | 200, `OwnUser`           | Phiên hợp lệ, chỉ đọc chính chủ                                                                           |
| PATCH `/users/me`            | `displayName`, `requestId`                    | 200, `OwnUser`           | Phiên/CSRF/Origin hợp lệ; chỉ đổi tên, không yêu cầu mật khẩu                                             |
| POST `/auth/change-password` | `currentPassword`, `newPassword`, `requestId` | 200, `data: null`        | Phiên/CSRF/Origin hợp lệ; đúng mật khẩu hiện tại; thu mọi phiên và clear cookie sau thành công            |

Register/login không accept lời mời Workspace. FE quay lại lời mời bằng đích nội bộ hợp lệ; không thêm redirect URL tùy ý vào auth body. Không nhận avatar URL/publicId qua PATCH tên.

### Cookie và CSRF

1. Trước register/login: GET `/auth/csrf`, trình duyệt nhận cookie CSRF có chữ ký và token trong JSON. Mutation gửi token qua header đề xuất `X-CSRF-Token`; server kiểm cookie/chữ ký, token và Origin.
2. Register/login thành công: cookie auth `HttpOnly; Secure; SameSite=Lax`, rotate CSRF và trả token mới. Không trả token phiên trong JSON hoặc lưu localStorage.
3. Reload: GET `/auth/me` kiểm auth, trả context CSRF hiện hành cùng User và hạn phiên. Nếu cần bootstrap CSRF lại, gọi GET `/auth/csrf`; không tạo phiên auth hoặc gia hạn qua GET.
4. Socket.IO: cookie trình duyệt và `handshake.auth.csrfToken`; M4 kiểm Origin/CSRF/phiên rồi dựng identity server. Header/socket field cần M4 review ở PR này.
5. Logout/đổi mật khẩu thành công clear cookie đúng tên/path/domain và vô hiệu context CSRF cũ; lần login sau bootstrap mới. JSON auth/profile/CSRF đặt `Cache-Control: no-store`.

Hạn auth tuyệt đối 7 ngày là cấu hình khởi đầu theo plan, không tự gia hạn. Tên cookie, định dạng/độ dài token, chữ ký và hạn CSRF thuộc Q3/T4.4; không hard-code secret/config trong contracts. Browser local/staging cần HTTPS phù hợp cookie Secure.

### Retry và mất kết nối

- Logout lặp với CSRF/Origin hợp lệ, phiên đã thu/không còn: 200 `data: null`, clear cookie. Nếu CSRF không còn hợp lệ thì bootstrap lại; không bỏ bảo vệ CSRF để đạt lặp an toàn.
- Register/login timeout: kiểm `/auth/me` trước, không tự gửi lại vô hạn. Unique email ngăn User trùng nhưng không bảo đảm trả lại response đăng ký cũ; nếu chưa xác định, cho người dùng đăng nhập.
- PATCH tên timeout: đọc lại `/users/me`. Đổi mật khẩu timeout: có thể đã đổi và thu phiên; không tự retry mutation cũ hoặc khẳng định rollback. Yêu cầu đăng nhập lại/kiểm kết quả thực tế.
- Body `requestId` của mutation là operation ID dự kiến; nơi lưu/thời hạn dedupe và read-back thuộc T5. Chưa có exactly-once hoặc endpoint tra kết quả. ID trace HTTP ngoài envelope vẫn do server tạo mỗi lần gọi.

## 4. Lỗi và ví dụ

| Trường hợp                                       | Status / code                                | Kết quả cần giữ                                                      |
| ------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------- |
| Sai input/thiếu field/field lạ                   | 400 `VALIDATION_ERROR`                       | FieldErrors chỉ có tên field và thông báo an toàn; không echo secret |
| Email đăng ký trùng                              | 409 `EMAIL_EXISTS`                           | Không User/phiên dở; không dùng mã này khi login                     |
| Email không tồn tại hoặc password sai            | 401 `INVALID_CREDENTIALS`                    | Cùng thông báo “Email hoặc mật khẩu không đúng.”                     |
| Chưa có/giả/hết hạn/thu phiên hoặc User DISABLED | 401 `AUTH_REQUIRED`                          | Không trả hồ sơ, không nhận quyền socket cũ                          |
| CSRF/Origin sai                                  | 403 `CSRF_INVALID`                           | Không cấp phiên hoặc ghi dữ liệu                                     |
| `currentPassword` sai                            | 400 `VALIDATION_ERROR`                       | Không đổi hash hoặc thu phiên                                        |
| Hash/version đổi sau khi xác minh                | 409 `CONFLICT`                               | Không ghi đè từ kiểm chứng cũ                                        |
| Body quá lớn / vượt số lần thử                   | 413 `PAYLOAD_TOO_LARGE` / 429 `RATE_LIMITED` | Theo cấu hình server; Retry-After khi có                             |
| DB/cleanup không sẵn sàng                        | 503 `DEPENDENCY_UNAVAILABLE`                 | Nếu chưa rõ kết quả thì báo chưa xác nhận, không báo rollback giả    |
| Lỗi không dự kiến                                | 500 `INTERNAL_ERROR`                         | Thông báo chung, requestId; không stack/Mongo error                  |

Ví dụ register hợp lệ (tên/email được trim, password giữ nguyên):

```json
{
  "email": " Quan+web@Example.com ",
  "password": " hoc cung nhom web 2026 ",
  "displayName": " Quân "
}
```

Ví dụ response register/login/me:

```json
{
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "quan+web@example.com",
      "displayName": "Quân",
      "avatarUrl": null
    },
    "expiresAt": "2026-11-13T02:00:00.000Z",
    "csrfToken": "example-csrf-token"
  },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

Ví dụ invalid: `email: "quan@"`, `displayName: "   "`, password mới 14 hoặc 129 code point; thêm `role: "OWNER"` khi register; thêm ID của B vào PATCH tên của A. Route `/users/me` luôn nhắm chính chủ, nên field ID B bị validation từ chối; không thêm API sửa người khác để minh họa 403. Route hồ sơ người khác chưa hỗ trợ trả 404. Cookie B là credential của B, không phải tình huống schema có thể phân biệt với A.

Ví dụ sai mật khẩu hiện tại:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Mật khẩu hiện tại không đúng.",
    "fieldErrors": [{ "field": "currentPassword", "message": "Mật khẩu hiện tại không đúng." }]
  },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

## 5. Identity và thu phiên cho M2/M4

`requireAuth` là hàm nội bộ dự kiến: adapter server đọc cookie, kiểm hash/hiệu lực phiên/User và trả `AuthenticatedContext`. Lỗi AUTH_REQUIRED hoặc DEPENDENCY_UNAVAILABLE, không truyền raw cookie. M2/M4 vẫn kiểm membership/quyền kênh; auth hợp lệ chưa đủ quyền chat/LIVE. Context chỉ dùng cho thao tác hiện hành, không giữ như grant vĩnh viễn trong socket.

| Tình huống                    | Phạm vi thu và trách nhiệm                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Logout / hết hạn              | M1 xác định authSessionId; M2/M4 ngừng tài nguyên/fanout đúng phiên, giữ phiên độc lập khác                                             |
| Đổi mật khẩu                  | M1 xác định User và mọi phiên của User; phối hợp M2/M4 thu truy cập/socket/media. Không coi là host chủ động rời để tự kết thúc meeting |
| Await/reconnect sau thu phiên | Kiểm hiệu lực hiện tại; không cấp lại từ identity hoặc room Socket.IO cũ                                                                |

Login và đổi mật khẩu dùng cùng khóa User/CAS: băm/xác minh ngoài khóa, trước ghi kiểm lại phiên và hash/version đã xác minh. Login bằng mật khẩu cũ không được cấp phiên hợp lệ sau khi đổi mật khẩu hoàn tất. Cập nhật hash và thu mọi phiên cùng transaction; phối hợp chốt chặn/cleanup theo [kiến trúc](../architecture.md), không đặt cleanup trong callback transaction chạy lại. Chỉ báo thành công sau khi các điều kiện thu quyền đã xác nhận.

Interface revoke đầy đủ, reason/target/timeout và xác nhận cleanup thuộc T1.2/T5 với M2/M4; PR này không tạo coordinator hoặc socket event mới.

## 6. Phần cần review và kiểm tiếp

| Điểm                                                      | Owner / reviewer       | Task chốt trước consumer                     |
| --------------------------------------------------------- | ---------------------- | -------------------------------------------- |
| Chuẩn hóa email, ví dụ/giới hạn input và DTO trong PR này | M1 / M4                | T1.1; trước T2.1/T3.2/T4.1                   |
| Cookie/CSRF, HTTPS local, hạn tuyệt đối và nhiều tab      | M1 + M4                | Q3, T4.4/T4.2                                |
| Hash/blocklist/limiter/tải auth                           | M1 + reviewer kỹ thuật | Q1, T3.1/T3.2/T3.3                           |
| Thu phiên, retry/unknown commit và read-back              | M1 + M4/M2             | T1.2/T5 trước nghiệm thu logout/đổi mật khẩu |
| Upload/thay/xóa avatar Cloudinary, quota và cleanup       | M1 + M2                | Q10, T1.3 trước T18                          |

Schema tests kiểm input, Unicode, dữ liệu output và field không được lộ. **Chưa kiểm hành vi HTTP/socket** vì endpoint chưa có. Các task chức năng phải kiểm: register → reload → logout; hai browser logout chỉ một phiên; đổi mật khẩu thu cả hai; sai currentPassword giữ phiên; login đồng thời đổi mật khẩu; cookie cũ/reconnect bị từ chối; từ link mời không tự tham gia Workspace. M4 review PR trước khi công bố contract sẵn sàng tích hợp.
