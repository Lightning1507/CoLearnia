# Đọc trạng thái quyết định trong technical plan

Technical plan đã đề cập các chủ đề dưới đây, nhưng không phải tất cả đều được chốt tới mức implementation. Bản đồ này giải thích cách đọc các nguồn hiện hành ngày 26/10/2026; không đặt thêm nghiệp vụ, không là backlog hoặc sổ quyết định song song. Khi chốt một chi tiết, cập nhật nguồn sở hữu được dẫn, rồi đồng bộ mô tả ở đây nếu cần.

## Phân biệt trạng thái

- **Đã chốt baseline:** thực hiện theo quy tắc hiện hành; đổi phạm vi hoặc kiến trúc chính theo quy trình thay đổi trong plan.
- **Đã có thiết kế khung:** phần quan trọng đã nêu; chi tiết implementation được hoàn thiện trong task liên quan và review cùng code/contract.
- **Đã chọn để kiểm chứng:** được phép xây PoC theo hướng chọn, nhưng chưa được tuyên bố đạt điều kiện nghiệm thu.
- **Cần thông tin từ nhóm:** không tự điền tên, ngày, số giờ hoặc ngân sách thành cam kết.
- **Để đợt sau theo chỉ đạo:** chưa triển khai ở đợt harness; không có nghĩa bị loại khỏi kế hoạch quản lý dự án.

## Các chủ đề đã được hỏi lại

| Chủ đề             | Đã có và đã chốt ở mức nào?                                                                                        | Phần còn cần hoàn thiện / kiểm chứng                                                                                  | Nguồn sở hữu và thời điểm xử lý                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Băm mật khẩu       | Phải băm mật khẩu; plan nêu Argon2id hoặc bcrypt                                                                   | Chọn implementation/thư viện cụ thể và cấu hình có số đo; chưa có lựa chọn duy nhất được ghi                          | [Plan 13.1](technical-plan.md#131-biên-tin-cậy), [task tài khoản](product/workspace-channels.md#điểm-cần-chốt-khi-triển-khai); giải quyết khi triển khai auth                                      |
| Database           | MongoDB/Mongoose, replica set; có danh mục collections, field chính, unique/dedupe/index và transaction quan trọng | Types/nullability/enums chi tiết, index specification, migration executable và kiểm thử; không thiết kế DB lại từ đầu | [Model 9.1–9.2](database/model.md), [lifecycle 9.3–9.4](database/lifecycle.md); hoàn thiện theo feature và trước khi chạy migration                                                                |
| Media              | mediasoup v3 được chọn để PoC, một Router/LiveSession; có workload và cấu hình thử                                 | Codec/bitrate/capacity sau browser/network test; bằng chứng để Accepted. Opus/VP8 của scaffold chưa thay PoC          | [Live 6.2](product/live-session.md#62-thiết-bị-và-camera), [ADR-001](adr/001-media-foundation.md), [plan 14](technical-plan.md#14-kiểm-thử-và-tiêu-chí-hoàn-thành); theo gate tuần 1 và nghiệm thu |
| Người thật cho A–E | Plan đã phân vai, owner/reviewer theo ký hiệu                                                                      | Gán tên/tài khoản thật và xác nhận capacity; không phải chưa có phân công chức năng                                   | [Plan 15.1](technical-plan.md#15-phân-công-và-hợp-đồng-tích-hợp), [18.3](technical-plan.md#183-checklist-khởi-động); nhóm cung cấp khi kickoff/nhận việc                                           |
| Lịch và budget     | Mục tiêu 4 tuần build + 1–2 tuần hoàn thiện; có gate, cách tính capacity và yêu cầu hạ tầng                        | Ngày bắt đầu/nộp, giờ thực tế, ngân sách và lựa chọn dịch vụ; chưa có cam kết tài chính cụ thể                        | [Scope 1.4](product/scope.md#14-ràng-buộc-và-giả-định-phải-theo-dõi), plan mục 15.3/16/17.5/18.3; nhóm xác nhận trước cam kết lịch hoặc mua dịch vụ                                                |
| GitHub Projects    | Người dùng đã chọn dùng Projects; Issues nhận việc/trạng thái, PR review/bằng chứng                                | Fields, views, statuses, labels và automation chưa được cấu hình; người dùng để sau harness                           | [AI workflow](ai/workflow.md#nhận-việc-triển-khai-review); nguồn là chỉ đạo bổ sung ngày 26/10, không phải chi tiết sẵn có trong plan sản phẩm ban đầu                                             |

Không phải mọi chi tiết implementation còn mở đều cần hỏi lại người dùng. Owner có thể nghiên cứu, đề xuất và triển khai lựa chọn kỹ thuật trong task được giao, ghi lý do và review phù hợp; không được tự đổi quy tắc/phạm vi đã chốt hoặc bịa thông tin của nhóm. Quyết định thật sự còn mơ hồ và ảnh hưởng phần phụ thuộc cần được làm rõ trước phần đó, không buộc dừng mọi task độc lập.

## Quy ước harness và yêu cầu sản phẩm

[AGENTS](../AGENTS.md), [workflow](ai/workflow.md), task template và các guard là quy ước vận hành được cụ thể hóa trong đợt harness đã được người dùng đồng ý triển khai. Chúng không tự trở thành nghiệp vụ sản phẩm hoặc yêu cầu môn học.

Ví dụ thuộc lớp vận hành: cách chia file, commit/attribution, giới hạn 100 dòng cho entry point, danh sách nguồn checker, dạng pin được checker hỗ trợ, danh sách import bị cấm và checklist onboarding. Các chi tiết này có thể được review/chỉnh cùng harness, không dùng để suy thêm tính năng, quyền hoặc schema nghiệp vụ.

Giá trị quota/timeout/retention/bitrate ghi là khởi đầu hoặc mục tiêu thử trong baseline vẫn phải được kiểm chứng theo điều kiện đã ghi; không xem chúng là SLA hoặc lời hứa hiệu năng.
