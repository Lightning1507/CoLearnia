# CoLearnia — Technical plan

> **Sau kickoff 02/11:** DISCUSSION tạo ngay khi hợp lệ; ACTIVITY thêm random preview; RECORD-01 ghi/lưu/xem video MAIN đã vào scope. Xem [group modes](product/group-modes.md) và [recording](product/recording.md). Khung delivery hiện là 6–7 tuần, phải estimate lại sau proposal/PoC recording; bảng 4 tuần/A–E bên dưới là kế hoạch tham khảo trước mở rộng, chưa phải phân công/sprint hoặc cam kết mới.

**Phiên bản:** 2.3 · cập nhật 27/10/2026, trên nền v2.2 cùng ngày\
**Đề tài:** Nền tảng học nhóm trực tuyến tích hợp chia sẻ màn hình và tương tác thời gian thực.  
**Nhóm:** 5 thành viên; A–E là phương án phân vai tham khảo, phân công thật sẽ thống nhất sau.\
**Thời gian mục tiêu:** 4 tuần xây dựng và kiểm thử tích hợp; 1–2 tuần tiếp theo hoàn thiện triển khai, tài liệu và chuẩn bị bảo vệ.  
**Trạng thái:** phạm vi sản phẩm đã thống nhất; repository đã có scaffold web/server/contracts, cấu hình CI và hạ tầng local. Môi trường local đã cài dependency, khởi tạo MongoDB replica set và chạy mediasoup worker; web/API và readiness đã được kiểm tra. Các luồng nghiệp vụ chưa được triển khai đầy đủ; nền media vẫn cần qua PoC đầu tuần 1. Chưa có số đo cuộc gọi thực để xác nhận hiệu năng hoặc lịch hoàn thành.

Tài liệu là cơ sở chung để tạo backlog, viết contracts, triển khai và nghiệm thu. Các quy tắc nghiệp vụ dưới đây là thiết kế của CoLearnia; không phải API có sẵn của thư viện. Thông số ghi “khởi đầu” hoặc “mục tiêu thử” phải được kiểm chứng, không dùng làm cam kết hiệu năng.

**Cập nhật v2.3:** phân biệt MAIN, DISCUSSION thành viên tự tạo khi hợp lệ và ACTIVITY host tổ chức độc lập. MAIN một người share; DISCUSSION kế thừa bài giảng và cấm share riêng; ACTIVITY mỗi nhóm một share độc lập; mọi member tự bấm không xin host, board theo nguồn đó. Hệ thống tạo DISCUSSION hợp lệ rồi người được chọn bấm Vào nhóm; kết thúc DISCUSSION trước ACTIVITY và không nhận request DISCUSSION trong lượt hoạt động. Theo cập nhật TIMER-01 ngày 29/10/2026, thêm tự về MAIN và countdown chung cho lượt hoạt động, hết giờ tự kết thúc ACTIVITY và đưa người còn quyền về MAIN, không chờ host. Xem [group modes](product/group-modes.md) là nguồn chi tiết; các quy tắc này thay mô hình mọi nhóm cùng nhận MAIN của v2.2. Chưa thay code nghiệp vụ hoặc chứng minh PoC đạt.

**Lịch sử cập nhật v2.2 theo team 27/10/2026:** HELP-01 là chat text/ảnh chọn Everyone theo scope hiện tại hoặc Host riêng, kèm host vào nhóm hỗ trợ. Kết thúc chia nhóm đưa tất cả về MAIN để tự bật mic; bỏ FLOOR-01/PRESENT-01 và cơ chế floor/consent/projection. GRP-01 bao gồm thao tác về phòng chung; không tạo feature ID thay thế. Các quy tắc chi tiết, contracts đích, dữ liệu, test và backlog đã được đồng bộ; tài liệu lịch sử ngày 26/10 không ghi đè quyết định này. Đây là thay đổi thiết kế, chưa là code đã chạy.

**Bổ sung messaging ngày 27/10/2026:** Workspace mới có general TEXT; owner/admin tạo kênh khác. Thêm CHAT-02 (DM 1–1 text/ảnh/file) và CHAT-03 (thread một cấp trong TEXT). Xem [messaging](product/messaging.md) cho phạm vi, quyền và các chi tiết còn mở. Chat cuộc họp HELP-01 vẫn chỉ text/ảnh. Scope tăng cần ước lượng lại, chưa có bằng chứng đủ capacity chỉ vì bỏ floor/presentation.

**Lịch sử cập nhật v2.1:** đồng bộ runtime với repository sang Node.js 26.12.1/pnpm 11.5.2 và ghi nhận hiện trạng scaffold/local. Giữ nguyên phạm vi, kiến trúc sản phẩm và lộ trình v2.0. Các mục triển khai và kiểm thử bên dưới mô tả đích cần đạt; trạng thái đã hoàn thành phải đối chiếu source và evidence theo commit/môi trường. Native media smoke chỉ xác nhận worker/Router khởi động, chưa chứng minh camera/mic, cách ly nhóm hoặc TURN.

**Đơn giản hóa cuộc họp ngày 27/10, cập nhật 01/11/2026:** giữ baseline v2.3, thay quy tắc FREE/MODERATED cũ bằng một kiểu cuộc họp. Người bắt đầu là host; người vào sau không tự nhận host; chuyển quyền trực tiếp, không cần người nhận chấp nhận; bàn giao chính thức khác thay host tạm do mất mạng. MAIN mọi participant tự share khi trống, một nguồn tại một thời điểm, không xin host hoặc giành nguồn. DISCUSSION/ACTIVITY và hai phase giữ nguyên. [Policy](product/groups-media-policy.md) và [vòng đời host](product/live-session.md#83-chuyển-host-và-host-mất-mạng) là nguồn chi tiết; host mất kết nối được thu quyền cũ và thay tạm ngay bằng participant hợp lệ chọn ngẫu nhiên, tự hoàn quyền khi host cũ quay lại hợp lệ trong cùng phiên. Host chủ động rời khi còn giữ quyền kết thúc phiên cho mọi người; sau bàn giao chính thức người cũ rời như thành viên. Không có ứng viên/host tạm mất mạng còn cần đặc tả. Không thêm co-host/co-organizer/presenter. Đây là thiết kế, không là code đã chạy.

**Tổ chức nguồn ngày 26/10/2026:** các mục nghiệp vụ, kiến trúc và dữ liệu đã được chuyển sang tài liệu theo miền, giữ nguyên nội dung baseline. Các heading bên dưới dẫn tới nguồn chi tiết; [mục lục tài liệu](README.md) ghi cách đọc và thứ tự xử lý khi có mâu thuẫn.

**Trạng thái quyết định:** plan có cả quy tắc đã chốt, thiết kế khung, cấu hình thử và thông tin cần nhóm xác nhận; không phải mọi chi tiết implementation đều đã được chọn. Xem [bản đồ trạng thái](decision-status.md) để tra đúng nguồn. Review harness ngày 26/10 đã làm rõ cách diễn đạt ownerId trong tài liệu database, không đặt thêm unique index hoặc thay quy tắc một owner/Workspace.

**Bổ sung baseline capacity ngày 01/11/2026:** [capacity](capacity.md) sở hữu định hướng 25 người là mốc thử trước, 50 là mốc mở rộng sau khi đạt; không cam kết 100 hoặc coi số kết nối là capacity media. Giữ gate chức năng 5 người, kiến trúc một app process/worker và MongoDB Docker; camera nhận có chọn lọc, overload/queue hữu hạn và đo tải kết hợp là yêu cầu triển khai. Chưa có benchmark đạt các mốc mới, chưa thêm Redis/worker pool hoặc đổi schema từ đợt tài liệu.

## Mục lục

1. [Mục tiêu, ràng buộc và phạm vi](#1-mục-tiêu-ràng-buộc-và-phạm-vi)
2. [Luồng nghiệm thu và mô hình nghiệp vụ](#2-luồng-nghiệm-thu-và-mô-hình-nghiệp-vụ)
3. [Công nghệ và quyết định kiến trúc](#3-công-nghệ-và-quyết-định-kiến-trúc)
4. [Kiến trúc, module và trạng thái](#4-kiến-trúc-module-và-trạng-thái)
5. [Phân quyền phát, nhận và công bố](#5-phân-quyền-phát-nhận-và-công-bố)
6. [Cuộc gọi, camera và chia sẻ màn hình](#6-cuộc-gọi-camera-và-chia-sẻ-màn-hình)
7. [Freeze và vẽ cơ bản](#7-freeze-và-vẽ-cơ-bản)
8. [Điều hành, hỗ trợ và âm lượng](#8-điều-hành-hỗ-trợ-và-âm-lượng)
9. [Dữ liệu, lịch sử và tính nhất quán](#9-dữ-liệu-lịch-sử-và-tính-nhất-quán)
10. [REST, sự kiện và contracts](#10-rest-sự-kiện-và-contracts)
11. [Reconnect và vòng đời tài nguyên](#11-reconnect-và-vòng-đời-tài-nguyên)
12. [Màn hình và cấu trúc repository](#12-màn-hình-và-cấu-trúc-repository)
13. [Bảo mật, giới hạn và retention](#13-bảo-mật-giới-hạn-và-retention)
14. [Kiểm thử và tiêu chí hoàn thành](#14-kiểm-thử-và-tiêu-chí-hoàn-thành)
15. [Phân công và hợp đồng tích hợp](#15-phân-công-và-hợp-đồng-tích-hợp)
16. [Lộ trình 4 tuần và giai đoạn hoàn thiện](#16-lộ-trình-4-tuần-và-giai-đoạn-hoàn-thiện)
17. [Triển khai và vận hành](#17-triển-khai-và-vận-hành)
18. [Rủi ro, thay đổi và việc khởi động](#18-rủi-ro-thay-đổi-và-việc-khởi-động)
19. [Glossary và nguồn tham khảo](#19-glossary-và-nguồn-tham-khảo)

## 1. Mục tiêu, ràng buộc và phạm vi

Nguồn chi tiết: [phạm vi, ràng buộc và giả định](product/scope.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết.

## 2. Luồng nghiệm thu và mô hình nghiệp vụ

Nguồn chi tiết: [ba use case và vòng đời khái niệm](product/scope.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết.

## 3. Công nghệ và quyết định kiến trúc

### 3.1. Stack

| Thành phần | Lựa chọn | Quy tắc sử dụng |
|---|---|---|
| Web | React + TypeScript + Vite | Một app; giữ call controller khi đổi tab/panel |
| UI | Tailwind, components chung | Mic/camera/scope/đích chat có trạng thái nhất quán |
| State | Zustand + TanStack Query | Session projection và REST cache tách nhau; không persist track/transport |
| Server | Node.js 26.12.1 + Express + TypeScript | Runtime pin đồng bộ local/CI/Docker; pnpm 11.5.2, cài theo lockfile |
| Validation/contracts | Zod trong packages/contracts | Kiểm runtime ở biên; types không thay validation |
| Database | MongoDB + Mongoose, replica set một node | Transaction cho thao tác nhiều bản ghi; không có HA |
| Realtime | Socket.IO | Signaling, chat, board; ack/dedupe/snapshot do app xây |
| Media | WebRTC, mediasoup v3, mediasoup-client | Lựa chọn dự kiến, qua ADR-001/PoC trước khi Accepted |
| Audio | Web Audio API/GainNode | Một output path/track; discussion và priority riêng |
| Board | Canvas 2D, pointer events | Tọa độ chuẩn hóa, server ordering, undo của mình |
| Files | Cloudflare R2 riêng tư cho ảnh chat/tài liệu/ảnh giữ hình/video; avatar ở Cloudinary | API M2 kiểm quyền tải/phát/tua; không mở bucket công khai hoặc dùng ổ đĩa máy chủ làm kho lâu dài. Cập nhật M2 ngày 05/11/2026 theo [proposal](proposals/m2-messaging-files.md#5-high-level-design); tệp tạm video còn chờ thử với M3. |
| Deploy | VPS Linux + Compose + Nginx + coturn | Staging tuần 1; một app instance; port media trực tiếp |
| CI | GitHub Actions | Lint/typecheck/tests/build; image theo commit SHA |

Không cần Next.js, Kafka, Kubernetes hoặc một media microservice riêng cho topology đầu tiên. Framework web không giải quyết thay policy và vòng đời media.

Runtime thực thi được xác định bởi `.node-version`, `package.json` (`engines`, `devEngines.runtime`, `packageManager`), lockfile và Dockerfiles. `devEngines.runtime` cho phép pnpm tải Node 26.12.1 và dùng runtime đó cho scripts của project. Kiểm sau cài bằng `pnpm exec node --version` và `pnpm doctor`; phiên bản trả về từ `node --version` ngoài pnpm có thể khác. Không bắt buộc thay Node mặc định của máy nếu pnpm chạy đúng runtime đã pin. Xem [runbook local](runbooks/local-development.md).

Khi đổi runtime, cập nhật các nguồn pin và `@types/node` tương thích trong cùng thay đổi; chạy `pnpm check`, `pnpm media:smoke` và Docker smoke trên Linux trước khi merge. Các kiểm tra local đã qua không thay bằng chứng chạy image Linux hoặc PoC media qua Internet. Dependency tiếp tục dùng phiên bản chính xác trong manifests/lockfile; không tự nâng chỉ để lấy phiên bản mới nhất.

### 3.2. Sổ quyết định

| ADR | Quyết định | Trạng thái và cách xác nhận |
|---|---|---|
| ADR-001 | mediasoup; một Router/LiveSession | **Proposed**; B+C chứng minh isolation/share/revoke/TURN/reconnect; D kiểm freeze trong 3 ngày đầu |
| ADR-002 | Một backend chia module, một instance | Chọn cho bản này; thêm instance cần thiết kế owner/lock/state mới |
| ADR-003 | Mongo replica set một node | Chọn; A+E smoke test transaction/migration trên Linux tuần 1 |
| ADR-004 | Freeze chung scope, một frame; vẽ cơ bản | Chọn; D+C kiểm race/version/ACL |
| ADR-005 | Dữ liệu kênh bền vững, private session history chỉ đọc trong phiên | Chọn; kiểm bằng API/socket negative tests |
| ADR-006 | Không bật Socket.IO packet recovery cho private session | Chọn; app auth + snapshot/history có ACL khi reconnect |

ADR-001: mediasoup cho app kiểm soát việc tạo/đóng từng Consumer; đánh đổi là tự làm signaling/lifecycle. LiveKit là phương án thay thế cần chứng minh policy tương đương; selective subscription UI không đủ bằng chứng. Mesh không là hướng triển khai bản chính. Chỉ duy trì một SFU. Nếu PoC thất bại, phân biệt lỗi IP/ICE/cấu hình với thiếu năng lực triển khai, ghi quyết định cùng bằng chứng trước khi đổi.

Mỗi ADR trong repo ghi context, constraints, alternatives, decision, consequences, owner/reviewer, kết quả xác nhận và trigger xem lại. Gate thất bại không tự cho phép cắt camera/breakout/hỗ trợ.

## 4. Kiến trúc, module và trạng thái

Nguồn chi tiết: [module, chủ sở hữu trạng thái và thứ tự mutation](architecture.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết.

## 5. Phân quyền phát, nhận và công bố

Nguồn chi tiết: [quyền publish/consume, snapshot và lịch sử](product/groups-media-policy.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết.

## 6. Cuộc gọi, camera và chia sẻ màn hình

Nguồn chi tiết: [join, call ownership, thiết bị và screen lease](product/live-session.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết.

## 7. Freeze và vẽ cơ bản

Nguồn chi tiết: [board và freeze/resume](product/board-collaboration.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết.

## 8. Điều hành, hỗ trợ và âm lượng

### 8.1. Host, group và hỗ trợ

Nguồn chi tiết: [đặc tả mục 8.1](product/groups-media-policy.md).

### 8.2. Kết thúc chia nhóm và về phòng chung

Nguồn chi tiết: [đặc tả mục 8.2](product/groups-media-policy.md).

### 8.3. Chuyển host và host mất mạng

Nguồn chi tiết: [đặc tả mục 8.3](product/live-session.md).

### 8.4. Audio graph


Nguồn chi tiết: [đặc tả mục 8.4](product/live-session.md).

### 8.5. Countdown lượt hoạt động

Nguồn chi tiết: [group modes và TIMER-01](product/group-modes.md), [policy 8.5](product/groups-media-policy.md#85-countdown-cho-lượt-hoạt-động).

## 9. Dữ liệu, lịch sử và tính nhất quán

Nguồn chi tiết: [collections, index và trạng thái runtime](database/model.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết. Xem thêm [vòng đời dữ liệu và transaction](database/lifecycle.md).

## 10. REST, sự kiện và contracts

### 10.1. Quy ước chung

Quy ước hiện hành ngày 05/11/2026: [API/backend](contracts/api-conventions.md) và [bảng mã lỗi](contracts/error-codes.md). Các ví dụ dưới đã đồng bộ envelope; schema từng endpoint/command chốt trong task với consumer.

REST `/api/v1`; Zod validate ở biên. Cookie auth `HttpOnly; Secure; SameSite=Lax`, CSRF token+Origin cho mutation và socket handshake; actor lấy từ auth session. API không trả raw Mongoose error. Session hết hạn/logout thu socket và media, không chỉ clear UI.

`GET /auth/csrf` cấp token bootstrap gắn cookie CSRF có chữ ký để form đăng ký/đăng nhập hoạt động trước auth; server kiểm chữ ký, Origin và token gửi lại. Sau login rotate auth/CSRF, trả token mới cho header HTTP/socket handshake; không đưa session secret vào client. Cookie CSRF và cookie auth có mục đích riêng.

Làm rõ ngày 03/11/2026: register thành công cũng thiết lập phiên mới và rotate CSRF như login. Đi từ link mời thì quay lại lời mời sau xác thực, người dùng xác nhận rồi server kiểm lại hiệu lực để cấp membership; không tự accept trong register/login. Luồng Workspace theo [nguồn nghiệp vụ](product/workspace-channels.md).

```ts
// REST
{ data: {}, requestId: 'uuid' }
{ error: { code: 'FORBIDDEN', message: '...' }, requestId: 'uuid' }
// Client -> server: lệnh session
{
  requestId: 'uuid', sessionId: '...', epoch: '...',
  callGeneration: 3, expectedPolicyRevision: 18, payload: {}
}
// Ack
{ data: { policyRevision: 19 }, requestId: 'uuid' }
{ error: { code: 'CONFLICT', message: '...' }, requestId: 'uuid' }
// Server -> client: chỉ audience được phép
{
  eventId: 'uuid', sessionId: '...', epoch: '...',
  audienceEpoch: 4, policyRevision: 19, type: 'group.updated', payload: {}
}
```

Policy mutation yêu cầu expectedPolicyRevision; board dùng contextVersion/strokeSequence riêng; chat không bắt gửi policy revision cho mỗi tin nhưng luôn kiểm ACL. Ack nghĩa server đã xử lý, không bảo đảm mọi peer đã render. Client nhận CONFLICT do revision cũ thì resync trước khi yêu cầu lại; không tự phát lại mic/share hoặc gửi tin tới đích đã stale.

Idempotency key gồm actor+operation+scope+requestId và payload hash. Cùng ID khác payload trả conflict. Trước trả kết quả cũ vẫn kiểm quyền; không trả ticket/file/private data đã mất quyền. Cache runtime khởi đầu 10 phút, tối đa 10.000 kết quả/app, loại ticket đã consume khỏi khả năng dùng lại. Message dedupe bền theo DB. Retry quá cache phải lấy state trước, không tự coi thao tác chưa chạy.

HTTP status/mã chung theo [bảng mã lỗi](contracts/error-codes.md): 409 cho conflict/revision cũ, 413 vượt byte, 429 giới hạn tốc độ; không dùng 429 cho mọi quota. Các mã riêng như SOURCE_CHANGED, INTENT_EXPIRED, SHARE_BUSY, CALL_ALREADY_ACTIVE, QUOTA_EXCEEDED, SESSION_ENDED, HOST_BUSY và MEDIA_UNAVAILABLE cần contract miền xác định nghĩa/status/cách xử lý trước implementation.

### 10.2. REST chính

| Method/path sau /api/v1 | Công việc/quyền |
|---|---|
| GET /auth/csrf | Bootstrap CSRF cho form; không trả auth/session secret |
| POST /auth/register, /auth/login, /auth/logout; GET /auth/me | Auth, rate limit; logout thu session liên quan |
| GET, POST /workspaces | List theo membership; tạo Workspace |
| GET, PATCH, DELETE /workspaces/:wid | Member đọc; owner/admin sửa tên; owner xóa |
| GET /workspaces/:wid/members | Member hợp lệ |
| PATCH, DELETE /workspaces/:wid/members/:uid | Owner đổi admin/member; owner/admin loại member; admin không sửa/xóa owner/admin khác |
| POST /workspaces/:wid/invitations; DELETE /invitations/:iid | Owner/admin tạo/thu link |
| POST /invitations/accept | Token trong body; transaction, không log |
| GET, POST /workspaces/:wid/channels | Filter access WORKSPACE/PRIVATE; owner/admin tạo; xem quyền PRIVATE tại messaging |
| PATCH, DELETE /channels/:cid | Owner/admin; type và accessMode không đổi sau tạo; quản lý danh sách PRIVATE theo messaging; thu phiên và file access khi xóa |
| GET /channels/:cid/messages?before=... | Chỉ TEXT + channel access; cursor phân trang |
| POST /channels/:cid/messages | CHANNEL message service, dedupe; rootMessageId cho reply một cấp, kiểm root cùng kênh |
| GET /conversations/:id/messages?before=... | ACL theo kind; session/group phải ACTIVE/open |
| POST /workspaces/:wid/direct-conversations | Hai member hiện tại; tìm/tạo DIRECT với một người khác, unique cặp theo Workspace |
| GET /workspaces/:wid/direct-conversations | Chỉ hội thoại của actor hiện còn quyền |
| POST /conversations/:id/messages | DIRECT ACL, text/ảnh/file, dedupe; không phụ thuộc LiveSession |
| GET /channels/:cid/messages/:mid/replies?before=... | TEXT access, root cùng conversation; phân trang replies |
| POST /channels/:cid/live-session/join | Kiểm LIVE/access, tìm/tạo session, join ticket |
| POST /sessions/:sid/leave | Participant/generation; idempotent |
| POST /files; GET /files/:fid/content | Upload staged có purpose/scope; tải kiểm ACL/expiry/barrier mỗi request |
| POST /sessions/:sid/freeze-frames | Multipart intent; upload tạm, không commit board |
| GET /sessions/:sid/boards/:bid/frame | Board ACL hiện tại, file còn tham chiếu hợp lệ |

Upload đi HTTP, không truyền Base64 file/video qua Socket.IO. Chat socket/REST gọi cùng message service. Lịch sử trả cursor và giới hạn trang; không tải toàn bộ conversation một request.

### 10.3. Lệnh realtime

| Nhóm | DISCUSSION create/join; ACTIVITY prepare/assign/random preview/start; group.leave; discussion close/closeAll (tên schema chốt trong proposal) | DISCUSSION tạo tự động khi hợp lệ; người trong roster tự join; phase ACTIVITY chặn create/join; random preview được chỉnh trước start, không xáo khi đang chạy; lỗi start về MAIN không khôi phục DISCUSSION; ACTIVITY hết deadline tự kết thúc |
|---|---|---|
| Phiên | session.join/leave/resync | Ticket/auth/epoch/generation; projection |
| Call ownership | call.takeover | Thao tác xác nhận user; thu call cũ trước |
| Host | Chuyển host trực tiếp; tên event chốt trong task contracts | Chỉ host hiện tại gán cho participant hợp lệ, không chờ chấp nhận; kiểm revision và cleanup help/announcement; host chủ động rời khi còn quyền kết thúc phiên |
| Transport | media.transport.create/connect | Direction và transport owner |
| Publish | media.producer.create/pause/resume/close | canPublish + owner + source/kind + quota |
| Receive | media.consumer.create/ready/close | canConsume ở create và ready; dedupe |
| Share | screen.acquire/release | Actor/group mode/scope, lease/source generation; MAIN mọi participant tự share không xin host, một nguồn, DISCUSSION deny, ACTIVITY một nguồn/group, member tự share không host approval |
| Nhóm | DISCUSSION create/join; ACTIVITY prepare/assign/random preview/start; group.leave; discussion close/closeAll (tên schema chốt trong proposal) | DISCUSSION tạo tự động khi hợp lệ; người trong roster tự join; phase ACTIVITY chặn create/join; random preview được chỉnh trước start, không xáo khi đang chạy; lỗi start về MAIN không khôi phục DISCUSSION; ACTIVITY hết deadline tự kết thúc |
| Hỗ trợ | host.help.enter/leave | Host, nhóm hiện hành; chủ động leave về MAIN giữ trạng thái mic, không hỏi xác nhận mic riêng; cleanup/sự cố không tự phát chung |
| Chat | message.send | Conversation ACL + clientMessageId; cuộc họp text/ảnh, Everyone theo scope hoặc Host đích hiện tại; stale thì từ chối |
| Freeze | board.freeze.begin/commit; board.resume | Intent, version, source/generation |
| Vẽ | board.cursor; board.stroke.preview/commit/undo; board.clear | Board ACL, author, sequence/quota |
| Thông báo | announcement.start/stop | Host, audience MAIN/DISCUSSION theo mode; không tự mở audio vào ACTIVITY độc lập |
| Countdown | activityRound.start; activityRound state/expired | Host đặt duration; deadline server hết hạn tự kết thúc đúng lượt ACTIVITY, cleanup/về MAIN. Số nguyên 1–120 phút trước bắt đầu; không edit/pause/extend khi chạy |

Events tương ứng: `session.snapshot`, `participant.joined/left`, `group.updated`, `host.changed`, `media.available/closed`, `consumer.closed`, `screen.changed`, `board.state/stroke`, `announcement.changed`, `group.request.changed`, `activityRound.changed/expired`, `message.created`, `session.ending/ended`. Không có event quiz/library hoặc đồng hồ ngoài TIMER-01.

### 10.4. Giao nhận và khôi phục

Socket.IO giữ thứ tự trên kết nối nhưng mặc định không bảo đảm giao nhận đúng một lần. App tự làm ack/dedupe và resync. [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

- Message: validate → insert/bind → ack → fanout; mất event lấy history.
- Private event không buffer để tự replay sau reconnect; cursor/preview có thể mất.
- Client chặn thao tác nhạy cảm khi offline, bỏ pending command cũ trước resync; không để Socket.IO tự flush một lệnh chat/share/board cũ sang scope mới.
- Private clients cần reset cache theo audienceEpoch. Gap sequence board lấy snapshot; policy revision gap không đồng nghĩa thiếu event vì các audience được nhận tập event khác nhau.
- Trong contracts phải có schema command/ack/event, payload giới hạn và ví dụ allow/deny; ID/tên giống nhau ở frontend/backend.

## 11. Reconnect và vòng đời tài nguyên

Nguồn chi tiết: [control lease, resume và cleanup tài nguyên](product/live-session.md). Nguồn được chuyển từ v2.1 và đã cập nhật theo v2.3; giữ số mục để truy vết.

## 12. Màn hình và cấu trúc repository

### 12.1. Màn hình

Auth; Workspace list/join invitation; Workspace shell; TEXT channel; lobby; RoomPage một kiểu cuộc họp có host; group panel; host controls; tạo nhóm tên/mục đích/thành viên tự động khi hợp lệ; chat Everyone/Host, countdown lượt ACTIVITY, Về phòng chung sớm, ACTIVITY hết giờ tự về MAIN; host đóng DISCUSSION; quản lý thành viên/kênh.

Workspace shell có general/kênh, danh sách DM của chính mình và panel thread trong TEXT.

RoomPage có nguồn hợp lệ theo MAIN/DISCUSSION/ACTIVITY hoặc frame đã freeze của nhóm hiện tại (MAIN không freeze), camera tiles, danh sách người, chat, scope badge, mic/camera/share/volume/board controls. Hiển thị rõ “MIC trong nhóm / toàn phòng / đang hỗ trợ” và “hình đã dừng, tiếng vẫn trực tiếp”. Mọi chuyển phạm vi công bố phải nhìn thấy được. Chat/panel chuyển tab không unmount call controller.

Không tạo màn hình quiz/library hoặc đồng hồ ngoài countdown TIMER-01, hoặc hai ứng dụng độc lập cho phòng nhóm và lớp học. Cập nhật 03/11: PROFILE-01 gồm sửa tên hiển thị/avatar và đổi mật khẩu hiện tại; quên mật khẩu để sau MVP. Cập nhật 04/11: avatar lưu Cloudinary, công khai qua URL; chỉ chính chủ thay/xóa. M2 phối hợp upload và cleanup. Quyền ảnh/file chat và video cuộc họp giữ nguyên.

### 12.2. Repository

```text
colearnia/
  apps/web/src/
    features/{auth,workspaces,channels,chat,live,groups,board,audio}/
    lib/{api,socket,media}/
    components/
  apps/server/src/
    modules/{auth,workspaces,channels,messages,files}/
    realtime/{handlers,schemas,rooms}/
    live/{session-manager,policy,media,groups,board}/
    jobs/{file-cleanup,session-reaper}/
  packages/contracts/
  infra/{nginx,coturn,mongo}/
  docs/{adr,contracts,runbooks,test-evidence}/
  docker-compose.yml
  .env.example
```

Web RoomController giữ MediaStream/transport/audio nodes trong runtime registry, Zustand chỉ giữ projection cần render; không persist object media. Chịu được mount/unmount development lặp và cleanup có kiểm generation. Contracts không import Mongoose hoặc mediasoup runtime classes.

## 13. Bảo mật, giới hạn và retention

### 13.1. Biên tin cậy

Browser có thể sửa mọi request. Server tự tra actor/owner/scope/permission và validate schema; UUID không phải quyền. Trust boundary gồm REST, socket, upload/file read, SFU publish/consume và TURN credentials. Tệp/ảnh client cung cấp không có bảo đảm nguồn gốc tuyệt đối.

- Password băm Argon2id hoặc bcrypt với cấu hình được đo; chọn một implementation khi kickoff, không lưu plaintext/token raw trong DB/log.
- Cookie session rotate sau login, có expiry server. Socket có timer hết hạn và kiểm auth khi lệnh nhạy cảm; logout/revoke lan tới cuộc gọi tương ứng. TTL DB không thay kiểm expiry.
- Same origin qua Nginx là cấu hình chính; CORS/Origin allowlist, CSRF cho cookie-auth mutation/socket handshake; không wildcard credential.
- Chat render text; không chèn user text qua innerHTML. Upload tên ngẫu nhiên ngoài public; kiểm MIME thực/kích thước/dimensions, từ chối HTML/SVG/script/executable.
- Allowlist bản đầu: PNG/JPEG/WebP, PDF, TXT; loại bài học khác chỉ thêm sau kiểm rủi ro và thống nhất. File download có Content-Disposition phù hợp, nosniff; private files/frame no-store.
- WebRTC mã hóa đường truyền; không tuyên bố E2EE người dùng với topology này. TURN có credential ngắn hạn, quota và không anonymous relay.
- Không log audio/nội dung chat/token/password; audit metadata cấp/thu quyền, actor/scope/revision/requestId.
- Khi bị thu quyền, chặn request/stream mới và ngừng stream đang phục vụ khi server nhận biết thay đổi; bytes đã gửi không thể thu hồi.

### 13.2. Cấu hình khởi đầu

| Tài nguyên | Giá trị khởi đầu |
|---|---|
| File attachment | 10 MiB/file; 4 attachment/message; quota Workspace 500 MiB |
| Frame tạm | 1920×1080, 2 MiB/frame; 20 MiB/session chỉ là cấu hình thử nhỏ. Profile 25/50 phải lập ngân sách board/session/server hữu hạn theo [capacity](capacity.md#4-findings-db-quyết-định-hiện-tại-và-cổng-kiểm-chứng) trước chạy; chưa tự đổi quota |
| Message | 4.000 ký tự; trang history tối đa 50 tin |
| Stroke | 2.000 điểm/nét, giới hạn width/palette; 1.000 nét/context và 2 MiB dữ liệu nét/context |
| Cursor/preview | 20 batch/giây/user; không ghi DB |
| Producer | MIC/CAMERA và SCREEN/SCREEN_AUDIO theo actor/source policy; MAIN một share. ACTIVITY một nguồn/group không host approval; quota bytes/bitrate tiếp tục đo |
| Consumer | Một/participant/producer |
| Share picker lease / freeze intent | 30 giây / 15 giây |
| Join/resume ticket | 60 giây, một lần, rotate |
| Control lease / reconnect grace | 30 giây / tối đa 30 giây sau disconnect/lease expiry |
| Heartbeat app | 5 giây khi kết nối; server rate limit và theo dõi deadline |
| Empty room grace | Không dùng; end ngay khi không còn participant hoặc ownership trong reconnect grace |
| Announcement | Tối đa 30 giây; factor discussion thử ban đầu 0,3 |
| Auth session | 7 ngày khởi đầu; expiry tuyệt đối và revoke server |
| Login rate limit | Thử ban đầu 5 lần thất bại/phút/IP+account; tuning tránh khóa nhầm |
| Mutation/chat limit | Thử ban đầu 20 lệnh nhạy cảm/10 giây/user; chat 5 tin/giây/user, burst 10 |
| Upload concurrency | 2 upload/user; giới hạn tổng bytes và in-flight/session |

Không áp cùng limiter command cho stroke preview; mỗi lớp có quota riêng. Giới hạn tính cả payload bytes/points và request count. Đạt quota trả lỗi rõ; không treo room. Các timeout là chính sách app, không phải lời hứa phát hiện mọi mạng lỗi trong đúng số giây đó.

### 13.3. Cleanup

Nguồn chi tiết: [đặc tả mục 13.3](database/lifecycle.md).

## 14. Kiểm thử và tiêu chí hoàn thành

### 14.1. Workload nghiệm thu

**Profile bắt buộc ban đầu:** 5 participant = 1 host + 2 group × 2 người. Chạy riêng kịch bản DISCUSSION kế thừa MAIN và ACTIVITY độc lập có screen nhóm với một share/group và hai group share đồng thời; ghi rõ số nguồn screen; camera của cả 5 được bật và nhận đúng quyền; 30 phút; ít nhất hai mạng độc lập; Chrome và Edge desktop. Ghi máy/OS/browser/VPS/region, bitrate/độ phân giải và ICE selected candidate.

**Profile capacity đã đồng ý ngày 01/11:** theo [capacity](capacity.md#5-profile-và-bằng-chứng-nghiệm-thu), tăng 10 → 25 người làm mốc kiểm chứng trước, sau đó thử 50 nếu 25 đạt. Camera nhận chọn lọc, thử tối đa 4 camera từ xa/client; không giới hạn quyền bật camera hoặc bỏ audio theo viewport. Kiểm MAIN, hai mode nhóm và tải kết hợp, không chỉ signaling. Không cam kết mức phát hành 25/50 trước số đo; 100 là hướng tham khảo ngoài mục tiêu bắt buộc hiện tại. Gate 5 người vẫn chưa đạt nếu chưa có evidence.

Test forced TURN riêng phải chứng minh selected relay candidate và traffic thật; chỉ cấu hình TURN URL không tính là pass. Không dùng 5 tab một máy thay bằng chứng hai mạng/thiết bị khi đánh giá camera/audio/ICE.

### 14.2. Quality scenarios

Các ngưỡng dưới đây là **mục tiêu thử ban đầu trên profile/mạng đã ghi**, được giữ nguyên làm baseline hoặc cập nhật có lý do sau PoC; chưa là SLA.

| ID | Tình huống | Mục tiêu và phép đo |
|---|---|---|
| Q-01 | Join có nguồn đang phát | p95 ≤8 giây từ xác nhận join tới audio/video frame đầu; tách signaling/media |
| Q-02 | Xem screen theo group mode | p95 độ trễ quan sát ≤1,5 giây; đồng hồ tại nguồn/receiver, không trừ timestamp hai máy chưa đồng bộ |
| Q-03 | Freeze frame ≤2 MiB | p95 ≤2 giây click tới peer cùng scope hiển thị; ghi tốc độ mạng, số mẫu |
| Q-04 | Vẽ | p95 stroke commit → ack ≤500 ms; độ trễ peer đo qua vòng đi-về/clock offset riêng |
| Q-05 | Revoke/chuyển nhóm | Không có Consumer trái policy sau commit; mục tiêu thu Consumer p95 ≤1 giây; đo buffer audio riêng |
| Q-06 | Reconnect | Không khôi phục grant hoặc đích chat đã stale; mục tiêu p95 ≤10 giây sau mạng trở lại ổn định trong cùng epoch |
| Q-07 | Cleanup | Sau 20 vòng join/leave và hết grace, resource count trở về baseline; không tăng disk/RAM không giới hạn |
| Q-08 | Riêng tư | Không tạo Consumer/đọc API/file/event private trái quyền, kể cả request tự tạo |

Thu ít nhất 20 mẫu cho thao tác lặp Q-01/Q-03/Q-04/Q-06, báo p50/p95 và số lỗi; sample nhỏ không chứng minh ổn định ở tải lớn. Báo WebRTC RTT/jitter/packet loss, worker CPU/RAM/egress và resource count. UI “không hiện” hoặc chỉ “không nghe thấy” không đủ chứng minh isolation.

### 14.3. Test matrix bắt buộc

| ID | Phạm vi | Ca quan trọng | Owner/reviewer |
|---|---|---|---|
| T-01 | Auth/Workspace | Sai Workspace/channel, tự nâng role, đổi ADMIN/MEMBER đúng quyền, hết auth khi socket mở | A/C |
| T-02 | DB concurrency | Invitation một link hiện hành, tắt/tạo lại đồng thời accept, join channel, rollback Workspace/general, DM đồng thời, message/reply dedupe và reply count | A/E |
| T-03 | Camera/mic/share | Hai mạng, device denied, MAIN tranh lease/browser Stop; DISCUSSION deny screen; ACTIVITY member tự share, cùng nhóm chỉ một nguồn, hai nhóm độc lập, nguồn bận không giành | B/D |
| T-04 | Publish/consume | Giả nguồn/owner/transport/grant; Consumer ready sau revoke; duplicate receive | B/C |
| T-05 | Group modes/isolation | Create hợp lệ tạo DISCUSSION tự động, roster chưa cấp private tới khi join; phase ACTIVITY chặn create/join; random preview không cấp scope; ACTIVITY không nhận MAIN; host help chỉ ACTIVITY; leave/revoke không lộ nội dung | C/B |
| T-06 | Board | MAIN chỉ host vẽ LIVE, nét thường/tự biến mất, đổi/dừng nguồn xóa overlay, member và host cũ bị deny; MAIN từ chối freeze/resume; nhóm cùng frame, resize/letterbox, undo đúng author, quota, hai freeze, resume trước upload xong | D/C |
| T-07 | Về MAIN/countdown | Leave chỉ actor; deadline chung hết hạn tự đóng ACTIVITY/thu share/help/chat/board, về MAIN/pause mic; reconnect/callback trễ không phục hồi nhóm cũ; host đóng DISCUSSION | C/D |
| T-08 | Board source/hình/tiếng | Freeze đúng nguồn theo mode, source revision theo scope; audio liên tục, resume đúng nguồn; không trộn nét/group/MAIN khi đổi nguồn hoặc về MAIN | D/B |
| T-09 | Audio | Group+global cùng nguồn không echo; local mute; duck/restore; announcement host rớt | D/B |
| T-10 | History/file/chat target | Everyone/Host đúng scope; DM chặn người thứ ba/admin; thread root sai kênh; file sau kick/close/ENDED; history phân trang | A/C |
| T-11 | Reconnect | Move/revoke khi mất mạng; socket cũ; hai thiết bị/two-channel takeover; private packet cũ | E/C+B |
| T-12 | Network/failure | Forced TURN, chặn signaling còn media, worker/app restart, cleanup sau leave/crash | B+E/C |
| T-13 | End-to-end | UC-01/02/03 trên staging, người mới dùng không cần sửa DB | E/toàn nhóm |
| T-14 | Operate | Build Linux, deploy SHA, backup/restore, health/rollback và test tải tăng dần | E/A+B |

Mỗi feature ID phải gắn issue, PR, reviewer và ít nhất test/evidence liên quan. Unit policy kiểm cả allow/deny; integration DB chạy replica set; API/socket test dùng hai danh tính khác quyền; WebRTC dùng browser/client thật, HTTP load test không thay media test. Automation bằng Vitest/Supertest/Playwright hoặc công cụ tương đương do nhóm chọn một bộ thống nhất; không cần tự động hóa toàn bộ kiểm âm thanh vật lý để được demo sớm.

### 14.4. Definition of Done

UI + xử lý server + runtime validation + ACL + trạng thái lỗi + cleanup + contracts cập nhật + test phù hợp + demo tích hợp staging. Bug lộ tiếng/dữ liệu/track trái quyền là blocker. Ngoài quyền riêng tư, bug crash luồng chính/mất tin đã ack/không join hai mạng cũng chặn nghiệm thu. Không đánh dấu hoàn thành chỉ vì build pass, localhost một browser hoặc video giả.

## 15. Phân công và hợp đồng tích hợp

### 15.1. Trách nhiệm A–E

**Phương án tham khảo, chưa giao việc:** theo chỉ đạo 27/10, nhóm sẽ phân công thật sau. Mọi ký hiệu A–E ở bảng owner/reviewer, contracts, test, lộ trình và checklist chỉ minh họa cách phối hợp; không dùng chúng làm assignee mặc định hoặc yêu cầu gán người ngay. Khi lập Issues, nhóm quyết định lại theo capacity; không mặc định dồn DM/thread/reconnect/vận hành vào một người.

| Người | Frontend + backend | Đầu ra | Reviewer chính |
|---|---|---|---|
| A | Auth/forms, Workspace/sidebar/kênh/thành viên/tệp; models, auth, transactions, file ACL | AUTH/WS/CH/FILE, DIRECT ACL và data migrations | C quyền; E deploy |
| B | Lobby/camera tiles/device/share; mediasoup transport/producer/consumer, metrics/cleanup | LIVE và media adapter; phối hợp REC | C routing; D client/audio |
| C | Group/host/chat target UI; SessionState, policy, grants/help, về MAIN, transfer | HOST/GRP/HELP, policy core | B media; E races/recovery |
| D | Canvas/freeze/volume view; board ACL/intents/strokes và audio graph | BOARD/FREEZE/AUDIO | C ACL; B audio |
| E | Chat/composer/reconnect UI; message/dedupe; CI/Compose/staging/test harness/runbooks | CHAT-01/02/03, tích hợp REC, vận hành | A data; B+C recovery |

Testing do người làm module chịu, không dồn E. B+C cùng PoC routing; D hỗ trợ freeze, E hỗ trợ Internet/TURN. B hỗ trợ D audio/track lifecycle; C hỗ trợ D board ACL. Mỗi module có runbook ngắn để người khác debug khi owner bận.

### 15.2. Contracts phải có ngay tuần 1

| Giao diện | Bên cung cấp → sử dụng | Đầu ra cần thống nhất |
|---|---|---|
| Identity/channel access | A → B/C/D/E | Actor, membership/current access, deny barrier, expiry |
| Session projection/policy | C → B/D/E | Scope, epoch/revision/generation, host/group/grant state |
| Media registry | B → C/D/E | Stable participant/source ID, track generation, screen readiness, close callbacks |
| Board context | D → C/E | Context/frame/version/sequence, refs, cleanup khi đóng nhóm |
| Message/file | A+E → C/D | Purpose/scope, CHANNEL/DIRECT/thread/meeting ACL, root/cursor, dedupe, staged bind, upload/error envelope |
| Reconnect protocol | C+B → E+D | Auth/resume, snapshot/reset, resource reconcile, reset scope/đích chat |

D có thể dựng canvas với video test trong development nhưng chỉ được nghiệm thu FREEZE sau khi tích hợp screen thật. Tương tự, UI host/group không hoàn thành nếu media scope còn mock.

### 15.3. Capacity và quy trình

Không dùng lại ước lượng 535–655 giờ của bản 10 tuần như một cam kết cho bản này. Mốc 4 tuần giữ scope chính và cần ước lượng lại sau spike. Tổng capacity = `4 × tổng giờ thực tế mỗi người/tuần`; lập lịch feature trên khoảng 75% capacity, giữ khoảng 25% cho review/học/tích hợp/fix. Ví dụ mỗi người 20 giờ/tuần → 400 giờ gross, khoảng 300 giờ feature; đây là ví dụ tính toán, chưa là xác nhận đủ sức cho scope.

Trước cuối ngày 3, từng owner ước lượng còn lại theo feature, ghi dependency và confidence; đối chiếu tổng capacity. Nếu thiếu, lập phương án có nêu chức năng/lịch bị ảnh hưởng để nhóm quyết định, không âm thầm hạ tiêu chí.

Main luôn build được; PR nhỏ theo luồng có UI+server+test; contract thay trước hoặc cùng PR, người dùng contract review. Tích hợp hằng ngày, demo chung ít nhất 2 lần/tuần, công khai blocker. Người thay code giải quyết conflict với owner module; không ghép 5 bản app riêng cuối kỳ. Mỗi người phải học và giải thích phần liên quan trong lúc làm, tuần cuối dành củng cố kiến thức.

### 15.4. Truy vết tính năng tới nghiệm thu

“Mốc tích hợp” là mốc chức năng phải chạy trong luồng thật; tất cả còn phải qua hồi quy và DoD tuần 4. Issue/PR và đường dẫn evidence được bổ sung trong backlog khi triển khai, không ghi giả kết quả ở đây.

| Feature | Use case | Test bắt buộc liên quan | Owner | Mốc tích hợp |
|---|---|---|---|---|
| AUTH-01 | UC-01/02/03 | T-01, T-11, T-13 | A | Tuần 1–2 |
| WS-01/02/03 | UC-01 | T-01, T-02, T-13 | A | Tuần 2–3 |
| CH-01 | UC-01/02/03 | T-01, T-02, T-10 | A | Tuần 2 |
| CHAT-01 | UC-01/03 | T-02, T-05, T-10, T-13 | E | Tuần 2 |
| CHAT-02/03 | UC-01 | T-01, T-02, T-10, T-13 | E; A review ACL/data | Mục tiêu tuần 3, xác nhận capacity cùng nhóm |
| FILE-01 | UC-01/03 | T-02, T-10, T-13 | A+E | Tuần 2 |
| LIVE-01 | UC-02/03 | T-02, T-11, T-12 | B+C | Tuần 1–2 |
| LIVE-02/03 | UC-02/03 | T-03, T-04, T-12 | B | Tuần 2 |
| HOST-01 | UC-03 | T-01, T-05, T-07, T-11 | C | Tuần 3 |
| GRP-01/02 | UC-03 | T-04, T-05, T-07, T-11 | C+B | Tuần 2–3 |
| BOARD-01/FREEZE-01 | UC-02/03 | T-05, T-06, T-08 | D | Tuần 2–3 |
| HELP-01 | UC-02/03 | T-05, T-10, T-11 | C+E | Tuần 3 |
| AUDIO-01 | UC-02/03 | T-04, T-09 | D+B | Tuần 3 |
| TIMER-01 | UC-03 | T-07, T-11, T-13 | Phân công sau; A–E chỉ tham khảo | Trước G3, ước lượng lại cùng nhóm |
| REC-01 | UC-01/02/03 | T-01, T-11, T-12, T-13 | E+B+C+D | Tuần 3 |
| CI/deploy/runbook | UC-01/02/03 | T-13, T-14 | E, cả nhóm hỗ trợ | Staging tuần 1; release tuần 4 |

## 16. Lộ trình 4 tuần và giai đoạn hoàn thiện

Tuần tính từ kickoff, chưa gắn ngày khi chưa có lịch bắt đầu. Các chức năng được triển khai theo lát cắt tuần tự để tích hợp, **không chuyển camera/tài liệu/chat cuộc họp/help/về MAIN thành phần tùy chọn**.

| Mốc | A | B | C | D | E | Đầu ra chung |
|---|---|---|---|---|---|---|
| Ngày 1–3 | Auth/membership skeleton, replica set | Mic/screen/camera tối thiểu hai mạng, TURN | Session/group policy, move/revoke | Freeze frame chung thử, audio tiếp tục | HTTPS/staging/Compose, evidence | Gate nền media; hợp đồng nền |
| Cuối tuần 1 | Auth + Workspace/channel API/UI skeleton | Media registry/lobby cơ bản | Host từ lúc bắt đầu phiên, group skeleton | Canvas/board version, freeze contract | Chat skeleton, CI | Join qua Workspace trên staging, core policy tests |
| Tuần 2 | Invitation/member/file/chat ACL | Mic/camera/share lease hoàn chỉnh, cleanup | Groups/host tools, isolation/reconcile, help skeleton | Pen/cursor/undo, freeze/resume tích hợp, audio graph | Chat kênh bền, file composer, reconnect skeleton | Lát cắt kênh/tệp UC-01 và phần chính UC-02; hai group đúng scope |
| Tuần 3 | Kick/role/transactions hoàn thiện | Recovery, pending consumer races, share ownership | Chat Everyone/Host, help, về MAIN, transfer host | Volume/ducking, frame races, cleanup board nhóm | DM/thread tích hợp, REC, E2E UC-01/02/03 | Toàn scope có luồng thật; khóa thêm tính năng |
| Tuần 4 | API/file negative tests, fix | Browser/network/resource/load tests, fix | Revoke/group/host races, fix | Board/chat scope/audio tests, UX lỗi | Bug triage, deploy SHA, evidence | Release candidate đủ DoD, blocker = 0 |
| Tuần 5 | Data/permission report | Media explanation | Domain/policy explanation | Freeze/audio explanation | Restore/rollback/runbook/demo script | Production hardening, tài liệu, rehearsal |
| Tuần 6 nếu có | Cả nhóm sửa lỗi và diễn tập; không mở scope mới | | | | | Bảo vệ và bàn giao |

### Gate G1 — hết ngày 3

Có 5 participant; PoC hai group DISCUSSION kế thừa bài giảng/cấm publish screen và hai ACTIVITY độc lập với MAIN/các group khác, mỗi nhóm một nguồn share độc lập, member không xin host, board theo nguồn đó. Move/leave/revoke thật, frame freeze theo nguồn hợp lệ có audio và forced TURN. Kiểm host tạo nhóm chưa tự chuyển người, người được chọn bấm vào mới có quyền và hai loại nhóm không active đồng thời; cấu hình bitrate/codec vẫn phải đo. UI có thể thô. Lưu commit, cấu hình và bằng chứng. Đạt thì ADR-001 Accepted; chưa đạt thì báo nguyên nhân và timebox xử lý/đổi hướng ngay, không tiếp tục xây nhiều UI phụ thuộc chưa chắc.

### Gate G2 — cuối tuần 2

Người mới đăng nhập → Workspace có general → kênh → chat/tệp → LIVE mic/camera/share MAIN, tạo/vào DISCUSSION và chia ACTIVITY theo policy đã chốt. Đây là lát cắt kênh/tệp của UC-01; DM/thread tích hợp tuần 3 trước G3, không gọi toàn UC-01 hoàn thành ở G2. Freeze/vẽ/audio ở mức tích hợp; group isolation không có blocker. Nếu chưa đạt, dừng chỉnh giao diện trang trí và tập trung dependency/bottleneck. Không bỏ chức năng lõi mà không cập nhật phạm vi với nhóm.

### Gate G3 — cuối tuần 3

UC-01/02/03 đi hết, có general/DM/thread, cả hai group mode, create/join, chat Everyone/Host, help, tự về MAIN sớm/hết thời lượng ACTIVITY, đóng DISCUSSION, countdown và volume/reconnect; không cần thao tác DB. Đóng băng tính năng. Lỗi còn lại có owner và bước tái hiện. Không đưa quiz/library hoặc đồng hồ ngoài TIMER-01 vào vì còn tuần dự phòng.

### Gate G4 — cuối tuần 4

Đạt mục 14 trên staging, không còn blocker; có image/tag/config, demo data, metrics report, contracts/schema và hướng dẫn chạy. Nếu thiếu luồng bắt buộc thì ghi đúng phần chưa đạt, không gọi bản rút gọn là đã xong đề tài.

## 17. Triển khai và vận hành

### 17.1. Topology bản đầu

Theo [capacity bản đầu](capacity.md#6-docker-mongodb-và-giới-hạn-bản-đầu), chấp nhận app/worker restart kết thúc LIVE, drain trước deploy; không có HA hoặc giữ phiên qua crash. MongoDB local chạy Docker, không nhầm replica set một node với backup/failover. Chưa thêm Redis, nhiều app instance hoặc worker pool từ định hướng tải.

Một VPS Linux có public IPv4, Docker Compose: Nginx, Node app với một mediasoup worker/WebRtcServer và một Router/session, Mongo replica set một node, coturn. Private volumes: DB/permanent files/temp frames. Một app process; không chạy nhiều PM2/Node replicas hoặc rolling deploy chồng phiên bản khi session state còn trong RAM.

Profile VPS thử ban đầu có thể là 2 vCPU/4 GiB RAM, cần đo tại G1 và tuần 4 trước khi xác nhận đủ. Không mua/chọn nhà cung cấp trước khi thống nhất budget. App, worker, DB, TURN chia tài nguyên; một worker chỉ dùng một lõi cho media. Media capacity không suy từ số CPU tổng.

### 17.2. Network và port

Chọn Docker bridge networking với mapping port tường minh. `MEDIA_LISTEN_IP=0.0.0.0` trong container, `MEDIA_ANNOUNCED_ADDRESS` là public IP truy cập được. Config/certificate theo hostname, không gửi container IP làm ICE candidate public.

| Cổng host khởi đầu | Dịch vụ | Quy tắc |
|---|---|---|
| TCP 80 | Nginx | Redirect/ACME khi dùng HTTP challenge |
| TCP 443 | Nginx | HTTPS frontend, REST, Socket.IO upgrade/timeouts |
| UDP + TCP 40000 | mediasoup WebRtcServer worker 1 | Map cùng số vào container; RTP trực tiếp |
| UDP + TCP 3478 | coturn | STUN/TURN authenticated |
| TCP 5349 | coturn TLS | TURN hostname và certificate riêng; thử mạng thật |
| UDP 49160–49200 | TURN relay range | Map/allow đúng range, đo quota; không mở port tùy ý |
| Mongo/app/metrics nội bộ | Không public | DB admin, API nội bộ, health/metrics qua private network |

Một WebRtcServer thuộc một worker. Nếu thêm worker, mỗi worker có WebRtcServer/port không xung đột, cập nhật mapping/firewall; không dùng chung cổng 40000 cho mọi worker. [mediasoup API](https://mediasoup.org/documentation/v3/mediasoup/api/).

Coturn cấu hình public/private address theo network thực, short-lived credentials, relay range và quota. Nginx TCP443 và TURN/TLS không tự bind chung IP:port; bản đầu dùng 5349, không cam kết qua mọi firewall. Nếu mạng bảo vệ bắt buộc TURN/TLS443, E+B phải giải quyết IP riêng hoặc routing L4 phù hợp và thử trước rehearsal; không chỉ đổi hostname. TURN không thay SFU.

### 17.3. Env và CI

Danh mục env đích cần bổ sung theo feature vào `.env.example`: APP_ORIGIN, PUBLIC_BASE_URL, MONGO_URI/replicaSet, SESSION_SECRET, AUTH_TTL_SECONDS, TURN_SECRET/TURN_URLS, MEDIA_LISTEN_IP, MEDIA_ANNOUNCED_ADDRESS, MEDIA_PORT, FILE_ROOT/TEMP_ROOT, quotas/timeouts. Không coi mọi biến trong danh mục đã được scaffold sử dụng; contract cấu hình thực nằm ở schema env và `.env.example`. Secrets ở CI/server, không commit. Node 26.12.1/pnpm 11.5.2 đã được pin; mediasoup server/client, Mongo image và dependencies theo manifests/Compose/lockfile. Mỗi lần nâng phải kiểm tương thích; không dùng floating latest trong release.

CI: install lockfile → lint/typecheck → policy/contract tests → integration với Mongo replica set → build web/server → build Linux image → tag commit SHA. Browser E2E đủ điều kiện chạy CI; test camera/audio/network thật có evidence staging bổ sung. Native mediasoup worker phải build/start được trên image Linux từ tuần 1.

Deploy: migration/index compatibility check → thông báo và drain session đang sống → backup nếu thay dữ liệu → restart image cụ thể → readiness → smoke UC-01/02/03. Zero-downtime không là scope vì runtime trong RAM. Rollback image chỉ khi schema tương thích; runbook ghi cách rollback/migrate forward.

### 17.4. Backup, health và quan sát

Backup MongoDB và permanent files cùng manifest metadata, giữ bản ngoài VPS theo budget; thử restore ít nhất một lần trước bàn giao. Tạm dừng write trong backup bản đầu nếu chưa có snapshot nhất quán. Không backup frame/chat private chờ purge như tài liệu lâu dài; kiểm policy retention trong backup.

Liveness kiểm process; readiness kiểm DB, index/migration/bootstrap, media worker. Worker chết không báo khỏe giả. Metrics: participants, transport/producer/consumer, pending operations, worker CPU/RAM, egress, disk/quota, cleanup lag, permission denies và ICE failures. Logs liên kết requestId/sessionId/participantId/revision/generation, không chứa nội dung riêng.

Shutdown: deny join/mutation → báo ending → close media → cập nhật DB/conversation → dừng worker/process. Không dựa riêng onbeforeunload browser để cleanup.

### 17.5. Băng thông và budget

```text
payload GB ≈ 0,45 × Σ(bitrate nhận_i tính bằng Mbps × thời gian_i tính bằng giờ)
           ≈ 0,45 × aggregate egress Mbps × elapsed hours
```

Ví dụ tính toán: 5 receiver × screen 2 Mbps × 1 giờ ≈4,5 GB payload; không cộng số receiver thêm lần nữa vào aggregate egress. Camera/mic/overhead/retransmission cộng riêng. Actual screen receiver có thể ít hơn khi chủ share không tự consume.

Dự toán tách compute, egress, file storage, TURN relay path và backup. Tính cả lượt rehearsal/test; TURN có các chặng tùy bố trí, không mặc định nhân đôi mọi traffic. Nếu chi phí cao, giảm bitrate/camera tile nhận theo viewport trong quyền hợp lệ và đo lại; không bỏ camera khỏi scope.

## 18. Rủi ro, thay đổi và việc khởi động

### 18.1. Rủi ro và phản ứng

| Rủi ro | Dấu hiệu/gate | Xử lý | Owner |
|---|---|---|---|
| Media không chạy Internet | G1 không qua | Kiểm ICE/IP/ports/TURN; timebox; ADR đổi nền nếu có bằng chứng | B+E |
| Lộ nhóm/private snapshot | Consumer/file/event trái quyền | Block release; sửa policy/projection/reconcile; negative tests | C+B+A |
| Capacity thiếu | Ước lượng sau ngày 3 vượt giờ thực | Ghép hỗ trợ, giảm polish, trình phương án scope/lịch cho nhóm | Cả nhóm |
| Freeze/race lệch hình | Hai intent/frame khác, stale commit | Một frame/intent, version/epoch, pending cancel | D+C |
| Echo/clipping | Audio lặp hoặc cộng quá lớn | Một output path, Consumer dedupe, gain/headroom test | B+D |
| Data/runtime lệch | Kick lỗi, invitation mất lượt | Barrier, transaction và reconcile; failure injection | A+C |
| Tích hợp trễ | Cuối tuần 2 vẫn mock media/group | Dừng polish, demo hằng ngày tới khi qua gate | E+module owners |
| Đầy disk/leak | Counts/bytes tăng sau leave | Quota, ref-count, sweeper, resource baseline tests | D+E+B |
| Thiếu người hiểu module | Một người vắng là không debug được | Review chéo và runbook ngắn; pair bottleneck | Cả nhóm |

### 18.2. Quy tắc thay đổi

Được tự đơn giản hóa trong mức đã chốt: layout, animation, cách trình bày avatar (không bỏ chức năng cập nhật/xóa), cấu hình codec/bitrate, camera pagination, cách undo nguyên nét và công cụ vận hành tối thiểu. Không tự cắt tài khoản/Workspace/chat/tệp, camera, hai group mode, freeze/vẽ cơ bản, chat cuộc họp/help/về MAIN, TIMER-01, volume hoặc reconnect.

Nếu cần đổi chức năng chính/SFU/lịch: ghi vấn đề, bằng chứng, lựa chọn, chi phí, ảnh hưởng UC/test; nhóm xác nhận và cập nhật version/scope. Không giảm kiểm quyền, dùng video giả thay cuộc gọi hoặc đặt gain=0 để che nguồn không nên nhận. Lát cắt học tự do và moderated là thứ tự xây, không là quyền bỏ lát cắt sau.

### 18.3. Checklist khởi động

1. Gán A–E, reviewer; ghi giờ/người/tuần, ngày bắt đầu/nộp, budget và yêu cầu học phần. Các ô này còn chưa xác nhận, không tự bịa thành cam kết.
2. Tạo repo/lockfile/contracts; chốt naming scope/epoch/revision/generation và định dạng lỗi.
3. A+E cấu hình replica set/migrations; B+E đưa Linux staging/HTTPS/SFU/TURN lên ngay.
4. B+C làm PoC routing/camera/share/revoke; D thử frame/audio; E ghi evidence G1.
5. Tạo issues từ feature IDs, UC, test IDs; owner cập nhật giờ còn lại cuối ngày 3.
6. Triển khai theo lịch tích hợp tuần 1–4, khóa thêm tính năng sau tuần 3.

### 18.4. Đầu ra bàn giao

Source và lockfile chạy lại được; website Internet; Compose/env example không secrets; migrations/schema; REST/socket contracts; ADR đã có evidence; test matrix/quyền nhóm; báo cáo phép đo đúng điều kiện; backup/restore/deploy/rollback runbooks; dữ liệu và kịch bản demo. Cả 5 người giải thích được control/media plane, quyền nhóm, freeze/resume và cleanup của luồng chính.

## 19. Glossary và nguồn tham khảo

### 19.1. Glossary

| Thuật ngữ | Nghĩa dùng trong CoLearnia |
|---|---|
| Workspace / Channel | Không gian và kênh lâu dài; khác session media |
| Session / MAIN / Group | Phiên đang sống, phạm vi phòng chính và phạm vi nhóm |
| Scope / audience | Nơi quyền áp dụng / tập người thực tế được nhận |
| Producer / Consumer | Nguồn media gửi vào SFU / đường nhận nguồn cho một participant |
| Epoch / generation | Đời session / đời quyền sở hữu call hoặc object; vô hiệu sự kiện cũ |
| Revision / version / sequence | Phiên bản policy / context board / thứ tự nét riêng |
| Lease / intent | Quyền giữ nguồn tạm có hạn / thao tác chờ commit có version |
| Snapshot | Bản trạng thái được lọc quyền; frame snapshot là ảnh tạm khác khái niệm này |
| Staging / release candidate | Môi trường tích hợp Internet / bản đủ điều kiện nghiệm thu cuối |

### 19.2. Tài liệu chính thức và code tham khảo

Các nguồn giải thích cơ chế nền; thông số, schemas, quyền và phân công của CoLearnia do nhóm thiết kế. Đã đối chiếu các điểm media/recovery/transaction trọng yếu ngày 24/10/2026; các nguồn bổ trợ kế thừa lượt review 23–24/10. Khi triển khai, lưu version/commit nguồn tham khảo, không coi branch hiện tại là bằng chứng đã chạy.

- [mediasoup: Communication Between Client and Server](https://mediasoup.org/documentation/v3/communication-between-client-and-server/).
- [mediasoup: API / WebRtcServer](https://mediasoup.org/documentation/v3/mediasoup/api/).
- [mediasoup: Scalability](https://mediasoup.org/documentation/v3/scalability/) và [Installation](https://mediasoup.org/documentation/v3/mediasoup/installation/).
- [Socket.IO: Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/), [Recovery](https://socket.io/docs/v4/connection-state-recovery/) và [Rooms](https://socket.io/docs/v4/rooms/).
- [MongoDB: Transactions](https://www.mongodb.com/docs/manual/core/transactions/) và [Partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/).
- [MDN: getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage), [GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode).
- [WebRTC: TURN](https://webrtc.org/getting-started/turn-server).
- [arc42 overview](https://arc42.org/overview/), [C4 diagrams](https://c4model.com/diagrams), [MADR](https://adr.github.io/madr/).
- [mediasoup-demo Peer.ts](https://github.com/versatica/mediasoup-demo/blob/v3/server/src/Peer.ts): tham khảo lifecycle; app vẫn cần policy riêng.
- [eduMEET](https://github.com/edumeet/edumeet), [MiroTalk SFU](https://github.com/miroslavpejic85/mirotalksfu), [LiveKit Meet](https://github.com/livekit-examples/meet), [BigBlueButton](https://github.com/bigbluebutton/bigbluebutton): tham khảo kiến trúc/workflow; không fork mặc định hoặc suy hiệu năng từ tính năng quảng bá. Kiểm license của đúng phần code trước tái sử dụng.

### 19.3. Lịch sử thay đổi v2.0–v2.1 so với bản 23/10/2026

Các dòng dưới ghi quyết định tại thời điểm v2.0–v2.1; phần floor/presentation đã được thay bằng v2.2 ở đầu tài liệu và nguồn product hiện hành.

- Lịch 10+2 tuần chuyển thành 4 tuần build + 1–2 tuần hoàn thiện, có gate ngày 3/tuần 2/3/4 và staging từ tuần 1.
- Giữ camera, tài liệu, hỗ trợ riêng, floor/presentation trong scope bắt buộc; định nghĩa mức cơ bản thay vì chuyển thành phần tùy chọn.
- Loại quiz/timer/status/library/artifact và contracts/models tương ứng; frame tạm vẫn phục vụ freeze.
- Bổ sung publish policy, snapshot/history ACL, owner duy nhất, host transfer, call generation và reconnect không replay private.
- Chốt Mongo replica set/transaction, DB–runtime barrier, attachment binding, retention/ref-count cleanup.
- Làm rõ freeze queue không chờ I/O, share picker activation, nguồn snapshot do client cung cấp và giới hạn thu hồi dữ liệu.
- Bổ sung profile 5 người có camera, quality targets chưa đo, test IDs/owner, worker/port topology và công thức budget không nhân trùng.
- Giữ các mục chưa biết là giả định cần xác nhận; ADR media chỉ Accepted sau PoC có evidence, không khẳng định feasibility/hiệu năng khi chưa chạy.

## Làm rõ nhóm và hỗ trợ ngày 02/11/2026

Quyết định này thay cách hiểu host có thể vào hỗ trợ mọi loại nhóm trong các mô tả trước: host chỉ vào hỗ trợ ACTIVITY; DISCUSSION hỏi/trả lời qua chat riêng khi host tiếp tục ở MAIN. DISCUSSION tạo hợp lệ chưa ai vào vẫn chờ, còn người thì roster hợp lệ được chủ động vào lại; người cuối cùng chủ động rời nhóm đã có người làm nhóm tự kết thúc và thu private scope. Không áp quy tắc này cho ACTIVITY hoặc coi mất mạng là chủ động rời. Chi tiết ở [group modes](product/group-modes.md), [policy](product/groups-media-policy.md), [HS-02](product/use-cases/02-discussion.md) và [HS-06](product/use-cases/06-private-help.md); không thêm feature/UC/collection hoặc chứng minh runtime đã chạy.

## Bổ sung recording MAIN sau kickoff 02/11

RECORD-01 theo [nguồn nghiệp vụ](product/recording.md): host điều khiển ghi màn hình/camera/âm thanh MAIN; lưu theo phiên để thành viên còn quyền kênh xem. Không ghi nhóm riêng hoặc chuyển recorder theo host hỗ trợ. Chưa có implementation hoặc benchmark. Proposal M3 chủ trì, M4 cung cấp host/scope/lifecycle, M2 lưu/phục vụ byte/ACL, M1 quyền kênh.

Cần chọn capture/composition/encode, bố cục/số camera/codec và cách phát, trạng thái xử lý, idempotency, cleanup khi stop/end/error/restart, quota/retention/quyền xóa. Delta collection/index theo [schema recordings bàn giao](database/recordings-schema.md) đã có trên main 7c4320f qua PR #27: tối đa 3 tiếng/đoạn, READY giữ vô thời hạn; profile MP4/H264/AAC cần PoC, quota và quyền xóa sau parent deletion còn mở; chưa có thư viện/topology đã kiểm chứng hoặc schema executable. Không coi recorder là participant được nghe mọi scope. Không giữ queue/mutex phiên khi chờ encode/lưu file; task phải thiết kế gate tài nguyên và giao diện cleanup. Đo CPU/RAM/disk/network cùng media/chat/board/TURN trước khi chốt capacity; PoC clip vài phút không là giới hạn thời lượng sản phẩm. REC-01 vẫn là reconnect, không dùng mã đó cho recording.

Cập nhật scope 03/11/2026: chuyển owner Workspace không thuộc MVP; người tạo giữ OWNER và có thể cấp ADMIN. Không triển khai route owner-transfer; chuyển host cuộc họp không bị ảnh hưởng. Nguồn: [scope](product/scope.md).
