# Review tài liệu và database trước push — 01/11/2026

> Review lịch sử trước kickoff 02/11; không là baseline cho DISCUSSION auto-create, random ACTIVITY hoặc recording mới. Nguồn hiện hành ở group modes/recording và decision-status.

## Kết luận

Bộ tài liệu đủ làm baseline thiết kế để chia task triển khai; **chưa là database hoặc hệ thống LIVE đã nghiệm thu**. Không thấy lý do bỏ collection hoặc bổ sung UC CRUD chỉ để hợp thức hóa dữ liệu hiện tại. Sau xác nhận gộp GRP-10 vào GRP-09, giữ 46 UC, 13 collection và 34 index đích; 19 index query vẫn cần explain, không xem mọi index đã được tối ưu.

Đây là review của cùng agent trên working tree, không thay reviewer khác của nhóm. Không chạy MongoDB/migration/seed/reset hoặc chỉnh Astah trong lượt này. Chưa commit/push.

## Findings và xử lý tại nguồn

| Mức  | Finding                                                                                                                                                     | Xử lý                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cao  | Khẳng định Mongoose Number luôn là BSON double không đúng với dependency đang cài; validator dựa giả định đó có thể chặn document hợp lệ                    | Sửa [integrity 3.1](database/integrity-and-migrations.md#31-kiểu-defaults-và-dữ-liệu-có-nguồn): numeric types thực tế + miền nguyên an toàn, kiểm cả insert/$inc và chuyển Long ra API. Probe offline: 0/42 → Int32; 2^31/MAX_SAFE_INTEGER → Double. Không gọi đây là test validator trên Mongo |
| Cao  | Quyền tải đang nói rõ kiểm ACL nhưng chưa rõ vòng đời download đang stream; giữ gate suốt stream cũng gây nghẽn cả Workspace                                | [Integrity 4.1](database/integrity-and-migrations.md#41-cơ-chế-chung) yêu cầu registry/hủy stream khi revoke/expiry và kiểm Range/retry; nhả gate trước truyền byte. Đồng bộ lifecycle/collection-design/architecture; không hứa thu hồi byte đã gửi                                            |
| Cao  | Session queue có thể đang await DB khi deadline đến; serialize không tự bảo đảm không phát nội dung sau hạn                                                 | Làm rõ tại integrity/architecture: kiểm deadline/epoch/quyền sau await và trước grant/read/fanout; DB có thể đã commit thì read-back/reconcile, không giả rollback DB/RAM nguyên tử. DB-09/10 cần kiểm DB chậm qua deadline                                                                     |
| Vừa  | Policy nói host “đóng nhóm”, “mọi participant về MAIN” mà không giới hạn nhóm đích, dễ hiểu thành host đóng ACTIVITY hoặc đóng một DISCUSSION kéo cả lớp về | Sửa [policy 8.1/8.2](product/groups-media-policy.md#81-host-group-và-hỗ-trợ): host đóng DISCUSSION; đóng một nhóm chỉ tác động nhóm đó, ACTIVITY theo deadline/lỗi/kết thúc phiên                                                                                                               |
| Vừa  | Mục lục sơ đồ/decision-status/catalog chứa nhiều snapshot và lời nhắc bước tiếp đã làm xong, dễ lấy nhầm làm baseline                                       | Rút gọn thành trạng thái hiện hành và link nguồn; giữ chênh lệch Astah công khai, không coi xuất PNG là sửa nghiệp vụ                                                                                                                                                                           |
| Vừa  | Checker biết một số tài liệu DB/capacity tồn tại qua link nhưng chưa kiểm link bên trong chúng                                                              | Thêm nguồn DB/capacity/Activity vào danh sách quét và test link hỏng trên từng nguồn; không mở rộng thành validator nghiệp vụ                                                                                                                                                                   |
| Thấp | File Astah batch3 cạnh file đang chỉnh dễ bị dùng nhầm; backup/lock có thể bị đưa lên Git                                                                   | Chuyển batch3 vào [archive](archive/diagrams/README.md); giữ file gốc hiện hành. Ignore .asta.bak/.asta.lock; không xóa bản lịch sử hoặc sửa binary của người dùng                                                                                                                              |
| Vừa  | CONTRIBUTING mô tả branch protection như settings GitHub đã được bật dù chưa có bằng chứng                                                                  | Đổi thành chính sách cần cấu hình/xác minh; không tuyên bố đã kiểm GitHub                                                                                                                                                                                                                       |

Cơ sở đối chiếu: [MongoDB BSON types](https://www.mongodb.com/docs/v8.0/reference/bson-types/), [query validation](https://www.mongodb.com/docs/v8.0/core/schema-validation/specify-query-expression-rules/), [multikey indexes](https://www.mongodb.com/docs/v8.0/core/indexes/index-types/index-multikey/), [transactions](https://www.mongodb.com/docs/v8.0/core/transactions-production-consideration/). Probe serializer dùng Mongoose/MongoDB driver đang cài trong repo, không kết nối database. Quy tắc gate/stream/deadline là thiết kế ứng dụng CoLearnia để thực hiện quyền đã chốt, không phải khả năng MongoDB tự enforce ACL.

## Đánh giá database theo luồng chính

- **Workspace/quyền:** membership riêng, unique cặp, grant PRIVATE gắn incarnation; owner pointer/CAS và transaction roles phù hợp mô hình một process. Không dùng owner/admin thay content ACL hoặc khôi phục PRIVATE sau rejoin.
- **Chat:** conversation theo kind và pairKey scalar; message riêng, thread một cấp bằng root reference/counter; dedupe có kiểm payload. Không nhúng toàn lịch sử/member vô hạn hoặc tạo collection thread dư.
- **Tệp:** byte ngoài Mongo, metadata scope/binding có kiểu, STAGED reservation và stamp; READY tải theo quyền hiện tại. Purge byte trước metadata, reply trước root; TTL chỉ authSessions. Đây là thiết kế cần test, chưa có implementation.
- **LIVE/board:** metadata bền khác state quyền runtime; không ghi mỗi heartbeat/RTP/nét vẽ xuống Mongo. Restart kết thúc phiên, không phục hồi nhóm/board qua lastScope. Phù hợp giới hạn MVP đã chấp nhận.
- **Tải:** gate theo Workspace, aggregate quota và stamp rộng là đánh đổi đơn giản nhưng có thể thành nút thắt. Giữ [cổng capacity](capacity.md), thử 25 trước/50 sau; không thêm Redis/sharding/worker pool hoặc hứa phục vụ số người chỉ từ schema. Frame 20 MiB/session chỉ profile nhỏ; phải khai báo budget hữu hạn theo số board trước profile lớn.

Không có bằng chứng thực nghiệm để kết luận unique/transaction/cleanup/quota đã đúng hoặc capacity đạt. DB-01–12 và test media/TURN vẫn là việc triển khai, không thể hoàn thành bằng review Markdown.

## Chênh lệch còn lại trước khi coi toàn bộ artifact đã đồng bộ

1. [Astah](product/diagrams/README.md): đã kiểm bản xuất mới sau chỉnh sửa của người dùng: WS-15 nối owner/admin, chuyển host không còn association thành viên; một oval GRP-09 cho một/tất cả DISCUSSION. Catalog và bảng dữ liệu đã đồng bộ gộp GRP-10 vào GRP-09, tổng 46 UC. Kiểm này dựa trên giao diện/ảnh xuất, chưa audit toàn bộ definition/model IDs/font qua API.
2. [Contracts](contracts/README.md): source scaffold còn RESTRICTED/FREE-MODERATED và resourceId rộng; tài liệu đã nói rõ khoảng cách. Phải đồng bộ trước consumer nghiệp vụ; không sửa executable schema trong task tài liệu.
3. Hash/input limits, nhánh host thiếu ứng viên/nhiều sự cố, retention metadata và cấu hình tải còn mở theo [decision-status](decision-status.md). Không mở rộng review thành xử lý mọi trường hợp hiếm; chi tiết còn thiếu giải quyết trong task phụ thuộc.

Có thể push để nhóm review **baseline thiết kế**, kèm các giới hạn contracts và kiểm chứng runtime trên. Chưa nên mô tả PR là “nghiệp vụ/bản vẽ/code hoàn toàn đồng bộ”, “database hoàn thiện triển khai” hoặc “LIVE đạt 25/50”.

## Kiểm tra thực chạy

- Harness/ranh giới import: **52/52 test pass**; checker **85 nguồn/tệp/liên kết/runtime pass**.
- Quét bổ sung toàn bộ Markdown ngoài archive và entry points: **55 file, 618 link nội bộ, không thiếu file/anchor** theo bộ dò heading local. Bộ dò này không là parser Markdown/GitHub hoàn chỉnh; checker chính thức vẫn không kiểm anchor.
- Prettier toàn repo theo ignore hiện hành, ESLint toàn repo, typecheck contracts/server/web: **pass**. Technical plan và archive giữ quy tắc không format tự động sẵn có.
- Build contracts/server/web: **pass**. Vite còn cảnh báo chunk khoảng 599.49 kB; chưa tối ưu bundle trong task tài liệu.
- Vitest **7/7 pass** khi chạy ngoài sandbox với quyền mở loopback. Lượt trong sandbox thất bại 4 test HTTP vì `listen EPERM 127.0.0.1`; không sửa test hoặc hạ guard để vượt lỗi.
- `git diff --check`: **pass**. Không thay lockfile/dependency/code nghiệp vụ, không chạy Docker/MongoDB, DB-01–12, restore/explain hoặc media smoke/load.

**Giới hạn lệnh tổng:** `pnpm --version` gọi nhầm shim Corepack từ Node hệ thống 24 và gặp EPERM tại cache; không sửa cài đặt toàn máy. Vì vậy chưa chạy nguyên văn `pnpm check`. Đã chạy các bước tương ứng bằng `node_modules/.bin/node` (26.12.1) và binary local: `node --test` + checker, Prettier, ESLint, TypeScript theo từng tsconfig, Vitest và Vite. Trước push/CI nên xác nhận terminal dùng pnpm 11.5.2 trực tiếp theo [runbook](runbooks/local-development.md), không gọi là lệnh pnpm tổng đã pass.

DBML đã kiểm cấu trúc 13 collection khớp tên nguồn, 30 tham chiếu đều có đích và không trùng field; chưa có kết quả từ parser DBML chính thức hoặc import dbdiagram trong lượt này. PNG/Astah giữ nguyên nội dung người dùng; chỉ di chuyển bản batch3 lịch sử.

## Kiểm tra trước khi chia commit

Đã chạy thành công nguyên lệnh `pnpm check` với pnpm 11.5.2 tải từ npm vào thư mục tạm và Node project 26.12.1. Không đổi pnpm global, dependency, lockfile hoặc bỏ hook. Toàn bộ harness (52 test), format, lint, typecheck, test ứng dụng (7 test) và build pass; Vite còn cảnh báo chunk khoảng 599.49 kB. Kết quả này bổ sung cho giới hạn shim Corepack ở lượt review trước; terminal mặc định vẫn cần dùng đúng pnpm theo runbook.

Đã kiểm harness trên sáu snapshot tích lũy dự kiến cho các commit: lần lượt 53/53/53/55/68/85 nguồn/link/runtime pass. Chia theo đặc tả UC, sơ đồ, thiết kế MongoDB, capacity, baseline và harness; không commit code nghiệp vụ hoặc chạy DB/media từ thao tác Git này.
