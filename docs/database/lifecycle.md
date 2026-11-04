# Vòng đời dữ liệu, transaction và cleanup

**Trạng thái:** thiết kế đích; bước 3 — nơi lưu/vòng đời đã được cụ thể hóa ngày 01/11/2026. Transaction probe trong CI kiểm cơ chế Mongo, không thay kiểm thử nghiệp vụ hoặc sweeper thực.

Nguồn ban đầu được trích chuyển từ [technical plan v2.1](../technical-plan.md) ngày 26/10/2026. Đã cập nhật theo quyết định team ngày 27/10/2026 trong technical plan v2.3. Đây là nguồn chi tiết hiện hành cho các mục được chuyển; số mục giữ theo baseline để truy vết. Thay đổi quy tắc cần cập nhật tại đây và review ảnh hưởng tới contract/test, không tạo bản sao song song.

## Bước 3 — Nơi lưu và vòng đời từ Use Case

**Cập nhật 01/11/2026:** bước 3 cụ thể hóa [46 UC](uc-data-map.md), [16 khái niệm nghiệp vụ](conceptual-model.md) và ranh giới tại [kiến trúc](../architecture.md). Đây là thiết kế để review, chưa là schema/index/migration hoặc bằng chứng chức năng đã chạy. Các mục 9.3/9.4/13.3 phía dưới tiếp tục sở hữu quy tắc retention, transaction và cleanup; không đặt một bộ timeout khác trong bảng này.

### 1. Nguyên tắc chọn nơi lưu

- **MongoDB:** danh tính, quyền Workspace/kênh, lịch sử chat, metadata tệp và phiên; tồn tại qua restart. Bản ghi cũ không tự cấp quyền vào một runtime đã kết thúc.
- **RAM server:** trạng thái cuộc họp đang chạy, nhóm, lượt hoạt động, host tạm, board/nét và media registry. Mất process thì kết thúc đời phiên cũ; không phục hồi chúng như một buổi học đang chạy từ metadata.
- **Kho tệp private:** byte ảnh/tệp; MongoDB giữ metadata và liên kết kiểm quyền. Chỉ tải qua dịch vụ kiểm ACL, không coi storageKey/URL là quyền truy cập. Không lưu media stream thành bản ghi âm/video.
- **Client:** projection/cache để hiển thị và track/audio controller hiện hành; không là nguồn quyền hoặc bản lưu duy nhất cho lịch sử chat. Thu quyền phải dọn subscription/cache và hủy download stream đang mở; Range/retry mới kiểm lại ACL. Không giữ mutation gate suốt lượt tải và không hứa thu hồi byte đã gửi tới người nhận; registry stream theo integrity.

“Nét bền trong context FROZEN” nghĩa là runtime giữ nét trong context hiện tại và hỗ trợ resync khi socket rớt ngắn; không có nghĩa nét đã được persist MongoDB hoặc tồn tại sau server restart.

### 2. Ma trận nơi lưu E01–E16

Tên trạng thái trong bảng diễn đạt vòng đời; field/enum thiết kế và cách nhúng/tham chiếu đã được cụ thể hóa ở [bước 4](collection-design.md), chưa là schema executable.

| Khái niệm / UC sở hữu                            | Nơi lưu và nguồn trạng thái                                                             | Tạo / thay đổi                                                                                  | Mất quyền / kết thúc / dọn                                                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 User · ACC-01/02                             | MongoDB; auth service sở hữu danh tính                                                  | Đăng ký, kiểm trạng thái khi xác thực; hash được bảo vệ                                         | Logout chỉ thu phiên xác thực, không xóa User. Chưa có UC xóa tài khoản hoặc thời hạn purge User                                                                                                                                                    |
| E02 Workspace · WS-01/03/04/11                   | MongoDB; Workspace service                                                              | Tạo nguyên tử với owner membership/general/conversation; đổi tên/owner                          | Xóa khóa toàn bộ phạm vi ngay, kết thúc LIVE và khóa chat/file; dọn tệp theo 13.3. Không có restore UI                                                                                                                                              |
| E03 Membership · WS-01/07/09/10/11               | MongoDB; nguồn quyền Workspace hiện tại                                                 | Tạo/khôi phục tư cách qua lời mời, đổi role/owner                                               | Loại khỏi Workspace thu mọi truy cập liên quan và vô hiệu quyền PRIVATE cũ. Rejoin không tự khôi phục PRIVATE; DM theo quy tắc cả hai membership hợp lệ                                                                                             |
| E04 Invitation · WS-05/06/07                     | MongoDB; hiệu lực/hạn/lượt sử dụng                                                      | Owner/admin tạo/thu hồi; nhận hợp lệ cập nhật lượt và membership                                | Hết hạn/thu hồi/hết lượt chặn nhận ngay, không phụ thuộc TTL. Không tự thêm thời hạn xóa metadata lời mời                                                                                                                                           |
| E05 Channel · WS-12/13/14/15                     | MongoDB; loại/accessMode, danh sách quyền PRIVATE                                       | General sinh cùng Workspace; owner/admin tạo/đổi tên, thêm/gỡ quyền                             | Gỡ quyền thu content/file/LIVE; thêm lại mới mở lịch sử còn lưu. Xóa kênh khóa phạm vi và dọn theo 13.3; không đổi TEXT/LIVE hoặc WORKSPACE/PRIVATE sau tạo                                                                                         |
| E06 Conversation · MSG và LIVE chat              | MongoDB; loại, scope, hai bên nếu riêng, dấu đóng/purge                                 | TEXT có CHANNEL; mở DIRECT theo cặp; meeting tạo hội thoại đúng scope                           | CHANNEL/DIRECT tồn tại ngoài LIVE; SESSION/GROUP/HOST_PRIVATE khóa theo phạm vi tại 9.3. Thêm quyền kênh không mở lại hội thoại cuộc họp đã đóng                                                                                                    |
| E07 Message · MSG-01/04/06, LIVE-08/09           | MongoDB; chat service, dedupe theo conversation/người gửi/lệnh                          | Gửi/reply với attachment binding; history lấy từ DB sau kiểm quyền                              | Cùng vòng đời E06, không thêm UC sửa/xóa tin. Reply không có vòng đời/ACL độc lập với kênh; crash trước ack không nhân tin khi retry                                                                                                                |
| E08 File resource · MSG-08, luồng gửi/chụp       | Metadata MongoDB + byte trong kho tệp private; File service                             | Upload theo owner/purpose/scope, bind vào message hoặc context hợp lệ                           | Thu quyền tải ngay dù byte còn lưu; orphan/STAGED, private chat và kênh xóa dọn theo 13.3. Không TTL metadata trước khi mất thông tin cần dọn byte                                                                                                  |
| E09 LiveSession · LIVE-01/10, GRP-01             | MongoDB giữ metadata vòng đời/host; SessionRuntime là nguồn phiên đang chạy             | Tạo phiên/host một lần; chuyển host, cập nhật trạng thái/revision theo orchestration            | Kết thúc hoặc restart khóa private chat, đóng runtime, giữ metadata theo nhu cầu cleanup/audit; chưa chọn thời hạn purge metadata phiên                                                                                                             |
| E10 SessionParticipation · LIVE-01/02, GRP-04/08 | MongoDB giữ metadata tham gia theo model; hiện diện/scope/generation do runtime quản lý | Join/reconnect hợp lệ, leave/revoke; không nhân user trong phiên                                | Hết grace phải join lại; reconnect không phục hồi quyền đã thu. Metadata còn lại không cấp group/media sau restart                                                                                                                                  |
| E11 Discussion creation · GRP-02/04              | RAM SessionRuntime, không collection request                                            | Kiểm create rồi tạo nhóm/roster ngay                                                            | Không pending host xét hoặc lịch sử phê duyệt; retry dedupe, kiểm phase; roster khác membership                                                                                                                                                     |
| E12 Group · GRP-03/05/06/09/10                   | RAM GroupRuntime; DB chỉ cần refs ở conversation/file phục vụ ACL/cleanup               | Duyệt DISCUSSION; chuẩn bị/kích hoạt ACTIVITY; join/leave thay membership runtime               | Host đóng DISCUSSION hoặc tự đóng khi người cuối cùng chủ động rời sau khi nhóm đã có người; chưa ai vào vẫn chờ. ACTIVITY đóng theo deadline/lỗi/phiên kết thúc. Khóa GROUP chat/frame ngay; cleanup DB/file theo 9.3/13.3, không phục hồi nhóm cũ |
| E13 ActivityRound · GRP-05/06/11                 | RAM SessionRuntime; draft, phân công, deadline chung                                    | Host chuẩn bị và đặt số nguyên 1–120 phút; start kiểm phase, chốt round/deadline                | Hết giờ tự kết thúc đúng lượt; lỗi start hủy lượt; end/restart hủy runtime. Không edit/extend/pause khi chạy, không collection timer                                                                                                                |
| E14 Board · BOARD-01/02/05                       | RAM BoardRuntime; scope/context/version/source và reference frame                       | MAIN overlay LIVE host-only, đổi/dừng nguồn xóa nét; nhóm freeze/resume/undo/clear theo context | Resume/đóng context thu refs cũ; rời/đóng scope thu quyền. Restart không phục hồi board bằng file còn trên disk                                                                                                                                     |
| E15 FrozenFrame · BOARD-01/05                    | Byte/metadata dùng E08; binding với board/context nằm trong RAM                         | Upload intent → commit hợp lệ → board tham chiếu frame                                          | FROZEN hợp lệ có thể giữ ảnh dù live source dừng; resume/đóng context làm hết ref, dọn theo 13.3. Không tạo collection frame/library riêng                                                                                                          |
| E16 Stroke · BOARD-02 (gồm undo/clear)           | RAM stroke log/snapshot; preview/cursor tạm                                             | Commit gắn tác giả/context/sequence; undo của mình hoặc clear theo quyền                        | Nét hết hiệu lực cùng context; resync chỉ trong runtime còn sống. Không ghi từng điểm vào MongoDB, không giữ bản lời giải lâu dài                                                                                                                   |

### 3. Dữ liệu hỗ trợ và ranh giới lưu

| Dữ liệu hỗ trợ                                                             | Nơi lưu / chủ sở hữu                                                            | Kết thúc và giới hạn                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phiên xác thực                                                             | MongoDB authSessions; cookie client chỉ chứa thông tin phiên theo auth contract | Logout/revoke/expiry chặn HTTP/socket/media liên quan; TTL là dọn metadata, không là kiểm hạn. Thời hạn khởi đầu theo plan 13.2; không log token              |
| Audit                                                                      | MongoDB auditEvents theo model                                                  | Chỉ actor/action/scope/ID/revision/kết quả cần thiết, không chép chat/mục đích nhóm/ảnh/token. Chưa chọn retention audit, không tự đặt số ngày                |
| Join ticket, call ownership, reconnect grace                               | RAM ticket/registry/SessionRuntime theo live session                            | Ticket một lần và có hạn; generation cũ không tác động call mới. Restart hủy đời cũ; hạn ticket/grace lấy từ nguồn live session, không thêm collection ticket |
| Share lease, pending resource, host tạm/đích hoàn quyền, help/announcement | RAM Session/MediaRuntime                                                        | Kiểm epoch/revision/generation và scope; thu trước khi cấp audience mới. Official transfer khác thay tạm; không dùng DB hostUserId đơn lẻ phục hồi quyền      |
| Mediasoup Router/transport/producer/consumer                               | Object runtime của media adapter/worker                                         | Đóng khi scope/phiên hết hiệu lực; không serialize vào MongoDB hoặc phục hồi object từ ID                                                                     |
| Projection/cache, âm lượng và lựa chọn thiết bị cục bộ                     | Browser controller/store tạm                                                    | Refresh/reconnect lấy projection mới; không tự bật mic/camera. Không persist call/track/transport vào localStorage; không thêm tính năng đồng bộ settings     |

### 4. Các chuyển trạng thái cần giữ

Các mũi tên dưới là mô tả nghiệp vụ; tên enum chính thức và cách lưu terminal result sẽ hoàn thiện ở bước 4–5.

| Đối tượng             | Chuyển trạng thái                                                                               | Ràng buộc khi retry / đồng thời                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Membership và PRIVATE | Hợp lệ → bị loại → được mời lại; quyền PRIVATE cũ không sống lại → owner/admin cấp lại kênh     | Rejoin khôi phục tư cách Workspace, không hoàn tác revoke PRIVATE. Không dùng allowedUserIds cũ làm bằng chứng quyền mới; bước 4 dùng grant gắn membership incarnation, không cấp bằng mảng userId cũ |
| Tạo DISCUSSION        | Dữ liệu tạo → kiểm hợp lệ → nhóm/roster hoặc lỗi                                                | Không trạng thái chờ host/hủy pending; serialize create với start/close, retry không nhân nhóm                                                                                                        |
| ACTIVITY round        | Chuẩn bị → đang bắt đầu → đang chạy → đang kết thúc → kết thúc; lỗi bắt đầu → đang hủy → đã hủy | Chỉ chốt chạy khi đã có deadline hợp lệ; hủy chuyển một phần đưa người còn quyền về MAIN, không phục hồi DISCUSSION. Callback cũ không đóng lượt mới, đổi host không reset deadline                   |
| LiveSession           | ACTIVE → ENDING → ENDED                                                                         | Khi ENDING chặn thao tác cấp quyền mới; cleanup lặp an toàn. Join không mở lại đời cũ; kênh LIVE vẫn tồn tại để bắt đầu phiên mới                                                                     |
| Upload attachment     | Đang upload/STAGED → gắn message hợp lệ/READY; bỏ dở hoặc lỗi → chờ dọn                         | Bind và insert message nhất quán, retry không gắn sai conversation; trạng thái file không thay quyền tải. Enum STAGED/READY/DELETE_PENDING và lịch dọn đã có tại bước 4–5                             |
| Frame / board         | LIVE → FREEZING → FROZEN → resume về LIVE; freeze lỗi/hết intent trở về LIVE                    | Intent gắn epoch/context/source; chờ I/O ngoài queue rồi kiểm lại. Sau FROZEN, đổi live source không tự làm mất frame đã chốt còn hợp lệ                                                              |
| Hội thoại meeting     | Đang mở trong scope hợp lệ → khóa khi scope kết thúc → purge theo 9.3                           | Đang giữ DB/file trong retention không có nghĩa còn được đọc; thêm membership/channel access không mở lại hội thoại đã khóa                                                                           |

### 5. Phục hồi và nhất quán giữa các nơi lưu

| Tình huống                                       | Dữ liệu còn lại / cách xử lý đích                                                                                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Socket rớt ngắn, process vẫn sống                | Xác thực lại quyền và generation; resync từ runtime hiện tại. Reconcile deadline trước khi cấp ACTIVITY, không reset countdown hoặc tự nhập lại nhóm đã rời                                                    |
| Process/worker chết làm mất runtime              | Không phục dựng media/nhóm/board từ MongoDB. Bootstrap reconcile phiên cũ thành kết thúc, đóng private conversations và dọn refs theo lifecycle trước khi mở phiên mới; CHANNEL/DIRECT hợp lệ tiếp tục tồn tại |
| Upload đã ghi byte, bind chưa commit             | STAGED/orphan còn metadata/scope; không công bố như attachment/frame hợp lệ; sweeper dọn. Đích triển khai phải xử lý cả byte orphan không có metadata do crash                                                 |
| Message đã commit, chưa ack/fanout               | Retry cùng clientMessageId trả tin cũ sau kiểm quyền hiện tại; history DB là cách lấy lại. Không phát lại nội dung cho người đã bị gỡ quyền                                                                    |
| Gỡ PRIVATE/kick Workspace/xóa kênh đang có media | Deny barrier chặn REST/socket/file → thu media/fanout → ghi quyền/vòng đời và reconcile theo 9.4. Nếu DB lỗi không tự bật lại nguồn; resync theo quyền đã xác minh                                             |
| Job cleanup chạy lại hoặc file đã mất            | Xử lý idempotent, kiểm references hiện tại trước xóa; không xóa frame đang board dùng. Giữ đủ metadata để retry/đối chiếu disk, không coi một lần TTL xóa document là đã dọn cả tệp                            |
| DB tạm lỗi khi runtime còn sống                  | Không báo mutation bền vững thành công trước commit; thao tác quyền không xác minh được không cấp thêm truy cập. Cách timeout/retry cụ thể theo task, không tự kết thúc mọi cuộc họp do một lỗi DB             |

MongoDB transaction bảo đảm thay đổi DB trong phạm vi transaction; không gộp thao tác disk, network/media hoặc thời gian chờ người dùng thành một transaction nguyên tử. Thiết kế bước 4–5 phải giữ ranh giới này và retry/dedupe ở ứng dụng. [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).

TTL MongoDB dọn document ở nền, không bảo đảm xóa đúng thời điểm hết hạn. Vì vậy auth, request, deadline và ACL kiểm hiệu lực tại thời điểm xử lý; cleanup file cần job riêng. [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/).

### 6. Điểm còn phải hoàn thiện và ca review

**Đã chọn hướng lưu ở bước 3:** E01–E10 cần phần bền vững theo model; E11–E16 chủ yếu runtime, E15 dùng tài nguyên E08; group/conversation/file refs đủ để khóa và cleanup sau mất runtime. Không bổ sung collection request/group/round/board/stroke hoặc cơ chế khôi phục buổi học sau restart chỉ vì có các khái niệm này.

**Sau bước 4:** [collection-design](collection-design.md) mô tả field/type/null và nhúng/tham chiếu, grant gắn membership incarnation, file scope/binding/cleanup refs. Chưa có validator/index/migration thực thi; terminal request/dedupe runtime và giới hạn bộ nhớ hoàn thiện trong task runtime; đặc tả DB hiện hành ở bước 5. Chưa đặt retention mới cho User, invitation, audit hoặc metadata phiên/participant. Không có UC quản trị/xem lịch sử tương ứng chỉ từ việc metadata còn lưu. Nhánh không có ứng viên host hoặc host tạm cũng mất mạng vẫn là điểm nghiệp vụ mở tại [live session](../product/live-session.md#83-chuyển-host-và-host-mất-mạng).

Các ca phải kiểm khi triển khai, chưa phải test đã chạy:

1. Tạo Workspace lỗi giữa chừng không để thiếu owner/general/conversation; nhận lời mời đồng thời không nhân membership/lượt dùng.
2. Gỡ quyền PRIVATE khi người đó đang chat/LIVE/tải file: mọi đường truy cập đều bị thu, thêm lại chỉ mở dữ liệu còn lưu theo vòng đời.
3. Loại khỏi Workspace rồi mời lại: DM cũ mở khi cả hai hợp lệ; PRIVATE vẫn bị chặn tới khi owner/admin thêm lại.
4. Create DISCUSSION đồng thời ACTIVITY/END hoặc retry: không nhân nhóm, không cấp quyền vượt phase.
5. ACTIVITY start lỗi chuyển một phần, deadline đến lúc host mất mạng, reconnect/callback trễ: đúng lượt kết thúc, không khôi phục DISCUSSION.
6. Resume/revoke trong lúc chờ upload frame: commit cũ bị từ chối, orphan được dọn; frame FROZEN đang còn refs không bị sweeper xóa.
7. Crash sau message commit hoặc sau byte upload: retry không nhân tin, không mở attachment sai scope, job dọn được dữ liệu bỏ dở.
8. Restart khi có group/chat/frame: không mở lại media/nhóm/board, private history bị khóa; CHANNEL/DIRECT và metadata cleanup còn đủ để xử lý.

**Đầu ra bước 4:** [collection/field và nhúng/tham chiếu](collection-design.md) đã được viết từ ma trận này, gồm query shape theo UC. [Bước 5](integrity-and-migrations.md) đã đặc tả index/validation/concurrency và kế hoạch migration/test, chưa triển khai thực thi. Không chạy DB, seed hoặc migration trong bước tài liệu này.

### 9.3. Quyền lịch sử và retention

| Dữ liệu          | Quyền đọc                                                                    | Kết thúc/xóa                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHANNEL chat/tệp | Membership và channel access hiện tại                                        | Lưu đến khi kênh/Workspace xóa; soft delete khóa đọc ngay                                                                                                                              |
| DIRECT chat/tệp  | Đúng hai participant; cả hai còn membership hợp lệ trong Workspace đang sống | Không đóng theo LIVE; khóa khi mất membership; purge theo Workspace khi xóa. Khi cả hai có membership hợp lệ trở lại, mở lịch sử DM còn lưu của chính cặp này; không tạo hội thoại mới |
| SESSION chat     | Participant hiện thuộc MAIN, session ACTIVE                                  | Khóa khi ENDED, purge sau 24 giờ                                                                                                                                                       |
| GROUP chat/ảnh   | Cùng group đang mở; host đang hỗ trợ                                         | Rời nhóm mất quyền đọc tiếp; close group/session khóa ngay, purge sau 24 giờ                                                                                                           |
| HOST_PRIVATE     | Hai bên ban đầu còn quyền session/channel                                    | Không chuyển audience khi transfer host; khóa khi ENDED, purge sau 24 giờ                                                                                                              |
| Frame/nét        | Board ACL của MAIN/group                                                     | Không là bài lưu; giữ khi đang được dùng, dọn sau mất tham chiếu                                                                                                                       |

Retention 24 giờ là mặc định vận hành khởi đầu để cleanup, không phải tính năng xem lại. Người ngoài runtime không được tải file private kể cả metadata chưa purge. Người mới vào group có thể đọc lịch sử group trong phiên đang mở; chính sách này phải hiển thị trong mô tả nhóm/room.

Files CHANNEL/DIRECT chỉ gắn được vào đúng conversation tương ứng. Reply trong thread dùng ACL conversation CHANNEL của tin gốc. Ảnh nhóm/private không được gắn vào tin toàn Workspace bằng đổi attachmentId. Upload trước lưu STAGED với owner/scope; commit message atomically bind file READY; upload bỏ dở được dọn. Tin hỏi host có ảnh canvas là private attachment, không mở endpoint frame nhóm cho host khi host chưa được cấp board access.

### 9.4. Transaction và đồng bộ runtime

Mongo replica set một node được cấu hình từ dev/CI/staging. Transaction nhiều document cần deployment hỗ trợ; không gọi mediasoup hoặc chờ upload bên trong transaction DB. [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).

| Thao tác                 | Cách bảo đảm                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Tạo Workspace            | Workspace + owner membership + general TEXT + conversation CHANNEL trong một transaction            |
| Nhận invitation          | Kiểm expiry/revoke/maxUses và upsert membership trong transaction; user đã là member không tốn lượt |
| Transfer owner           | Kiểm owner hiện tại/target; đổi ownerId và role hai bên nguyên tử                                   |
| Gửi message + attachment | Validate ACL và bind STAGED file cùng insert message; retry dùng unique clientMessageId             |
| Create live session      | Khóa channel + unique DB; runtime Router chỉ được công bố khi metadata hợp lệ; failure cleanup      |
| Kick/đổi quyền/xóa kênh  | Đặt deny barrier theo scope → đóng media/fanout → ghi DB → reconcile runtime → phát snapshot        |

Nếu DB lỗi sau thu media, không tự mở lại nguồn: participant nhận trạng thái cần resync, chỉ khôi phục sau khi xác thực DB và policy. Barrier phải chặn REST/file/socket liên quan, không chỉ handler kick. Sau crash, không có media runtime cũ; bootstrap đánh dấu phiên cũ ENDED và đóng conversation private trước khi cho join mới.

Message insert thành công nhưng crash trước ack/fanout: retry trả đúng message cũ sau kiểm quyền, history lấy lại được. Không tuyên bố exactly-once toàn mạng hoặc thêm message broker chỉ vì trường hợp này.

### 13.3. Cleanup

- Sweeper mỗi 60 giây: STAGED/orphan frame quá 15 phút; context hết refs dọn sau grace tối đa 5 phút; không xóa frame đang board sử dụng.
- Private session messages/files khóa ngay khi close và purge sau 24 giờ. Metadata tombstone chỉ giữ đủ audit không chứa nội dung riêng.
- Kênh/Workspace soft delete: khóa đọc ngay, purge tệp không còn references sau 7 ngày theo job; không có chức năng restore UI trong scope.
- Cleanup kiểm cả disk lẫn metadata; TTL Mongo không tự xóa file. Quota áp dụng trước upload/commit, sweeper không là cách duy nhất ngăn đầy disk.
- Worker/process crash: bootstrap và sweep đối chiếu epoch/reference; không phụ thuộc người dùng đóng tab đúng cách.

Everyone không mở lịch sử MAIN cho participant đang ở group khác. Đóng tất cả nhóm khóa history/ảnh nhóm, không chuyển conversation GROUP thành SESSION. Tin/ảnh HOST_PRIVATE vẫn giữ hai bên ban đầu khi về MAIN hoặc transfer host. Chat cuộc họp không nhận tệp bất kỳ; CHAT-01/FILE-01 của kênh không bị cắt.

Thread có cùng vòng đời kênh/tin gốc, không nhận retention 24 giờ của cuộc họp. Tạo DM đồng thời phải hội tụ về một cặp; bind reply và attachment cùng transaction, retry không làm reply count tăng lặp. Kick/xóa Workspace thu fanout DIRECT và quyền file liên quan; retention không thay ACL.

### Vòng đời theo hai group mode

Theo [group modes](../product/group-modes.md), create kiểm phiên/phase/quyền/roster rồi tạo ngay; không chờ host. group.join kiểm lại rồi mới cấp membership. Chuyển phase đóng DISCUSSION trước ACTIVITY, không mang chat/board cũ sang mode khác. Leave thu quyền và đóng nguồn share của actor; không giữ queue/transaction khi chờ người dùng.

Countdown gắn round hoạt động và deadline server; hết giờ tự đóng các ACTIVITY của đúng lượt, khóa lịch sử/ảnh nhóm và cleanup refs theo lifecycle, đưa người còn quyền về MAIN. Không công khai dữ liệu nhóm hoặc hứa xóa tức thì mọi byte. Callback lặp/trễ không tác động lượt khác; round/session end hủy countdown. Server restart kết thúc runtime/round đời cũ. Không tự persist countdown hay phục hồi media từ DB.

## Thay đổi quyền kênh PRIVATE — chốt ngày 01/11/2026

Theo [messaging](../product/messaging.md), thêm người cấp quyền toàn bộ lịch sử kênh còn lưu, gỡ người chặn ngay nội dung/event/file/LIVE dù dữ liệu chưa purge. Thêm lại không tạo lịch sử riêng hoặc phục hồi scope nhóm/media cũ. Role owner/admin cho phép quản lý danh sách, không thay membership hợp lệ và channel access khi đọc nội dung. Việc thu quyền phải tác động tài nguyên đang mở và lệnh async cũ; bước 3 mô tả ranh giới DB/runtime, field theo bước 4, transaction/concurrency implementation tiếp tục bước 5; không tự chạy migration. Người bị loại khỏi Workspace không tự lấy lại quyền PRIVATE khi rejoin, owner/admin phải thêm lại.

## Ranh giới backup

Backup/restore theo [technical plan mục 18](../technical-plan.md): MongoDB và tệp lâu dài phải đối chiếu cùng manifest metadata; không biến frame/chat private chờ purge thành kho tài liệu lâu dài qua backup. Bước này không chọn lịch backup/retention mới. Restore dữ liệu không khôi phục runtime, phiên ACTIVE cũ hoặc quyền PRIVATE đã thu; cần reconcile vòng đời/quyền trước mở truy cập. Quy trình restore và bằng chứng diễn tập thuộc task vận hành, chưa được thực hiện ở đây.

## Đối chiếu integrity bước 5

[Index/validation/concurrency/migration](integrity-and-migrations.md) cụ thể hóa thứ tự mutation của bản một process: user ownership → Workspace gate → channel lifecycle → session queue khi cần; không giữ lock trong upload/picker/client ack. Quota dùng file metadata và reservation, không thêm counter collection. Chỉ authSessions có TTL trực tiếp; conversation/message/file được dọn theo job để không mất scope/storage refs trước byte. pairKey scalar cho hội thoại hai người không thay audience.

Sau [review bước 6](review-2026-11-01.md), STAGED còn kiểm expiry và stamp membership/channel trước bind; thu quyền rồi cấp lại không cứu upload cũ. READY vẫn dùng ACL hiện tại để mở lịch sử hợp lệ. Cleanup thread giữ root đến khi hết reply; audit không ghi FAILED khi commit chưa rõ. Owner nhất quán bằng CAS trên Workspace + transaction roles, không dựa unique role OWNER.

Đặc tả DB-01–12 là kế hoạch nghiệm thu, chưa là test đã chạy. Những ghi chú “thiết kế ở bước 5” tại bảng trước dẫn sang nguồn này; schema/migration implementation và ca lỗi thực cần task riêng.

## Capacity và giới hạn vận hành ngày 01/11

Theo [capacity](../capacity.md), bản đầu chấp nhận app/worker restart kết thúc LIVE, drain trước deploy và không phục hồi nhóm/board từ metadata; một node Mongo Docker không thay backup hoặc HA. Hướng thử 25 rồi 50 không đổi retention hoặc mở thêm quyền. Cleanup chia batch/nhả gate, không tranh foreground vô hạn; thu quyền tức thời không chờ sweeper. Frame active/reservation/byte chờ dọn phải cùng nằm trong budget hữu hạn theo profile; 20 MiB/session chỉ là cấu hình thử nhỏ, chưa là capacity bảo đảm.

## Điều chỉnh runtime nhóm ngày 02/11/2026

E12 vẫn ở RAM, không thêm collection/migration. DISCUSSION cần phân biệt roster, membership hiện hành và nhóm đã từng có người theo [group modes](../product/group-modes.md). Người cuối cùng chủ động rời làm nhóm tự đóng: khóa GROUP conversation/file/board ngay, dọn refs và byte theo lịch hiện hành; giữ dữ liệu trong retention không cho phép vào lại hoặc đọc private. Duyệt chưa ai vào vẫn chờ; khi còn người, roster hợp lệ cho phép chủ động vào lại sau kiểm quyền. Disconnect thu membership DISCUSSION ngay, nhóm từng có người rỗng thì đóng; reconnect về MAIN theo quyết định 04/11. Call ownership vẫn có reconnect grace; không empty grace phiên. Không áp quy tắc nhóm trống cho ACTIVITY.

Quan hệ help chỉ gắn ACTIVITY còn mở trong lượt hiệu lực. HOST_PRIVATE vẫn dùng được để host ở MAIN trả lời DISCUSSION; tin/ảnh riêng không cấp quyền lên toàn bộ GROUP conversation/board. Không thay retention, index hoặc schema bền vững trong cập nhật tài liệu này.

## Delta thiết kế sau kickoff 02/11

RECORD-01 / UC-LIVE-11–12 / FR-15-01–03 bổ sung metadata bản ghi gắn LiveSession/kênh, trạng thái ghi/xử lý/sẵn sàng/lỗi ở mức hành vi, tham chiếu video byte và cleanup. Video thuộc kho tệp; không nhúng byte vào MongoDB hoặc tái dùng FRAME/attachment để vượt ACL. Xem [recording](../product/recording.md) và [model](model.md). 13 collection/16 khái niệm cũ mô tả phạm vi trước recording, chưa là thiết kế recording hoàn tất; chưa chốt field/index/migration mới.

Quyền xem kiểm membership và channel access hiện tại, kể cả PRIVATE, không dựa vào participant cũ; xóa kênh/Workspace và thu quyền phải được tính trong lifecycle. Stop/end hoàn tất hoặc báo lỗi, dọn tài nguyên/tệp dở dang; quota/retention/quyền xóa và xử lý restart còn chờ proposal. DISCUSSION tạo hợp lệ ngay, không trạng thái host xét/hủy pending; random preview chỉ là cấu hình ACTIVITY, không tự chuyển người.
