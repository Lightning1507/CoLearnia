# Kiểm tra bản khởi tạo — 25/10/2026

## Môi trường

- Windows, runtime project Node 24.22.1, pnpm 11.5.2.
- Docker CLI có sẵn; Docker Desktop Linux engine chưa chạy.
- Backend local `127.0.0.1:3001`, Vite local `127.0.0.1:5173`.

## Kết quả đã chạy

| Kiểm tra                               | Kết quả                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm install`                         | Thành công; lockfile; native worker Windows tải và kiểm tra được                      |
| `pnpm check`                           | Thành công: Prettier, ESLint, TypeScript, 7 tests/2 files, build 3 workspace packages |
| `pnpm media:smoke`                     | Thành công: worker và Router với codec Opus/VP8 khởi động rồi đóng                    |
| `docker compose config --quiet`        | Thành công; chưa chạy services                                                        |
| `pnpm dev`                             | Contracts watcher, server và Vite khởi động                                           |
| Web `/`                                | HTTP 200                                                                              |
| `/api/v1/system/status` qua Vite proxy | HTTP 200, database disconnected, media disabled, ready false                          |
| `/health/live`                         | HTTP 200                                                                              |
| `/health/ready`                        | HTTP 503, đúng khi chưa có database/worker                                            |
| Socket.IO chưa xác thực                | Kết nối bị từ chối với `AUTH_REQUIRED`                                                |
| Cấu trúc thư mục                       | Không có thư mục module rỗng thiếu `.gitkeep`; không có `.gitkeep` thừa cạnh source   |
| Git ignore                             | `.env`, dependency, output build và dữ liệu storage được bỏ qua                       |

Vite có cảnh báo bundle đầu lớn hơn 500 kB; build thành công. Tách bundle theo tính năng sẽ được đánh giá khi triển khai màn hình nghiệp vụ, không tăng ngưỡng cảnh báo để che số đo.

## Chưa xác minh

- Docker build/runtime, replica set election/transactions và CI trên Linux.
- Browser call, group isolation, freeze/resume media thực, camera và forced TURN.
- Auth/Workspace/channel/chat nghiệp vụ; các phần này chưa có handler.
- Hiệu năng, quy mô người tham gia và các gate trong kế hoạch v2.

Kết quả trên xác nhận nền project, không thay bằng chứng Accepted của ADR-001 hoặc nghiệm thu UC-01/02/03.
