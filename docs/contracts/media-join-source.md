# Ví dụ contract tham gia cuộc gọi và nguồn media — SCRUM-44

**Bản gửi M4 review · M3-T1.1.** M3 cung cấp ví dụ join, nguồn và lệnh media để M4, controller và shell ghép bằng fixture. Phạm vi và thứ tự bàn giao theo [Sprint 1](../planning/sprint-1.md), [WBS M3](../planning/task-consolidation.md) và [thiết kế M3](../proposals/m3-media.md#91-task-con-và-ngân-sách-dự-kiến).

## Join và chuyển context từ M4 sang M3

1. Client gửi `POST /api/v1/channels/:cid/live-session/join` với `cid` là ObjectId và body `{ requestId }`. M1 kiểm auth, CSRF/Origin, membership và quyền đọc kênh LIVE. M4 tìm hoặc tạo phiên theo vòng đời hiện hành. Response `200` có `data` gồm `sessionId`, `epoch`, `ticket`, `expiresAt`. `requestId` trong body nhận diện ý định xin ticket, còn `requestId` của response là ID trace do server sinh.
2. Client dùng socket đã xác thực để gửi `session.join` với `{ requestId, ticket }`. Ticket dùng một lần, hạn 60 giây và gắn đúng user, auth session, kênh và đời phiên. Server kiểm lại quyền, ticket và ownership trước khi cấp participant. Ticket chưa cấp quyền tạo transport, nhận nguồn, đọc chat hoặc board. Join lần đầu chưa có `callGeneration` nên dùng input riêng.
3. Sau join thành công, controller nhận `participantId`, `callGeneration` và snapshot phù hợp với ownership mới. M3 lấy `LiveContext` nội bộ qua `ResolveLiveContext` sau khi caller đã kiểm binding đúng kết nối. Dùng `sessionId`, `epoch`, `callGeneration`, scope, `audienceEpoch` và `policyRevision` để đối chiếu quyền và đời thao tác. Client nhận dữ liệu đã lọc theo audience, không nhận toàn bộ context auth/access nội bộ.

Ví dụ response REST cấp ticket. Các ID, ticket và thời gian đều là dữ liệu fixture.

```json
{
  "data": {
    "sessionId": "111111111111111111111111",
    "epoch": "10000000-0000-4000-8000-000000000003",
    "ticket": "fixture-join-ticket",
    "expiresAt": "2026-11-07T12:01:00Z"
  },
  "requestId": "10000000-0000-4000-8000-000000000004"
}
```

Ví dụ Socket.IO `session.join` lần đầu dùng ticket từ response trên.

```json
{
  "requestId": "10000000-0000-4000-8000-000000000001",
  "ticket": "fixture-join-ticket"
}
```

Retry cùng ý định giữ request ID và payload. Mất ack cần đối chiếu kết quả hoặc đồng bộ lại theo contract, tránh sinh participant thứ hai. Nếu đang có cuộc gọi khác, server báo `CALL_ALREADY_ACTIVE` và giữ ownership hiện tại để người dùng quyết định. Theo proposal M4, nhánh này giữ ticket chưa consume. Xác nhận chuyển là ý định mới, dùng `requestId` mới với ticket còn hạn và payload đề xuất `takeover: { confirmed: true, expectedCallGeneration }`. M4 cần xác nhận shape payload và metadata xung đột được phép trả trước khi consumer triển khai. [Vòng đời join](../product/live-session.md) · [Thiết kế join/takeover M4](../proposals/m4-session-groups.md#63-api-socket-và-contract-dự-kiến) · [Context SCRUM-23](session-context.md)

## Nguồn và envelope sau join

M4 cung cấp context và quyết định quyền theo phiên, scope và audience hiện hành. M3 quản lý transport, Producer, Consumer và định danh nguồn. M3 kiểm binding, owner, quyền nhận và codec trước create/ready, rồi đối chiếu lại sau bước bất đồng bộ trước khi commit hoặc resume. Khi nguồn còn được phép biết, kiểm thêm đúng mapping Consumer → Producer → source và phiên bản nguồn. Quyền nhận đến từ policy M4, còn codec là điều kiện kỹ thuật do M3 kiểm. [Policy media](../product/groups-media-policy.md#53-quyền-nhận-và-đọc)

Ví dụ nguồn màn hình đã được lọc cho một participant ở MAIN. M3 cấp `sourceId`, `sourceGeneration` và `sourceRevision`. Hai dấu của nguồn độc lập với `callGeneration` và `policyRevision`.

```json
{
  "sourceId": "fixture-screen-main",
  "sourceGeneration": 1,
  "sourceRevision": 3,
  "producerId": "fixture-producer-main",
  "ownerParticipantId": "333333333333333333333333",
  "sourceKind": "SCREEN",
  "scope": { "type": "MAIN" },
  "kind": "video",
  "publicationState": "PUBLISHING"
}
```

Ví dụ `media.consumer.ready` sau khi đã tạo Consumer ở trạng thái paused và client đã gắn track. Dùng envelope SCRUM-22 và payload minh họa từ proposal M3. Server tra actor từ kết nối và tra mapping Consumer/nguồn trong registry.

```json
{
  "requestId": "10000000-0000-4000-8000-000000000002",
  "sessionId": "111111111111111111111111",
  "epoch": "10000000-0000-4000-8000-000000000003",
  "callGeneration": 2,
  "expectedPolicyRevision": 9,
  "payload": {
    "consumerId": "fixture-consumer-main",
    "sourceId": "fixture-screen-main",
    "sourceGeneration": 1,
    "expectedSourceRevision": 3
  }
}
```

Ack dùng envelope chung, giữ `requestId` của lệnh socket để đối chiếu. Trạng thái `PUBLISHING` chỉ mô tả nguồn, còn `ready` cần kiểm lại quyền và trạng thái tại server. MAIN có nguồn share riêng. DISCUSSION nhận nguồn MAIN theo quyền và không publish màn hình riêng. ACTIVITY chỉ nhận nguồn được cấp trong nhóm, không tự nhận MAIN. [Envelope SCRUM-22](session-commands.md) · [Thiết kế nguồn M3](../proposals/m3-media.md#634-đồng-bộ-tập-nguồn-media-sau-joinresume-và-mất-event) · [Quyền theo nhóm](../product/group-modes.md)

## Ca review và hành vi mong đợi

| Ca                    | Đầu vào và trạng thái server                                                                                                                | Kết quả mong đợi                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hợp lệ                | Join cấp generation `2`, context MAIN revision `9`. Consumer thuộc đúng kết nối, quyền nhận còn hiệu lực, nguồn generation `1` revision `3` | M3 có thể tiếp tục xử lý `ready` sau khi kiểm quyền, mapping và nguồn. Fixture chỉ kiểm phần contract và điều kiện tiếp tục                                                      |
| Sai quyền             | Lệnh hợp shape nhưng participant MAIN gửi ID nguồn ACTIVITY ngoài audience của mình, hoặc actor thấy đích nhưng thiếu quyền thao tác        | Từ chối trước khi resume. Lỗi `NOT_FOUND` khi actor không được biết đích, `FORBIDDEN` khi đích được phép biết nhưng thao tác bị cấm. Giữ lỗi an toàn, không trả descriptor riêng |
| Kết nối hoặc state cũ | Client gửi `epoch` cũ, generation `1` khi ownership hiện hành là `2`, hoặc revision `8` khi context đã lên `9`                              | Không áp lệnh vào kết nối mới. Ví dụ dùng `CONFLICT` khi caller còn quyền biết phiên. Caller phải đồng bộ hoặc khôi phục binding hợp lệ trước thao tác tiếp theo                 |
| Nguồn cũ              | Call context còn hợp lệ nhưng nguồn lên revision `4` hoặc thay generation trước khi Consumer pending được `ready`                           | Từ chối resume và dọn đúng Consumer đang chờ của thao tác cũ. `SOURCE_CHANGED` là mã đề xuất của M3 cho nguồn mà actor vẫn được phép biết                                        |

Ví dụ ack khi revision phiên cũ và caller còn quyền biết phiên:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Trạng thái cuộc gọi đã thay đổi."
  },
  "requestId": "10000000-0000-4000-8000-000000000002"
}
```

Fixture chạy bằng `pnpm exec vitest run packages/contracts/src/media-join-source.test.ts`. Fixture dùng schema đã có cho ID, envelope, context và lỗi. Quyết định quyền được cấp sẵn theo từng ca để consumer kiểm cách xử lý. Thứ tự trong helper test chỉ phục vụ ví dụ, thứ tự kiểm quyền và lỗi của adapter thật cần M4 review. [Quy ước lỗi chung](error-codes.md)

## Kết quả review và bàn giao

| Điểm cần xác nhận                                                                     | Reviewer                | Kết quả                                                                  |
| ------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| Input join, payload xác nhận takeover, ack join khi snapshot trực tiếp hoặc chia phần | M4                      | Chờ review. Fixture giữ ví dụ join lần đầu và context nội bộ             |
| Cách phân biệt lỗi mất ownership với state/source cũ và thứ tự kiểm quyền biết đích   | M4 cùng M3              | Chờ review. Các mã riêng trong proposal chưa được đăng ký từ fixture này |
| Ca hợp lệ, sai quyền và stale có đủ để controller, shell và registry dùng fixture     | M4 và bên dùng contract | Chờ review. Ghi link nhận xét và nội dung đã chốt ở PR                   |

Bàn giao ví dụ cho SCRUM-59 (controller), SCRUM-45 (shell) và SCRUM-82 (registry). SCRUM-56 tiếp tục contract revoke/pending/cleanup. SCRUM-57 hoàn thiện `SourceDescriptor`, snapshot/event và revision. SCRUM-58 tiếp tục REST proof, ICE fencing và schema strict cho API media. [Phụ thuộc Sprint 1](../planning/sprint-1.md#thứ-tự-nhận-việc-đầu-sprint-trên-jira)
