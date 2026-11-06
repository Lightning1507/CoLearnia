# Chuyển code Figma vào frontend từng phần

**Đề xuất lộ trình · 07/11/2026.** Export ở [figma-ui](../../figma-ui/) do người phụ trách tải từ Figma. Lượt viết bộ chuẩn chỉ đọc cấu trúc/định nghĩa và các phần liên quan, chưa audit từng dòng hoặc chạy build export; không sửa code export/app.

## Hiện trạng quan sát từ source

- `src/App.tsx` khoảng 255 KB chứa primitive, chat, dialog quản trị, lobby, MeetingRoom, recording, auth và App state. `MeetingRoom` và App ôm nhiều lifecycle/handler.
- `src/index.css` khoảng 57 KB chứa Tailwind theme và CSS theo màn, nhiều HEX/spacing/font trực tiếp, có selector trùng; body min-width 1120 px và overflow hidden. Có metadata/label 9–10 px cần review khả năng đọc.
- Đã có `Button`, `IconButton`, `Avatar`, `Dialog`, `Composer`, `MessageRow`; cần đánh giá hành vi/accessibility trước đưa lên shared, không mặc định primitive hiện có đã đạt chuẩn.
- Dữ liệu mẫu ở `mockData.ts`, role/host/connection/scenario là state demo. Package export là app độc lập và Vite config có công cụ Figma; manifest dùng khoảng version khác app chính.
- App chính hiện có shell trong `apps/web/src/app/App.tsx`, `styles/global.css`, HTTP system adapter và dependencies theo workspace. Source prototype không chứng minh auth/media/storage sản phẩm đã triển khai.

## Mapping trách nhiệm

| Trong export                                   | Đích đề xuất                          | Cần làm trước tích hợp                                           |
| ---------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Icon, Button, IconButton, Avatar, Dialog       | `components/ui`                       | API/variants/focus/label/semantic token; kiểm consumer           |
| SidebarSection/SidebarItem                     | `features/workspaces` hoặc `channels` | Tách navigation khỏi role demo, ghép shell M1                    |
| Composer/MessageRow/EmptyConversation          | `features/chat`                       | Tách view và send/history hook; TEXT/DM/thread khác meeting      |
| AttachmentView                                 | `features/files`                      | URL/file lifecycle, hủy khi revoke, lỗi byte thật                |
| LiveRoom/DeviceCheck                           | `features/live`                       | Route/lobby riêng preview resource, không takeover ngầm          |
| MeetingRoom                                    | RoomShell M3 + panel miền             | Tách controller trước, state projection theo M4                  |
| Group/host/help/announcement controls          | `features/groups`, audio M3           | Không sao chép policy authority client                           |
| DrawingStroke/GroupBoard/capture               | `features/board`                      | Runtime renderer, nguồn M3/context M4/file M2                    |
| RecordingLibrary/player                        | `features/recordings`                 | DTO READY/API M2, player thật và revoke                          |
| Profile/Password/Auth/Invite/Workspace dialogs | Feature M1 tương ứng                  | Auth/API/CSRF, return flow, lỗi và access hiện hành              |
| DemoTools/AccessDemoBar/mockData               | Fixture/demo cô lập                   | Không nối vào quyền sản phẩm hoặc bundle production ngoài ý định |

Đây là mapping đích, không chỉ dẫn di chuyển máy móc mọi function. Shared primitive không import mockData/getMember, không giữ user/role. Domain DTO/types lấy từ contracts của task thay type mẫu khi tích hợp.

## Các bước chuyển có thể review riêng

1. **Thống nhất nền:** chọn palette/scale sau visual review, primitive API và hành vi Dialog; xác định phần cần sửa accessibility. Chỉ thêm token/primitive đang được lát cắt dùng.
2. **Một lát cắt TEXT:** shell M1 + timeline/composer M2, loading/rỗng/lỗi/retry với fixture đúng contract rồi provider thật. Giữ thread và DM là các context riêng; không đưa toàn bộ App mock vào store.
3. **Call foundation:** M3 đặt CallController độc lập route/panel và RoomShell slot; M4 cung cấp projection/takeover/end confirmation. Kiểm điều hướng giữ call và cleanup generation trước mở thêm panel.
4. **Ghép theo miền:** chat họp M2, nhóm/host M4, board M5, player M2. Consumer review port; dùng mock có nhãn khi provider thiếu, chưa nghiệm thu tích hợp.
5. **Khép trạng thái và hồi quy:** stale response/reconnect/revoke, history, tệp, recording; kiểm các màn/consumer dùng chung và bàn giao phần chưa đạt.

Các bước là thứ tự đề xuất, không task đã giao hoặc estimate mới. Đối chiếu [Sprint 1](../../planning/sprint-1.md) và WBS để không cộng lại công FE/nền UI đã có. Không mở dự án design system riêng chặn cả team trước khi có lát cắt.

### Tách App.tsx theo trách nhiệm, không chỉ đổi chỗ file

Ví dụ `Composer` trong export: trước hết tách phần nhập/render thành MessageComposer với props có kiểu. State nháp của đúng conversation nằm ở entry/hook chat; send/retry/bind không đi theo primitive lên `components/ui`. Tách MessageRow và CSS liên quan, sau đó thay từng consumer TEXT/DM/thread/meeting và kiểm khác biệt quyền/nội dung. Chi tiết cây feature và luồng gọi ở [Code Architecture](code-architecture.md).

Với `MeetingRoom`, tạo RoomShell nhận slot để tách layout; tách group/host controls M4, chat M2 và board M5 khỏi hàm render lớn. Resource thật trong app chính thuộc CallController M3; không chuyển toàn bộ useState/timer demo vào một `useMeetingRoom` rồi coi là đã tách kiến trúc. Hook hàng nghìn dòng vẫn giữ nguyên vấn đề ownership.

Không có một PR chuyển cả prototype thành production. Phân biệt hai đầu ra: **tách view nhưng vẫn mock có nhãn** và **tích hợp provider thật cùng contract/ACL/cleanup**. Đầu ra thứ nhất giúp review UI độc lập, chưa hoàn thành đầu ra thứ hai. Mỗi lát cắt chỉ thay consumer đã kiểm, giữ phần còn lại nguyên trạng để có đường so sánh.

Sau mỗi phần chuyển, người nhận phải tìm được: entry component, hook/use case, adapter/API, nguồn state và cleanup. Nếu vẫn phải đọc toàn App.tsx để hiểu gửi một tin hoặc đóng một panel thì ranh giới chưa đạt mục đích.

## Điều giữ khi chuyển

Giữ code sau v14; không restore bản lịch sử hoặc thay app chính bằng export. Không copy package.json/lockfile/Vite Figma scripts sang workspace. Giữ runtime/dependency pin của repo, chỉ đề xuất package mới khi có nhu cầu và review.

Theo [current-state mục 23](../../ui/figma-current-state.md#23-review-r22--activity-start-lỗi-một-phần--06112026), R2.2 còn banner lỗi cũ sau retry thành công; R2.3 trở đi chưa khép. Đó là hiện trạng tài liệu đã ghi, không phải kết quả test mới của lượt này. Chuyển code không được nâng mọi flow thành đạt hoặc kéo lỗi này vào chuẩn hành vi.

Review độc lập primitive/accessibility và mock lifecycle trước dùng thật. Không coi screen recorder/player giả, avatar blob hoặc role switch là backend đã có. Mọi sửa nghiệp vụ chưa rõ phải hỏi người phụ trách; không tự chốt fade nét, quota, quyền xóa video hoặc cảnh báo recording.

## Điều kiện bàn giao một phần đã chuyển

PR chỉ rõ phần UI được chuyển, nguồn Figma/flow tham chiếu, public API, state owner, mock còn lại và consumer bị ảnh hưởng. Có bước thử thành công/Hủy/lỗi/thu quyền phù hợp, keyboard/layout và cleanup. Chỉ xóa phần cũ của consumer khi phần mới đã thay thế được và trong phạm vi được giao; không dọn export gốc hoặc dữ liệu người dùng từ task này.
