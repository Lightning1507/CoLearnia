# Review nội dung harness — 26/10/2026

**Kết luận tại thời điểm review:** có hai lỗi hướng dẫn cụ thể cần sửa và một cách diễn đạt database cần làm rõ. Phần trích chuyển không làm mất/đổi các quy tắc baseline đã đối chiếu. Một số quy ước vận hành do agent cụ thể hóa thêm phải được phân biệt với quyết định sản phẩm. Các mô tả và số dòng trong findings ghi trạng thái trước khắc phục.

**Khắc phục ngày 26/10/2026:** F1/F2/F3 đã được sửa tại database model và root AGENTS/workflow. Bổ sung [bản đồ trạng thái quyết định](decision-status.md) để phân biệt nội dung đã có trong plan với chi tiết còn cần hoàn thiện; không tự chọn thư viện auth, schema/index mới, người thật, ngày lịch hoặc budget. Báo cáo này được giữ để truy vết, không là chỉ dẫn áp dụng các câu cũ bị nhận xét.

## Phạm vi và bằng chứng

- Rà root/scoped AGENTS, mục lục, product, architecture, database, AI workflow/task template, technical plan, README/CONTRIBUTING, PR template, quality/local runbook/contracts/ADR và evidence harness.
- Đối chiếu 16 section/subsection được chuyển với bản v2.1 chụp trước tách file và cả technical plan đã được Git theo dõi tại HEAD `748f5963dca7e4a03dafe001d5d733cd4d06acc3`: giữ nguyên nội dung sau cùng cấu hình Prettier Markdown. Kiểm chứng này áp dụng các khối được chuyển, không chứng minh mọi câu mới bổ sung đều là baseline.
- Chạy lại `pnpm check:harness`: 29/29 tests qua, 44 nguồn/link và runtime checks qua. Kết quả xanh không phát hiện các lỗi ngữ nghĩa bên dưới.
- TypeScript trace resolution của web xác nhận `@colearnia/contracts` được resolve tới `packages/contracts/dist/index.d.ts`; không trực tiếp tới source schema.
- Không chạy lại Docker/media hoặc sửa code nghiệp vụ cho tác vụ review tài liệu. Không kiểm tra remote branch protection hoặc cấu hình agent trên máy thành viên khác.

## F1 — P2: Biến collection nhóm từ tùy chọn thành bị cấm

Vị trí: [database model dòng 39](database/model.md#chi-tiết-cần-hoàn-thiện-trong-task-database), đối chiếu mục 9.1 cùng file.

- Baseline tại mục 9.1 ghi: “GroupRuntime không bắt buộc có collection”.
- Đoạn agent bổ sung lại ghi: “Không tự thêm collections nhóm/artifact/quiz/timer”.
- Collection nhóm là phương án triển khai cho chức năng đang có scope; artifact/quiz/timer thuộc nhóm tính năng đã loại. Gộp chúng vào một lệnh cấm làm hẹp lựa chọn ngoài điều baseline đã chốt và tạo mâu thuẫn ngay trong cùng file.
- Đây là lỗi agent đã thêm khi viết harness, không phải câu được trích nguyên từ plan.

**Sửa đề nghị:** bỏ “nhóm” khỏi nhóm collections bị cấm vì ngoài scope. Giữ câu “GroupRuntime không bắt buộc persist; nếu cần collection hỗ trợ, ghi lý do, vòng đời, ACL và review thiết kế trước khi triển khai”. Không tự quyết định phải có hoặc không được có collection nhóm.

## F2 — P2: Hướng dẫn build contracts chưa xử lý dist đã cũ

Vị trí: [root AGENTS dòng 14](../AGENTS.md#package-manager-và-lệnh); đối chiếu [exports contracts](../packages/contracts/package.json).

- Root hướng dẫn build contracts trước nếu dist chưa có.
- Nhưng consumer resolve types tới dist. Khi dist đã có mà source schema đổi, chạy riêng typecheck web/server có thể vẫn kiểm với declarations cũ.
- `pnpm check` và hướng dẫn contracts có build đúng, nên đây là lỗi trong vòng kiểm tra nhanh; không phải khẳng định cổng trước PR hiện bỏ qua build.
- Đây là hướng dẫn mới do agent viết, không là quyết định nghiệp vụ.

**Sửa đề nghị:** khi source contracts đổi, build contracts trước mọi typecheck/build consumer hoặc giữ contracts watcher chạy. Chỉ cần diễn đạt lại lệnh hiện có, chưa cần thêm dependency hoặc thay cấu trúc package.

## F3 — P3: “ownerId duy nhất” còn dễ bị hiểu thành unique index

Vị trí: [database model dòng 13 và 38](database/model.md).

- Bảng ràng buộc ghi “ownerId duy nhất”, đứng cạnh các mô tả index unique thật.
- Bên dưới lại cảnh báo không suy thành unique toàn collection. Dòng cảnh báo giảm rủi ro nhưng chưa loại mơ hồ ở bảng chính.
- “Một Workspace có đúng một owner” không tự chứng minh rằng “một user chỉ được sở hữu một Workspace”. Không nên biến hai mệnh đề đó thành một index khi chưa xác nhận.
- Cụm từ mơ hồ có từ baseline; harness không tạo ra nó. Phần agent giải thích bên dưới nên được xem là lưu ý tránh suy diễn, không phải quyết định mới về cardinality user–Workspace.

**Sửa đề nghị:** đổi mô tả bảng thành “ownerId tham chiếu owner của Workspace; đồng bộ với owner membership”. Khi thiết kế index, ghi rõ cardinality và điều kiện transaction cần bảo vệ; không tự thêm unique(ownerId).

## Những nội dung còn mở, chưa được harness tự chốt

| Nội dung                        | Trạng thái thực và nguồn                                                                              | Cách xử lý                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Thư viện băm mật khẩu           | Plan mục 13.1 còn Argon2id hoặc bcrypt; Workspace guide cũng ghi cần chọn implementation              | Chốt trong task auth, kèm cấu hình/đo; không coi harness đã chọn một thư viện |
| Schema chi tiết/migration       | Model nêu collections/field chính, chưa đủ types/nullability/index definition và migration executable | Hoàn thiện theo feature database, review trước khi chạy migration             |
| Codec/cấu hình chất lượng media | Scaffold/smoke có Opus/VP8; live guide vẫn yêu cầu xác nhận browser mục tiêu và số đo                 | Không gọi smoke là phê duyệt cấu hình nghiệm thu cuối cùng                    |
| SFU nghiệm thu                  | mediasoup được chọn để PoC, ADR-001 vẫn Proposed với gate rõ                                          | Giữ gate; không tự Accepted hoặc đổi SFU                                      |
| A–E, ngày lịch, capacity/budget | Scope mục 1.4 và plan mục 15/18 còn phần chưa xác nhận                                                | Gán người thật và lịch trong bước tổ chức dự án; không bịa cam kết            |
| GitHub Projects                 | User chọn dùng Projects, nhưng fields/status/labels/automation chưa thiết kế hoặc cấu hình            | Làm ở đợt Projects, không coi bộ harness hiện tại đã tạo chúng                |
| Quyền hiệu lực trên năm máy     | Mới có hướng dẫn onboarding, chưa xác minh toàn nhóm                                                  | Kiểm trên từng máy; không coi AGENTS/checker là sandbox                       |

Timeout, quota, retention, giới hạn workload và policy nhóm được chuyển từ baseline; các giá trị ghi “khởi đầu/mục tiêu thử” vẫn là giá trị cần kiểm chứng, không tự thành SLA chỉ vì chuyển sang file mới.

## Những quy ước agent đã cụ thể hóa thêm

Các nội dung sau là thiết kế vận hành harness, không phải nghiệp vụ vốn có trong technical plan. Người dùng đã đồng ý hướng triển khai harness; chưa thảo luận riêng từng chi tiết dưới đây:

- Bố cục/tên file, cách chia AGENTS và task template; cách chọn check theo rủi ro.
- Quy tắc chỉ commit khi được yêu cầu và attribution cho AI commit.
- Ngưỡng tối đa 100 dòng cho entry point; danh sách nguồn bắt buộc của checker.
- Cách checker nhận dạng pin: so major @types/node, engines theo một dạng chuỗi, Node image theo suffix bookworm-slim đang dùng và một số chuỗi phiên bản trong docs. Đây không phải kiểm tương thích semver tổng quát.
- Danh sách import bị cấm cụ thể trong contracts và chiều server → web, để hiện thực hóa ranh giới app/contracts đã thống nhất. Guard chưa giải mọi alias hoặc đường thực thi động.
- Checklist canary/onboarding và đánh giá sau 2–3 PR; chưa phải hoạt động đã được thực hiện trên toàn nhóm.

Các lựa chọn này nhìn chung phù hợp phạm vi triển khai harness, không tự thêm tính năng sản phẩm. Tuy vậy nên gắn nhãn rõ “quy ước harness của nhóm”, để có thể review/chỉnh mà không nhầm là yêu cầu môn học hoặc quyết định nghiệp vụ đã được chốt riêng.

## Các phần nhất quán trong phạm vi rà soát

- Camera, nhóm riêng, vẽ cơ bản, help, floor/presentation và reconnect vẫn thuộc scope; quiz/timer/library và vẽ nâng cao vẫn ngoài scope.
- Root/scoped AGENTS và product docs cùng yêu cầu server kiểm quyền, revoke tài nguyên, lọc projection; không dùng ẩn UI/gain=0 thay quyền.
- Runtime Node 26.12.1/pnpm 11.5.2 đồng bộ với quyết định cập nhật plan và cấu hình repo.
- Phân biệt thiết kế đích, scaffold và bằng chứng khá rõ; không thấy tuyên bố đã hoàn thành nghiệp vụ chỉ vì package/worker đã cài.
- Github Issues/PR/Projects và việc chưa cấu hình Projects thống nhất với chỉ đạo mới của người dùng.
- Không thấy harness đã tự chọn thư viện password, tạo schema/migration hoặc tự xác nhận budget/ngày nộp.

## Thứ tự xử lý đề nghị

1. Sửa F1 và F2; làm rõ F3 bằng cách bỏ từ ngữ dễ hiểu nhầm, không tự đặt thêm cardinality.
2. Ghi rõ phân biệt quy ước vận hành với quyết định sản phẩm; dùng một danh sách điểm mở có link nếu nhóm thấy cần, không tạo backlog thứ hai.
3. Các điểm mở về auth/DB/media chỉ cần chốt trước task phụ thuộc, không buộc dừng mọi công việc để chốt hết cùng lúc.
4. Review này chưa xác nhận toàn bộ hệ thống nghiệp vụ đúng hoặc mọi quyền runtime đã được enforce; đó là phạm vi test và onboarding tiếp theo.
