# Trạng thái quyết định CoLearnia

**Cập nhật 04/11/2026.** Đây là mục lục trạng thái, không là bản sao quy tắc nghiệp vụ. [Technical plan v2.3](technical-plan.md) và nguồn chi tiết theo miền là baseline; research/archive/ADR Proposed không tự ghi đè quyết định. Source/evidence cho biết phần đã chạy, thiết kế cho biết đích cần triển khai.

## Cách hiểu trạng thái

- **Đã chốt:** làm theo nguồn; thay scope/quyền cần review thay đổi.
- **Đã thiết kế:** có cấu trúc/quy tắc đích; chưa có nghĩa có code hoặc test đạt.
- **Chờ kiểm chứng:** hướng được chọn cho PoC/benchmark, chưa là khả năng phục vụ đã đạt.
- **Cần nhóm cung cấp:** không tự điền tên, ngày hoặc tiền thành cam kết.

Chi tiết implementation thông thường được chọn/review trong task được giao. Chỉ hỏi lại khi mơ hồ ảnh hưởng phần phụ thuộc; không hỏi lại toàn bộ baseline hoặc dừng việc độc lập.

## Quyết định sản phẩm đã chốt

| Miền          | Quyết định chính                                                                                                                                                                                                                              | Nguồn sở hữu                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Scope         | Camera/mic/share, nhóm, chat, hỗ trợ, board cơ bản; không quiz/poll/library/công cụ vẽ nâng cao hoặc đồng hồ ngoài TIMER-01                                                                                                                   | [Scope](product/scope.md)                                                               |
| Workspace     | General TEXT sinh nguyên tử cùng Workspace/owner/conversation; owner/admin tạo kênh. General không được thêm bảo vệ bất biến riêng                                                                                                            | [Workspace](product/workspace-channels.md), [messaging](product/messaging.md)           |
| Chat bền      | Kênh và DM 1–1 text/ảnh/file; thread một cấp chỉ TEXT; admin không đọc DM. Cả hai membership hợp lệ trở lại thì mở lịch sử DM còn lưu                                                                                                         | [Messaging](product/messaging.md)                                                       |
| PRIVATE       | TEXT/LIVE độc lập WORKSPACE/PRIVATE; không đổi accessMode sau tạo. Owner/admin thêm/gỡ, kể cả tự thêm; quản lý không tự cấp quyền đọc. Thêm lại thấy lịch sử còn lưu; rejoin Workspace cần cấp lại PRIVATE                                    | [Messaging](product/messaging.md#kênh-private-và-quyền-quản-lý--chốt-ngày-01112026)     |
| Cuộc họp/host | Một kiểu cuộc họp; người bắt đầu là host. Gán host trực tiếp, không cần chấp nhận. Host còn quyền chủ động rời thì kết thúc phiên; sau bàn giao rời như thành viên                                                                            | [Live session 8.3](product/live-session.md#83-chuyển-host-và-host-mất-mạng)             |
| Host mất mạng | Thu ngay mọi quyền kết nối host cũ và chọn host tạm khi phát hiện mất kết nối, không chờ grace; người cũ quay lại hợp lệ tự hoàn quyền. Bàn giao chính thức, kể cả bởi host tạm, thay thế đích hoàn quyền cũ                                  | [Live session 8.3](product/live-session.md#83-chuyển-host-và-host-mất-mạng)             |
| Share/nhóm    | MAIN một share; DISCUSSION tạo tự động sau kiểm tra hợp lệ, kế thừa bài giảng, cấm share riêng, tự bấm vào sau khi tạo nhóm hợp lệ. ACTIVITY độc lập, mỗi nhóm một share, mọi member tự share khi trống; không giành nguồn                    | [Group modes](product/group-modes.md)                                                   |
| Phase/create  | DISCUSSION tạo ngay khi hợp lệ, không host xét/hủy pending; create/join bị chặn trong ACTIVITY; tên ≤80, mục đích ≤500, roster cùng phiên không trùng                                                                                         | [Group modes](product/group-modes.md)                                                   |
| TIMER-01      | Duration chung số nguyên 1–120 phút trước start; không edit/extend/pause. Deadline tự kết thúc ACTIVITY/về MAIN/pause mic; tự về sớm chỉ chuyển người bấm. Host không đóng ACTIVITY thủ công; vẫn đóng một/tất cả DISCUSSION                  | [Group modes](product/group-modes.md), [HS-03](product/use-cases/03-activity.md)        |
| Lỗi start     | Hủy lượt chưa hoàn tất, về MAIN; không khôi phục DISCUSSION đã đóng. Host có thể chủ động bắt đầu lại sau cleanup                                                                                                                             | [HS-03](product/use-cases/03-activity.md)                                               |
| Chat/help     | Meeting chỉ text/ảnh, Everyone theo MAIN/nhóm hiện tại hoặc riêng đúng host. DISCUSSION hỏi/trả lời riêng khi host ở MAIN; host chỉ vào hỗ trợ ACTIVITY có thông báo; tự rời help về MAIN giữ trạng thái mic, khác cleanup do sự cố/nhóm đóng | [Policy](product/groups-media-policy.md), [HS-06](product/use-cases/06-private-help.md) |
| Về MAIN/board | Không floor grant/consent phát biểu/công bố board riêng; về MAIN tự bật mic. Frame/nét thuộc context runtime, không library hoặc dữ liệu phục hồi buổi học                                                                                    | [Policy](product/groups-media-policy.md), [board](product/board-collaboration.md)       |

## Thiết kế và kiểm chứng kỹ thuật

| Chủ đề            | Đã có                                                                                                                                                        | Còn cần thực hiện                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database          | MongoDB/Mongoose; thiết kế trước recording: 46 UC →16 khái niệm→13 collection                                                                                | Recording là delta chưa chốt metadata/schema/index/migration; các thiết kế cũ không chứng minh đã bao phủ scope mới. [Model](database/model.md)                                                            |
| DB so với runtime | Auth/quyền/chat/file metadata bền; nhóm/request/round/board/nét/media ở RAM, byte ngoài DB                                                                   | Bootstrap/sweeper và restore phải kiểm; không phục hồi phiên sau restart. [Lifecycle](database/lifecycle.md)                                                                                               |
| Capacity          | Giữ gate chức năng 5; thử 10 → 25 trước, 50 nếu đạt; 100 không bắt buộc. Một app process, một mediasoup worker, Router/LIVE; Mongo local Docker rs0 một node | Chưa profile đạt; cần queue/pool/gate/quota budget hữu hạn và tải kết hợp. Không tự thêm Redis/multiapp/sharding. [Capacity](capacity.md)                                                                  |
| Media             | mediasoup v3 chọn cho PoC, scaffold có Opus/VP8/native worker                                                                                                | ADR-001 còn Proposed; chưa chứng minh mic/camera/share/TURN/isolation/reconnect hoặc capacity. [ADR](adr/001-media-foundation.md)                                                                          |
| Contracts         | Có schema scaffold và error/envelope; đã ghi đích PRIVATE/một kiểu họp/ObjectId/RuntimeId                                                                    | Source còn RESTRICTED/FREE-MODERATED, resourceId rộng; đồng bộ trước consumer nghiệp vụ. [Contracts](contracts/README.md)                                                                                  |
| UC/bản vẽ         | 5 actor, 8 oval tổng quan; hiện hành 47 UC độc lập/truy cập chung và 6 hồ sơ trọng tâm                                                                       | Hình trước kickoff đã được xác nhận; sau kickoff cần bỏ host xét DISCUSSION, thêm random trong chuẩn bị ACTIVITY và ghi/xem recording. Chưa sửa `.asta`/PNG lượt này. [Bản vẽ](product/diagrams/README.md) |

[Review DB bước 6](database/review-2026-11-01.md) ghi những sửa trước; [review tổng thể trước push](review-before-push-2026-11-01.md) ghi kết quả và giới hạn mới nhất. Không dùng review làm schema thứ hai hoặc bằng chứng DB/media chạy đúng.

## Điểm mở cần xử lý theo task

| Điểm mở                                                                              | Khi nào cần quyết định                                                                                                            |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Thư viện/tham số hash; input limits còn thiếu như displayName; thời hạn auth session | Task auth/contracts trước handler tương ứng; plan mới chọn yêu cầu/hướng, chưa chọn mọi giá trị                                   |
| Không có ứng viên host hoặc host tạm cũng mất mạng                                   | Áp policy live-session: giữ đích gốc, elect tạm ngay khi có người, hết mọi grace end; auth/access bị thu không tự hoàn            |
| Retention audit/User/invitation/metadata phiên và participant                        | Trước vận hành dài hạn/cleanup đầy đủ; chưa tự TTL hoặc purge                                                                     |
| Queue/pool/timeouts, quota frame theo board và tài nguyên máy                        | Trước chạy profile; số khởi đầu không là SLA hoặc capacity đạt                                                                    |
| Người thật cho A–E, giờ làm, lịch bắt đầu/nộp, budget/VPS                            | Nhóm cung cấp khi chia việc/cam kết lịch hoặc mua dịch vụ; A–E trong plan chỉ tham khảo                                           |
| GitHub Projects, labels/automation và branch protection thực tế                      | Issues nhận việc, PR lưu review; Projects do người dùng để sau harness. Quy ước repo không chứng minh đã bật settings trên GitHub |

## Harness và nguồn lịch sử

[AGENTS](../AGENTS.md), [workflow](ai/workflow.md), [task brief](ai/task-template.md) và guard là quy ước làm việc đã được đồng ý, không là feature sản phẩm hoặc yêu cầu môn học mới. CI xanh không xác nhận ngữ nghĩa/UML/ACL hoặc cấu hình sandbox.

Các quyết định cũ “FREE/MODERATED”, “chuyển host cần chấp nhận”, “timer chỉ nhắc/chờ host” và “rejoin tự hồi PRIVATE” không là baseline hiện hành. Research/review/evidence cũ giữ giá trị tại thời điểm ghi; đọc nguồn hiện hành ở trên trước implementation.

## Cập nhật board ngày 02/11/2026

Đã chốt: MAIN không freeze/resume, chỉ host vẽ LIVE với nét thường hoặc tùy chọn tự biến mất; share vẫn mở cho participant khi trống. DISCUSSION/ACTIVITY giữ freeze/vẽ chung theo nguồn tương ứng. Nguồn: [board](product/board-collaboration.md). Thời gian/fade nét tạm chưa chốt. Đây là thiết kế đích, chưa là code hoặc prototype đã kiểm chứng; trạng thái Astah ở [mục lục bản vẽ](product/diagrams/README.md).

## Làm rõ DISCUSSION ngày 02/11/2026

Đã chốt: host không vào hỗ trợ DISCUSSION; chỉ ACTIVITY có hỗ trợ trực tiếp trong nhóm. DISCUSSION chờ sau khi tạo nhóm hợp lệ khi chưa ai vào; còn người thì roster hợp lệ được chủ động vào lại; người cuối cùng chủ động rời sau khi nhóm đã có người làm nhóm tự kết thúc, không mở lại bằng roster cũ. Cập nhật 04/11: DISCUSSION disconnect thu membership ngay, nhóm từng có người rỗng thì đóng, reconnect về MAIN; call ownership vẫn có reconnect grace, không có empty grace. Nguồn chi tiết: [group modes](product/group-modes.md), [policy](product/groups-media-policy.md).

## Quyết định sau kickoff ngày 02/11/2026

Đã chốt: DISCUSSION tạo tự động sau kiểm hợp lệ, bỏ host duyệt/từ chối/hủy pending nghiệp vụ; người trong roster vẫn chủ động vào. ACTIVITY thêm random theo tập người/số nhóm, cân số lượng chênh tối đa một, host xem/chỉnh trước start. Recording MAIN gồm màn hình, camera, âm thanh do host ghi/dừng, lưu video cho thành viên còn quyền kênh xem; không ghi nhóm riêng.

Chưa chốt: cơ chế recorder/encode/composition, bố cục/số camera, codec, schema/index metadata, quota, retention/quyền xóa, xử lý sự cố recorder/host chuyển quyền. Clip demo vài phút là mục tiêu PoC, không giới hạn sản phẩm. Chưa có benchmark hoặc evidence feature hoạt động. Nguồn: [group modes](product/group-modes.md), [recording](product/recording.md).

## Xác nhận bổ sung ngày 04/11/2026

- ACTIVITY: được tự vào lại đúng nhóm đã phân còn mở; không vào nhóm khác; không host điều chuyển (FR-07-07/UC-GRP-07 ngừng áp dụng, không tái dùng mã). Host chỉ vào bằng help, không join như member. Nguồn: [group modes](product/group-modes.md).
- Host: thu mọi quyền kết nối cũ và thay tạm ngay; quay lại hợp lệ tự hoàn trong cùng phiên. Giữ reconnect grace tối đa 30 giây cho ownership; bỏ empty grace. Giữ đích hoàn quyền gốc qua host tạm; hết grace mà không ai thì end; auth/access bị thu xóa đích liên quan, cấp lại chỉ là member theo [live session](product/live-session.md).
- Ghi hình: thống nhất hướng pipeline và vòng đời qua đổi host/dừng/ghi lại/hủy STARTING/end/finalize; công cụ/codec, quota/retention, metadata và cleanup contract còn cần PoC. Nguồn: [recording](product/recording.md).
