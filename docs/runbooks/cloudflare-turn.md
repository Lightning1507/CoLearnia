# Kiểm tra Cloudflare TURN trên staging

SCRUM-63 kiểm relay có xác thực và thời hạn credential. Cloudflare phục vụ TURN; EC2 vẫn chạy ứng dụng, MongoDB và media worker. TURN không thay thế SFU hoặc đưa RTP qua Nginx. Kết quả theo từng môi trường nằm trong [báo cáo kiểm tra](../test-evidence/2026-11-11-scrum-63-turn.md).

## Địa chỉ và quyền truy cập

- Ứng dụng: `https://colearnia-staging.duckdns.org`.
- TURN app trên Cloudflare: `colearnia-staging`.
- Đường ưu tiên kiểm: `turns:turn.cloudflare.com:443?transport=tcp`; kiểm thêm `turn:turn.cloudflare.com:3478?transport=udp`.
- Giữ cổng media EC2 theo [cấu hình staging](staging-configuration.md). Dùng Cloudflare TURN không yêu cầu mở cổng 3478/5349 hoặc dải relay của coturn trên EC2. Máy khách cần kết nối ra được tới Cloudflare; Cloudflare cần kết nối được tới địa chỉ/cổng media được công bố.
- SSH chỉ cho phép IP của người triển khai. Khi đổi mạng, cập nhật nguồn được phép trong Security Group; không phải tạo lại SSH key hoặc TURN app.

Cloudflare cấp credential qua [API chính thức](https://developers.cloudflare.com/realtime/turn/generate-credentials/). `TURN_KEY_ID` và `TURN_KEY_API_TOKEN` chỉ dùng phía server hoặc công cụ kiểm được cấp quyền. Trình duyệt chỉ nhận credential tạm. Không đưa hai giá trị này vào `VITE_*`, source, ảnh chụp hoặc log.

## Kiểm xác thực và hết hạn

Công cụ [verify-cloudflare-turn.py](../../scripts/verify-cloudflare-turn.py) dùng Python 3 với thư viện chuẩn. Công cụ tạo hai credential có cùng TTL: một credential dùng ngay, một credential chưa dùng trước mốc hết hạn. Mỗi phép Allocate mở kết nối TLS mới; sau khi cấp relay, công cụ gửi Refresh với lifetime bằng 0 để giải phóng allocation.

Nạp hai biến từ nơi giữ secret của môi trường. Trên máy local có Node 26 và file `.env.turn.local` đã được Git bỏ qua, có thể truyền chúng cho tiến trình con mà không in ra màn hình:

```powershell
node --env-file=.env.turn.local -e "const p=require('node:child_process').spawnSync('python',['-u','scripts/verify-cloudflare-turn.py'],{stdio:'inherit',env:process.env});process.exit(p.status??1)"
```

Trên Linux, sau khi môi trường đã có hai biến, chạy:

```bash
python3 -u scripts/verify-cloudflare-turn.py --ttl 60 --delay 840
```

Phép kiểm mặc định mất khoảng 15 phút. Công cụ chỉ xuất JSON với trạng thái, tuổi credential, giao thức và mã lỗi; không xuất username, password, API token hoặc địa chỉ relay. Đầu ra gồm:

1. `baseline`: credential hợp lệ được cấp relay; cùng username nhưng mật khẩu ngẫu nhiên bị từ chối.
2. `expiry`: kiểm ở TTL + 20 giây và TTL + `delay` giây, trên cả credential đã dùng và chưa dùng.
3. `fresh-control`: credential vừa cấp vẫn dùng được, phân biệt lỗi hết hạn với sự cố mạng/dịch vụ.
4. `revoke`: cố gắng thu hồi credential đã tạo khi kết thúc, kể cả khi phép kiểm thất bại.

Exit 0 chỉ có khi baseline đúng, hai credential cũ đều bị TURN từ chối ở mốc cuối và credential mới vẫn được chấp nhận. Timeout, lỗi API hoặc TLS không được tính là bằng chứng credential hết hạn. Exit 0 cũng không chứng minh từ chối đúng ngay giây TTL; cần đọc các mốc đo trước khi nghiệm thu. Nếu tiến trình bị buộc dừng, credential còn lại phụ thuộc thời hạn do nhà cung cấp thực thi; không dùng công cụ với TTL dài chỉ để kiểm nhanh.

`--allocate-stdin` chỉ kiểm một credential tạm từ JSON qua stdin, không gọi API và không cần khóa dài hạn. Chế độ này dùng để kiểm từ EC2 qua SSH hoặc từ một máy khác; không truyền credential trong tham số dòng lệnh. Trường `accepted` trong JSON là kết quả xác thực; exit 0 của chế độ này chỉ xác nhận phép đo thực hiện được. Không đưa `.env.turn.local` hoặc khóa dài hạn lên máy khác để chạy phép kiểm đơn lẻ.

Cloudflare mô tả credential có TTL và allocation đang dùng có thể bị ngắt sau một khoảng trễ khi credential hết hạn trong [FAQ](https://developers.cloudflare.com/realtime/turn/faq/). Việc credential còn cấp được allocation mới sau TTL phải được ghi là kết quả chưa đạt; không thay tiêu chí bằng “API thu hồi trả 404”.

Credential TURN chỉ cho phép dùng relay, không cấp quyền vào cuộc họp. Server CoLearnia vẫn phải kiểm ownership/access và đóng tài nguyên khi thu quyền. Dù vậy, credential còn dùng được ngoài thời hạn có thể cho phép dùng relay ngoài dự kiến và phát sinh lưu lượng; kiểm quyền ứng dụng không thay thế tiêu chí hết hạn của SCRUM-63.

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
