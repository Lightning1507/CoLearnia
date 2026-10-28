# Đọc trạng thái quyết định trong technical plan

Technical plan đã đề cập các chủ đề dưới đây, nhưng không phải tất cả đều được chốt tới mức implementation. Bản đồ này giải thích cách đọc các nguồn hiện hành ngày 27/10/2026; không đặt thêm nghiệp vụ, không là backlog hoặc sổ quyết định song song. Khi chốt một chi tiết, cập nhật nguồn sở hữu được dẫn, rồi đồng bộ mô tả ở đây nếu cần.

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
| Người thật cho A–E | Plan có phương án phân vai, owner/reviewer theo ký hiệu để tham khảo                                               | Phân công thật sẽ làm sau theo chỉ đạo 27/10; chưa gán người hoặc coi A–E là nhiệm vụ đã giao                         | [Plan 15.1](technical-plan.md#15-phân-công-và-hợp-đồng-tích-hợp), [18.3](technical-plan.md#183-checklist-khởi-động); nhóm cung cấp khi kickoff/nhận việc                                           |
| Lịch và budget     | Mục tiêu 4 tuần build + 1–2 tuần hoàn thiện; có gate, cách tính capacity và yêu cầu hạ tầng                        | Ngày bắt đầu/nộp, giờ thực tế, ngân sách và lựa chọn dịch vụ; chưa có cam kết tài chính cụ thể                        | [Scope 1.4](product/scope.md#14-ràng-buộc-và-giả-định-phải-theo-dõi), plan mục 15.3/16/17.5/18.3; nhóm xác nhận trước cam kết lịch hoặc mua dịch vụ                                                |
| GitHub Projects    | Người dùng đã chọn dùng Projects; Issues nhận việc/trạng thái, PR review/bằng chứng                                | Fields, views, statuses, labels và automation chưa được cấu hình; người dùng để sau harness                           | [AI workflow](ai/workflow.md#nhận-việc-triển-khai-review); nguồn là chỉ đạo bổ sung ngày 26/10, không phải chi tiết sẵn có trong plan sản phẩm ban đầu                                             |

Không phải mọi chi tiết implementation còn mở đều cần hỏi lại người dùng. Owner có thể nghiên cứu, đề xuất và triển khai lựa chọn kỹ thuật trong task được giao, ghi lý do và review phù hợp; không được tự đổi quy tắc/phạm vi đã chốt hoặc bịa thông tin của nhóm. Quyết định thật sự còn mơ hồ và ảnh hưởng phần phụ thuộc cần được làm rõ trước phần đó, không buộc dừng mọi task độc lập.

## Quy ước harness và yêu cầu sản phẩm

[AGENTS](../AGENTS.md), [workflow](ai/workflow.md), task template và các guard là quy ước vận hành được cụ thể hóa trong đợt harness đã được người dùng đồng ý triển khai. Chúng không tự trở thành nghiệp vụ sản phẩm hoặc yêu cầu môn học.

Ví dụ thuộc lớp vận hành: cách chia file, commit/attribution, giới hạn 100 dòng cho entry point, danh sách nguồn checker, dạng pin được checker hỗ trợ, danh sách import bị cấm và checklist onboarding. Các chi tiết này có thể được review/chỉnh cùng harness, không dùng để suy thêm tính năng, quyền hoặc schema nghiệp vụ.

Giá trị quota/timeout/retention/bitrate ghi là khởi đầu hoặc mục tiêu thử trong baseline vẫn phải được kiểm chứng theo điều kiện đã ghi; không xem chúng là SLA hoặc lời hứa hiệu năng.

## Quyết định scope bổ sung ngày 27/10/2026

Team đã xác nhận hai thay đổi, được đưa vào technical plan v2.2 và nguồn product:

- **PB-09 / HELP-01:** chat cuộc họp chỉ text/ảnh. Everyone theo MAIN khi ở phòng chung hoặc GROUP hiện tại khi đã chia nhóm; Host là tin riêng tới đúng host. Host có thể vào nhóm hỗ trợ. Chat/tài liệu kênh vẫn giữ khả năng gửi tệp.
- **PB-10 / GRP-01:** host kết thúc chia nhóm, tất cả về MAIN rồi tự bật mic phát biểu. Bỏ FLOOR-01/PRESENT-01, lời mời/consent và projection công bố hình+nét. Giữ PB-10 làm nhóm backlog của hành trình về phòng chung, không tạo một feature ID mới.

Nguồn sở hữu: [scope](product/scope.md), [chat/help và về phòng chung](product/groups-media-policy.md), [board khi đóng nhóm](product/board-collaboration.md). Research/review/evidence ngày 26/10 mô tả baseline cũ và không tự cập nhật thành bằng chứng cho thay đổi này.

## Bổ sung chat Workspace ngày 27/10/2026

Người dùng bổ sung general TEXT khi tạo Workspace, DM 1–1 với text/ảnh/file và thread theo tin trong kênh; đã xác nhận chỉ owner/admin tạo kênh. CHAT-02/03 được thêm vào scope. Nguồn chi tiết: [messaging](product/messaging.md).

Phạm vi tối thiểu được cụ thể hóa để phân rã: thread một cấp trong TEXT, chưa thread DM/cuộc họp, chưa follow/broadcast/typing/read receipt. Chi tiết này là cách giới hạn thiết kế bản đầu, không phải tính năng đầy đủ của Slack. Cần chốt trước implementation phụ thuộc: lịch sử DM khi rejoin, cách tính/lưu badge chưa đọc nếu đưa vào, index/migration và effort/capacity. Không tự thêm bảo vệ đặc biệt cho general hoặc cam kết số giờ/ngày hoàn thành.

## Ghi nhận review backlog ngày 27/10/2026

Ưu tiên trong backlog là thứ tự triển khai, không phải mức tùy chọn; PB-04 không chờ meeting, PB-10 chia sẻ nền GRP-01 và không tính effort hai lần. Nhóm sẽ phân công sau, A–E chỉ tham khảo. Tại thời điểm review, dấu có tin mới và hẹn giờ còn đang cân nhắc. Sau xác nhận về countdown, TIMER-01 đã vào scope v2.3 như phần cập nhật dưới; dấu có tin mới vẫn chưa chốt.

## Điều chỉnh group modes — baseline v2.3

Xác nhận người dùng 27/10 thay mô hình mọi nhóm nhận chung MAIN: MAIN một share; DISCUSSION thành viên xin tạo (tên, mục đích, danh sách), host duyệt, kế thừa bài giảng và cấm share riêng; ACTIVITY host tổ chức độc lập MAIN/các nhóm khác, được share nhóm. Tự về MAIN chỉ chuyển actor; TIMER-01 cho một lượt ACTIVITY đếm ngược/nhắc, host quyết định kết thúc. Nguồn hiện hành: [group modes](product/group-modes.md). Các câu timer ngoài scope hoặc mọi group nhận MAIN ở lịch sử v2.2 không còn áp dụng cho thiết kế hiện hành.

**Đã chốt sau review:** mọi member ACTIVITY tự share không xin host; mỗi group một nguồn và board theo nguồn đó. DISCUSSION host duyệt rồi người được chọn bấm Vào nhóm; người ngoài danh sách không vào. Kết thúc DISCUSSION trước ACTIVITY, trong lượt không nhận request DISCUSSION, host kết thúc về MAIN mới cho xin lại.

**Chi tiết còn thiết kế theo task:** request sửa/hủy/TTL/field limits, duration limits và controls countdown mở rộng, schema/index và capacity có số đo. Không tự thêm chuyển mode tại chỗ, nhóm mở cho người ngoài danh sách hoặc tính năng gia hạn/tạm dừng. Countdown không là đồng hồ đa mục đích hay collection timer bền vững. A–E vẫn chỉ tham khảo; scope/effort/PoC phải được đánh giá lại.

## Đơn giản hóa host và cuộc họp — đã chốt 27/10/2026

Một kiểu cuộc họp thay FREE/MODERATED: người bắt đầu là host, người vào sau không tự nhận host; host chuyển quyền có xác nhận. MAIN mọi participant tự share khi trống, không xin host, một nguồn tại một thời điểm và không giành nguồn. Giữ nguyên DISCUSSION/ACTIVITY, hai phase và isolation. Không thêm người chủ trì được chỉ định hoặc mở quyền quản trị Workspace. Nguồn: [policy](product/groups-media-policy.md), [vòng đời host](product/live-session.md#83-chuyển-host-và-host-mất-mạng). **Đã chốt bổ sung:** mất mạng quá grace chọn ngẫu nhiên participant đang kết nối/hợp lệ làm host tạm; host cũ quay lại hợp lệ trong cùng phiên được tự hoàn quyền. Không cần chấp nhận khi hệ thống thay tạm/hoàn quyền; chuyển host chủ động vẫn có xác nhận. **Còn mở:** rời chủ động chưa chuyển host, không có ứng viên, host tạm cũng mất mạng hoặc chủ động chuyển quyền trước lúc host cũ trở lại. Cơ chế tự nhận host cũ không còn hiệu lực. Giới hạn media nghiệm thu vẫn 5 participant, chưa chốt tải lớp 40–50 người.
