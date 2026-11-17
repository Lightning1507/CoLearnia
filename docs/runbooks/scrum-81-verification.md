# SCRUM-81 — Hai mạng, TURN và rollback ứng dụng staging

M3-T17.4, người thực hiện M5, reviewer M3. [Báo cáo lượt chuẩn bị](../test-evidence/2026-11-17-scrum-81.md) ghi kết quả thực chạy và blocker. Đây là công cụ và quy trình để chạy tiếp khi có môi trường, chưa phải nghiệm thu SCRUM-81 hoặc gate 5 người M3-T15.1.

Nguồn: [M3 §6.4–6.5 và T17.4](../proposals/m3-media.md), [Sprint 1 lượt D](../planning/sprint-1.md), [staging](staging-configuration.md), [TURN hiện hành](cloudflare-turn.md), [DB integrity/migration](../database/integrity-and-migrations.md). Prompt dẫn commit `a5fce0a`; T17.4 giữ phạm vi app-only rollback. T17.3 hiện tách giới hạn credential expiry sang SCRUM-92; không dùng sự thay đổi đó để ghi TURN-03 PASS.

## Điều kiện bắt đầu

Người vận hành điền bằng thông tin đã kiểm chứng, không dùng ví dụ làm môi trường thật:

| Đầu vào  | Bằng chứng cần có                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đích thử | Origin HTTPS, host triển khai, Compose project/files và network DB thật; người quản lý và khung giờ thử                                                |
| Hai mạng | Client A và B ở thiết bị/đường Internet độc lập; loại mạng/ISP, browser/OS, hạn chế mạng và người thực hiện; chỉ dùng nhãn A/B trong báo cáo công khai |
| Quyền    | Hai tài khoản có quyền kênh/MAIN; quyền SSH/deploy hợp lệ; approval riêng cho thay release, người xử lý sự cố                                          |
| Ứng dụng | Release/source commit và image digest thực chạy; luồng đăng nhập → join → SEND/RECV bằng authority thật đã ghép                                        |
| TURN     | Credential tạm qua contract server được triển khai; URL TLS 443 hoặc UDP 3478 theo từng lượt; không lấy secret dài hạn ở client                        |
| Rollback | Release hiện tại và trước đó có immutable digest cho **cả server/web**; cách chọn release đã được team review; cách recovery về release hiện tại       |

Thiếu đầu vào nào thì ghi BLOCKED cho phần phụ thuộc. Không cấp lại quyền, đổi firewall/DNS, seed/reset/migrate DB hoặc deploy để vượt blocker trong lượt chuẩn bị này. Không thay production hoặc tạo workflow triển khai cạnh tranh.

## Công cụ chỉ đọc

Chạy trên **từng mạng**, ghi timestamp và nhãn A/B riêng:

```powershell
pnpm exec node scripts/scrum81/staging-preflight.mjs --origin https://colearnia-staging.duckdns.org
```

Origin trên lấy từ runbook TURN; người chạy phải xác nhận vẫn là staging đích. Script không có origin mặc định, chỉ GET `/`, `/api/v1/system/status`, `/api/v1/auth/me` không cookie. Kiểm DNS không xuất IP, HTTPS kiểm chain/hostname, không theo redirect, mỗi request tối đa 8 giây và 64 KiB. Status cần `CoLearnia`, ready và DB/media connected; route auth phải từ chối anonymous bằng 401 kèm mã AUTH_REQUIRED. Không xuất body/header hoặc lỗi thô. Exit 0 chỉ là preflight HTTP từ **một mạng** đạt, 1 là lỗi phép kiểm, 2 là cách gọi sai. Đăng nhập thật, WebSocket có auth, RTP và rollback vẫn chưa kiểm.

Socket.IO hiện chỉ dùng WebSocket, nên polling HTTP không phải phép kiểm signaling. Dùng client được cấp quyền, xác nhận handshake có cookie/CSRF/Origin hợp lệ và gọi MAIN theo contract; chỉ lưu kết quả, không lưu cookie, proof hoặc request headers.

### Thu stats từ transport đang có

[media-evidence.mjs](../../scripts/scrum81/media-evidence.mjs) không tạo peer, không lấy mic/camera, không thay ICE policy và không đóng tài nguyên. Trong DevTools Sources → Snippets của **client test đã được phép**, sao chép nội dung file, bỏ từ khóa `export` ở hai khai báo hàm rồi chạy snippet. Không cần thêm mã vào app staging. Gọi `await sampleMedia(connection)` với RTCPeerConnection hoặc mediasoup SEND/RECV Transport **đang thuộc phiên test** mà debugger đã xác định. Không quét transport của phiên khác hoặc đổi production globals. Nếu chưa truy cập được đối tượng, ghi BLOCKED; không tạo peer giả thay luồng app.

Chạy riêng SEND/RECV ở cả A/B trong khi phát nguồn, thời gian mặc định 5 giây (cho phép 1–30 giây). Đầu ra chỉ có loại candidate của **selected pair**, trạng thái DTLS/pair, giao thức, RTT và delta counter theo transport/RTP. ID/address/port/SDP/URL/credential bị loại. Pair đổi, counter reset, stats thiếu hoặc timestamp không tăng cho delta `null`, không suy thành 0/PASS. Script không log gì tự động; chỉ lưu JSON trả về đã review. `selectedRelayWithRtp` chỉ quan sát selected relay có RTP tăng trên transport đó; không chứng minh hai mạng độc lập, mọi transport đều relay, nội dung nghe được hay toàn task PASS.

Trong buổi test ghi thêm ICE/connection state và thời điểm disconnect của client từ debugger/diagnostics, nhãn SEND/RECV, nguồn mic thật hay tổng hợp và người xác nhận nghe/nhìn. Không commit dump `webrtc-internals`, SDP hoặc raw stats. Có packet/sample nhưng năng lượng bằng 0 vẫn có thể là im lặng. Đối chiếu đầu gửi/nhận và kiểm nghe tiếng nói, hình chuyển động để nghiệm thu media.

## Ma trận chạy thật

Mỗi dòng ghi PASS/FAIL/BLOCKED/NOT RUN, UTC timestamp, release, nhãn client/mạng, bước đã chạy, số liệu đã lọc và lý do. Không điền PASS từ fixture/unit test.

| Ca      | Cách chạy và điều kiện đạt                                                                                                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NET-01  | Preflight trên A và B; sau đó login hợp lệ và WebSocket authenticated trên từng mạng. TLS không bypass.                                                                                                                                                                                               |
| NET-02  | Join cùng MAIN qua app thật; ICE connected/completed, DTLS connected, selected pair và transport state; không lấy signaling thay RTP.                                                                                                                                                                 |
| NET-03  | A publish mic/camera hoặc share được hỗ trợ, B consume; kiểm nghe/nhìn và RTP delta; đảo chiều rồi dừng nguồn đúng contract. Ghi rõ nguồn nào thực chạy.                                                                                                                                              |
| NET-04  | Thu selected pair và RTP ở SEND/RECV hai đầu; candidate type/protocol/RTT, timestamp, disconnect; không lấy candidate chưa selected.                                                                                                                                                                  |
| TURN-01 | Normal ICE, ghi allocation/gathering và đường **được chọn**; direct thành công là kết quả hợp lệ, chưa chứng minh relay.                                                                                                                                                                              |
| TURN-02 | Chỉ trên client test: `iceTransportPolicy: 'relay'` khi tạo mỗi transport, một URL/lượt, ở cả A/B. Xác nhận selected relay và media/RTP tăng ở mọi SEND/RECV cần dùng; thử TLS 443 và UDP 3478 riêng. Gỡ cấu hình test sau lượt. Nếu app chưa hỗ trợ cấu hình này, ghi BLOCKED, không đổi production. |
| TURN-03 | Dùng [công cụ hiện có](cloudflare-turn.md#kiểm-xác-thực-và-hết-hạn); credential hợp lệ đối chứng, sai/hết hạn từ chối. Mã 400 chưa xác định nguyên nhân; Allocate/thu hồi API đơn lẻ không chứng minh media hay expiry. Không tự thay đồng hồ hoặc tắt auth.                                          |
| TURN-04 | Nếu có phép thử lỗi được duyệt: relay không dùng được phải báo lỗi, không báo media connected sai; ghi cleanup/recovery. Không phá TURN chung.                                                                                                                                                        |
| RB-01   | Preflight release/digest/compatibility/drain/approval, thiếu bất kỳ điều kiện nào phải dừng.                                                                                                                                                                                                          |
| RB-02   | Chạy chính xác cơ chế app-only rollback đã được người vận hành duyệt; ghi image IDs/digests, release, thời gian và trạng thái kết thúc.                                                                                                                                                               |
| RB-03   | Health nội bộ, HTTPS, auth, workspace, signaling và luồng MAIN tối thiểu trên old release; health đơn lẻ chưa là functional smoke.                                                                                                                                                                    |
| DATA-01 | Đối chiếu identity DB/volume và canary/checksum trước/sau, dữ liệu tạo hợp lệ bằng release mới và object/metadata recording nếu có. Count đơn lẻ không đủ.                                                                                                                                            |
| RB-04   | Nếu rollback lỗi: ghi FAIL/BLOCKED, dừng thao tác, recovery app theo approval, kiểm lại health và canary. Không restore/reset DB.                                                                                                                                                                     |

## Rollback: preflight và điều kiện dừng

Compose hiện tại dùng `build:` cho server/web; không có release `image:` bất biến, Mongo ở external network do task staging cấp. Không tự đoán container/volume DB từ tên project. CI hiện chỉ kiểm code/Docker smoke, không có workflow rollback. Vì vậy lượt chuẩn bị **không cung cấp lệnh đổi deployment**: người vận hành cần bàn giao cơ chế thực tế đã review cùng release inventory. Không dùng `git checkout` trên server và build lại source để giả bằng chứng quay về đúng immutable artifact.

Trước cửa sổ thử, M3/M4/M1 kiểm từng điều kiện và gắn nguồn bằng chứng:

1. Xác nhận current/target server và web digests, kiến trúc CPU, còn lấy được artifact, khác current và đúng release trước; recovery artifact hiện tại vẫn còn. Đối chiếu image config/entrypoint với source đã review để phát hiện startup có migration/reset tự động. Không chạy bản cũ để thử compatibility khi chưa preflight.
2. So sánh env **tên biến và config revision**, API/contract, schema/validator/index và kiểu dữ liệu đã ghi; M1/M2 xác nhận old release đọc/ghi được dữ liệu mới. Ghi yêu cầu migration và dừng nếu phá hủy/không tương thích. Không in `docker inspect` đầy đủ, Compose config đầy đủ hoặc `.env` vào evidence.
3. Kiểm storage path/mount, bucket/object/recording schema và quyền đọc; chính sách backup/recovery đang hợp lệ, nhưng task không restore. DB dùng một pool hiện có; không tạo worker/Redis mới. Ghi workload hiện tại, CPU/RAM, queue/pool/gate/quota/disk nếu có telemetry được phép, trạng thái metric không có cũng phải ghi rõ.
4. Liệt kê active calls, pending media, recording/writer/finalization và upload qua công cụ vận hành hiện hành. Dừng admission và drain theo quy trình team đã duyệt. Có hoạt động chưa hoàn tất mà chưa có policy an toàn: **BLOCKED**. Không tự end call hoặc xóa recording để tạo điều kiện đạt.
5. Xác nhận môi trường, scope chỉ server/web, khung giờ, approval, owner sự cố và exact rollback/recovery command do operator cung cấp. Không include DB service, migrations hoặc volume cleanup. Lưu cấu hình resource trước/sau để chắc không mất mount/quyền.

### Snapshot trước và sau

Chỉ chạy các lệnh đọc này trong phiên truy cập staging đã được cấp; đường dẫn/files phải đối chiếu deployment thực tế:

```sh
docker compose --env-file .env.staging -f docker-compose.staging.yml config --quiet
docker compose --env-file .env.staging -f docker-compose.staging.yml ps --format json
docker compose --env-file .env.staging -f docker-compose.staging.yml images --format json
```

Các lệnh trên không xác nhận DB ngoài stack hay image digest đầy đủ. Operator lấy container IDs bằng `compose ps -q server` / `compose ps -q web`, rồi chỉ xuất field cần dùng bằng `docker inspect --format` (`.Image`, `.State.Health.Status`, `.Mounts`) và `docker image inspect --format '{{json .RepoDigests}}' IMAGE_ID`. Không dùng shell eval từ evidence. Lọc tên host/path/network riêng trước khi chia sẻ; không log `.Config.Env`. Inspect Mongo/volume bằng inventory DB do owner cung cấp, không tìm credential trong config.

Ghi database/replica-set identity và tên mount/volume thật trong kho bằng chứng riêng được phép; báo cáo công khai dùng nhãn nhất quán. M1/M2 chọn canary hợp lệ, không nhạy cảm, có quyền đọc; canary được tạo bằng release mới qua API đã được duyệt và giữ qua rollback. Ghi ID/checksum hoặc boolean so sánh đã lọc, không ghi nội dung người dùng. So sánh cùng canary, không chỉ tổng document. Background writes phải được giải thích; dữ liệu/recording mới còn đọc được bằng old release. Không tự tạo DB index hoặc schema để chạy phép kiểm.

Sau exact app rollback đã duyệt: đối chiếu **running image IDs với target digests**, DB/volume/canary giữ nguyên, `/health/ready` **bên trong** server (Nginx chặn `/health/`), status HTTPS, auth, workspace, signaling/media smoke. Ghi riêng health và functional smoke. Nếu lỗi, recovery app theo cùng approval; mọi lần thử giữ evidence và trạng thái cuối, không ghi PASS khi chỉ quay lại current release.

Cấm mọi reset/seed/restore snapshot, `down -v`, volume remove/prune, `mongorestore --drop`, drop database/collection, đảo migration phá hủy hoặc xóa object/recording. Snapshot ở đây là ghi nhận trạng thái, không phải restore DB. Nếu target không tương thích, kết quả đúng là BLOCKED.

## Kiểm công cụ local

```powershell
pnpm install --frozen-lockfile
pnpm exec node --test scripts/scrum81/diagnostics.test.mjs
pnpm exec eslint scripts/scrum81 --max-warnings=0
pnpm check
pnpm media:smoke
```

Regression mới dùng Node test runner như các script TURN hiện có, chưa được thêm vào `package.json`/CI vì task chỉ thêm file mới. Reviewer/CI cần chạy lệnh test riêng trên; không gọi `pnpm check` là đã chạy suite mới. Kiểm local không thay lượt hai mạng/rollback và không chứng minh capacity 5/25/50 người.
