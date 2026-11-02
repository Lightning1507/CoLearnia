# HS-04 · Chia sẻ màn hình theo phạm vi

**Trạng thái:** bản 2 chỉnh theo review và xác nhận người dùng ngày 29/10/2026; chờ review bản sửa. [Quy ước chung](README.md). Nguồn: [live session 6.3](../live-session.md), [group modes](../group-modes.md), [policy](../groups-media-policy.md).

## Thông tin UC

| Thuộc tính     | Nội dung                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC trọng tâm   | UC-LIVE-05 · Chia sẻ màn hình, bao gồm luồng dừng share đã gộp                                                                                                                    |
| Mục tiêu       | Truyền nội dung màn hình tới đúng audience và kết thúc nguồn của mình khi xong                                                                                                    |
| Actor chính    | A-03 · Thành viên Workspace đã vào cuộc họp, kể cả host khi có quyền scope                                                                                                        |
| Actor phối hợp | A-03 khác có quyền xem nguồn MAIN hoặc cùng ACTIVITY; host đang hỗ trợ nhóm theo policy                                                                                           |
| Trigger        | Người tham gia chọn Chia sẻ màn hình                                                                                                                                              |
| Tiền điều kiện | Phiên hoạt động, actor còn quyền và đang ở MAIN hoặc ACTIVITY; browser hỗ trợ thao tác capture. Nguồn trống là điều kiện bắt đầu thành công, vẫn phải kiểm khi người dùng yêu cầu |

## Quyền theo bối cảnh

| Bối cảnh nguồn | Ai được bắt đầu                             | Ai được nhận                                             | Giới hạn                                                                    |
| -------------- | ------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| MAIN           | Mọi participant hiện ở MAIN, không xin host | MAIN và DISCUSSION có quyền nhận bài giảng               | Một nguồn share đang hoạt động; người khác chờ, không giành                 |
| DISCUSSION     | Không ai được share riêng trong nhóm        | Nhận nguồn MAIN hợp lệ; không có nguồn share DISCUSSION  | UI ẩn và server từ chối; không biến share MAIN thành quyền publish của nhóm |
| ACTIVITY       | Mọi member hiện trong nhóm, không xin host  | Thành viên nhóm và host đang hỗ trợ đúng nhóm theo quyền | Một nguồn mỗi nhóm; A/B có thể share đồng thời độc lập                      |

## Luồng chính — bắt đầu, truyền và chủ động dừng

1. Actor chọn chia sẻ màn hình trong scope hiện tại.
2. Hệ thống kiểm quyền/scope và nguồn hiện có; nếu trống thì giữ chỗ tự động cho actor để chuẩn bị chọn nguồn. Đây không là yêu cầu host duyệt.
3. Hệ thống cho thực hiện Chọn màn hình để chia sẻ; người dùng bấm để browser mở bộ chọn nguồn và tự chọn màn hình/cửa sổ/tab. Ứng dụng không tự chọn nguồn hoặc tái sử dụng quyền capture cũ.
4. Khi browser trả nguồn, hệ thống kiểm lại quyền, scope và giữ chỗ còn hợp lệ, rồi bắt đầu nguồn share của actor.
5. Hệ thống chỉ cung cấp hình và âm thanh đi kèm màn hình nếu có cho đúng người được phép nhận, hiển thị người đang chia sẻ. Theo HS-05, MAIN chỉ host vẽ LIVE, không freeze; trong DISCUSSION/ACTIVITY thành viên có thể freeze/vẽ, không bắt buộc thực hiện.
6. Khi xong, actor chọn dừng chia sẻ trong ứng dụng hoặc dùng Stop của browser.
7. Hệ thống đóng nguồn screen/screen audio của actor và giải phóng chỗ để người khác có thể share; cập nhật trạng thái nguồn trong đúng scope. Chỉ dẫn trên hình trực tiếp và yêu cầu dừng hình cũ bị hủy theo nguồn; khung hình đã dừng được xử lý theo HS-05.

## Nhánh thay thế và lỗi

| Mã nhánh  | Điểm rẽ | Tình huống                                                          | Phản hồi / kết quả                                                                                                    | Tiếp tục / kết thúc                                                                                                           |
| --------- | ------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| HS-04-E01 | 2       | Nguồn đang có người share hoặc đang được giữ chỗ hợp lệ             | Báo nguồn bận/chưa thể bắt đầu; không dừng hoặc thay nguồn hiện tại; không tạo hàng đợi tự bật share ngoài quyết định | Kết thúc lần xin bắt đầu không thành công; muốn thử sau phải chủ động bắt đầu lại bước 1, không tự bật share khi nguồn trống. |
| HS-04-E02 | 2       | Hai người yêu cầu cùng lúc                                          | Chỉ một người được giữ chỗ; người kia nhận kết quả bận. Hai nhóm khác nhau không tranh cùng một chỗ                   | Người được giữ chỗ tiếp tục bước 3; người không được giữ chỗ kết thúc lần bắt đầu và có thể chủ động thử lại từ bước 1.       |
| HS-04-E03 | 2       | Actor ở DISCUSSION hoặc giả scope nhóm khác                         | Từ chối cả request tự tạo; không mở quyền chỉ vì UI bị sửa                                                            | Kết thúc không thành công; không quay sang xin quyền host hoặc tự đổi scope để publish.                                       |
| HS-04-E04 | 3       | Hủy picker, từ chối quyền hoặc browser không hỗ trợ                 | Báo phù hợp, hủy giữ chỗ/tài nguyên chuẩn bị; không công bố nguồn rỗng                                                | Kết thúc lần bắt đầu không thành công sau dọn tài nguyên; người dùng có thể chủ động bắt đầu lại bước 1.                      |
| HS-04-E05 | 3–4     | Giữ chỗ hết hạn; actor đã đổi nhóm hoặc mất quyền                   | Không publish, đóng track vừa lấy và báo trạng thái thay đổi; muốn share phải chủ động thử lại trong scope hiện tại   | Kết thúc lần bắt đầu không thành công; muốn share phải bắt đầu lại bước 1 trong scope hiện hành.                              |
| HS-04-E06 | 4–5     | Không có screen audio hoặc audio không được browser/OS hỗ trợ       | Tiếp tục share hình nếu hợp lệ, thể hiện audio không có; không tự thay bằng mic hoặc nguồn khác                       | Tiếp tục bước 5 với hình và trạng thái không có screen audio; không tự bổ sung nguồn audio khác.                              |
| HS-04-E07 | Sau 4   | Người share rời/kick/chuyển nhóm, nguồn bị mất quyền hoặc mất lease | Đóng đúng nguồn và giải phóng scope cũ; không tiếp tục nhận dù UI đã chuyển nhóm; không reset share nhóm khác         | Kết thúc vòng share của nguồn cũ bằng xử lý dừng ở bước 7; lần share mới cần bắt đầu lại bước 1.                              |
| HS-04-E08 | Trong 5 | Host được chuyển hoặc hoàn quyền                                    | Giữ MAIN share còn hợp lệ vì không phụ thuộc vai trò host; help và quyền nhận theo host hiện hành vẫn phải kiểm lại   | Tiếp tục bước 5 với nguồn còn hợp lệ và quyền nhận được đồng bộ; không xin host duyệt lại nguồn.                              |
| HS-04-E09 | Trong 5 | Người xem mất mạng/reconnect                                        | Chỉ lấy nguồn hiện còn quyền; không mở lại share đời cũ, không gắn audio hai lần                                      | Người xem nhận trạng thái/nguồn hiện hành sau HS-01; nếu không còn quyền thì kết thúc nhận nguồn, không tái mở nguồn cũ.      |

## Hậu điều kiện và quy tắc

- **Bắt đầu thành công:** đúng một nguồn hợp lệ ở scope, audience được phép nhận. **Dừng thành công:** nguồn actor đóng, chỗ share được giải phóng, nguồn scope khác không bị ảnh hưởng.
- **Bảo đảm khi lỗi:** không để track capture/nguồn chờ mồ côi của thao tác hủy; không chiếm nguồn bằng dữ liệu stale hoặc phát ra sai audience.
- Screen audio đi kèm đúng nguồn và khả năng browser; host không được dùng quyền điều hành để mở đường nghe nhóm riêng thường trực.
- Board ACTIVITY bám nguồn screen duy nhất đang share trong nhóm; DISCUSSION bám MAIN. Không có nguồn hợp lệ phải báo rõ, không fallback ACTIVITY về MAIN.
- Thời hạn giữ chỗ và profile media dùng cấu hình thử tại nguồn, không tự đặt SLA hoặc khẳng định capacity từ đặc tả.

## Ghi chú kỹ thuật cho dev

Giữ chỗ là lease theo scope, không là host grant. Browser capture cần thao tác người dùng; timeout/hủy/mất scope phải stop track và release đúng ownership/generation. Luồng kỹ thuật cụ thể và tham số thử ở live-session 6.3.

## Lợi ích và yêu cầu chất lượng liên quan

Người share cần chủ động chọn/dừng nguồn; người xem cần đúng nội dung; nhóm khác cần không bị ảnh hưởng khi một nguồn dừng.

Tham chiếu [quality scenarios của technical plan](../../technical-plan.md#142-quality-scenarios): Q-02 (xem screen), Q-05 (thu quyền), Q-06 (reconnect). Đây là mục tiêu thử trong baseline, chưa là SLA hoặc số đo đã đạt; điều kiện đo và workload lấy tại nguồn, không tự tăng lên lớp 40–50 người.

## Ca review / nghiệm thu cần có

1. MAIN tranh nguồn chỉ một người thắng, không xin host; DISCUSSION giả request share bị chặn.
2. A/B ACTIVITY share cùng lúc; cạnh tranh trong A không làm dừng B.
3. Hủy picker/hết giữ chỗ/chuyển nhóm khi picker mở: không phát hoặc giữ capture trái quyền.
4. Stop browser, rời nhóm và mất quyền: đóng hình/audio đúng nguồn; FROZEN vẫn phân biệt với LIVE.
5. Chuyển host không dừng nguồn MAIN hợp lệ; reconnect không nhân audio/nguồn hoặc phục hồi share cũ.
