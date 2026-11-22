# SCRUM-93 — tích hợp Workspace vào MAIN

Ngày kiểm: 22/11/2026. Nguồn: working tree nhánh `feat/SCRUM-93-main-ui-integration`, base `80edf37`; chưa commit. Không coi SHA base là build đã chứa thay đổi. Khi review/merge phải ghi SHA cuối và kiểm lại các ca browser còn thiếu.

## Hành vi browser đã quan sát

Chạy backend entry thật trên port 3193, Vite port 5193, MongoDB replica set riêng port 27193, mediasoup native và `MEDIA_LOCAL_DIRECT=true`. Tài khoản test đăng ký qua UI; Workspace và LIVE tạo qua endpoint sản phẩm. Không tiêm ACK/snapshot/identity giả.

- Đăng ký → tạo Workspace → tạo LIVE → bấm Vào phòng trực tiếp → lobby, với mic/camera tắt.
- Join/ticket/bootstrap HTTP proof thật thành công. RoomShell hiện host và một người tham gia; chưa có nguồn phát nên SEND/RECV tạo lười.
- Về Workspace rồi chọn TEXT vẫn giữ cuộc gọi và có nút về lại cuộc gọi. TEXT chưa bật messaging budget trong profile này, nên không nghiệm thu gửi tin.
- Bấm bật camera đi vào trạng thái chờ quyền/capture, hủy được. Chưa nhận được track camera thật trong browser kiểm thử.
- Tái hiện bootstrap proof bị timeout khi control packet dùng volatile ngay sau join/resync; đã đổi sang socket ACK có deadline và kiểm lại vào MAIN thành công.

## Giới hạn nghiệm thu

Computer Use bị dừng khi chọn cửa sổ browser thứ hai vì công cụ không xác định được URL hiện tại trên Windows đủ tin cậy để áp policy. Không có ảnh chụp mới được lưu cho build này. Người dùng đã đồng ý kiểm mic/camera local; sự đồng ý này không thay bằng chứng thiết bị đã hoạt động.

**Chưa đạt đủ AC SCRUM-93:** chưa kiểm hai tài khoản nghe/nhìn nhau bằng thiết bị thật, screen + screen audio/Browser Stop và tranh slot qua hai browser, outsider/PRIVATE qua UI, host end fanout, reconnect/auth revoke/logout đa browser và responsive bằng browser. Unit/integration server không thay bằng chứng các ca này. Không có bằng chứng TURN/hai mạng/năm người; đó vẫn là gate SCRUM-89.

## Kiểm tự động

Các ca bổ sung dùng mock ở biên socket/media để kiểm owner, callback cũ, retry và lỗi cleanup; không gọi chúng là nghiệm thu RTP thật.

- `pnpm test`: 79 file, 1072 test đạt. Trong đó `mainCall.test.ts` có 8 ca về join, thu nhỏ, hủy, mất ACK, reconnect, logout và policy conflict; `deviceMedia.test.ts` bổ sung thu riêng quyền camera mà không tắt mic hoặc tự bật lại thiết bị.
- `pnpm typecheck`: đạt contracts/web/server và TS integration. Web typecheck kiểm lại sau sửa lifecycle: đạt.
- `pnpm build`: đạt. Vite cảnh báo bundle lớn hơn 500 kB (khoảng 1.10 MB trước gzip); chưa chia chunk cho mediasoup-client.
- `pnpm media:smoke`: đạt native Worker/Router Opus/VP8; không chứng minh RTP browser hoặc TURN.
- `COLEARNIA_DB_TEST_PORT=27193 pnpm exec vitest run --config vitest.database.config.ts apps/server/test/main-entry.integration.ts apps/server/test/main-runtime.integration.ts --maxWorkers=1`: 18/18 đạt trên MongoDB test riêng và native mediasoup.
- Format file thay đổi, lint checkout khi loại hai thư mục bản sao có sẵn `.scrum75-worktree/**`, `GR2/**`, và `git diff --check`: đạt. Không thay ignore/config để làm xanh cổng.
- `pnpm check`: chưa đạt toàn cổng; format quét vào `.scrum75-worktree` có sẵn và báo file tài liệu cũ sai format. Giữ nguyên thư mục này; các bước lint/typecheck/test/build được chạy riêng như trên. Harness đạt 54, skip 1 Windows trong lượt chạy này.
- `pnpm doctor`: Node v26.12.1 đúng target, lockfile và Docker engine có sẵn. Không đọc/in nội dung `.env`.

## Sửa giao diện lobby sau kiểm tay

Người dùng phát hiện lobby tối và lệch bản Figma. Nguyên nhân: component dùng semantic utility Tailwind chưa được khai báo trong theme của app, nên nền trong suốt lộ lớp MAIN tối. Đã chuyển phần hiển thị sang CSS có phạm vi `.live-lobby` trong `global.css`, dùng token chung và màu từ CSS export Figma; nền sáng, header trắng, preview tối bên trái, thiết bị bên phải. Giữ lỗi/quyền thiết bị, hủy request và handoff preferences hiện hành; dùng nhãn Tham gia cuộc họp.

Kiểm component bằng entry preview Vite thật trên browser localhost: màu/nền và bố cục desktop hiển thị rõ. Ở viewport 390×844, DOM đo scrollWidth = innerWidth = 390; bố cục xuống một cột. Preview độc lập không truyền onContinue nên không có nút join; không dùng ảnh preview này làm bằng chứng join backend. 45 test lobby, web typecheck và lint file thay đổi đạt. Chưa kiểm lại toàn luồng hai browser/media thật sau chỉnh CSS.

## Đối soát rời/kết thúc — sau phản hồi kiểm tay

Người dùng báo cảnh báo cleanup chưa xác nhận xuất hiện khi kết thúc; bấm thử xác nhận lại thì về được Workspace. Phát hiện trong FE mới: ACK `pending` bị chuyển ngay thành lỗi, không có lượt đối soát tự động. Đã thêm tối đa 3 lượt trên cùng intent/request ID, chờ 500/1000ms giữa các phản hồi pending; vẫn giữ cảnh báo sau khi hết lượt, không giả cleanup thành công. Clear/logout hủy lượt chờ; kết quả chỉ áp dụng cho ownership hiện hành và đúng session/epoch. Thu nhỏ không tạo intent khác. Tiêu đề màn trạng thái được giới hạn cỡ chữ riêng.

Probe độc lập qua backend demo thật tại 3193 (đăng ký tài khoản/Workspace/LIVE qua HTTP, Socket.IO thật, tạo SEND native rồi `HOST_LEAVE`) trả completed, cleanupPending=false và nhận session.ended sau khoảng 164ms. Probe không phát camera vật lý; **chưa thu được ACK gốc ở lần lỗi của người dùng**, nên không kết luận đây là nguyên nhân duy nhất hoặc BE không còn lỗi. Script probe tạm đã xóa; chỉ tạo dữ liệu test riêng trong DB demo, không sửa membership/tài nguyên của người dùng. Cần kiểm tay lại kết thúc sau bật camera và ca member leave. Hồi quy MainCall bổ sung pending→completed tự động và logout trong lượt chờ, cùng ca pending kéo dài đã có.

## URL kênh và F5 — kiểm browser thật

Đã thêm URL kênh và hậu tố `/live`. Không persist resume ticket (contract yêu cầu RAM); reload về lobby có quyền và thiết bị tắt. Khi join mới bị từ chối xác định `CALL_ALREADY_ACTIVE`, tự chờ giới hạn 35 giây/8 lần, xin vé mới sau từ chối để không giữ vé của epoch đã kết thúc. Không takeover. Nút resume chỉ xuất hiện khi controller còn ownership/ticket RAM.

Browser localhost với tài khoản test mới tạo qua UI, Workspace/LIVE riêng, cookie/CSRF và backend thật: vào MAIN → reload → đúng URL/lobby, mic/camera tắt → bấm tham gia lại → quan sát thông báo chờ giải phóng ownership cũ → tự vào MAIN thành công. Sau đó về Workspace → chọn TEXT, call strip vẫn active → Về cuộc gọi trở lại MAIN → Kết thúc phiên về đúng URL kênh và bỏ strip. TEXT messaging budget chưa bật nên gửi tin không được kiểm. Không dùng camera/mic vật lý trong lượt này, không chứng minh RTP hai browser. Có ảnh local `scrum93-after-reload-rejoin.jpg` tại artifact của lượt chạy; chưa commit hoặc gắn SHA cuối.

Unit bổ sung: join sau từ chối ownership, hết budget vẫn bảo vệ call khác, hủy không phát sinh join muộn; URL có quyền chọn đúng kênh và URL không có quyền không hiện entry. Thay đổi source trong working tree như đầu tài liệu; kiểm lại trên SHA/build cuối trước nghiệm thu toàn task.

Kiểm cuối lượt URL/F5: 79 file / 1079 unit test đạt; ESLint file thay đổi và web build/typecheck đạt, `git diff --check` đạt. Build web tạo asset `index-BgiNL163.js`; Vite vẫn cảnh báo bundle lớn hơn 500 kB. Browser ca F5 chạy với mic/camera tắt trên Vite source; không dùng build hash này để khẳng định đã kiểm thiết bị thật trên bundle production.

## Điều tra share/kết thúc ngày 22/11 — chưa nghiệm thu xong

Đã tái hiện bằng browser IAB, backend riêng 3194/web 5194/DB test có tên ngẫu nhiên trên Mongo test 27193. Chỉ dùng tài khoản/Workspace test riêng; nguồn capture là canvas tổng hợp, HTTP/socket/mediasoup thật. Không coi đây là kiểm nguồn tab Chrome thật hoặc RTP hai người.

SCREEN trả MEDIA_UNAVAILABLE vì reserve/bind lease dùng held context sau khi outsideCoordination. Đã chuyển việc này vào withTransport mới, giữ native I/O ngoài gate. Test publication dùng coordinator thật tái hiện thất bại trước sửa, đạt sau sửa; nguồn tổng hợp đã hiển thị sân khấu trên browser.

ACK screen.release khi đua với session.end bị tái kiểm authority đã đóng và làm ngắt socket. Đã cho ACK cleanup không mang grant đi cùng nhóm terminal ACK. Test tích hợp native/Mongo tái hiện disconnect trước sửa, đạt sau sửa; kiểm luôn đóng SEND và join phiên mới khác sessionId. 18 test main-runtime integration đạt; 46 unit gần thay đổi đạt, media smoke đạt; server/web/integration typecheck và ESLint gần thay đổi đạt.

Tuy nhiên browser vẫn tái hiện cảnh báo cleanup sau khi share, dù socket còn connected ngay sau dispose phía client; vì vậy CHƯA xác nhận sửa hết lỗi kết thúc/tự thoát. Không khẳng định nguyên nhân duy nhất. Lượt kiểm tiếp bị chặn vì browser báo local access unavailable. Đã bỏ instrumentation console và các entry capture/server tạm, không đổi ACL hoặc giả ACK để làm xanh. Cần tái hiện tiếp với event/ACK ordering lúc đóng nguồn và kiểm vào lại từ UI. Chưa commit/push.

## Sửa tiếp lỗi Rời khỏi — hàng chờ packet của generation đã đóng

Bổ sung sau mục điều tra ở trên: createMainSocketPort trước đây ngắt socket khi packet grant cũ không qua authority. Trong lúc end/leave đang đóng ownership, packet media/snapshot đã xếp hàng vẫn được kiểm theo context đó, nên có thể ngắt socket trước khi ACK terminal được gửi.

Đã thêm trạng thái delivery `discard`: chỉ bỏ packet khi registry xác nhận ownership đã biến mất, đã bị block, sai session/epoch/generation hoặc phòng không ACTIVE. Kiểm trước khi vào authority, dưới gate trong callback, và sau lỗi await nếu ownership vừa bị retire. Không gửi grant cũ và không biến lỗi cleanup thành success. Auth expiry/deny, bounded queue/drain, kiểm ACL của call còn hiện hành giữ nguyên. Terminal cleanup ACK không chứa grant được phép đi qua đường terminal như đã mô tả.

Hồi quy dùng production composition, HTTP ticket/socket, Mongo test DB riêng và native mediasoup: tạm giữ transport delivery, xếp media resync ACK/snapshot, yêu cầu host end hoặc member leave, rồi drain sau khi ownership retire. Tắt fence mới tái hiện `socket has been disconnected`; bật lại thì ACK departure completed tới client, snapshot/grant cũ không được gửi, socket còn kết nối và tài khoản vào lại được. Host tạo session mới; member vào lại session còn hoạt động. Unit riêng kiểm discard không chặn terminal ACK và registry retire ngay khi cleanup còn đang chờ.

Kết quả thực chạy: main-runtime integration 20/20; unit gần thay đổi 171/171 trên 4 file; server typecheck và integration tsconfig đạt; ESLint các file đổi, Prettier và git diff --check đạt; media smoke đạt. Không chạy lại toàn pnpm check trong lượt này. Browser inventory trả local browser access unavailable nên CHƯA kiểm tay lại bản sửa mới trên browser, nguồn Chrome thật hoặc mic/camera hai người. Bản sửa trong working tree, chưa commit/push. Cần restart process server đang dùng (giữ cấu hình/DB hiện tại) để kiểm tay; reload hoặc chỉ restart Vite không nạp server source mới.

## Điều tra audio hai tài khoản cùng máy

Quan sát native UI Chrome: tại thời điểm đọc, A là host có camera từ B và camera local; B là member có camera local, mic đang tắt. Không còn thấy audio recovery ở A trong quan sát này. Người dùng đang thao tác nên dừng điều khiển cửa sổ; không dùng quan sát này để kết luận nguyên nhân lần mất tiếng trước. Browser connector vẫn unavailable.

Bổ sung DEV-only window.liveAudioDiagnostics() cho đúng MainCall hiện hành: playback context state/blocked/remote track count và tên lỗi resume, microphone phase, số nguồn MIC remote, số audio Consumer, trạng thái SEND/RECV và bộ đếm audio RTP/media-source. Dữ liệu stats theo allowlist, không xuất SDP/address/ID/label/token/audio content; không dựng runtime khác, không fake ACK hay đổi quyền. Thu hồi hook khi provider unmount. AudioGraph giữ tên lỗi resume thay vì nuốt hoàn toàn, cho phép kiểm tại hook; chưa khẳng định audio issue đã sửa hoặc cần TURN. Thao tác resume vẫn trực tiếp trong user click.

Web typecheck, ESLint file thay đổi, git diff --check và 18 test trên AudioGraph/audioDiagnostics/MainCall đạt. Cần số liệu hai mẫu cách nhau vài giây lúc phát giọng thật để phân biệt capture, RTP và output; chưa có số liệu live nên chưa kết luận nguyên nhân. Test này không phải nghiệm thu hai browser RTP.

### Audio nhận trên Chrome — kiểm tiếp trên working tree

Native UI hai profile Chrome tại localhost:5193/backend 3193, hai tài khoản đã có quyền trong Workspace thật: bên nhận có Consumer live/enabled/not-muted/not-paused, RECV connected, RTP tăng nhưng totalSamplesReceived/jitterBufferEmittedCount/totalSamplesDuration đều 0. Bên gửi mic on, SEND connected và media-source có năng lượng khác 0. Không có bằng chứng thiếu TURN trong lượt localhost này.

AudioGraph bổ sung một HTMLAudioElement muted cho mỗi track remote để kích hoạt xử lý stream trên Chromium; WebAudio vẫn là đường phát nghe được duy nhất. Refcount dùng lại element, detach cuối/dispose pause và bỏ srcObject, không stop track mượn. Callback play lỗi sau detach bị bỏ; lỗi vẫn báo blocked để thử lại từ thao tác người dùng.

Sau reload và tham gia lại bằng UI ở bên nhận: totalSamplesReceived tăng 341760 → 3492960; jitterBufferEmittedCount tăng 340800 → 3492480; totalSamplesDuration tăng 7.33 → 72.98 giây; context running, blocked false, track live, packetsLost 0. Tuy nhiên totalAudioEnergy vẫn 0. Bên gửi media-source audioLevel khoảng 0.00122 và totalAudioEnergy khoảng 0.58489. Đã yêu cầu người dùng nói và xác nhận nghe; chưa có xác nhận. Vì vậy chỉ ghi nhận đã khắc phục bước kéo mẫu audio, **chưa đạt ca nghe giọng thật hai browser**, chưa kết luận toàn bộ nguyên nhân đã sửa.

Kiểm thực chạy: web typecheck, ESLint AudioGraph/test và 54 test trên 5 file AudioGraph/audioDiagnostics/mainCall/receiveMainAudio/mediaSnapshotRuntime đạt; media:smoke đạt (native worker/router Opus/VP8, không chứng minh nghe được). Bản source chưa commit, không gắn kết quả này với SHA/build production hoặc gate SCRUM-89.

### Kết thúc/rời và màn trung gian

Phát hiện FE yêu cầu cleanupPending=false ngay cả với ACK completed/ENDED, trái contract session-end.md: completed đã xác nhận thu quyền/pending; byte/ref/finalize có thể tiếp tục ở adapter. Hồi quy không phát session.ended cho thấy trước sửa FE chuyển error dù ACK ENDED, sau sửa tự clear call. Pending/ENDING thật vẫn giữ intent và thử lại, không giả thành completed. Đọc DB test chỉ thấy phiên gần nhất đã ENDED; không thu được ACK gốc của ảnh lỗi nên chưa chứng minh đây là nguyên nhân duy nhất lần lỗi đó.

Theo yêu cầu bỏ box trung gian, MainCallProvider hiển thị một dòng trạng thái khi leaving, không có nút Xem Workspace; ACK hoàn tất dẫn về route kênh qua điều hướng sẵn có. Màn lỗi/thử lại vẫn giữ nếu server chưa xác nhận. Web typecheck, ESLint, git diff --check và 20 test MainCall/ChannelWorkspace/AuthBoundary đạt. Chưa kiểm browser sau sửa: Computer Use bị dừng do không xác định chắc URL Windows để thực thi policy. Thay đổi còn trong working tree, chưa commit/push.

Điều chỉnh tiếp theo yêu cầu mới: bỏ cả dòng chờ. Khi bắt đầu leaving, thu gọn call ngay, bỏ overlay/strip chờ và điều hướng về kênh Workspace; giữ operation/socket và intent ở nền đến khi server xác nhận. Pending không được đổi thành completed; nếu thất bại vẫn có lối mở lại để thử xác nhận, không cho tạo call cạnh tranh. Hồi quy kiểm leaving đã expanded=false trước ACK completed. 14 test MainCall, web typecheck, ESLint và git diff --check đạt; chưa có kiểm browser mới.
