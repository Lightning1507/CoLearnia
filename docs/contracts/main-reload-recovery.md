# SCRUM-98 — Phục hồi cuộc gọi MAIN sau khi tải lại trang

**Đề xuất để M1, M3 và M4 review.** Giai đoạn 2 triển khai sau khi nhóm duyệt cơ chế nhận diện và kiểm khả năng hỗ trợ của trình duyệt.

## Hành vi cần đạt

Khi đang trong MAIN và bấm F5, người dùng có thể tiếp tục cuộc gọi ngay trong tab đó nếu trình duyệt chứng minh được trang mới thay đúng trang đang gọi và máy chủ vẫn xác nhận quyền. Giao diện hiển thị “Đang khôi phục cuộc gọi” trong khi xác nhận. Sau khi nhận trạng thái phòng và media của kết nối mới, người dùng trở lại MAIN với mic, camera và chia sẻ màn hình tắt.

Hiện tại, frontend giữ `resumeTicket` trong RAM. Mất mạng mà trang còn mở thì có thể dùng `session.resume` trong cửa sổ 30 giây sau khi socket cũ ngắt. F5 tạo trang mới và làm mất ticket này, nên trang quay về lobby. Nếu ownership cũ còn trong grace, lần join mới có thể nhận `CALL_ALREADY_ACTIVE`. Đề xuất giữ nguyên quy tắc một cuộc gọi và thời gian grace.

## Cách nhận diện reload cùng tab

Đề xuất thử dùng Service Worker đang kiểm soát trang MAIN. Khi trang vào MAIN thành công, worker lấy ID của trang cấp cao nhất từ `ExtendableMessageEvent.source` và giữ bằng chứng trong RAM. Với yêu cầu tải document ở đúng route MAIN, worker dùng `replacesClientId` để tìm trang cũ đã đăng ký và `resultingClientId` để chỉ bàn giao cho trang thay thế. Hai ID phải khác nhau và có giá trị. Worker đối chiếu ID nguồn của tin nhắn nhận bằng chứng với ID đích đã ghi, rồi xóa bản ghi sau khi bàn giao. Trang mới dùng `PerformanceNavigationTiming.type === 'reload'` để quyết định có thử phục hồi hay không. Máy chủ xác thực bằng proof và quyền hiện hành. [Mô hình FetchEvent của W3C](https://www.w3.org/TR/2026/CRD-service-workers-20261117/#dom-fetchevent-replacesclientid)

Service Worker chỉ làm nhiệm vụ chuyển bằng chứng trong trình duyệt. Máy chủ vẫn quyết định quyền vào cuộc gọi. Cookie, URL và cờ “đã reload” do trang tự gửi không đủ để phục hồi. Cách này cũng tránh lưu `resumeTicket` hiện hành vào `localStorage`, `sessionStorage`, IndexedDB hoặc URL. Mô hình tin cậy giả định mã cùng origin và Service Worker còn nguyên vẹn. Client ID không phải chứng thực chống XSS gửi lên server.

Trước khi chốt hỗ trợ, M3 cần kiểm F5, Ctrl+F5, nhân bản tab, quay lại bằng nút Back và navigation thường trên từng trình duyệt mục tiêu. Chỉ bật ở môi trường đã đạt các ca này. Thiếu worker kiểm soát trang, worker mất RAM hoặc thiếu thông tin navigation đều về lobby. Worker không cache API, cookie, credential hay snapshot cuộc gọi.

## Contract đề xuất

| Phần                           | Dữ liệu và điều kiện                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cấp bằng chứng                 | Client hỗ trợ gọi `session.reload.arm` sau khi có ownership. Request gồm `requestId`, `sessionId`, `epoch` và `callGeneration`. ACK riêng trả `reloadProof` gồm 32 byte ngẫu nhiên mã hóa base64url. Các schema join/resume hiện hành giữ nguyên. Server giữ digest và ràng buộc proof với auth session, channel, session ID, epoch, participant, generation và socket cấp. |
| Vòng đời                       | Proof chỉ có giá trị với generation đã cấp và auth session hiện hành. Redeem chỉ sau khi socket cũ thực sự ngắt và trước deadline grace do server giữ. Worker chỉ cho trang kế tiếp lấy trong tối đa 30 giây kể từ navigation. Join/resume thành công thay proof; leave, end, revoke, hết hạn auth hoặc hết grace vô hiệu proof cũ. Restart mất bản ghi RAM và về lobby.    |
| Request qua socket đã xác thực | Sự kiện dự kiến `session.reload.resume`, strict object gồm `requestId` (UUID), `sessionId`, `epoch`, `callGeneration` (generation cũ) và `reloadProof`. Lấy auth session và socket ID từ kết nối đã qua cookie/CSRF. Dùng schema định danh hiện có trong contracts.                                                                                                         |
| ACK                            | Dùng envelope `requestId`. `completed` trả participant, generation mới, descriptor snapshot, `resumeTicket` và `reloadProof` đã xoay. `pending` chỉ báo còn đợi disconnect/cleanup, không kèm grant. Lỗi terminal gồm `AUTH_REQUIRED`, `FORBIDDEN`, `SESSION_ENDED` hoặc `CONFLICT` cho proof không hợp lệ, hết hạn hoặc đã dùng.                                           |
| Retry và cạnh tranh            | Client tạo một request ID cho một lần reload và giữ trong RAM suốt quá trình. Cùng proof, request ID và socket mới dùng chung kết quả; request ID khác hoặc socket khác không nhận bản replay. Sau khi commit, ACK retry cùng binding trả đúng generation đã cấp. Socket mới mất sau commit mà chưa nhận ACK thì về lobby, không mở rộng quyền replay sang socket khác.     |

### Thứ tự xử lý

1. Trang mới nhận bản ghi từ worker, mở socket đã xác thực và gửi request. Nếu socket cũ vẫn còn sống, server trả pending trong giới hạn hiện hành. Request này không tự đóng socket cũ.
2. Trong gate hiện hành, M4 kiểm đúng generation, proof, deadline và auth/ACL, rồi dùng quy trình cleanup/reconcile của MAIN để đóng tài nguyên cũ. Cleanup chưa xác nhận thì giữ deny và trả pending.
3. Trước khi cấp quyền, server kiểm lại auth/ACL và dùng cùng gate để tiêu thụ proof, đổi ownership sang socket mới, nâng generation và xoay ticket. Lệnh đồng thời chỉ có một lượt đổi ownership. Callback cũ chỉ được đụng tài nguyên của generation đã chụp.
4. M3 bỏ projection, media stream và capture cũ. Sau ACK hợp lệ, frontend resync theo generation mới và khởi tạo media controller hiện có. UI chỉ báo đã trở lại khi snapshot và media sẵn sàng. Người dùng bật lại thiết bị bằng thao tác riêng. Nếu người dùng hủy phục hồi hoặc logout trong lúc chờ, trang ngắt socket dùng để phục hồi và bỏ phản hồi đến trễ. Nếu server đã commit, quy trình disconnect hiện hành xử lý ownership mới.

Mỗi generation chỉ có một proof hiện hành. Retry cấp proof dùng cùng request ID trên cùng socket trong cửa sổ retry ngắn. Client bỏ ACK cấp proof đã cũ khi generation đổi hoặc lần cấp mới hơn đã được xác nhận. Lượt reload thành công cấp proof cho generation mới qua ACK riêng.

Client retry có giới hạn trong thời gian grace còn lại, giữ nguyên request ID. Hết thời gian hoặc thiếu bằng chứng thì hiển thị lobby hoặc thông báo phiên đã kết thúc, tùy kết quả trả về. Khi ownership cũ vẫn còn, giữ thông báo cuộc gọi đang hoạt động theo SCRUM-97. Người dùng có thể thử join mới sau khi máy chủ xác nhận đã giải phóng ownership.

## Ma trận nghiệm thu giai đoạn 2

| Ca cần kiểm                                               | Kết quả bắt buộc                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| F5 cùng tab, browser có worker phù hợp                    | Phục hồi trong grace với epoch cũ và generation tăng đúng một lần. Người khác vẫn trong phòng, thiết bị của tab vừa reload tắt. |
| Tab mới, nhân bản tab hoặc mở cùng URL khi tab cũ còn gọi | Không có bàn giao proof từ worker. Tab cũ tiếp tục gọi.                                                                         |
| Reload đến trước khi server nhận disconnect               | Trả pending. Retry cùng request ID sau disconnect có thể hoàn tất; không takeover.                                              |
| Cleanup chậm, ACK mất, bấm thử lại                        | Chưa có grant khi cleanup pending. Replay cùng binding trả cùng generation; thử khác socket hoặc request ID bị từ chối.         |
| Logout/revoke trước hoặc trong lúc xử lý                  | Không cấp quyền nếu auth/ACL đã mất. Phản hồi cũ không mở lại UI hay media.                                                     |
| Hết grace, host đã kết thúc, server hoặc worker restart   | Về lobby hoặc hiển thị kết quả terminal. Một join mới phải đi qua ticket và kiểm quyền bình thường.                             |
| Callback media cũ đến sau lúc đã phục hồi                 | Callback chỉ dọn tài nguyên cũ. Transport và quyền của generation mới vẫn hoạt động.                                            |

## Điểm cần duyệt

- **M1** duyệt mô hình tin cậy cùng origin, phạm vi binding và cách hủy proof khi auth session đổi.
- **M3** xác minh hỗ trợ thực tế của Service Worker, chốt danh sách browser được bật và review UX pending, fallback, thiết bị tắt.
- **M4** chốt schema, thứ tự gate/cleanup/commit và phối hợp các ca race trên. PM xác nhận độ ưu tiên sau các lỗi MAIN đang chặn sử dụng.

Sau khi duyệt, giai đoạn 2 cần regression server và browser thật cho các ca trong ma trận theo SHA cuối. Xem [session context](session-context.md), [session end](session-end.md) và [runbook MAIN](../runbooks/main-runtime.md) để đối chiếu các hành vi giữ nguyên.
