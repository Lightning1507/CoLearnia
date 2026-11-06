# 4. UI Components

**API và catalog đề xuất · 07/11/2026.** Đây là hợp đồng thiết kế, chưa là danh sách component đã triển khai. Theo [architecture](code-architecture.md) và [quy ước điểm giao M1–M5](../../proposals/README.md).

## Phân tầng và ownership

| Tầng                                     | Ví dụ                                                             | Trách nhiệm                                                           |
| ---------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Primitive `components/ui`                | Button, IconButton, Field, Dialog, Menu, Badge, Avatar, Tooltip   | Render/interaction/accessibility; không gọi API nghiệp vụ             |
| Pattern dùng chung `components/patterns` | AsyncState, ConfirmDialog, PaginationStatus                       | Ghép primitive; nhận dữ liệu/action qua props                         |
| Feature                                  | MessageComposer, MeetingChatPanel, ActivityDraft, RecordingPlayer | Hành vi/ngữ nghĩa của miền, dùng contract và hook của feature         |
| Shell                                    | WorkspaceLayout, RoomShell                                        | Bố cục và slot; composition ở app, không nhận lại mọi state nghiệp vụ |

M1 chủ trì nền UI/Workspace với M3 review điểm ghép; M3 sở hữu call shell/controller, M2 chat/file/player, M4 nhóm/host và takeover/end confirmation, M5 board. Đây là ownership miền từ nguồn, chưa gán người. Task hỗ trợ giữ owner miền review API; không chia mỗi người một bộ Button.

## Khi tạo component

Đặt component riêng trong feature trước. Đưa lên shared khi có ít nhất hai cách dùng thực tế có cùng hành vi và đã review với consumer; đây là nguyên tắc đề xuất, không ép tạo abstraction cho hai đoạn markup ngắn. Shared không import feature. Nếu hai consumer cần hành vi khác nhau, tách wrapper nghiệp vụ thay vì thêm cờ role/scope vào primitive.

Một component có một owner theo thư mục và public API nhỏ. Không deep import file nội bộ feature khác. `index.ts` chỉ export API được dùng; không `export *` toàn thư mục hoặc tạo barrel làm import vòng.

## Catalog tối thiểu

| Component                   | Variants/states                                         | Hành vi cần có                                                                   |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Button                      | primary/secondary/ghost/danger; sm/md; disabled/loading | Native button, `type` rõ, không gửi form ngoài ý định; loading giữ nhãn/vùng bấm |
| IconButton                  | quiet/active/danger; pressed/disabled                   | Accessible name bắt buộc, tooltip không thay name                                |
| Field/Input/Textarea/Select | idle/focus/invalid/disabled/read-only                   | Label, hint/error liên kết bằng ID; read-only khác disabled                      |
| Dialog/ConfirmDialog        | form/confirmation; pending/error                        | Focus vào/ra, tab containment, close/Hủy rõ, body cuộn                           |
| Menu                        | closed/open/item-disabled                               | Keyboard và focus; action có hậu quả mở confirmation riêng                       |
| Badge/Status                | neutral/info/success/warning/error                      | Chữ mô tả, không chỉ chấm màu; không tự quyết định quyền                         |
| Avatar                      | image/initials/fallback                                 | Kích thước ổn định; lỗi ảnh không đổi layout; alt theo ngữ cảnh                  |
| Tabs/SidePanel              | selected/unselected/loading                             | Pattern keyboard đúng loại; đóng panel trả focus, không đóng call                |
| AsyncState                  | loading/empty/error/ready                               | Giữ nội dung có quyền khi refresh; empty khác lỗi                                |
| MemberList/Table            | empty/loading/rows/error                                | Table chỉ cho dữ liệu dạng bảng; roster thường dùng list                         |
| AttachmentCard              | uploading/staged/sending/failed/ready                   | Domain M2 quyết định đích/quyền; chỉ hiển thị tải thật khi có byte               |

Card phục vụ Workspace hoặc bản ghi có cấu trúc, không là wrapper mặc định cho mọi khu vực. Không tạo DataGrid nâng cao cho danh sách nhỏ khi chưa có nhu cầu.

## Mẫu API cần review

```ts
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
};

type IconButtonProps = Omit<ButtonProps, 'children' | 'aria-label'> & {
  icon: React.ReactNode;
  'aria-label': string;
};
```

Mẫu chỉ diễn tả shape, không tự thêm file/types runtime. Component phải chuyển tiếp thuộc tính native/ref khi consumer cần; không nhận `role: HOST` hoặc `workspaceId` trong Button. Toggle dùng `aria-pressed`/label theo nghĩa; loading có `aria-busy`, ngăn submit lặp theo operation, không giả thành công.

Dialog primitive không gọi `session.end`. M4 wrapper quyết định hậu quả, payload và lúc đóng; nếu quyền bị thu trong khi mở, wrapper hủy pending hợp lệ/đóng dialog, đưa focus tới nơi còn tồn tại và giải thích thay đổi. Pending không hủy được phải báo thật, không gán click Đóng thành rollback server.

## Contract ghép shell

RoomShell nhận stage, toolbar, active side panel và status region qua slot. App ghép M2/M4/M5; không để RoomShell import từng implementation panel. Controller nằm ngoài subtree panel/route. Chat TEXT và chat họp chia sẻ phần soạn/render khi phù hợp, nhưng wrapper giới hạn attachments/thread/đích theo miền, không dùng một cờ `isMeeting` làm thay mọi policy.

RecordingPlayer do M2 sở hữu và M3 nhúng. Takeover/end confirmation do M4 sở hữu và M3 thực thi cleanup media. M5 nhận source/readiness qua API M3 đã review, không truy cập DOM video bằng selector toàn cục.

## Hồ sơ component và thay đổi

Khi triển khai mỗi component ghi: mục đích, owner/consumer, props/events, states, keyboard/focus, surface hỗ trợ, ví dụ và ca chưa hỗ trợ. Catalog có các biến thể trên cùng một trang để phát hiện lệch; Storybook là lựa chọn cần task/dependency review, chưa bắt buộc cài.

Thay shared component phải kiểm các consumer liên quan, ít nhất form, chat/thread và call nếu dùng tại đó. Breaking change ghi API cũ/mới và cách chuyển; không giữ hai bản button tạm vô thời hạn. Không tuyên bố component đạt accessibility chỉ vì có `aria-*`.
