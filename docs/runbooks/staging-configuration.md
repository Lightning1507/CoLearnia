# SCRUM-54 — Cấu hình cần chuẩn bị cho staging

Staging là môi trường thử chung của nhóm. SCRUM-54 chuẩn bị cấu hình để người triển khai biết máy chủ cần nhận kết nối nào, đọc chứng chỉ ở đâu và truy cập MongoDB bằng quyền gì. M4 review diff này trước khi SCRUM-55 triển khai app/Mongo và SCRUM-63 cấu hình TURN. M1 phối hợp xác nhận phần app và cơ sở dữ liệu. Xem [kế hoạch Sprint 1](../planning/sprint-1.md) và [thiết kế triển khai](../technical-plan.md#17-triển-khai-và-vận-hành).

## Cấu hình hiện có và phần đề xuất

| Hạng mục            | Cấu hình local                                                                                                | Cấu hình staging để review                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Địa chỉ web         | Web ở `http://localhost:8080` trong Compose. App dùng địa chỉ này để kiểm nguồn yêu cầu và kết nối Socket.IO. | Dùng một địa chỉ HTTPS chuẩn, ví dụ `https://staging.example.com`. Điền đúng địa chỉ trình duyệt mở vào `APP_ORIGIN`, gồm scheme và hostname, không thêm path hoặc dấu slash cuối. |
| HTTPS và proxy      | Nginx phục vụ HTTP và chuyển tiếp API/Socket.IO đến app.                                                      | Nginx nhận HTTPS trực tiếp trên TCP 443, dùng chứng chỉ được cấp, tiếp tục phục vụ web/API/Socket.IO trên cùng hostname. Chuyển tiếp giao thức HTTPS và hỗ trợ nâng cấp WebSocket. |
| Media trực tiếp     | Cổng 40000 TCP/UDP chỉ mở trên loopback. Địa chỉ media mặc định là `127.0.0.1`.                               | Công bố TCP/UDP 40000 cùng số trong và ngoài container. App lắng nghe trong container và công bố IP công cộng mà máy người dùng truy cập được.                                     |
| MongoDB             | Mongo replica set local chưa bật xác thực, có cổng loopback.                                                  | Dùng replica set staging có xác thực trên mạng Docker riêng đã được cấp. SCRUM-55 chuẩn bị DB, volume bền, replica set và tài khoản.                                               |
| Kiểm tra trạng thái | Local chuyển tiếp đường dẫn `/health/` qua Nginx.                                                             | App kiểm readiness nội bộ trên cổng 3001. Nginx staging chặn `/health/`. Route trạng thái ứng dụng hiện có vẫn đi qua `/api/`.                                                     |

Sử dụng [Compose staging](../../docker-compose.staging.yml) độc lập với [Compose local](../../docker-compose.yml). App và Nginx dùng lại Dockerfile hiện tại. Chỉ app tham gia mạng Docker riêng của MongoDB. Địa chỉ thành viên mà replica set trả về phải được phân giải và kết nối được từ container app, kể cả sau khi kết nối ban đầu thành công.

Phương án review đặt TLS tại Nginx trong container và dùng chứng chỉ đã được cấp trước. Nếu nhóm chọn một proxy TLS bên ngoài hoặc cần TCP 80 để chuyển hướng/ACME HTTP challenge, M4 cần xác nhận lại sơ đồ cổng và cách chuyển tiếp giao thức trước khi mở firewall. Cấu hình này chỉ mở TCP 443 cho web.

## Thông tin và quyền cần cấp

| Ai phối hợp                | Đầu vào cần cấp                                                                              | Điều cần xác nhận                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM / người quản lý hạ tầng | VPS Linux có Docker Compose, IP công cộng, DNS và người có quyền quản trị firewall.          | Người triển khai được truy cập VPS, chạy Compose và lấy đúng bản mã/image đã review. Chỉ cấp quyền firewall và DNS cho người cần thay đổi.                                                                                         |
| Người quản lý DNS/TLS      | Hostname staging, chứng chỉ đầy đủ chuỗi tin cậy, khóa riêng và cách gia hạn.                | DNS trỏ đúng máy, chứng chỉ khớp hostname, key chỉ người được cấp quyền đọc. Đưa hai file chứng chỉ/khóa vào container qua mount chỉ đọc. Khi gia hạn thay file, kiểm lại mount và tạo lại container web nếu cần để nạp đúng file. |
| M1 / người quản trị DB     | Mạng Docker riêng, replica set có xác thực, URI tài khoản ứng dụng và nơi lưu backup.        | App dùng tài khoản chỉ có quyền cần thiết trên DB staging. Việc quản trị, tạo tài khoản hoặc migration dùng quyền được cấp riêng. Không công bố 27017 ra Internet.                                                                 |
| M4 / người cấu hình TURN   | Hostname/IP TURN, chứng chỉ nếu dùng TLS, dải relay và cách cấp thông tin truy cập ngắn hạn. | Cổng không đụng Nginx và media. Chỉ mở sau khi có cấu hình TURN xác thực và kế hoạch kiểm relay.                                                                                                                                   |
| Người triển khai           | Kênh riêng để lấy cấu hình nhạy cảm và nơi lưu báo cáo kiểm.                                 | Chỉ chia sẻ tên biến, trạng thái và kết quả đã che thông tin. URI có mật khẩu, khóa TLS, TURN secret và token lấy từ kênh cấp quyền riêng.                                                                                         |

### Các biến cần điền

Sao chép [mẫu staging](../../.env.staging.example) thành `.env.staging` trên máy triển khai. Mẫu để trống và Compose yêu cầu các giá trị này khi đọc cấu hình.

| Biến                      | Cần điền gì                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`              | Địa chỉ HTTPS chuẩn của web staging. Phải khớp chính xác nguồn trình duyệt gửi khi kết nối Socket.IO.                                         |
| `MEDIA_ANNOUNCED_ADDRESS` | IP công cộng có thể truy cập của media worker. Nếu qua NAT, xác nhận IP công bố và mapping 40000 TCP/UDP từ Internet đến đúng host.           |
| `MONGO_URI`               | URI kết nối riêng có xác thực và tên replica set do người quản trị DB cấp. Xác nhận DB đích, `authSource` và yêu cầu TLS của môi trường thật. |
| `STAGING_DB_NETWORK`      | Tên mạng Docker riêng đã tạo cho MongoDB staging. Mạng phải có trước khi chạy Compose.                                                        |
| `STAGING_TLS_CERT_FILE`   | Đường dẫn tuyệt đối trên VPS đến file chứng chỉ đầy đủ chuỗi.                                                                                 |
| `STAGING_TLS_KEY_FILE`    | Đường dẫn tuyệt đối trên VPS đến file khóa riêng.                                                                                             |

Compose đặt sẵn `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3001`, `MEDIA_ENABLED=true`, `MEDIA_LISTEN_IP=0.0.0.0` và `MEDIA_PORT=40000`. Cổng 3001 phục vụ Nginx trong mạng Docker. Trình duyệt gọi đường dẫn API tương đối nên dùng cùng địa chỉ HTTPS. Việc Compose nhận đủ biến chỉ xác nhận chúng có giá trị. Người triển khai vẫn phải đối chiếu địa chỉ HTTPS, IP công bố và thông tin xác thực của DB với hạ tầng đã cấp.

`SESSION_SECRET`, `AUTH_TTL_SECONDS`, `TURN_URLS` và `TURN_SECRET` có tên trong mẫu local, nhưng trình nạp cấu hình server hiện tại chưa dùng chúng. Chủ task auth và TURN cần xác nhận tên, nguồn cấp và cách nối trước khi bật tính năng tương ứng. Các giá trị cho DB/TURN/auth không đưa vào biến `VITE_*` của frontend.

Trước khi bật tính năng tệp, cần chuẩn bị nơi lưu riêng, quyền đọc/ghi, dung lượng và cơ chế dọn theo task phụ trách. Khi chạy luồng tích hợp, kiểm quyền giữa các nhóm và đo tài nguyên dùng chung của app, media, MongoDB và TURN theo [kế hoạch tải](../capacity.md).

### Các cổng cần kiểm

| Cổng                                    | Ai dùng                         | Phạm vi                                                                                                                      |
| --------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| TCP 443                                 | Trình duyệt đến Nginx           | HTTPS, REST và Socket.IO.                                                                                                    |
| UDP và TCP 40000                        | Máy người dùng đến media worker | Mở đúng cổng ở firewall VPS và firewall nhà cung cấp. RTP không đi qua Nginx.                                                |
| TCP 3001, TCP 27017                     | Nginx đến app, app đến MongoDB  | Giữ trong mạng riêng. Kiểm từ bên ngoài để xác nhận không truy cập được, kể cả khi Docker quản lý quy tắc firewall của host. |
| UDP/TCP 3478, TCP 5349, UDP 49160–49200 | TURN và relay                   | Mức dự kiến trong kế hoạch. SCRUM-63 xác nhận từng cổng và dải relay theo cấu hình thực tế trước khi mở.                     |

## Checklist bàn giao

### M4 review cấu hình

- [ ] Xác nhận hostname, TLS, giá trị `APP_ORIGIN` và tuyến API/Socket.IO.
- [ ] Xác nhận IP công bố, mapping media TCP/UDP và người có quyền mở firewall.
- [ ] Xác nhận MongoDB dùng mạng riêng, replica set có xác thực và tài khoản app phù hợp.
- [ ] Xác nhận người cấp DNS/chứng chỉ, cách gia hạn, người cấp quyền VPS/DB và kênh nhận biến nhạy cảm.

### SCRUM-55 kiểm khi có môi trường

1. Chạy `docker compose --env-file .env.staging -f docker-compose.staging.yml config --quiet`. Dùng chế độ im lặng để tránh in URI đã điền. Kiểm shell triển khai không có biến cũ ghi đè file staging.
2. Sau khi DB, mạng riêng và chứng chỉ được cấp, kiểm Nginx với chứng chỉ thật, truy cập web/API qua HTTPS và xác nhận Socket.IO đi đúng proxy. Ghi rõ nếu app trả từ chối xác thực vì bản app chưa có luồng đăng nhập tương ứng.
3. Kiểm readiness nội bộ, kết nối replica set bằng tài khoản app, thử lưu/hủy trên dữ liệu thử được cấp và kiểm DB/app port không truy cập được từ Internet. Readiness có media worker chỉ xác nhận tiến trình sẵn sàng ở mức cơ sở.
4. Ghi commit/image đã triển khai, phiên bản cấu hình, nơi lưu dữ liệu bền/backup và người duyệt. Giữ một app process. Khi thay bản app, thông báo và chờ các cuộc gọi kết thúc trước khi khởi động lại.

### SCRUM-63 kiểm khi có TURN

1. Xác nhận DNS/IP, NAT, cổng lắng nghe và dải relay theo hạ tầng thật.
2. Kiểm thông tin truy cập ngắn hạn, từ chối khi hết hạn, thu bằng chứng kết nối relay và lượng dữ liệu đi qua relay. Ghi kết quả đúng phạm vi TURN để SCRUM-81 tiếp tục thử hai mạng và rollback.

## Kết quả của SCRUM-54

Đã rà Dockerfile, Compose local, Nginx và cấu hình server. Đã chuẩn bị diff Compose/Nginx và mẫu biến để M4 review. Quyền VPS, DNS, chứng chỉ thật, MongoDB staging và TURN cần người phụ trách cấp trước khi các task tiếp theo chạy trên hạ tầng.

Kiểm trên nhánh `chore/SCRUM-54-staging-config`, nền `ff27fdd`, ngày 07/11/2026:

| Lệnh                                             | Kết quả                                                                                                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` và `pnpm check` | Đạt trên Windows. 74 test ứng dụng đạt. Harness có 54 ca đạt và 1 ca symlink bỏ qua trên Windows.                                                                                                                           |
| `docker-compose config --quiet`                  | Compose v2.40.3 trên WSL đọc được file staging với biến giả và file local. Mẫu staging để trống bị từ chối đúng như yêu cầu.                                                                                                |
| `nginx -t`                                       | Nginx 1.28.3 trên WSL kiểm thành công bản sao cấu hình staging với chứng chỉ tự ký, upstream loopback, thư mục tạm và cổng thử 18443. Kiểm này chưa thử phân giải tên container, mount chứng chỉ hoặc mở cổng 443 trên VPS. |
| `pnpm media:smoke`                               | Worker và Router khởi động được với Opus/VP8. Chưa kiểm đường truyền RTP, cuộc gọi trên trình duyệt hay TURN.                                                                                                               |

Máy làm việc không có Docker Engine để chạy stack. Kiểm HTTPS từ bên ngoài, kết nối MongoDB có xác thực, cổng qua firewall và TURN đang chờ môi trường staging. Trạng thái review của M4 vẫn đang chờ.

Tham khảo cách [Compose kiểm biến bắt buộc](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) và [Nginx chuyển tiếp WebSocket](https://nginx.org/en/docs/http/websocket.html).
