# SCRUM-76 · Kiểm vòng đời RoomShell trong StrictMode

- Nhánh `feat/SCRUM-76-room-shell-strictmode-cleanup`, kiểm working tree của PR trên baseline `bcd21ca`.
- Windows, Chrome `156.0.8078.80`, Node `26.12.1`, pnpm `11.5.2`, React `19.3.1`, Vite `8.3.5` ở development. Fixture tự chạy assertion bằng `React.act` và root `<StrictMode>`.
- Dùng `CallControllerOwner` và provider thật từ SCRUM-59. Adapter fixture dùng một video track từ canvas và một audio track từ Web Audio. `RoomShell` mượn stream của call và chỉ gắn vào video muted. Fixture không lấy camera/mic hoặc mở kết nối WebRTC.

## Chạy lại

```sh
pnpm --filter @colearnia/contracts build
pnpm --filter @colearnia/web dev --port 5176
```

Mở [fixture RoomShell](http://127.0.0.1:5176/test/browser/room-shell/). Kết quả hiện trên trang và ca lỗi ghi vào console. Bài kiểm này chạy trong trình duyệt riêng với `pnpm check`.

```text
PASS · subscriptions=14, remaining=0, video attach/detach=12/12, peak=1, call A init/dispose=1/1
```

| Ca kiểm                                            | Mong đợi                                                                                | Thực tế                                                                                                                                                                                                 | Kết quả    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Mount và cập nhật snapshot                         | Stage, người tham gia và điều khiển hiển thị. Trạng thái theo owner.                    | Có đủ ba vùng. UI chuyển `idle` → `starting` → `active`.                                                                                                                                                | PASS       |
| StrictMode replay                                  | Tháo và gắn lại đúng một subscription phòng và một binding video.                       | Mỗi lượt mount đang active ghi hai lần gắn, một lần tháo trong replay. Tối đa một video được gắn stream cùng lúc.                                                                                       | PASS       |
| Rời phòng sang Chat ba lần và sang route tổng quan | Video cũ nhả stream, badge còn nhận snapshot, quay lại nhận state mới nhất.             | Mỗi lần rời, subscription sống giảm từ 2 xuống 1, binding từ 1 xuống 0 và `srcObject` cũ là `null`. Lần unmount root trả subscription về 0.                                                             | PASS       |
| Bảo toàn call và tracks                            | Điều hướng giữ cùng handle và hai track `live`. Chỉ owner dừng track khi kết thúc call. | Runtime A khởi tạo một lần, chưa dispose trong điều hướng. Sau `end`, dispose một lần và cả hai track chuyển `ended`.                                                                                   | PASS       |
| Đường phát audio từ RoomShell                      | Stream có audio track nhưng view chỉ phát hình và nhả binding khi tháo.                 | Tất cả video đang gắn đều muted, không có phần tử `<audio>`, AudioContext của fixture vẫn mở sau khi rời phòng.                                                                                         | PASS       |
| Async hoàn tất khi panel ẩn và đổi đời call        | Kết quả muộn không gắn vào panel đã tháo. Call mới không nhận stream cũ.                | Hoàn tất init lúc đang ở Chat giữ 0 binding. Call generation tiếp theo giữ 0 binding khi props còn stream của call cũ.                                                                                  | PASS       |
| Lỗi stage và phục hồi                              | Hiện lỗi, tháo binding cũ, gắn lại khi lỗi được xóa.                                    | Hiện `alert`, video cũ nhả stream, sau đó quay lại đúng một binding.                                                                                                                                    | PASS       |
| Workspace fixture thật                             | Kênh LIVE mở RoomShell, Chat mở panel TEXT, bố cục không tràn ngang.                    | Chuyển được hai chiều. Chrome 1280 × 800 hiển thị hai cột, 390 × 844 hiển thị một cột. Chiều rộng tài liệu bằng viewport ở cả hai kích thước. Console Workspace không có warning/error trong lượt kiểm. | PASS       |
| Truyền và phát audio cuộc gọi thật                 | Xác minh audio end-to-end và một output/track qua AudioGraph.                           | RoomShell chưa có nguồn media từ adapter production. Ca Chrome kiểm binding DOM với track tổng hợp.                                                                                                     | NOT TESTED |

[Fixture SCRUM-59](http://127.0.0.1:5176/test/browser/call-controller/) cũng đạt. `pnpm media:smoke` khởi động được native worker và Router Opus/VP8. Hai kết quả này không đo playback audio cuộc gọi hoặc TURN. AudioGraph MAIN và nguồn media production sẽ được ghép ở các task tích hợp riêng.

## Kiểm lại sau review ngày 10/11/2026

Chạy lại fixture RoomShell ở 1280 × 800 và 390 × 844 trong trình duyệt Chromium của Codex. Cả hai lượt trả cùng kết quả:

```text
PASS · subscriptions=20, remaining=0, video attach/detach=16/16, peak=1, call A init/dispose=1/1
```

| Ca bổ sung                             | Kết quả thực tế                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hai kênh LIVE có `sessionId` khác nhau | Mở B trong lúc A active, vẫn cố tình truyền stream A. B hiện trạng thái chưa tham gia, có 0 binding và video A đã nhả stream. Badge vẫn active, hai track A còn `live` và khi quay lại A nhận cùng call handle. |
| Slot panel bên                         | A có vùng Người tham gia. B dùng đúng nhãn Bảng và nội dung do fixture truyền. Bản độc lập không truyền slot nên stage chiếm toàn bộ chiều ngang.                                                               |
| Tailwind và màu sắc ngoài Workspace    | Trong Workspace, stage và panel bên hiển thị hai cột ở 1280 px và một cột ở 390 px. Bản độc lập có viền hiện cùng màu với bản trong Workspace và nền stage có hiệu lực ở cả hai kích thước.                     |

## Kiểm ngưỡng bề rộng RoomShell sau góp ý responsive

- Fixture Chromium đổi bề rộng **cùng một RoomShell** theo chuỗi 1279 → 1280 → 1279 CSS px trong lúc call A `active`. Ở 1279 px panel mở thay sân khấu và có nút **Về sân khấu**. Ở 1280 px sân khấu và panel 320 px hiển thị cạnh nhau, nút quay lại ẩn. Toolbar vẫn hiển thị ở cả hai chế độ.
- **Về sân khấu** đóng panel và chuyển focus về nút mở panel trên toolbar. Mở lại panel chuyển focus đến tiêu đề panel. Resize, quay về sân khấu và mở lại panel giữ nguyên video đang gắn, số subscription, hai track `live` và call handle. Cả lượt vẫn ghi 16 lần gắn, 16 lần tháo, tối đa một binding và 0 subscription sau unmount cuối.
- Kiểm `/workspace` trong Chromium với viewport 390, 1280 và 1700 px. Bề rộng shell đo lần lượt 358, khoảng 898 và 1316 px. Hai lượt đầu hiển thị panel thay sân khấu, lượt cuối hiển thị cạnh nhau. Không thấy tràn ngang hoặc lỗi console. Bằng chứng call liên tục đến từ fixture dùng track tổng hợp.

## Đối chiếu màu với bản xuất Figma

Mở `/workspace` trong Chromium, chọn kênh TEXT rồi chọn kênh LIVE và đọc `backgroundColor` từng vùng. Đối chiếu với [CSS bản xuất Figma](../figma-ui/src/index.css) và [CSS WorkspaceShell](../../apps/web/src/features/workspaces/workspace-shell.css).

| Vùng                        | Workspace hiện tại   | Figma                              | Phần xử lý                                                                                           |
| --------------------------- | -------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sidebar                     | `#173F35`            | `#F1F3F2` (`.sidebar`)             | WorkspaceShell `.workspace-sidebar`                                                                  |
| Kênh đang chọn              | `#D9ECAC`            | `#DCEFE8` (`.sidebar-item-active`) | WorkspaceShell `.workspace-channel[aria-current='page']`                                             |
| Vùng nội dung chat bên phải | `#F7F8F2` quanh card | `#FFFFFF` (`.conversation-shell`)  | WorkspaceShell `.workspace-main` và `.workspace-panel-host` trong suốt, để lộ nền `.workspace-shell` |

Card Chat bên trong và card RoomShell đều đo được `#FFFFFF`. Chuyển màu ba vùng trong bảng là việc tiếp nối của Workspace shell/sidebar [M1-T7.2 / SCRUM-45](https://faker1652005.atlassian.net/browse/SCRUM-45). Ca nghiệm thu ở Workspace cần đo nền sidebar, trạng thái kênh đang chọn và toàn vùng nội dung bên phải khi mở TEXT, gồm phần bao quanh card Chat.

## Kiểm ngưỡng Workspace và focus sau review bổ sung

- Fixture Chromium đổi bề rộng **WorkspaceShell** 1279 → 1280 → 1279 px trong lúc call A `active`. Khi nút **Về sân khấu** đang có focus rồi bị ẩn ở 1280 px, focus chuyển sang tiêu đề panel đang mở. Qua resize, quay về sân khấu và mở lại panel, call handle, hai track `live`, video binding và số subscription đều giữ nguyên.
- Fixture tự mở route `/workspace` thật ở viewport 1440 × 900. WorkspaceShell đo được 1440 px, RoomShell đo được 1056 px sau sidebar và padding. Panel 320 px và sân khấu nằm cạnh nhau, nút quay lại ẩn. Kiểm trực tiếp route này trong Chromium cũng cho cùng kết quả và xác nhận focus khi tăng viewport từ 1279 lên 1280 px.

```text
PASS · subscriptions=20, remaining=0, video attach/detach=16/16, peak=1, call A init/dispose=1/1 · workspace=1440×900, room=1056
```

## Kiểm chiều thu hẹp và màu Workspace ngày 11/11/2026

- Khi WorkspaceShell giảm từ 1280 xuống 1279 px, focus từ nút trong sân khấu chuyển sang tiêu đề panel sau khi sân khấu bị ẩn. Lặp lại resize với focus trên toolbar giữ focus tại toolbar. Fixture cũng kiểm lại chiều mở rộng từ nút **Về sân khấu**, bảo toàn call A và dọn binding khi rời phòng.
- Trên `/workspace` ở kênh TEXT, Chromium đo sidebar `#F1F3F2`, kênh được chọn `#E0EFE8` và vùng nội dung bên phải `#FFFFFF`. Vùng chứa card Chat trong suốt để lộ nền trắng của `.workspace-main` ở khoảng trống quanh card. Ba màu lấy từ token trong `global.css`. Giá trị `#E0EFE8` theo ảnh review mới ngày 11/11.

```text
PASS · subscriptions=22, remaining=0, video attach/detach=16/16, peak=1, call A init/dispose=1/1 · workspace=1440×900, room=1056
```
