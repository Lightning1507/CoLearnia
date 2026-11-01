# HS-02 · Yêu cầu, duyệt và vào nhóm DISCUSSION

**Trạng thái:** bản 3 ngày 01/11/2026, bổ sung hủy pending, mất hiệu lực và field limits đã được người dùng đồng ý; kế thừa review bản 2 ngày 29/10. Chưa triển khai runtime. [Quy ước chung](README.md). Nguồn: [group modes](../group-modes.md), [quyền nhóm](../groups-media-policy.md).

## Mục tiêu và ranh giới

Thành viên xin một không gian trao đổi riêng trong khi tiếp tục theo dõi bài giảng. Host duyệt danh sách; từng người được duyệt tự quyết định lúc vào. Hồ sơ mô tả ba UC riêng, không phải một UC duy nhất hay quan hệ include giữa chúng.

| UC                                    | Actor chính / phối hợp  | Trigger                              | Điểm hoàn tất thành công                                       |
| ------------------------------------- | ----------------------- | ------------------------------------ | -------------------------------------------------------------- |
| UC-GRP-02 · Yêu cầu tạo nhóm trao đổi | A-03 người đề nghị      | Người tham gia chọn yêu cầu tạo nhóm | Yêu cầu hợp lệ được ghi nhận chờ host xét; chưa cấp quyền nhóm |
| UC-GRP-03 · Xét duyệt yêu cầu         | A-07 host               | Host mở một yêu cầu chờ xét          | Yêu cầu được duyệt với roster hợp lệ hoặc bị từ chối           |
| UC-GRP-04 · Vào nhóm đã được duyệt    | A-03 người trong roster | Người được duyệt chọn Vào nhóm       | Người đó có membership DISCUSSION và nhận đúng nguồn/quyền     |

**Tiền điều kiện:** phiên còn hoạt động, actor đang tham gia chính LiveSession đang xét và còn quyền LIVE; phase giảng cho phép DISCUSSION. Xét duyệt cần đúng host hiện tại và yêu cầu còn có thể xử lý. Vào nhóm cần nhóm còn mở và actor thuộc roster được duyệt; chưa cần actor đã có membership nhóm. Quyền truy cập kênh LIVE hoặc có tên trong roster không thay điều kiện đã tham gia cuộc họp. Điều kiện chung này áp dụng cho cả ba UC trong bảng dưới.

## Điều kiện và kết quả riêng từng UC

| UC        | Điều kiện bắt đầu và trigger                                                           | Hậu điều kiện thành công                                                              | Bảo đảm khi thất bại                                                                                 |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| UC-GRP-02 | Phase giảng, actor còn quyền LIVE; trigger gửi yêu cầu tại A3                          | Có yêu cầu chờ host xét, chưa có membership nhóm                                      | Dữ liệu lỗi chưa ghi thành yêu cầu hợp lệ; không cấp quyền nhóm                                      |
| UC-GRP-03 | Đúng host, yêu cầu đang chờ trong phase giảng; trigger quyết định duyệt/từ chối tại B2 | Có kết quả xét duyệt; nếu duyệt thì có roster đủ điều kiện vào, không tự chuyển người | Không duyệt bằng quyền hoặc roster stale, không nhân nhóm/roster                                     |
| UC-GRP-04 | Nhóm mở, phase giảng, actor thuộc roster còn quyền; trigger chọn vào tại C1            | Actor đã có tư cách tham gia nhóm, nhận đúng bài giảng và nội dung nhóm               | Không cấp nội dung riêng khi chưa vào hợp lệ; phần quyền đã bị thu không được khôi phục bằng lệnh cũ |

## Luồng chính

### A. Gửi yêu cầu — UC-GRP-02

1. Người đề nghị mở chức năng xin nhóm trao đổi.
2. Hệ thống cho nhập tên nhóm, mục đích và chọn các thành viên dự kiến.
3. Người đề nghị gửi yêu cầu.
4. Hệ thống kiểm quyền, phase và tính hợp lệ của dữ liệu/danh sách tại thời điểm gửi.
5. Hệ thống ghi nhận yêu cầu để host xét và thông báo kết quả gửi cho người đề nghị. UC này hoàn tất ở trạng thái chờ; không tự tạo tư cách tham gia nhóm hoặc chuyển người.

### B. Host xét duyệt — UC-GRP-03, xảy ra sau A

1. Host xem tên, mục đích và danh sách được đề xuất của một yêu cầu chờ xét.
2. Host chọn duyệt.
3. Hệ thống kiểm lại quyền host, phase, yêu cầu và các thành viên hiện còn hợp lệ.
4. Hệ thống xác lập nhóm/roster đã được duyệt và cung cấp thao tác Vào nhóm cho đúng những người được chấp thuận.
5. Hệ thống hiển thị kết quả đã duyệt; không chuyển người hoặc mở nội dung riêng cho người chưa vào. UC xét duyệt hoàn tất độc lập với thời điểm mỗi người tham gia.

### C. Từng người chủ động vào — UC-GRP-04, xảy ra sau B

1. Một người trong roster chọn Vào nhóm.
2. Hệ thống kiểm lại nhóm còn mở, phase giảng, tư cách đang tham gia cùng LiveSession, quyền LIVE và roster hiện hành của người đó.
3. Khi đổi phạm vi, hệ thống thu đường nhận/phát và quyền đọc nội dung riêng ở nơi cũ trước khi cấp quyền nhóm mới. Mic theo quy tắc chuyển nhóm, không tự phát tiếng đang trao đổi sang phạm vi rộng hơn.
4. Hệ thống xác lập tư cách tham gia DISCUSSION của người đó, hiển thị rõ nhóm hiện tại và phạm vi mic/camera/chat/board.
5. Người đã vào tiếp tục nhận màn hình/âm thanh chia sẻ MAIN và tiếng/hình host hướng dẫn khi nguồn hợp lệ; trao đổi mic/camera, chat và board riêng với nhóm. Không có chức năng chia sẻ màn hình riêng trong DISCUSSION; hệ thống vẫn từ chối cả yêu cầu cố gửi ngoài giao diện.
6. Những người khác trong roster có thể vào sau theo cùng luồng; không bắt tất cả cùng xác nhận.

## Nhánh thay thế và lỗi

| Mã nhánh  | Điểm rẽ  | Tình huống                                          | Phản hồi / kết quả                                                                                                                            | Tiếp tục / kết thúc                                                                                                                                                      |
| --------- | -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HS-02-E01 | A4       | Thiếu mục đích hoặc danh sách không hợp lệ          | Báo lỗi, không ghi nhận là đã gửi thành công; không cấp quyền nhóm                                                                            | Quay lại A2 để người đề nghị sửa dữ liệu rồi chủ động gửi ở A3.                                                                                                          |
| HS-02-E02 | A4/B3/C2 | ACTIVITY đã bắt đầu trong lúc thao tác              | Từ chối yêu cầu/duyệt/join cũ, đồng bộ phase; không tự chuyển thành ACTIVITY                                                                  | Kết thúc thao tác gửi/duyệt/vào đang xét, không thành công; xem phase hiện hành, không tự thử lại khi ACTIVITY còn chạy.                                                 |
| HS-02-E03 | B2       | Host chọn từ chối                                   | Ghi nhận kết quả từ chối; không tạo quyền vào nhóm; không ép nhập lý do nếu chưa có quyết định về trường đó                                   | Kết thúc UC-GRP-03 thành công với quyết định từ chối; không đi tiếp C.                                                                                                   |
| HS-02-E04 | B3/C2    | Thành viên đã rời phiên hoặc mất quyền              | Không cấp quyền theo danh sách cũ; báo dữ liệu không còn hợp lệ để người dùng xem lại; không tự thay người hoặc âm thầm duyệt một roster khác | Kết thúc thao tác không thành công và hiển thị dữ liệu hiện hành; không tự sửa roster. Nếu cần đổi, người gửi hủy yêu cầu còn chờ rồi gửi lại; không sửa yêu cầu đã gửi. |
| HS-02-E05 | B3       | Người xử lý không còn là host hoặc yêu cầu đã xử lý | Từ chối thao tác stale, hiển thị kết quả hiện hành; không duyệt lặp hoặc nhân nhóm                                                            | Kết thúc lần xét duyệt stale; xem kết quả hiện hành, không tạo một lần duyệt mới tự động.                                                                                |
| HS-02-E06 | C2       | Người ngoài roster cố vào; nhóm đã đóng             | Từ chối; không trả ảnh/nét/chat/media riêng chỉ vì biết ID                                                                                    | Kết thúc lần vào không thành công; giữ quyền đang hợp lệ bên ngoài nhóm đích, không thử vào lại bằng ID cũ.                                                              |
| HS-02-E07 | C1       | Người được duyệt chưa bấm Vào nhóm                  | Giữ scope hiện tại; không nhận dữ liệu riêng của nhóm                                                                                         | Chưa bắt đầu UC-GRP-04; tiếp tục chờ người đó chủ động chọn vào nếu vẫn đủ điều kiện.                                                                                    |
| HS-02-E08 | C5       | MAIN chưa có nguồn share hoặc nguồn vừa dừng        | Hiển thị chưa có nguồn bài giảng tương ứng; nhóm vẫn trao đổi theo quyền, không tự bật share riêng                                            | Tiếp tục C6 và hoàn tất vào nhóm; thiếu bài giảng không làm thất bại tư cách tham gia hợp lệ.                                                                            |
| HS-02-E09 | C3–5     | Mất mạng hoặc đổi quyền khi đang vào                | Không cấp tiếp quyền stale; reconnect lấy scope/membership hiện tại, không coi roster là membership; quá grace theo HS-01                     | Tạm ngừng thao tác; theo HS-01 để xác định membership hiện tại. Nếu lần vào chưa hoàn tất thì kết thúc không thành công; chỉ thử lại từ C1 khi còn đủ điều kiện.         |
| HS-02-E10 | Sau C    | Thành viên chọn Về phòng chung                      | Tham chiếu UC-GRP-08: chỉ mình về MAIN, thu private scope cũ, mic pause để tự bật; không đóng nhóm hoặc rời LIVE                              | Kết thúc UC-GRP-08 ở MAIN; không quay lại C hoặc tự vào nhóm cũ.                                                                                                         |
| HS-02-E11 | B/C      | Host đóng nhóm hoặc bắt đầu ACTIVITY                | Thu private scope; chặn lệnh chậm/ảnh còn pending; chuyển người theo luồng đóng nhóm/lượt, không mang board/chat sang MAIN                    | Kết thúc thao tác nhóm cũ; đồng bộ scope mới theo HS-03 hoặc luồng đóng nhóm, không tiếp tục bằng context cũ.                                                            |

## Hậu điều kiện và quy tắc

- **Thành công theo từng UC:** A có yêu cầu chờ; B có quyết định/roster hoặc từ chối; C mới có membership thật. Không gọi “đã vào nhóm” ở bước duyệt.
- **Bảo đảm khi lỗi:** không mở nội dung nhóm cho người chưa được cấp membership, không duy trì quyền scope cũ sau khi đã bị thu; client hiển thị trạng thái server hiện hành thay vì báo thành công giả.
- DISCUSSION có thể cùng tồn tại trong phase giảng; không hoạt động đồng thời với ACTIVITY. Everyone chỉ trong scope hiện tại, không gửi tới các DISCUSSION khác.
- Người gửi hủy được yêu cầu còn chờ; không sửa đã gửi, hủy rồi gửi lại. Pending mất hiệu lực khi ACTIVITY bắt đầu/phiên kết thúc, không TTL phút. Tên tối đa 80, mục đích tối đa 500 ký tự; roster không trùng, chỉ participant hợp lệ cùng phiên, không cap riêng ngoài capacity. Kiểm lại roster stale tại thời điểm xử lý; không tự thêm chức năng người ngoài xin vào hoặc đổi mode nhóm.

## Ghi chú kỹ thuật cho dev

Roster được duyệt khác membership; fanout, Consumer và ảnh/nét chỉ cấp sau join hợp lệ. Đổi phase hoặc thu quyền phải vô hiệu hóa thao tác đang chờ; không dùng ẩn UI hoặc gain=0 để thay kiểm quyền.

## Lợi ích và yêu cầu chất lượng liên quan

Người đề nghị cần biết yêu cầu đang chờ/đã xử lý; người được chọn tự quyết định vào; thành viên cần nội dung nhóm không sang nhóm khác.

Tham chiếu [quality scenarios của technical plan](../../technical-plan.md#142-quality-scenarios): Q-05 (thu quyền/chuyển nhóm), Q-06 (reconnect). Đây là mục tiêu thử trong baseline, chưa là SLA hoặc số đo đã đạt; điều kiện đo và workload lấy tại nguồn, không tự tăng lên lớp 40–50 người.

## Ca review / nghiệm thu cần có

1. Gửi → host duyệt → hai người vào khác thời điểm; người chưa bấm và người ngoài roster không đọc được private.
2. Từ chối yêu cầu; mất quyền giữa gửi/duyệt/join; retry không nhân nhóm hoặc membership.
3. ACTIVITY bắt đầu đồng thời với duyệt/join: không tái mở DISCUSSION cũ.
4. Hai DISCUSSION nhận bài giảng nhưng không nghe/đọc board/chat riêng của nhau; giả client share riêng bị chặn.
5. Tự về MAIN và reconnect không phục hồi quyền nhóm cũ hoặc công khai board nhóm.
6. Thành viên có quyền kênh LIVE nhưng chưa vào phiên không được gửi yêu cầu, duyệt hoặc vào DISCUSSION bằng ID/roster cũ; phải vào cuộc họp hợp lệ trước.

## Bổ sung nhánh hủy và validation ngày 01/11

- **HS-02-E12, sau A5 trước quyết định B:** người gửi chọn hủy. Server kiểm đúng người gửi và yêu cầu vẫn pending, ghi kết quả hủy; host không duyệt được nữa. Nếu duyệt đã thắng thì trả trạng thái hiện hành, không đóng nhóm đã duyệt. Đây là nhánh của UC-GRP-02, không thêm oval.
- **HS-02-E13, A4/B3:** khi bắt đầu ACTIVITY hoặc kết thúc phiên, yêu cầu pending mất hiệu lực; lệnh duyệt cũ bị từ chối, không tự sống lại sau lượt hoạt động.
- A4 kiểm tên ≤80, mục đích ≤500 và danh sách theo [group modes](../group-modes.md); dữ liệu sai quay A2. Kiểm thử biên 80/81 và 500/501, trùng roster, participant rời phiên và race hủy/duyệt. Chưa chọn tên enum/event executable từ đặc tả này.
