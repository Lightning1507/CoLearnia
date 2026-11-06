# 9. Coding Conventions

**Quy ước chi tiết đề xuất · 07/11/2026.** Format/check đang có theo [CONTRIBUTING](../../../CONTRIBUTING.md), [code quality](../../code-quality.md), cấu hình repo. Không tạo cấu hình cạnh tranh với chúng.

## Tên và public API

| Đối tượng                | Quy tắc đề xuất                                   | Ví dụ                                |
| ------------------------ | ------------------------------------------------- | ------------------------------------ |
| Feature/folder           | Tên nghiệp vụ chữ thường, kebab-case khi nhiều từ | `workspaces`, `message-history`      |
| React component/file     | PascalCase                                        | `MessageComposer.tsx`                |
| Hook/file                | camelCase, bắt đầu `use`                          | `useMessageHistory.ts`               |
| Hàm/biến/module tiện ích | camelCase                                         | `formatRecordingDuration.ts`         |
| Type/interface           | PascalCase, không tiền tố I                       | `MeetingChatTarget`                  |
| Boolean                  | Có nghĩa predicate                                | `canSend`, `isSubmitting`, `hasMore` |
| Event prop               | `on` + hành vi                                    | `onConfirm`, `onRecipientChange`     |
| Enum/ID giao tiếp        | Giữ đúng contract                                 | `MAIN`, `ACTIVITY`, `participantId`  |

Tên product code bằng tiếng Anh; UI bằng tiếng Việt. Không dùng `data1`, `temp`, `handleAll`, `CommonComponent` cho state quan trọng. Mã feature/UC/FR trong task, không thay tên domain model.

Ưu tiên named export cho API dùng chung; route entry theo pattern router hiện hành. `index.ts` export tường minh. Import type riêng; không import file nội bộ server hoặc sửa contract bằng cast. Chưa dùng alias của export nếu app chính chưa cấu hình.

## TypeScript và dữ liệu

Strict theo tsconfig package. Không dùng `any`, non-null assertion hoặc `as` để né dữ liệu có thể thiếu/quyền thay đổi. Giá trị bên ngoài vào `unknown` rồi parse/thu hẹp; schema FE–BE từ contracts. Type DTO khác view model khi cần formatting, nhưng không sao chép toàn bộ schema trong web.

Dùng discriminated union cho operation, đích chat và connection thay tập boolean mâu thuẫn. Ví dụ idle/pending/failed/succeeded mang operation identity tương ứng; tránh đồng thời `isStarting && isCompleted`. Không dùng string rỗng làm mọi null/not-found/forbidden.

ID ổn định cho React key; không index array của message/participant. Derived state tính từ source owner, không đồng bộ bản sao bằng nhiều effect. Không tự tăng role, roster hoặc deadline trong component để khớp demo.

## React và side effect

Render thuần, action qua callback/hook use case. Effect chỉ đồng bộ external system và trả cleanup đúng listener/handle; không fetch mutation hoặc khởi tạo call từ render. Dependency đúng; không thêm eslint-disable để bỏ cảnh báo hooks.

Mỗi async operation có context/cancellation và kiểm lại trước commit. Unmount panel chỉ dispose phần panel, không đóng controller cuộc gọi. Tránh một effect phụ thuộc toàn object khiến reconnect/subscribe lại mỗi render; tách input ổn định theo nhu cầu thật, không memo mọi thứ máy móc.

Tách file khi có trách nhiệm/lifecycle độc lập hoặc khó review, không theo mốc dòng cứng. Component gọi hook cho hành vi, renderer nhận props; không đưa mọi handler của App xuống bằng một props object khổng lồ.

## Styling

Tailwind và CSS theo nền hiện có, semantic token cho giá trị dùng chung. CSS feature dùng prefix rõ hoặc scope component; không selector global như `button { outline: none }` làm hỏng focus. Inline style chỉ cho dữ liệu động/hình học cần thiết, không rải palette/spacing.

Không duy trì hai stylesheet cho cùng primitive hoặc dùng `!important` để thắng CSS export chồng nhau. Khi chuyển một component, chuyển và kiểm stylesheet của nó cùng PR. State class/data attribute có nghĩa như `data-state="pending"`; quyền vẫn lấy từ projection.

## Nội dung, thời gian và quốc tế hóa

UI dùng “Phòng chung”, “Nhóm trao đổi”, “Nhóm hoạt động”; enum kỹ thuật giữ trong model. Thông báo có kết quả và bước tiếp theo, không hiển thị raw DB/process error hoặc mã provider. Chi tiết kỹ thuật hỗ trợ đặt ở log có requestId đã lọc, không trong luồng học.

Đề xuất gom message/label lặp trong feature, dùng `Intl` với locale `vi-VN` khi định dạng số/ngày. Chưa cài framework đa ngôn ngữ hoặc thêm lựa chọn ngôn ngữ ngoài scope. Timestamp API theo contract, chuyển timezone ở lớp hiển thị; thời lượng recording/countdown là duration, không format như ngày giờ. Không cắt ký tự tiếng Việt/emoji bằng giả định một ký tự luôn bằng một code unit.

## Lỗi, tài nguyên và kiểm gần thay đổi

Phân nhánh theo error code, không so message text. Không catch rỗng hoặc đổi lỗi thành empty/success. Object URL, event listener, timer, subscription và stream phải có owner/dispose; không giữ file/blob private sau context bị thu. Không log nháp, password hoặc credentials.

Test kiểm hành vi có rủi ro: retry cùng tin, stale completion, revoke/focus, cleanup StrictMode. Không snapshot hàng nghìn dòng JSX hoặc test sao chép implementation. Trình tự kiểm theo [workflow](development-workflow.md), không truyền một file TS riêng cho tsc.

Fixture auth/token phải rõ là giả; ID chỉ kiểm định dạng dùng giá trị đơn giản theo [code quality](../../code-quality.md#dependency-và-secrets). Khi thêm fixture auth/token, chạy Gitleaks cùng phiên bản CI trước push theo nguồn đó; `pnpm check` không gồm secret scan. Không bỏ qua toàn file hoặc tắt rule để xử lý cảnh báo.
