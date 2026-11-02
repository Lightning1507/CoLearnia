# Review Use Case theo mục tiêu người dùng

**Trạng thái: kết quả review và chỉnh sửa mô hình đã được người dùng đồng ý ngày 27/10/2026.** Nghiệp vụ lấy từ baseline; quyết định giữ/gộp dưới đây điều chỉnh cách đặc tả và vẽ, không cắt feature. Áp dụng vào [danh mục](use-case-catalog.md) và [tổng quan](use-case-outline.md).

## 1. Cơ sở nghiên cứu và tiêu chí

[Craig Larman — Applying UML and Patterns, chương 6, mục 6.15–6.17](https://www.craiglarman.com/wiki/downloads/applying_uml/larman-ch6-applying-evolutionary-use-cases.pdf) phân biệt mục tiêu người dùng với chức năng con; dùng giá trị kết quả và độ lớn luồng làm gợi ý nhận diện, không là giới hạn cứng số bước. Có thể gom CRUD; xác thực là trường hợp vẫn đáng mô tả dù không phải mục tiêu nghiệp vụ chính. [Microsoft — UML use case diagram](https://support.microsoft.com/en-us/visio/create-a-uml-use-case-diagram) nhấn mạnh quá trình tương tác, vai trò và ranh giới hệ thống; sơ đồ không mô tả trình tự thao tác. Ký hiệu quan hệ tham chiếu [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1).

Từ các hướng dẫn đó, đề xuất kiểm mỗi mục CoLearnia bằng các câu hỏi:

1. Actor muốn đạt kết quả gì, ngoài việc thao tác giao diện? Trả lời bằng mục đích và kết quả, không chỉ tên nút.
2. Có trigger và điểm hoàn tất riêng không? Actor có thể quay lại để thực hiện mục tiêu này mà không phải làm lại mục tiêu khác không?
3. Luồng có tương tác và quy tắc cần đặc tả riêng, hay chỉ là bước/chọn lựa trong luồng khác?
4. Tách ra có giúp thấy trách nhiệm, quyền và hậu điều kiện khác biệt không? Quyền khác nhau là bằng chứng hỗ trợ, không tự đủ để tạo UC mới.
5. Nếu gộp, chức năng có còn được truy vết và kiểm thử tại UC sở hữu không? Không được dùng “gộp UC” để bỏ scope.

Một hành động vẫn có thể là UC nếu hoàn tất mục tiêu có giá trị. Ngược lại, một chức năng có nhiều API chưa chắc cần nhiều UC. Không ép số bước, số phút, số trang, số UC hoặc một feature tương ứng đúng một oval. Những quyết định dưới đây là áp dụng cho CoLearnia, không phải quy tắc UML bắt buộc mọi dự án làm giống nhau.

## 2. Kết quả review toàn bộ danh mục

| Nhóm mã ứng viên ban đầu | Kết luận đề xuất                                                    | Lý do và nơi giữ chức năng                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-01/02/03             | Đặt trực tiếp trên tổng quan, không làm một sơ đồ tài khoản riêng   | Chức năng truy cập chung theo chỉ đạo người dùng. Đăng nhập nối actor chung A-00; điều kiện xác thực ở UC nghiệp vụ, không include Đăng nhập khắp nơi                                                                           |
| WS-01, WS-04             | Giữ tạo và xóa Workspace                                            | Một việc thiết lập không gian, một việc chấm dứt không gian cùng hậu quả quyền/tài nguyên; không xem xóa là nhánh tạo                                                                                                           |
| WS-02                    | Giữ mục tiêu tìm lại/truy cập Workspace của mình                    | Người quay lại để tiếp tục học trong không gian có sẵn; không bắt tạo Workspace. Phân trang/chọn một dòng vẫn chỉ là bước, không UC con                                                                                         |
| WS-03, WS-13             | Giữ ở sơ đồ chi tiết quản lý, không đưa lên tổng quan               | Đổi tên thực hiện độc lập trên đối tượng có sẵn, có quyền và kết quả lưu lại. Không tự bịa thêm trường cài đặt để làm luồng dài. Nếu sơ đồ quá dày có thể gom thành Quản lý Workspace/kênh, vẫn giữ các biến thể và actor/quyền |
| WS-05/06/07              | Giữ tạo lời mời, thu hồi và tham gia qua lời mời                    | Actor quản trị và người nhận khác nhau, thực hiện khác thời điểm; thu hồi làm link ngừng dùng mà không phải tạo lời mời lại                                                                                                     |
| WS-08                    | Giữ xem thành viên                                                  | Có nhu cầu tra cứu người trong Workspace ngoài cuộc gọi; không chỉ là mở danh sách tạm trong một form. Chọn người để DM/phân quyền là bước có thể dùng kết quả này, không bắt include máy móc                                   |
| WS-09/10/11              | Giữ đổi role, loại thành viên và chuyển owner                       | Kết quả quản trị khác nhau, có ràng buộc owner/admin riêng. “Quản lý thành viên” là góc nhìn tổng hợp, không ép ba việc thành một luồng tuyến tính                                                                              |
| WS-12/14                 | Giữ tạo/xóa kênh                                                    | Thiết lập hoặc kết thúc nơi trao đổi, có tác động lên hội thoại và phiên LIVE; không chỉ thao tác điều hướng                                                                                                                    |
| MSG-01/02                | Giữ gửi tin và xem hội thoại kênh                                   | Có thể chỉ đọc thông tin mà không gửi, hoặc gửi nội dung để cộng tác. Xem lịch sử là kết quả thông tin, không bị loại chỉ vì không ghi dữ liệu                                                                                  |
| MSG-03                   | Gộp vào MSG-04/05                                                   | Chọn người, tìm/tạo lại conversation và mở panel phục vụ gửi/đọc DM; unique cặp, danh sách DM và ACL vẫn là yêu cầu trong các luồng này                                                                                         |
| MSG-04/05                | Giữ gửi và xem DM                                                   | Hai mục tiêu giao tiếp/tra cứu có thể xảy ra độc lập; giữ giới hạn hai bên và Workspace, không chia theo text/ảnh/file                                                                                                          |
| MSG-06/07                | Giữ MSG-06 với tên Thảo luận theo thread; gộp MSG-07 vào đó         | Một chức năng đọc/trả lời quanh tin gốc; đủ một UC có luồng chỉ đọc và luồng trả lời. Reply count, mở panel và phân trang là các bước                                                                                           |
| MSG-08                   | Giữ tải tệp đính kèm                                                | Người dùng cần lấy tài liệu về để sử dụng; có kết quả ngoài việc xem tin. Upload/chọn file khi gửi tin không tự tách thêm UC                                                                                                    |
| LIVE-01/02               | Giữ vào và rời cuộc họp                                             | Xác lập hoặc kết thúc sự tham gia với kết quả quyền/tài nguyên riêng; tự về MAIN không thay rời LIVE                                                                                                                            |
| LIVE-03                  | Đưa vào LIVE-01/04                                                  | Danh sách người tham gia là thông tin phục vụ theo dõi/trao đổi trong call; chưa có chức năng tra cứu/lọc/báo cáo người tham dự độc lập để cần một UC riêng                                                                     |
| LIVE-04/07               | Giữ LIVE-04 với tên Trao đổi bằng mic và camera; đưa LIVE-07 vào đó | Kết quả là giao tiếp nghe/nhìn đúng audience; chọn thiết bị, bật/tắt và chỉnh âm lượng là điều chỉnh trong quá trình. AUDIO-01 vẫn đầy đủ và có tiêu chí riêng                                                                  |
| LIVE-05/06               | Giữ LIVE-05 bao phủ vòng share; gộp dừng share                      | Chia sẻ gồm chọn nguồn, bắt đầu, truyền và chủ động dừng của mình. Browser Stop/mất quyền là nhánh; không có mục tiêu quản trị mới như dừng nguồn của người khác                                                                |
| LIVE-08/09               | Giữ hai UC chat Everyone và Host                                    | Scope công khai hiện tại khác hội thoại riêng với đúng host; tách giúp đặc tả tránh gửi nhầm audience. Trong mỗi UC gom gửi/đọc, không tách chọn đích, upload ảnh, mở lịch sử thành oval                                        |
| LIVE-10                  | Giữ kết thúc cuộc họp                                               | Host kết thúc phiên cho mọi người; khác việc tự rời hoặc chỉ kết thúc chia nhóm                                                                                                                                                 |
| GRP-01                   | Giữ chuyển host chủ động                                            | Cập nhật 01/11: host gán trực tiếp, không cần người nhận chấp nhận; khác việc tự động thay tạm/hoàn quyền khi mất mạng, vốn là nhánh phục hồi                                                                                   |
| GRP-02/03/04             | Giữ yêu cầu, xét duyệt và vào DISCUSSION                            | Mỗi mục tiêu có actor/thời điểm/kết quả riêng. Được duyệt không nghĩa đã vào; không ép thành một UC buộc mọi người thao tác ngay                                                                                                |
| GRP-05/06                | Giữ chuẩn bị và bắt đầu ACTIVITY                                    | Chuẩn bị lưu cấu hình nhóm mà chưa chuyển người; bắt đầu thay phase và quyền hiện tại. Không tách từng lần chọn người/đặt tên thành UC                                                                                          |
| GRP-07                   | Giữ chuyển thành viên giữa các phạm vi                              | Host có thể điều chỉnh phân nhóm đang diễn ra, không buộc bắt đầu lượt lại; thu scope cũ và cấp scope mới là hậu điều kiện quan trọng                                                                                           |
| GRP-08/09/10             | GRP-08 tự về MAIN; GRP-09 đóng một/tất cả DISCUSSION, GRP-10 gộp    | Cập nhật 29/10: ACTIVITY tự kết thúc theo deadline, không có thao tác host đóng riêng/toàn lượt. DISCUSSION giữ quyền host đóng; mã giữ để truy vết                                                                             |
| GRP-11                   | Giữ thiết lập thời lượng hoạt động                                  | Host thiết lập một countdown dùng chung có trạng thái và kết quả cho cả lượt. Xem thời gian và tự kết thúc ACTIVITY/về MAIN khi deadline hết là luồng hệ thống; không thêm oval tự động hoặc actor hệ thống                     |
| GRP-12/13                | Giữ hỗ trợ riêng và thông báo chung                                 | Audience và mục tiêu khác nhau. Vào/trao đổi/rời hỗ trợ là một vòng hỗ trợ; không chia thành ba oval nhỏ. Thông báo không mở đường phát vào ACTIVITY                                                                            |
| BOARD-01/05              | Giữ dừng hình và trở lại trực tiếp                                  | Chuyển trạng thái chung của cả scope, người dùng có thể dừng để đọc không vẽ hoặc resume sau cộng tác. Không gộp vào vẽ như bước bắt buộc                                                                                       |
| BOARD-02/03/04           | Giữ BOARD-02, đưa undo/clear vào luồng vẽ                           | Undo là sửa nét mình, clear là dọn nét có quyền/xác nhận trong cùng chức năng. ACL clear vẫn phải đặc tả/test riêng; không tạo quyền clear cho mọi người chỉ vì gộp                                                             |

Các mã trong bảng lược tiền tố `UC-`. Tổng hiện hành sau bổ sung WS-15 ngày 01/11: 54 mục đã rà, gồm 43 UC nghiệp vụ giữ độc lập, 3 UC truy cập chung và 8 mục gộp/đưa vào luồng. Đây là kết quả phân tích hiện tại, không mục tiêu số lượng cần bảo vệ trong các lượt review sau.

## 3. Kiểm tính nhất quán trước Astah

- Tổng quan có 5 mục tiêu tổng hợp cần phân rã TQ-02/03/04/05/07 và nhóm truy cập chung trực tiếp. TQ-01 không còn một oval Sử dụng tài khoản rồi lại phân rã chỉ ba oval đăng ký/nhập/xuất.
- Nhóm truy cập là ngoại lệ trình bày được chỉ định rõ; không dùng ngoại lệ này để đưa chọn màu, tắt camera hoặc upload file lên cùng tầng các miền nghiệp vụ.
- Generalization giữa actor kế thừa tương tác chung, không gộp mọi quyền. Theo mô hình 5 actor hiện hành, đăng ký/đăng nhập/đăng xuất nối A-00; trạng thái xác thực và điều kiện thực hiện ghi trong UC, không tạo actor riêng cho trạng thái đăng nhập.
- Cập nhật theo xác nhận ngày 29/10/2026: gộp A-01/A-02 vào Người dùng hệ thống (A-00), gộp A-06 vào Thành viên Workspace (A-03). Chưa/có phiên và đã vào cuộc họp là điều kiện thực hiện; sơ đồ giữ 5 actor theo bản tổng quan.
- Danh mục có thể giữ UC đọc và gửi riêng ở một miền, gom đọc/trả lời ở miền khác nếu mục tiêu và độ phức tạp giải thích được. Nếu luồng thực cho thấy gom/tách khác hợp lý hơn, điều chỉnh trước sơ đồ; không ép mọi cuộc hội thoại cùng số oval.
- Nhánh hệ thống tự chuyển host, reconnect, dedupe, timeout/cleanup không biến hệ thống nội bộ thành actor. Ghi chúng trong luồng và yêu cầu xuyên suốt, không bỏ khỏi đặc tả.
- Mục được gộp vẫn có mã truy vết nhưng không vẽ oval riêng hoặc nối include chỉ để giữ mã. Không giảm kiểm thử quyền, lỗi và lifecycle vì số UC giảm.

## 4. Điểm tiếp theo cần làm

Đã có [6 hồ sơ đặc tả trọng tâm](use-cases/README.md) theo phiên bản tại mục lục; không viết đặc tả riêng cho toàn bộ danh mục. Dùng các luồng này để kiểm ranh giới trước khi dựng sơ đồ chi tiết. Chỉ quyết định include/extend khi chỉ ra được hành vi dùng chung hoặc extension point thật. Host chủ động rời khi còn quyền đã chốt kết thúc phiên cho mọi người; nhánh không có ứng viên/host tạm mất mạng vẫn lấy trạng thái mở tại nguồn; DM rejoin đã chốt ngày 01/11; không dùng review UC để tự chốt nghiệp vụ.

## Xác nhận sau review

Người dùng đã đồng ý phần review và chỉnh sửa: actor chung cho đăng nhập, nhóm truy cập trực tiếp trên tổng quan, 5 mục tiêu nghiệp vụ tổng hợp TQ-02/03/04/05/07 và danh mục 43 UC nghiệp vụ + 3 UC truy cập chung; 8 mục gộp vẫn được giữ chức năng trong luồng sở hữu. Đây là baseline phân tích UC, không xác nhận feature đã triển khai. Đã có 6 hồ sơ đặc tả và [file Astah tổng quan](diagrams/README.md) với 5 actor, 8 oval theo bố cục ngang; trạng thái font/ảnh xuất theo README bản vẽ. Đã có các hình phân rã; chênh lệch còn lại ghi tại README bản vẽ; các điểm nghiệp vụ còn mở tại nguồn vẫn giữ nguyên.

Cập nhật theo xác nhận ngày 29/10/2026: tách mục tiêu nhóm thành TQ-05 (tham gia, Thành viên Workspace) và TQ-07 (điều hành, Host). Không lặp liên kết Host tới TQ-05 đã kế thừa; không đổi danh mục UC chi tiết hoặc scope.

Review ranh giới tiếp theo: cộng tác khung hình là chức năng trong trải nghiệm cuộc họp TQ-04, không đặt thêm TQ-06 cùng tầng tổng quan. Giữ UC-BOARD chi tiết và scope, không tự thêm include/extend. Tổng quan hiện có 8 oval và 5 actor.

## Bổ sung quyền kênh ngày 01/11/2026

UC-WS-15 “Quản lý quyền truy cập kênh” được người dùng đồng ý cho kênh PRIVATE. Đây là mục tiêu quản lý danh sách truy cập sau tạo, khác tạo/đổi tên/xóa kênh, không phải hành động kỹ thuật nội bộ. Thêm/gỡ nằm trong cùng UC; actor A-04/A-05 không mặc nhiên có quyền đọc nội dung. Danh mục hiện hành có 54 mục được truy vết: 43 UC nghiệp vụ, 3 truy cập chung, 8 gộp. Các nhận xét review ban đầu bên trên là lịch sử trước bổ sung này.

**Xác nhận gộp ngày 01/11:** một mục tiêu “Kết thúc nhóm trao đổi” dùng GRP-09, chọn một/tất cả là hai nhánh. GRP-10 giữ mã truy vết đã gộp. Tổng hiện hành là 46 UC (43 nghiệp vụ + 3 truy cập), 8 mục gộp; không bảo vệ số lượng cũ khi đã thống nhất gộp.

## Phạm vi cập nhật 02/11/2026

Bảng review 27/10 giữ lý do giữ/gộp UC. Quyền board hiện hành đã thay đổi: MAIN chỉ host vẽ LIVE, không freeze/resume; BOARD-01/05 chỉ DISCUSSION/ACTIVITY. Xem [catalog](use-case-catalog.md) và [board](board-collaboration.md); không dùng mô tả cả scope ở bảng lịch sử để cấp quyền MAIN.
