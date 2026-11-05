# Proposal theo miền phụ trách

Mỗi thành viên đặt proposal `.md` của miền mình trong thư mục này. [Proposal mẫu](../templates/feature-proposal-sample.md) minh họa cấu trúc và mức chi tiết; ví dụ quản lý sách, công nghệ và số liệu trong mẫu không phải yêu cầu của CoLearnia.

## Đặt tên file

| Miền                        | Tên file                                     |
| --------------------------- | -------------------------------------------- |
| M1 — Tài khoản và Workspace | `m1-workspace-auth.md`                       |
| M2 — Chat và tệp            | `m2-messaging-files.md`                      |
| M3 — Media                  | `m3-media.md`                                |
| M4 — Phiên họp và nhóm      | [m4-session-groups.md](m4-session-groups.md) |
| M5 — Board                  | `m5-board.md`                                |

Phạm vi chính xác lấy từ [5 miền phụ trách](../product/delivery-domains.md) và [FR/AC](../product/functional-requirements.md). Chỉ tạo file của miền đã nhận, không cần tạo sẵn các file trống.

## Chuẩn bị và gửi review

1. Từ `main` mới nhất, tạo nhánh riêng, ví dụ `feature/m3-media-proposal`.
2. Viết proposal theo mẫu, tập trung vào phạm vi, hướng triển khai, dữ liệu/API/socket, quyền, các miền cần phối hợp, rủi ro, task sơ bộ và estimate. Ghi rõ giả định và câu hỏi chưa chốt.
3. Push nhánh và mở **Draft PR** vào `main`; title tiếng Anh, ví dụ `docs(media): propose media implementation`. Description tiếng Việt theo quy ước PR của repo.
4. Gửi link Draft PR vào nhóm Messenger. Đợt review ngày **03/11/2026**, gửi trước **18:00 (giờ Việt Nam)** để team đọc trước buổi họp.
5. Các thành viên đọc phần giao với miền mình và comment trực tiếp trong PR. Sau buổi họp, tác giả cập nhật trên cùng nhánh/PR, chuyển sang Ready for review khi đủ nội dung rồi thực hiện review/merge theo quy trình.

Proposal là thiết kế để thảo luận; việc mở PR hoặc merge tài liệu không tự thay đổi nghiệp vụ/kiến trúc đã chốt. Thay đổi baseline cần được thống nhất và cập nhật nguồn liên quan. Estimate ghi kèm giả định và phụ thuộc; chưa là cam kết sprint.

## Quy ước chung trước khi lập sprint

Cập nhật 05/11/2026 để đọc chéo 5 proposal. Bước tổng hợp thực thi nằm tại [WBS và điểm giao giữa 5 miền](../planning/task-consolidation.md): PM chốt trách nhiệm và thứ tự; không chờ một vòng team duyệt toàn bộ kế hoạch. Review PR/contract vẫn giữ theo quy trình. Các bảng dưới thống nhất trách nhiệm và cách đọc estimate; không là bảng trạng thái, phân công hỗ trợ hoặc cam kết sprint. Nghiệp vụ lấy từ nguồn product, đặc biệt [recording](../product/recording.md), [board](../product/board-collaboration.md) và [phân miền](../product/delivery-domains.md). Merge proposal không tự nghiệm thu code hoặc chốt mọi thông số kỹ thuật.

### Kế hoạch thực thi sau proposal

PM đã chốt [khung ba milestone](../planning/milestones-and-sprints.md) và [Sprint 1](../planning/sprint-1.md). Sprint 1 chỉ rõ người thực hiện hỗ trợ khác miền, reviewer và dependency tối thiểu; owner miền giữ trách nhiệm thiết kế. Estimate WBS không tự là lịch hoặc assignee. Sprint 2–3 còn là dự kiến, điều chỉnh theo kết quả tích hợp/PoC.

### Quy ước API/backend

Dùng [quy ước API chung](../contracts/api-conventions.md) và [bảng mã lỗi](../contracts/error-codes.md) khi chuyển proposal sang task implementation. Bảng endpoint/payload trong từng proposal vẫn là thiết kế dự kiến; cập nhật schema của task sắp làm cùng consumer trước code phụ thuộc. Không tự chọn response hoặc tên lỗi khác cho cùng ý nghĩa; không chờ thiết kế hết API các sprint sau.

### Một đầu ra, một đầu mối

| Điểm giao                                       | Bên cung cấp chính                                                                 | Bên tích hợp và giới hạn trách nhiệm                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth, quyền kênh, User/Workspace và web sidebar | M1                                                                                 | M2–M5 dùng chung identity/access; M4 bổ sung quyền runtime. M1 không viết schema hoặc controller tất cả miền.                              |
| `general` và kênh TEXT                          | M1 điều phối tạo Workspace/kênh; M2 cung cấp conversation factory                  | Dùng cùng connection/transaction session; mỗi bên tính công phần mình, có một ca rollback chung.                                           |
| Thu quyền                                       | M1 điều phối auth/Workspace/kênh; M4 điều phối LIVE/scope                          | M2 thu chat/file, M3 thu media, M5 thu board; xác nhận thu quyền khác purge byte. Không tạo coordinator/policy độc lập cạnh tranh.         |
| Call shell/controller và stage                  | M3                                                                                 | M2 nhúng chat, M4 nhúng nhóm/host, M5 nhúng board. Không tạo trang call/socket/controller thứ hai trong từng panel.                        |
| Xác nhận takeover/end                           | M4 sở hữu luồng và component xác nhận                                              | M3 nhúng và thực thi phần controller/media. Task M4 làm UI/hành vi; task M3 kiểm cleanup/generation, không viết lại hộp thoại.             |
| Avatar                                          | M1 sở hữu UI/API hồ sơ và tham chiếu User; M2 cung cấp upload/cleanup Cloudinary   | URL avatar công khai; không dùng quyền hoặc storage này cho file chat/frame/video riêng tư.                                                |
| Freeze và ảnh frame                             | M5 sở hữu capture/intent/board/ref; M2 sở hữu file upload/bind/content/release     | M3 cung cấp nguồn/readiness/source identity; M4 cung cấp context/deadline. Frame lưu R2 riêng tư qua M2, không có kho disk riêng của M5.   |
| Chụp canvas gửi chat                            | M5 tạo ảnh từ hình+nét hiện hành có quyền                                          | M2 upload/gửi attachment mới đúng đích; không đổi binding/quyền FRAME đang dùng. Không thêm thư viện/export lâu dài.                       |
| Recording                                       | M3 capture/encode/helper/admission; M2 repository/storage; M4 host/scope/lifecycle | Interface nội bộ không phụ thuộc SDK provider. M2 cấp artifact trước capture, xác minh R2/READY/receipt; cần PoC writer/seek/finalize sớm. |
| Danh sách và trình phát video                   | M2 sở hữu UI, REST metadata/content/Range và ACL                                   | M3 nhúng/mở component từ shell, kiểm playback/revoke khi tích hợp; M4 cung cấp metadata phiên khi cần, không dựng kho video thứ hai.       |
| Môi trường, staging, đo tải và demo chung       | Team phân người trước khi giao task                                                | Mỗi miền cung cấp ca kiểm/metric tương ứng; chưa mặc định giao toàn bộ vận hành cho M3 hoặc QA/FE chung cho M5.                            |

### Quyết định áp dụng chung

- DISCUSSION tạo sau kiểm hợp lệ, chủ động join, không host duyệt/help; disconnect thu membership ngay, nhóm từng có người rỗng thì đóng. ACTIVITY vào lại đúng phân công, không điều chuyển khi đang chạy; deadline tự về MAIN.
- Recording MAIN tối đa 3 tiếng/đoạn từ capture-start; đổi host không reset/dừng. READY giữ vô thời hạn; quota, quyền xóa và byte khi xóa cha vẫn mở. R2 giữ tệp riêng tư, Cloudinary chỉ avatar. Pipeline GStreamer/codec/profile cần PoC; không lấy clip ngắn làm bằng chứng ghi 3 tiếng.
- Document ID dùng ObjectId; group/round/epoch/intent runtime dùng UUID. Mỗi miền dùng context hiện hành do M4 cấp; không suy quyền từ role client hoặc Socket.IO room.
- Command/ack/event và snapshot chia phần phải nằm trong budget chung; M5 đề xuất tối đa 16 KiB cả envelope cho một phần, không dùng batch 48 KiB trong profile control hiện tại. Giới hạn đề xuất phải review/đo trước handler; không tăng cap transport để né lỗi.
- Error catalog và strict schema chưa hoàn tất chỉ vì proposal đã nêu tên mã. M1 chủ trì quy ước HTTP/auth; các miền cùng review lỗi đặc thù và ack trước consumer, không tự đổi mọi lỗi thành một mã chung hoặc gọi contract đã triển khai.

### Đọc WBS và estimate

| Miền                        | Task con thực tế | Giờ cơ sở theo dòng task | Phần ngoài cơ sở | Tổng dự kiến |
| --------------------------- | ---------------: | -----------------------: | ---------------- | -----------: |
| [M1](m1-workspace-auth.md)  |               56 |                      268 | 32 giờ dự phòng  |          300 |
| [M2](m2-messaging-files.md) |               60 |                      290 | 54 giờ dự phòng  |          344 |
| [M3](m3-media.md)           |               66 |                      312 | 72 giờ dự phòng  |          384 |
| [M4](m4-session-groups.md)  |               41 |                      200 | 32 giờ dự phòng  |          232 |
| [M5](m5-board.md)           |               24 |                      110 | 8 giờ dự phòng   |          118 |

Giờ cơ sở đã có kiểm gần thay đổi; không cộng thêm một tỷ lệ test/review chung lần nữa. Ca kiểm xuyên miền trong nhiều proposal là công riêng của từng bên chuẩn bị/tích hợp, không mặc định là nhiều buổi test độc lập; khi lập sprint phải chỉ rõ ai làm đầu ra nào, ai tham gia và giờ của từng người. Chưa có cơ sở cộng thêm buffer cấp team chồng lên mọi buffer miền.

- Tn/Wn là nhóm việc, task con mới là đơn vị giao. Mỗi task 2–8 giờ tập trung và có đầu ra/AC/phụ thuộc; cần vừa giờ thực có trong ngày, không mặc định mọi người có 8 giờ/ngày.
- Có FE trong cả năm miền. Figma là đầu vào thiết kế, không cộng lại toàn bộ FE sau khi đã tính trong task; công review/điều chỉnh UI chưa có đầu ra rõ thì ước lượng riêng.
- Task khảo sát/PoC có timebox: kết thúc bằng bằng chứng/kết luận/blocker; chưa đạt thì review task tiếp, không tự xem là feature Done. Ngân sách sau PoC còn tạm phải ước lượng lại trước cam kết.
- Provider và consumer có thể bắt đầu từ interface/fixture nhỏ đã review, không buộc chờ trọn miền. Nghiệm thu sản phẩm cần provider thật. Các phụ thuộc ghi quá rộng theo nhóm trong WBS phải thu về task con trước giao việc.
- Báo ngay khi blocked hoặc có nguy cơ vượt estimate: đầu ra/kiểm đã có, giờ đã dùng, phần còn lại, tác động và người cần hỗ trợ. Không chờ hết ngày/daily mới báo hoặc tự đổi hạn.
- PM xác nhận team ưu tiên dự án và đủ thời gian; lập sprint sau khi rõ đầu mối môi trường và điểm giao, vẫn tính công review/tích hợp và công PM. Các lịch 4 tuần cũ chỉ để đối chiếu, không là cam kết mới cho mốc báo cáo khoảng 6 tuần. Jira giữ task/trạng thái; PR giữ review/bằng chứng, không tạo bảng trạng thái song song trong proposal.

### Điểm cần đóng trước task phụ thuộc

M1: thư viện/tham số băm, giới hạn input, cơ chế lưu/tái tạo link mời. M1–M2: uploadId/avatar/cleanup. M2: mốc catch-up theo commit, quota/allowlist và budget file. M2–M3: writer/artifact/seek/finalize/receipt, quota và tệp tạm recording. M3–M4: signaling/context/cleanup/proof/ICE. M5 với M2/M3/M4: board envelope/sync/source identity/release ref và thời gian fade. Các giá trị profile trong proposal là đề xuất cần review, không tự trở thành quyết định sản phẩm.
