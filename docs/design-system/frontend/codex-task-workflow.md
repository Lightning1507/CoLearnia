# Thành viên làm task FE với Codex

**Quy trình do người phụ trách yêu cầu ghi lại · 07/11/2026.** Thành viên giao task, kiểm cách AI hiểu, cho triển khai, tự thử lại rồi nhờ review trước PR. Codex hỗ trợ thực hiện; thành viên vẫn cần hiểu và chịu trách nhiệm phần mình gửi review.

Tài liệu này chỉ cách trao đổi với AI. [Playbook FE](fe-task-guide.md) hướng dẫn đặt code/state/API và kiểm; [checklist](review-checklist.md) giúp rà trước PR. Nghiệp vụ/contract lấy từ nguồn hiện hành, không tự quyết định theo ví dụ.

## 1. Giao task và nguồn, chưa cho code ngay

Task đã có thì chỉ cần đưa **mã Jira thật**, ví dụ `SCRUM-45`, hoặc mã WBS đầy đủ `M1-T7.2`, thay vì chép lại task/AC. Codex tự tra [mapping Jira ↔ WBS](../../planning/jira/jira-key-mapping.csv); cặp ví dụ này có trong mapping hiện tại. Chỉ bổ sung link ticket hoặc thay đổi mới chưa có trong repo nếu có. Không dùng `T7.2` đơn lẻ vì nhiều miền có mã trùng; mã WBS không thay mã Jira khi liên kết nhánh/commit/PR.

```text
Tôi nhận task [mã Jira hoặc WBS đầy đủ, ví dụ SCRUM-45].

Đọc AGENTS.md, docs/design-system/README.md,
docs/design-system/frontend/README.md và
docs/design-system/frontend/fe-task-guide.md,
docs/ai/workflow.md và CONTRIBUTING.md.
Tra mã Jira/WBS trong docs/planning/jira/jira-key-mapping.csv,
rồi tra task trong docs/planning/sprint-1.md và
docs/planning/task-consolidation.md; theo link tới proposal,
FR/AC, nguồn nghiệp vụ và UI liên quan. Tự đọc code hiện có.

Trước khi code, hãy kiểm code hiện có và báo:
- Task quy định đầu ra, phạm vi, dependency và tiêu chí đạt thế nào;
  dẫn nguồn đã tra, không yêu cầu tôi chép lại phần repo đã có.
- Component/API nào dùng lại được, phần nào còn thiếu.
- Những file dự kiến sửa, nguồn state và cách kiểm.
- Điểm nghiệp vụ/contract cần hỏi.
Phân biệt phần đã triển khai, mock và phương án còn đề xuất.
Chưa sửa code ở lượt này.
```

**Codex tự tra theo thứ tự:** mapping nhận diện Jira/WBS → ticket và nguồn được dẫn (nếu truy cập được) → Sprint 1 lấy cơ sở phân công/phụ thuộc → WBS lấy đầu ra và cách kiểm → proposal/FR/product lấy chi tiết → hồ sơ UI/export và code lấy hiện trạng. Jira giữ assignee, lịch và trạng thái thực tế; mã miền là ownership, không tự suy người thực hiện. Planning/mapping không chứng minh dependency đã hoàn tất: kiểm code/evidence và đầu ra provider trước khi kết luận sẵn sàng. Không truy cập được Jira thì nói rõ, tiếp tục đọc repo; chỉ hỏi nội dung cập nhật/phần thiếu cần thiết, không bắt thành viên chép lại toàn task. Nếu ticket và nguồn hiện hành mâu thuẫn về phạm vi/nghiệp vụ thì nêu hai nguồn để owner/PM chốt trước phần phụ thuộc.

Không thấy mã hoặc thấy nguồn hiện hành mâu thuẫn thì Codex nêu phần đã tra và hỏi đúng điểm thiếu; không tự tạo task/AC thay thế. Task UI/API không được tự thu còn FE vì người nhận gọi là “task FE”; xác định phần được giao nếu cần tách phạm vi. Khi task đã rõ, chỉ tóm tắt đủ để xác nhận, không yêu cầu thành viên viết lại brief dài.

Nếu Figma không truy cập được, AI phải nói rõ; có thể đối chiếu export `docs/figma-ui/` và hồ sơ UI theo phạm vi, nhưng chưa được báo đã kiểm preview. Không đưa secret hoặc dữ liệu cá nhân thật vào prompt để dựng ca thử.

## 2. Thành viên đọc phương án và xử lý điểm chưa rõ

Kiểm bốn điều: AI hiểu đúng AC; dùng lại code hiện có; không mở rộng phạm vi; có cách kiểm lỗi/quyền liên quan. Không cần duyệt từng dòng code trước khi triển khai.

Nếu AI hiểu sai, nhắn lại đúng chỗ cần sửa. Nghiệp vụ hoặc contract chưa rõ thì hỏi owner/PM và các bên cung cấp/sử dụng liên quan; gửi kết luận và nguồn cho Codex. Không bảo AI “tự chọn cách hợp lý” để thay quyết định sản phẩm. Phần độc lập vẫn có thể làm trong phạm vi được giao.

Lượt đầu được yêu cầu chưa sửa code nên Codex dừng ở phương án. Sau khi đã cho triển khai ở bước 3, Codex tiếp tục công việc/check/sửa trong phạm vi đó; không cần hỏi lại từng file hoặc mỗi lần chạy check.

## 3. Cho AI triển khai

Khi phương án đã đúng và điểm chặn phần phụ thuộc được chốt, gửi:

```text
Triển khai theo phương án vừa thống nhất.
Tuân thủ docs/design-system/frontend/ và pattern hiện có.
Giữ những thay đổi có sẵn, không thêm chức năng ngoài task.
Tự chạy check phù hợp, mở browser kiểm flow và hồi quy liên quan.
Báo rõ mock, lỗi, lệnh thực chạy và ca chưa kiểm.
Nếu có nghiệp vụ/contract mới chưa rõ, hỏi trước phần phụ thuộc.
Chưa commit/push/publish.
```

Codex cần báo kết quả thực, không chỉ liệt kê file đã sửa. API chưa có mà task yêu cầu tích hợp thì phải nêu blocker; không tự chuyển sang mock rồi gọi task hoàn thành. Nếu task được giao chỉ dựng UI mock, ghi đúng giới hạn đó.

## 4. Thành viên tự mở app thử lại

Đọc diff và thử các AC chính trên app. So kết quả với yêu cầu, không chỉ với lời AI nói. Không cần lặp mọi test tự động, nhưng phải hiểu luồng và giải thích được thay đổi.

Có lỗi thì gửi bước tái hiện cụ thể:

```text
Màn/context: [...].
Vai trò/dữ liệu ban đầu: [...].
Bước tái hiện: 1. [...] 2. [...] 3. [...].
Mong đợi theo AC/nguồn: [...].
Thực tế: [...].
Ảnh/log an toàn nếu cần: [...].

Hãy xác định nguyên nhân, sửa trong phạm vi task,
kiểm lại ca này và hồi quy liên quan. Chưa commit/push/publish.
```

Không chỉ gửi “bị lỗi rồi, sửa đi”. Khi Codex sửa xong, thử lại ca lỗi và kiểm phần liên quan; chưa đạt thì tiếp tục vòng sửa, không chuyển sang task mới để bỏ lỗi bắt buộc.

## 5. Nhờ AI rà trước PR

```text
Rà thay đổi của task theo
docs/design-system/frontend/review-checklist.md.
Kiểm phạm vi, tổ chức code, state/API, lỗi/quyền,
cleanup và ca chưa kiểm có liên quan.

Báo finding có vị trí, ảnh hưởng và cách tái hiện nếu có;
phân biệt lỗi cần sửa với gợi ý. Chưa sửa trong lượt rà này.
Sau phần finding, soạn title và description PR theo CONTRIBUTING.md
và template repo; dùng mã Jira thật đã đối chiếu nếu task có ticket,
chỉ ghi check/evidence thực có, nêu rõ giới hạn còn lại.
Không tự commit/push/tạo PR/merge.
```

Có finding cần sửa thì thành viên yêu cầu Codex sửa, kiểm lại rồi cập nhật mô tả PR. Không để PR body vẫn ghi pass hoặc phạm vi cũ sau khi implementation đã đổi. Review cùng Codex hỗ trợ tìm lỗi, không thay review độc lập của thành viên khác.

Thành viên đọc diff cuối, thực hiện commit/push/tạo PR khi sẵn sàng theo [Git và PR](development-workflow.md#git-và-pr), giữ cùng mã Jira thật trong nhánh/commit/PR khi có ticket. Gắn PR vào Jira, chuyển In Review, request reviewer chính trên GitHub và gửi link vào nhóm kèm tag; sau sửa request review lại. Dùng [workflow team](../../ai/workflow.md#cập-nhật-tiến-độ-và-gửi-review) cho mẫu comment khi bắt đầu/block/gửi review và điều kiện Done. Kiểm Development trên Jira, không mặc định đồng bộ tự chuyển trạng thái. Chỉ Done khi đủ AC, review/checks đạt và đã merge; bên nhận task phụ thuộc xác nhận dùng được.

Nếu muốn Codex làm thao tác Git, cập nhật Jira/GitHub hoặc gửi tin thì giao rõ hành động; prompt triển khai ở bước 3 chưa ủy quyền chúng. Chưa có ticket/reviewer thật thì không bịa để điền template.

## Ví dụ: nhận SCRUM-45 — M1-T7.2

`SCRUM-45` ánh xạ tới `M1-T7.2` trong mapping; task có trong [Sprint 1](../../planning/sprint-1.md) và [WBS](../../planning/task-consolidation.md): dựng shell/sidebar và vị trí nhúng chat/cuộc gọi bằng fixture đúng contract. Ví dụ dưới minh họa cách trao đổi, không xác nhận trạng thái ticket, task đã được giao/triển khai hoặc các ca đã chạy.

### Lượt A — giao task để Codex đọc và đề xuất

```text
Tôi nhận task SCRUM-45.
Đọc AGENTS.md và docs/design-system/frontend/README.md,
docs/ai/workflow.md và CONTRIBUTING.md.
Tra mapping Jira/WBS, task/phụ thuộc/tiêu chí trong planning
và các nguồn được dẫn; nếu đọc được ticket thì đối chiếu cập nhật,
rồi kiểm code và UI tham chiếu hiện có.
Tóm tắt phạm vi, phần dùng lại/còn thiếu, dependency đã sẵn sàng
hay chưa có bằng chứng, phương án file và cách kiểm.
Chưa sửa code; chỉ hỏi điều còn thiếu hoặc mâu thuẫn thực sự.
```

**Codex cần tự lấy ra từ nguồn:** Sprint 1 liệt kê dependency `M1-T1.2`, `M3-T1.1`, `M2-T1.1`; WBS yêu cầu nhúng panel mẫu, đổi panel không unmount call controller và không hiển thị kênh ngoài projection quyền. Codex đối chiếu component contract M2/M3/M4 và code trước đề xuất, không để thành viên chép các dòng này vào prompt.

**Thành viên xem phản hồi:** đúng đầu ra fixture/shell và điểm giao, không tự mở rộng sang auth/chat/media hoàn chỉnh; không gọi panel mock là call thật. Nếu Codex chỉ nói “tạo sidebar đẹp” mà bỏ lifetime controller/quyền hoặc tự gán người theo mã M1 thì yêu cầu tra lại nguồn. Khi đủ điều kiện, gửi prompt bước 3; dependency còn thiếu thì chốt interface với owner, không tự bịa để ghép.

### Lượt B — tự thử và báo lỗi cho Codex

Giả sử thành viên phát hiện lỗi khi chuyển panel, gửi:

```text
Tôi thử SCRUM-45 (M1-T7.2):
1. Mở shell với call/controller fixture đang hoạt động.
2. Mở Chat, chuyển sang panel Nhóm rồi quay lại Chat.
Mong đợi theo WBS: đổi panel không unmount call controller.
Thực tế giả sử: controller fixture bị tạo lại và state cuộc gọi reset.

Hãy xác định nguyên nhân, sửa và kiểm lại vòng đời controller
khi mở/đóng/chuyển panel; kiểm hồi quy sidebar và projection quyền.
Chỉ sửa phạm vi liên quan; chưa commit/push/publish.
```

Đây là tình huống giả định để minh họa cách báo lỗi, không khẳng định code hiện tại có lỗi này. Kiểm controller fixture chỉ chứng minh lifecycle ở mức fixture; không thay bằng chứng media thật của task tích hợp.

### Lượt C — rà và chuẩn bị PR

Sau khi thử lại đạt các AC của phạm vi, gửi prompt bước 5. Thành viên kiểm báo cáo có lệnh/kết quả và ca browser thật, phần API/quyền còn chưa kiểm có ghi đúng không; xử lý finding bắt buộc trước gửi reviewer. Không copy câu “tất cả pass” khi Codex chỉ chạy build hoặc fixture.

Kết thúc phần triển khai cần có: shell/panel đúng contract, lifetime và projection đúng phạm vi, check/evidence kiểm lại được và PR ghi rõ fixture. Khi thành viên tạo nhánh/commit/PR cho ví dụ, dùng các mẫu `SCRUM-45` ở [Git và PR](development-workflow.md#git-và-pr), rồi thực hiện bước gửi review bên trên; chưa coi mở PR là Done. Thành viên chỉ cần đưa mã task và thông tin mới ngoài repo; Codex tự truy nguồn, không cần viết lại task hoặc toàn bộ design system.

## Khi nào cần Figma Make?

Chỉ khi task còn phải sửa/chốt prototype: Codex soạn prompt trong chat → thành viên chạy Make → Codex review preview và ghi evidence → prompt fix nếu cần. Task FE có thiết kế rõ thì triển khai trong repo, không qua Make mỗi lần. Không restore v14 làm mất sửa sau đó, không tự publish và không lấy lời Make báo xong làm kết quả kiểm.
