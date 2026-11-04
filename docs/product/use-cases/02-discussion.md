# HS-02 · Tạo và vào nhóm DISCUSSION

**Trạng thái:** bản 5, cập nhật sau kickoff ngày 02/11/2026. Thay bản 4 về host duyệt/hủy pending; chưa triển khai runtime. [Quy ước chung](README.md). Nguồn: [group modes](../group-modes.md), [policy](../groups-media-policy.md).

## Mục tiêu và ranh giới

Thành viên tạo không gian trao đổi riêng trong lúc theo dõi bài giảng MAIN; server tạo ngay khi hợp lệ. Mỗi người trong roster chủ động vào. Hai UC độc lập, không include theo thứ tự; UC-GRP-03 xét duyệt cũ ngừng áp dụng, không tái dùng mã.

| UC                            | Actor | Trigger           | Tiền điều kiện                                        | Thành công                                                              |
| ----------------------------- | ----- | ----------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| UC-GRP-02 · Tạo nhóm trao đổi | A-03  | Gửi form Tạo nhóm | Đã tham gia cùng LIVE, còn quyền, phase giảng         | Nhóm và roster hợp lệ được tạo, có nút Vào nhóm; chưa tự cấp membership |
| UC-GRP-04 · Vào nhóm trao đổi | A-03  | Chọn Vào nhóm     | Nhóm mở, actor thuộc roster, còn quyền và phase giảng | Actor có scope nhóm và nhận đúng nội dung                               |

## Luồng A — tạo nhóm

1. Thành viên mở form; nhập tên, mục đích và chọn participant cùng phiên.
2. Thành viên chọn Tạo nhóm.
3. Server kiểm phiên, quyền, phase, tên ≤80, mục đích ≤500, roster không trùng và còn hợp lệ.
4. Hệ thống tạo nhóm và roster đúng một lần; hiển thị Vào nhóm cho đúng người. Không chờ host và không chuyển người tự động.

## Luồng B — chủ động vào

1. Người trong roster bấm Vào nhóm.
2. Server kiểm nhóm/roster/phase/quyền hiện hành; không tin cache client.
3. Thu quyền và tài nguyên scope cũ trước cấp membership/scope mới; mic theo policy chuyển nhóm.
4. Hiển thị nhóm, phạm vi mic/camera/chat/board; nhận bài giảng MAIN nếu có nguồn, nhưng không share riêng.
5. Người còn lại vào theo cùng luồng ở thời điểm họ chọn.

## Nhánh thay thế và lỗi

| Mã  | Điểm rẽ                                  | Xử lý                                                                               | Tiếp tục/kết thúc                                                  |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| E01 | A3 dữ liệu sai                           | Báo trường lỗi, không tạo nhóm/quyền                                                | Quay A1, người dùng sửa và gửi lại                                 |
| E02 | A3/B2 phase ACTIVITY hoặc phiên kết thúc | Từ chối create/join cũ, trả trạng thái hiện hành                                    | Kết thúc lần thao tác; không tự retry                              |
| E03 | A3/B2 mất quyền hoặc roster stale        | Không tự thay người, không cấp quyền từ danh sách cũ                                | Xem lại dữ liệu; tạo mới hoặc thử join khi còn hợp lệ              |
| E04 | Retry sau phản hồi thất lạc              | Không nhân nhóm/membership; reconcile kết quả hiện hành                             | Hiển thị đúng kết quả, không báo thành công giả                    |
| E05 | B2 ngoài roster/nhóm đã đóng             | Từ chối, không trả chat/frame/media riêng                                           | Giữ scope đang hợp lệ; không mở lại nhóm bằng ID cũ                |
| E06 | B4 MAIN chưa có share                    | Hiển thị chưa có nguồn; vẫn trao đổi nhóm                                           | Hoàn tất join, không tự bật share DISCUSSION                       |
| E07 | B3–4 mất mạng                            | Thu membership DISCUSSION ngay; nhóm từng có người rỗng thì đóng, reconnect về MAIN | Lấy trạng thái server; chỉ join lại nếu đủ điều kiện               |
| E08 | Sau B, thành viên về MAIN/rời LIVE       | Thu private scope; về MAIN pause mic theo policy                                    | Còn người thì nhóm tiếp tục; người cuối chủ động rời thì đóng nhóm |
| E09 | Host đóng nhóm hoặc start ACTIVITY       | Thu private scope, hủy intent, dọn frame/nét, bỏ nút vào                            | Không đưa nội dung nhóm ra MAIN; theo HS-03 nếu bắt đầu lượt       |

## Hậu điều kiện và vòng đời

- Tạo thành công chỉ có nhóm/roster; chỉ join hợp lệ mới nhận private. Thất bại không cấp quyền stale.
- Nhóm mới chưa ai vào vẫn chờ. Khi còn người, roster hợp lệ có thể chủ động vào lại.
- Người cuối chủ động về MAIN/rời LIVE sau khi nhóm từng có người làm nhóm tự đóng; roster cũ không mở lại. Muốn tiếp tục tạo nhóm mới, không chờ host.
- Disconnect thu membership ngay, không giữ grace DISCUSSION. Nhóm từng có người rỗng thì đóng; reconnect về MAIN, chỉ chủ động vào lại nếu nhóm còn mở/còn người và roster/quyền hợp lệ. ACTIVITY không đóng theo quy tắc rỗng này.
- Host ở MAIN hỗ trợ DISCUSSION qua chat riêng text/ảnh; không vào hỗ trợ trực tiếp.

## Kiểm chứng

Create hợp lệ không cần thao tác host; sai field/roster bị từ chối; retry không trùng; create đồng thời start ACTIVITY không vượt phase; người chưa bấm/ngoài roster không nhận private; hai người vào khác thời điểm; rời/vào lại khi còn người; người cuối rời đóng nhóm; cấm share; reconnect không phục hồi nhóm đóng. Kiểm biên 80/81, 500/501.

Quality scenarios Q-05/Q-06 theo [technical plan](../../technical-plan.md#142-quality-scenarios), chưa là SLA đạt. Không có UC host xét duyệt, nhánh từ chối bởi host hoặc hủy pending nghiệp vụ trong bản này.
