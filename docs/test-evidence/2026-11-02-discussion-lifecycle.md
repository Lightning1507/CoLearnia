# Đồng bộ hỗ trợ và vòng đời DISCUSSION — 02/11/2026

## Phạm vi

Theo xác nhận người dùng: host chỉ vào hỗ trợ ACTIVITY; DISCUSSION hỏi/trả lời qua chat riêng khi host ở MAIN. DISCUSSION được duyệt chưa ai vào vẫn chờ; còn người thì roster hợp lệ được chủ động vào lại; người cuối cùng chủ động rời nhóm đã có người làm nhóm tự đóng, thu private scope và không mở lại bằng roster cũ. Mất mạng không coi ngay là chủ động rời. ACTIVITY vẫn theo deadline.

Đã đối chiếu [group modes](../product/group-modes.md), [policy](../product/groups-media-policy.md), [FR/AC](../product/functional-requirements.md), [HS-02](../product/use-cases/02-discussion.md), [HS-06](../product/use-cases/06-private-help.md) và các bên dùng trong plan/architecture/contracts, DB runtime lifecycle, onboarding, brief UI và harness. Giữ mã UC/FR/feature và số collection; không sửa schema hoặc chạy migration.

## Kiểm tra thực chạy

- Working tree trên nhánh `feature/discussion-lifecycle-docs`, dựa trên `be6ee431735ccc87eb5ab42b2f7d66685aba5ff7`; chưa commit trong lượt này.
- Node 26.12.1, pnpm 11.5.2.
- `pnpm check`: lần đầu harness/format/lint/typecheck đạt, HTTP tests bị sandbox chặn `listen EPERM 127.0.0.1`; chưa chạy build ở lần đó.
- Chạy lại `pnpm check` với quyền mở loopback: đạt 54 guard tests, 89 required sources/links/runtime pins, format, lint, typecheck, 7 unit tests và build. Vite vẫn cảnh báo chunk 599.49 kB, không sửa cấu hình để bỏ cảnh báo.
- Rà ngữ nghĩa: phân biệt roster với membership; nhóm chưa ai vào với nhóm đã có người; tự rời với mất mạng; DISCUSSION với ACTIVITY. Bổ sung ca nghiệm thu vào HS-02/06, chưa coi là ca runtime đã đạt.

## Giới hạn

Không sửa app hoặc contract executable; chưa kiểm media/TURN, DB, UI Figma hoặc cập nhật Astah/PNG. Trạng thái bản vẽ đã ghi tại [mục lục sơ đồ](../product/diagrams/README.md); brief Figma là yêu cầu chỉnh, chưa là bằng chứng đã áp dụng. Cách xử lý nhóm rỗng do sự cố sau grace không được quyết định mới này chốt, không tự thêm timeout.
