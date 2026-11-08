# Contract snapshot và sự kiện nguồn media — SCRUM-57

**M3-T1.3 · Bản gửi M4 review.** Contract tiếp nối ví dụ join của SCRUM-44 và context của SCRUM-23. M3 cung cấp descriptor và stream sự kiện đã lọc theo quyền M4. M4 review chính, M5 đối chiếu định danh nguồn dùng cho board. [Planning](../planning/sprint-1.md) · [Thiết kế M3 về snapshot](../proposals/m3-media.md#634-đồng-bộ-tập-nguồn-media-sau-joinresume-và-mất-event) · [Context M4](session-context.md)

## Định danh nguồn

| Field                                | Ý nghĩa                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `sourceId`, `producerId`             | ID opaque của registry M3 và mediasoup. `ownerParticipantId` dùng kiểu participant SCRUM-22                                          |
| `sourceGeneration`, `sourceRevision` | Đời nguồn và revision trong đời đó. Tái tạo Producer dùng đời nguồn mới. Thay đổi trạng thái hoặc track trong cùng đời tăng revision |
| `sourceKind`, `kind`, `scope`        | MIC và SCREEN_AUDIO là audio. CAMERA và SCREEN là video. Scope dùng `SessionScopeRef`                                                |
| `publicationState`                   | `PUBLISHING`, `PAUSED`, `SWITCHING` theo server. Trạng thái publish chưa xác nhận client đã nhận frame                               |

M3 xác minh quyền nhận theo M4 trước khi chiếu nguồn. DISCUSSION có thể thấy nguồn MAIN được cấp quyền, vì vậy scope của nguồn có thể khác scope hiện tại của người nhận. Descriptor chỉ chứa định danh và trạng thái công khai cần dùng. [Quyền media](../product/groups-media-policy.md#53-quyền-nhận-và-đọc)

## Resync và snapshot

`media.sources.resync` nhận `requestId`, `sessionId`, `epoch`, `callGeneration` và payload `{ lastMediaStreamId?, lastMediaSequence? }`. Các mốc `last*` phục vụ đối chiếu, server vẫn chụp projection đầy đủ theo quyền hiện hành. Đây là lệnh đọc nên không bắt `expectedPolicyRevision` cũ khớp. `completed` xác nhận snapshot đã chụp và trả `snapshotId`, `mediaStreamId`, `mediaSequence`, `audienceEpoch`, `policyRevision`, `partCount`. Lỗi dùng envelope chung. Auth/quyền bị thu hoặc phiên đã kết thúc thì từ chối resync. Snapshot rỗng chỉ dùng cho người còn quyền mà chưa có tài nguyên.

`media.sources.snapshot` mang cùng descriptor với ack, thêm `requestId`, `sessionId`, `epoch`, `callGeneration`, `partIndex` và payload. Part index bắt đầu từ 0. Mỗi part có đủ bốn mảng, các mục của mỗi mảng phân bổ qua các part, không lặp lại nguyên mảng. Consumer ghép theo `requestId`, snapshot ID, đời kết nối, audience, stream và watermark, kiểm ID trùng hoặc mâu thuẫn trước khi áp. Ack và các part có thể tới khác thứ tự.

| Mảng            | Nội dung                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `sources`       | Descriptor nguồn đã lọc cho người nhận                                                                                |
| `ownTransports` | ID, chiều SEND/RECV, `iceGeneration`, `restartPending` của người nhận                                                 |
| `ownProducers`  | `{ source, replacement }` của chính người nhận. Giữ đủ descriptor ở `PAUSED` và `SWITCHING`, kể cả khi `sources` rỗng |
| `ownConsumers`  | Consumer ID, Producer ID, định danh và revision nguồn, `ready` và `paused`                                            |

Producer ở `PAUSED` có `replacement: null`. Producer MIC/CAMERA ở `SWITCHING` mang `{ replacementId, sourceRevision, expiresAt }` đúng revision hiện hành. Khi nhận snapshot, FE đối soát với track và operation local trước khi làm tiếp. [Thiết kế đổi track](../proposals/m3-media.md#635-thay-track-cùng-producer-prepare-commit-và-timeout)

Schema kiểm phần riêng lẻ và giới hạn số part theo `sessionControlBudget`. Giới hạn byte UTF-8 sau serialize, thời hạn ghép và ngân sách buffer được thực thi ở sender/consumer trong các task tích hợp. [Budget SCRUM-23](session-context.md#thứ-tự-khóa-và-giới-hạn)

## Event và ví dụ watermark

Tên event đi riêng trong Socket.IO. Mỗi event chứa `sessionId`, `epoch`, `callGeneration` của **người nhận**, `audienceEpoch`, `policyRevision`, `mediaStreamId`, `mediaSequence` và `payload`.

| Event                         | Payload                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `media.source.changed`        | `{ source }`                                                                               |
| `media.source.ended`          | `{ sourceId, sourceGeneration, sourceRevision, reason }`                                   |
| `media.producer.stateChanged` | `{ producerId, sourceId, sourceGeneration, sourceRevision, state, reason }`, chỉ tới owner |
| `media.consumer.closed`       | `{ consumerId, sourceId, sourceGeneration, reason }`, chỉ tới owner của Consumer           |
| `media.transport.closed`      | `{ transportId, reason }`, chỉ tới owner của transport                                     |

Schema dùng catalog reason của proposal để lọc giá trị, với hai reason riêng về nguồn `SOURCE_ENDED` và `SOURCE_REPLACED` dùng cho event gắn nguồn. M4 đối chiếu cách map reason với các adapter. Một event đóng chỉ được dọn mapping đúng đời nguồn hoặc ownership tương ứng. [Thiết kế event M3](../proposals/m3-media.md#636-event-media-payload-sequence-và-bảo-đảm-xử-lý)

Ví dụ dưới đây bắt đầu ở `callGeneration = 2`, `audienceEpoch = 4`, stream A. Snapshot chốt watermark `S = 12`, `policyRevision = 9`. Snapshot giữ mic own ở `PAUSED` và camera own ở `SWITCHING` dù `sources = []`.

| Tình huống                                                                       | Consumer xử lý                                                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Event stream A, sequence `12`                                                    | Bỏ vì đã nằm trong snapshot tại `S`                                                                                                |
| Event stream A, sequence `13`, `policyRevision = 16`                             | Sau khi ghép đủ snapshot, áp vì sequence liên tục. Bước nhảy policy revision không tạo gap                                         |
| Event stream A, sequence `14` là delta đầu tiên còn lại sau khi ghép, thiếu `13` | Resync vì thiếu event                                                                                                              |
| M4 công bố `audienceEpoch = 5` khi đang ghép A                                   | Bỏ snapshot, buffer và tài nguyên private thuộc audience cũ. Dùng context mới để resync. M3 cấp stream B với watermark ban đầu `0` |
| Sau khi áp snapshot B, event A tới muộn hoặc event B sequence `1` tới            | Bỏ event A vì sai context. Áp event B nếu đúng đời và sequence liên tục                                                            |

FE giữ event đúng context trong khi ghép. Sau khi nhận đủ part, áp snapshot rồi phát lại chuỗi liên tục từ `S + 1`. Cùng sequence khác nội dung, part trùng chỉ số khác nội dung, timeout hoặc overflow đều cần resync. Chi tiết lắp snapshot, replay và cleanup local thuộc SCRUM-67 và task delta tiếp theo.

## Kiểm và bàn giao

Schema và type dùng chung nằm ở [media-source.ts](../../packages/contracts/src/media-source.ts). [Fixture SCRUM-57](../../packages/contracts/src/media-source.test.ts) kiểm dữ liệu hợp lệ, trường nội bộ bị từ chối, own Producer PAUSED/SWITCHING, watermark, gap và audience đổi. Fixture mô tả quyết định của consumer. Handler, lọc registry theo ACL và ghép FE được kiểm ở các task tích hợp.

**Chờ M4 review** phần bind `callGeneration`/`audienceEpoch` của người nhận và watermark khi đổi phạm vi. Cần xác nhận hai chi tiết của schema trước khi các task sau dùng contract này.

- Schema hiện yêu cầu own Producer `SWITCHING` có pending replacement đúng revision. §6.3.4 mô tả `replacement` là nullable, còn §6.3.5 mô tả `prepare` chuyển sang `SWITCHING` cùng lúc cấp token. M4 xác nhận liệu snapshot có thể quan sát `SWITCHING` mà pending đã bị vô hiệu hay không.
- §6.3.6 đưa catalog `reason` chung và yêu cầu lọc theo event. Schema hiện loại `SOURCE_ENDED` và `SOURCE_REPLACED` khỏi `media.transport.closed`. M4 xác nhận danh sách phù hợp cho từng event với adapter.

SCRUM-58 dùng contract này để làm REST proof và ICE. SCRUM-67 ghép snapshot và đối soát tài nguyên ở FE. SCRUM-68 xử lý delta stream và buffer. SCRUM-73/74 dùng định danh nguồn khi ghép share lease và picker.
