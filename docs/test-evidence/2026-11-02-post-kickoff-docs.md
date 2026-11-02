# Review tài liệu sau kickoff — 02/11/2026

## Phạm vi

Working tree hiện có thay đổi từ lượt DISCUSSION lifecycle và file Astah do người dùng sửa. Lượt này giữ các thay đổi đó, bổ sung quyết định: DISCUSSION auto-create, ACTIVITY random preview và RECORD-01 ghi/lưu/xem lại MAIN. Không commit/push, không sửa `.asta`/PNG/Figma, không chạy migration/seed hoặc triển khai recorder.

## Kết quả review nội dung

- Đã bỏ host approve/reject/hủy pending nghiệp vụ ở nguồn hiện hành; HS-02 bản 5 mô tả create rồi chủ động join. Giữ validation, roster khác membership, phase, isolation, vòng đời tự đóng và host đóng DISCUSSION.
- UC-GRP-03 giữ mã lịch sử nhưng ngừng áp dụng; random là nhánh GRP-05, không UC kỹ thuật riêng. Recording bổ sung LIVE-11/12; tổng hiện hành 47 UC độc lập/truy cập chung, không tính 8 mã gộp và một mã ngừng áp dụng.
- Đếm trực tiếp bảng FR: 56 dòng, 56 mã duy nhất; PB-15 và FR-15-01–03 truy vết RECORD-01. M3 chủ trì pipeline/FR-15-01–02, M2 FR-15-03, M4 host/scope/lifecycle, M1 channel access; tổng miền 15+11+9+16+5=56.
- Recording chỉ MAIN (share/camera/audio), không đi theo host vào hỗ trợ hoặc ghi nhóm riêng. Video cần quyền kênh hiện hành. REC-01 vẫn reconnect. Demo vài phút không biến thành thời lượng tối đa.
- Thiết kế DB trước recording có 13 collection; chưa giả định đã bao phủ metadata/video. Có delta dữ liệu/quyền/cleanup, không tự chọn collection/index/migration mới.
- Giữ điểm mở pipeline, bố cục/số camera/codec, quota/retention/quyền xóa và xử lý sự cố. Capacity và lịch cần PoC/estimate lại; chưa công bố recording đạt tải hoặc triển khai xong.
- Hình Astah/PNG và Figma trước thay đổi cần cập nhật sau; ghi delta ở tài liệu bản vẽ/UI, không báo sai rằng file người dùng chưa từng cập nhật các quyết định cũ. Prompt cũ được ghi rõ là lịch sử.
- Review lịch sử/evidence cũ không bị đổi thành kết quả nghiệm thu hiện tại. Rà từ khóa vẫn có “duyệt” trong ghi chú ngừng áp dụng, quyền share không cần duyệt hoặc review UI; không phải luồng host xét DISCUSSION đang hoạt động.

## Kiểm tra thực chạy

- `pnpm check:harness`: PASS, 55 tests; kiểm 90 nguồn/liên kết và runtime pins. Đã thêm recording.md vào nguồn bắt buộc và ca link hỏng, không giảm guard.
- `pnpm exec eslint scripts/check-harness.mjs scripts/check-harness.test.mjs`: PASS.
- `pnpm format:check`: PASS.
- `git diff --check`: PASS.

Dùng runtime pin qua PATH local (Node 26.12.1/pnpm 11.5.2). Không chạy lại full build/app tests/media smoke vì lượt này chỉ đổi tài liệu và danh mục nguồn của checker; chưa có thay đổi code nghiệp vụ/media. Các kiểm tra trên không chứng minh ngữ nghĩa đầy đủ, ACL hoặc video/media chạy thật.
