# State FE và cache theo audience — SCRUM-85

M4-T10.2 dùng contract [projection SCRUM-66](session-projection.md), [reconnect SCRUM-84](main-reconnect.md) và lifecycle của RoomShell/CallController SCRUM-76. Đây là runtime FE cùng adapter có thể ghép vào luồng join; server MAIN hiện chưa mount trong composition production. Không coi fixture này là gate MAIN thật M4-T11.1.

## State và thứ tự dữ liệu

`apps/web/src/features/live/runtime/sessionProjectionRuntime.ts` giữ projection trong Zustand vanilla theo từng session/epoch/participant/callGeneration. `useSessionProjection(runtime)` cho slot của RoomShell đọc state, không sở hữu hoặc hủy cuộc gọi khi đổi panel. State có `syncing`, `ready`, `error`, `closed`; chỉ `ready` có projection/cursor cho thao tác private.

- Mỗi resync có requestId mới, deadline cố định 5 giây, tối đa 64 phần/1 MiB; từng packet không quá 16 KiB JSON UTF-8. Part đến trước ACK được giữ trong budget, chỉ ghép sau khi descriptor khớp. Không công bố state từng phần.
- Event được parse strict và đối chiếu identity. Sequence cũ/trùng và audience cũ bị bỏ. Audience mới được nâng mốc ngay cả khi snapshot chưa đủ phần; header mới mâu thuẫn sequence/revision vẫn thu audience cũ và yêu cầu resync.
- Trong resync, chỉ buffer metadata M4, tối đa 64 event/256 KiB/5 giây. Snapshot tại S loại event ≤ S rồi áp liên tục S+1. Kế hoạch replay phải hợp lệ toàn bộ trước một lần publish. Không buffer chat/board/frame riêng.
- Mốc sequence/revision đã quan sát không mất khi retry. Thiếu sequence, gap, part mâu thuẫn, vượt byte/count hoặc quá hạn đều hủy bộ đang chờ, dọn cache private rồi retry tối đa ba lần, backoff 0,5/1/2 giây cộng jitter 0–100 ms. Hết lượt giữ `error`; `runtime.resync()` là thao tác thử lại chủ động.
- `session.ended` và ACK terminal chỉ tác động đúng call ownership. Disconnect đóng runtime cũ; luồng join/resume phải nhận ACK generation mới rồi tạo runtime mới, không hồi private grant từ cache.

## Cache và callback bất đồng bộ

`AudienceCache` dùng TanStack Query riêng cho dữ liệu tạm của cuộc họp. Key chứa session, epoch, participant, callGeneration, audienceEpoch, scope/groupId và đời cache cục bộ. Không dùng cache này cho lịch sử TEXT/DM của Workspace.

Consumer chụp `runtime.cache.capture()` lúc bắt đầu thao tác. `load(lease, key, loader)` truyền AbortSignal; `write`, `read`, `retain` đều kiểm chính lease đó còn hiện hành. Khi đổi audience, resync, thay quyền hoặc teardown: abort fetch, cancel/remove query, hủy subscription và thu object URL đã đăng ký. Quay lại cùng groupId vẫn có lease khác. `useAudienceValue(runtime, key)` quan sát giá trị cache trong React; không cần chờ event projection tiếp theo.

Với ảnh tải xong muộn, đăng ký disposer trước khi gắn ảnh; lease hết hiệu lực thì `retain` tự gọi disposer và trả false:

```ts
const lease = runtime.cache.capture();
if (lease) {
  const blob = await runtime.cache.load(lease, 'frame', fetchFrame);
  if (blob) {
    const url = URL.createObjectURL(blob);
    if (runtime.cache.retain(lease, () => URL.revokeObjectURL(url))) {
      runtime.cache.write(lease, 'frameUrl', url);
    }
  }
}
```

Consumer phải đăng ký mọi handle cần thu và dùng lease đã chụp cho completion; không chụp lease mới trong callback của thao tác cũ. Guard FE không thay ACL, revoke fanout hoặc file authorization tại server.

## Ghép CallController và socket

`createSessionProjectionInitializer({ owner, socket, onRuntime, initialize? })` trả initializer cho `owner.acquire(identity, initializer)`. Chỉ acquire sau join/resume ACK hiện hành. `initialize` có thể ghép initializer media hiện có; `onRuntime` cung cấp source cho slot chat/board/stage. Không khởi tạo runtime trong effect của panel.

Adapter đăng ký `session.snapshot`, năm event projection, `session.ended`, `disconnect`; phát `session.resync` và route part đúng request đang chờ. Abort của CallController tháo listener, timer, cache và callback; initializer lỗi cũng cleanup. ACK terminal gọi `owner.end(identity)` với identity đã chụp, không tìm call hiện tại sau await.

Cursor hợp lệ được chuyển tới `MediaSnapshotRuntime.updateContext`. Audience đổi hoặc teardown gọi `updateContext(null)` ngay. Resync metadata cùng audience không thu rồi cấp lại cursor media không đổi, vì M3 giữ watermark/sequence riêng; metadata/private actions vẫn bị khóa đến khi snapshot hợp lệ. Adapter không tự mở mic/camera, tạo Consumer hay đổi quyền server.

## Kiểm chứng và giới hạn

Xem [bằng chứng SCRUM-85](../test-evidence/2026-11-14-scrum-85-main-audience-state.md). Fixture tại `apps/web/test/browser/session-projection/index.html` ghép CallController, RoomShell, Zustand và cache thật với socket giả theo contract. Provider private nhóm/chat/board thực và auth/media hai mạng tiếp tục kiểm ở M4-T11.1/T11.2; không mở rộng implementation của các miền đó trong task này.
