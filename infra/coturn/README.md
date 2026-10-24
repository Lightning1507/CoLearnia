# TURN setup — cổng PoC tuần 1

TURN được cấu hình trên staging sau khi có public IP, hostname và secret. Chưa chạy TURN public bằng một cấu hình mẫu với thông tin giả.

- Cổng đầu: UDP/TCP 3478; TLS TCP 5349; relay UDP 49160–49200.
- Bật `use-auth-secret`, `static-auth-secret` lấy từ secret store, `realm` theo hostname.
- Cấu hình `external-ip`, relay address, certificate và firewall theo server thật.
- Không dùng anonymous relay, không commit credential hoặc certificate private key.
- Backend chỉ cấp credential ngắn hạn sau xác thực và kiểm quyền session.
- Nginx 443 và TURN/TLS không cùng bind một IP:port. Topology đầu dùng 5349.
- Chỉ đánh dấu PoC TURN thành công khi selected ICE candidate là `relay` và audio/screen truyền thật giữa hai mạng.

Thư mục này là nơi thêm cấu hình đã kiểm chứng và hướng dẫn vận hành khi thực hiện ADR-001.
