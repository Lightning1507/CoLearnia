# ADR-001 — mediasoup cho nền media

- Trạng thái: **Proposed**.
- Ngày: 25/10/2026.
- Owner: B; reviewer: C; D hỗ trợ frame/audio, E hỗ trợ staging/TURN.

## Quyết định

Sử dụng mediasoup v3, một Router/LiveSession, nhiều nhóm nghiệp vụ trong cùng Router. Backend kiểm `canPublish` và `canConsume` trước khi tạo/resume tài nguyên; thu quyền bằng cách đóng Consumer ở server.

## Lý do và đánh đổi

Chủ động điều khiển tiếng riêng/chung và nội dung trình bày. Đổi lại phải tự xây signaling, policy, reconnect và vòng đời tài nguyên. Một Router thuộc một worker; không tự chia một phiên theo nhiều lõi.

## Điều kiện Accepted

- Mic/camera và screen thật giữa hai mạng.
- Hai nhóm riêng trong cùng phiên, screen chung, không có Consumer trái quyền.
- Chuyển nhóm/revoke thật, không dùng gain=0 để che audio.
- Freeze hình vẫn nghe tiếng và resume tới hình hiện tại.
- Forced TURN có selected relay candidate và dữ liệu thật.
- Ghi commit, môi trường và kết quả trong `docs/test-evidence`.

Smoke test native worker chỉ xác nhận binary/Router khởi động, **chưa** đáp ứng các điều kiện trên. Không đổi trạng thái ADR chỉ vì cài package thành công.
