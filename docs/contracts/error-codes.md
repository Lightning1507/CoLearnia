# Mã lỗi chung

Áp dụng cùng [quy ước API/backend](api-conventions.md). Mã dùng `UPPER_SNAKE_CASE`, ổn định để FE xử lý; `message` ngắn, an toàn, bằng tiếng Việt cho người dùng. FE không phân nhánh bằng nội dung message. HTTP status diễn tả nhóm kết quả, code phân biệt nguyên nhân.

Bảng này là bộ mã chung, không phải danh mục toàn bộ lỗi nghiệp vụ. Hằng kiểm được ở `packages/contracts/src/errors.ts`; `apiErrorSchema` giữ code dạng chuỗi để contract từng miền có thể bổ sung mã đã review. Mã mới phải có nghĩa, status và cách xử lý được provider/consumer thống nhất trong cùng PR; không tự thêm một tên khác cho lỗi đã có.

| Code                   | HTTP | Khi nào                                                      | FE xử lý                                                              |
| ---------------------- | ---- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| INVALID_JSON           | 400  | Body JSON không parse được                                   | Báo dữ liệu gửi không hợp lệ                                          |
| VALIDATION_ERROR       | 400  | Sai định dạng/field/giới hạn input hoặc cursor sai           | Hiển thị lỗi form; không gửi lại nguyên payload                       |
| AUTH_REQUIRED          | 401  | Chưa có phiên hoặc phiên hết hạn/bị thu                      | Về đăng nhập, không tiếp tục command cũ                               |
| INVALID_CREDENTIALS    | 401  | Email/mật khẩu không khớp                                    | Thông báo chung, không tiết lộ tài khoản tồn tại                      |
| FORBIDDEN              | 403  | Có identity nhưng thiếu quyền với đối tượng được phép biết   | Báo không có quyền; tải lại UI quyền khi cần                          |
| CSRF_INVALID           | 403  | CSRF/Origin không hợp lệ theo auth contract                  | Khôi phục context auth hợp lệ, không retry mutation mù                |
| NOT_FOUND              | 404  | Không có đích hoặc không được biết đích tồn tại              | Không hiển thị metadata đích                                          |
| CONFLICT               | 409  | Revision/trạng thái đổi hoặc cùng operation key khác payload | Tải lại/tra kết quả rồi quyết định; không ghi đè                      |
| CALL_ALREADY_ACTIVE    | 409  | Tài khoản đã sở hữu call; ticket mới chưa consume            | Giữ call cũ, yêu cầu xác nhận chuyển; không tự retry takeover         |
| EMAIL_EXISTS           | 409  | Email đăng ký đã có                                          | Hiển thị lỗi đăng ký; không dùng mã này cho login                     |
| INVITATION_UNAVAILABLE | 410  | Link mời không còn dùng được theo policy                     | Báo cần link hiện hành; không lộ Workspace private                    |
| SESSION_ENDED          | 410  | Phiên/epoch đã kết thúc; actor được phép biết đích           | Kết thúc đúng lượt resync/call; không chờ snapshot hoặc tự join lại   |
| PAYLOAD_TOO_LARGE      | 413  | Vượt giới hạn byte body/upload                               | Báo giới hạn hợp lệ của loại dữ liệu                                  |
| UNSUPPORTED_MEDIA_TYPE | 415  | Content-Type/định dạng tệp không được hỗ trợ                 | Chọn loại được cho phép; MIME khai báo không thay kiểm nội dung       |
| RATE_LIMITED           | 429  | Vượt tốc độ/tần suất yêu cầu                                 | Chờ theo Retry-After khi có; tránh vòng retry                         |
| INTERNAL_ERROR         | 500  | Lỗi bất ngờ không được map an toàn                           | Thông báo chung và requestId để tra                                   |
| DEPENDENCY_UNAVAILABLE | 503  | Phụ thuộc cần thiết tạm không phục vụ được                   | Báo tạm gián đoạn; không kết luận mutation chưa chạy                  |
| SERVER_BUSY            | 503  | Hết admission/queue/slot tạm của server                      | Backoff hữu hạn, kiểm trạng thái trước khi thử lại; không tự takeover |

403/404 là quyết định theo quyền biết đối tượng, không theo sở thích từng route. Kiểm quyền trước trả metadata hoặc lỗi trạng thái có thể lộ đích. Không dò database để trả EMAIL_EXISTS từ luồng đăng nhập. Lỗi sai mật khẩu hiện tại khi đổi mật khẩu dùng VALIDATION_ERROR với thông báo phù hợp, không coi phiên hiện tại đã hết hiệu lực hoặc tự đăng xuất.

Một số trường hợp cần mã theo miền (ví dụ nguồn share bận hoặc quota lưu trữ đầy) chưa có mã chung. Owner phải ghi rõ ở contract trước code phụ thuộc; quota byte không tự map RATE_LIMITED, lỗi nguồn bận không tự map lỗi server. Không trả mã lỗi nhà cung cấp trực tiếp.

## Đồng bộ tên từ proposal

Đợt này đổi các tên trùng nghĩa trong 5 proposal: `INVALID_INPUT` → `VALIDATION_ERROR`; `PERMISSION_DENIED` → `FORBIDDEN` (hoặc NOT_FOUND theo quyền biết đích); `STALE_STATE`, `STALE_REVISION`, `STALE_VERSION` → `CONFLICT`. Context/revision cụ thể vẫn ở schema miền và cách resync của command; đổi tên lỗi không gộp các bộ đếm phiên bản. Các mã riêng khác trong proposal chưa tự trở thành catalog đã triển khai.

## Chi tiết lỗi và retry

Envelope bắt buộc giữ `error.code`, `error.message`, `requestId`. Có thể thêm `error.fieldErrors: [{ field, message }]` cho lỗi validation; field là đường dẫn công khai như `name`, không phải tên field DB. Không chứa input đã nhập, password/token hoặc raw Zod issues. Không trả `fieldErrors` nếu làm lộ resource mà người gọi không được biết.

HTTP limiter có thể trả `Retry-After` theo giây; socket ack dùng `error.retryAfterMs` khi có thời gian chờ xác định. Field này là gợi ý thời gian chờ, không bảo đảm retry thành công hoặc lần trước chưa có tác dụng. Chưa chọn timeout/backoff chung cho mọi command; từng loại tải chốt mức hữu hạn trong task tương ứng.

## Map lỗi trong backend

- Dùng bảng `commonErrorHttpStatus` để map mã chung; adapter socket dùng cùng code, không nhúng HTTP status.
- Lỗi Zod/input có kiểm soát → VALIDATION_ERROR; parser JSON → INVALID_JSON; giới hạn byte → PAYLOAD_TOO_LARGE. Không chuyển mọi exception thành lỗi validation.
- E11000 chỉ map EMAIL_EXISTS khi đúng unique constraint email; constraint khác map theo hành vi đó. Duplicate key không tự là retry thành công. Không trả nguyên Mongo error.
- Unknown commit/timeout sau mutation phải được xử lý bằng read-back và policy của thao tác. Nếu chưa xác nhận, trả lỗi phù hợp với thông báo kết quả chưa rõ; giữ chặn quyền theo thiết kế, không báo rollback giả.
- Error middleware chung trả INTERNAL_ERROR cho lỗi chưa map, log an toàn để điều tra. Không gửi stack/query/secret cho client. Nếu stream đã gửi header, kết thúc stream thay vì ghi JSON lỗi lần hai.

Kiểm bắt buộc: status/code khớp; lỗi không lộ dữ liệu; 403/404 đúng policy; validation không echo secret; timeout/retry không tạo tài nguyên trùng. Đường file Range có 416 riêng theo HTTP contract M2; health/readiness giữ response trạng thái riêng, không ép vào bảng lỗi nghiệp vụ.
