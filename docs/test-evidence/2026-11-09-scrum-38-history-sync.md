# SCRUM-38 — Thử đồng bộ tin mới với lịch sử

Khi mở lại chat, trình duyệt cần nhận tin mới ngay và tải bù những tin đã bỏ lỡ. Nếu chỉ nhớ thời gian hoặc ID của tin cuối cùng đã thấy, một tin được cấp ID sớm nhưng lưu xong muộn có thể bị bỏ qua. Phép thử này dùng MongoDB thật để kiểm một cách tạo mốc theo lần lưu thành công. Đây là đầu ra Q9 để M1 review trước khi chốt hợp đồng và triển khai.

## Mốc được thử và lý do

Mỗi hội thoại có một số thứ tự đã lưu. Khi tạo tin, cùng một transaction tăng số thứ tự và ghi tin mang số đó. Các lần ghi vào cùng bộ đếm phải đi lần lượt ở điểm tăng số. Nếu transaction bị hủy, cả số thứ tự và tin nhắn đều bị hủy. Đường ghi chỉ báo thành công và phát sự kiện sau khi commit được xác nhận.

Ví dụ, A nhận ID nhỏ trước, B nhận ID lớn sau. B lưu xong trước A, nên B nhận số 1 và A nhận số 2. Khi trình duyệt yêu cầu lấy tin sau mốc 1, nó vẫn tìm được A. Nếu lấy tin sau ID của B trong cùng thời điểm, truy vấn bỏ sót A. Cursor `(createdAt, _id)` vẫn có ích để đọc lịch sử theo thứ tự hiển thị. Mốc commit phục vụ việc tải bù.

## Trình tự tải bù đề xuất

1. Client gắn listener trước khi gửi subscribe. Server kiểm quyền và đăng ký đúng phạm vi nhận trước khi đọc mốc cao `H` từ dữ liệu đã commit. Dùng cơ chế điều phối hiện hành cho kiểm quyền, đăng ký và phát tin. Ca thử dùng listener trong tiến trình để đặt tin vào hai phía của mốc.
2. Server trả mốc `H` cố định cho lượt tải, kèm thông tin định danh lượt và phạm vi. `L` là mốc của lần tải bù hoàn tất gần nhất, do server cấp hoặc xác minh. Cả `L`, `H` và cursor phải thuộc cùng hội thoại, loại trang gốc hoặc thread và lượt hiện hành.
3. Khi reconnect, lấy từng trang theo thứ tự tăng dần với `L < commitSeq <= H`. Trang tiếp bắt đầu sau số cuối của trang trước và giữ nguyên `H`. Query luôn lọc hội thoại và `rootMessageId`. Timeline TEXT đọc tin gốc. Thread đọc replies của một root. Số thứ tự có thể nhảy qua vì có tin thuộc phạm vi khác. Khi mở đầu không có `L`, lấy trang mới nhất đến `H` và dùng cursor lịch sử để xem cũ hơn.
4. Trong khi tải, giữ sự kiện mới đúng phạm vi trong bộ đệm có giới hạn. Sự kiện có thể đến trước ACK. Gộp theo message ID vì cùng một tin có thể xuất hiện ở cả lịch sử, ACK gửi và sự kiện. Chỉ ghi nhận mốc `H` sau khi tải đủ trang và gộp xong. Việc nhận tin mới có số lớn hơn `H` không tự đẩy mốc tải bù lên số đó.
5. Khi mất quyền, đổi phạm vi, ngắt kết nối giữa chừng hoặc vượt giới hạn bộ đệm, hủy lượt. Không lưu cursor dở dang làm checkpoint. Khi reconnect, bắt đầu lượt mới theo quyền hiện tại từ mốc đã hoàn tất trước đó. Server kiểm quyền lại ở từng trang và trước khi phát tin. Token/cursor không cấp quyền. Việc xóa nội dung hoặc đóng phạm vi trong khi tải cần hủy lượt nếu ảnh hưởng khả năng trả dữ liệu đến `H`.

Giới hạn cần chốt theo Q7 cho số tin, byte, trang và thời gian chờ. Khi đầy hoặc hết hạn, trả tín hiệu cần tải lại và dừng giữ dữ liệu. Không suy từ khoảng trống của một số thứ tự rằng đã mất tin, vì một lượt chỉ lọc một phạm vi. Tin live bị mất ngoài lượt tải bù vẫn cần một lượt đồng bộ lại từ mốc hoàn tất. Không cam kết Socket.IO tự phát lại mọi sự kiện.

## Delta dữ liệu và việc cần review

| Phần          | Đề xuất cho bản thật                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mốc hội thoại | Thêm `conversations.lastMessageSeq`, mặc định 0. Spike dùng collection bộ đếm riêng trong DB test để cô lập phép thử.                                                                                                                      |
| Mốc từng tin  | Thêm `messages.commitSeq` theo hội thoại. Chọn kiểu và giới hạn số an toàn trước khi triển khai. Tăng mốc và ghi tin trong một transaction.                                                                                                |
| Đọc theo mốc  | Index thử `{ conversationId: 1, rootMessageId: 1, commitSeq: 1 }`. Giữ index tuple hiện hành cho lịch sử hiển thị. Kiểm truy vấn với dữ liệu nhiều trang và dữ liệu cũ trước khi chốt index thật.                                          |
| Retry         | Chỉ cấp số mới cho lần tạo tin mới. Cùng khóa gửi lại thì trả tin cũ sau khi kiểm quyền và payload. Khi kết quả commit chưa rõ, đọc lại theo khóa gửi để phân giải trước khi thử thêm.                                                     |
| Chi phí       | Thêm một lần ghi cùng một bộ đếm và transaction cho tin text-only. Đây là thay đổi so với baseline insert đơn. M1/M2 cần review chi phí, retry khi tranh ghi và phối hợp cổng Workspace. Đo cùng DB/media trước khi coi đủ cho tải sprint. |

Chưa áp dụng schema, index hay migration cho môi trường dùng chung. Nếu đã có tin thật trước khi bật cơ chế, cần kế hoạch gán số và kiểm dữ liệu cũ trong task được review. Mốc xác minh theo commit chỉ đúng khi mọi đường ghi của phạm vi đều tuân cùng cơ chế. Kiểm quyền thật, phát Socket.IO thật, thời hạn, xử lý ngắt giữa trang và thu quyền thật thuộc các bước tích hợp.

## Kết quả kiểm

Ngày 09/11/2026, thử trên nhánh `chore/SCRUM-38-history-sync-spike` lấy từ `c705520`. MongoDB 8.0.16 replica set `rs0` trên loopback, cổng 27059. Mỗi suite dùng database thử riêng. [Ca tích hợp SCRUM-38](../../apps/server/test/history-sync.integration.ts)

```powershell
$env:COLEARNIA_DB_TEST_PORT = '27059'
pnpm --filter @colearnia/contracts build
pnpm exec vitest run --config vitest.database.config.ts
```

Toàn bộ 41 ca MongoDB đạt trong 4 file, gồm 7 ca mới:

- Cùng timestamp, B có ID lớn hơn nhưng commit trước A. Truy vấn sau tuple của B trả rỗng. Truy vấn sau mốc commit của B trả đúng A.
- Chèn lỗi sau bước ghi làm transaction hủy cả tin và lần tăng mốc. Lần ghi tiếp dùng mốc 2.
- Tin đến trước khi chốt H, sau H nhưng trước ACK, và giữa các trang. History vẫn trả ba trang kích thước 3/3/2 đến H = 9. Kết quả gộp theo ID có đủ các tin 2–11 và giữ checkpoint 9.
- Timeline và thread trả đúng phạm vi dù mốc theo hội thoại có khoảng trống trong mỗi phạm vi.
- Quá số event, quá byte và đổi phạm vi đều trả yêu cầu đồng bộ lại. Lần đọc lại từ mốc đã hoàn tất lấy được các tin đến trong lượt bị hủy.

Kết quả xác nhận cơ chế trên fixture có giới hạn. Cần M1 chấp thuận delta dữ liệu và chi phí thêm transaction trước khi chọn làm Q9 cho app.

`pnpm check` đạt với 339 test ứng dụng, lint, typecheck và build. Harness có 54 ca đạt và 1 ca symlink bỏ qua trên Windows. Lượt cài với lockfile giữ nguyên dùng worker mediasoup 3.31.0 đã có trong workspace qua `MEDIASOUP_WORKER_BIN`. Phép thử MongoDB độc lập với media.

## Đối chiếu Sprint 1

Sprint 1 cần nhóm năm người đăng nhập, vào cùng Workspace, nhắn tin và gọi trên staging. Q9 phục vụ đoạn nhắn tin TEXT và nối lại để tải phần lịch sử bị lỡ. SCRUM-14 cung cấp quy tắc kiểm và thu quyền. SCRUM-15 cung cấp MongoDB transaction. Cả hai đã có trên nền nhánh. Hai ticket bị chặn trực tiếp khớp danh sách trong ảnh. [Sprint Goal](../planning/sprint-1.md) · [Liên kết Jira](../planning/jira/sprint-1-jira-links.csv)

| Ticket             | Đầu vào nhận được                                                                              | Phần còn cần chốt                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SCRUM-40 / M2-T1.6 | Ý nghĩa của mốc trước/sau, `H` cố định, trang theo phạm vi và trạng thái yêu cầu đồng bộ lại.  | M1 review Q9 trước khi chốt kiểu/encoding cho `syncToken`, checkpoint, cursor và lỗi.                         |
| SCRUM-43 / M2-T4.2 | Trình tự subscribe trước, cố định mốc, tải đủ trang, gộp theo ID và hủy lượt khi mất hiệu lực. | Chờ đường gửi thật SCRUM-42. Cần có cơ chế cấp mốc, truy vấn, ACL, phát sự kiện và hủy lượt được nối vào app. |

Nguồn chi tiết là [Q9 trong proposal M2](../proposals/m2-messaging-files.md#62-gửi-tin-đọc-lịch-sử-và-thử-lại), [quy tắc DB](../database/integrity-and-migrations.md) và [contract thu quyền](../contracts/messaging-access.md). Kết quả thử dùng để quyết định có chấp nhận chi phí bộ đếm và transaction hay cần thử hướng khác.
