# ADR-001 — mediasoup cho nền media

- Trạng thái: **Proposed**.
- Ngày: 25/10/2026.
- Owner: B; reviewer: C; D hỗ trợ frame/audio, E hỗ trợ staging/TURN.

## Quyết định

Sử dụng mediasoup v3, một Router/LiveSession, nhiều nhóm nghiệp vụ trong cùng Router. Backend kiểm `canPublish` và `canConsume` trước khi tạo/resume tài nguyên; thu quyền bằng cách đóng Consumer ở server.

## Lý do và đánh đổi

Chủ động điều khiển nguồn chung cho DISCUSSION và nguồn độc lập ACTIVITY theo [group modes v2.3](../product/group-modes.md). Đổi lại phải tự xây signaling, policy, reconnect và vòng đời tài nguyên. Một Router thuộc một worker; không tự chia một phiên theo nhiều lõi.

## Điều kiện Accepted

- Mic/camera và screen thật giữa hai mạng.
- Kiểm hai DISCUSSION kế thừa MAIN và hai ACTIVITY độc lập mỗi group một share, member tự bấm không host duyệt; không có Consumer/metadata trái quyền. Kiểm hai group share song song, một group chỉ một nguồn, board theo nguồn; request/approval/join DISCUSSION không vượt phase ACTIVITY.
- Chuyển/rời nhóm/revoke thật, không dùng gain=0 để che audio.
- Freeze hình vẫn nghe tiếng và resume tới hình hiện tại.
- Forced TURN có selected relay candidate và dữ liệu thật.
- Ghi commit, môi trường và kết quả trong `docs/test-evidence`.

Smoke test native worker chỉ xác nhận binary/Router khởi động, **chưa** đáp ứng các điều kiện trên. Không đổi trạng thái ADR chỉ vì cài package thành công.
