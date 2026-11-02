# HS-06 · Chat đúng phạm vi và hỗ trợ riêng một nhóm

**Trạng thái:** bản 3 ngày 02/11/2026; giới hạn hỗ trợ trực tiếp trong nhóm cho ACTIVITY theo xác nhận người dùng, kế thừa quy tắc mic ngày 29/10. Chưa triển khai runtime. [Quy ước chung](README.md). Nguồn: [chat/host/help tại policy 8.1](../groups-media-policy.md), [group modes](../group-modes.md), [live session](../live-session.md).

## Mục tiêu và ranh giới

Thành viên hỏi đúng người/đúng nhóm bằng text hoặc ảnh; DISCUSSION được host trả lời qua chat riêng khi host ở MAIN; chỉ ACTIVITY cho host vào hỗ trợ có thông báo, trao đổi riêng rồi quay lại hướng dẫn. Chat và vào nhóm hỗ trợ là các UC độc lập; gửi tin không tự cấp quyền board hoặc tự chuyển mic/host vào nhóm.

| UC                                   | Actor chính / phối hợp                             | Trigger và kết quả                                                         |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- |
| UC-LIVE-08 · Trao đổi với Everyone   | A-03 gửi/đọc trong scope; host khi ở scope phù hợp | Người dùng gửi/đọc text và ảnh cho MAIN hoặc nhóm hiện tại                 |
| UC-LIVE-09 · Trao đổi riêng với host | A-03 người hỏi; A-07 nhận/trả lời                  | Người hỏi chọn Host; nội dung chỉ giữa người gửi và đúng host nhận         |
| UC-GRP-12 · Hỗ trợ riêng một nhóm    | A-07 host; A-03 nhóm đích                          | Host chọn vào nhóm hỗ trợ; chỉ nhận/phát với nhóm đích rồi kết thúc hỗ trợ |

**Tiền điều kiện:** chat cần phiên hoạt động, actor đang tham gia chính LiveSession đang xét và còn quyền scope/kênh; chọn Host cần có host hợp lệ. Hỗ trợ cần đúng host hiện tại đang tham gia phiên và nhóm ACTIVITY còn mở trong lượt đang hiệu lực của phiên. Không bắt buộc nhóm phải share, freeze hoặc đã gửi câu hỏi thì host mới được vào hỗ trợ.

## Điều kiện và kết quả riêng từng UC

| UC         | Điều kiện bắt đầu và trigger                                                                 | Hậu điều kiện thành công                                                                                                  | Bảo đảm khi thất bại                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| UC-LIVE-09 | Actor còn quyền, có host đích hợp lệ khi gửi; trigger gửi tại A3                             | Text/ảnh thuộc đúng hội thoại riêng, có trạng thái gửi rõ; đọc lịch sử theo ACL hiện tại                                  | Tin/ảnh lỗi hoặc đích stale không bị chuyển sang host khác/Everyone; retry không nhân bản |
| UC-GRP-12  | Actor là host hiện tại, nhóm ACTIVITY mở trong lượt còn hiệu lực; trigger chọn hỗ trợ tại B1 | Host hỗ trợ đúng nhóm rồi chủ động rời về MAIN, thu quyền nhóm; mic giữ trạng thái bật/tắt và đổi phạm vi theo nơi đang ở | Vào thất bại không mở private nhóm; mất quyền/đóng nhóm/mất mạng không tự phát mic chung  |
| UC-LIVE-08 | Actor còn quyền scope MAIN/nhóm; trigger gửi tại C2                                          | Text/ảnh được gửi/đọc trong đúng phạm vi hiện tại, không xuyên nhóm                                                       | Không đổi đích ngầm, không gửi lại bằng scope cũ sau chuyển nhóm                          |

## Luồng chính

### A. Hỏi host bằng text/ảnh — UC-LIVE-09

1. Thành viên mở chat cuộc họp và chọn đích Host; hệ thống hiển thị rõ đây là tin riêng và host đích hiện tại.
2. Thành viên nhập câu hỏi, có thể đính kèm ảnh upload hoặc ảnh canvas được phép chụp trong context hiện tại. Không bắt buộc kèm ảnh.
3. Thành viên gửi; hệ thống kiểm host đích, quyền hai bên, nội dung và ảnh tại thời điểm gửi, không dùng phạm vi nhận đã lỗi thời trên giao diện.
4. Hệ thống ghi nhận và chuyển tin tới đúng hội thoại riêng với host đích, hiển thị trạng thái gửi; chỉ hai bên hợp lệ được đọc/lấy ảnh. Host có thể trả lời bằng text/ảnh trong hội thoại này.
5. UC chat có thể hoàn tất ở đây. Tin nhắn không tự chia sẻ cả board, thay đổi scope mic hoặc đưa host vào nhóm; với ACTIVITY, host cân nhắc có cần vào hỗ trợ không; với DISCUSSION, host ở MAIN và trả lời qua chat riêng.

### B. Host vào và rời hỗ trợ — UC-GRP-12

1. Host xác định nhóm ACTIVITY cần hỗ trợ từ thông tin mình được phép xem và chọn vào hỗ trợ nhóm đó. Luồng có thể bắt đầu trực tiếp mà không thực hiện A trước.
2. Hệ thống kiểm lại host, mode ACTIVITY, lượt còn hiệu lực và nhóm còn mở; nếu host đang hỗ trợ nhóm khác, thu quyền hỗ trợ nhóm cũ trước khi cấp nhóm mới.
3. Hệ thống thông báo rõ host vào nhóm trước khi cấp quyền hỗ trợ; chỉ mở nội dung nghe/xem, chat/board của nhóm đó và phát tiếng hỗ trợ tới nhóm đó.
4. Host và các thành viên trao đổi; host xem hình/nét của nhóm khi có quyền. Tiếng hỗ trợ chỉ tới nhóm đích, không đồng thời phát sang MAIN hoặc nhóm khác.
5. Khi xong, host chủ động chọn rời nhóm hỗ trợ để về MAIN. Thao tác rời nhóm độc lập với bật/tắt mic, không yêu cầu xác nhận mic riêng.
6. Hệ thống thu quyền nhận nội dung riêng của nhóm, chuyển host về MAIN và hiển thị phạm vi hiện tại. Mic giữ nguyên trạng thái bật/tắt: nếu đang bật thì tiếng từ thời điểm chuyển phạm vi tới MAIN/DISCUSSION theo policy hướng dẫn; nếu đang tắt thì vẫn tắt. Không phát sang ACTIVITY độc lập hoặc tự quay lại nhóm hỗ trợ.

## Luồng độc lập C · Everyone — UC-LIVE-08

1. Thành viên chọn Everyone; hệ thống ghi rõ đích là phòng chung MAIN hoặc nhóm hiện tại. Host đang hỗ trợ dùng nhóm đích làm scope Everyone, ngoài hỗ trợ dùng MAIN.
2. Thành viên nhập text và/hoặc ảnh, rồi gửi.
3. Hệ thống kiểm scope/quyền/ảnh hiện tại và chuyển tin tới đúng audience, hiển thị tin/lịch sử cho người còn quyền. Không phát Everyone xuyên tất cả nhóm trong phiên.
4. Việc đọc ảnh/lịch sử vẫn kiểm quyền hiện hành; rời/đóng nhóm không giữ quyền tải tiếp. Luồng này không gọi hỗ trợ riêng hay tự gửi thông báo đến host ngoài scope.

## Nhánh lỗi và tình huống đặc biệt

| Mã nhánh  | Điểm rẽ | Tình huống                                                              | Phản hồi / kết quả                                                                                                                                 | Tiếp tục / kết thúc                                                                                                               |
| --------- | ------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| HS-06-E01 | A1/A3   | Không có host hợp lệ                                                    | Vô hiệu/báo không thể gửi tới Host; không tự đổi sang Everyone                                                                                     | Kết thúc lần gửi tới Host không thành công; chỉ bắt đầu lại A1 khi có host hợp lệ, không đổi sang Everyone.                       |
| HS-06-E02 | A2      | Đính kèm file bất kỳ hoặc ảnh không hợp lệ                              | Từ chối nội dung không hỗ trợ; chat cuộc họp chỉ text/ảnh. Không lấy quyền file của DM/kênh áp vào meeting                                         | Quay lại A2 để bỏ/thay nội dung không hợp lệ rồi chủ động gửi lại ở A3.                                                           |
| HS-06-E03 | A3 / C3 | Đổi nhóm/host khi đang soạn hoặc upload ảnh                             | Từ chối đích stale và yêu cầu người dùng xem/xác nhận đích mới trước khi gửi lại; không tự gửi private sang Everyone hoặc host khác                | Quay lại A1 hoặc C1 để người dùng xem/xác nhận đích mới rồi chủ động gửi lại; kiểm lại quyền cả ảnh, không tự chuyển tin chờ.     |
| HS-06-E04 | A3–4    | Mất mạng/không rõ kết quả gửi rồi retry                                 | Thể hiện pending/lỗi phù hợp, kiểm lại đích/quyền khi thử lại; không nhân tin do retry hoặc phát theo đích cũ                                      | Giữ kết quả gửi ở trạng thái chờ/lỗi theo xác minh; chỉ retry ở A3 sau kiểm lại đích/quyền, nhận lại tin đã ghi thay vì nhân bản. |
| HS-06-E05 | Sau A4  | Host đã đổi, gồm host tạm/hoàn quyền                                    | Hội thoại cũ vẫn gắn host nhận ban đầu theo ACL; host mới không nhận lịch sử riêng cũ. Người hỏi có thể chủ động gửi câu hỏi mới tới host hiện tại | UC gửi tới host cũ đã hoàn tất theo đích ban đầu; muốn hỏi host hiện tại phải chủ động bắt đầu lại A1.                            |
| HS-06-E06 | B2      | Nhóm là DISCUSSION/đã đóng, lượt hết hiệu lực hoặc actor không còn host | Từ chối vào/tiếp tục hỗ trợ; không cấp quyền nhóm chỉ vì còn biết ID hoặc có ảnh gửi riêng                                                         | Kết thúc lần vào/tiếp tục hỗ trợ không thành công; không quay lại B3 nếu nhóm/host không còn hợp lệ.                              |
| HS-06-E07 | B2–4    | Host chuyển từ hỗ trợ A sang B                                          | Thu media/chat/board A trước, thông báo vào B rồi cấp quyền B; không nghe đồng thời cả hai                                                         | Sau khi thu nhóm A, tiếp tục B3 cho nhóm B; nếu B không còn hợp lệ thì kết thúc lần vào B, không khôi phục quyền A từ dữ liệu cũ. |
| HS-06-E08 | B5      | Host chủ động rời nhóm khi mic đang bật hoặc tắt                        | Thu đường nhận/phát của phạm vi hỗ trợ trước khi chuyển sang MAIN; giữ nguyên trạng thái bật/tắt mic, không thêm hộp xác nhận mic                  | Tiếp tục B6 rồi kết thúc UC hỗ trợ ở MAIN. Mất mạng/đóng nhóm ngoài thao tác rời chủ động dùng HS-06-E09, không tự áp nhánh này.  |
| HS-06-E09 | B3–6    | Nhóm đóng, host mất mạng/quyền hoặc phiên kết thúc                      | Kết thúc quyền hỗ trợ; không tự phát mic global do cleanup/timeout. Thay host và hoàn quyền theo HS-01, không giữ quyền hỗ trợ của host cũ         | Kết thúc quyền hỗ trợ phiên/nhóm cũ; không tiếp tục B6 bằng quyền stale hoặc mở mic chung do cleanup.                             |
| HS-06-E10 | A/B/C   | Người hỏi rời hoặc mất quyền nhóm/kênh                                  | Tin riêng cũ theo ACL HOST_PRIVATE; quyền đọc private nhóm bị thu theo membership; không trộn hai loại lịch sử                                     | Kết thúc đọc/gửi với quyền đã mất; chỉ đọc hội thoại riêng cũ nếu ACL loại đó vẫn hợp lệ, không tự đổi loại hội thoại.            |

**Quyết định ngày 02/11/2026:** UC-GRP-12 chỉ áp ACTIVITY. DISCUSSION vẫn dùng UC-LIVE-09 để hỏi/trả lời riêng, không có nút Vào hỗ trợ; lệnh vào DISCUSSION phải bị từ chối dù actor là host hoặc đã nhận ảnh riêng. Ca nghiệm thu phải kiểm cả UI ẩn thao tác và server từ chối, không chỉ kiểm vào ACTIVITY thành công.

## Hậu điều kiện và quy tắc

- **Chat thành công:** tin và ảnh chỉ được gửi đúng conversation/audience đã kiểm tại lúc gửi; có thể đọc theo ACL hiện hành, không tự chuyển lịch sử cho host mới.
- **Hỗ trợ thành công:** host đã trao đổi đúng nhóm; khi rời không còn đường nhận nội dung nhóm, phạm vi phát mic rõ ràng.
- **Bảo đảm khi lỗi:** không tự đổi đích để gửi cho xong; không dùng ảnh riêng làm quyền truy cập cả board, không giữ đường nghe cũ khi chuyển nhóm hoặc đổi host.
- Group đóng/session kết thúc khóa lịch sử private theo nguồn. Nội dung đã được người nhận hợp lệ xem/tải không thể thu hồi khỏi thiết bị của họ; không hứa xóa ảnh chụp đã có.
- Không thêm gửi tin riêng tùy ý cho mọi participant trong meeting, file bất kỳ, thread meeting, thư viện bài làm hoặc tự broadcast câu hỏi.
- Chưa chốt toàn bộ nhánh host tạm nhiều sự cố; kết quả tại đây không ghi đè điểm mở HS-01.

## Ghi chú kỹ thuật cho dev

HOST_PRIVATE khác SESSION/GROUP; kiểm lại audience/host lúc gửi và bind attachment, giữ message dedupe. Thu quyền nhóm gồm Consumer, fanout, lịch sử, ảnh và board; khi host chủ động leave, đổi đường phát theo scope mới mà không chạy đồng thời ở hai scope.

## Lợi ích và yêu cầu chất lượng liên quan

Người hỏi cần gửi đúng đích và giữ riêng ảnh/tin; host cần chủ động vào/rời nhóm, biết rõ phạm vi đang nghe/phát.

Tham chiếu [quality scenarios của technical plan](../../technical-plan.md#142-quality-scenarios): Q-05 (thu quyền/chuyển phạm vi), Q-06 (reconnect). Đây là mục tiêu thử trong baseline, chưa là SLA hoặc số đo đã đạt; điều kiện đo và workload lấy tại nguồn, không tự tăng lên lớp 40–50 người.

## Ca review / nghiệm thu cần có

1. Everyone ở MAIN và hai nhóm độc lập; chọn Host chỉ hai bên đọc tin/ảnh, người thứ ba/admin không được đọc bằng ID.
2. Đổi scope/host khi soạn hoặc upload: từ chối đích cũ, không rò nội dung sang đích mới.
3. Host vào ACTIVITY A có thông báo, chỉ A nghe hỗ trợ; sang B thu A trước; không tự nghe mọi nhóm.
4. Chủ động rời hỗ trợ về MAIN: mic bật vẫn bật ở phạm vi MAIN/DISCUSSION, mic tắt vẫn tắt, không hỏi xác nhận riêng; mất mạng/timeout/đóng nhóm không tự áp hành vi phát chung này.
5. Host tạm và host cũ trở lại không nhận lịch sử riêng gửi cho host khác; rời/đóng scope chặn tải ảnh private theo đúng loại hội thoại.
