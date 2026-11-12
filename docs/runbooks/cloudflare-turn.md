# Kiểm tra Cloudflare TURN trên staging

SCRUM-63 kiểm relay có xác thực và thời hạn credential. Cloudflare phục vụ TURN; EC2 vẫn chạy ứng dụng, MongoDB và media worker. TURN không thay thế SFU hoặc đưa RTP qua Nginx. Kết quả theo từng môi trường nằm trong [báo cáo kiểm tra](../test-evidence/2026-11-11-scrum-63-turn.md).

Theo [xác nhận phạm vi của chủ repo](https://github.com/Lightning1507/CoLearnia/pull/88#issuecomment-6813775252), SCRUM-63 hoàn tất phần cấu hình Cloudflare TURN, kiểm credential/relay, ghi bằng chứng và bàn giao. Phần từ chối sau TTL chuyển sang [SCRUM-92](https://faker1652005.atlassian.net/browse/SCRUM-92), chưa đạt. Xác nhận của chủ repo không thay approval M3; PR vẫn cần reviewer kiểm. Mật khẩu sai trả 400 chỉ xác nhận Allocate bị từ chối, chưa xác định nguyên nhân.

## Địa chỉ và quyền truy cập

- Ứng dụng: `https://colearnia-staging.duckdns.org`.
- TURN app trên Cloudflare: `colearnia-staging`.
- Đường ưu tiên kiểm: `turns:turn.cloudflare.com:443?transport=tcp`; kiểm thêm `turn:turn.cloudflare.com:3478?transport=udp`.
- Giữ cổng media EC2 theo [cấu hình staging](staging-configuration.md). Dùng Cloudflare TURN không yêu cầu mở cổng 3478/5349 hoặc dải relay của coturn trên EC2. Máy khách cần kết nối ra được tới Cloudflare; Cloudflare cần kết nối được tới địa chỉ/cổng media được công bố.
- SSH chỉ cho phép IP của người triển khai. Khi đổi mạng, cập nhật nguồn được phép trong Security Group; không phải tạo lại SSH key hoặc TURN app.

Cloudflare cấp credential qua [API chính thức](https://developers.cloudflare.com/realtime/turn/generate-credentials/). `TURN_KEY_ID` và `TURN_KEY_API_TOKEN` chỉ dùng phía server hoặc công cụ kiểm được cấp quyền. Trình duyệt chỉ nhận credential tạm. Không đưa hai giá trị này vào `VITE_*`, source, ảnh chụp hoặc log.

## Kiểm xác thực và hết hạn

### Thời hạn dùng cho buổi học

TTL chốt cho credential buổi học là **14.400 giây (4 giờ)**. SCRUM-64 cần cấp mới khi credential còn tối đa **3.600 giây (1 giờ)** và cập nhật ICE servers theo đời kết nối hiện hành. Đây là thời hạn của credential, không phải giới hạn thời lượng cuộc họp. Cấp mới credential không tự thực hiện ICE restart, không tự cấp lại quyền đã bị thu và không bảo đảm allocation cũ được gia hạn; adapter tích hợp phải kiểm lại đường truyền và xử lý phục hồi theo contract.

Mốc **60 giây chỉ dành cho phép thử hết hạn nhanh**, không phải cấu hình người học. TTL 14.400 giây hiện áp dụng cho công cụ kiểm và cấu hình bàn giao; endpoint cấp ICE của ứng dụng thuộc SCRUM-64, chưa được triển khai trong SCRUM-63. Không ghi cấu hình này là đã áp dụng cho cuộc gọi thực.

### Kiểm credential 4 giờ

Công cụ [verify-cloudflare-turn.py](../../scripts/verify-cloudflare-turn.py) dùng Python 3 với thư viện chuẩn. Công cụ tạo hai credential có cùng TTL: một credential dùng ngay, một credential chưa dùng trước mốc hết hạn. Mỗi phép Allocate mở kết nối TLS mới; sau khi cấp relay, công cụ gửi Refresh với lifetime bằng 0 để giải phóng allocation.

Nạp hai biến từ nơi giữ secret của môi trường. Trên máy local có Node 26 và file `.env.turn.local` đã được Git bỏ qua, có thể truyền chúng cho tiến trình con mà không in ra màn hình:

```powershell
node --env-file=.env.turn.local -e "const p=require('node:child_process').spawnSync('python',['-u','scripts/verify-cloudflare-turn.py','--auth-only'],{stdio:'inherit',env:process.env});process.exit(p.status??1)"
```

Trên Linux, sau khi môi trường đã có hai biến, chạy:

```bash
python3 -u scripts/verify-cloudflare-turn.py --auth-only
```

`--auth-only` kiểm credential 14.400 giây dùng được và cùng username với mật khẩu sai bị từ chối do xác thực, rồi thu hồi credential thử. Chỉ mã 401 ở phản hồi Allocate đã kèm credentials (sau challenge ban đầu) được phân loại là từ chối xác thực. Mã 400/403/441/486/508 hoặc mã chưa biết không được suy thành lỗi password/expiry. Kết quả ghi `scope=authentication`, `expiryVerified=false`; khi chưa xác định nguyên nhân thì `status=inconclusive`, exit 2. Exit 0 chỉ xác nhận baseline xác thực đạt, không xác nhận hết hạn.

### Kiểm hết hạn riêng

Không truyền `--auth-only` khi kiểm hết hạn. Chạy với TTL 4 giờ cần khoảng 4 giờ 14 phút. Để kiểm nhanh hành vi hết hạn với TTL 60 giây, chạy:

```bash
python3 -u scripts/verify-cloudflare-turn.py --ttl 60 --delay 840
```

Trên Windows dùng lệnh Node phía trên, thay `'--auth-only'` bằng `'--ttl','60','--delay','840'`. Phép kiểm ngắn mất khoảng 15 phút. Tăng TTL không sửa việc TURN còn chấp nhận credential đã quá hạn; kết quả thử 60 giây vẫn được giữ nguyên trong báo cáo.

Công cụ chỉ xuất JSON với trạng thái, tuổi credential, giao thức và mã lỗi; không xuất username, password, API token hoặc địa chỉ relay. Đầu ra gồm:

1. `baseline`: credential hợp lệ được cấp relay; cùng username nhưng mật khẩu ngẫu nhiên bị từ chối.
2. `expiry`: kiểm ở TTL + 20 giây và TTL + `delay` giây, trên cả credential đã dùng và chưa dùng.
3. `fresh-control`: credential vừa cấp vẫn dùng được, phân biệt lỗi hết hạn với sự cố mạng/dịch vụ.
4. `revoke`: cố gắng thu hồi credential đã tạo khi kết thúc, kể cả khi phép kiểm thất bại.

Ở chế độ kiểm hết hạn, exit 0 yêu cầu baseline đúng, cả hai credential cũ nhận mã 401 sau authenticated Allocate ở mốc cuối và credential mới vẫn Allocate thành công. Exit 1 khi credential cũ còn dùng được hoặc baseline thất bại; exit 2 khi bị từ chối bởi quota/capacity/nonce/protocol/mã chưa xác định hoặc credential mới đối chứng không dùng được. Output `scope=expiry`, `status`, `reason` và `expiryVerified` phân biệt các kết quả. HTTP API/TLS/timeout là lỗi phép đo (exit 1), không phải expiry pass. Quy tắc dựa trên [RFC 8656](https://www.rfc-editor.org/rfc/rfc8656.html#section-19); 441 dành cho non-Allocate, 486 là quota.

Mã 401 sau TTL là bằng chứng từ chối xác thực tại mốc đo, không xác định độc lập nguyên nhân là TTL hay thu hồi khác, cũng không chứng minh từ chối đúng ngay giây hết hạn. Không thu hồi credential trước phép đo; ghi nhận thay đổi key/provider. Nếu tiến trình bị buộc dừng, credential còn lại phụ thuộc thời hạn nhà cung cấp thực thi; dùng `--auth-only` để kiểm nhanh.

`--allocate-stdin` chỉ kiểm một credential tạm từ JSON qua stdin, không gọi API và không cần khóa dài hạn. Chế độ này dùng để kiểm từ EC2 qua SSH hoặc từ một máy khác; không truyền credential trong tham số dòng lệnh. Trường `accepted` trong JSON là kết quả xác thực; exit 0 của chế độ này chỉ xác nhận phép đo thực hiện được. Không đưa `.env.turn.local` hoặc khóa dài hạn lên máy khác để chạy phép kiểm đơn lẻ.

Cloudflare mô tả credential có TTL và allocation đang dùng có thể bị ngắt sau một khoảng trễ khi credential hết hạn trong [FAQ](https://developers.cloudflare.com/realtime/turn/faq/). Việc credential còn cấp được allocation mới sau TTL phải được ghi là kết quả chưa đạt; không thay tiêu chí bằng “API thu hồi trả 404”.

Credential TURN chỉ cho phép dùng relay, không cấp quyền vào cuộc họp. Server CoLearnia vẫn phải kiểm ownership/access và đóng tài nguyên khi thu quyền. Dù vậy, credential còn dùng được ngoài thời hạn có thể cho phép dùng relay ngoài dự kiến và phát sinh lưu lượng. Việc chấp nhận giới hạn này để hoàn tất phần cấu hình không chứng minh Cloudflare đã thực thi đúng TTL; vẫn cần làm rõ và theo dõi riêng.

## Kiểm trên trình duyệt

Buộc `iceTransportPolicy: 'relay'` ở cả hai đầu. Giới hạn một URL TURN mỗi lượt để phân biệt TLS 443 với UDP 3478. Dùng `getStats()` lấy transport có `selectedCandidatePairId`, tra hai candidate từ cặp đó và ghi:

- `candidateType` của hai đầu, `relayProtocol`, trạng thái ICE/kết nối.
- Số gói/byte nhận trước và sau khi truyền; với audio ghi số mẫu và năng lượng tín hiệu nếu trình duyệt cung cấp.
- Trình duyệt, mạng của từng máy, đường TURN và thời điểm kiểm.
- Nguồn âm là mic thật, âm tổng hợp hay thiết bị mô phỏng. Chỉ có packet counter tăng chưa chứng minh nghe được tiếng nói.

Không đính kèm SDP, ICE credential hoặc bản dump WebRTC nguyên gốc vào PR/Jira. Chỉ đưa số liệu đã loại thông tin nhạy cảm. Phép kiểm hai peer trong cùng trình duyệt chỉ kiểm đường relay từ một mạng; Allocate từ EC2 không biến phép kiểm đó thành cuộc gọi giữa hai mạng.

## Bàn giao và giới hạn

- SCRUM-64 triển khai cấp ICE credential sau xác thực, kiểm quyền session/ownership, giới hạn tần suất và `Cache-Control: no-store`. Cấp credential mới không tự thực hiện ICE restart. Hiện chưa nối Cloudflare vào endpoint ứng dụng trong task này.
- `TURN_SECRET` theo phương án coturn là HMAC shared secret; không thay bằng Cloudflare API token. Tên biến cho adapter Cloudflare của ứng dụng cần được cập nhật cùng SCRUM-64.
- SCRUM-81 kiểm cuộc gọi tích hợp qua hai mạng, âm thanh thực và rollback. Không đánh dấu kiểm media đạt từ readiness hoặc phép Allocate.
- Nếu Cloudflare không đáp ứng yêu cầu hết hạn, cần làm rõ độ trễ với nhà cung cấp hoặc chọn [coturn](../../infra/coturn/README.md) cùng người quản trị hạ tầng. Không tự mở thêm cổng EC2 hay đổi nhà cung cấp trong lúc đo.
