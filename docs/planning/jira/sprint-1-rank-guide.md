# Sắp thứ tự Sprint 1 bằng API

Script [rank-sprint.py](rank-sprint.py) chỉ đổi **Rank của 80 task đã có** trên board 1, sprint có tên chính xác `CoLearnia Sprint 1`. Không tạo ticket, chuyển sprint, bắt đầu sprint hoặc cập nhật assignee, Parent, estimate, priority, description và liên kết phụ thuộc.

## Danh sách thứ tự

[sprint-1-rank.csv](sprint-1-rank.csv) là thứ tự khởi đầu để PM áp dụng, dựa trên [kế hoạch nhận việc](../sprint-1.md#thứ-tự-nhận-việc-đầu-sprint-trên-jira). Đây không phải lịch hoặc bảng trạng thái cạnh tranh với Jira. Sau lượt chuẩn bị này, điều phối theo tiến độ thật trên Jira; không chạy lại script để ghi đè các điều chỉnh mới của PM.

- Năm task đầu là SCRUM-12, 14, 22, 44 và 69: mỗi người có việc bắt đầu độc lập.
- Giao transaction MongoDB sớm; tiếp model auth, conversation, staging/TURN và contract cuộc gọi. Controller và shell được đặt trước phần giao diện tích hợp phụ thuộc chúng.
- Policy/snapshot MAIN được đặt sớm để mở đường cho media. Recording có lượt thử sớm, xen với contract/history TEXT; PM vẫn cần dành thời gian cụ thể theo checkpoint ngày 2.
- Toàn bộ 171 cặp provider–consumer đã có được kiểm: provider đứng trước consumer. Giữ nguyên 379 giờ task, người thực hiện và reviewer trong nguồn; Minh/M5 không được phân công reviewer chính.

Rank là danh sách chung. Mỗi người chọn task **đủ đầu vào có thứ tự cao nhất trong phần mình được giao**, không chờ cả team làm xong mọi dòng bên trên. Ví dụ SCRUM-70 xử lý lỗi thiết bị có thể làm khi đang chờ contract controller. Thứ tự không tạo thêm `blocks`, không thay due date và không bảo đảm hoàn thành đúng estimate.

## Cách chạy

Từ thư mục gốc repo, xem trước đủ 80 vị trí; lệnh này không cần token và không kết nối Jira:

```bash
python3 docs/planning/jira/rank-sprint.py --mode plan
```

Chạy thử năm vị trí đầu:

```bash
python3 docs/planning/jira/rank-sprint.py --mode pilot
```

Nhập email Atlassian, token qua ô nhập ẩn trong Terminal; không gửi token vào chat hoặc lưu vào file. Script đọc board, tìm đúng sprint future/active, kiểm đủ 80 key và mã WBS/label trước khi cho phép ghi. Gõ `YES` khi thông tin đúng. Trong lúc chạy, team tạm không sửa ticket, chuyển sprint hoặc kéo Rank.

Mở **Backlog → CoLearnia Sprint 1**, bỏ bộ lọc, tải lại và kiểm năm vị trí đầu là **12 → 14 → 22 → 44 → 69**. Khi đã đúng, áp dụng toàn bộ:

```bash
python3 docs/planning/jira/rank-sprint.py --mode apply
```

Script yêu cầu pilot đang đúng trước khi apply. Mỗi lần chỉ di chuyển một ticket và đọc lại kết quả; vị trí đã đúng được bỏ qua. Vì kết quả tìm kiếm có thể cập nhật chậm sau khi đổi Rank, script gửi `reconcileIssues` cho các ticket vừa đổi/anchor (tối đa 50 ID gần nhất). Nếu thứ tự chưa khớp, chỉ đọc lại tối đa 6 lần, với các khoảng chờ 1, 2, 4, 8 và 15 giây; không gửi lặp lệnh PUT. Token cần quyền đọc board/sprint/ticket và quyền xếp hạng; nếu gặp 401/403, kiểm quyền và loại token trước khi thử lại, không đưa credential vào log.

Sau cùng đối chiếu toàn bộ:

```bash
python3 docs/planning/jira/rank-sprint.py --mode check
```

`PASS` nghĩa là đủ 80 vị trí đúng kế hoạch tại thời điểm đọc. Chế độ `check` chỉ đọc; exit code 2 nghĩa là thứ tự chưa khớp, kể cả sau pilot vì mới xếp năm task. Sau đó xem trên Backlog; trang tìm kiếm dùng `ORDER BY key ASC` sẽ vẫn hiện theo số ticket, không theo Rank.

## Khi gặp lỗi hoặc chạy dở

- Trước mỗi lượt ghi, script lưu thứ tự cũ vào file tạm `colearnia-rank-before-*.json` và in đường dẫn. File chỉ có site/board/sprint/Rank field và danh sách key, không chứa token. Giữ file nếu cần đối chiếu; script không tự rollback hoặc khôi phục trường khác.
- Nếu 429, timeout, 207 hoặc đọc lại chưa khớp, script dừng. Có thể một số Rank đã đổi; chạy `check` và kiểm Jira trước khi chạy lại. Không tự gửi lại PUT sau timeout.
- Nếu chỉ còn sai các vị trí chưa làm, có thể chạy lại pilot/apply; script đọc trạng thái thật và bỏ qua vị trí đã đúng. Nếu PM đã chủ động đổi kế hoạch, không chạy lại danh sách cũ.
- Nếu thiếu/thừa task, sai sprint/WBS hoặc trường khác thay đổi trong lúc chạy, script dừng để PM kiểm. Không tự chuyển ticket, gán lại Parent hay sửa assignee. Việc đọc lại chỉ đối chiếu các trường đã yêu cầu, không phải kiểm toán mọi field hoặc ngăn được mọi thao tác đồng thời.
- Rank là thứ tự của issue, không phải bản sao riêng cho từng board. Board khác dùng cùng Rank field và chứa các ticket này cũng có thể thấy thứ tự thay đổi.

## Kiểm chứng local và giới hạn

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docs/planning/jira -p test_rank_sprint.py -v
```

Các ca offline kiểm thiếu/trùng ticket, sai WBS, thứ tự phụ thuộc, phân trang, pilot, chạy lại, biến động Parent/assignee/estimate và phản hồi ghi chưa thành công. Có ca mô phỏng tìm kiếm trả thứ tự cũ rồi mới cập nhật, giới hạn reconcile 50 ID, dừng sau 6 lần đọc nếu vẫn sai và không gửi lặp PUT.

**Kết quả pilot PM cung cấp ngày 06/11:** đã đọc đúng board 1, sprint 1 và đủ 80 ticket. Sau bước giữ SCRUM-12, lần PUT kế tiếp không báo lỗi HTTP, nhưng đọc lại chưa thấy đúng thứ tự nên script cũ dừng. Chưa đủ bằng chứng kết luận nguyên nhân thực tế hoặc pilot đã thành công. Bản sửa thêm reconcile và chờ đọc lại có giới hạn; chưa được chạy xác nhận trên Jira. PM chạy `check` trước; nếu năm vị trí đầu đã đúng thì không cần làm lại pilot, có thể tiếp `apply`. Nếu chưa đúng thì chạy `pilot` bản sửa và kiểm Backlog.

Nguồn API chính thức: [Rank issues](https://developer.atlassian.com/cloud/jira/software/rest/api-group-issue/#api-rest-agile-1-0-issue-rank-put), [board configuration và sprint issues](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/). Script dùng GET sprint issues bản enhanced có phân trang bằng token và PUT Rank, không dùng CSV importer.

[Atlassian — Search and Reconcile](https://developer.atlassian.com/cloud/jira/platform/search-and-reconcile/) giải thích độ trễ sau khi ghi, đặc biệt khi đổi thứ tự nhiều issue. Đây là lý do cần xử lý dữ liệu tìm kiếm chưa cập nhật, không phải bằng chứng riêng rằng lỗi pilot của project chắc chắn do độ trễ.
