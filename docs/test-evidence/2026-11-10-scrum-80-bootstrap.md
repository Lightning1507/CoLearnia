# SCRUM-80 — Kiểm startup và metadata ngày 10/11/2026

Môi trường: Windows, Node 26.12.1, MongoDB 8.2.6 replica set rs0 tạm ở loopback. Database dùng tên ngẫu nhiên prefix colearnia_test_scrum80, không phải DB ứng dụng. Main được chạy bằng Node với loader tsx, MEDIA_ENABLED=true, auth routes tắt bằng SESSION_SECRET rỗng, HTTP/media dùng port riêng tự chọn. Không đọc credential hoặc dùng server đang chạy của thành viên.

| Ca chạy entrypoint main thật                                | Kết quả                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| DB chưa có metadata                                         | health/ready=200, health/live=200; không tự tạo collection/index session    |
| Có phiên ACTIVE từ đời server cũ                            | Main chuyển ENDED, host=null, participation có leftAt rồi readiness=200     |
| Có conversation GROUP cũ chưa closedAt                      | Readiness=503, liveness=200; phiên giữ ENDING, conversation không bị M4 sửa |
| Provider M2 được mô phỏng đã đóng conversation, rồi restart | Phiên ENDED, readiness trở lại 200                                          |
| Bỏ index query trong DB test                                | Readiness=503; main không tự tạo lại index                                  |

Smoke khởi động entrypoint `apps/server/src/main.ts`, gọi HTTP health thực và đọc metadata sau khi dừng process. Chỉ các process/DB riêng của test được dừng/dọn. Ca đóng conversation là thay đổi fixture để mô phỏng đầu ra M2, không phải bằng chứng provider M2 đã triển khai.

Integration suite có các ca khác: ACTIVE/ENDING theo lô, ENDED không bị ghi lại, offline guard, thiếu index, cleanup sai epoch/timeout, mất xác nhận sau completeEnding đã commit thật, FRAME chưa xử lý và query có phân trang/ACL. Query dùng provider M1 fixture với coordination context thật.

Kiểm tương thích MongoDB 8.0.16 theo baseline dành cho CI. Native runtime khởi động không chứng minh mic/camera/TURN hoặc gọi trên trình duyệt. Chưa thực hiện migration DB ứng dụng hoặc xóa byte file/recording.
