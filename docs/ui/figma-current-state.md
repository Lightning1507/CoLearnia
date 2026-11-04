# Figma CoLearnia — hiện trạng và kết quả kiểm

**Cập nhật:** 05/11/2026. Đây là bản ghi hiện trạng prototype sau các lượt dựng Workspace/chat, MAIN và nhóm. Dùng để tiếp tục thiết kế trong cùng file, chuẩn bị bàn giao và tránh kiểm lại mọi thứ từ đầu.

Prototype dùng dữ liệu và tương tác giả lập. Các kết quả dưới đây không chứng minh API, đăng nhập, quyền truy cập, camera/mic, media hoặc lưu trữ thật đã hoạt động. Tài liệu này ghi nhận UI; không thay nguồn nghiệp vụ và không là bảng quản lý task.

Người tiếp nhận đọc thêm [hướng dẫn bàn giao](figma-handoff.md): thứ tự hoàn thiện các màn, nguồn cần đọc theo việc, mẫu prompt và checklist trước khi giao FE.

## 1. Mở ở đâu, đọc gì trước?

- [File Figma Make hiện hành](https://www.figma.com/make/4ATlhcdwYqUYUlcRgB9jCn/D%E1%BB%B1ng-Workspace-v%C3%A0-Chat-CoLearnia): tiếp tục trong file này, không tạo app/file mới.
- [Bản public](https://twins-mark-73137923.figma.site/): xem và thử các luồng đã publish. Sau khi sửa Make, cần kiểm bản public đã nhận thay đổi chưa.
- [Brief và các prompt đã dùng](figma-make-brief.md): hướng thị giác và lịch sử yêu cầu; không chạy lại nguyên prompt cũ. Dùng quy tắc mới/lộ trình trong [bàn giao](figma-handoff.md) và kết quả hiện hành bên dưới để chọn việc tiếp theo.
- Nguồn nghiệp vụ: [Workspace](../product/workspace-channels.md), [messaging](../product/messaging.md), [LIVE](../product/live-session.md), [nhóm](../product/group-modes.md), [board](../product/board-collaboration.md), [recording](../product/recording.md).

**Lưu ý về quyết định mới:** ngày 04–05/11, người phụ trách xác nhận hướng của team: thay host tạm ngay khi server phát hiện mất kết nối; DISCUSSION đã có người tự đóng khi không còn ai kết nối; ACTIVITY cho thành viên vào lại đúng nhóm khi lượt còn mở và bỏ điều chuyển trong lượt. Một số nguồn ở checkout hiện tại còn mô tả cũ. Các mục dưới ghi rõ đích cần áp dụng theo xác nhận này; không coi prototype hoặc bản tài liệu cũ là quyết định thay thế.

## 2. Cách hiểu trạng thái

| Nhãn             | Ý nghĩa                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| Đã thấy          | Có màn/nút/nội dung trên UI; chưa đủ để kết luận luồng hoạt động đúng        |
| Đã thử — đạt     | Đã thao tác và thấy kết quả phù hợp, trong phạm vi bước thử được ghi         |
| Đã thử — cần sửa | Đã thao tác và thấy khác yêu cầu đã chốt                                     |
| Chưa kiểm        | Chưa thử hoặc chưa đủ bằng chứng; không đồng nghĩa chưa được dựng            |
| Chưa thấy        | Chưa thấy trong các màn đã mở; cần xác nhận trước khi kết luận thiếu toàn bộ |

Lượt kiểm sau prompt sửa 6 điểm ngày 05/11 thực hiện trên preview Make. Bản public mở mới vẫn có camera bật ở prejoin, trong khi preview đã tắt: public chưa đồng bộ với bản đang kiểm. Các kết quả trước lượt sửa được giữ để tham khảo, không dùng thay kết quả preview mới ở mục 4–5.

## 3. Những gì hiện có

### Workspace và chat

Hướng thiết kế: cấu trúc Workspace của Slack, bố cục họp của Meet, cách tiết chế của Linear. Workspace nền sáng, vùng media nền tối; cùng hệ thống component. Giữ cách phân cấp nội dung này khi bổ sung màn mới.

| Khu vực      | Hiện trạng quan sát                                                      | Kiểm tra còn cần                                      |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Workspace    | Sidebar kênh trò chuyện, phòng LIVE, DM; thông tin người dùng phía dưới  | Chuyển Workspace, trạng thái rỗng và quyền quản trị   |
| Kênh TEXT    | `general`, kênh khác và kênh PRIVATE có biểu tượng khóa                  | Quyền nhìn thấy/sử dụng kênh theo vai trò             |
| Hội thoại    | Dòng tin nhắn, ảnh, thẻ file, dấu gửi/chưa gửi/thử lại trong dữ liệu mẫu | Gửi/retry và attachment thực trong prototype          |
| Thread       | Có điểm mở thread từ tin nhắn trong kênh                                 | Reply đúng root; DM không có thread                   |
| DM           | Có danh sách người để chọn hội thoại riêng                               | Text/ảnh/file và các trạng thái gửi                   |
| Công cụ demo | Chọn vai trò/tình huống ngoài nội dung sản phẩm                          | Không để công cụ demo bị hiểu thành quyền tự đổi role |

Những mục này đã xuất hiện trong các lượt xem trước. Lượt 05/11 tập trung LIVE/nhóm, chưa kiểm lại trọn bộ Workspace/chat; không đánh dấu các luồng trên là đạt chỉ từ hình ảnh.

### Vào LIVE và phòng chung

| Khu vực           | Hiện trạng / kết quả gần nhất                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Vào phòng         | Kênh LIVE → Vào phòng → kiểm tra thiết bị → Tham gia cuộc họp đã đi được                                                           |
| Kiểm tra thiết bị | Có trạng thái mic/camera, nút bật/tắt; mô phỏng, không gọi thiết bị thật. Preview đã tắt camera mặc định; public còn trạng thái cũ |
| MAIN              | Khung share lớn, camera bên phải, thanh mic/camera/share/người tham gia/chat/rời phía dưới                                         |
| Nguồn đang share  | Hiện tên người share; khi người khác share, nút bắt đầu share bị vô hiệu                                                           |
| Âm lượng          | Có âm lượng cuộc họp và nguồn share, ghi rõ chỉ ảnh hưởng người nghe trên thiết bị này; chưa kiểm tác dụng âm thanh                |
| Board MAIN        | Không còn nút freeze. Khi là host có bút, màu, nét tự ẩn, undo và clear; member không thấy công cụ vẽ                              |
| Chat cuộc họp     | Có panel riêng, đích gửi Everyone theo phòng/Host riêng tư, composer text/ảnh. Chưa kiểm lại đầy đủ lỗi layout trước đây           |
| Demo              | Có chọn host/member, nguồn share và kết nối; không là media/auth thật                                                              |

Nét tự ẩn đang có minh họa thời gian trên UI. Đây chỉ là giá trị demo; team chưa chốt thời gian/fade của sản phẩm.

### Nhóm trao đổi — DISCUSSION

- Preview đã tạo nhóm ngay, không chờ host duyệt; nhóm mới hiển thị chưa có người vào, số đang ở nhóm tách số được vào. Thành viên vẫn tự bấm Vào nhóm.
- Trong nhóm có nguồn MAIN, phạm vi mic nhóm, hai mức âm lượng và tạm dừng hình của nhóm; không có share riêng. Host không có Vào hỗ trợ DISCUSSION.
- Đã thử người duy nhất disconnect: về MAIN, nhóm đóng; reconnect không có nút vào lại nhóm cũ.
- Đã thử khi còn Khoa trong nhóm: người thử disconnect/reconnect về MAIN, nhóm vẫn mở với 1 người; bấm vào lại thành công, số người tăng thành 2.
- Ca người cuối chủ động rời đã đạt ở lượt trước; chưa lặp lại sau prompt sửa.

### Nhóm hoạt động — ACTIVITY và hỗ trợ

- Preview đã có chọn người, chọn 2/3/4 nhóm cho bộ dữ liệu mẫu, chia thủ công/random, chia lại và chỉnh thành viên trước start. Host hiện hành không nằm trong danh sách phân nhóm thường.
- Đã thử random 4 người vào 3 nhóm: kết quả 2–1–1, không trùng người; chỉnh Gia Khoa sang nhóm khác được. Quay về 2 nhóm và chia lại để bắt đầu lượt thử.
- Start khi còn DISCUSSION có bước xác nhận đóng các nhóm trao đổi. Khi lượt chạy, panel host chỉ hiện nhóm và Vào hỗ trợ; không còn random/điều chuyển/kết thúc ACTIVITY thủ công.
- Host ở MAIN, vào hỗ trợ A được; nhãn/mic đúng nhóm, nhóm chưa share không lấy nguồn MAIN thay thế.
- Đã thử thành viên vào A → về MAIN sớm → vào lại A; không có chọn nhóm khác. Bộ demo đổi vai trò cũng thay dữ liệu phân nhóm, chưa kiểm mọi trường hợp đổi host khi ACTIVITY đang chạy.
- Đã dùng nút demo hết giờ: về MAIN, mic tắt, không còn vào lại lượt cũ. Chưa chờ countdown tự chạy đủ 15 phút.

### Ghi hình và các màn còn lại

Chưa thấy điều khiển recording trong MAIN đã mở. Chưa kiểm các màn đăng ký/đăng nhập, hồ sơ/avatar/đổi mật khẩu, lời mời, quản trị Workspace/thành viên và quyền PRIVATE. Cần lập danh sách màn trước khi gửi lượt bổ sung; chưa kết luận tất cả đều chưa được dựng.

## 4. Kết quả kiểm sau prompt sửa 6 điểm

Ngày 05/11/2026, thao tác trên preview Make. Không gửi thêm prompt hoặc publish trong lượt kiểm này.

| Ca thử                                                 | Kết quả                                                            | Kết luận                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------ |
| Mở mới prejoin                                         | Camera tắt, nút Bật camera và mô tả khớp                           | Đạt trên preview; public còn cũ                  |
| Tạo DISCUSSION hợp lệ                                  | Tạo ngay, 0 người đang ở / 2 người được vào, không hàng chờ duyệt  | Đạt                                              |
| Người duy nhất vào DISCUSSION rồi disconnect/reconnect | Về MAIN, nhóm đóng, không còn vào lại                              | Đạt                                              |
| Khoa vào trước, người thử vào rồi disconnect/reconnect | Về MAIN; nhóm còn 1 người; chủ động vào lại thành 2                | Đạt                                              |
| Random 4 người vào 3 nhóm                              | 2–1–1, đủ 4 người; chỉnh phân nhóm được trước start                | Đạt ca đã thử                                    |
| Kiểm danh sách phân ACTIVITY khi là host               | Chỉ 4 người còn lại, không có Minh Anh là host                     | Đạt                                              |
| Bắt đầu ACTIVITY khi có DISCUSSION                     | Có xác nhận đóng DISCUSSION; host ở MAIN, nhóm hoạt động hiển thị  | Đạt                                              |
| Host vào hỗ trợ A                                      | Nhãn/mic thuộc A; nguồn nhóm trống, không fallback MAIN            | Đạt hiển thị ngữ cảnh                            |
| Member vào A → về MAIN → vào lại                       | Vào lại đúng A khi lượt còn mở                                     | Đạt                                              |
| Nút demo hết giờ                                       | Về MAIN, mic tắt; panel không còn vào lại ACTIVITY cũ              | Đạt mô phỏng; chưa chờ deadline thật             |
| Host gốc Lan Chi disconnect                            | Chuyển ngay sang Gia Khoa là host tạm, không đếm chờ               | Đạt hiển thị chuyển host                         |
| Host tạm Gia Khoa disconnect, rồi host gốc quay lại    | Host tạm tiếp theo Minh Anh; quay lại hoàn quyền Lan Chi           | Đạt chuỗi tên/nhãn; quyền Minh Anh còn lỗi ở F05 |
| Chính người thử là host rồi mô phỏng mất kết nối       | Nhãn chuyển sang member, host tạm là người khác, toolbar vẽ bị thu | Đạt ca thu quyền host cũ                         |

“Đạt” chỉ áp dụng cho bước đã thử, không đại diện cả feature. Thấy phạm vi mic chưa chứng minh audio cách ly; random một lần chưa chứng minh phân phối thống kê; mô phỏng deadline không thay timer/backend thực.

## 5. Trạng thái sáu điểm và phần còn lại

| Mục                          | Trạng thái preview sau sửa      | Lưu ý                                                                                                  |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| F01 — Tạo DISCUSSION         | Đã thử — đạt                    | Không cần host duyệt                                                                                   |
| F02 — DISCUSSION mất kết nối | Đã thử — đạt                    | Cả nhóm rỗng sau khi đã có người và nhóm còn người                                                     |
| F03 — Random ACTIVITY        | Đã thử — đạt ca chính           | Có chọn người/số nhóm, chia lại và chỉnh preview; không thấy điều chuyển khi chạy                      |
| F04 — Host trong ACTIVITY    | Đã thử — đạt ca chính           | Host không trong roster thường, vào hỗ trợ được; member về sớm/vào lại và hết giờ đã thử               |
| F05 — Host tạm               | Đạt một phần — còn lỗi quyền UI | Chuyển tên ngay và hoàn quyền đúng; khi Minh Anh được bầu host tạm trong demo Member, UI vẫn là member |
| F06 — Camera trước khi vào   | Đã thử — đạt trên preview       | Public vẫn camera bật ở prejoin trong lần mở mới                                                       |

**F05 còn cần sửa:** đã thử Lan Chi mất kết nối → Gia Khoa tạm → Gia Khoa mất kết nối → Minh Anh tạm. Header/ô camera ghi “Host tạm: Minh Anh” nhưng đồng thời ghi “Bạn là thành viên”; panel Nhóm vẫn là form tạo DISCUSSION của member, không có Tổ chức hoạt động nhóm và không có toolbar vẽ. Cần để quyền UI theo host hiện hành, không chỉ theo lựa chọn vai trò demo. Đã thử hoàn quyền Lan Chi thành công; chưa kiểm chuyển host chính thức trong lượt này.

**Chữ cũ còn sót, mức ưu tiên thấp:** mô tả form còn “Chuẩn bị hai nhóm” dù đã chọn 3 nhóm; thông báo trong lượt ACTIVITY còn chữ “duyệt” nhóm trao đổi. Không cản demo flow chính, ghi để chỉnh cùng đợt sau.

**Public cần cập nhật:** không dùng public hiện tại để kết luận 6 điểm đã sửa. Người phụ trách cập nhật bản publish từ Make khi sẵn sàng, rồi kiểm lại các ca chính. Lượt này chỉ review, chưa publish.

## 6. Những phần cần kiểm ở lượt tiếp theo

Ưu tiên kiểm các ca có thể làm người xem hiểu sai nghiệp vụ, không cần rà từng pixel cho bản show team.

- Sửa phần quyền UI của host tạm ở F05; khi publish bản mới, đối chiếu lại các ca chính trên public. F01–F04/F06 đã thử đạt theo mục 4, không cần kiểm lại từ đầu nếu không có thay đổi liên quan.
- ACTIVITY: về MAIN sớm → chủ động vào lại đúng nhóm khi lượt còn mở; không có điều chuyển trong lượt. Hết giờ → về MAIN, mic tạm tắt; không còn vào lại lượt cũ.
- Board nhóm: freeze chung → vẽ → resume; DISCUSSION dùng bài giảng MAIN, ACTIVITY dùng nguồn của nhóm; nét nhóm không công khai ra MAIN.
- Share: nguồn trống/mình share/người khác share; hủy chọn màn hình; dừng/đổi nguồn xóa overlay LIVE. Đây là mô phỏng UI, không thay PoC media.
- Chat: Everyone đúng phòng, Host đúng người, text/ảnh và layout khi mở panel; không rò nháp/lịch sử riêng khi đổi host/phòng. Ca nháp text hỗ trợ A → MAIN thuộc lượt kiểm trước, chưa kiểm lại đầy đủ sau prompt sửa 6 điểm.
- Host: chuyển quyền trực tiếp; rời khi còn host kết thúc cho mọi người; hủy xác nhận không kết thúc.
- Recording: bổ sung/kiểm riêng nút host ghi/dừng, chỉ báo mọi người, xử lý/sẵn sàng/lỗi và nơi xem video. Chỉ MAIN; không tự chọn quota/retention/quyền xóa.
- Workspace và các màn M1/M2 còn lại: kiểm hiện có trước khi bổ sung, tránh dựng trùng. Đối chiếu hồ sơ/avatar/đổi mật khẩu, lời mời và quản trị theo nguồn hiện hành.
- Bố cục desktop 1440×900 và 1280×800: mở panel vẫn đọc được share/chat và dùng được mic/camera/rời. Chưa nghiệm thu responsive từ lượt kiểm này.

## 7. Cách cập nhật và bàn giao

Mỗi đợt sửa Make, cập nhật file này cùng ngày:

1. Ghi phần đã yêu cầu Make sửa; chỉ đổi trạng thái sang đạt sau khi đã thử preview.
2. Sửa hiện trạng ở mục 3–5 theo kết quả mới; ghi rõ preview hay public và ngày kiểm. Không để lỗi đã sửa tiếp tục nằm trong danh sách hiện hành.
3. Giữ các phần chưa kiểm; nếu chỉ thấy nút thì ghi “Đã thấy”, không ghi hoàn tất.
4. Khi có quyết định nghiệp vụ mới, dẫn nguồn đã cập nhật hoặc xác nhận của người phụ trách; không lấy UI sinh ra làm quyết định sản phẩm.
5. Ghi lịch sử ngắn ở bảng dưới. Theo dõi owner/deadline/task trên công cụ quản lý dự án của team, không thêm bảng sprint ở đây.

Khi giao người khác tiếp tục: gửi file Make, tài liệu này và brief; nêu đợt sửa tiếp theo. Chỉ nạp nguồn nghiệp vụ liên quan vào Make. Giữ UI/component đang có, không thiết kế lại toàn bộ. Không nối API/media/storage thật hoặc thay dependency của repo trong task dựng prototype.

Không cần mở lại toàn bộ Figma mỗi phiên. Dùng bản ghi để chọn đúng màn cần kiểm; vẫn phải mở preview khi thay đổi luồng, xác nhận sửa lỗi hoặc khi Make/public đã đổi sau lần ghi nhận gần nhất.

| Ngày                        | Thay đổi / kiểm tra                                                                                                        | Giới hạn                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 05/11/2026                  | Lập bản ghi Workspace, LIVE, DISCUSSION, ACTIVITY; ghi các ca đã thử và F01–F06                                            | Workspace dựa trên quan sát trước; chỉ lỗi chờ duyệt DISCUSSION đối chiếu cả Make/public; chưa gửi prompt sửa mới |
| 05/11/2026 — sau prompt sửa | Kiểm preview: F01–F04/F06 đạt các ca chính; F05 chuyển/hoàn tên đúng nhưng còn lỗi quyền host tạm; ghi public chưa đồng bộ | Chưa publish, chưa dùng thêm credit; timer dùng nút demo hết giờ; chưa kiểm media thật hoặc recording             |
