# Hình cho onboarding CoLearnia

Dùng trong [hướng dẫn nhập môn](../../team-onboarding.md). Các hình là công cụ giải thích, không thay nguồn nghiệp vụ/UML, không là bằng chứng tính năng đã triển khai.

## Sơ đồ giải thích

Bốn SVG là nguồn chỉnh sửa trực tiếp: có text tiếng Việt, nền trắng cố định, tiêu đề/mô tả truy cập (`title`, `desc`), không phụ thuộc Mermaid renderer và không dùng script hoặc tài nguyên ngoài.

| File                                                 | Ý chính                                  | Nguồn đối chiếu                                                                             |
| ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| [product-map.svg](product-map.svg)                   | Workspace → TEXT/DM/LIVE → phiên và nhóm | [Scope](../../product/scope.md), [messaging](../../product/messaging.md)                    |
| [learning-flow.svg](learning-flow.svg)               | Hai nhánh học nhóm và trở về MAIN        | [Group modes](../../product/group-modes.md), [policy](../../product/groups-media-policy.md) |
| [freeze-example.svg](freeze-example.svg)             | Nhóm giữ ảnh, bài giảng vẫn tiếp tục     | [Board](../../product/board-collaboration.md)                                               |
| [requirements-to-work.svg](requirements-to-work.svg) | UC → FR/AC → miền → proposal/task        | [FR](../../product/functional-requirements.md), [miền](../../product/delivery-domains.md)   |

Khi đổi nghiệp vụ, sửa nguồn chính rồi sửa hình/chú thích liên quan. Giữ tên file để không hỏng link. Giữ flow ngắn, chữ đủ đọc ở chiều rộng khoảng 1000 px; không bổ sung các nhánh lỗi chi tiết vào hình nhập môn. Dùng file Astah hiện hành cho UML, không tạo mô hình UML thứ hai từ các hình này.

## Giao diện Figma

Onboarding chỉ dẫn tới Figma đang phát triển, không nhúng screenshot giao diện chưa được chốt. Hai bản sao ảnh prototype cũ (`figma-workspace.png`, `figma-live.png`) đã được bỏ khỏi bộ hình onboarding; ảnh gốc người dùng cung cấp không bị thay đổi.

Khi có luồng UI đã được team review, chỉ bổ sung screenshot nếu nó giúp giải thích một thao tác hoặc cấu trúc khó hiểu. Ghi rõ mục đích, chú thích và trạng thái của ảnh; tránh chụp cả cửa sổ trình duyệt hoặc giữ ảnh có hành vi trái nghiệp vụ hiện hành. Nguồn yêu cầu UI: [brief](../../ui/figma-make-brief.md).

Markdown là nguồn onboarding; nếu cần PDF để trình bày, xuất từ cùng nội dung và kiểm ảnh/font/ngắt trang, không duy trì một bản nghiệp vụ riêng trong PDF.
