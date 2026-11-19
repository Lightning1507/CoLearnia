# SCRUM-81 — Tái kiểm điều kiện chạy staging ngày 19/11/2026

**Phần kiểm hai mạng/TURN MAIN/rollback thật vẫn BLOCKED.** Người giao việc xác nhận các đầu vào vận hành bên dưới vẫn “chưa có”. Lượt này thu thêm kết quả preflight thật và đối chiếu đầu ra tích hợp hiện tại; không thay công cụ, runbook hoặc [evidence PR #124](2026-11-17-scrum-81.md) đã bàn giao. Không deploy, restart, reset/restore/migrate DB hoặc thay dữ liệu staging.

Nền mã của PR mới: `226f2ebf103b339677cfa891fbcb8fe75ef567bd` trên `origin/main`, đã gồm PR #124 và SCRUM-88 (#128). Tạo nhánh bằng terminal `git checkout -b fix/SCRUM-81-staging-recheck` trong worktree riêng để giữ nguyên các thay đổi camera/layout và file staged của checkout chung. Diff của lượt này chỉ thêm báo cáo này và JSON preflight đã lọc.

## Nguồn và giới hạn truy cập Jira

Người giao việc cung cấp comment của Quân: SCRUM-81 được mở lại để theo dõi phần kiểm thực tế còn BLOCKED; công cụ/runbook PR #124 giữ nguyên; cần operator/quyền staging, người ở mạng B, build/rollback target và cửa sổ được duyệt. Môi trường và kế hoạch có thể chuẩn bị song song; media qua ứng dụng phối hợp SCRUM-88/SCRUM-93; M3 review kết quả thật trước Done.

Chưa đọc trực tiếp được description cập nhật tại [SCRUM-81](https://faker1652005.atlassian.net/browse/SCRUM-81): phiên truy cập Jira qua trình duyệt không trả được nội dung. Không coi comment do người dùng cung cấp là toàn bộ description và không xác nhận độc lập trạng thái Jira. Không sửa description/trạng thái hoặc đăng comment Jira trong lượt này. Bảng bên dưới là bằng chứng đầu vào tại thời điểm kiểm, không thay trạng thái trên Jira.

## Đầu vào và hỗ trợ cần nhận

| Đầu vào                        | Xác minh trong lượt này                                                                                                                                                                                                                                                                           | Cần hỗ trợ                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator và quyền staging      | Người giao việc xác nhận chưa có phiên truy cập được cấp cho lượt thử. Chưa kiểm được readiness nội bộ, current release hoặc DB/volume thật.                                                                                                                                                      | PM/người quản lý hạ tầng chỉ định operator, phiên truy cập, đích triển khai và người xử lý sự cố; không gửi secret vào PR/chat.                                        |
| Client mạng B                  | Chưa có người/thiết bị/đường Internet độc lập được xác nhận. Máy đang chạy preflight không được tự gán làm mạng A của buổi nghiệm thu.                                                                                                                                                            | Xác nhận người ở B, người ở A, browser/thiết bị và hai đường mạng độc lập, tài khoản có quyền kênh/MAIN.                                                               |
| Build hiện tại và bản rollback | Chưa có commit và immutable running image IDs/digests server/web trước–sau; chưa có compatibility review/schema/index/storage hay canary.                                                                                                                                                         | Operator cùng M1/M2/M3/M4 bàn giao inventory current/target/recovery, preflight compatibility và canary hợp lệ; không lấy code HEAD làm release đang chạy.             |
| Cửa sổ thực hiện               | Chưa có khung giờ, approval, drain/finalization hoặc exact rollback/recovery command được duyệt.                                                                                                                                                                                                  | Operator xác nhận cửa sổ, active calls/recording, admission/drain và kế hoạch xử lý sự cố trước thay deployment.                                                       |
| SCRUM-88                       | [Evidence 18/11](2026-11-18-scrum-88-main-auth-media.md) đã có auth/ACL MongoDB, Socket.IO và native transport thật ở harness. Chính evidence vẫn ghi chưa mount đầy đủ vào `main.ts`, chưa có DTLS/RTP giữa hai browser, cleanup M2/M5 còn test double và lỗi login replacement theo issue #130. | M3/M4 xác nhận build app đã ghép được login → MAIN → SEND/RECV, cùng phạm vi xử lý lỗi auth/cleanup trước lượt thử. Không lấy unit/native transport làm PASS hai mạng. |
| SCRUM-93                       | Chưa được cung cấp đầu ra/SHA/bản build và chưa đọc được ticket để đối chiếu phạm vi; không tìm thấy commit có mã SCRUM-93 trong các ref local đã kiểm.                                                                                                                                           | Người phụ trách bàn giao contract/đầu ra, SHA/build, cách chạy media qua ứng dụng và giới hạn. Thiếu commit local không chứng minh ticket chưa làm.                    |

Code tại baseline vẫn truyền `undefined` ở vị trí media router trong `createApp` của `apps/server/src/main.ts`; điểm ghép `mountRegistry`/`createMediaBootstrapComposition` còn được ghi tại đường startLiveRuntime. Đây là xác minh source hiện tại, không phải kết quả chạy app staging. Không tự triển khai composition thuộc SCRUM-93 trong task vận hành này.

## Preflight staging đã chạy thật

Windows, Node `26.12.1` qua pnpm `11.5.2`. Dùng hostname staging được ghi trong [runbook hiện hành](../runbooks/staging-configuration.md), chỉ GET public không cookie/credential từ một máy. Không bypass TLS hoặc đổi firewall/DNS.

```powershell
pnpm exec node --version
pnpm doctor
pnpm exec node scripts/scrum81/staging-preflight.mjs --origin https://colearnia-staging.duckdns.org
```

Lượt preflight hoàn tất **16:00:21.247 UTC ngày 19/11/2026 (23:00:21.247 UTC+7)**, exit **1**. [JSON kết quả](scrum-81/2026-11-19-public-preflight.json) giữ output đã lọc, không có IP, body, token hoặc raw headers.

| Phép kiểm từ máy hiện tại             | Kết quả                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| DNS                                   | PASS, không xuất IP.                                                   |
| HTTPS frontend `/`                    | FAIL, không nhận HTTP status; `tls-or-network-error`.                  |
| HTTPS `/api/v1/system/status`         | FAIL, không nhận HTTP status; `tls-or-network-error`.                  |
| Anonymous `/api/v1/auth/me`           | FAIL phép đo, không nhận HTTP status; chưa xác minh auth từ chối đúng. |
| Docker Engine local qua `pnpm doctor` | Không chạy hoặc không truy cập được. Không khởi động stack/DB.         |

Kết quả không phân biệt timeout, TLS hay lỗi đường mạng, không kết luận staging ngừng hoạt động toàn cục hoặc chứng chỉ hỏng. Cần operator kiểm lại từ mạng đã được cấp quyền. Không dùng lượt này thay NET-01 trên cả mạng A/B, không gọi nó là kiểm signaling hoặc RTP.

Ba script diagnostic trong checkout chạy phép đo có cùng Git blob với baseline worktree (preflight `59a942d`, media helper `a29852d`, regression `a179109`). Chạy lại test độc lập trong worktree trước bàn giao để tránh tính thay đổi camera/layout đồng thời vào kết quả của PR này.

## Phần chưa thể chạy và lịch đề xuất

| Phần nghiệm thu                                   | Kết quả mới                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| NET-01 từ cả A/B có TLS và login/WebSocket hợp lệ | BLOCKED; chỉ có preflight public một máy thất bại ở trên.                                                           |
| NET-02/03/04 và TURN-01/02/03/04 qua app          | BLOCKED; chưa có app build được xác nhận, mạng B và credential test theo contract. Không có selected pair/RTP mới.  |
| RB-01/02/03/04, DATA-01                           | BLOCKED; chưa có quyền, approval, inventory current/target, compatibility/drain và canary. Không diễn tập rollback. |

Giữ cách ghi riêng A/B trước và sau rollback của [runbook PR #124](../runbooks/scrum-81-verification.md): mỗi kết quả gắn UTC timestamp, commit, running images server/web và bằng chứng readiness nội bộ cùng release. Khi kiểm TURN-02, từng SEND/RECV ở cả A/B cần `localType === 'relay'` và RTP bytes/packets tăng; chỉ remote relay không đủ. Chưa điền PASS cho bất kỳ transport/mạng nào trong lượt này.

**Chưa thể chốt ngày/giờ chạy thật.** Có thể phối hợp chuẩn bị quyền/mạng/inventory/compatibility song song với đầu ra app của SCRUM-88/SCRUM-93. Sau khi operator và người ở B xác nhận đủ đầu vào, M5 cùng họ chốt một cửa sổ theo [effort T17.4](../planning/sprint-1.md) (4 giờ dự kiến, không phải cam kết hoàn thành hoặc approval). Bước chạy là preflight/drain → network/normal ICE/forced relay → app-only rollback → health/functional smoke riêng A/B và canary trước–sau; lỗi preflight/compatibility dừng phần phụ thuộc, không rollback dữ liệu.

M3 cần review bằng chứng thực tế trước khi chuyển Done. Không dùng kết quả công cụ hoặc PR này thay nghiệm thu hai mạng/rollback hoặc gate 5 người M3-T15.1. Nội dung cần báo lại đầu mối là các đầu vào trong bảng, kết quả HTTPS fail và việc chưa chốt được lịch, không phải một lời xác nhận đã chạy staging thành công.

## Kiểm local của lượt bàn giao

Trong checkout có cùng ba script gốc: diagnostic **13/13 PASS**, native `pnpm media:smoke` PASS. Kiểm độc lập lại trên worktree mới với Node `26.12.1`, pnpm `11.5.2`:

| Lệnh/kiểm tra                                                     | Kết quả thực chạy                                                                                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                  | PASS, lockfile không đổi.                                                                                                                                                                 |
| `pnpm exec node --test scripts/scrum81/diagnostics.test.mjs`      | 13/13 PASS.                                                                                                                                                                               |
| `pnpm --filter @colearnia/contracts build` rồi `pnpm media:smoke` | PASS. Lượt smoke đầu ở worktree mới thiếu contracts/dist nên exit 1; đã build contracts và chạy lại đạt. Worktree không có `.env`, không sao chép secret từ checkout chung.               |
| `pnpm check`                                                      | PASS: harness 54 PASS/1 skip Windows, 140 nguồn/link/runtime; format, lint, typecheck contracts/server/web và test xuyên ứng dụng; 994 unit test đạt trong 73 file; build server/web đạt. |
| Kiểm tài liệu và JSON bằng script tạm                             | 6 link nội bộ tồn tại; JSON parse được, giữ scope một mạng, DNS PASS và ba phép HTTPS FAIL. Không kiểm anchor hoặc ngữ nghĩa tự động.                                                     |

Worker/Router Opus/VP8 và unit test không chứng minh camera/mic/TURN. Chưa chạy bộ database integration, diagnostic login replacement, app trên hai browser, tải kết hợp hoặc rollback staging trong lượt này; Docker/quyền/đầu vào chưa sẵn sàng. Không chạy seed/migration để vượt blocker. Kiểm format và `git diff --check` được kiểm lại sau khi điền kết quả này.
