# 8. Code Architecture

**Tổ chức frontend đề xuất · 07/11/2026.** Kế thừa [kiến trúc baseline](../../architecture.md), [web AGENTS](../../../apps/web/AGENTS.md) và [contracts](../../contracts/README.md). Cây dưới là đích để triển khai dần, chưa mô tả thư mục đều đã tồn tại.

## Một app, chia theo nghiệp vụ

```text
apps/web/src/
  app/
    App.tsx
    providers/           # Khởi tạo Query/router và dependency chung
    layouts/             # Composition Workspace/room bằng public API
    routes/              # Route và lazy entry; không sở hữu media
  components/
    ui/                  # Primitive không biết nghiệp vụ
    patterns/            # AsyncState, ConfirmDialog dùng chung
  features/
    auth/                # M1
    profile/             # M1, upload port M2
    workspaces/          # M1
    channels/            # M1
    chat/                # M2: TEXT, DM, thread, meeting chat
    files/               # M2: upload/download/preview
    recordings/          # M2: list/player; recorder runtime M3
    live/                # M3: lobby, RoomShell, CallController
    groups/              # M4: session projection/host/nhóm/takeover
    board/               # M5
    audio/               # M3, vòng đời gắn CallController
  lib/
    api/                 # HTTP/envelope/CSRF/cancellation chung
    socket/              # Kết nối đã xác thực và adapter chung
    media/               # Adapter thư viện media, không giữ policy thứ hai
  styles/                # Global tối thiểu và tokens
  test/                  # Fixture/helpers dùng chung khi có nhu cầu
packages/contracts/      # Schema/type FE–BE dùng chung
```

Trong feature có thể có `components`, `pages`, `api`, `model`, `hooks`, `runtime`, `index.ts`; chỉ tạo thư mục có code thực. Không sinh boilerplate rỗng cho mọi feature. Không dùng M1/M2 làm tên module code; mã miền giữ trong ownership/task.

## Cách tổ chức này giúp scale ở đâu?

Mục tiêu trước mắt là nhiều người phát triển trên cùng app mà ít đụng file, thay đổi một luồng không kéo theo sửa mọi màn, và tìm được owner khi có lỗi. Cây thư mục chỉ hỗ trợ mục tiêu đó; việc quyết định **ai giữ dữ liệu, ai gọi ai và ai dọn tài nguyên** mới tạo ra ranh giới thật.

Ví dụ thêm phân trang DM: phần gọi API/cache nằm trong chat, danh sách DM dùng hook của chat, giao diện dùng MessageList chung trong chat. Không cần sửa RoomShell hoặc BoardRenderer. Ngược lại, thay Button phải kiểm các feature đang dùng nó vì đây là thay đổi shared. Không thể loại mọi ảnh hưởng chéo, nhưng cần biết rõ consumer nào bị ảnh hưởng.

Scale tải server vẫn theo [capacity](../../capacity.md); chia thêm folder không chứng minh phục vụ được 25/50 người. Bộ này tập trung scale code và phối hợp team, giữ nguyên topology sản phẩm.

## Trách nhiệm từng lớp: đặt code ở đâu?

| Nơi đặt                 | Nhận trách nhiệm                                               | Không đặt tại đây                               | Ví dụ                                                       |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `app/providers`         | Khởi tạo dependency theo auth/app lifetime                     | Logic gửi tin hoặc phân nhóm                    | QueryClient, socket lifecycle provider, controller provider |
| `app/routes`            | Chọn page, route params, lazy entry                            | Sở hữu stream/transport hoặc state của mọi page | Route Workspace và cuộc gọi                                 |
| `app/layouts`           | Ghép public component/hook của nhiều feature                   | Sao chép nghiệp vụ của feature                  | WorkspaceLayout ghép sidebar, chat và ActiveCallStrip       |
| `components/ui`         | Visual primitive và interaction chung                          | HTTP/socket, role host, Workspace ID            | Button, Field, Dialog                                       |
| `components/patterns`   | Mẫu trình bày lặp giữa nhiều feature                           | Quyết định ai được xóa/kết thúc                 | ConfirmDialog nhận text và callback                         |
| `features/*/components` | View của nghiệp vụ                                             | Fetch rải trong từng row, tự dựng socket        | MessageRow, ActivityDraftForm                               |
| `features/*/hooks`      | Kết nối view với use case/cache/projection                     | Native object bị serialize vào state            | useMessageHistory, useActivityDraft                         |
| `features/*/model`      | State render, selector, query key, view model hoặc logic thuần | Network I/O và DOM                              | selectCanOrganizeActivity, messageKeys                      |
| `features/*/api`        | Endpoint/command, parse DTO, subscription adapter của miền     | Toast/dialog và điều hướng trang                | messagesApi, meetingChatSubscription                        |
| `features/*/runtime`    | Resource có identity, lifetime và dispose                      | State chỉ để mở menu                            | CallController, BoardRenderer                               |
| `lib`                   | Hạ tầng không biết nghiệp vụ cụ thể                            | getMessages, host transfer, group roster        | HTTP client, socket connection, adapter thư viện media      |
| `packages/contracts`    | Schema/type giao tiếp FE–BE                                    | React props, QueryClient, UI state              | Message DTO/schema của task                                 |

Không cần tạo cả hook → service → repository → gateway cho một GET đơn giản. Chỉ thêm lớp khi nó có trách nhiệm riêng: tái sử dụng use case, kiểm logic phức tạp, tách resource lifecycle hoặc thay provider thật/mock. Hàm chuyển đổi thuần có thể nằm ngay cạnh consumer trước khi có nhu cầu dùng chung.

`lib/media` chỉ bọc API thư viện và kiểu kỹ thuật có thể dùng chung; `features/live/runtime` quản lý cuộc gọi, ownership generation và resource registry. `lib/socket` sở hữu kết nối; feature `api` sở hữu tên command và subscription nghiệp vụ. Hai cặp này không có cùng trách nhiệm.

## Một feature trông cụ thể như thế nào?

Với chat, chia nhỏ theo các context đã có, vẫn giữ chung miền M2:

```text
features/chat/
  index.ts                       # Chỉ public API mà app/consumer cần
  components/
    MessageList.tsx              # Render danh sách, không tự fetch
    MessageRow.tsx
    MessageComposer.tsx          # Input/attachment slots, callback có kiểu
  channel/
    ChannelChat.tsx              # Entry cho TEXT
    useChannelMessages.ts
  direct/
    DirectChat.tsx               # Entry cho DM
    DirectConversationList.tsx
    useDirectMessages.ts
  thread/
    ThreadPanel.tsx              # Root/replies, cursor riêng
    useThreadReplies.ts
  meeting/
    MeetingChatPanel.tsx         # Everyone/Host; khác persistent chat
    useMeetingChat.ts
  api/
    messagesApi.ts               # HTTP chung cho đường đã có contract
    chatSubscriptions.ts         # Subscription/dedupe theo context
  model/
    messageKeys.ts
    messageViewModel.ts
    mergeMessages.ts             # Logic thuần nếu thực sự cần chia sẻ
  testing/
    messageFixtures.ts           # Fixture của chat, không export qua index
```

Đây là cấu trúc minh họa khi feature đã đủ lớn. Lát cắt đầu chỉ cần các file nó sử dụng; không tạo sẵn cả cây. Test đặt cạnh file cần kiểm, chẳng hạn `mergeMessages.test.ts`; helper chỉ dùng chat ở `chat/testing`, helper xuyên feature mới vào `src/test`.

MessageList/MessageRow không cần biết tab đó là DM hay TEXT. Entry của mỗi context quyết định dữ liệu, khả năng reply/attachment và action theo contract. Thread không xuất hiện trong DM; meeting không nhận file bất kỳ. Nếu props của composer khác biệt quá nhiều, tách wrapper hoặc component theo context, không cố ép một API chung với hàng chục boolean.

Không tạo thêm `components/chat` ở root hoặc `services/messages` cạnh feature; người sửa chat cần tìm được code liên quan trong một miền. `types.ts` toàn app không trở thành nơi gom mọi DTO; contract ở package chung, kiểu trình bày ở feature sở hữu nó.

## Public API không chỉ là một file index

Public API trả lời ba điều: consumer được dùng gì, input/output là gì, phần nào vẫn do feature tự quản. Đề xuất API nhỏ cho chat:

```ts
// features/chat/index.ts — minh họa, chưa là API đã triển khai
export { ChannelChat } from './channel/ChannelChat';
export { DirectChat } from './direct/DirectChat';
export { ThreadPanel } from './thread/ThreadPanel';
export { MeetingChatPanel } from './meeting/MeetingChatPanel';
```

Không export `setMessages`, QueryClient nội bộ, mockData hoặc hàm tự cấp quyền để feature khác sửa state chat. Component entry nhận ID/context/callback cần thiết theo contract; không nhận toàn bộ App state. File bên trong chat import trực tiếp file cùng feature, không import vòng qua chính `chat/index.ts`.

### Ma trận import để review

| Từ                    | Được phụ thuộc                                     | Cần từ chối hoặc thiết kế lại                       |
| --------------------- | -------------------------------------------------- | --------------------------------------------------- |
| `app`                 | Public API các feature, shared UI/lib/contracts    | Deep import store/runtime registry để sửa trực tiếp |
| `components/ui`       | Token, UI helper nhỏ                               | Feature, API nghiệp vụ, socket                      |
| `components/patterns` | Primitive và helper chung                          | Role/permission store hoặc endpoint riêng           |
| Feature               | Nội bộ feature, shared UI/lib/contracts            | Server internals, nội bộ feature khác               |
| Feature → feature     | Public API một chiều được review và không tạo vòng | Import hai chiều, lấy setter để đồng bộ authority   |
| `lib`                 | Library hạ tầng, contract dùng chung phù hợp       | UI, router, feature model                           |
| `contracts`           | Schema/type thuần theo guard repo                  | React, app, database/media runtime                  |

Ví dụ files cung cấp AttachmentCard/UploadPort cho chat qua public API; files không import MessageComposer ngược lại. Nếu files cần biết kết quả gửi, bên gọi trả kết quả hoặc gọi port xác nhận theo contract; không để files tự tìm store chat. Khi hai feature cần phối hợp cả hai chiều, app tạo adapter/điều phối ở điểm ghép.

Không cấm mọi import giữa feature rồi buộc app trở thành nơi chứa toàn bộ nghiệp vụ. Chỉ đưa **việc ghép dependency** lên app; xử lý gửi/thu file vẫn ở M2, xử lý media vẫn ở M3, quyền/vòng đời phiên vẫn ở M4/server.

## Hướng dependency

`app → public API feature → shared UI/lib/contracts`. Shared UI không import feature, web không import server internals. Feature không deep import feature khác; điểm giao qua public API/port có owner và consumer review. Khi có hai chiều phụ thuộc, đưa composition lên app hoặc rút interface chung nhỏ, không giải bằng barrel vòng.

Ví dụ app truyền ChatPanel M2, GroupPanel M4, BoardOverlay M5 vào RoomShell M3. M5 nhận source handle/readiness/context qua port M3/M4; M2 nhận live context để chat, không tự giữ bản group membership riêng. Public API là boundary, không là lý do export store và mọi setter cho miền khác sửa.

`@colearnia/contracts` là package import có sẵn. Alias `@/` của export chưa tồn tại trong tsconfig web chính; chưa yêu cầu consumer dùng alias đó. Dùng relative import hiện hành; thêm alias chỉ trong task cấu hình đồng bộ TypeScript/Vite/test/ESLint.

## Ghép Workspace và cuộc gọi mà không tạo App khổng lồ

```text
AppProviders
  Auth lifecycle / QueryClient / Socket connection
  CallControllerProvider                 # Một controller đang được quản lý
    AppRouter
      WorkspaceLayout                    # Có ActiveCallStrip khi đang gọi
        Sidebar + Channel/DirectChat
      CallPage                           # Đổi page không hủy controller
        RoomShell
          stage: MediaStage + BoardOverlay
          toolbar: MediaControls + SessionControls
          panel: MeetingChat / Participants / Groups
```

Cây này mô tả lifetime/composition, không bắt buộc một router implementation mới. `CallControllerProvider` tạo hoặc nhận instance theo cơ chế app đã review, expose API hạn chế và dispose khi auth/app lifetime kết thúc. Không `new CallController()` mỗi render hoặc để module singleton sống xuyên tài khoản mà không reset.

Đề xuất thêm file theo đúng trách nhiệm:

```text
app/layouts/CallPage.tsx                  # Ghép các public API, chọn panel
features/live/components/RoomShell.tsx   # Layout thuần qua slots
features/live/runtime/CallController.ts  # Native media lifecycle
features/live/hooks/useCallView.ts       # Projection cần render, không raw registry
features/groups/model/sessionStore.ts    # Projection M4 từ server
features/groups/components/SessionControls.tsx
features/groups/components/CallSwitchDialog.tsx
features/audio/runtime/AudioGraph.ts     # Controller M3 sở hữu/dispose
features/board/runtime/BoardRenderer.ts  # Mount theo stage/context, không sở hữu call
```

`groups` trong cây hiện tại bao gồm session/host projection của M4, không chỉ danh sách nhóm. Đặt model/control phiên trong vùng đó và ghi ownership rõ; nếu về sau tách `session` thành feature riêng thì chuyển cùng consumer trong một thay đổi có review, không giữ hai session store song song.

RoomShell không tự mở socket, query chat hoặc quyết định host. CallPage ghép component, không viết lại `startActivity`/`sendMessage`. App.tsx còn vai trò lắp provider/router; mở rộng feature không đồng nghĩa thêm handler vào App.tsx.

## State có owner

| Dữ liệu                                     | Nơi giữ                                  | Quy tắc                                                                        |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Form, panel mở, selection tạm               | Local state/hook của feature             | Không đưa toàn bộ vào global store                                             |
| REST list/detail/history                    | TanStack Query                           | Key theo auth/Workspace/đích; cancel/remove khi thu quyền                      |
| Session projection đã lọc                   | Zustand theo context M4                  | Không tự cấp role/grant hoặc làm server authority                              |
| Track/Device/transport/Consumer/audio nodes | CallController/runtime registry M3       | Ngoài lifecycle route/panel, không persist/serialize                           |
| Board renderer/pending stroke               | Runtime/hook M5                          | Theo board/context/source và audience, không phục hồi grants từ cache          |
| Countdown                                   | Giá trị dẫn xuất từ deadline/server time | Không tự điều phối end từ timer client                                         |
| Token/proof/secret                          | Cơ chế auth/HTTP đã review               | Cookie session HttpOnly; không lưu credential/private history vào localStorage |

Query cache không là quyền. Session end/đổi tài khoản khác đổi một panel; cleanup theo context. Các dấu epoch/callGeneration/audienceEpoch/sourceRevision/boardVersion có nghĩa riêng, không dùng một `version` thay hết.

### Một dữ liệu có một nguồn phía client

- REST history nằm trong Query cache; không copy toàn bộ sang Zustand rồi viết hai nơi mỗi event.
- Event/ack cập nhật cache qua adapter chat; reducer/merge của chat gộp theo ID. Projection phiên nằm ở store M4; UI không tự sửa host vì một dropdown đổi.
- Ô soạn giữ nháp local theo context hợp lệ; server message chưa có kết quả xác định vẫn giữ identity lần gửi để đối soát.
- Native track nằm trong controller; UI nhận trạng thái có thể render và handle được kiểm soát khi cần gắn video. Không render bằng cách serialize registry.

Ví dụ query key logic cần phân biệt auth identity, workspace, conversation và root khi có thread. Đây là yêu cầu cách ly cache, chưa là tuple chuẩn thay schema của task. Chat họp còn phải gắn session/epoch/generation/audience theo contract; không áp các dấu session cho DM độc lập cuộc gọi.

### Lifetime và nơi cleanup

| Đổi trạng thái         | Nơi chịu trách nhiệm                                          | Resource/state cần xử lý                                                          |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Đóng thread/panel      | Hook/component feature                                        | Listener/pending của view, focus; giữ call và cache còn quyền                     |
| Chọn conversation khác | Chat entry/hook                                               | Context nháp, request/subscription view cũ, cursor đúng đích                      |
| Đổi scope/audience     | Coordinator phía client nhận projection M4, adapter từng miền | Hủy pending/cache private cũ, reconcile chat/board/media theo quyền mới           |
| Rời/chuyển call        | Controller M3 theo ownership M4                               | Transport/track/audio/pending đúng generation; không đụng call mới từ callback cũ |
| Logout/đổi tài khoản   | Auth/app composition + feature cleanup API                    | Socket, controller, cache private và dữ liệu tài khoản cũ                         |

Server vẫn thực thi thu quyền độc lập browser. Client cleanup là trách nhiệm lifecycle/UI, không thay ACL/isolation. Không dùng unmount App toàn bộ làm cách duy nhất xử lý mọi thay đổi.

## Ví dụ đi hết một luồng: gửi tin TEXT

1. `ChannelChat` nhận channel/conversation hợp lệ, hook lấy history từ Query cache và subscription của đúng đích.
2. `MessageComposer` trả ý định text/attachment qua callback; không biết endpoint, socket hoặc role admin.
3. Hook/use case chat tạo clientMessageId cho ý định mới, thêm pending row và gọi adapter send dùng contract đã review. Upload/bind đi port M2 của đúng conversation.
4. Ack và realtime có thể tới khác thứ tự; adapter gộp vào cùng cache theo ID/clientMessageId. MessageList chỉ render trạng thái đó, không có mảng tin riêng để append thêm lần nữa.
5. Mất ack: đối soát/thử lại cùng ID theo contract; thay nội dung là ý định mới. Mất quyền: hủy đường đọc/gửi, dọn nội dung/cache scope bị thu; callback trễ kiểm context trước khi ghi.

Khi làm DM, tái sử dụng renderer và send behavior phù hợp, thay adapter/context ACL hai bên. Khi làm thread, root/cursor/cache riêng; không copy cả ChannelChat rồi chỉ đổi tiêu đề. Test quan trọng là retry không trùng, reply không lẫn dòng chính và response của kênh cũ không ghi vào kênh mới.

## Ví dụ phối hợp nhiều miền: vào ACTIVITY

1. M4 control phát ý định với context/revision hiện hành; server xác thực và điều phối. UI chuyển pending, không tự gán membership bằng roster draft.
2. Projection/transition từ M4 làm context cũ mất hiệu lực. Adapter M2/M3/M5 thu hoặc dọn phần thuộc miền mình theo contract; nguồn còn hợp lệ được giữ.
3. Sau scope mới được xác nhận, M3 controller reconcile media, M2 mở chat đúng audience, M5 mount/sync board đúng source/context. RoomShell render vị trí và action từ projection, không tạo call mới.
4. Deadline/partial failure đi cùng đường lifecycle; operation cũ không commit vào round mới. Kết quả cleanup/pending phải được phản ánh thật, không dùng đổi một `screen` để giả đã hoàn tất.

Điểm ghép chỉ truyền port/context và gọi cleanup/reconcile API đã thống nhất; không tạo một event bus broadcast dữ liệu private cho cả frontend rồi để từng panel tự lọc. Các tên API thực chốt trong task với consumer; ví dụ không tự thêm command/schema.

## API và realtime

HTTP adapter giải mã envelope/mã lỗi theo [API conventions](../../contracts/api-conventions.md); feature `api` ánh xạ DTO và operation. Component trình bày không tự fetch. Không tự viết schema endpoint chưa có rồi gọi đó là contract chung đã chốt; thêm schema cùng consumer trong task liên quan.

Một kết nối socket được quản lý theo auth lifecycle; các feature đăng ký listener/subscription qua adapter và dispose. Không tạo socket trong mỗi panel. Command session đi application service M4, media signaling M3, chat M2, board M5 theo contract; không mở REST mutation bản sao có policy khác.

Response/ack/event phải kiểm context trước ghi cache/store/gắn track, kể cả sau abort. Đổi audience thu subscription/pending/cache private cũ rồi lấy snapshot hiện hành. Event sequence riêng theo miền/người nhận; không suy gap từ policyRevision toàn phiên.

## Runtime, hiệu năng và bảo mật

CallController mount ở app lifetime phù hợp, trước các route/panel có thể đổi; join/leave thay phiên rõ ràng, StrictMode không nhân listener/audio. Cleanup đúng generation và idempotent; callback cũ tự đóng resource vừa tạo. Reconnect không tự mở lại mic/share/nhóm hoặc replay private packet.

Route nặng và board/player có thể lazy load theo phép đo, không remount controller. Pointer drawing dùng renderer/requestAnimationFrame, tránh setState React cho từng điểm. Camera ngoài viewport xử lý Consumer thật qua M3, audio vẫn theo policy; không cắt quyền/camera để đạt [capacity](../../capacity.md). Giới hạn queue/buffer/catch-up cần contract hữu hạn.

Private file/video qua API M2 có ACL/Range/revoke, không dùng URL avatar công khai cho mọi tệp. Frontend không chứa R2/Cloudinary server credential. Render nội dung chat dạng text an toàn; không dùng HTML người dùng để có rich text ngoài scope.

## Khi nào tách package

Giữ primitive trong app cho tới khi có nhiều consumer thật, API ổn định và owner rõ. Tách package cần chốt build, exports, styles, peer dependencies, compatibility và kiểm consumer. Không thêm microfrontend, nhiều app call hoặc global event bus để né dependency khó. Quy tắc import chi tiết ở bộ này là đề xuất review; guard hiện có chưa tự kiểm mọi dependency giữa feature web.

## Quyết định khi code lớn dần

| Dấu hiệu                                | Cách xử lý trước                                                   | Không làm máy móc                                      |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Một file ôm render, network và resource | Tách view/hook/adapter/runtime theo trách nhiệm                    | Chia theo mỗi 200 dòng hoặc đổi tên file thành service |
| Nhiều feature dùng cùng UI/hành vi      | Review API nhỏ, đưa phần chung lên shared                          | Đưa nguyên feature có role/API lên components          |
| Feature có nhiều context riêng          | Chia submodule trong feature như channel/direct/thread             | Tách package/ứng dụng ngay                             |
| Hai feature import nhau                 | Xác định chiều cung cấp, ghép adapter ở app hoặc rút interface nhỏ | Thêm barrel, global store hoặc event bus để giấu vòng  |
| Store có mọi field của app              | Tách theo owner/lifetime, bỏ state dẫn xuất/bản sao                | Mỗi component một global store                         |
| Chuyển màn làm mất call                 | Sửa lifetime controller/provider                                   | Giữ mọi page mount vĩnh viễn bằng display none         |
| Bundle/render chậm                      | Đo route/module/interaction, lazy hoặc tối ưu đúng chỗ             | Memo mọi component hoặc cắt camera/quyền               |

## Checklist trước khi thêm một phần mới

1. Nó thuộc nghiệp vụ nào, owner và consumer là ai?
2. Là view, use case, dữ liệu server, state render hay resource runtime? Đặt đúng lớp trong bảng trách nhiệm.
3. Consumer gọi public API nào? Có vòng import hoặc sửa state của miền khác không?
4. Dữ liệu có nguồn duy nhất và cache key/context đúng không?
5. Ai hủy/đối soát khi đổi đích, mất quyền, callback muộn, unmount và logout?
6. Có thể review/kiểm riêng phần này mà không sửa App.tsx hoặc store của mọi miền không?

Guard repo hiện kiểm web/server/contracts boundary. Muốn cưỡng chế thêm deep import/cycle giữa feature phải có task cập nhật lint/guard và ca allow/deny có ý nghĩa; tài liệu này chưa bật kiểm tự động đó. Trước khi có guard, reviewer kiểm trực tiếp dependency của PR, không ghi kiến trúc đã được enforce toàn bộ.
