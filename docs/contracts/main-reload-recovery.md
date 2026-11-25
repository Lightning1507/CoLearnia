# SCRUM-98 — Phục hồi cuộc gọi MAIN sau khi tải lại trang

**Đề xuất để M1, M3 và M4 review.** Phương án Service Worker đang chờ kiểm chứng trên trình duyệt thật. Merge tài liệu chỉ ghi nhận phạm vi đề xuất. Giai đoạn 2 cần kết quả PoC và quyết định của nhóm trước khi triển khai.

## Hành vi cần đạt

Khi đang trong MAIN và bấm F5, người dùng có thể tiếp tục cuộc gọi ngay trong tab đó nếu trình duyệt chứng minh được trang mới thay đúng trang đang gọi và máy chủ vẫn xác nhận quyền. Giao diện hiển thị “Đang khôi phục cuộc gọi” trong khi xác nhận. Sau khi nhận trạng thái phòng và media của kết nối mới, người dùng trở lại MAIN với mic, camera và chia sẻ màn hình tắt.

Giai đoạn 2 dự kiến chỉ tự phục hồi khi tải lại trang cuộc gọi MAIN (`/live`) của đúng kênh. Nếu cuộc gọi đang thu nhỏ và người dùng bấm F5 ở Workspace hoặc kênh chữ, trang vừa tải lại giữ nguyên vị trí đang xem và không gửi lệnh phục hồi. Người dùng có thể mở kênh trực tiếp để về lobby và vào lại theo luồng bình thường. Socket cũ vẫn được xử lý theo grace hiện hành.

Hiện tại, frontend giữ `resumeTicket` trong RAM. Mất mạng mà trang còn mở thì có thể dùng `session.resume` trong cửa sổ 30 giây sau khi socket cũ ngắt. F5 tạo trang mới và làm mất ticket này, nên trang quay về lobby. Nếu ownership cũ còn trong grace, lần join mới có thể nhận `CALL_ALREADY_ACTIVE`. Đề xuất giữ nguyên quy tắc một cuộc gọi và thời gian grace.

## Cách nhận diện reload cùng tab

Đề xuất thử dùng Service Worker đang kiểm soát trang MAIN. Khi trang vào MAIN thành công, worker lấy ID của trang cấp cao nhất từ `ExtendableMessageEvent.source` và giữ bằng chứng trong RAM. Với yêu cầu tải document ở đúng route MAIN, worker dùng `replacesClientId` để tìm trang cũ đã đăng ký và `resultingClientId` để chỉ bàn giao cho trang thay thế. Hai ID phải khác nhau và có giá trị. Worker đối chiếu ID nguồn của tin nhắn nhận bằng chứng với ID đích đã ghi, rồi xóa bản ghi sau khi bàn giao. Trang mới dùng `PerformanceNavigationTiming.type === 'reload'` để quyết định có thử phục hồi hay không. Máy chủ xác thực bằng proof và quyền hiện hành. [Mô hình FetchEvent của W3C](https://www.w3.org/TR/2026/CRD-service-workers-20261117/#dom-fetchevent-replacesclientid)

Service Worker chỉ làm nhiệm vụ chuyển bằng chứng trong trình duyệt. Máy chủ vẫn quyết định quyền vào cuộc gọi. Cookie, URL và cờ “đã reload” do trang tự gửi không đủ để phục hồi. Cách này cũng tránh lưu `resumeTicket` hiện hành vào `localStorage`, `sessionStorage`, IndexedDB hoặc URL. Mô hình tin cậy giả định mã cùng origin và Service Worker còn nguyên vẹn. Client ID không phải chứng thực chống XSS gửi lên server.

### Điều kiện duyệt PoC

Trình duyệt có thể dừng Service Worker khi không có sự kiện cần xử lý, kể cả khi người dùng vẫn đang họp. Worker có thể khởi động lại đúng lúc tải lại trang và đã mất proof trong RAM. Trên route MAIN, worker chưa kiểm soát trang, mất bản ghi hoặc thiếu thông tin bàn giao đều dẫn về lobby. [Vòng đời Service Worker theo W3C](https://www.w3.org/TR/2026/CRD-service-workers-20261117/#service-worker-lifetime)

- M3 và M4 chạy PoC trên từng browser/version mục tiêu. Kiểm F5 ngay và sau một khoảng idle đủ để worker có thể tự dừng trong cuộc gọi bình thường, sau khi chủ động stop/start worker, Ctrl+F5, nhân bản tab, Back, điều hướng thường và F5 khi đang ở Workspace/kênh chữ. Với ca idle, ghi thời gian chờ và worker có thực sự dừng hay không.
- Ghi kết quả bàn giao proof thực tế, giao diện sau reload và thay đổi ownership/generation cho từng ca. Điều kiện an toàn là chỉ trang đích hợp lệ nhận proof, mọi ca thiếu bằng chứng rơi về luồng được quy định ở trên và quyền của socket khác được giữ đúng.
- M1, M3 và M4 duyệt bằng chứng và chốt browser/version được bật, cùng mức fallback chấp nhận được trong cuộc gọi bình thường. Nếu PoC không đạt, giữ tính năng tắt và rà lại cơ chế. Không chuyển `resumeTicket` sang storage hoặc dùng keepalive vô hạn để giữ worker. Worker không cache API, cookie, credential hay snapshot cuộc gọi.

## Contract đề xuất

| Phần                           | Dữ liệu và điều kiện                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cấp bằng chứng                 | Client hỗ trợ gọi `session.reload.arm` sau khi có ownership. Request gồm `requestId`, `sessionId`, `epoch` và `callGeneration`. ACK riêng trả `reloadProof` gồm 32 byte ngẫu nhiên mã hóa base64url. Các schema join/resume hiện hành giữ nguyên. Server giữ digest và ràng buộc proof với auth session, channel, session ID, epoch, participant, generation và socket cấp. |
| Vòng đời                       | Proof chỉ có giá trị với generation đã cấp và auth session hiện hành. Redeem chỉ sau khi socket cũ thực sự ngắt và trước deadline grace do server giữ. Worker chỉ cho trang kế tiếp lấy trong tối đa 30 giây kể từ navigation. Join/resume thành công thay proof; leave, end, revoke, hết hạn auth hoặc hết grace vô hiệu proof cũ. Restart mất bản ghi RAM và về lobby.    |
| Request qua socket đã xác thực | Sự kiện dự kiến `session.reload.resume`, strict object gồm `requestId` (UUID), `sessionId`, `epoch`, `callGeneration` (generation cũ) và `reloadProof`. Lấy auth session và socket ID từ kết nối đã qua cookie/CSRF. Dùng schema định danh hiện có trong contracts.                                                                                                         |
| ACK                            | Dùng envelope `requestId`. `completed` trả participant, generation mới, descriptor snapshot, `resumeTicket` và `reloadProof` đã xoay. `pending` báo đang đợi socket cũ ngắt hoặc chưa xác nhận việc thu quyền, không kèm grant. Lỗi terminal gồm `AUTH_REQUIRED`, `FORBIDDEN`, `SESSION_ENDED` hoặc `CONFLICT` cho proof không hợp lệ, hết hạn hoặc đã dùng.                |
| Retry và cạnh tranh            | Client tạo một request ID cho một lần reload và giữ trong RAM suốt quá trình. Cùng proof, request ID và socket mới dùng chung kết quả; request ID khác hoặc socket khác không nhận bản replay. Sau khi commit, ACK retry cùng binding trả đúng generation đã cấp. Socket mới mất sau commit mà chưa nhận ACK thì về lobby, không mở rộng quyền replay sang socket khác.     |

### Thứ tự xử lý

1. Trang mới nhận bản ghi từ worker, mở socket đã xác thực và gửi request. Nếu socket cũ vẫn còn sống, server trả pending trong giới hạn hiện hành. Request này không tự đóng socket cũ.
2. Kiểm generation, proof, deadline và auth/ACL trong gate hiện hành. Dùng luồng cleanup/reconcile của MAIN và đối chiếu kết quả với đúng operation, target, epoch, generation và token. Nếu bằng chứng không khớp hoặc thiếu `permissionRevoked=true` hay `pendingInvalidated=true`, giữ deny, chưa cấp ownership/grant mới và đối soát cùng operation. Trong thời hạn còn xử lý, ACK là `pending`.
3. Khi cả hai cờ thu quyền và vô hiệu pending đã được xác nhận, kiểm lại auth/ACL, continuity, deny barrier, binding, operation và deadline theo luồng reconnect hiện hành. Qua các guard này, server tiêu thụ proof, đổi ownership sang socket mới, nâng generation và xoay ticket trong cùng gate. Nếu adapter chỉ còn dọn byte/ref/finalize, ACK lệnh có thể trả `completed` dù adapter báo `cleanupPending=true`. Lệnh đồng thời chỉ có một lượt đổi ownership. Callback cũ chỉ dọn tài nguyên của generation đã chụp.
4. M3 bỏ projection, media stream và capture cũ. Sau ACK hợp lệ, frontend resync theo generation mới và khởi tạo media controller hiện có. UI chỉ báo đã trở lại khi snapshot và media sẵn sàng. Người dùng bật lại thiết bị bằng thao tác riêng. Nếu người dùng hủy phục hồi hoặc logout trong lúc chờ, trang ngắt socket dùng để phục hồi và bỏ phản hồi đến trễ. Nếu server đã commit, quy trình disconnect hiện hành xử lý ownership mới.

Mỗi generation chỉ có một proof hiện hành. Retry cấp proof dùng cùng request ID trên cùng socket trong cửa sổ retry ngắn. Client bỏ ACK cấp proof đã cũ khi generation đổi hoặc lần cấp mới hơn đã được xác nhận. Lượt reload thành công cấp proof cho generation mới qua ACK riêng.

Client retry có giới hạn trong thời gian grace còn lại, giữ nguyên request ID. Hết thời gian hoặc thiếu bằng chứng thì hiển thị lobby hoặc thông báo phiên đã kết thúc, tùy kết quả trả về. Khi ownership cũ vẫn còn, giữ thông báo cuộc gọi đang hoạt động theo SCRUM-97. Người dùng có thể thử join mới sau khi máy chủ xác nhận đã giải phóng ownership.

## Ma trận nghiệm thu giai đoạn 2

| Ca cần kiểm                                                              | Kết quả bắt buộc                                                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| F5 cùng tab, browser có worker phù hợp                                   | Phục hồi trong grace với epoch cũ và generation tăng đúng một lần. Người khác vẫn trong phòng, thiết bị của tab vừa reload tắt.        |
| F5 khi cuộc gọi thu nhỏ ở Workspace hoặc kênh chữ                        | Giữ trang Workspace/kênh chữ, không bàn giao proof hay gửi `session.reload.resume`. Mở kênh trực tiếp thì vào lobby theo luồng thường. |
| F5 ở MAIN sau idle hoặc stop/start làm worker mất RAM                    | Về lobby, không takeover và không khôi phục quyền cũ. Server xử lý socket cũ bằng disconnect và grace hiện hành.                       |
| Tab mới, nhân bản tab hoặc mở cùng URL khi tab cũ còn gọi                | Không có bàn giao proof từ worker. Tab cũ tiếp tục gọi.                                                                                |
| Reload đến trước khi server nhận disconnect                              | Trả pending. Retry cùng request ID sau disconnect có thể hoàn tất; không takeover.                                                     |
| Chưa xác nhận thu quyền/vô hiệu pending hoặc kết quả cleanup sai binding | Giữ deny và không cấp generation/grant mới. Retry còn hạn đối soát đúng operation.                                                     |
| Đã xác nhận cả hai cờ, chỉ còn dọn byte/ref/finalize                     | Nếu binding, quyền, continuity và deadline đều hợp lệ thì hoàn tất và tăng generation một lần dù adapter còn `cleanupPending=true`.    |
| ACK mất hoặc retry đồng thời                                             | Replay cùng binding trả cùng generation và không commit lại. Thử bằng socket hoặc request ID khác bị từ chối.                          |
| Logout/revoke trước hoặc trong lúc xử lý                                 | Không cấp quyền nếu auth/ACL đã mất. Phản hồi cũ không mở lại UI hay media.                                                            |
| Hết grace, host đã kết thúc hoặc server restart                          | Về lobby hoặc hiển thị kết quả terminal. Một join mới phải đi qua ticket và kiểm quyền bình thường.                                    |
| Callback media cũ đến sau lúc đã phục hồi                                | Callback chỉ dọn tài nguyên cũ. Transport và quyền của generation mới vẫn hoạt động.                                                   |

## Điểm cần duyệt

- **M1** duyệt mô hình tin cậy cùng origin, phạm vi binding và cách hủy proof khi auth session đổi.
- **M3** xác minh hỗ trợ thực tế của Service Worker, chốt danh sách browser được bật và review UX pending, fallback, thiết bị tắt.
- **M4** chốt schema, thứ tự gate/cleanup/commit và phối hợp các ca race trên. PM xác nhận độ ưu tiên sau các lỗi MAIN đang chặn sử dụng.

Sau khi duyệt, giai đoạn 2 cần triển khai, chạy regression server và ghi bằng chứng browser thật theo SHA cuối để nghiệm thu SCRUM-98. Đối chiếu [kết quả cleanup](session-context.md), [guard của luồng reconnect](main-reconnect.md), [ACK của lệnh kết thúc phiên](session-end.md) và [runbook MAIN](../runbooks/main-runtime.md).
