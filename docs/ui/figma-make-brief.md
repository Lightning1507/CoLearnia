# CoLearnia — brief dựng draft bằng Figma Make

**Trạng thái:** đã chốt hướng tham chiếu Slack cho Workspace/chat, Google Meet cho phòng họp và Linear cho cách tiết chế thị giác. UI cụ thể, màu/font, kích thước và component vẫn chờ review draft; prototype chưa là feature đã chạy. Quy tắc nghiệp vụ lấy từ các nguồn bên dưới.

## Cách dùng ngay

1. Chọn ảnh minh họa theo bảng tham chiếu bên dưới; tạo một file Figma Make cho draft CoLearnia, đính kèm ảnh Workspace/chat và dán **Prompt 1**. Nếu chưa đính kèm được ảnh, dùng mô tả trong prompt và ghi nhận draft mới bám mô tả, chưa đối chiếu ảnh.
2. Xem preview, chỉnh những điểm lớn về bố cục và phong cách. Chưa cần chốt hết component hoặc làm mọi modal quản trị.
3. Dán **Prompt 2 trong cùng file**, giữ phong cách và component đã dựng để thêm phòng họp. Đây là hai khu vực ưu tiên của draft đầu.
4. Dùng **Prompt 3** để bổ sung hai bối cảnh nhóm sau khi bố cục phòng họp đã đọc được. Đây vẫn là prototype nghiệp vụ, không thay PoC media thật.
5. Team review các luồng ở cuối tài liệu, ghi nhận UI đã đồng ý trong Issue/PR hoặc file thiết kế; rồi chia task FE. Không dùng tài liệu này để theo dõi trạng thái công việc.

Chỉ gửi đoạn prompt cần cho lượt hiện tại, không nạp toàn bộ tài liệu thiết kế/database vào Make. Không cần kết nối backend, GitHub hay publish để dựng draft này. Bản đầu dùng dữ liệu giả và mô phỏng tương tác trong bộ nhớ.

## Nguồn và ranh giới

- [Scope](../product/scope.md): chức năng bắt buộc và ngoài phạm vi.
- [Messaging](../product/messaging.md): general, TEXT/LIVE, PRIVATE, DM và thread.
- [Live session](../product/live-session.md): thiết bị, share, host và rời cuộc họp.
- [Group modes](../product/group-modes.md), [policy hỗ trợ](../product/groups-media-policy.md): DISCUSSION/ACTIVITY, chat và audio theo phòng.
- [Board](../product/board-collaboration.md): freeze chung, vẽ và trở lại trực tiếp.
- [Web hiện tại](../../apps/web/package.json), [chỉ dẫn FE](../../apps/web/AGENTS.md): React/TypeScript, Vite, Tailwind; UI tiếng Việt. Chưa quyết định thêm thư viện UI chỉ từ việc Make sinh code.

Brief không tạo quyết định nghiệp vụ mới. Mâu thuẫn với nguồn phải sửa prompt/draft, không sửa nguồn để hợp thức hóa prototype. Tên MAIN/DISCUSSION/ACTIVITY dùng để truy vết; trên UI ưu tiên “Phòng chung”, “Nhóm trao đổi”, “Nhóm hoạt động”.

## Hướng thị giác đã chốt

Mỗi sản phẩm tham chiếu một khía cạnh; CoLearnia giữ một hệ thống chữ, khoảng cách, icon và component thống nhất xuyên suốt. Không lấy nguyên các theme/thành phần khác nhau ghép vào từng màn.

| Tham chiếu và nguồn có hình minh họa                                                                          | Điểm áp dụng                                                                                                                         | Ranh giới                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [Slack — quick start](https://slack.com/help/articles/360059928654-How-to-use-Slack--your-quick-start-guide/) | Cấu trúc Workspace/channel/DM; header kênh, dòng tin nhắn và composer. Thread của CoLearnia mở panel bên phải theo nghiệp vụ đã chốt | Không sao chép màu tím/logo, thanh công cụ đầy đủ hoặc thêm search/reaction/canvas theo ảnh |
| [Google Meet — layout](https://support.google.com/meet/answer/10550593?hl=en)                                 | Nội dung chia sẻ ở vùng chính, camera bên cạnh, điều khiển phía dưới                                                                 | Không lấy các tính năng họp hay quyền của Meet làm quyết định sản phẩm                      |
| [Linear — design refresh](https://linear.app/now/behind-the-latest-design-refresh)                            | Điều hướng ít tranh chú ý với nội dung; phân cấp chữ rõ, giảm icon trang trí và đường viền dư                                        | Không sao chép task board, bộ trạng thái hoặc chữ quá nhỏ cho nội dung học                  |

Trước khi gửi Make, chọn 3–4 ảnh: một Workspace/chat Slack, một thread mở bên cạnh, một Meet đang trình chiếu và một ảnh chi tiết phân cấp/sidebar Linear. Ưu tiên ảnh chính thức; ảnh từ tài khoản của team phải che dữ liệu cá nhân/nội dung riêng. Ghi chú cho từng ảnh phần cần học, không để Make suy rằng mọi nút trong ảnh đều thuộc scope. Chưa có bộ ảnh được đính kèm sẵn trong repo hoặc tài khoản Figma ở task này.

**Cách diễn giải để thử trên draft — chưa chốt token:** Workspace nền sáng với sidebar xám nhẹ, màu nhấn dùng có chọn lọc; vùng media trong cuộc họp dùng nền tối. Giữ cùng font, icon và kiểu điều khiển giữa hai khu vực, chưa cần làm bộ chuyển light/dark theme. Không ép màu xanh lá đậm từ scaffold hiện tại thành brand.

Giao diện clean cần giúp đọc và thao tác nhanh: hội thoại là dòng tin liên tục, khung share đủ lớn, trạng thái phòng/mic/chat rõ và thao tác có vị trí ổn định. Không dùng gradient/glassmorphism trang trí, card cho từng tin nhắn, bóng đổ dày, góc bo quá lớn, emoji thay icon hoặc dashboard/hero không phục vụ luồng học. Trạng thái lỗi, freeze và quyền vẫn phải đủ nổi bật; “tinh gọn” không có nghĩa ẩn những thông tin đó.

## Prompt 1 — Workspace và chat

Sao chép nguyên khối sau vào Figma Make:

```text
Hãy tạo bản nháp giao diện có tương tác cho CoLearnia, ứng dụng học và cộng tác của sinh viên. Mục tiêu lượt này là giúp team review Workspace và chat, chưa kết nối backend.

ĐỐI TƯỢNG VÀ PHONG CÁCH
- UI hoàn toàn bằng tiếng Việt. Desktop trước, bố cục tốt tại 1440×900 và laptop 1280×800; mobile để sau.
- Hướng đã chọn: cấu trúc Workspace/chat của Slack và cách tiết chế thị giác của Linear. Ảnh tham chiếu nếu được đính kèm chỉ hướng dẫn bố cục/phân cấp; không sao chép thương hiệu hay tự thêm tính năng nhìn thấy trong ảnh.
- Sidebar chứa chọn Workspace, channel và DM; header kênh gọn, dòng hội thoại liên tục, composer phía dưới, thread ở panel bên phải. Không bọc từng tin nhắn trong card.
- Thử nền trắng, sidebar xám nhẹ, chữ tối và một màu nhấn dịu cho lựa chọn/hành động chính. Mã màu cụ thể chưa chốt; đề xuất một palette nhất quán để review, không mặc định sidebar xanh lá đậm hoặc sao chép màu tím Slack.
- Áp dụng Linear ở mức phân cấp: điều hướng ít nổi hơn nội dung, đường viền nhẹ có mục đích, icon cùng bộ; không dùng chữ nhỏ hoặc tương phản thấp khiến khó đọc.
- Không dùng gradient/glassmorphism trang trí, card khắp nơi, bóng đổ dày, bo góc quá lớn, hero hay dashboard thống kê. Không dùng emoji thay icon điều khiển.
- Nội dung chính khoảng 14–16px, phân cấp rõ, tương phản đủ; dùng label/tooltip cho icon, focus bàn phím rõ.

MÀN HÌNH CHÍNH
- Workspace mẫu “Công nghệ Web — Nhóm 5”. Sidebar có chọn Workspace, danh sách kênh và tin nhắn riêng.
- Kênh TEXT: # general, # bài-tập. Kênh LIVE: “Phòng học chung”, có icon cuộc gọi phân biệt với TEXT.
- Kênh PRIVATE dùng icon khóa độc lập với loại TEXT/LIVE. Ví dụ TEXT PRIVATE “Chuẩn bị thuyết trình”. Danh sách nội dung chỉ có kênh người đang xem được truy cập.
- general là kênh TEXT mặc định. Owner/admin tạo kênh; member thường không có nút tạo kênh. Không thêm quy tắc bảo vệ general riêng chưa được yêu cầu.
- Vùng giữa là chat của kênh đang chọn: header, tin nhắn theo thời gian, avatar/tên, ảnh và tệp đính kèm, ô soạn text/ảnh/file.
- Dữ liệu mẫu tự nhiên bằng tiếng Việt: 5 thành viên trao đổi bài tập, một ảnh sơ đồ, một tệp PDF, một tin có 3 trả lời. Không dùng dữ liệu cá nhân thật.
- Bấm số trả lời mở panel thread bên phải, có tin gốc và các reply một cấp. Reply không xuất hiện lại như tin gốc ở dòng chat chính, không có thread lồng nhau.
- Chọn một người trong danh sách DM mở chat 1–1 với text/ảnh/file; DM không có thread. Admin không có màn đọc DM của người khác.
- Chọn kênh LIVE hiển thị khu vực vào phòng: tên phòng, người đang tham gia giả lập và nút “Vào phòng”; màn họp sẽ bổ sung ở lượt sau.

TƯƠNG TÁC CẦN DEMO
- Chuyển kênh/DM; mở/đóng thread; gửi tin nhắn và trả lời bằng state trong bộ nhớ.
- Cho chọn tệp/ảnh để hiện preview giả lập, bỏ tệp trước gửi. Không upload tới dịch vụ thật. Chỉ cần dữ liệu mẫu để minh họa tải tệp.
- Một tình huống tin đang gửi, gửi lỗi và nút thử lại; một kênh trống với lời hướng dẫn phù hợp.
- Demo role mặc định MEMBER. Có công cụ thử riêng “Tình huống demo” để chuyển sang OWNER/ADMIN và mở modal tạo kênh: tên, loại TEXT/LIVE, quyền toàn Workspace/PRIVATE và chọn thành viên PRIVATE.
- OWNER/ADMIN có thao tác quản lý danh sách PRIVATE. Quyền quản lý không tự cho đọc nội dung; không hiển thị chat private ngoài quyền. Modal quản lý chỉ cần minh họa thêm/gỡ thành viên, không phải màn xem nội dung.
- Công cụ đổi role/tình huống phải tách khỏi luồng sản phẩm và ghi rõ chỉ phục vụ prototype. Không mô phỏng đó là tính năng người dùng tự đổi quyền.

CÁCH TỔ CHỨC
- Dùng React + TypeScript, Tailwind và component tái sử dụng cho sidebar, button, input, dialog, message list, composer, thread panel.
- Tách dữ liệu mẫu khỏi component. Không tự tạo backend, auth thật, database hoặc tích hợp dịch vụ bên ngoài; không thêm dependency nếu chưa cần cho draft.
- Một chỉ báo nhỏ ngoài vùng nội dung chính cho biết “Bản mẫu — dữ liệu mô phỏng”. Không đưa tên API, schema hoặc chi tiết kỹ thuật vào trải nghiệm sản phẩm.
- Không tự thêm search, unread/read receipts, reactions, sửa/xóa tin, thông báo hệ thống, task board, quiz hoặc thư viện bài làm.

Hãy dựng màn chat general hoàn chỉnh trước, cùng các tương tác trên. Giữ cấu trúc để lượt tiếp theo thêm phòng họp trong cùng ứng dụng.
```

## Prompt 2 — Phòng họp và nội dung chia sẻ

Dán tiếp trong cùng file sau khi review Prompt 1. Lượt này chỉ dựng phòng chung và các trạng thái liên quan; nhóm ở Prompt 3. Giữ các chỉnh sửa Workspace đã review, gồm xuống dòng khi mở panel, composer gọn, avatar dịu và DM không có thread.

```text
Tiếp tục draft CoLearnia hiện tại. Giữ phong cách, component và Workspace/chat đã có; thêm luồng từ kênh LIVE vào phòng họp. Chỉ mô phỏng UI, chưa gọi camera/mic, WebRTC, API hoặc dịch vụ thật.

ĐẦU RA LƯỢT NÀY
- Hai màn liên kết được: kiểm tra thiết bị trước khi vào và phòng chung. Giữ nguyên các cải thiện Workspace/chat vừa thực hiện, đặc biệt chống cắt chữ khi mở panel, composer gọn và bỏ thread khỏi DM.
- Dùng 5 người mẫu, với tình huống thành viên và host. Chưa dựng chia nhóm hoặc tự thêm nút nhóm chưa hoạt động; phần nhóm sẽ bổ sung ở lượt sau.

THAM CHIẾU THỊ GIÁC
- Dựa vào bố cục Google Meet: vùng nội dung lớn, camera bên cạnh khi trình chiếu, điều khiển ở dưới. Nếu có ảnh đính kèm, học cách phân bổ không gian, không tự thêm nút/tính năng của Meet.
- Vùng media nền tối để làm rõ nội dung share; giữ cùng font, icon, kiểu button và màu nhấn với Workspace. Panel phục vụ đọc chat cần tương phản dễ đọc; đây là một ứng dụng thống nhất, không phải một theme sản phẩm khác.
- Dùng cách tiết chế của Linear: ít đường viền và trang trí, vị trí thao tác ổn định. Không đóng từng vùng vào card dư thừa, không thêm gradient hoặc widget thống kê.
- Panel chat/người tham gia dùng cùng vùng bên phải khi được chọn, không mở nhiều panel khiến màn share quá hẹp. Cho phép đóng panel dễ dàng; giữ vị trí phòng, phạm vi mic và trạng thái freeze luôn đọc được.
- Vào họp chuyển sang bố cục tập trung cho cuộc họp, không giữ sidebar Workspace rộng cạnh nội dung share. Có lối quay lại Workspace rõ; nếu chưa rời cuộc họp, hiển thị thanh cuộc gọi đang diễn ra và nút trở lại họp. Chuyển màn không đồng nghĩa kết thúc cuộc gọi trong prototype.

TRƯỚC KHI VÀO
- Từ kênh LIVE, nút “Vào phòng” mở màn kiểm tra thiết bị: preview giả lập, bật/tắt mic/camera, chọn thiết bị, nút “Tham gia cuộc họp” và quay lại. Minh họa trường hợp không cấp quyền thiết bị vẫn vào xem được; không hiện hộp xin quyền thiết bị thật.
- Người bắt đầu phiên mới là host; người vào phiên đang có là thành viên. Không có bước chọn FREE/MODERATED hoặc nút tự nhận host.
- Host cuộc họp độc lập owner/admin Workspace: không dùng vai trò quản trị Workspace để tự cấp host. Công cụ demo chọn tình huống, không biến thành nút tự nhận quyền trong UI sản phẩm.

PHÒNG CHUNG
- Nội dung share chiếm vùng chính; khi có share, các ô camera thu gọn ở cạnh phải. Có trạng thái phòng chưa có share và bố cục camera khi chưa trình chiếu.
- Thanh dưới: mic, camera, chia sẻ màn hình, người tham gia, chat và rời cuộc họp. Không nhồi mọi công cụ vào cùng một thanh.
- Ai ở phòng chung cũng được share khi nguồn trống, không xin host. Khi người khác đang share, hiển thị người đang chia sẻ và vô hiệu thao tác bắt đầu share; không có nút giành nguồn. Người share có nút dừng.
- Với người tự share, mô phỏng bước “Chọn màn hình để chia sẻ”, cho tiếp tục/hủy rồi mới hiển thị trạng thái đang share. Không gọi browser picker thật hoặc tự bắt đầu share khi vào họp.
- Header thể hiện tên phòng và vị trí “Phòng chung”. Các nút có trạng thái/tooltip rõ, không chỉ đổi màu.
- Có điều chỉnh âm lượng nghe cục bộ, tối thiểu âm lượng cuộc họp và nguồn share khi có tiếng. Ghi rõ chỉ ảnh hưởng người đang chỉnh; không mô phỏng đó là tắt mic của người khác.

CHAT VÀ BOARD
- Panel chat cuộc họp độc lập chat kênh; chỉ text/ảnh, không file hoặc thread. Chọn “Mọi người trong phòng chung” hoặc “Host — riêng tư”. Khi là host, minh họa trả lời riêng đúng người gửi.
- Luôn hiện rõ đích gửi trước khi gửi. Không có DM tùy chọn mọi người trong cuộc họp; host dùng hội thoại riêng với đúng người hỏi. Khi host thay đổi, không tự đưa lịch sử riêng cho host mới hoặc tự gửi bản nháp sang đích mới; yêu cầu người gửi kiểm tra lại người nhận.
- MAIN không có freeze/resume hoặc “Tạm dừng hình của phòng”. Chỉ host hiện hành ở MAIN/hướng dẫn vẽ trực tiếp lên nguồn MAIN dù người khác share. Thành viên chỉ xem; quyền share không cấp quyền vẽ.
- Host có bút/màu, undo nét của mình, clear có xác nhận; chọn nét thường giữ tới khi xóa/context nguồn kết thúc hoặc nét tự biến mất. Chưa chốt thời gian/fade. Vẽ không dừng hình/audio, không tracking vật thể khi cuộn/chuyển slide.
- MAIN không có tẩy từng điểm, text, hình khối, lưu/export hoặc cấp quyền cộng tác viên. Đổi host thu quyền vẽ/clear cũ; host mới undo chỉ nét mình. Nét nhóm không tự công khai ra MAIN.
- Nguồn MAIN đổi/dừng: xóa overlay của nguồn cũ, hiển thị nguồn mới hoặc “Chưa có nguồn chia sẻ”. Không giữ ảnh frozen MAIN.

HOST VÀ LỖI
- Trong menu người tham gia, host gán host cho người khác trực tiếp, không có bước người nhận chấp nhận; member thường không thấy thao tác này.
- Với thành viên, thao tác “Rời cuộc họp” đưa người đó về kênh LIVE và cuộc họp vẫn tiếp tục. Với host, hiển thị rõ thao tác “Kết thúc cho mọi người” và xác nhận hậu quả; có thể hủy, chuyển host rồi mới rời như thành viên thường. Không mặc định tự chọn người kế vị khi host chủ động rời.
- Minh họa mất kết nối/đang kết nối lại và phiên đã kết thúc. Không tự bật lại mic/camera khi đổi tình huống.
- Dùng “Tình huống demo” ngoài luồng sản phẩm để thử MEMBER/HOST, nguồn trống/đang share, nét thường/nét tự biến mất của host và lỗi thiết bị. Mọi trạng thái đều giả lập, không mô tả là cuộc gọi thật đã hoạt động.
- Không thêm ghi hình, phụ đề AI, giơ tay, reactions, lịch họp, đồng hồ ngoài countdown hoạt động ở lượt sau hoặc công cụ vẽ mở rộng. Không tự chọn quy tắc host mất mạng chưa được đặc tả trong lượt này.

KIỂM DRAFT
- Thử luồng kênh LIVE → kiểm thiết bị → tham gia → mở/đóng chat hoặc người tham gia → rời/kết thúc; kiểm tình huống camera tắt và không được cấp quyền thiết bị.
- Thử nguồn trống/người khác share/mình share; MAIN host vẽ được, member không được; nguồn đổi/dừng xóa nét; chuyển host thu quyền cũ. Kiểm chat Everyone/Host. Freeze/vẽ/resume chỉ thử trong DISCUSSION/ACTIVITY ở lượt 3.
- Ở 1440×900 và 1280×800, mở panel vẫn đọc được bài giảng, không cắt chữ hoặc cuộn ngang toàn ứng dụng; mic/camera/rời cuộc họp luôn thao tác được.
- Chỉ báo pass cho kiểm tra thực sự đã chạy, ghi rõ phần chưa kiểm. Kiểm tra prototype không là kiểm chứng audio/video thật.

Chưa làm modal chia nhóm ở lượt này; lượt kế tiếp sẽ thêm nhóm trao đổi và nhóm hoạt động. Hãy ưu tiên phòng họp dễ hiểu, khung share rộng và thanh điều khiển gọn; không thiết kế lại Workspace từ đầu.
```

## Prompt 3 — Hai bối cảnh nhóm trong phòng họp

Đây là phần bổ sung draft sau hai màn ưu tiên, không phải yêu cầu làm xong trước PoC media:

```text
Tiếp tục trong draft CoLearnia hiện tại, dùng lại giao diện phòng họp. Bổ sung hai bối cảnh nhóm dưới đây, bằng dữ liệu và tương tác giả lập. Không tạo hai loại cuộc họp khác nhau.

NHÓM TRAO ĐỔI (DISCUSSION)
- Khi đang học chung, thành viên có thể xin tạo nhóm: tên, mục đích và chọn người đang tham gia. Tên tối đa 80 ký tự, mục đích tối đa 500; danh sách không trùng. Người gửi được hủy yêu cầu còn chờ, không sửa yêu cầu.
- Host có panel duyệt/từ chối. Duyệt xong, chỉ những người trong danh sách thấy nút “Vào nhóm”; mỗi người chủ động bấm, không bị tự chuyển. Người ngoài danh sách không tự vào.
- Trong nhóm, hiện rõ tên nhóm và “Đang theo dõi bài giảng phòng chung”. Nhận nguồn share/bài giảng từ phòng chung, mic trao đổi chỉ trong nhóm; có hai mức âm lượng cục bộ cho bài giảng và trao đổi nhóm.
- Ẩn nút share riêng. Nhóm có frame/nét riêng khi tạm dừng nguồn bài giảng; không tác động board phòng chung.
- Chat Everyone ghi “Mọi người trong nhóm”; vẫn có nhắn riêng Host bằng text/ảnh. Có nút “Về phòng chung” khác với “Rời cuộc họp”, chỉ chuyển người bấm.
- Host có thể kết thúc một hoặc tất cả nhóm trao đổi, đưa người trong các nhóm đó về phòng chung. Minh họa bằng một thao tác “Kết thúc nhóm trao đổi” với lựa chọn nhóm đích.

NHÓM HOẠT ĐỘNG (ACTIVITY)
- Host chuẩn bị nhóm A/B, phân người và đặt một thời lượng chung số nguyên 1–120 phút trước khi bắt đầu. Không có chỉnh/gia hạn/tạm dừng thời lượng trong lượt.
- Bắt đầu lượt sẽ kết thúc các nhóm trao đổi trước; thông báo rõ ảnh hưởng. Trong lượt hoạt động không nhận yêu cầu hoặc cho vào nhóm trao đổi.
- Nhóm hoạt động độc lập: không nhận màn hình/tiếng giảng thường từ phòng chung; mỗi nhóm có camera/mic, chat và một nguồn share riêng. Bất kỳ thành viên nào trong nhóm đều share khi trống, không xin host; không giành nguồn.
- Freeze/vẽ theo nguồn share của chính nhóm; không fallback sang phòng chung khi nhóm chưa có share.
- Hiện countdown chung và nút “Về phòng chung” cho từng người về sớm. Hết giờ tự kết thúc lượt, đưa người còn trong nhóm về phòng chung với mic tạm tắt; người dùng tự bật lại.
- Không dựng nút host kết thúc một nhóm hoặc toàn lượt ACTIVITY thủ công. Demo hết giờ bằng công cụ tình huống tách khỏi UI sản phẩm, không biến thành nút host.

HỖ TRỢ NHÓM
- Thành viên nhắn riêng Host trong chat cuộc họp. Host xem yêu cầu và vào đúng nhóm hỗ trợ; nhóm thấy thông báo host đang ở đó, tiếng hỗ trợ chỉ trong nhóm đích.
- Host chỉ xem nội dung nhóm đích khi đang có quyền hỗ trợ, không hiện nội dung các nhóm khác song song. Rời hỗ trợ về phòng chung là thao tác đổi phòng, không phải rời cuộc họp; giữ trạng thái mic và hiển thị rõ mic nay thuộc phòng chung.
- Thông báo hướng dẫn chung của host có audience rõ theo policy: DISCUSSION vẫn theo bài giảng; ACTIVITY không mặc nhiên nhận tiếng MAIN.

Sau khi về phòng chung, không tự công khai chat hoặc board nhóm. Bố trí trạng thái vị trí, nguồn đang xem và phạm vi mic để người chưa đọc tài liệu vẫn hiểu mình đang ở đâu và ai nghe được mình.
```

## Review draft trước khi chia việc FE

Review bằng thao tác trên preview, không chỉ nhìn một ảnh đẹp:

- So sánh với ảnh tham chiếu theo từng vai trò: cấu trúc Slack, vùng media Meet, phân cấp Linear; không chấm mức giống thương hiệu.
- Ở 1440×900 và 1280×800, xem chat/thread và nội dung bài giảng có đủ rộng, chữ đủ đọc; không có scroll ngang ngoài nội dung thực sự cần.
- Bỏ những đường viền, card, icon/màu trang trí không giúp nhận biết nội dung hoặc thao tác; giữ trạng thái lỗi/quyền/phòng rõ bằng cả chữ và hình thức.
- Kiểm sự nhất quán của chữ, icon, button, dialog và spacing giữa Workspace/phòng họp. Các quyết định token cuối cùng chỉ chốt sau vòng review này.

| Hành trình                                | Điều cần nhìn rõ                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| general → thread → DM                     | Ba ngữ cảnh chat khác nhau; reply nằm đúng thread; text/ảnh/file ở Workspace                     |
| Member → admin trong công cụ demo         | Quyền tạo kênh/quản lý PRIVATE hiện đúng; không có tự đổi role trong sản phẩm                    |
| Kênh LIVE → lobby → phòng chung           | Thiết bị, host/member, share/camera và cách rời dễ hiểu                                          |
| Share → freeze → về trực tiếp             | Ai bị tác động, hình đang dừng hay live; audio vẫn tiếp tục                                      |
| Xin DISCUSSION → duyệt → tự vào → về MAIN | Không tự chuyển sau duyệt, không share riêng, rõ phạm vi mic/chat                                |
| Host tạo ACTIVITY → học nhóm → hết giờ    | Nhóm độc lập, share không xin host, countdown tự đưa về MAIN; người về sớm chỉ chuyển chính mình |
| Nhắn Host → hỗ trợ → rời hỗ trợ           | Đúng nhóm/đúng người, không phát tiếng riêng sang phòng khác                                     |

Team cần chốt sau khi xem draft: phong cách màu/font, bố cục sidebar/chat/phòng họp, cách mở panel và các component lặp lại. Không cần chốt mọi pixel hoặc mọi modal quản trị mới bắt đầu FE. Đăng ký/đăng nhập, lời mời, quản trị Workspace/thành viên và các trạng thái còn lại vẫn thuộc scope; bổ sung ở vòng draft tiếp theo bằng cùng phong cách, không tự cắt bỏ.

Khi nhận code: đưa từng phần vào ứng dụng hiện tại, review dependency/phiên bản và ranh giới component; dùng mock chỉ ở chế độ demo. Không thay lockfile, router, state/data layer hay auth của project bằng một app Make độc lập. Mock call, role switch và countdown giả không là bằng chứng auth/media/ACL thật.

## Tham khảo công cụ

- [Figma: hướng dẫn guidelines](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make): giữ context tập trung; có thể chuyển quy tắc dùng chung đã review sang guidelines của Make, không cần thêm ngay một nguồn nghiệp vụ thứ hai.
- [Figma: tạo file Make](https://help.figma.com/hc/en-us/articles/31304485164695-Create-a-Figma-Make-file): bắt đầu từ prompt rồi sửa theo preview. Tài khoản/quyền công cụ hiện chưa được kiểm trong task này.

## Hiệu lực sửa prompt 02/11/2026

Quy tắc MAIN freeze trong prompt cũ đã được thay bằng host vẽ LIVE như lượt 2 ở trên. Prompt sửa lỗi cũ có yêu cầu clear cho người tạo frame MAIN không còn áp dụng. Lượt 3 mới đưa freeze/vẽ/resume chung vào DISCUSSION/ACTIVITY. Chưa gửi bản cập nhật này vào Figma Make hoặc kiểm lại prototype; không gọi UI hiện tại đã đúng chỉ vì brief đã đổi.
