# SCRUM-69 · M3-T2.1 — Lobby chọn thiết bị và preview

## Phạm vi và nguồn

Lobby và preview cục bộ thuộc thư mục này. Nhánh cập nhật giao diện là `fix/lobby-and-preview` (PR #77); token màu dùng chung đặt trong `apps/web/src/styles/global.css`.

Nguồn áp dụng: [FR-05-01/03](../../../../../../docs/product/functional-requirements.md), [live session](../../../../../../docs/product/live-session.md), [M3 §6.3 và T2.1/T2.2](../../../../../../docs/proposals/m3-media.md), [Sprint 1](../../../../../../docs/planning/sprint-1.md), [frontend architecture](../../../../../../docs/design-system/frontend/code-architecture.md). Đã đối chiếu T2.1/T2.2 và dòng phân công trong commit tham chiếu `a5fce0a1dbf1db577f373047910fbb615c0fb731` bằng Git; phạm vi lobby vẫn tương ứng. Không lấy proposal làm bằng chứng API đã triển khai.

Đường dẫn thật của thiết kế là `docs/design-system/frontend` và `docs/figma-ui`, không nằm ở root. `DeviceCheck` trong Figma là mô phỏng; giữ ý tưởng preview/settings, bỏ role/permission demo, dùng màu và typography app chính. Layout, spacing, style control và focus dùng Tailwind utilities; màu lấy từ token `@theme` trong `global.css`. Có breakpoint một cột, label, focus và controls tối thiểu 44px.

## Các file

| File                          | Trách nhiệm                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `LobbyDeviceCheck.tsx`        | UI tiếng Việt; gắn/tháo `srcObject`, preview muted/autoplay/playsInline, chọn/bật/tắt hai thiết bị độc lập |
| `lobbyPreview.ts`             | Runtime cục bộ sở hữu stream, generation, enumerate/devicechange/permission/ended và cleanup               |
| `useLobbyPreview.ts`          | Kết nối runtime với React; start/dispose trong effect, chịu được StrictMode                                |
| `LobbyDeviceCheck.test.ts`    | Hồi quy icon/aria-pressed khi đổi thiết bị và chờ mở thiết bị lần đầu                                      |
| `index.ts`                    | Public component và kiểu preferences để bên tích hợp import                                                |
| `lobbyPreview.test.ts`        | Kiểm thử mock Browser Media APIs và lifecycle                                                              |
| `preview.html`, `preview.tsx` | Entry kiểm tra Vite development độc lập, dùng thiết bị thật; không có join giả                             |

## Chạy và tích hợp

Chạy `pnpm --filter @colearnia/web dev --port 5178 --strictPort`, mở:

`http://127.0.0.1:5178/src/features/live/lobby/preview.html`

Entry này chỉ render trong development, không phải route production. Không tự xin quyền khi mount; bấm Bật mới gọi `getUserMedia` riêng từng loại. Nếu một permission prompt chưa được trả lời, có thể hủy intent trong UI; browser có thể tiếp tục giữ prompt nhưng stream trả muộn sẽ được dừng, theo [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Bên ghép shell/router import `LobbyDeviceCheck` từ thư mục này, truyền `channelName`, `onBack`. Chỉ truyền `onContinue(preferences)` khi flow hiện hành đã xác định quyền join; nếu không có callback thì không hiển thị lời hứa/nút vào phiên. `continuePending` do flow join quản lý. Callback nhận lựa chọn/bật tắt, không nhận stream hoặc credential và không đồng nghĩa join thành công. Trước callback, lobby dừng preview; controller tương lai tự acquire lại. Khi join thất bại và lobby còn mounted, có thể mở preview lại. Không persist preferences/deviceId.

Camera và mic độc lập. Khi đổi thiết bị đang mở, giữ stream cũ trong lúc chờ, chỉ thay sau khi stream mới hợp lệ; `selectedId` và `openedId` khác nhau trong khoảng này. Nếu mở thất bại, dọn preview cũ và báo lỗi. Không tự chuyển thiết bị khi unplug; xóa lựa chọn mất hiệu lực và yêu cầu người dùng chọn lại/bật lại. Browser không cung cấp ID trước permission thì chỉ có tùy chọn mặc định. Permissions API là bổ sung tùy browser; `getUserMedia`, `devicechange` và `ended` vẫn xử lý khi query không được hỗ trợ.

`DeviceState.isActive` phản ánh track lobby còn live, độc lập với trạng thái request. Khi giữ A và chờ B, icon, màu nút và `aria-pressed` vẫn báo bật, còn nhãn báo “Đang đổi thiết bị”. Track A kết thúc thì `isActive` về false; B thành công thì trở lại true. Áp dụng cho cả camera và microphone.

Không dùng mediasoup/socket/backend/MediaRecorder, không lưu thiết bị vào DB, không nhận track active call. T2.2 còn sở hữu hủy ticket/pending trong toàn lifecycle; T3/T4/T5/T15 còn sở hữu controller, join/access, publish và gate thật.

## Bằng chứng kiểm tra 07/11/2026

- `pnpm install --frozen-lockfile`: đạt, không đổi manifest/lockfile.
- `pnpm exec node --version`: `v26.12.1`; pnpm `11.5.2`.
- Lượt kiểm đầu: Node đúng pin; `.env` thiếu, Docker không chạy/không khả dụng. Sau đó môi trường local đã có `.env` và MongoDB replica set `rs0` được khởi động theo runbook; không reset/seed/migrate dữ liệu nghiệp vụ.
- Kiểm trước review: Prettier, ESLint, web typecheck đều đạt; Vitest riêng lobby đạt 23/23 ca.
- `pnpm check` trước review: đạt toàn cổng (exit 0), 97/97 tests; harness đạt 54 ca, 1 ca symlink được skip trên môi trường này; format/lint/typecheck/build đạt.
- `pnpm media:smoke`: native worker/Router Opus/VP8 đạt; không chứng minh call/TURN.
- Browser thật trong IAB, StrictMode: enumerate microphone/camera thật; chọn microphone bằng bàn phím; mở camera thành công (`videoWidth=640`, `videoHeight=480`, `readyState=4`, `currentTime>0`, muted/autoplay/playsInline đều true). Mở mic thành công; tắt mic vẫn giữ preview camera; tắt camera trở lại placeholder. Không ghi âm, chụp frame hoặc gửi media.
- Responsive 390×844 và 1440×900: không tràn ngang; desktop hai cột/mobile một cột. Console thu được không có warn/error.
- Quyền denied, thiết bị busy/absent, unplug, stale request và permission revoke đã kiểm bằng mock; chưa thao tác các trường hợp này với phần cứng/browser settings thật. Máy chỉ có một camera vật lý: chuyển hai camera thật chưa kiểm. Join khi không có thiết bị còn chờ flow có access thật; không gọi đây là feature call đã nghiệm thu.

Commit đề xuất: `feat(media): add lobby device selection and preview [SCRUM-69]`.

PR title đề xuất: `feat(media): add lobby device selection and preview [SCRUM-69]`.

## Sửa theo review PR #48 ngày 07/11/2026

- Khi đang mở thiết bị B, nếu chỉ stream A cũ mất thiết bị thì dọn A và giữ generation/request B; chỉ hủy khi thiết bị được chọn cũng mất hoặc không còn request thay thế. Test hồi quy cho cả camera và microphone, cùng ca B bị rút, đạt 26/26 ca lobby.
- Layout/spacing/responsive chuyển sang Tailwind; hook đổi tên `useLobbyPreview.ts` và cập nhật import.
- Focus dùng outline `#173f35` dày 3px, offset 3px và halo trắng. Kiểm Tab qua dropdown/nút mic, dropdown/nút camera, làm mới trên browser thật: focus-visible hiện rõ. Tương phản với nền lobby `#f7f8f2` lớn hơn 10:1, vượt yêu cầu 3:1. Mobile 390×844 và desktop 1440×900 không tràn ngang; console không warn/error tại thời điểm kiểm. Ca rút thiết bị giữa request được kiểm bằng mock, chưa rút hai camera vật lý.
- `pnpm check` sau review: đạt toàn cổng, 121/121 tests (26 ca lobby); build còn cảnh báo chunk lớn hơn 500 kB. `pnpm media:smoke`: đạt native worker/Router; không chứng minh cuộc gọi/TURN.
