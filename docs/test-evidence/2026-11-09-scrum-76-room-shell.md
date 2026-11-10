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
