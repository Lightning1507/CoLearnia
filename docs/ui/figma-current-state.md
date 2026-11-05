# Figma CoLearnia — hiện trạng và kết quả kiểm

**Cập nhật sau rà soát tổng thể: 05/11/2026. UI chưa hoàn thiện toàn diện.** Đã có các màn và luồng chính A–E, nhưng còn thiếu một số nhánh nghiệp vụ và nhiều ca chưa kiểm. Đọc **mục 19** để biết kết luận, độ phủ yêu cầu và thứ tự hoàn thiện; mục 4 và 7–18 giữ lịch sử/bằng chứng, không phải danh sách việc hiện hành. Make version gần nhất là **v14**; các sửa C/D/E nằm trong code editor sau v14, chưa publish.

Prototype dùng dữ liệu và tương tác giả lập. Các kết quả dưới đây không chứng minh API, đăng nhập, quyền truy cập, camera/mic, media hoặc lưu trữ thật đã hoạt động. Tài liệu này ghi nhận UI; không thay nguồn nghiệp vụ và không là bảng quản lý task.

Người tiếp nhận đọc thêm [hướng dẫn bàn giao](figma-handoff.md): thứ tự hoàn thiện các màn, nguồn cần đọc theo việc, mẫu prompt và checklist trước khi giao FE.

## 1. Mở ở đâu, đọc gì trước?

- [File Figma Make hiện hành](https://www.figma.com/make/4ATlhcdwYqUYUlcRgB9jCn/D%E1%BB%B1ng-Workspace-v%C3%A0-Chat-CoLearnia): tiếp tục trong file này, không tạo app/file mới.
- [Bản public](https://twins-mark-73137923.figma.site/): xem và thử các luồng đã publish. Sau khi sửa Make, cần kiểm bản public đã nhận thay đổi chưa.
- [Brief và các prompt đã dùng](figma-make-brief.md): hướng thị giác và lịch sử yêu cầu; không chạy lại nguyên prompt cũ. Dùng quy tắc mới/lộ trình trong [bàn giao](figma-handoff.md) và kết quả hiện hành bên dưới để chọn việc tiếp theo.
- Nguồn nghiệp vụ: [Workspace](../product/workspace-channels.md), [messaging](../product/messaging.md), [LIVE](../product/live-session.md), [nhóm](../product/group-modes.md), [board](../product/board-collaboration.md), [recording](../product/recording.md).

**Lưu ý về quyết định mới:** ngày 04–05/11, người phụ trách xác nhận hướng của team: thay host tạm ngay khi server phát hiện mất kết nối; DISCUSSION đã có người tự đóng khi không còn ai kết nối; ACTIVITY cho thành viên vào lại đúng nhóm khi lượt còn mở và bỏ điều chuyển trong lượt. Các quy tắc này đã có trong nguồn product sau merge main ngày 05/11; prompt lịch sử không ghi đè nguồn hiện hành.

**Đối chiếu sau merge main 05/11:** recording đã chốt mỗi đoạn tối đa 3 tiếng, READY giữ vô thời hạn, đổi host vẫn ghi tiếp và danh sách xem lại chỉ READY. Kế hoạch UI đã cập nhật tại [bàn giao, đợt D](figma-handoff.md). Đã dựng/kiểm recording mô phỏng ở mục 17–18; chưa có recorder/video/âm thanh/storage thật. A1/F05 ở mục 8 và hồi quy mới nhất ở mục 18.

## 2. Cách hiểu trạng thái

| Nhãn             | Ý nghĩa                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| Đã thấy          | Có màn/nút/nội dung trên UI; chưa đủ để kết luận luồng hoạt động đúng        |
| Đã thử — đạt     | Đã thao tác và thấy kết quả phù hợp, trong phạm vi bước thử được ghi         |
| Đã thử — cần sửa | Đã thao tác và thấy khác yêu cầu đã chốt                                     |
| Chưa kiểm        | Chưa thử hoặc chưa đủ bằng chứng; không đồng nghĩa chưa được dựng            |
| Chưa thấy        | Chưa thấy trong các màn đã mở; cần xác nhận trước khi kết luận thiếu toàn bộ |

Mục 4 giữ lịch sử lượt kiểm sau prompt sửa 6 điểm; kết quả A1 ở mục 8, các lượt tiếp và hồi quy mới nhất ở mục 10–18. Các lượt đều thực hiện trên preview Make. Bản public mở mới vẫn có camera bật ở prejoin, trong khi preview đã tắt: public chưa đồng bộ với bản đang kiểm. Các kết quả trước lượt sửa được giữ để tham khảo, không dùng thay kết quả preview mới ở mục 4–5.

## 3. Những gì hiện có

### Workspace và chat

Hướng thiết kế: cấu trúc Workspace của Slack, bố cục họp của Meet, cách tiết chế của Linear. Workspace nền sáng, vùng media nền tối; cùng hệ thống component. Giữ cách phân cấp nội dung này khi bổ sung màn mới.

| Khu vực             | Hiện trạng đã tự thử                                                                                                                               | Còn kiểm / giới hạn                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tài khoản/Workspace | Đăng nhập lỗi/thử lại, đăng ký tự login, danh sách rỗng, tạo Owner/general trống, chuyển Workspace tách dữ liệu                                    | Auth thật/nhiều tài khoản và toàn bộ lỗi chưa kiểm                                   |
| Lời mời             | Qua đăng ký quay đúng invite, chưa autojoin; xác nhận/đã member/rejoin; link tắt lúc xác nhận bị chặn                                              | Login từ invite, link cũ/Workspace không còn và Hủy chưa đủ ma trận                  |
| Hồ sơ/mật khẩu      | Tên Lưu/Hủy; email chỉ đọc; sai mật khẩu giữ phiên, thành công về login                                                                            | Chọn/thay/xóa avatar và thu nhiều phiên thật chưa kiểm                               |
| Quản trị            | Member chỉ xem; Owner cấp Admin; Admin không cấp Admin/loại Owner/Admin; loại Member; tắt/tạo lại link                                             | Copy, gỡ Admin, các race và mọi tổ hợp quyền chưa kiểm                               |
| Kênh/PRIVATE        | Tạo TEXT/PRIVATE và LIVE, đổi tên, thu quyền về kênh còn quyền; xóa general không tái tạo; Owner xóa Workspace demo không ảnh hưởng Workspace khác | Thêm lại PRIVATE/mọi nhánh Admin và server ACL chưa kiểm                             |
| Chat TEXT/DM/thread | DM lỗi/retry cùng một tin, DM không thread; reply TEXT chỉ ở thread, tăng đếm một lần                                                              | Ảnh/file/avatar picker không mở trong phiên điều khiển; chưa coi upload/download đạt |
| Công cụ demo        | Vai trò, mất quyền, lỗi và deadline tách khỏi control sản phẩm                                                                                     | Chỉ tạo tình huống, không phải cơ chế tự cấp quyền thật                              |

Các kết quả trên là bước đã thao tác cụ thể, không phải nghiệm thu đầy đủ tất cả feature. Nguồn/cách thử/bằng chứng ở mục 10–18.

### Vào LIVE và phòng chung

| Khu vực           | Hiện trạng / kết quả gần nhất                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Vào phòng         | Kênh LIVE → Vào phòng → kiểm tra thiết bị → Tham gia cuộc họp đã đi được                                                           |
| Kiểm tra thiết bị | Có trạng thái mic/camera, nút bật/tắt; mô phỏng, không gọi thiết bị thật. Preview đã tắt camera mặc định; public còn trạng thái cũ |
| MAIN              | Khung share lớn, camera bên phải, thanh mic/camera/share/người tham gia/chat/rời phía dưới                                         |
| Nguồn đang share  | Hiện tên người share; khi người khác share, nút bắt đầu share bị vô hiệu                                                           |
| Âm lượng          | Có âm lượng cuộc họp và nguồn share, ghi rõ chỉ ảnh hưởng người nghe trên thiết bị này; chưa kiểm tác dụng âm thanh                |
| Board MAIN        | Không còn nút freeze. Khi là host có bút, màu, nét tự ẩn, undo và clear; member không thấy công cụ vẽ                              |
| Chat cuộc họp     | Có panel Everyone/đúng host, đã sửa nháp/lịch sử khi đổi host và kiểm text; ảnh/picker/layout đầy đủ còn giới hạn ở mục 10/16/18   |
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
- Đã kiểm countdown thật 1 phút khi thành viên còn trong nhóm (A3), và khi host đang hỗ trợ (E2): về MAIN, mic tắt, camera giữ trạng thái; recording MAIN tiếp tục. Chưa chờ đủ 15/120 phút.
- Quyết định mới: mỗi nhóm cần ít nhất một thành viên hợp lệ trước start; đã thử draft 2–2–0 bị khóa và random 2–1–1 mở Bắt đầu. Không tự phân người hộ để làm hợp lệ.

### Ghi hình và các màn còn lại

Đã bổ sung các màn tài khoản, lời mời, hồ sơ/mật khẩu, quản trị và recording trong cùng file, dùng component đang có. Recording có control host MAIN/trạng thái/mốc 3 giờ, danh sách READY theo kênh/phiên và player tương tác giả lập; đã thử các ca ở mục 17–18. Avatar/ảnh/tệp và các nhánh chưa kiểm vẫn giữ nhãn chưa kiểm, không gọi toàn bộ màn đã nghiệm thu.

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

| Mục                          | Trạng thái preview sau sửa | Lưu ý                                                                                                                                        |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 — Tạo DISCUSSION         | Đã thử — đạt               | Không cần host duyệt                                                                                                                         |
| F02 — DISCUSSION mất kết nối | Đã thử — đạt               | Cả nhóm rỗng sau khi đã có người và nhóm còn người                                                                                           |
| F03 — Random ACTIVITY        | Đã thử — đạt ca chính      | Có chọn người/số nhóm, chia lại và chỉnh preview; không thấy điều chuyển khi chạy                                                            |
| F04 — Host trong ACTIVITY    | Đã thử — đạt ca chính      | Host không trong roster thường, vào hỗ trợ được; member về sớm/vào lại và hết giờ đã thử                                                     |
| F05 — Host tạm               | Đã thử — đạt các ca A1/E2  | Host tạm có control thực, thu control/dialog khi mất quyền; v10 thu help ngoài roster về MAIN/mic tắt/camera giữ nguyên. Giới hạn tại mục 8. |
| F06 — Camera trước khi vào   | Đã thử — đạt trên preview  | Public vẫn camera bật ở prejoin trong lần mở mới                                                                                             |

**F05 hiện hành:** v9/v10 và sửa disconnect sau v14 đã được tự kiểm trên preview (mục 8/18): người xem được bầu host tạm nhận control đúng scope; thao tác vẽ/clear thực hiện được; mất host thu toolbar/dialog. V10 đã sửa nhánh người hỗ trợ ngoài roster mất host: về MAIN, mic tạm tắt, camera giữ bật khi trước đó đã bật, không giữ quyền nhóm hoặc chuyển help cho host mới. Không gọi đây là nghiệm thu failover/media thật; các nhánh chưa kiểm độc lập ghi ở mục 8.

**Chữ cũ:** đã đổi “Chuẩn bị hai nhóm” thành “Chuẩn bị các nhóm”, bỏ chữ “duyệt” ở ACTIVITY; giải thích ảnh đại diện và xóa nét bằng câu dễ hiểu hơn. Chưa coi toàn bộ copy đã được rà từng màn.

**Public chưa cập nhật:** không dùng public hiện tại để kết luận 6 điểm đã sửa. Người phụ trách cập nhật bản publish từ Make khi sẵn sàng, rồi kiểm lại các ca chính. Lượt này chỉ review, chưa publish.

## 6. Những phần cần kiểm ở lượt tiếp theo

**Hiện hành:** đọc mục 19 và handoff mục 5.1; không chạy lại A–E từ đầu.

1. R1: tái hiện chat riêng giữa người trong nhóm và host MAIN; vào LIVE khác khi đang có call. Phát hiện từ mã, chưa gọi là lỗi đã tái hiện.
2. R2: bổ sung ưu tiên hướng dẫn chung, nhánh ACTIVITY start lỗi/đang hủy và tải lịch sử từng trang.
3. R3: thu quyền/resync khi reconnect, quản trị PRIVATE và các nhánh host chưa kiểm.
4. R4: ảnh/tệp/avatar, ca quản trị còn thiếu và lỗi/trạng thái recording. Picker bị chặn phải ghi rõ, không tự đánh dấu đạt.
5. R5: rà tất cả màn/panel ở desktop, chữ dài/focus/bàn phím/loading/lỗi và hành trình xuyên suốt sau sửa cuối.
6. R6: team review/chốt thiết kế, bàn giao FE; chỉ publish khi được giao rồi kiểm public riêng.

Bằng chứng đã thử giữ ở mục 8–18. Prototype không chứng minh auth/media/ACL/storage thật; phần đó thuộc kiểm tích hợp ứng dụng, không phải lý do dựng lại UI đã có.

## 7. Cách cập nhật và bàn giao

Mỗi đợt sửa Make, cập nhật file này cùng ngày:

1. Ghi phần đã yêu cầu Make sửa; chỉ đổi trạng thái sang đạt sau khi đã thử preview.
2. Sửa hiện trạng ở mục 3–5 theo kết quả mới; ghi rõ preview hay public và ngày kiểm. Không để lỗi đã sửa tiếp tục nằm trong danh sách hiện hành.
3. Giữ các phần chưa kiểm; nếu chỉ thấy nút thì ghi “Đã thấy”, không ghi hoàn tất.
4. Khi có quyết định nghiệp vụ mới, dẫn nguồn đã cập nhật hoặc xác nhận của người phụ trách; không lấy UI sinh ra làm quyết định sản phẩm.
5. Ghi lịch sử ngắn ở bảng dưới. Theo dõi owner/deadline/task trên công cụ quản lý dự án của team, không thêm bảng sprint ở đây.

Khi giao người khác tiếp tục: gửi file Make, tài liệu này và brief; nêu đợt sửa tiếp theo. Chỉ nạp nguồn nghiệp vụ liên quan vào Make. Giữ UI/component đang có, không thiết kế lại toàn bộ. Không nối API/media/storage thật hoặc thay dependency của repo trong task dựng prototype.

Không cần mở lại toàn bộ Figma mỗi phiên. Dùng bản ghi để chọn đúng màn cần kiểm; vẫn phải mở preview khi thay đổi luồng, xác nhận sửa lỗi hoặc khi Make/public đã đổi sau lần ghi nhận gần nhất.

| Ngày                        | Thay đổi / kiểm tra                                                                                                                                                                    | Giới hạn                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 05/11/2026                  | Lập bản ghi Workspace, LIVE, DISCUSSION, ACTIVITY; ghi các ca đã thử và F01–F06                                                                                                        | Workspace dựa trên quan sát trước; chỉ lỗi chờ duyệt DISCUSSION đối chiếu cả Make/public; chưa gửi prompt sửa mới |
| 05/11/2026 — sau prompt sửa | Kiểm preview: F01–F04/F06 đạt các ca chính; F05 chuyển/hoàn tên đúng nhưng còn lỗi quyền host tạm; ghi public chưa đồng bộ                                                             | Chưa publish, chưa dùng thêm credit; timer dùng nút demo hết giờ; chưa kiểm media thật hoặc recording             |
| 05/11/2026 — A1, v9/v10     | Sửa và tự kiểm quyền MAIN của host tạm; phát hiện/nhờ người phụ trách chốt nhánh mất help ngoài roster, sửa và kiểm lại MAIN/mic tắt/camera giữ bật; thêm bằng chứng và nguồn LIVE 8.3 | Chưa publish; prototype và thao tác UI, chưa media thật; nhánh chưa kiểm độc lập ghi mục 8.                       |

## 8. Lượt A1 — quyền host tạm (05/11/2026)

**Nhánh:** `feat/ui-figma-host-permissions`, từ `origin/main` tại `e1ea319`. Cùng file Make ở mục 1; không dựng lại app. Phạm vi theo [bàn giao A1](figma-handoff.md#chia-từng-đợt-thành-lượt-làm-cụ-thể), [host hiện hành](../product/live-session.md#83-chuyển-host-và-host-mất-mạng). Chỉ code prototype trong Make, không đưa code app/generated vào repo.

### Trước sửa và prompt A1

Preview v8 tái hiện: demo Thành viên → host gốc Lan Chi disconnect → random Thảo Vy → Gia Khoa → Hoàng Nam → Minh Anh tạm. Header/badge nhận host tạm nhưng vẫn là member, không toolbar MAIN hoặc tổ chức ACTIVITY. Thứ tự tên chỉ là kết quả quan sát, không là quy tắc kế vị.

Đã gửi một prompt yêu cầu quyền theo host hiện hành/kết nối/phòng/phase, đồng bộ header/menu/toolbar/action và thu dialog khi mất quyền. Giữ random, mic/camera, countdown, roster và layout; không backend/media thật/dependency/recording/publish. Make tạo **version 9 — Fix temporary host UI permissions**, báo chỉ đổi `src/App.tsx` (+45/−26) và build đạt. Đây là kết quả Make báo; ca tự kiểm bên dưới mới là bằng chứng review độc lập.

### Tự kiểm preview v9 sau sửa

Mở preview mới từ nút Preview của editor; chờ preview chuyển từ cached sang bản chạy trước thao tác. Chỉ dữ liệu mô phỏng. Đã đổi viewport trình duyệt 1440×900 và 1280×800; app vẫn nằm trong khung thiết bị của Figma, chưa coi là nghiệm thu responsive của web thực.

| Ca                           | Bước và kết quả thực thấy                                                                                                                                                                                                                             | Kết luận                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Member thường                | Vào LIVE/lobby bằng Thành viên: camera tắt; MAIN không toolbar, panel Nhóm là form DISCUSSION, không tổ chức ACTIVITY.                                                                                                                                | Đạt ca đã thử                                    |
| Chính người xem làm host tạm | Lan Chi mất kết nối → Gia Khoa tạm → Minh Anh tạm. Demo vẫn Member; header có quyền host, có bút/clear và tổ chức hoạt động.                                                                                                                          | Đạt, không chỉ đổi badge                         |
| Vẽ và clear                  | Chọn bút, thao tác trên vùng slide: undo/clear bật; mở xác nhận và Xóa toàn bộ: undo/clear tắt lại.                                                                                                                                                   | Đạt thao tác UI; chưa media thật                 |
| Hoàn quyền giữa dialog       | Host tạm mở Tổ chức hoạt động → host gốc Lan Chi quay lại: dialog tự đóng, toolbar/organize bị thu, member không tiếp tục action cũ.                                                                                                                  | Đạt                                              |
| Chính host disconnect        | Demo host Minh Anh mở dialog → mô phỏng mất kết nối: Thảo Vy tạm, Minh Anh mất toolbar/dialog. Restore trả đúng Minh Anh.                                                                                                                             | Đạt                                              |
| Chuyển chính thức            | Gán Gia Khoa: đổi ngay, không accept; sau Gia Khoa mất mạng và quay lại, hoàn về Gia Khoa, không về Minh Anh.                                                                                                                                         | Đạt chuỗi đã thử; chưa rà mọi ứng viên offline   |
| ACTIVITY đang chạy           | Minh Anh start 15 phút/2 nhóm, mỗi nhóm 2 người → gán Khoa → Khoa disconnect → Minh Anh tạm. Countdown tiếp tục 14:43 rồi 14:34; nhóm/số người không đổi; chỉ có Vào hỗ trợ, không organize/random/điều chuyển/end lượt thủ công. Mic/camera vẫn tắt. | Đạt nhánh điều hành đã thử; chưa chờ đủ deadline |
| Scope hỗ trợ                 | Host tạm vào A: nhãn/mic thuộc A, nguồn nhóm trống, không fallback MAIN/toolbar MAIN. Restore Gia Khoa: quyền host bị thu nhưng Minh Anh vẫn ở A ngoài roster và nhãn help bị giữ cho host mới.                                                       | Cần sửa nhánh thu help                           |

Ảnh preview: [v9 host tạm có control MAIN](evidence/2026-11-05-f05-v9-host-controls.jpg), [v9 còn lỗi thu help khi restore](evidence/2026-11-05-f05-v9-help-revoke.jpg). Ảnh chụp 05/11, dữ liệu mẫu, không là ảnh public hoặc bản chứng minh runtime.

### Quyết định mới và lượt sửa bổ sung

Người phụ trách xác nhận trực tiếp ngày 05/11: người chỉ vào ACTIVITY nhờ help, không thuộc roster nhóm, khi mất host phải về MAIN, mic tạm tắt, camera giữ nguyên; thu quyền chat/board/media và help cũ, host mới không tự kế thừa lượt hỗ trợ. Đã ghi vào [LIVE 8.3](../product/live-session.md#83-chuyển-host-và-host-mất-mạng). Không mở rộng quyết định sang mọi trường hợp có membership nhóm độc lập.

Đã gửi prompt bổ sung chỉ cho nhánh này: giữ bản sửa v9; kiểm restore/chuyển chính thức/disconnect trong điều kiện đã chốt; không đổi roster/countdown/những người khác, không mang nháp riêng sang MAIN. Make đã tạo **version 10 — Revoke external activity support on host loss**, hiện một file `src/App.tsx` (+12/−1). Phản hồi tổng kết của Make không có kết quả build/kiểm thử rõ ràng, nên không ghi nhận chúng là đạt. Chỉ coi các ca tự thao tác dưới đây là bằng chứng preview; không lấy lời Make làm kết quả của người review.

### Tự kiểm preview v10 và hồi quy

Mở preview mới từ editor, đợi bản chạy tải xong. Từ lobby sạch chọn demo Host và chủ động bật camera mô phỏng (mic đang bật), không xin thiết bị thật. Tạo ACTIVITY **2 phút**, 2 nhóm A/B mỗi nhóm 2 người; Minh Anh không nằm trong roster. Gán host cho Gia Khoa → mô phỏng Khoa disconnect → random bầu Minh Anh tạm → vào hỗ trợ A.

| Ca                                                 | Kết quả tự quan sát                                                                                                                                                                                  | Kết luận                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Trước restore khi hỗ trợ A                         | MAIN không bị dùng làm nguồn nhóm trống; header/mic/help thuộc A; mic/camera đều bật do thao tác ban đầu. Timer 01:41 → 01:35, roster 2–2.                                                           | Đạt ca setup                     |
| Restore Khoa khi Minh Anh ngoài roster đang hỗ trợ | Tự về MAIN, thông báo kết thúc hỗ trợ, nút Bật mic (mic tắt), nút Tắt camera (camera vẫn bật). Không toolbar MAIN, không còn nhãn help/board/chat nhóm.                                              | Đạt quy tắc vừa chốt             |
| Mở Nhóm khi đã mất host                            | Chỉ thấy đang trong lượt ACTIVITY, không nút vào A/nhóm khác hoặc tổ chức lượt mới.                                                                                                                  | Đạt, không giữ quyền qua help cũ |
| Bầu Minh Anh tạm lần nữa ở MAIN                    | Khoa disconnect → Nam tạm → Lan Chi tạm → Minh Anh tạm; control MAIN có lại, timer còn 00:59, vẫn 2 nhóm × 2 người, không organize/random/điều chuyển/end lượt thủ công. Mic vẫn tắt/camera vẫn bật. | Đạt hồi quy                      |
| Vẽ và mất quyền giữa clear dialog                  | Bút tạo nét làm undo/clear bật; mở clear dialog rồi restore Khoa: dialog đóng, toolbar bị thu, Minh Anh thành member.                                                                                | Đạt hồi quy v10                  |

Ảnh [v10 thu help, MAIN/mic tắt/camera bật](evidence/2026-11-05-f05-v10-help-revoked.jpg). Ảnh v9 phía trên là lịch sử lỗi, không mô tả hiện trạng v10.

**Deadline tự chạy — đã quan sát:** lượt đặt 2 phút giảm từ 02:00 → 01:41 → 01:35 → 00:59 → 00:35 rồi tự kết thúc; không bấm nút demo hết giờ. Panel trở lại form DISCUSSION, không còn lượt/nút vào ACTIVITY cũ. Người thử đã ở MAIN từ trước lúc hết giờ, mic vẫn tắt/camera vẫn bật: ca này chứng minh lượt đóng thật, chưa chứng minh nhánh đưa người đang ở nhóm về MAIN. [Ảnh sau deadline](evidence/2026-11-05-f05-v10-deadline.jpg).

### Còn lại và lượt sau

Chưa publish hoặc kiểm lại public; chưa kiểm đầy đủ chat riêng/nháp khi đổi host, tất cả tổ hợp host ở nhóm, hoặc cấp host cho ứng viên đã bị demo đánh dấu offline. V10 tự kiểm nhánh restore trong lúc hỗ trợ ngoài roster; chưa tách ca hỗ trợ rồi chuyển chính thức/disconnect trong v10. Ca mic/camera chỉ xác nhận UI mô phỏng, không thu/phát thật. Trạng thái public camera cũ ở mục 5 là lần quan sát trước, chưa được kiểm lại trong A1.

Sau A1 đã tiếp tục kiểm **A2 — share/board theo scope** ở mục 9. Lượt tiếp theo: **A3 — chuyển phòng/chat và các ca deadline còn lại**. Chưa gửi prompt A2/A3; recording/B/C chưa thực hiện. Gặp nghiệp vụ thiếu hoặc mâu thuẫn sẽ hỏi trước prompt phụ thuộc, không để Make tự chọn.

## 9. Lượt A2 — share và board theo phòng (05/11/2026)

Kiểm tiếp trên **preview Make v10**, cùng file và nhánh của A1, không tải lại brief hoặc dựng lại ứng dụng. Đối chiếu [board](../product/board-collaboration.md) và [nhóm](../product/group-modes.md). Không phát hiện lỗi cần prompt sửa trong các ca bên dưới; **không tạo version Make mới hoặc dùng thêm prompt A2**.

“Giữ hình” (freeze) là giữ một ảnh để cả nhóm phân tích; “trở lại trực tiếp” (resume) là bỏ ảnh/nét đang phân tích và xem nguồn hiện tại. Nguồn MAIN và nguồn ACTIVITY là hai phạm vi riêng. Đây chỉ là kiểm mô phỏng giao diện, không chứng minh hình/âm thanh thật đã được cách ly.

| Ca đã tự thao tác                      | Kết quả quan sát                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MAIN: hủy chia sẻ                      | Thành viên, nguồn trống → mở hộp chọn màn hình mô phỏng → Hủy: nguồn vẫn trống. Không xin quyền thiết bị thật.                                                                                                                 |
| MAIN: thành viên chia sẻ               | Bắt đầu share được khi trống, có Dừng share nhưng không có bút/clear; dừng trả về nguồn trống. Không phải xin host.                                                                                                            |
| MAIN: host vẽ trên nguồn người khác    | Đổi demo sang Host, Lan Chi share: có bút; tạo nét khiến undo/clear bật. Đổi sang nguồn mình share: undo/clear tắt, nét cũ không được giữ. Dừng nguồn: về lưới camera, toolbar biến mất. MAIN không có freeze/resume.          |
| DISCUSSION: đúng nguồn và quyền        | Thành viên tạo nhóm hợp lệ với Khoa, mô phỏng Khoa vào rồi tự vào: xem bài giảng MAIN, không có nút share riêng.                                                                                                               |
| DISCUSSION: giữ hình, vẽ, nguồn đổi    | Giữ trang 2, dùng bút tạo nét; undo/clear bật. Mô phỏng nguồn trực tiếp sang trang 3: nhóm vẫn giữ trang 2 cùng nét, có thông báo nguồn đã sang trang 3.                                                                       |
| DISCUSSION: MAIN dừng nguồn            | Đổi nguồn MAIN thành trống lúc đang giữ ảnh: ảnh trang 2 và công cụ/nét vẫn còn. Bấm trở lại trực tiếp: hiện chưa có nguồn, ảnh và toolbar cũ được bỏ. Về MAIN không mang board nhóm sang.                                     |
| ACTIVITY: nguồn riêng                  | Tạo lượt 5 phút, 2 nhóm; chuyển vai trò demo sang Thành viên rồi vào A. Khi MAIN có Lan Chi share, A vẫn chưa có nguồn. Mô phỏng nguồn Khoa trong A: hiện nội dung riêng của A, nút share bị khóa khi nguồn bận.               |
| ACTIVITY: giữ ảnh khi nguồn riêng dừng | Giữ hình trang 2, tạo nét; tắt nguồn Khoa: ảnh/nét vẫn giữ, share khả dụng trở lại. Bấm trở lại trực tiếp: A hiện chưa có nguồn, không lấy nguồn MAIN đang chạy.                                                               |
| ACTIVITY: tự share và vào lại          | Thành viên bắt đầu share khi nguồn A trống, không có bước host duyệt. Về MAIN: thấy đúng nguồn Lan Chi/trang 3. Chủ động vào lại A: nguồn trống, share cũ không tự bật lại; mic vẫn tắt, camera vẫn bật theo trạng thái trước. |

**Lưu ý công cụ demo:** chuyển dropdown Host → Thành viên trong lượt ACTIVITY đã tạo tình huống người xem có nhóm A để thử. Đây là cách dựng ca thử của prototype, không phải bằng chứng nghiệp vụ cho phép đổi roster trong lượt. Không dùng thao tác demo này để yêu cầu app thật đổi phân nhóm.

Bằng chứng: [DISCUSSION giữ trang 2 và nét khi nguồn trực tiếp đã sang trang 3](evidence/2026-11-05-a2-discussion-frozen.jpg); [ACTIVITY vào lại có nguồn trống dù MAIN vẫn có nguồn](evidence/2026-11-05-a2-activity-source-isolation.jpg).

**Giới hạn:** chưa kiểm đồng bộ hai trình duyệt/người dùng, âm thanh thật, mọi tổ hợp nguồn, thao tác đồng thời, fade nét tạm hoặc lưu ảnh. Đã thử tạo nét nhưng chưa tách đủ ca undo/clear của nhóm và resume sang một nguồn mới vẫn đang chạy. Các chữ cũ ở mục 5 vẫn còn, để lượt sửa câu chữ; không coi là đã sửa trong A2. Viewport Figma 1280×800, app nằm trong khung laptop; chưa chứng minh responsive web độc lập.

**Lượt tiếp:** A3 — kiểm chat/nháp theo phòng và host, deadline tự chạy khi người xem còn trong ACTIVITY; mất kết nối/vào lại và các ca quyền chưa kiểm ở mục 8. Tiếp tục cùng v10, chỉ gửi prompt khi tái hiện được lỗi; chưa publish.

## 10. Lượt A3 — chat và deadline (05/11/2026)

**Mục tiêu:** chat/nháp đúng phòng và đúng người nhận khi đổi host; deadline tự chạy khi người xem còn trong ACTIVITY. Nguồn: bàn giao A3/D2, messaging và chính sách Everyone/Host. Tiếp tục cùng file Make v10, không dựng lại app.

### Đã tự thử trước sửa

- Từ lobby Host tạo ACTIVITY 1 phút, chuyển góc nhìn demo Thành viên để có nhóm A, tự vào nhóm; mic đang bật, camera tắt. Soạn text gửi Everyone nhóm A, đổi Chat → Nhóm → Chat: bản nháp giữ nguyên, Gửi vẫn bật.
- Không bấm nút demo hết giờ. Đã thấy timer 00:39; khi tự hết hạn, người xem đang ở A được đưa về MAIN, có thông báo hết giờ, mic tắt, bản nháp trống/Gửi tắt. Đây bổ sung ca A1 trước đó chỉ quan sát deadline khi đã ở MAIN. Chưa kèm ảnh đính kèm trong ca này.
- Sau deadline, chọn Host — riêng tư, soạn text cho Lan Chi chưa gửi; mô phỏng host mất kết nối → Thảo Vy host tạm. **Lỗi:** text cũ vẫn còn và Gửi vẫn bật dù actual host đã đổi. Panel riêng còn hiện tin mẫu gắn Everyone MAIN, cần tách lịch sử đúng đích.

Ảnh: [trước deadline](evidence/2026-11-05-a3-before-deadline.jpg), [tự hết giờ khi ở nhóm](evidence/2026-11-05-a3-after-deadline.jpg), [lỗi giữ nháp khi host đổi](evidence/2026-11-05-a3-host-draft-bug.jpg).

### Prompt sửa đã gửi, chưa kết luận đạt

Yêu cầu Make sửa đúng chat cuộc họp: xóa nháp text/ảnh khi actual host/người nhận hoặc phòng thay đổi; hiển thị tên người nhận, kiểm lại khi gửi; tách Everyone và luồng riêng đúng cặp người; host mới không đọc luồng của host cũ. Giữ nháp khi chỉ đổi panel cùng đích, giữ F05/share/board/deadline đã đạt. Chỉ prototype, không backend/dependency/publish. Chờ version mới rồi tự kiểm preview, không lấy lời Make hoặc build thay bằng chứng hành vi.

### Chuẩn bị B1 — điểm vào còn thiếu

Đã bấm Workspace khi cuộc gọi còn chạy: trở về shell, có thanh cuộc gọi/Trở lại cuộc họp. Trong bản chạy v10, bấm Cài đặt và tên Workspace không mở màn/menu hoặc làm thay đổi UI. Chưa thấy đường đăng xuất/auth/danh sách Workspace từ các điểm này. B1 sẽ nối đường vào đó trước B2/B3; chưa kết luận các màn tài khoản đã có hoặc đã hoạt động.

### Kết quả v11 đã tự kiểm

Make lưu **v11 — Fix meeting chat recipient isolation**, một file `src/App.tsx` (+43/−15), báo build và các ca preview đạt. Đã mở lại preview, chờ bản chạy mới rồi tự thao tác độc lập:

- Member vào MAIN, mở Host Lan Chi — riêng tư: hiện tên người nhận, không còn tin mẫu Everyone lẫn vào tab riêng.
- Gửi text riêng cho Lan Chi, soạn thêm nháp chưa gửi → failover random chọn Hoàng Nam: nháp bị xóa, Gửi tắt, tab ghi Host Hoàng Nam, không thấy tin đã gửi Lan Chi.
- Soạn nháp cho Nam → restore Lan Chi: nháp bị xóa, Gửi tắt; tin riêng ban đầu chỉ xuất hiện lại trong đúng cặp Minh Anh–Lan Chi.
- Đổi Chat → Nhóm → Chat ở MAIN cùng đích Lan Chi: nháp vẫn giữ. Tạo DISCUSSION hợp lệ rồi vào nhóm và mở chat: nháp trống, Gửi tắt, không có lịch sử riêng của MAIN.
- Chuyển Everyone MAIN: chỉ hiện tin công khai của Lan Chi, không có tin riêng vừa gửi. [Ảnh v11 Everyone](evidence/2026-11-05-a3-v11-everyone.jpg).

Deadline 1 phút và đổi panel giữ nháp được tự kiểm trên v10 trước sửa; chưa chạy lại đủ deadline trên v11. Chưa tự kiểm ảnh đính kèm, mọi nhánh chuyển host chính thức/không ứng viên, hoặc host trả lời từng người (Make có báo kiểm một số ca, không tính là bằng chứng độc lập). Chưa publish; các ca trên chỉ UI mô phỏng.

## 11. Lượt B1 — tài khoản và danh sách Workspace

**Mục tiêu:** nối đường đăng nhập/đăng ký/đăng xuất → danh sách Workspace có/rỗng → shell/general. Nguồn [tài khoản và Workspace](../product/workspace-channels.md), FR-01 và bàn giao B1. Các điểm vào Cài đặt/tên Workspace đã bấm nhưng chưa mở màn trong v10/v11 (quan sát phía trên).

Đã gửi prompt B1 trong cùng file từ v11: dùng lại component, thêm menu/điều hướng và trạng thái demo auth/danh sách/lỗi; đăng ký tự đăng nhập; giữ pending invitation cho B2; không dùng role demo thay auth, không OAuth/reset password hoặc dịch vụ thật. Chưa kết luận đạt trước khi có version mới và tự kiểm preview. B2/B3, C và recording vẫn chưa thực hiện.

### B1 v12 — đã thử và phát hiện lỗi tạo Workspace

Make lưu **v12 — Add account and workspace entry flows**, đổi App.tsx và index.css (+240/−7), báo build/preview. Đã tự mở bản chạy mới và thử:

- Cài đặt tài khoản mở menu → Đăng xuất về auth, không còn shell.
- Dùng email/mật khẩu giả, chọn demo Trả lỗi: hiện đang xử lý rồi lỗi, không vào Workspace. Chuyển Thành công và thử lại: vào danh sách Workspace.
- Chọn Danh sách rỗng: có lời giải thích và Tạo Workspace đầu tiên. Mở form: tên trống thì Tạo bị khóa; nhập tên rồi tạo mở shell/general.
- **Lỗi cần sửa:** Workspace mới chỉ đổi tên; vẫn Thành viên, 5 người, kênh/DM/tin/ảnh/file của Workspace mẫu cũ. Chưa đạt tạo Workspace/độc lập dữ liệu, không coi B1 hoàn tất. [Ảnh v12](evidence/2026-11-05-b1-v12-workspace-leak.jpg).

Đã gửi prompt sửa hẹp: mỗi Workspace dữ liệu riêng, người tạo Owner/general trống, không kế thừa kênh/tin/người cũ; đổi Workspace không mang nháp/preview/room cũ. Giữ active-call scope, không rename/end call khi chuyển danh sách. Chờ bản sửa và tự kiểm lại. Chưa tự kiểm đăng ký/hủy đăng xuất host trên v12 (Make có báo, chưa tính độc lập).

Bổ sung tự kiểm v12: đăng ký với tên/email/mật khẩu giả đi thẳng tới danh sách ở trạng thái đã đăng nhập, nhưng header vẫn Minh Anh thay vì tên vừa nhập. Prompt sửa B1 đã yêu cầu kiểm tên người dùng/owner đúng sau đăng ký; chưa kết luận danh tính đã sửa trước bản mới.

### B1 v13 — tự kiểm lại ca lỗi

Make lưu **v13 — Isolate data for created workspaces**, App.tsx/index.css (+90/−28), báo build/preview. Đã tải bản chạy mới, tạo Workspace mới: Owner, 1 thành viên, duy nhất general trống; không LIVE/PRIVATE/DM hay tin mẫu cũ. Về danh sách thấy cả Workspace mẫu (5 người/Member) và Workspace mới (1 người/Owner). Mở mẫu: dữ liệu mẫu còn đúng; quay lại Workspace mới: vẫn Owner/general trống. [Ảnh v13](evidence/2026-11-05-b1-v13-new-workspace.jpg).

Đã tự kiểm bổ sung đăng ký v13 với tên giả mới: tự đăng nhập và tên mới xuất hiện ở danh sách, không còn cố định Minh Anh. Các ca trên đã tự kiểm; active call khi đổi Workspace và đóng/mở thread/ảnh được Make báo có thử, chưa tính tự kiểm v13. B1 có luồng dùng được trong phạm vi trên, chưa chứng minh auth/ACL thật hoặc nhiều tài khoản độc lập. V12 ở trên là lịch sử lỗi đã sửa trong ca tạo/chuyển Workspace v13.

## 12. Lượt B2 — nhận lời mời (lịch sử; kết quả bên dưới)

**Mục tiêu:** lời mời → auth nếu cần → trở lại xác nhận → Member/general đúng Workspace; lỗi/đã tham gia có đường ra. Nguồn workspace-channels và bàn giao B2. Đã gửi prompt từ v13: giữ pending invite qua đăng nhập/đăng ký, không tự join; tình huống link tắt/đổi/đã member và rejoin không tự có PRIVATE. Dùng control demo tách riêng, không gửi email/link thật. Quản lý thành viên/link đầy đủ để C1. Chờ version và tự kiểm trước khi đánh dấu đạt. B3/C/recording chưa triển khai.

Chuẩn bị C2 trên v13: đã mở form tạo kênh, có TEXT/LIVE và Toàn Workspace/PRIVATE; Hủy đóng form. Nút Thông tin cuộc trò chuyện chưa mở màn hoặc đổi trạng thái khi bấm ở general mới. Đây chỉ là rà điểm vào, chưa nghiệm thu tạo/đổi tên/xóa/quyền.

### B2 — tự kiểm preview editor trong lúc Make đang hoàn tất

Đã thấy thay đổi B2 chạy trong preview editor (Make chưa chốt version ở thời điểm thử); không dùng bản public hoặc v13 cũ:

- Mở lời mời demo khi đang login: đúng Workspace Thiết kế Sản phẩm, người nhận và role Thành viên; vẫn cần bấm Tham gia.
- Đổi link sang Đã tắt ngay lúc đang xác nhận rồi bấm Tham gia: báo link bị tắt, có đường về danh sách, không mở shell.
- Bật lại link, chuyển demo chưa login rồi mở lời mời → Đăng ký từ lời mời, nhập dữ liệu giả → tự login và quay lại đúng màn lời mời, tên mới đúng, membership còn Chưa tham gia. [Ảnh sau auth, trước join](evidence/2026-11-05-b2-invite-after-auth.jpg).
- Chủ động bấm Tham gia: mở Thiết kế Sản phẩm/general, Member, 4 người, dữ liệu riêng đúng Workspace, không có kênh PRIVATE.
- Mở lời mời lại: membership Đã là member, nút Mở Workspace thay cho Tham gia.
- Đổi demo Đã bị loại → mở lại lời mời → Tham gia: trở lại Member/general, không có PRIVATE trong sidebar. Ca này xác nhận không tự mở PRIVATE trên UI, chưa là ACL thực.

Make báo vòng test dài bị treo ở reload và đang thử lại bằng cách khác; không suy ra các ca chưa tự thử là đạt. Chưa tự kiểm link tạo lại/Workspace không còn, login từ invite và Hủy; chờ version cuối trước lượt B3.

Vòng test của Make tiếp tục treo trên 8 phút dù các ca trực tiếp đã thử được. Đã bấm Stop và yêu cầu chỉ chốt code/version hiện có, không lặp script browser/reload. Không coi việc Stop là mất code hoặc B2 hoàn tất; cần xác nhận version đã lưu.

### B2 — tình trạng lưu sau khi dừng test

Make báo code App.tsx/index.css còn nguyên nhưng Git sạch nên không tạo version mới. Đã mở Version history: mục mới nhất vẫn **v13 — Isolate data for created workspaces**, chưa có card B2; không suy “Git sạch” thành bản B2 đã bàn giao. Đã yêu cầu lượt B3 giữ toàn bộ code B2 và lưu cùng version mới, không reset về v13. Ca B2 hiện là kết quả preview editor đang chạy, cần xác nhận lại trên version lưu tiếp theo.

## 13. Lượt B3 — hồ sơ và đổi mật khẩu (lịch sử; kết quả bên dưới)

**Mục tiêu:** menu tài khoản → hồ sơ tên/avatar và đổi mật khẩu; có Lưu/Hủy/lỗi/đăng xuất tất cả phiên mô phỏng. Nguồn workspace-channels/FR-01/bàn giao B3. Đã gửi prompt hẹp, giữ B2 và các bản sửa trước; avatar công khai nhưng file chat/video vẫn riêng tư, không gọi dịch vụ thật. Không tự đặt hạn mức ảnh hoặc chính sách mật khẩu còn mở. Chỉ dữ liệu giả; yêu cầu kiểm ngắn, báo chưa kiểm nếu vòng browser lỗi thay vì lặp nhiều phút. Chờ version và tự kiểm; C/D/E còn lại chưa hoàn tất.

### B3 v14 và cách tiếp tục khi hết credit

Đã thấy card **v14 — Add profile and password settings**; code B2 vẫn có trong preview cùng B3. Team bị hết AI credit đến 01/12, ô prompt bị khóa. Không mua credit hoặc tạo file khác. Code editor vẫn sửa được: đã sao lưu App.tsx/mockData ngoài repo, sửa câu giải thích ảnh đại diện dễ hiểu hơn qua editor và tự thấy preview cập nhật. Các lượt sau dùng chỉnh code trực tiếp trong cùng file, không đưa generated app vào repo.

Tự kiểm B3: Hồ sơ có email chỉ đọc; sửa tên rồi Hủy giữ Minh Anh; Lưu cập nhật tên ở shell/menu. Mật khẩu hiện tại demo Sai: lỗi, form và phiên giữ nguyên; chuyển Đúng: về login, thông báo đã đổi/thu mọi phiên. Chỉ dữ liệu giả, không thay mật khẩu tài khoản Figma hoặc hệ thống thật. [Ảnh thành công](evidence/2026-11-05-b3-password-success.jpg). Chưa tự kiểm chọn/thay/xóa avatar, upload lỗi, active-call/host khi đổi mật khẩu hoặc tất cả phiên thật; không coi các ca này đã đạt.

## 14. Lượt C1 — thành viên và link mời, chỉnh code trực tiếp

**Nguồn:** FR-02-04/06/07, workspace-channels và bàn giao C1. Bổ sung dialog trong menu Workspace và nút số thành viên: Member chỉ xem; Owner cấp/gỡ Admin; Admin chỉ loại Member; loại có xác nhận hậu quả, gỡ PRIVATE trong Workspace đó; link mời tắt/tạo lại/sao chép. Link `.example` là minh họa, không gửi lời mời thật. Dùng lại Dialog/Button/Avatar; giữ B2/B3/F05.

Đã kiểm TypeScript cho bản prototype trong thư mục tạm bằng compiler/types đang có của repo, không thêm dependency hoặc sửa app repo. Đã tự thao tác preview: Member không nút quản lý; Owner cấp Admin cho Khoa, nhãn đổi và có Gỡ Admin; chuyển Admin thì không còn cấp/gỡ Admin hoặc loại Owner/Khoa. Admin loại Vy sau xác nhận: số người 5→4, danh sách/DM cập nhật. Tắt link: ô báo đã tắt, Copy/Tắt bị khóa, số thành viên giữ; Tạo lại: mã /1→/2, thông báo link cũ vô hiệu. [Ảnh C1](evidence/2026-11-05-c1-invite-controls.jpg).

Chưa tự kiểm copy clipboard, Hủy loại, gỡ Admin hoặc full nhận lời mời từ link của từng Workspace. Đây là quyền/state UI; chưa backend/ACL/multi-user thật. Bản C1 là chỉnh trực tiếp sau v14, không tự gọi thành một Make version mới. C2/C3 tiếp theo.

## 15. Lượt C2/C3 — kênh và thu quyền, chỉnh code trực tiếp

**Nguồn:** messaging/FR-03, workspace-channels và bàn giao C2/C3. Thêm thông tin kênh (đổi tên/xóa có xác nhận; type/access chỉ đọc), cài đặt Workspace (đổi tên, chỉ Owner xóa với nhập lại tên), lọc picker PRIVATE theo thành viên Workspace. Quản lý PRIVATE ngoài quyền nội dung vẫn dùng dialog cấu hình, không mở chat. Thêm guard nội dung/gửi và dọn UI khi membership hoặc quyền kênh đổi; LIVE gắn đúng workspace/channel, đóng call thì bỏ component/state cuộc họp cũ. Control thu quyền là demo bên ngoài sản phẩm.

Đã kiểm TypeScript bản tạm. Đã tự thử preview: Owner tạo TEXT/PRIVATE có picker người trong Workspace; mở kênh, soạn nháp rồi thu quyền: kênh mất khỏi sidebar, chuyển general, composer trống/Gửi tắt. Thông tin general có tên sửa được, mô tả loại/quyền không đổi và nút xóa. Vào LIVE qua lobby, bấm demo mất quyền: cuộc gọi/component cũ đóng, không còn kênh LIVE trong sidebar, về general. [Ảnh thu LIVE](evidence/2026-11-05-c3-live-access-revoked.jpg). Demo bị loại Workspace chuyển về danh sách; đã sửa vị trí thông báo để dùng được cả ngoài shell.

Tìm thấy lúc tạo mới chỉ thêm kênh mà chưa tự mở do guard còn đọc danh sách cũ; đã sửa state chọn kênh mới trong bản code tiếp theo. Ca tạo LIVE tự mở, rename/delete/Hủy đã được thử bổ sung tại E1 mục 18. Chưa tự thử đủ thu quyền khi đang preview file/thread/video, thêm lại PRIVATE, hoặc mọi tổ hợp Admin/Owner khi dialog mở. Chưa có media/ACL thật; đóng UI không là bằng chứng thu server resource. Code này là chỉnh trực tiếp sau v14, chưa xác nhận version card mới.

## 16. Lượt D1/D2 — chat và tệp

D2 tiếp tục dùng sửa v11 ở mục 10; D1 chỉnh trực tiếp Composer/MessageRow: gửi lỗi/retry cho kênh và DM, retry cập nhật cùng ID; thread nhận attachment; thẻ tệp mở thông tin, tệp tự chọn có link tải blob trong phiên mô phỏng; thẻ PDF mẫu chưa có byte thì báo rõ, không giả tải thành công. TypeScript bản tạm đạt.

Đã tự kiểm: DM không thread; gửi text trong demo Trả lỗi thấy Đang gửi → lỗi/Thử lại; đổi demo Thành công và retry: chỉ một tin, không còn lỗi/pending. [Ảnh retry DM](evidence/2026-11-05-d1-dm-retry.jpg). TEXT mở thread tin Khoa, trả lời: 3→4, nội dung chỉ ở panel thread. Thử mở hộp chọn ảnh bằng filechooser flow đã timeout, không có picker ở cửa sổ khác; chưa upload fixture, không tính ảnh/file/thread attachment/avatar là đạt. Chưa kiểm tải file thật. Không dùng ảnh cá nhân hoặc upload dịch vụ.

Đã reload preview riêng và thấy các control C/D1 mới, xác nhận chỉnh code editor tải lại được ngoài preview editor. Không đồng nghĩa đã publish hoặc có Make version card mới.

## 17. Lượt D3/D4 — recording và xem lại

**Nguồn:** recording hiện hành, proposal M2 mục 6.5, contract media M3 và điều phối M4; delta D3/D4 trong bàn giao. Đã thêm code prototype trực tiếp, qua TypeScript và đưa vào editor: STARTING/RECORDING/STOPPING/PROCESSING/READY/FAILED; hiện host có control MAIN, chỉ báo ghi MAIN cả khi ở nhóm, hủy STARTING chặn callback muộn, một bản đang xử lý thì chưa ghi tiếp, demo còn 5 giây tới 3 giờ. Call end dừng input rồi hoàn tất ngoài call; đổi host không reset recording. Bản ghi theo kênh/lọc phiên chỉ READY, giữ vô thời hạn, player mô phỏng play/pause/seek và quay lại. Không nút xóa/quota tùy chọn hoặc provider/codec trên UI.

Trình phát là mô phỏng thời gian/nội dung, không có byte video/âm thanh thật. Không phải recorder M3 hoặc storage R2 đã chạy. Chưa kết luận đạt trước khi tự thử preview bên dưới.

### D3/D4 — kết quả tự kiểm preview

- Từ LIVE mở Bản ghi của kênh: có bản READY mẫu, lọc theo phiên; mở player, Phát rồi tua 75 giây, đồng hồ chạy tiếp; Tạm dừng đổi về nút Phát. [Player mô phỏng](evidence/2026-11-05-d4-player.jpg).
- Vào MAIN bằng Host: có Ghi hình; click thấy Đang khởi động → Đang ghi, đồng hồ tăng. Dừng: Đang dừng, Ghi tiếp bị khóa kèm lý do; sau đó Video đã sẵn sàng, call còn hoạt động. Chưa bắt kịp ảnh riêng giai đoạn PROCESSING ngắn, không ghi là tự thấy đủ mọi bước.
- Ghi tiếp rồi mô phỏng host mất kết nối: Gia Khoa làm host tạm, người xem mất control ghi; restore Minh Anh có lại Dừng ghi, đồng hồ đã tăng tới 00:00:13, không reset.
- Bấm demo còn 5 giây: thấy 02:59:55 và cảnh báo minh họa; sau đó tự tới 03:00:00, video READY, call vẫn hoạt động và không tự ghi đoạn mới. [Ảnh mốc 3 giờ](evidence/2026-11-05-d3-three-hour-limit.jpg). Đây là fake-clock demo, không chờ/ghi thật 3 giờ.
- Mô phỏng lỗi ghi/lưu: báo chưa có video sẵn sàng và call tiếp tục. Bắt đầu lại rồi bấm Hủy khởi động ngay trong cùng ca UI: báo đã hủy/chưa có video, nút Ghi khả dụng.
- Preview có một lần thay khung chạy/reset dữ liệu giả sau autosave. Đã đi lại MAIN Host, ghi ít nhất 3 giây, Rời → Kết thúc cho mọi người → Xác nhận: về kênh ngay; mở Bản ghi sau đó có bản READY vừa ghi 20 giây cùng bản mẫu, đúng hai phiên. Không bắt ở trong call chờ READY.

Tại cuối lượt D3/D4 còn các ca chưa kiểm; sau đó E1/E2 đã bổ sung host hỗ trợ ACTIVITY lúc ghi, thu quyền khi player mở và hành trình liên tục (mục 18). Những ca còn lại: mất quyền rồi thêm lại không hồi call, Hủy xác nhận end và non-host không điều khiển; xem tổng hợp hiện hành ở mục 19. Không có video/âm thanh thật hoặc lưu R2, không dùng demo này chứng minh recorder/capacity.

## 18. Lượt E — hành trình tổng thể và rà cuối

### E1 đã tự chạy trên preview tải mới

Đăng xuất → đăng ký dữ liệu giả Người kiểm E1 → tự login → tạo Không gian kiểm E1 → Owner/1 thành viên/general trống → tạo LIVE Phòng thực hành E1 (tự mở ngay, 0 người khác) → đổi tên Phòng E1 đã đổi tên → lobby đúng tên → vào Host (chỉ 1 participant, đúng tên tài khoản, nguồn trống) → ghi → host xác nhận kết thúc → về kênh → Bản ghi còn trống lúc xử lý, sau đó xuất hiện bản READY 1 phút 28 giây → mở/phát → demo thu quyền: player đóng và về general của đúng Workspace, ô soạn trống. [Ảnh sau thu player](evidence/2026-11-05-e1-player-access-revoked.jpg).

Đã thử đổi tên Workspace, xóa general với Hủy rồi xác nhận: Hủy giữ kênh; xác nhận xóa thì general không tự tái tạo, không còn composer/nội dung cũ. Owner xóa Workspace kiểm thử bằng nhập lại đúng tên: về danh sách, Workspace mẫu khác vẫn còn. Dữ liệu này chỉ ở bộ nhớ prototype, không xóa hệ thống thật. Đã sửa câu trạng thái không có kênh và phân biệt thông báo Workspace đã xóa.

Rà roster đã sửa phòng/lobby/nhóm dùng thành viên đúng Workspace thay danh sách mẫu toàn cục; không đưa Khoa/Nam vào Workspace mới chỉ vì có trong mockData. Giữ các luồng sample 5 người để hồi quy. TypeScript đạt sau các chỉnh này.

### Quyết định ACTIVITY mới

Người phụ trách chốt trực tiếp: **chỉ bắt đầu khi mỗi nhóm có ít nhất một thành viên**. Đã cập nhật [group modes](../product/group-modes.md#nhóm-hoạt-động-do-host-tổ-chức--grp-0102). Áp kiểm draft/người hợp lệ/không tính host, nút Bắt đầu và hàm start/xác nhận cuối; không tự gán người để làm hợp lệ, không đổi quy tắc ACTIVITY đang chạy giữ tới deadline khi thành viên rời. Kết quả ca thiếu người và random đủ người được ghi tại E2 bên dưới.

### E2 — nhóm và ghi hình: ca mới phát hiện khi hồi quy

- Đã tự thử 3 nhóm với draft 2–2–0: cảnh báo nhóm cần người, Bắt đầu bị khóa. Bắt được lỗi phụ random bị guard draft-valid; đã sửa để random vẫn dùng được khi draft chưa hợp lệ. Thử lại: 4 người thành 2–1–1, cảnh báo hết/Bắt đầu mở, tạo lượt 1 phút được.
- Host vào hỗ trợ A trong lúc ghi: nhãn/mic ở A, nguồn A trống, recording tiếp tục MAIN và có thông báo không ghi nội dung nhóm. [Ảnh hỗ trợ](evidence/2026-11-05-e2-recording-activity-help.jpg). [Ảnh draft nhóm trống](evidence/2026-11-05-e2-activity-empty-group.jpg).
- **Phát hiện nhánh F05 disconnect còn lỗi:** chính host ngoài roster đang hỗ trợ A → demo host disconnect: về MAIN/mất quyền đúng nhưng mic vẫn bật. Không lấy ca restore đã đạt ở A1 thay nhánh này. Đã sửa riêng simulateHostDisconnect gọi về MAIN kèm pause mic khi mất help ngoài roster, giữ camera; TypeScript đạt. Kết quả tự kiểm sau sửa được ghi ở phần kế tiếp.
- Có autosave/reimport làm khung preview thay bằng cached rồi bản chạy mới, state mô phỏng reset. Phải đợi bản chạy trước test; không dùng kết quả trên cached.

### E2 — kết quả sau sửa disconnect và countdown thật

Đã tự kiểm lại bản code mới trên iframe chạy (bỏ qua lớp cached): MAIN Host với mic/camera bật, đang ghi → ACTIVITY 2 nhóm, 1 phút → hỗ trợ A ngoài roster → mô phỏng host disconnect: về MAIN/Member, **Bật mic** (mic tắt), **Tắt camera** (camera giữ bật), recording MAIN vẫn chạy. [Ảnh sửa disconnect](evidence/2026-11-05-e2-help-disconnect-mic-fixed.jpg). Restore Minh Anh không tự vào lại help; chủ động mở Nhóm/chọn hỗ trợ A rồi bật mic. Lượt tự hết giờ: về MAIN, mic tắt, camera vẫn bật, recording vẫn có Dừng ghi. [Ảnh deadline thật](evidence/2026-11-05-e2-help-real-deadline.jpg). Không dùng nút demo hết giờ trong ca này.

### E2 — bố cục và công cụ thử

Đã rà TEXT mở thread ở viewport 1280×800 và 1440×900: cả hai ô soạn và nút đóng thread vẫn hiện. Đây là preview trong khung MacBook Air do Figma co giãn, chưa chứng minh responsive của ứng dụng triển khai. Thanh demo cũ quá dày/bị phần khung laptop che; đã gom các control thử vào menu **Tình huống demo**, tự mở/đóng kiểm được. [Bản gọn 1440](evidence/2026-11-05-e2-thread-clean.jpg), [bản gọn 1280](evidence/2026-11-05-e2-thread-clean-1280.jpg). Đã trả viewport về mặc định sau thử. Sau thay đổi menu, đã đi lại lobby → MAIN Member: mic/camera/nhóm/chat/Rời vẫn hiện, menu mở được và thấy các lựa chọn vai trò/nguồn/kết nối; đóng menu rồi Rời về kênh được.

### E3 — bàn giao sau lượt A–E

- Tiếp tục trên **file Make hiện tại**. Card lịch sử mới nhất vẫn là v14; các sửa C/D/E nằm trong code editor sau v14. Không khôi phục v14 để tiếp nhận vì sẽ mất các sửa này. Đã tải lại preview riêng, thấy menu demo mới và đối chiếu toàn bộ App.tsx sao chép từ editor khớp bản vừa kiểm TypeScript (149.712 ký tự).
- Kiểm local: TypeScript bản prototype trong thư mục tạm đạt; `pnpm check:harness`: 54 đạt, 1 symlink bỏ qua, 98 nguồn/link và runtime pins đạt. Format/diff được kiểm lại sau cập nhật tài liệu. Chưa chạy `pnpm check` đầy đủ; repo ứng dụng không đổi source/dependency. Chưa commit/push/publish.
- Cần làm tiếp: tự kiểm chọn ảnh/tệp/avatar và tải byte thật khi picker hoạt động; kiểm thêm Hủy kết thúc cuộc gọi, thu quyền khi dialog/file/thread đang mở, thêm lại PRIVATE, và các tổ hợp quản trị còn ghi ở mục 14–17. Không gọi các nhánh chưa thử là đạt.
- Recording/player, thiết bị, auth và quyền hiện là state mô phỏng. Cần team review luồng trước khi triển khai frontend/backend thật; kiểm server ACL, Socket.IO, media, R2/Cloudinary và tải kết hợp thuộc giai đoạn triển khai tương ứng.
- Hai quy tắc người phụ trách đã chốt (host hỗ trợ ngoài roster mất quyền; mỗi nhóm ACTIVITY ít nhất một người trước start) đã ghi vào nguồn sản phẩm, không chỉ nằm trong prompt. Bất kỳ nghiệp vụ mới chưa rõ tiếp tục hỏi trước khi sửa phần phụ thuộc.

## 19. Rà soát tổng thể để người tiếp theo nhận việc — 05/11/2026

### 19.1. Kết luận và phạm vi kiểm

**Chưa thể chốt UI hoàn thiện toàn diện hoặc đã sẵn sàng nghiệm thu cuối.** Đã có bộ khung và các hành trình chính để team review; còn nhánh cần bổ sung, ca cần thử và quyết định trình bày cần team duyệt. Không đưa phần trăm hoàn thành vì một màn có sẵn không đồng nghĩa mọi hành vi của màn đó đã đúng.

Lượt rà này đối chiếu FR/AC và nguồn Workspace, messaging, LIVE, nhóm, media policy, board, recording, decision-status; đọc lại handoff và bằng chứng A–E. Đã mở lại file Make, sao chép App.tsx từ code editor để đọc kiểm: 149.712 ký tự, khớp bản cuối lượt trước sau chuẩn hóa xuống dòng. Không sửa thiết kế, không gửi prompt, không publish trong lượt rà này. Kết quả thao tác ở mục 8–18 được kế thừa đúng phạm vi; không nói đã chạy lại toàn bộ ma trận trong lượt này.

Phân biệt ba việc:

- **Hoàn thiện prototype:** màn, điều hướng, vai trò, trạng thái lỗi/chờ/thu quyền và tương tác minh họa đủ để review.
- **Chốt thiết kế UI:** người phụ trách/team xem và chấp nhận luồng, chữ và các điểm còn mở. Chưa có xác nhận duyệt toàn bộ.
- **Triển khai ứng dụng:** thay state giả bằng auth/API/socket/media/storage thật và kiểm tích hợp. Đây là bước sau, không bắt prototype phải có recorder hoặc Cloudinary/R2 chạy thật mới được bàn giao thiết kế.

### 19.2. Đã làm được những gì?

| Phần                   | Đã có và bằng chứng đã thử                                                                                                                                                  | Giới hạn cần nhớ                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Tài khoản và Workspace | Đăng ký/đăng nhập/đăng xuất; danh sách có/rỗng; tạo Workspace Owner/1 người/general trống; đổi Workspace không lẫn dữ liệu (mục 11, 18)                                     | Auth và lưu dữ liệu giả lập; chưa chứng minh giữ phiên qua reload hoặc thu phiên thật                                   |
| Lời mời và hồ sơ       | Invite qua đăng ký quay đúng lời mời, chủ động join, link tắt chặn, đã member không join lại; tên Lưu/Hủy; mật khẩu sai/thành công (12–13)                                  | Chọn ảnh/avatar, login từ invite, link cũ sau tạo lại và host đang gọi còn thiếu ca độc lập                             |
| Quản trị               | Danh sách thành viên, Owner cấp Admin, Admin không quản lý Owner/Admin; loại Member; tắt/tạo lại link; tạo/đổi tên/xóa kênh và Workspace (14–15, 18)                        | Chưa phủ hết vai trò, lỗi, Hủy và quyền thay đổi trong lúc dialog mở                                                    |
| Chat                   | TEXT/DM, pending/lỗi/retry cùng tin; thread một cấp, reply không lặp dòng chính; thẻ ảnh/tệp và preview (16)                                                                | Chưa có bằng chứng gửi/tải ảnh/file; chưa có tải lịch sử từng trang                                                     |
| LIVE, nhóm, board      | Lobby, MAIN, share/board đúng ngữ cảnh; DISCUSSION tạo ngay, tự vào, vòng đời disconnect; ACTIVITY random/chỉnh draft, về sớm/vào lại, countdown 1 phút (4, 8–10, 18)       | Thiết bị, âm thanh, vẽ và media đều mô phỏng; chưa phủ các lỗi/phục hồi và mọi quyền clear                              |
| Host và chat họp       | Host tạm/hoàn quyền, thu control; helper ngoài roster mất quyền về MAIN/mic tắt/camera giữ; tách nháp/lịch sử khi đổi host (8, 10, 18)                                      | Chat riêng giữa người trong nhóm và host ở MAIN cần ưu tiên kiểm theo 19.4                                              |
| Recording              | Trạng thái ghi/dừng/lỗi, hủy khởi động, giới hạn 3 giờ minh họa, đổi host vẫn ghi; call end về kênh trước READY; danh sách kênh/phiên và player; revoke đóng player (17–18) | Player chỉ mô phỏng đồng hồ, không byte video/tiếng; không chứng minh M3/R2; PROCESSING ngắn chưa quan sát riêng đầy đủ |
| Trình bày              | Gom công cụ thử vào Tình huống demo; chat/thread dùng được trong preview khung laptop ở hai viewport desktop (18)                                                           | Chưa nghiệm thu mọi màn, bàn phím, chữ dài hoặc responsive ứng dụng thật                                                |

### 19.3. Độ phủ yêu cầu MVP

Đối chiếu [FR/AC hiện hành](../product/functional-requirements.md): 57 FR đang áp dụng; FR-07-07 giữ mã lịch sử nhưng đã ngừng áp dụng, không dựng điều chuyển người trong ACTIVITY. Bảng dưới bao phủ toàn bộ mã; **“có luồng chính” chỉ là độ phủ prototype, không có dòng nào thay nghiệm thu toàn bộ FR ở hệ thống thật**. Từ “thiếu” là thiếu trong nguồn prototype được đọc; “chưa kiểm” không khẳng định tính năng chưa có.

| FR                                               | Kết luận UI tại thời điểm rà                              | Phần cần khép trước chốt UI                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR-01-01, FR-01-02, FR-01-03                     | Có luồng chính, đã thử B1/B2                              | Hết hạn/thu phiên, reload, logout khi member/host đang gọi và hồi phục đúng điểm vào                                        |
| FR-01-04, FR-01-05, FR-01-06                     | Tên/mật khẩu thử một phần; avatar có form chưa kiểm       | Chọn/thay/xóa ảnh, lỗi giữ ảnh cũ; Hủy khi host đang gọi; thông báo thu mọi phiên                                           |
| FR-02-01, FR-02-02, FR-02-03                     | Tạo/mở/rename/delete đã thử ca E1                         | Lỗi thao tác, Admin/Member bị chặn đúng; xóa khi có call/nội dung đang mở                                                   |
| FR-02-04, FR-02-05                               | Invite và link thử một phần                               | Copy, tạo lại rồi mở link cũ, login từ invite, Workspace không còn, active call                                             |
| FR-02-06, FR-02-07                               | Danh sách/cấp Admin/loại đã thử một phần                  | Gỡ Admin, Hủy loại, thay quyền khi dialog mở; thu nội dung đúng Workspace                                                   |
| FR-03-01, FR-03-02, FR-03-03, FR-03-04           | CRUD/PRIVATE có, revoke TEXT/LIVE và player có bằng chứng | Đủ TEXT/LIVE × WORKSPACE/PRIVATE; quản lý ngoài allowlist; thêm/re-add, rejoin không hồi PRIVATE; xóa kênh đang gọi         |
| FR-04-01, FR-04-02, FR-04-04                     | Text/retry có bằng chứng; ảnh/file chưa kiểm đủ           | Tệp chọn thật trong demo, lỗi/chờ/hủy/thử lại, tải; mất quyền khi đang preview                                              |
| FR-04-03                                         | Danh sách tin có; chưa có luồng tải thêm lịch sử          | Tải trang trước/chờ/lỗi/hết lịch sử, giữ vị trí đọc, không lẫn kênh/reply                                                   |
| FR-05-01, FR-05-03, FR-05-04                     | Lobby, thiết bị/share mô phỏng có                         | Quyền thiết bị từ chối, hủy picker/share, tên trạng thái/camera của chính mình, nguồn dừng                                  |
| FR-05-02, FR-05-05                               | Có active-call strip và quay lại; chuyển call chưa đủ     | Không âm thầm mở nhầm call khi bấm LIVE khác; ca chủ động chuyển và Hủy; không mất call khi chỉ về Workspace                |
| FR-06-01, FR-06-02, FR-06-03, FR-06-04, FR-06-05 | Share/board đã thử A2, chưa phủ mọi quyền/lỗi             | Clear/Hủy/undo đúng người; freeze đang chờ/lỗi/nguồn đổi; resume khi mất nguồn; đổi kích thước không lệch nét               |
| FR-07-01, FR-07-02, FR-07-09                     | Host tạm/hoàn quyền và end có bằng chứng                  | Chuyển chính thức trong lúc host tạm, Hủy end, không còn ứng viên, hết quyền trong dialog; đọc nguồn trước dựng nhánh sự cố |
| FR-07-03, FR-07-04, FR-07-08                     | DISCUSSION tạo/join/đóng/reconnect đã thử                 | Validation tên/mục đích/roster; host đóng một/tất cả và Hủy; không vào lại nhóm đã đóng                                     |
| FR-07-05, FR-07-06                               | Draft/random/min mỗi nhóm có người đã thử                 | Thiếu nhánh bắt đầu lỗi một phần → đang hủy → MAIN; không phục hồi DISCUSSION cũ                                            |
| FR-07-07                                         | Ngừng áp dụng                                             | Không thêm nút điều chuyển trong lượt                                                                                       |
| FR-08-01                                         | Có slider nguồn nghe                                      | Giữ volume/mute khi đổi scope; autoplay bị chặn có lối bật tiếng; không lấy slider làm bằng chứng audio                     |
| FR-08-02                                         | Chưa thấy luồng ưu tiên hướng dẫn chung trong mã hiện tại | Host MAIN bật/dừng thông báo, phạm vi MAIN/DISCUSSION, giảm/khôi phục mức trao đổi; ACTIVITY không nhận                     |
| FR-09-01, FR-09-02                               | Everyone/Host và tách nháp đã thử một phần                | Ảnh, host trả lời người đang ở DISCUSSION/ACTIVITY; kiểm bộ lọc tin theo phòng ở 19.4                                       |
| FR-09-03, FR-10-01                               | Hỗ trợ/về MAIN/deadline có bằng chứng                     | Sang A→B thu scope cũ, tự rời help giữ mic khác cleanup; người vốn MAIN không bị reset                                      |
| FR-11-01, FR-11-02, FR-11-03                     | Có banner reconnect/phiên kết thúc; chưa có resync đầy đủ | Quyền đổi khi offline, quá grace/restart, đối soát kết quả chưa rõ, không dựng lại nhóm hoặc gửi nhầm đích                  |
| FR-12-01, FR-12-02                               | DM/text/retry có; lifecycle chưa đủ bằng chứng            | Phân trang, ảnh/file, kick một bên, rejoin mở lịch sử đúng cặp/Workspace; admin không đọc DM                                |
| FR-13-01, FR-13-02                               | Thread/text/count đã thử                                  | Phân trang, ảnh/file, retry count, thu quyền khi đang mở, không reply lồng/nhầm kênh                                        |
| FR-14-01, FR-14-02                               | Form 1–120 phút; tự hết 1 phút đã thử                     | Lỗi giá trị/không chỉnh khi chạy; reconnect sau deadline, cleanup xong mới mở phase giảng                                   |
| FR-15-01, FR-15-02, FR-15-03                     | Luồng recording/player mô phỏng đã thử một phần           | Member/host cũ không điều khiển, trạng thái PROCESSING rõ, lỗi tải/phát/seek, chỉ READY và thu quyền hiện tại               |

### 19.4. Phát hiện cần xử lý trước — từ đọc mã, chưa tái hiện đủ trên preview

Không gắn nhãn “đã thử — cần sửa” cho các phát hiện này. Người nhận cần mở code hiện tại, tái hiện bằng demo tối thiểu, rồi sửa/ghi kết quả. Số dòng là mốc của App.tsx đã sao chép lần rà, có thể dịch chuyển khi sửa.

1. **Chat riêng qua ranh giới phòng:** `privateConversationIds` và `visibleMessages` lọc `roomId` trước khi xét cặp riêng (khoảng dòng 476–493), còn `sendChat` lưu phòng của người gửi. Tin người ở DISCUSSION gửi Host có thể không hiện cho host đang MAIN. Cần ca hỏi từ nhóm → host MAIN thấy và trả lời → đúng người nhận; Everyone của nhóm vẫn riêng, host không được vào DISCUSSION hoặc đọc toàn bộ nhóm. Nguồn: FR-09-02 và policy 8.1. Không sửa bằng cách bỏ mọi lọc quyền/phát tin nhóm ra MAIN.
2. **Ưu tiên hướng dẫn chung còn thiếu:** có điều chỉnh volume nhưng chưa thấy control/state cho announcement (FR-08-02). Cần bổ sung luồng theo nguồn, gồm kết thúc/timeout/disconnect khôi phục mức nghe người dùng đã chọn. Không phát vào ACTIVITY, không tự chốt mốc thời gian/gain chưa có nguồn.
3. **Bắt đầu ACTIVITY lỗi giữa chừng:** `startActivity` (khoảng dòng 648–665) cập nhật thành công trực tiếp; chưa có pending/lỗi một phần/đang hủy/cleanup/retry chủ động. Cần minh họa đủ kết quả ở group modes, không tự hồi DISCUSSION hoặc giữ nửa lượt chạy.
4. **Lịch sử và reconnect:** chat/DM/thread render danh sách trong bộ nhớ, chưa có luồng tải trang; reconnect chủ yếu là banner/đổi trạng thái demo. Cần trạng thái chờ/lỗi/tải bù và kết quả khi quyền/round thay đổi, không mô tả “đã resync” từ một banner. Socket thật để giai đoạn tích hợp.
5. **Một tài khoản/một call và điều hướng:** `LiveRoom.onJoin` khi đang có call chỉ quay `screen` về meeting, chưa phân biệt người dùng vừa bấm LIVE khác (khoảng dòng 1486). Danh sách Workspace còn khóa Workspace khác/tạo mới khi đang gọi. Cần thử hai kênh và đối chiếu live-session 6.1/FR-05-02 trước thiết kế đường chủ động chuyển; tối thiểu không để người xem tưởng đã vào phòng mới. Không tự kết thúc call cũ chỉ vì mở màn khác.
6. **Host và recording ở nhánh sự cố:** mã demo có thể để host rỗng khi hết ứng viên; chưa đủ bằng chứng countdown/grace/kết thúc/resync theo live-session 8.3. Trạng thái recording phụ thuộc các nhánh đó. Đọc nguồn chi tiết trước sửa, không tự chọn fallback mới hoặc coi ca F05 đã thử bao phủ mọi sự cố.

### 19.5. Ca đã có giao diện nhưng vẫn cần kiểm độc lập

- **Tệp/avatar:** chọn ảnh → preview → Lưu/Hủy; lỗi giữ ảnh cũ; xóa về chữ. TEXT/DM/thread gửi ảnh/file, chat họp chỉ ảnh; tải đúng thẻ; revoke đóng preview. Picker từng timeout trong IAB: thử môi trường được phép hoặc nhờ người kiểm thao tác picker; nếu chưa chạy được, ghi chặn môi trường, không kết luận đã sửa hay đã đạt.
- **Quản trị:** gỡ Admin, Hủy loại, copy link, link cũ sau tạo lại, invite qua login; Owner/Admin ngoài PRIVATE quản lý danh sách mà chưa đọc nội dung; thêm/re-add lịch sử; kick/rejoin không khôi phục PRIVATE. Thu quyền giữa lúc mở dialog/thread/tệp/call/player và xóa cha khi đang gọi.
- **Host/nhóm/board:** chuyển host chính thức, Hủy end, A→B help, tự rời help giữ mic, MAIN đang tắt mic không bị deadline bật/reset; clear đúng người, freeze lỗi/resume không nguồn. Không lặp toàn bộ ca A2/F05 trừ khi chỉnh trúng phần đó.
- **Recording:** host cũ/member bị chặn, PROCESSING hiển thị riêng, lỗi tải/phát/tua và kênh không có READY; không hiển thị FAILED nội bộ như thư viện video chung. Video giả phải được ghi rõ; không thêm xóa/TTL/quota UI khi nghiệp vụ còn mở.
- **Trình bày:** auth, lời mời, hồ sơ, form quản trị, call mở chat/nhóm/participants và thư viện/player ở hai kích thước desktop; tên dài, danh sách dài, loading/rỗng/lỗi, focus/bàn phím/đóng dialog và nhãn nút. Hai ảnh thread trong khung laptop chưa bao phủ những màn này; mobile chưa được nghiệm thu và không tự nhận thêm scope mobile.

### 19.6. Điều còn mở và điều không được tự thêm

Đã chốt: host help ngoài roster mất quyền → MAIN/mic tắt/camera giữ; mỗi nhóm ACTIVITY có ít nhất một người hợp lệ trước start. Không cần hỏi lại hai ca đó.

Chưa chốt mọi chi tiết: mốc cảnh báo trước 3 giờ, thời gian/fade nét tự ẩn, các hạn mức ảnh/tệp và thông số giảm tiếng. Chỉ dùng số minh họa có nhãn hoặc hỏi người phụ trách trước khi biến thành validation/chính sách. READY vô thời hạn; quyền xóa byte khi cha bị xóa còn mở, không dựng nút xóa video để lấp chỗ trống.

Một số câu nguồn tổng quan cũ như phần cuối groups-media-policy vẫn ghi pipeline/quota/retention recording “chưa chọn”, trong khi recording.md đã có quyết định cập nhật chi tiết. Dùng nguồn recording chuyên biệt cùng decision-status cho phần đã chốt; không lấy câu tổng quan cũ đảo lại quyết định. Nếu còn hai quy tắc hiện hành mâu thuẫn, ghi nguồn và hỏi trước phần phụ thuộc. Lượt này chỉ cập nhật docs/ui, không tự sửa các nguồn miền khác.

Không tự thêm quên mật khẩu/OAuth, chuyển Owner, group DM, thread họp/DM, quiz/library, điều chuyển ACTIVITY đang chạy, host duyệt DISCUSSION, host hỗ trợ DISCUSSION hoặc public hóa tệp private.

### 19.7. Cách tiếp tục và điều kiện khép UI

Thực hiện các lượt **R1–R6 trong handoff mục 5.1**, ưu tiên R1 tái hiện/sửa nghiệp vụ trước; đây là thứ tự thực hiện, không thay GitHub Issues làm bảng giao việc. Sau mỗi lượt sửa, cập nhật ngay kết luận/mục 6/19 và bằng chứng, không chỉ nối lịch sử ở cuối.

Chỉ đề nghị chốt UI khi: các phát hiện 19.4 được xử lý hoặc người phụ trách chấp nhận hoãn rõ phạm vi; các ca 19.5 có kết quả/thông tin chặn cụ thể; luồng demo xuyên suốt chạy sau bản sửa cuối; team review các màn; mã chỉnh trực tiếp sau v14 được bàn giao nguyên vẹn; public được publish khi được giao và kiểm riêng. Phần ứng dụng thật chuyển cho FE/BE bằng contract và kiểm tích hợp, không đánh dấu đạt từ prototype. Hiện chưa có xác nhận chốt thiết kế/publish cuối.

**Kiểm tài liệu trong lượt rà tổng thể:** Prettier cho 4 file Markdown trong docs/ui đạt; `git diff --check` đạt; `node scripts/check-harness.mjs` đạt 98 nguồn/link và runtime pins. Đối chiếu tự động bảng 19.3 có đủ 58 mã FR trong nguồn (57 đang áp dụng và FR-07-07 ngừng áp dụng); 89 liên kết file local trong 4 tài liệu UI có đích tồn tại, chưa kiểm anchor. Không chạy lại bộ test harness hoặc `pnpm check` đầy đủ trong lượt chỉ sửa tài liệu này. Kết quả 54 tests/1 bỏ qua ở mục 18 thuộc lượt trước, không ghi thành ca vừa chạy. Không commit/push/publish.
