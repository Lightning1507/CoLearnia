# HS-05 · Dừng hình, vẽ chung và trở lại trực tiếp

**Trạng thái:** bản 3 cập nhật quyết định board ngày 02/11/2026; đã review tài liệu, chưa kiểm chứng implementation. [Quy ước chung](README.md). Nguồn: [board collaboration](../board-collaboration.md), [policy](../groups-media-policy.md), [group modes](../group-modes.md).

## Mục tiêu và ranh giới

MAIN: chỉ host ở phạm vi MAIN/hướng dẫn vẽ trực tiếp, không freeze/resume. DISCUSSION/ACTIVITY: người cùng nhóm dùng một khung hình chung để giải thích, vẽ hoặc đọc rồi trở lại hình hiện tại. Freeze chỉ tác động board chung của nhóm, không pause cá nhân hoặc pause bài giảng.

| UC                                   | Actor chính / phối hợp                     | Trigger và kết quả                                                               |
| ------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| UC-BOARD-01 · Dừng hình để cộng tác  | A-03 có quyền board; A-03 khác trong scope | Một người chọn dừng hình; cả scope có cùng frame chung, audio hợp lệ tiếp tục    |
| UC-BOARD-02 · Vẽ và chỉ dẫn          | A-03 trong nhóm; A-07 tại MAIN             | Người dùng giải thích bằng bút/con trỏ; người cùng scope thấy chỉ dẫn/nét hợp lệ |
| UC-BOARD-05 · Trở lại hình trực tiếp | A-03 có quyền context                      | Người dùng chọn resume; cả scope bỏ ảnh/nét cũ và xem nguồn hiện tại nếu còn     |

**Tiền điều kiện:** actor còn trong scope được phép đọc/vẽ; phiên và context còn hiệu lực. Freeze/resume chỉ trong DISCUSSION/ACTIVITY. MAIN vẽ cần host hiện hành ở MAIN/hướng dẫn và nguồn hợp lệ; share owner không thay host. Freeze cần nguồn hợp lệ có hình sẵn; vẽ trên frame đã chốt cần frame/context còn hợp lệ, không bắt nguồn live cũ vẫn tồn tại. Resume có thể hủy freeze đang chờ hoặc kết thúc trạng thái frozen theo quyền.

## Nguồn và phạm vi tác động

| Scope board | Nguồn hình                        | Người bị tác động khi freeze/resume                                       |
| ----------- | --------------------------------- | ------------------------------------------------------------------------- |
| MAIN        | Nguồn MAIN hiện hành              | Không freeze/resume; chỉ host vẽ/undo nét mình/clear LIVE, thành viên xem |
| DISCUSSION  | Nguồn MAIN được kế thừa           | Chỉ nhóm DISCUSSION đó; không làm dừng bài giảng hoặc board nhóm khác     |
| ACTIVITY    | Nguồn đang share trong chính nhóm | Chỉ ACTIVITY đó; không dùng MAIN hoặc screen nhóm khác                    |

Host chỉ đọc/vẽ/clear khi có quyền context hiện tại; vai trò host không mở mọi board nhóm. Theo quyết định 02/11/2026, host chỉ vào hỗ trợ/nhận quyền board ACTIVITY; DISCUSSION hỏi/trả lời qua chat riêng, không cấp quyền toàn bộ board cho host. MAIN screen có thể đến DISCUSSION, nhưng board MAIN không tự hợp nhất với board DISCUSSION.

## Điều kiện và kết quả riêng từng UC

| UC          | Điều kiện bắt đầu và trigger                                                             | Hậu điều kiện thành công                                                                                                                  | Bảo đảm khi thất bại                                                                        |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| UC-BOARD-01 | Board nhóm còn quyền, đang nhận hình trực tiếp và có nguồn/hình hợp lệ; trigger A1       | Cùng phạm vi có một frame được chốt, audio hợp lệ vẫn tiếp tục                                                                            | Lần freeze thất bại không công bố ảnh chưa chốt hoặc đè frame/context mới của thao tác khác |
| UC-BOARD-02 | Actor có quyền board LIVE hoặc FROZEN; FROZEN cần frame/context còn hiệu lực; trigger B1 | Chỉ dẫn/nét đúng phạm vi và người vẽ; FROZEN nhóm giữ nét theo context; LIVE nhóm chỉ dẫn tạm; MAIN host dùng nét thường hoặc tự biến mất | Nét/undo/clear lỗi không thay nội dung không thuộc quyền; mất quyền chặn thao tác cũ        |
| UC-BOARD-05 | Board nhóm có frame đã dừng hoặc freeze đang chờ và còn quyền context; trigger C1        | Frame/nét cũ đóng; hiển thị nguồn hiện tại hoặc chưa có nguồn                                                                             | Không cho thao tác cũ đóng context mới; không mở nguồn trái quyền để giả đã resume          |

## Luồng chính

### A. Dừng hình — UC-BOARD-01

1. Thành viên chọn dừng hình của nhóm hiện tại trên một nguồn hợp lệ.
2. Hệ thống kiểm quyền, ngữ cảnh board và nguồn, cho chuẩn bị một khung hình; hiển thị trạng thái đang thực hiện để tránh báo đã dừng khi ảnh chưa sẵn sàng.
3. Ứng dụng chụp frame từ nguồn đang được phép xem và gửi frame tạm để xác lập hình chung. Người dùng không phải tự tải/chọn một ảnh khác để thay bài giảng.
4. Hệ thống kiểm lại quyền, ngữ cảnh board, nguồn và khung hình; chỉ một thao tác hợp lệ được chốt cho trạng thái hiện hành.
5. Hệ thống chuyển board của scope sang FROZEN và hiển thị cùng frame cho mọi người có quyền, ghi rõ hình nhóm đã dừng còn bài giảng/nguồn live và audio vẫn tiếp tục theo policy.
6. UC dừng hình hoàn tất; người dùng có thể chỉ đọc, vẽ sau hoặc chọn resume, không bắt buộc phải vẽ ngay.

### B. Cộng tác bằng nét/con trỏ — UC-BOARD-02

1. Actor chọn bút/màu hoặc dùng con trỏ để giải thích trong context đang có quyền.
2. Hệ thống hiển thị nét xem trước rồi xác nhận nét hợp lệ trong đúng ngữ cảnh board cho người được phép xem.
3. Trong nhóm, người khác có quyền tiếp tục thêm nét: FROZEN giữ nét theo frame/context, LIVE chỉ dẫn tạm. Tại MAIN, chỉ host thêm nét, chọn nét thường giữ tới khi clear/context nguồn kết thúc hoặc nét tự biến mất; thành viên chỉ xem. Nét không tracking nội dung khi cuộn/chuyển slide, không dừng hình/audio. Thời gian/fade nét tạm chưa chốt.
4. UC hoàn tất khi người dùng kết thúc lượt giải thích; các nét đã chốt vẫn tồn tại theo context/lifecycle, không được tự lưu thành bài làm lâu dài.

### C. Trở lại hình hiện tại — UC-BOARD-05

1. Thành viên chọn Cho nhóm trở lại trực tiếp; MAIN không có thao tác này.
2. Hệ thống kiểm ngữ cảnh board và quyền, hủy yêu cầu dừng hình đang chờ nếu có; kết thúc context hình/nét cũ.
3. Hệ thống bỏ lớp frame và nét cũ cho scope đó, hiển thị video hiện tại của nguồn được phép. Không phát lại đoạn đã bỏ qua; không ảnh hưởng board scope khác.

## Nhánh thay thế và lỗi

| Mã nhánh  | Điểm rẽ | Tình huống                                         | Phản hồi / kết quả                                                                                                                                                                                                 | Tiếp tục / kết thúc                                                                                                               |
| --------- | ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| HS-05-E01 | A1–2    | Chưa có nguồn/hình giải mã sẵn hoặc không đủ quyền | Không chốt frame; hiển thị chưa thể freeze hoặc từ chối theo quyền. Không suy ảnh đen luôn là lỗi                                                                                                                  | Kết thúc lần freeze không thành công; người dùng chỉ bắt đầu lại A1 khi có nguồn/quyền hợp lệ.                                    |
| HS-05-E02 | A2–4    | Hai người freeze cùng lúc                          | Chỉ chốt một frame/context hợp lệ; người còn lại đồng bộ kết quả hiện hành, không ghi đè bằng thao tác cũ                                                                                                          | Thao tác được chốt tiếp tục A5; thao tác còn lại kết thúc và nhận frame hiện hành, không chụp lại tự động.                        |
| HS-05-E03 | A3–4    | Nguồn đổi/dừng trước commit                        | Hủy freeze stale, báo nguồn đã thay đổi; không áp ảnh đang chờ lên nguồn mới                                                                                                                                       | Kết thúc lần freeze không thành công; nếu muốn dừng nguồn mới, người dùng chủ động thực hiện lại A1.                              |
| HS-05-E04 | A3–4    | Upload ảnh lỗi/hết hạn hoặc frame không hợp lệ     | Không báo freeze thành công, trở lại trạng thái LIVE theo nguồn và dọn ảnh tạm không còn dùng                                                                                                                      | Kết thúc lần freeze không thành công sau khi dọn ảnh tạm; có thể chủ động bắt đầu lại A1 khi đủ điều kiện.                        |
| HS-05-E05 | A/B/C   | Người dùng rời/nhóm đóng/mất quyền giữa thao tác   | Từ chối commit/đọc/vẽ/resume cũ; hủy pending và thu frame/private scope; không chuyển ảnh/nét sang MAIN                                                                                                            | Kết thúc thao tác của context cũ; chỉ dùng context mới được cấp quyền, không tự gửi lại nét/ảnh cũ.                               |
| HS-05-E06 | B       | Undo nét mình                                      | Kiểm author/context, bỏ nét gần nhất của mình; không sửa ID để xóa nét người khác                                                                                                                                  | Hoàn tác thành công thì trở về B1 để tiếp tục vẽ; nếu không có nét hợp lệ thì báo không thể hoàn tác và không thay nét.           |
| HS-05-E07 | B       | Clear context                                      | MAIN chỉ host hiện hành ở MAIN/hướng dẫn; nhóm: chủ frame còn trong scope hoặc chủ nguồn ở context LIVE, host chỉ khi đủ quyền context. Yêu cầu xác nhận, kiểm lại quyền khi thực thi, không clear board nhóm khác | Đủ quyền và xác nhận thì clear rồi trở về B1; hủy xác nhận/không đủ quyền thì không clear. Chỉ tiếp tục vẽ nếu còn quyền context. |
| HS-05-E08 | Sau A5  | Nguồn live đổi/dừng khi frame đã FROZEN            | Giữ frame và nét đã chốt trong context hợp lệ, báo nguồn cũ đã dừng khi cần; không giả frame là live hoặc tự xóa chỉ vì source đổi                                                                                 | Tiếp tục đọc/vẽ trên frame hiện hành ở B nếu muốn, hoặc người dùng chủ động bắt đầu C; không tự resume.                           |
| HS-05-E09 | C3      | Không còn nguồn share hợp lệ                       | Bỏ frame/nét cũ và hiển thị Chưa có nguồn chia sẻ; ACTIVITY không fallback MAIN                                                                                                                                    | Kết thúc UC-BOARD-05 thành công ở trạng thái chưa có nguồn, không quay lại frame đã đóng.                                         |
| HS-05-E10 | B/C     | Mất mạng hoặc thao tác tới trễ                     | Đồng bộ context/nét hiện tại khi còn quyền; nét/request của context cũ không ghi vào context mới. Không bảo đảm giữ nét sau server restart                                                                         | Đồng bộ context hiện hành: tiếp tục B hoặc bắt đầu C khi còn quyền; nếu context đã mất thì kết thúc thao tác cũ.                  |
| HS-05-E11 | Mọi lúc | Nhóm đóng hoặc lượt ACTIVITY hết giờ               | Thu board nhóm, về board MAIN riêng; không trình chiếu hoặc nhập nội dung nhóm ra phòng chung                                                                                                                      | Kết thúc thao tác board nhóm cũ; chỉ sử dụng board MAIN được phép, không tiếp tục bằng frame nhóm.                                |

## Hậu điều kiện và quy tắc

- **Freeze thành công:** cả scope thấy cùng frame, audio hợp lệ vẫn chạy; không có frame cá nhân tách khỏi board chung.
- **Vẽ thành công:** nét đúng author/context/audience; undo/clear giữ quyền như trước khi gộp vào UC vẽ.
- **Resume thành công:** context frame cũ kết thúc, scope thấy nguồn hiện tại hoặc trạng thái chưa có nguồn.
- **Bảo đảm khi lỗi:** frame/nét không vượt scope; không để thao tác pending ghi đè context/nguồn mới; ảnh tạm không có link truy cập công khai chỉ vì biết ID.
- Bút, màu, con trỏ, undo và clear theo baseline; không thêm tẩy từng điểm, hình khối, text, bảng vô hạn, CRDT, export/library. Ảnh frame tạm khác ảnh người dùng chủ động gửi chat.
- Frame do client có quyền cung cấp; kiểm quyền/định dạng không chứng minh ảnh khớp tuyệt đối với bài giảng. Đặc tả không thêm cam kết chứng thực nội dung ảnh mà baseline không có.

## Ghi chú kỹ thuật cho dev

Intent/commit, source revision, context version và author do server kiểm/gán theo board-collaboration. Preview khác nét đã chốt; lỗi thao tác cũ không được reset frame hoặc context mới. Phân loại ảnh đen không thay xác thực nguồn/quyền.

## Lợi ích và yêu cầu chất lượng liên quan

Thành viên cần cùng hình để giải thích và biết đang xem frozen/live; tác giả cần undo đúng nét mình, nhóm khác không nhận ảnh/nét riêng.

Tham chiếu [quality scenarios của technical plan](../../technical-plan.md#142-quality-scenarios): Q-03 (freeze), Q-04 (nét vẽ), Q-05 (thu quyền), Q-06 (reconnect). Đây là mục tiêu thử trong baseline, chưa là SLA hoặc số đo đã đạt; điều kiện đo và workload lấy tại nguồn, không tự tăng lên lớp 40–50 người.

## Ca review / nghiệm thu cần có

1. MAIN từ chối freeze/resume cho cả host/member. Hai DISCUSSION freeze độc lập cùng bài giảng; không pause MAIN, nhóm khác hoặc audio. MAIN host vẽ được khi người khác share; member/share owner không phải host và host cũ sau transfer bị deny. Nét thường giữ tới clear/context kết thúc; nét tạm tự biến mất theo cấu hình đã được chọn khi triển khai. Đổi/dừng nguồn MAIN xóa overlay; nhóm giữ FROZEN hợp lệ.
2. ACTIVITY freeze đúng nguồn của mình; không xem nguồn/frame nhóm khác.
3. Freeze đồng thời, nguồn đổi trong upload, mất quyền trước commit: không có frame stale thắng.
4. Nguồn dừng sau khi frozen: vẫn vẽ được khi context hợp lệ; resume báo chưa có nguồn, không giả live.
5. Undo nét người khác/clear không đủ quyền bị chặn; đóng nhóm và event trễ không công khai hoặc phục hồi board cũ.

## Nhánh riêng MAIN

Nguồn đổi/dừng: xóa overlay cũ, chặn nét stale và hiển thị nguồn mới/chưa có nguồn. Chuyển host: thu quyền vẽ/clear cũ trước khi cấp mới; không chuyển nét cũ thành nét của host mới, undo chỉ nét mình. Không thay quyền share hoặc tự cấp board nhóm. Hết quyền/context thì thao tác pending bị từ chối. Không tạo FrozenFrame hoặc file FRAME cho MAIN.
