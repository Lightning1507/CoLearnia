# Evidence — đồng bộ messaging và harness 27/10/2026

## Snapshot và phạm vi

Working tree trên branch `chore/project-harness`, base commit `ccc9566`. Bao gồm thay đổi scope theo quyết định team 27/10 và bản backlog chưa commit; đây không phải evidence của một release đã triển khai.

- Nghiệp vụ: general mặc định, quyền tạo kênh owner/admin, DM text/ảnh/file, thread TEXT một cấp; giữ chat cuộc họp text/ảnh và về MAIN thay floor/presentation.
- Harness: root/scoped AGENTS, workflow/task brief, kiến trúc, hướng dẫn contracts và danh sách nguồn checker đều dẫn tới messaging.
- Checker đọc trực tiếp messaging; ca fixture mới chèn link local hỏng trong messaging để bảo đảm chỉ link từ mục lục tới file chưa đủ làm test pass.
- Không thay code nghiệp vụ, schema executable, migration, dependency hoặc runtime pin.

## Kiểm tra thực chạy

- `pnpm check:harness`: exit 0, **30/30 tests đạt**; nguồn và runtime pins đạt.
- `pnpm exec eslint scripts/check-harness.mjs scripts/check-harness.test.mjs`: exit 0.
- Script kiểm tài liệu: 20 feature IDs duy nhất, có CHAT-02/03, không còn FLOOR-01/PRESENT-01 trong bảng scope; không còn lệnh floor/presentation hoặc REST presentation trong contracts đích của plan; số cột các bảng Markdown đã rà nhất quán.
- `git diff --check`: exit 0 tại snapshot kiểm.

## Giới hạn và điểm mở

Checker không kiểm ngữ nghĩa, mọi anchor hoặc hành vi ACL. Kết quả không chứng minh DM riêng tư, thread chạy đúng hoặc cuộc gọi/media đã đạt nghiệm thu. Không chạy lại build/media/Docker trong đợt tài liệu/checker này vì không đổi ứng dụng hoặc hạ tầng. Format và link check cuối được báo trong bàn giao.

Lịch sử DM khi rejoin, badge chưa đọc nếu đưa vào, index/migration cụ thể và effort/capacity vẫn theo [trạng thái quyết định](../decision-status.md) và [messaging](../product/messaging.md); không tự chốt thay nhóm. Cần test hành vi T-01/T-02/T-10/T-13 khi triển khai feature thực.
