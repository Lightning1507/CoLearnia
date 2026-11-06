# Quy ước API và backend

**Áp dụng từ 05/11/2026 cho cả 5 miền.** Đây là quy ước chung để viết và review code. Endpoint trong proposal vẫn là thiết kế dự kiến; mỗi task phải chốt schema và ví dụ với bên sử dụng trước khi tích hợp. Không cần thiết kế toàn bộ API của các sprint sau ngay lúc này.

Đọc cùng [bảng mã lỗi](error-codes.md), [contracts theo miền](README.md), [kiến trúc](../architecture.md) và [WBS/điểm giao](../planning/task-consolidation.md). Quy tắc quyền và vòng đời lấy từ tài liệu product; tài liệu này không mở rộng quyền hoặc tính năng.

## 1. Chọn cách giao tiếp

| Trường hợp                                           | Dùng gì?                     | Ví dụ                                                 |
| ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| Trình duyệt gọi auth, quản trị, history/list         | HTTP REST                    | Đăng nhập, tạo Workspace, lấy trang tin               |
| Lệnh và cập nhật trong cuộc họp, realtime chat/board | Socket.IO                    | Vào nhóm, đổi host, tin mới, nét vẽ                   |
| Hai miền trong cùng backend gọi nhau                 | Hàm/interface nội bộ         | M1 gọi conversation factory M2 trong cùng transaction |
| Truyền tệp hoặc video                                | HTTP stream do M2 kiểm quyền | Upload, tải tệp, phát/tua video                       |

Một hành vi có một application service/policy. Nếu có cả HTTP và socket thì hai adapter gọi cùng phần xử lý, không viết hai bản kiểm quyền. Không tạo HTTP API nội bộ giữa năm miền trong cùng app process. Không gửi byte tệp/video qua socket.

## 2. URL và method

- API sản phẩm có prefix `/api/v1`; đường dẫn trong proposal như `/workspaces/:wid` được hiểu là đặt dưới prefix này. Giữ `/health/live` và `/health/ready` riêng cho vận hành.
- Tên resource số nhiều, chữ thường, nhiều từ dùng dấu gạch nối; field JSON dùng `camelCase`. Ví dụ `/workspaces/:workspaceId/channels`. Khi chốt endpoint mới dùng tên tham số đầy đủ, không cần đổi hàng loạt ví dụ cũ `:wid/:cid`.
- `GET` chỉ đọc, không tạo dữ liệu hoặc thu quyền. `POST` tạo resource hoặc thực hiện hành vi không phù hợp cập nhật field. `PATCH` cập nhật một phần; schema phải liệt kê field được sửa. `PUT` đặt trạng thái của resource xác định; `DELETE` gỡ resource/quyền đó.
- Ví dụ `PUT /channels/:channelId/access/:userId` đặt quyền PRIVATE; gọi lại không tạo grant trùng. Không nhận Mongo update operators hoặc đối tượng update tùy ý từ client.
- Phân biệt danh sách nội dung với danh sách quản trị. Owner/admin thấy metadata quản trị không có nghĩa được đọc nội dung PRIVATE hoặc DM.

## 3. Dữ liệu và validation

Schema Zod ở `packages/contracts/src`, FE/BE import qua `@colearnia/contracts`, type suy từ schema. Input dùng `z.strictObject`; kiểm riêng params, query và body. Query phải parse có chủ đích, không ép chuỗi `"false"` thành boolean bằng truthiness hoặc để `limit=abc` thành giá trị mặc định.

- ObjectId của document: chuỗi hex 24 ký tự khi ra API. Runtime ID, requestId và clientMessageId: UUID theo thiết kế. `resourceIdSchema` scaffold hiện còn rộng, chưa thay validation đúng loại ID.
- Ngày giờ: chuỗi ISO 8601 UTC có `Z`; duration phải ghi đơn vị trong tên, ví dụ `durationMinutes`. Không trộn phút, giây, millisecond trong cùng field.
- `null` nghĩa là không có giá trị theo schema; field optional nghĩa là có thể bỏ qua. Với PATCH, bỏ field là giữ nguyên; `null` chỉ xóa giá trị khi schema cho phép. Enum lấy từ nguồn nghiệp vụ, không tự dịch tên enum sang tiếng Việt.
- Chuỗi có trim hay không phải ghi rõ. Tên/text đếm Unicode code point thống nhất giữa FE/BE/DB; không mặc định `.max()` theo UTF-16 đã đúng quy tắc. Không trim hay normalize mật khẩu ngầm.
- Giới hạn body, số phần tử, byte upload, số điểm nét, timeout và concurrency phải hữu hạn theo từng loại tải. Không lấy giới hạn JSON 32 KiB hiện có áp cho toàn bộ upload/media.
- Output là DTO/schema riêng, không trả nguyên Mongoose document. Không trả passwordHash, session/token hash, credential, storage key hoặc URL kho riêng tư.

ID hợp lệ chỉ chứng minh đúng định dạng. Actor lấy từ phiên server; kiểm membership, role, channel access, scope và generation hiện hành trước đọc/ghi/fanout. Không lấy role hoặc actorId do client gửi làm quyền. Các ID đích do client chọn vẫn cần kiểm quan hệ và quyền ở server.

## 4. Response HTTP

Giữ cấu trúc đang có; không thêm wrapper `success` hoặc `status` riêng cho từng miền.

```json
{
  "data": { "id": "507f1f77bcf86cd799439011", "name": "Lớp Web" },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

Lỗi theo [bảng mã lỗi](error-codes.md):

```json
{
  "error": { "code": "CONFLICT", "message": "Dữ liệu đã thay đổi. Hãy tải lại trước khi sửa." },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

| Status  | Cách dùng                                                                              |
| ------- | -------------------------------------------------------------------------------------- |
| 200     | Đọc/cập nhật/xóa đã hoàn tất; thao tác không có dữ liệu trả `data: null`               |
| 201     | Tạo mới đã hoàn tất; trả DTO mới và `Location` nếu có endpoint đọc resource            |
| 202     | Đã nhận công việc chạy tiếp; trả ID/trạng thái và cách đọc kết quả, không báo đã READY |
| 204     | Chỉ dùng khi contract ghi rõ không có body; không gửi JSON kèm 204                     |
| 4xx/5xx | HTTP status và `error.code` theo bảng chung; không dùng 200 bọc lỗi                    |

Stream tệp/video không bọc byte trong JSON. Dùng Content-Type, Content-Disposition và Range/206/416 theo contract M2; lỗi trước khi gửi header vẫn dùng error JSON. Nếu lỗi giữa stream, dừng stream và ghi log; không nối JSON lỗi vào byte video. Health/readiness giữ contract riêng đang có, kể cả readiness 503 có `data` trạng thái.

## 5. requestId, retry và revision

**requestId để tra một lần gọi; không tự là cơ chế chống trùng.** HTTP server tạo UUID, trả trong body và header `X-Request-Id` như code hiện có; không tin header tùy ý để thay ID server. Socket command nhận requestId UUID và trả lại trong ack để client đối chiếu. Payload sai/mất requestId: server tạo ID cho lỗi; không echo chuỗi không hợp lệ. Log server ghi context kết nối/actor đã xác thực cùng ID; requestId không phải credential.

Các proposal đang dùng requestId làm khóa chống trùng cho một số mutation: schema từng thao tác phải ghi rõ điều đó. Khi HTTP retry một thao tác như vậy, giữ requestId trong body theo contract, còn ID của lần HTTP mới vẫn do server sinh; log cả hai với tên phân biệt. Ví dụ: body giữ operation requestId `U` qua hai lần thử; mỗi lần HTTP nhận trace requestId `H1`, `H2` khác nhau trong header/response. Log nối trace với operation để tra được cả hai. Không bật chống trùng mặc định cho mọi POST hoặc tạo kho idempotency mới chỉ từ quy ước này.

- Message giữ `clientMessageId`; thao tác khác chỉ dùng operation key khi contract định nghĩa scope, nơi lưu, thời hạn và cách tra kết quả. Cùng key khác payload phải conflict. Client timeout không chứng minh server thất bại.
- Sau timeout/unknown commit: đọc lại kết quả bằng ID/key được contract hỗ trợ trước khi gửi lại. Không tự retry tạo nhóm, gửi tin, start recording bằng key mới. Retry lỗi mạng/503/429 chỉ trong giới hạn và khi thao tác an toàn hoặc đã có dedupe; tôn trọng `Retry-After` khi có.
- Dùng `expectedRevision` cho tài nguyên bền khi cần; runtime giữ đúng epoch/callGeneration/policyRevision/source/board version theo miền. Không thay chúng bằng một `version` chung.
- Kiểm revision dưới cùng cơ chế điều phối/CAS với mutation. Revision cũ trả CONFLICT; FE tải lại và để người dùng quyết định, không tự ghi đè bằng dữ liệu cũ.

## 6. Phân trang và danh sách

Danh sách có khả năng tăng dùng cursor opaque, không gửi toàn bộ lịch sử. Mỗi endpoint chốt `limit` mặc định/tối đa trong schema, thứ tự ổn định và hướng đi; không tự áp một mức cho mọi history/list.

```json
{
  "data": { "items": [], "nextCursor": null },
  "requestId": "1c3b90f0-0c26-4e98-9a60-000000000001"
}
```

`nextCursor: null` là hết trang; không bắt buộc tính total. Cursor không cấp quyền: kiểm lại ACL mỗi trang, không nhận cursor khác resource/filter. Cursor sai trả VALIDATION_ERROR; cursor hết hiệu lực do trạng thái đổi trả CONFLICT khi người gọi vẫn có quyền biết resource. History/catch-up M2 có thêm checkpoint/syncToken theo contract riêng; timestamp hoặc ObjectId đơn thuần không chứng minh không sót tin.

## 7. Socket command, ack và event

- Tên command theo `resource.action`, event diễn tả kết quả như `host.changed`. Tên cụ thể và payload do owner/consumer chốt; không đổi tên những command đã được review chỉ để làm đồng loạt.
- Command có input schema strict và ack schema riêng. Ack dùng cùng dạng `{ data, requestId }` hoặc `{ error: { code, message }, requestId }`; không thêm HTTP status vào payload socket. Dùng chung ý nghĩa mã lỗi.
- Ack một lần cho một lượt xử lý. Nếu chỉ xác nhận bắt đầu công việc thì trả trạng thái đang chạy và ID theo dõi; không dùng ack thành công để chứng minh upload/recording đã READY.
- Event có schema và context tối thiểu để consumer loại packet cũ. Không bắt chat TEXT/DM mang epoch/callGeneration của LIVE. Không phát event private vào room Workspace để FE tự lọc.
- Mất ack hoặc reconnect không bảo đảm phát lại: client resync snapshot/history phù hợp, dedupe bằng ID/version đã chốt. Command quyền cũ không replay mù sau reconnect. Room Socket.IO chỉ là nơi gửi event, không là nguồn quyền.
- Mỗi command phải ràng payload và schema ID/context đúng miền. Xem [contract phiên họp](session-commands.md) cho cách tạo envelope strict và ack riêng theo lệnh.

## 8. Cách viết backend

Luồng thông thường: **route/socket adapter → application service → policy và repository/adapter cần thiết → DTO/ack**.

| Phần                 | Trách nhiệm                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| Route/socket adapter | Parse input, lấy identity server, gọi service, map kết quả/lỗi ra transport    |
| Application service  | Điều phối use case, transaction/CAS/gate, kiểm lại quyền/trạng thái và cleanup |
| Policy               | Quy tắc thuần quyết định allow/deny từ dữ liệu được server cung cấp            |
| Repository/adapter   | I/O MongoDB, kho file, media hoặc lời gọi nội bộ sang miền khác                |

Không tạo interface/class cho mọi hàm nếu không có nhu cầu tách. Internal port phải ghi input/output/error, bên sở hữu và bên dùng; nhận trusted context do server dựng, không nhận raw HTTP request hay tự gọi HTTP vòng về app.

Dùng Express 5 async handler trả Promise; lỗi bất ngờ đi tới error middleware cuối chuỗi. Không catch tất cả rồi trả 400. Service dùng lỗi có kiểu/kết quả phân biệt được; adapter map qua bảng chung, không so sánh chuỗi message. Không đưa dependency Express vào policy hoặc packages/contracts. Phần kiểu lỗi service và middleware nghiệp vụ do M1 cung cấp theo task nền, chưa có chỉ vì đã chốt quy ước.

Quyền phải được kiểm lại tại điểm mutation/fanout quan trọng. Thu quyền phối hợp các miền và đóng tài nguyên đúng phạm vi theo kiến trúc, không chỉ xóa DB hoặc ẩn UI. Không giữ transaction/gate khi chờ picker, upload, encode hoặc client ack; callback trễ phải kiểm generation và dọn tài nguyên cũ. Dùng chung Mongo connection/pool, truyền transaction session qua port cần tính nguyên tử.

Cookie session/CSRF/Origin theo baseline auth; CORS không thay auth hay CSRF. GET không tạo side effect. HTTP/session riêng tư đặt cache phù hợp, mặc định `Cache-Control: no-store` cho JSON nhạy cảm; byte stream theo policy M2. Log requestId, mã lỗi và thời gian xử lý; không ghi password/cookie/CSRF token/link mời/token, nội dung DM hay byte file. Không log raw body/URL chứa token.

## 9. Trước khi một contract được dùng

Mỗi task giao tiếp cần một mô tả ngắn trong proposal/task/PR, đặt cạnh schema hoặc link đến schema; không lập thêm sổ trạng thái:

1. Owner, consumer, FR/AC hoặc mục tiêu nền; endpoint/method hay tên command/port.
2. Input/output/ack/event, ID/đơn vị/giới hạn, trường được bỏ hoặc null.
3. Auth/ACL và revision/context; audience event/file.
4. Mã lỗi/status áp dụng; timeout, retry/dedupe và cách tra kết quả chưa rõ.
5. Ví dụ thành công, validation, sai quyền/không thấy resource, stale/retry và cleanup khi liên quan.
6. Consumer review cùng PR; build contracts trước typecheck consumer. Có test service/API với hai identity khác quyền; mock/schema pass không là nghiệm thu tích hợp.

Lượt S01 cung cấp quy ước và bảng mã lỗi, schema envelope/factory và hằng status chung. Các task contract tiếp theo bổ sung schema theo từng miền. Đối chiếu [mục lục contracts](README.md) trước khi dùng schema để triển khai endpoint hoặc handler.

S01 trong WBS có đầu ra quy ước này; M1 triển khai phần nền dùng chung, M4 review, từng owner chốt lỗi/payload của miền mình với consumer. Lập sprint có thể tiếp tục; chỉ đóng chi tiết contract của các task sắp triển khai, không đợi mọi API tương lai.

## Nguồn đối chiếu

Quy ước lựa chọn cho CoLearnia dựa trên baseline hiện hành và các nguồn sau; chúng không tự quyết định nghiệp vụ của dự án:

- [HTTP Semantics — RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html): method/status và hành vi HTTP.
- [Express 5 — Error handling](https://expressjs.com/en/guide/error-handling/): async handler và middleware lỗi.
- [Socket.IO — Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/): ordering và giới hạn delivery/retry; ứng dụng phải bổ sung đồng bộ/chống trùng khi cần.
