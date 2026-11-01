# HS-03 · Tổ chức và kết thúc lượt ACTIVITY

**Trạng thái:** bản 4 ngày 01/11/2026, chốt thời lượng số nguyên 1–120 phút trước bắt đầu và không edit/pause/extend khi chạy; kế thừa bản 3 ngày 29/10/2026: hết thời lượng tự kết thúc lượt và về MAIN, thay quy tắc chỉ nhắc/chờ host của bản 2. Đây là thiết kế, chưa triển khai runtime. [Quy ước chung](README.md). Nguồn: [group modes](../group-modes.md), [policy](../groups-media-policy.md), [vòng đời](../live-session.md).

## Mục tiêu và ranh giới

Host tổ chức các nhóm độc lập với MAIN, thiết lập thời lượng chung; thành viên làm việc hoặc tự về MAIN sớm. Hết thời lượng, hệ thống tự kết thúc lượt và đưa người còn quyền về MAIN, không chờ host. Tự kết thúc là luồng hệ thống, không là một UC độc lập hoặc actor mới.

| UC                                        | Actor chính / phối hợp | Trigger và kết quả                                                                                   |
| ----------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| UC-GRP-05 · Chuẩn bị nhóm hoạt động       | A-07                   | Chuẩn bị nhóm và phân người; chưa chuyển scope                                                       |
| UC-GRP-06 · Bắt đầu lượt hoạt động nhóm   | A-07; A-03 được phân   | Bắt đầu lượt có thời lượng hợp lệ; đóng DISCUSSION trước, đưa người vào nhóm độc lập                 |
| UC-GRP-11 · Đặt thời lượng lượt hoạt động | A-07; A-03 theo dõi    | Host thiết lập thời lượng chung khi tổ chức; khi bắt đầu thành công có deadline, hết giờ tự kết thúc |

UC-GRP-07 điều chuyển người và UC-GRP-08 tự về MAIN là các luồng liên quan. UC-GRP-09 chỉ còn dùng cho host đóng DISCUSSION; không dùng làm thao tác host kết thúc ACTIVITY. Host kết thúc toàn cuộc họp vẫn thuộc UC-LIVE-10, khác phạm vi hồ sơ này.

## Điều kiện và kết quả riêng từng UC

| UC        | Tiền điều kiện / trigger                                                                     | Hậu điều kiện thành công                                                                      | Bảo đảm khi lỗi                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| UC-GRP-05 | Phiên hoạt động, actor là host; chọn chuẩn bị/phân nhóm                                      | Có cấu hình dự kiến; mọi người vẫn ở scope cũ                                                 | Không chuyển người bằng cấu hình lỗi                                                                                   |
| UC-GRP-06 | Host hợp lệ, nhóm/phân công/thời lượng hợp lệ, chưa có lượt ACTIVITY đang chạy; chọn bắt đầu | DISCUSSION đóng; phase ACTIVITY; người được phân ở đúng nhóm; deadline chung được xác lập     | Lỗi chuyển một phần: hủy lượt, thu tài nguyên mới, đưa người còn quyền về MAIN, không mở lại DISCUSSION                |
| UC-GRP-11 | Host hợp lệ đang tổ chức lượt; nhập thời lượng trước khi bắt đầu                             | Có thời lượng hợp lệ cho lượt; khi bắt đầu thành công có deadline server chung để tự kết thúc | Duration lỗi không được dùng để bắt đầu; retry không reset deadline lượt đang chạy; không tự thêm sửa/gia hạn/tạm dừng |

## Luồng chính

### A. Chuẩn bị thời lượng và bắt đầu — UC-GRP-05/06/11

1. Host tạo các nhóm ACTIVITY, phân người đang tham gia và đặt một thời lượng chung cho lượt. Không có đồng hồ riêng từng nhóm.
2. Hệ thống kiểm host, nhóm/phân công và thời lượng, hiển thị cấu hình dự kiến; chưa thay scope. Host có thể dừng ở bước chuẩn bị để tiếp tục bài giảng.
3. Host chọn bắt đầu lượt ACTIVITY.
4. Hệ thống kiểm lại cấu hình, quyền và phase; chặn request/approval/join DISCUSSION khi chuyển sang lượt hoạt động. Thiếu thời lượng hợp lệ thì chưa bắt đầu.
5. Hệ thống đóng các DISCUSSION đang mở, thu private scope và hủy thao tác pending trước khi cấp ACTIVITY. Không sao chép chat/board nhóm cũ.
6. Hệ thống kích hoạt các ACTIVITY, chuyển người được phân tới nhóm theo policy; người chưa phân ở MAIN. Lượt bắt đầu thành công có roundId/deadline chung ở server. Không tự bật thiết bị hoặc phát tiếng scope cũ sang audience mới.
7. Các nhóm làm việc với mic/camera/chat/board và nguồn share riêng. Share/freeze/vẽ theo HS-04/05; không bắt buộc nhóm phải share hoặc vẽ mới coi là tham gia.

### B. Làm việc và tự về sớm — luồng theo dõi UC-GRP-11, liên quan UC-GRP-08

1. Các nhóm thấy cùng thời gian còn lại tính từ deadline và mốc giờ server.
2. Thành viên muốn về sớm chọn **Về phòng chung**. Hệ thống thu scope riêng, đóng nguồn share của người rời nếu có, chuyển chính người đó về MAIN và pause mic để tự bật lại.
3. Người còn lại tiếp tục làm việc với deadline cũ; một người về sớm không đóng nhóm hoặc hủy countdown. Người đã về không tự được cấp lại nhóm khi reconnect, không xin DISCUSSION trong lúc lượt còn chạy.
4. Đến deadline, hệ thống thực hiện C, không yêu cầu host ra lệnh hoặc xác nhận.

### C. Hết thời lượng và tập trung lại — kết thúc tự động

1. Server xác định deadline của đúng lượt đang chạy đã đến; xử lý theo roundId/epoch hiện tại, không dựa vào lệnh đóng nhóm từ client.
2. Hệ thống chặn mutation vào ACTIVITY cũ, kết thúc hỗ trợ liên quan, thu quyền nhận/phát media, share, fanout, chat/ảnh/board và pending operations của các nhóm thuộc lượt.
3. Hệ thống đóng các ACTIVITY của lượt, đưa người còn quyền về MAIN; người đã ở MAIN không bị chuyển hoặc reset thiết bị không cần thiết. Khi cleanup hoàn tất mới xác nhận lượt đã kết thúc và phase GUIDANCE.
4. Mic người từ nhóm về MAIN được pause để họ tự bật; thiết bị tắt không tự bật, camera đang bật đổi audience theo policy với thông báo rõ. Host đang hỗ trợ bị thu scope khi nhóm đóng; không áp luồng host chủ động rời help để tự phát tiếng hỗ trợ ra MAIN.
5. Cuộc họp tiếp tục ở MAIN, người dùng tự bật mic phát biểu; board/chat MAIN riêng, không công khai nội dung nhóm. Giữ vai trò host hiện hành; lúc này mới cho xin DISCUSSION trở lại.

## Nhánh thay thế và lỗi

| Mã        | Điểm rẽ | Tình huống                                    | Phản hồi / tiếp tục                                                                                                                                                                                    |
| --------- | ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HS-03-E01 | A1–4    | Phân công stale hoặc thành viên mất quyền     | Báo host xem lại cấu hình; quay A1, không bắt đầu bằng dữ liệu lỗi                                                                                                                                     |
| HS-03-E02 | A2–4    | Actor không còn host hoặc đã có lượt khác     | Từ chối lệnh stale, trả trạng thái hiện hành; không điều khiển lượt khác                                                                                                                               |
| HS-03-E03 | A5–6    | Lỗi sau đóng DISCUSSION hoặc chuyển một phần  | Hủy lượt chưa hoàn tất, thu ACTIVITY/deadline/tài nguyên mới, đưa người còn quyền về MAIN/pause mic. Không khôi phục DISCUSSION; chỉ báo đã hủy sau cleanup. Host có thể kiểm lại rồi bắt đầu lượt mới |
| HS-03-E04 | B       | Host điều chuyển người — UC-GRP-07            | Kiểm đích/phase/quyền, thu scope cũ trước khi cấp mới, đóng share người rời; không mang chat/board theo, không reset deadline                                                                          |
| HS-03-E05 | B       | Thành viên về sớm — UC-GRP-08                 | Theo B2–3; chỉ ảnh hưởng người bấm, không kết thúc nhóm/lượt cho người khác                                                                                                                            |
| HS-03-E06 | B/C     | Callback deadline trễ/lặp hoặc thuộc lượt cũ  | Reconcile deadline server của lượt hiện hành; không kết thúc lượt mới bởi callback cũ. Cleanup idempotent; không cho thao tác nhóm quá hạn tiếp tục vì callback chưa chạy                              |
| HS-03-E07 | A1–4    | Duration không hợp lệ                         | Từ chối, quay A1 để sửa trước khi bắt đầu. Chỉ nhận số nguyên từ 1 đến 120 phút; không sửa/gia hạn/tạm dừng lượt đang chạy                                                                             |
| HS-03-E08 | B/C     | Reconnect sau deadline                        | Reconcile kết thúc lượt trước khi cấp scope; trả MAIN hoặc trạng thái đang kết thúc thực tế, không reset countdown hoặc mở lại private nhóm                                                            |
| HS-03-E09 | B/C     | Host mất mạng, thay tạm hoặc hoàn quyền       | Theo HS-01; đổi host không reset deadline, không cản tự kết thúc. Không phát tiếng hỗ trợ ra MAIN; mọi lệnh host kiểm lại role hiện hành                                                               |
| HS-03-E10 | Mọi lúc | Phiên kết thúc hoặc thành viên mất quyền kênh | Thu truy cập; người mất quyền không được chuyển vào MAIN như còn quyền phiên. Không mở lại phiên đã kết thúc                                                                                           |
| HS-03-E11 | C2–3    | Cleanup/chuyển scope chưa hoàn tất            | Giữ deny barrier, thể hiện đang kết thúc và tiếp tục reconcile an toàn; chưa báo đã về MAIN/GUIDANCE hoặc cấp lại private nhóm cũ. Không đợi host duyệt để hoàn tất                                    |

## Hậu điều kiện và quy tắc

- Chuẩn bị thành công chưa chuyển người; bắt đầu thành công phải có deadline chung và isolation đúng nhóm.
- Hết thời lượng kết thúc đúng lượt: các ACTIVITY đóng, người còn quyền về MAIN, mic nhóm pause, private chat/board không công khai, phase GUIDANCE sau cleanup.
- Một người về sớm không kết thúc nhóm/lượt; không tự thêm quy tắc tất cả về sớm sẽ đóng lượt trước deadline.
- Lỗi bắt đầu một phần phải hủy lượt và về MAIN, không phục hồi DISCUSSION cũ; lỗi kết thúc không khôi phục quyền đã thu.
- MAIN và mỗi ACTIVITY một nguồn share riêng; không host approval cho share, không nhận MAIN mặc định trong ACTIVITY.
- Duration là số nguyên 1–120 phút trước bắt đầu; bản đầu không pause/edit/extend khi chạy. Schema/trạng thái kết thúc chi tiết thiết kế theo task. Thời lượng và tự kết thúc đã chốt, không hỏi lại như điểm mở.

## Ghi chú kỹ thuật và chất lượng

Round/deadline nằm trong runtime; session manager serialize bắt đầu và kết thúc, kiểm epoch/roundId, deny barrier và callback idempotent. Reconnect đối chiếu deadline server trước khi cấp scope. Tên event/enum cụ thể hoàn thiện theo task contracts, không tạo schema/migration từ thay đổi tài liệu này.

Tham chiếu [quality scenarios](../../technical-plan.md#142-quality-scenarios): Q-05 thu quyền, Q-06 reconnect. Chưa là SLA hoặc bằng chứng tải lớp 40–50 người.

## Ca review / nghiệm thu

1. Thiếu/sai thời lượng không bắt đầu; chuẩn bị chưa chuyển người; bắt đầu đóng DISCUSSION trước và chặn request/approval/join cũ.
2. Hai ACTIVITY share độc lập, không nhận MAIN/nhóm khác; người chưa phân vẫn ở MAIN.
3. Một người về sớm: pause mic/thu scope/share của mình, người khác tiếp tục countdown cũ.
4. Hết giờ tự kết thúc mọi ACTIVITY đúng lượt, kể cả host mất mạng; về MAIN/pause mic, thu help/share/chat/board, không công khai nội dung hoặc tiếng hỗ trợ.
5. Reconnect sau deadline và callback trễ/lặp không reset thời lượng, không mở lại nhóm cũ, không kết thúc lượt mới.
6. Lỗi bắt đầu một phần hủy lượt, về MAIN; lỗi cleanup thể hiện đang kết thúc đến khi thu quyền/chuyển phạm vi xong; không giả thành công.

## Vị trí trên sơ đồ

UC-GRP-05/06/11 và UC-GRP-07 thuộc điều hành; UC-GRP-08 tự về MAIN thuộc tham gia nhóm. Luồng tự kết thúc khi hết giờ không tạo oval/actor mới. UC-GRP-09 chỉ dành cho DISCUSSION theo [danh mục](../use-case-catalog.md). Trạng thái kiểm bản Astah/PNG ghi tại [trạng thái bản vẽ](../diagrams/README.md).
