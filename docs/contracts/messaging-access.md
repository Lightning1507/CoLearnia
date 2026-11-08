# SCRUM-14 — Thống nhất cách phần chat nhận danh tính, tạo general và thu quyền

## 1. Task này để làm gì?

CoLearnia được chia thành nhiều phần do các thành viên khác nhau phụ trách. **M1** quản lý tài khoản, Workspace và quyền vào kênh. **M2** quản lý tin nhắn và tệp. **M4** quản lý phòng họp, nhóm và người đang tham gia từng phòng.

Một thao tác như gửi tin nhắn cần cả ba phần phối hợp: M2 phải biết người gửi là ai, người đó còn được vào kênh hay nhóm không, rồi mới lưu và gửi tin cho đúng người. Nếu mỗi phần tự hiểu một cách, hệ thống có thể gửi nhầm nội dung riêng tư hoặc tiếp tục cho người đã bị loại tải tệp.

**SCRUM-14 là task thống nhất cách các phần trao đổi với nhau trước khi triển khai những chức năng đó.** Tài liệu này trả lời năm câu hỏi:

1. M2 lấy thông tin người đang đăng nhập từ đâu?
2. Khi tạo Workspace, M1 gọi phần của M2 thế nào để có đủ kênh trò chuyện `general`?
3. M2 hỏi quyền đọc, gửi, nhận tin và tải tệp bằng cách nào?
4. Khi một người mất quyền, M1/M4 báo cho M2 ra sao và M2 phải dừng những gì?
5. Các phần phải xử lý theo thứ tự nào, với giới hạn tài nguyên nào, để không gây sai quyền hoặc nghẽn hệ thống?

**Trạng thái hiện tại:** đã có bản mô tả, khai báo TypeScript và ví dụ kiểm tra để gửi review. Chưa có xác nhận của M1/M4; task chưa đủ điều kiện chuyển Done. Những phần này chưa phải chức năng đăng nhập, chat, tạo Workspace hoặc thu quyền đã chạy đầy đủ trong sản phẩm.

## 2. Ai chịu trách nhiệm phần nào?

| Bên phụ trách               | Trách nhiệm trong thỏa thuận này                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 — tài khoản và Workspace | Xác nhận người đăng nhập; kiểm quyền Workspace/kênh; điều phối việc lưu đủ dữ liệu khi tạo Workspace; quyết định và lưu thay đổi quyền thuộc phần mình.            |
| M2 — chat và tệp            | Dùng thông tin đã được xác nhận để xử lý tin/tệp; cung cấp cách tạo hội thoại cho general; dừng việc gửi/nhận/tải khi được thông báo thu quyền.                    |
| M4 — phòng họp và nhóm      | Xác nhận người dùng đang ở phòng/nhóm nào, nhóm còn mở không, ai là host và lượt hoạt động còn thời gian không; điều phối việc đóng hoặc chuyển phạm vi phòng họp. |
| M1 — reviewer chính         | Đọc và xác nhận cách phối hợp đáp ứng yêu cầu task.                                                                                                                |
| M4 và bên sử dụng liên quan | Xác nhận phần phòng họp, đóng tài nguyên và cách gọi có dùng được khi triển khai tiếp.                                                                             |

Nguồn áp dụng: [quy tắc chat](../product/messaging.md), [kiến trúc](../architecture.md), [quy tắc khóa và lưu dữ liệu](../database/integrity-and-migrations.md#41-cơ-chế-chung), [thiết kế tệp và dấu kiểm quyền](../database/collection-design.md#310-files), [giới hạn vận hành](../capacity.md), [kế hoạch Sprint 1](../planning/sprint-1.md) và [WBS của M2](../proposals/m2-messaging-files.md#9-wbs). Tài liệu này cụ thể hóa cách phối hợp; không tự thay thiết kế dữ liệu hay quy tắc sản phẩm tại các nguồn đó.

## 3. Nhận danh tính và kiểm tra quyền

### 3.1. Hệ thống phải biết chắc người đang thao tác là ai

Ví dụ, khi An gửi tin, máy chủ phải xác nhận đó là An qua phiên đăng nhập. Hệ thống không được tin một dòng dữ liệu do trình duyệt tự gửi với ý nghĩa “tôi là An” hoặc “tôi là admin”. Người dùng có thể sửa dữ liệu gửi từ trình duyệt.

M1 cung cấp thông tin đã xác nhận, gồm mã người dùng, mã phiên đăng nhập và thời điểm hết hạn. M2 dùng lại thông tin này, không tự xây một cách nhận diện người dùng khác. Tên trong mã nguồn là `AuthenticatedContext`, đã có ở task SCRUM-12.

Ngay cả khi thông tin có đủ trường và đúng định dạng, M2 vẫn phải hỏi lại xem phiên đăng nhập **còn hiệu lực tại thời điểm thực hiện** không. Một phiên có thể vừa bị đăng xuất hoặc thu hồi sau lần kiểm trước. Việc kết nối lại cũng không tự giữ nguyên quyền cũ.

### 3.2. M2 gửi gì khi hỏi quyền, và nhận lại gì?

Cách gọi được khai báo tại `MessagingAccessPort.authorize` trong `apps/server/src/messaging/ports.ts`.

| Thông tin gửi vào | Ý nghĩa                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `actor`           | Thông tin người đăng nhập do M1 xác nhận.                                                                |
| `target`          | Nơi người dùng muốn thao tác: hội thoại trong kênh, tin nhắn riêng hoặc chat trong phòng họp/nhóm.       |
| `action`          | Việc muốn làm: đọc (`read`), gửi (`send`), đăng ký nhận tin mới (`subscribe`) hoặc tải tệp (`download`). |
| `signal`          | Tín hiệu để dừng công việc khi mất kết nối, hết thời gian xử lý hoặc bị thu quyền. Do máy chủ tạo.       |

Nếu được phép, kết quả là thông tin quyền **vừa được kiểm tra**: người đăng nhập, Workspace, hội thoại, tư cách thành viên và các số phiên bản cần đối chiếu. Với chat cuộc họp còn có phòng/nhóm, kết nối hiện hành và thời điểm hết giờ nếu là ACTIVITY. Nếu không được phép hoặc không thể xác nhận, trả mã lỗi ở mục 8.

Các mã hội thoại và phòng do người dùng gửi chỉ giúp chỉ ra nơi muốn thao tác. Máy chủ phải tự tra lại xem nơi đó có tồn tại, có thuộc đúng Workspace và có phù hợp với loại thao tác không.

### 3.3. Các trường hợp quyền cần phân biệt

| Loại trò chuyện                    | Quy tắc cần giữ                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kênh TEXT, kể cả thread            | Cần là thành viên Workspace hợp lệ và có quyền vào kênh. Quyền áp dụng cả tin gốc, trả lời, số trả lời, thông báo tin mới và tệp.                                                                      |
| Kênh PRIVATE                       | Phải được cấp quyền vào chính kênh đó. Owner/admin có thể quản lý danh sách nhưng không được đọc nội dung chỉ vì vai trò quản lý.                                                                      |
| Tin nhắn riêng 1–1 — DIRECT/DM     | Chỉ đúng hai bên được đọc/gửi; cả hai phải có tư cách thành viên Workspace còn hiệu lực. Admin/host không được đọc thay. Không yêu cầu người dùng đang ở cuộc gọi.                                     |
| Chat phòng họp/nhóm                | Kiểm thêm vị trí tham gia thực tế, nhóm còn mở và thời gian còn hiệu lực. Có tên trong danh sách dự kiến chưa có nghĩa đã vào nhóm.                                                                    |
| Chat riêng với host — HOST_PRIVATE | Giữ đúng hai bên ban đầu. Host mới không được đọc cuộc trò chuyện riêng của host cũ. Nếu gửi câu hỏi mới đến host đã thay đổi, báo trạng thái đã đổi, không tự chuyển người nhận hoặc gửi ra Everyone. |

Host chỉ vào hỗ trợ ACTIVITY. DISCUSSION mất kết nối thì mất tư cách tham gia nhóm ngay; kết nối lại không tự mở quyền nhóm cũ. Các chi tiết phòng họp tiếp tục theo nguồn sản phẩm và task M4-T1.2/M2-T6.1.

### 3.4. Vì sao phải kiểm lại thao tác đang chờ?

Một người có thể bắt đầu tải ảnh lên khi còn quyền, rồi bị loại khỏi kênh trước lúc tải xong. Lần kiểm đầu không đủ để cho phép gắn ảnh vào tin nhắn ở cuối quá trình.

Vì vậy, hệ thống lưu một **dấu đối chiếu của lần kiểm quyền** cho công việc đang chờ. Trước khi hoàn tất, hệ thống kiểm quyền hiện tại một lần nữa rồi so với dấu cũ. Nếu thành viên, quyền kênh, kết nối hoặc lượt hoạt động đã đổi, thao tác cũ không được tự tiếp tục.

Hàm `isMessagingAuthorizationCurrent` hỗ trợ bước so sánh này. Nó không tự quyết định ai có quyền. Đưa hai bản thông tin cũ vào hàm, dù chúng giống nhau, cũng không chứng minh quyền hiện tại còn hợp lệ.

Đối với tệp đã hoàn tất và lịch sử còn được lưu, quyền xem được kiểm theo **quyền hiện tại**. Không dùng quy tắc chặn thao tác đang chờ để vô tình cấm người vừa được thêm lại đọc lịch sử mà sản phẩm cho phép.

## 4. Tạo general đầy đủ khi tạo Workspace

### 4.1. Kết quả cần bảo đảm

Khi người dùng tạo Workspace thành công, hệ thống phải có đủ bốn phần: Workspace, tư cách thành viên owner, kênh TEXT tên `general` cho thành viên Workspace và hội thoại gắn với kênh đó.

**Cả bốn phần cùng được tạo thành công, hoặc không phần nào được lưu thành công trong lần tạo đó.** Không trả thông báo tạo Workspace thành công rồi mới tạo general bằng một yêu cầu khác.

M1 điều phối toàn bộ lần lưu. M2 chỉ cung cấp thao tác tạo hội thoại của general, tên trong mã nguồn là `GeneralConversationFactory.create`.

| Thông tin trao đổi                                               | Ý nghĩa                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| M1 gửi `workspaceId`, `channelId`, `conversationId`, `createdAt` | Mã và thời gian đã chuẩn bị cho lần tạo, giữ ổn định nếu cơ chế lưu phải thử lại.                               |
| M1 gửi `dbSession`                                               | Để phần của M2 tham gia đúng lần lưu dữ liệu mà M1 đang điều phối. Đây không phải phiên đăng nhập hay cuộc gọi. |
| M2 trả `conversationId`                                          | Xác nhận thao tác tạo hội thoại đã thực hiện trong lần lưu chung; chưa có nghĩa toàn bộ lần lưu đã hoàn tất.    |

### 4.2. Trình tự xử lý và khi có lỗi

1. M1 kiểm quyền và chuẩn bị mã/thời gian trước khi bắt đầu khối lưu có thể được hệ thống chạy lại.
2. Tạo tuần tự Workspace, thành viên owner, kênh general rồi gọi M2 tạo hội thoại. Tất cả dùng cùng phiên làm việc với cơ sở dữ liệu.
3. M2 không mở kết nối hoặc lần lưu riêng. Trong khối lưu chung cũng không gửi thông báo, gọi kho tệp hoặc làm công việc bên ngoài có thể bị lặp khi thử lại.
4. Nếu M2 gặp lỗi, phải báo lỗi lên M1 để hủy cả lần lưu; không bỏ qua rồi báo thành công.
5. Nếu mất phản hồi và chưa biết dữ liệu đã được lưu hay chưa, M1 đọc lại theo các mã đã chuẩn bị, kiểm đủ bốn phần rồi mới quyết định. Không tạo bộ mã mới để thử lại ngay, không khẳng định đã hủy khi chưa xác minh.

Việc đọc lại dùng máy chủ dữ liệu chính. Lỗi trùng dữ liệu không mặc nhiên có nghĩa lần thử trước đã thành công; cần đối chiếu đúng thao tác và các quan hệ dữ liệu. Nếu chưa thể xác nhận, báo `DEPENDENCY_UNAVAILABLE` và xử lý tiếp theo quy định của M1.

SCRUM-14 quy định cách gọi. SCRUM-15 cung cấp kết nối và transaction chung. Xem [cách dùng model và hàm tạo hội thoại của SCRUM-31](conversation-persistence.md) để nối vào luồng M1 và đối chiếu ca rollback trên MongoDB.

General là kênh mặc định lúc tạo Workspace, không tự được bổ sung quy tắc cấm xóa hoặc tự tạo lại sau khi xóa.

## 5. Khi bị gỡ quyền, hệ thống phải làm gì?

### 5.1. Chặn quyền trước, dừng các công việc cũ sau

Ví dụ, An đang đọc kênh PRIVATE và tải một tệp thì bị gỡ khỏi kênh. Hệ thống phải chặn ngay các yêu cầu đọc/gửi/tải tiếp của An, đồng thời dừng những đường đang cấp nội dung cho An. Chỉ ẩn kênh trên giao diện là chưa đủ.

M1 hoặc M4 quyết định thay đổi quyền thuộc phần mình. M2 nhận thông báo để dừng tin nhắn và tệp. Trình tự phối hợp:

1. **Chặn ngay việc sử dụng quyền cũ.** Bước này phải chạy được kể cả khi nhiều yêu cầu chat đang chờ.
2. **Ghi nhận những công việc cũ cần dừng.** Bao gồm tin đang chờ gửi, đăng ký nhận tin mới, tải lên, tải xuống và công việc ghi tệp liên quan.
3. **Dừng cấp nội dung.** Hủy công việc chờ, ngừng gửi tin mới, rời nơi nhận tin trên kết nối và dừng cả việc đọc tệp từ kho lẫn truyền tệp về người dùng.
4. **Báo kết quả đúng thực tế.** Chỉ báo đã dừng khi các tài nguyên liên quan đã ngừng cấp nội dung. Công việc xóa tệp dài hoặc kết quả lưu chưa rõ được ghi nhận để đối soát theo quy định vòng đời dữ liệu.

Không giữ khóa phòng họp trong lúc chờ xóa tệp hoặc chờ mạng lâu. Không xóa lịch sử đã hoàn tất chỉ vì một người vừa bị thu quyền, nếu quy định lưu trữ không yêu cầu xóa. Dữ liệu đã gửi đến máy người nhận không thể được thu hồi tuyệt đối.

### 5.2. Cách M1/M4 gọi phần dừng của M2

Khai báo nằm ở `MessagingRevocationPort`.

| Thông tin                   | Ý nghĩa                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `revocationId`              | Mã của một lần thu quyền; dùng lại đúng mã khi thử dừng lại lần nữa.                                                                                                             |
| `target`                    | Phạm vi bị thu: một phiên đăng nhập, toàn bộ người dùng, Workspace, kênh hoặc phòng/nhóm cụ thể. Với Workspace/kênh/phòng, có thể áp cho một người hoặc mọi người trong phạm vi. |
| `throughResourceGeneration` | Mốc đánh dấu những công việc đã tồn tại khi thu quyền. Lần dọn cũ chỉ được dừng công việc đến mốc này.                                                                           |
| `deadlineMs`, `signal`      | Hạn xử lý và tín hiệu dừng do máy chủ điều phối. Không chờ vô hạn.                                                                                                               |

Sau khi chặn quyền, M1/M4 gọi `fence` để M2 ghi nhận mốc công việc cũ, rồi gọi `revoke` để dừng chúng. Bước chặn và ghi nhận mốc phải được phối hợp trong cùng vùng xử lý được bảo vệ, tránh công việc cũ chen vào giữa.

Nếu gọi lại cùng mã và cùng phạm vi, phải nhận lại mốc cũ. Không dùng lại một mã cho phạm vi khác. Lần dọn cũ không được dừng kết nối hoặc công việc mới được mở hợp lệ sau một lần cấp quyền mới.

Kết quả `completed` nghĩa là phần dừng tài nguyên M2 đã hoàn tất theo điều kiện trên. Kết quả `blocked` kèm `retryRequired: true`, hoặc lỗi khi gọi, nghĩa là chưa hoàn tất: giữ chặn và xử lý lại có giới hạn. Không tự cấp lại quyền để che lỗi. Chỉ bên quản lý quyền, sau khi xác minh dữ liệu và thực hiện đúng luồng cấp quyền mới, mới có thể cho phép truy cập trở lại.

### 5.3. Ví dụ: thêm lại không làm công việc cũ sống lại

**An tải ảnh vào kênh PRIVATE rồi bị gỡ:** ảnh chưa hoàn tất phải bị hủy hoặc từ chối khi hoàn tất. Nếu An được thêm lại, An có thể đọc lịch sử còn lưu theo quyền mới, nhưng lần tải ảnh cũ không được tự chạy tiếp. An phải bắt đầu thao tác mới.

**An bị loại khỏi Workspace rồi được mời lại:** nếu cả An và Bình đều có tư cách thành viên hợp lệ, hai người có thể đọc lại lịch sử DM còn lưu. Tuy nhiên, An không tự được vào các kênh PRIVATE trước đây; owner/admin phải thêm lại. Các công việc tải tệp đang chờ từ lần tham gia cũ vẫn bị chặn.

**An đăng xuất rồi đăng nhập lại:** kết nối và tải tệp của phiên đăng nhập cũ phải dừng. Phiên mới được kiểm riêng. Đăng xuất một phiên không mặc nhiên đăng xuất các phiên khác; thay đổi mật khẩu hoặc thu toàn bộ phiên theo quy tắc của M1.

**Nhóm ACTIVITY hết giờ trong lúc đang lưu tin:** dù tin có thể đã được lưu, hệ thống không được phát nội dung vào nhóm đã hết hiệu lực. Người dùng trở về MAIN theo quy định; lần dọn nhóm cũ không được đóng tài nguyên MAIN hoặc lượt hoạt động mới.

**Việc lưu thay đổi quyền hoặc dừng tài nguyên gặp lỗi:** giữ trạng thái chặn, xác minh lại dữ liệu và báo chưa hoàn tất. Không tự phục hồi quyền cũ chỉ để coi thao tác thất bại đã được hoàn tác.

## 6. Các phần phải xử lý theo thứ tự nào?

### 6.1. Vì sao cần thứ tự chung?

Gửi tin và gỡ người khỏi kênh có thể xảy ra gần như cùng lúc. Nếu mỗi phần tự xử lý riêng, phần gửi tin có thể kiểm quyền cũ rồi tiếp tục phát nội dung sau khi người nhận đã bị loại.

Hệ thống cần các vùng xử lý mà những thao tác liên quan phải lần lượt đi qua. Trong mã và tài liệu kỹ thuật, chúng được gọi là **khóa** hoặc **cổng điều phối**. M2 phải dùng cơ chế chung với M1/M4, không tự tạo cơ chế khác để cùng kiểm soát một việc.

Thứ tự chung theo kiến trúc:

**Tài khoản người dùng, khi cần → Workspace → kênh → phiên họp.**

Chỉ giữ những khóa cần cho thao tác. Khi đã ở trong phần phiên họp, không quay ngược để chờ khóa Workspace. Không giữ hai hàng xử lý phiên họp cùng lúc. Công việc chạy nền phải thoát vùng xử lý bên trong trước khi yêu cầu điều phối lại từ bên ngoài.

### 6.2. Một thao tác gửi hoặc tải tệp đi qua các bước nào?

| Bước                          | Việc hệ thống làm và lý do                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhận yêu cầu                  | Kiểm còn chỗ xử lý, dữ liệu có vượt kích thước không và công việc có thể bị hủy khi cần không. Tránh nhận vô hạn rồi mới báo quá tải.          |
| Kiểm quyền ban đầu            | Kiểm người dùng và nơi thao tác, ghi nhận thông tin quyền của lần này.                                                                         |
| Thực hiện việc lâu            | Tải tệp, xử lý ảnh hoặc gọi dịch vụ ngoài không được giữ khóa chung suốt thời gian chờ. Nếu giữ, các thao tác gỡ quyền có thể bị mắc phía sau. |
| Hoàn tất lưu                  | Đi vào các vùng xử lý theo đúng thứ tự; kiểm lại quyền, thời gian và thông tin đã ghi nhận rồi mới lưu phần dữ liệu cần thiết.                 |
| Trả nội dung hoặc gửi tin mới | Kiểm người nhận vẫn còn quyền, nhóm chưa hết giờ. Chỉ gửi tới đúng người được phép.                                                            |
| Dừng và giải phóng            | Khi thành công, lỗi, hết hạn hoặc bị thu quyền, giải phóng phần tài nguyên đã giữ và ghi nhận những việc chưa rõ để xác minh.                  |

Kết nối nhận tin và đường tải tệp phải được ghi nhận trước khi rời vùng xử lý được bảo vệ, để thao tác thu quyền tìm và dừng được chúng. Không giữ khóa trong suốt lượt tải. Các yêu cầu tải tiếp một đoạn tệp cũng phải kiểm lại quyền.

Không gửi nội dung riêng tư cho cả Workspace rồi trông chờ giao diện che đi. Không đợi bộ nhớ quyền cũ tự hết hạn mới chặn người đã bị loại. Nếu kết quả lưu dữ liệu chưa rõ, phải đọc lại và đối soát, không tuyên bố đã hoàn tác khi chưa có bằng chứng.

## 7. Giới hạn xử lý để hệ thống không bị quá tải

### 7.1. Task này chốt phần nào?

SCRUM-14 đưa ra **những loại giới hạn phải có và cách kiểm chúng**, chưa tự chọn mọi con số để chạy thật. Khai báo kiểm cấu hình nằm ở `apps/server/src/messaging/budget.ts`, tên là `messagingBudgetSchema`.

Mục đích là tránh trường hợp nhiều người cùng gửi tin hoặc tải tệp khiến máy chủ hết chỗ xử lý, trong khi việc thu quyền lại không chạy được. Giới hạn phải áp dụng cho tổng ứng dụng, không chỉ kiểm riêng từng người.

| Phải giới hạn gì?                    | Ý nghĩa thực tế                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Số việc đang chạy và đang chờ        | Máy chủ chỉ nhận số lượng có thể kiểm soát; không tạo hàng chờ vô hạn.                                                 |
| Tổng lượng dữ liệu đang giữ          | Tính cả dữ liệu đang xử lý và phần đã giữ chỗ, tránh đầy bộ nhớ khi nhiều người tải cùng lúc.                          |
| Theo người và phạm vi                | Một người hoặc một Workspace/nhóm không được dùng hết phần xử lý chung.                                                |
| Kích thước và thời gian từng yêu cầu | Có mức tối đa cho dữ liệu, thời gian chờ và thời gian xử lý; hết hạn phải dừng công việc liên quan.                    |
| Kết nối cơ sở dữ liệu                | M1 quản lý tập kết nối dùng chung và thời gian chờ; M2 không tạo kết nối riêng cho mỗi người.                          |
| Phần dành cho thu quyền              | Công việc thường không được chiếm hết khả năng xử lý. Khi quá tải vẫn phải chặn quyền ngay và dừng được tài nguyên cũ. |

M2 phụ trách giới hạn chat/tệp; M1 phụ trách kết nối dữ liệu và cổng điều phối chung; M4 phụ trách xử lý phiên họp và đóng nhóm. Cần review tổng tài nguyên cùng media, không tính mỗi phần như có một máy chủ riêng.

### 7.2. Điều kiện trước khi bật chức năng nhận yêu cầu thật

Loại thao tác chưa có cấu hình hoặc cấu hình chưa được review thì chưa bật. Các số phải hữu hạn và hợp lệ; mức con không được vượt mức cha. Không lấy các con số trong bài kiểm tra làm cấu hình đã được nhóm duyệt.

Bản thân cấu hình đúng chưa đủ. Khi triển khai thật, hệ thống phải kiểm cả giới hạn chung và giới hạn từng loại cùng lúc, giữ chỗ trước khi nhận việc và trả chỗ đúng một lần khi việc kết thúc. Ví dụ: tải ảnh và tải video đều chưa chạm giới hạn riêng, nhưng cộng lại có thể đã vượt giới hạn tổng.

Giữ mức khởi đầu đã có trong proposal: gửi 5 tin/giây/người, đợt ngắn tối đa 10 tin; tải lên tối đa 2 lượt/người. Đây là giới hạn bổ sung, không thay giới hạn toàn ứng dụng. Tệp, ảnh bảng, avatar và recording còn cần hạn mức dung lượng và giới hạn riêng tại task tương ứng; không tự chọn quota hoặc thời gian lưu tại đây.

Khi hết chỗ hoặc hết thời gian xử lý, từ chối rõ ràng và dừng công việc liên quan. Hết thời gian chờ một lời gọi không tự chứng minh việc xử lý bên dưới đã dừng. Nếu yêu cầu có thể đã lưu dữ liệu, cần xác minh trước khi thử lại để tránh tạo trùng.

Trước khi bật, task triển khai phải thử nhiều người cùng dùng, nhiều loại thao tác chạy chung, cơ sở dữ liệu/mạng chậm và việc thu quyền trong lúc hàng chờ đầy. Theo dõi thời gian chờ, thời gian giữ khóa, số việc, lượng dữ liệu và thời gian dọn. Không đợi task đo tải M2-T11 mới bắt đầu đặt giới hạn.

## 8. Khi không xử lý được, bên gọi hiểu kết quả thế nào?

Dùng [mã lỗi chung của repo](error-codes.md). Mã lỗi giúp chương trình biết cách xử lý; thông báo cho người dùng vẫn cần ngắn, an toàn, bằng tiếng Việt. Không trả nguyên lỗi cơ sở dữ liệu hoặc thông tin của kênh riêng tư.

| Mã lỗi                         | Ý nghĩa và cách xử lý                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_REQUIRED` — 401          | Phiên đăng nhập không còn hợp lệ. Dừng yêu cầu cũ và yêu cầu xác thực lại.                                                                                        |
| `NOT_FOUND` — 404              | Không có nơi cần truy cập, hoặc người gọi không được biết nơi đó tồn tại. Không kèm thông tin làm lộ kênh/DM.                                                     |
| `FORBIDDEN` — 403              | Người gọi được biết đối tượng nhưng không có quyền làm việc này. Quyền quản lý không tự thay quyền đọc.                                                           |
| `CONFLICT` — 409               | Quyền hoặc trạng thái đã thay đổi. Bỏ thao tác đang chờ theo thông tin cũ; đọc lại trạng thái trước khi người dùng thực hiện ý định mới. Không tự đổi người nhận. |
| `DEPENDENCY_UNAVAILABLE` — 503 | Phần cần gọi tạm không phục vụ, hệ thống hết chỗ xử lý hoặc kết quả chưa rõ. Xác minh kết quả trước khi thử lại nếu có khả năng đã lưu.                           |
| `RATE_LIMITED` — 429           | Gửi quá nhanh hoặc quá nhiều theo tần suất cho phép. Có thể kèm thời gian nên chờ trước lần thử tiếp. Không dùng mã này thay lỗi hết dung lượng lưu trữ.          |
| `PAYLOAD_TOO_LARGE` — 413      | Dữ liệu gửi vượt kích thước cho phép. Cần giảm dữ liệu hoặc chọn tệp phù hợp.                                                                                     |

Cách gọi nội bộ trong `ports.ts` trả kết quả hoặc mã lỗi thuộc nhóm của port. Phần tiếp nhận yêu cầu từ trình duyệt mới chuyển sang thông báo HTTP/socket theo mẫu chung, kèm `requestId` để tra cứu. Không hiểu bảng này là mọi port đều trả tất cả các mã trên.

## 9. Đã có gì, và còn cần ai xác nhận?

Đầu ra riêng của SCRUM-14 gồm tài liệu này, các khai báo cách gọi trong `ports.ts`, phần kiểm cấu hình trong `budget.ts` và hai file test cùng thư mục. Mục đích là giúp người làm task sau biết phải truyền gì, nhận gì, xử lý lỗi ra sao và không dùng lại quyền cũ bằng cách nào.

Các test hiện dùng tình huống được dựng sẵn: truyền đúng phiên lưu dữ liệu khi tạo general; bị gỡ rồi thêm lại; thay đổi tư cách thành viên; hết phiên đăng nhập; nhóm hết giờ; dọn lại không chạm việc mới; cấu hình thiếu hoặc vượt giới hạn. Chúng giúp kiểm tra thỏa thuận có thể diễn đạt trong mã và ví dụ có kết quả mong đợi.

**Chúng chưa chứng minh hệ thống thật đã làm đúng các việc đó.** Chưa có kiểm chứng lưu/hủy toàn bộ trên MongoDB, kiểm quyền PRIVATE/DM thật, dừng nhận tin/tải tệp thật hoặc vẫn thu quyền được khi máy chủ quá tải.

M1 cần review danh tính, tạo general, lỗi/quyền và khung giới hạn. M4 cần xác nhận thông tin phòng/nhóm và cách chặn, đánh dấu, dừng tài nguyên. Bên triển khai tiếp phải xác nhận cách gọi dùng được. Các task M1-T1.2/T2.4/T5, M4-T1.2 và M2-T2.1/T4/T6 tiếp tục triển khai và kiểm với thành phần thật theo phạm vi của mình.

Task này không quyết định cách tải bù lịch sử tin nhắn, định dạng gửi tin chi tiết, quota chưa chốt hoặc mô hình dữ liệu mới. Các phần đó vẫn thuộc M2-T1.3/T1.6 và các task liên quan. Kết quả và lệnh kiểm đã chạy được ghi tại [bản bàn giao SCRUM-14](../test-evidence/2026-11-07-scrum-14.md).

## 10. Tra cứu kỹ thuật khi triển khai

Phần này giữ tên trường để người viết mã đối chiếu. Người chỉ cần hiểu mục tiêu và hành vi có thể đọc các mục phía trên.

### 10.1. Thông tin quyền và phiên bản

- `AuthenticatedContext`: `{ userId, authSessionId, expiresAt }`, dùng lại từ `@colearnia/contracts`.
- `MessagingTarget` cho CHANNEL/DIRECT: `kind`, `workspaceId`, `conversationId`; không thêm thông tin cuộc gọi cho DM/TEXT.
- Với SESSION/GROUP/HOST_PRIVATE: thêm `sessionId`, `epoch`, `callGeneration`, `expectedPolicyRevision`, `scope` theo `SessionScopeRef` của SCRUM-22. SESSION thuộc MAIN; GROUP cần đúng GROUP. HOST_PRIVATE vẫn phải được kiểm cặp và vị trí thực tế theo quy tắc sản phẩm.
- `MessagingAuthorization` có một thành viên cho kênh/chat họp, hoặc đúng hai thành viên không trùng cho DIRECT. Mỗi thành viên gồm `membershipId`, `incarnation`, `revision`. Thứ tự hai thành viên không ảnh hưởng so sánh.
- `channel` gồm ID/revision; null với DIRECT. `runtime` null với CHANNEL/DIRECT; nếu có gồm session/epoch/callGeneration/policyRevision/scope và `deadlineMs`. Deadline là Unix milliseconds; null khi phạm vi không có đếm giờ.
- Mã document được bên cung cấp chuẩn hóa chữ thường trước khi lập dấu đối chiếu. Phiên bản phải là số nguyên an toàn: incarnation/callGeneration ≥1, revision ≥0.
- Dấu cho tệp STAGED tuân thiết kế DB: không cập nhật dấu cũ thành dấu mới để cứu thao tác. READY đọc theo quyền hiện tại.

### 10.2. Các chi tiết cần giữ khi nối cơ sở dữ liệu và thu quyền

Dùng chung connection/DB session do M1 cung cấp. Transaction theo integrity: `readConcern: snapshot`, `writeConcern: majority`, `readPreference: primary`; thao tác tuần tự, không `Promise.all` trong callback. Callback có thể được chạy lại nên mã, thời gian và nội dung thao tác phải ổn định. Cách định danh yêu cầu tạo Workspace công khai tiếp tục do M1-T1.2 chốt.

Target thu quyền phân biệt AUTH_SESSION, USER, WORKSPACE, CHANNEL, RUNTIME. Với RUNTIME có session/epoch/scope/user hoặc null và `throughPolicyRevision`: chỉ thu các tài nguyên đúng ngữ cảnh và phiên bản cũ được chỉ định. Mốc `throughResourceGeneration` tăng dần, không tái sử dụng trong đời bộ theo dõi công việc của process; không phải field/index mới trong DB và không thay callGeneration. Thử lại phải giữ nguyên mã, target và mốc, chỉ đóng resource không mới hơn mốc đó.

### 10.3. Tên cấu hình giới hạn

| Nhóm                | Trường                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Toàn ứng dụng       | `process.inFlight`, `process.queued`, `process.bytes`.                                                                                   |
| Cơ sở dữ liệu       | `database.maxPoolSize`, `waitQueueTimeoutMs`, `queryTimeoutMs`.                                                                          |
| Thu quyền           | `revocation.reservedInFlight`, `cleanupBatchSize`, `executionMs`; số chỗ dành riêng phải nhỏ hơn tổng chỗ xử lý.                         |
| Từng loại công việc | `processInFlight`, `processQueued`, `processBytes`, `perUserInFlight`, `perScopeInFlight`, `payloadBytes`, `queueWaitMs`, `executionMs`. |

Các loại được khai báo: text, history, subscription, upload, download, frame, recording, avatar. Count/byte/ms phải là số nguyên an toàn hữu hạn và >0; riêng số việc chờ có thể là 0. Không có giá trị mặc định để âm thầm bật chức năng.

Với DM/TEXT, `perScope` tính theo Workspace; với cuộc họp tính theo session hoặc group tương ứng, vẫn nằm trong giới hạn Workspace/process chung. Với subscription, inFlight là số đăng ký nhận tin còn sống; executionMs áp cho bước mở/lấy lịch sử, không tự đóng một đăng ký hợp lệ chỉ vì hết thời gian của yêu cầu mở. Task subscribe phải đặt thêm giới hạn cho tin đang chờ phát và dọn khi ngắt kết nối.

## 11. Giải thích thuật ngữ

| Thuật ngữ                        | Hiểu trong tài liệu này                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Interface / port                 | Quy định cách một phần gọi phần khác: cần đưa thông tin gì và sẽ nhận lại gì. Khai báo cách gọi chưa phải phần xử lý thật. |
| Contract                         | Thỏa thuận về dữ liệu, hành vi, lỗi và trách nhiệm giữa các phần.                                                          |
| Transaction                      | Gom nhiều bước lưu dữ liệu thành một lần: cùng được lưu hoặc cùng bị hủy.                                                  |
| Phiên đăng nhập                  | Một lần đăng nhập được máy chủ quản lý; một người có thể có nhiều phiên.                                                   |
| Membership / incarnation         | Tư cách thành viên; incarnation phân biệt lần tham gia mới sau khi bị loại với lần tham gia cũ.                            |
| Revision / generation / epoch    | Các dấu phiên bản dùng để nhận ra quyền, kết nối hoặc đời phiên đã đổi. Mỗi loại có mục đích riêng, không thay cho nhau.   |
| ACL / authorize                  | Quy tắc ai được làm gì và bước kiểm người đó có được phép thực hiện hay không.                                             |
| Deny barrier / fence / watermark | Lần lượt là chốt chặn quyền cũ, bước đánh dấu công việc cũ và mốc dùng để tránh dọn nhầm công việc mới.                    |
| Cleanup / reconcile              | Dừng và giải phóng công việc/tài nguyên; hoặc đọc lại, đối chiếu và xử lý khi kết quả chưa rõ.                             |
| Handler / queue / pool           | Phần nhận xử lý yêu cầu; hàng công việc chờ; tập kết nối được tái sử dụng.                                                 |
| Fanout / subscription            | Gửi tin mới đến các người nhận được phép; đăng ký tiếp tục nhận các tin đó.                                                |
| Fixture / mock                   | Dữ liệu hoặc thành phần dựng sẵn cho kiểm tra; không thay bằng chứng chức năng thật đã chạy.                               |
| STAGED / READY                   | Tệp đang chờ hoàn tất/gắn vào nội dung; tệp đã hoàn tất theo quy định và có thể được đọc nếu còn quyền.                    |
