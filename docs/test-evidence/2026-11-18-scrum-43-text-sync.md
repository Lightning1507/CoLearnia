# SCRUM-43 — Đồng bộ tin mới và lịch sử nhiều trang

Nhánh `feat/SCRUM-43-text-history-sync` bắt đầu từ remote main `735b775`. Phạm vi là tin gốc kênh TEXT, nhận các quyết định subscribe-first/commit sequence của SCRUM-38/40 và history-only đã merge ở SCRUM-42. Đây là bằng chứng implementation và hồi quy, không xác nhận rollout hay đóng phần gửi còn mở. [Contract](../contracts/text-messaging.md#triển-khai-scrum-43-và-điều-kiện-bật) · [Runbook](../runbooks/local-development.md#đồng-bộ-subscribe-first-text-scrum-43)

## Những phần đã triển khai

- Subscription có lease, token ngẫu nhiên và checkpoint/cursor HMAC. H đọc majority và đăng ký audience dưới cùng User/Workspace gate; catch-up dùng L/H cố định, sắp theo commitSeq, snapshot/older history giữ baseline chưa có sequence.
- Mỗi trang và mỗi fanout kiểm auth, membership, PRIVATE grant, tombstone và barrier thật; token ràng phiên, connection còn sống, scope, incarnation/revision. Resource và byte được giới hạn, disconnect/unsubscribe/expiry giải phóng lease. Pending deny fence chặn resource cũ, cleanup theo watermark không thu resource mới/peer.
- Controller Web gắn listener trước subscribe, nhận event sớm, gộp theo ID, tải đủ trang rồi mới tiến checkpoint H. Đối soát định kỳ không cần socket disconnect hoặc thấy gap sequence. Lỗi auth/quyền xóa cache; expiry/overflow/timeout/disconnect/sai scope không báo hoàn tất.
- Bootstrap có transport đọc nhưng vẫn tắt cả hai đường gửi. Admission sync mặc định đóng, cần cấu hình/index và đúng cặp cleanup adapter thật trước khi bật. Không thay FIFO, thời hạn transaction, pool mặc định, schema AuthSession hay giải pháp send/revoke của PR #117.

## Môi trường và cách kiểm

Windows x64, Node 26.12.1 và pnpm 11.5.2 theo pin repo. MongoDB Docker `mongo:8.0.16`, container thử riêng `colearnia-scrum43-test`, replica `rs0`, chỉ bind loopback cổng 27143, không dùng volume hay DB staging. Đã kiểm transactionLifetimeLimitSeconds = 60, giữ mặc định. Test tạo/dọn riêng DB `colearnia_test_scrum43_*`. Một Database/MongoClient/pool 4 và coordinator chung cho các service trong fixture.

```powershell
$env:COLEARNIA_DB_TEST_PORT='27143'
pnpm exec vitest run apps/server/src/messaging/text-sync.test.ts apps/web/src/features/text/text-sync.test.ts
pnpm exec vitest run --config vitest.database.config.ts apps/server/test/text-sync.integration.ts test/text-sync.integration.mjs --disableConsoleIntercept
```

Các assertion native được giữ trong [test server](../../apps/server/test/text-sync.integration.ts), [fixture](../../apps/server/test/text-sync.fixture.ts) và [test ghép controller](../../test/text-sync.integration.mjs). Fixture cấp tài khoản/Workspace/kênh test bằng model; authorize/ACL, HTTP auth/CSRF, Socket.IO, repository, snapshot read, transaction, coordinator, barrier và AUTH_SESSION revoke là code thật. LIVE cleanup/authority là fixture trả kết quả hoàn tất; không có media, board, file hoặc recovery production trong phép thử.

## Các ca và kết quả quan sát

| Ca                          | Bằng chứng/assertion                                                                                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ranh giới subscribe         | Native Socket.IO nhận event của tin commit sau H nhưng trước ACK; snapshot chỉ chứa tin trước H. Gộp hai nguồn đủ hai ID, không mất tin ở khoảng mở.                                                                                                                   |
| Nhiều trang                 | 63 tin cùng timestamp được tải qua bốn trang 20/20/20/3 với cùng L/H. Tin commit giữa các trang nằm ở event sau H, không bị gán vào checkpoint H.                                                                                                                      |
| Controller + transport thật | Cố ý bỏ một event khi socket vẫn nối, nhận tin kế tiếp nhưng checkpoint chưa tiến. Lượt đối soát lấy lại tin bị mất, gộp event trùng. Tải tiếp backlog 105 tin qua nhiều trang, cuối có 108 ID duy nhất. AUTH_SESSION revoke thật làm controller xóa cache/checkpoint. |
| Quyền và token              | PRIVATE không có grant bị từ chối; gỡ grant giữa trang chặn trang kế; đổi H, dùng cursor của lượt khác hoặc token bằng phiên auth khác đều bị từ chối. Lease hết hạn không trả trang thành công.                                                                       |
| Resource/cleanup            | Unit kiểm cap, unsubscribe sai owner, disconnect, token hết hạn, auth hết hạn và revision đổi. Fence/cleanup lặp giữ peer và resource mới. Native kiểm thiếu binding thì không admit; sink không nhận event làm invalidation và token không còn đọc được.              |
| Client fail-closed          | Unit kiểm AUTH_REQUIRED/FORBIDDEN/NOT_FOUND giữa trang, invalidation trước ACK, token CONFLICT, tràn số event/byte, timeout, disconnect và response đến sau stop. Không ca nào công bố checkpoint mới sau lỗi.                                                         |
| History cũ và send tắt      | Snapshot/older cursor đọc được legacy thiếu commitSeq; tin sau H không lọt vào cursor snapshot. Cả REST POST và socket send trả DEPENDENCY_UNAVAILABLE, DB vẫn không có Message/sequence mới.                                                                          |
| Tải ghép                    | Subscribe, history, đọc phiên, tạo Workspace và tạo kênh chạy cùng tiến trình/pool/coordinator. Các lượt quan sát: 173/131 ms; lượt ma trận cuối 134 ms, peak checkout 3 trên pool 4, năm operation đều hoàn tất. Mẫu nhỏ này chưa phải SLA/capacity.                  |

Lượt hồi quy auth/Workspace/kênh: **109 ca đạt, 1 ca baseline bỏ qua**, bằng lệnh thêm ba file `registration.integration.ts`, `create-workspace.integration.ts`, `create-channel.integration.ts` vào lệnh native phía trên. Các thay đổi transport sau lượt đó được chạy lại bằng suite native/TEXT; kết quả kiểm cuối được cập nhật trong PR cùng SHA.

## Điểm còn cần review và bàn giao

- Main chưa bind cặp cleanup M2/LIVE thật. Điền env hoặc merge code không mở sync. M1/M4 cần review binding `textService.syncRevocation` đúng instance và các port LIVE/board/authority thuộc composition hiện hành; không dùng fixture để qua readiness. Bản thử native chỉ xác nhận AUTH_SESSION với LIVE fixture.
- `/workspace` vẫn là UI fixture SCRUM-46. Controller có thể nhận transport adapter nhưng chưa nối vào màn hình thật; consumer SCRUM-47 phải quản lý auth/scope generation và gọi stop khi logout/đổi scope, cấp giới hạn client phù hợp rồi kiểm browser.
- Thread/reply-count runtime, DM và meeting chat chưa được bật; giữ contract để các task consumer tiếp tục tích hợp. Không khẳng định thread đã đồng bộ chỉ vì timeline qua các ca này.
- Gửi TEXT vẫn tắt theo SCRUM-42/PR #117. P2 ambiguous commit, durable revoke nhiều scope và recovery không được giải quyết hay lách bởi sync. Event best-effort cần catch-up từ checkpoint đã hoàn tất; không dựa vào Socket.IO packet recovery cho nội dung private.
- Checkpoint/token hết hiệu lực khi registry restart. Chưa có checkpoint durable/resume qua process incarnation; client xử lý CONFLICT bằng lượt snapshot mới. Không thêm pool/worker/Redis.
- Giá trị resource và thời gian trong test là đầu vào thử, chưa chốt rollout/capacity 25/50 người. Cần M1/M4 review encoding/index/config và tải cùng media trước khi bật trên môi trường dùng chung.

## Kiểm tra cuối và lượt lỗi đã giữ lại

- Unit gần thay đổi: 15/15 ca đạt (server registry/config và client controller, gồm tự mở lượt mới sau RESYNC_REQUIRED nhưng không tự mở lại ACCESS_REVOKED).
- Lượt ma trận cuối gồm bảy file native/Q9/TEXT/auth/Workspace/kênh đạt **127 ca, 14 ca bỏ qua theo điều kiện suite baseline**. Command mở rộng lệnh native bằng các file `text-transport.integration.ts`, `registration.integration.ts`, `create-workspace.integration.ts`, `create-channel.integration.ts`, `history-sync.integration.ts`.
- Một lượt ma trận trước có **125 pass, 1 fail, 14 skip**: `registration.integration.ts` ca rollback session insert mong tổng session giữ 18 nhưng quan sát 17. File registration và các assertion giữ nguyên; nghi TTL monitor xóa session hết hạn, chưa có trace để kết luận nguyên nhân. Chạy lại cùng container/config, không đổi lifetime/retry/assertion hoặc tắt TTL, cho kết quả 127 pass/14 skip nêu trên (có thêm ca requestId/no-ACK). Không coi lượt trước là chạy sạch hoặc đã sửa flake auth.
- Sau thay đổi controller tự resync/thứ tự hiển thị và fallback snapshot khi vượt trần cache, chạy riêng `test/text-sync.integration.mjs` đạt 1/1. Đây là controller với transport thật, không phải kiểm giao diện trình duyệt.
- `pnpm install --frozen-lockfile` exit 0; `pnpm run doctor` xác nhận Node đúng pin, Docker engine chạy, checkout không có `.env` (test không dùng credentials staging).
- `pnpm infra:config` exit 0. `pnpm audit --audit-level=high` exit 0 với một Moderate và một High được ignore theo ngoại lệ #127 kế thừa main; không đổi policy audit trong task này và không khẳng định advisory đã được vá.

Controller không lặp catch-up vô hạn khi backlog vượt trần projection: lượt đó báo resync, không nâng checkpoint; lượt tiếp theo lấy snapshot hữu hạn và giữ olderCursor cho phần cũ. Checkpoint H chỉ được công bố sau snapshot mới thành công. Thứ tự render theo thời gian/ID ổn định, độc lập checkpoint commit.

Cổng trước publish: `pnpm check` exit 0, 72 file/981 test đạt; harness 54 pass/1 skip, format/lint/typecheck/build đạt. `git diff --check` sạch.
