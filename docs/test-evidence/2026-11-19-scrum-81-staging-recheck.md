# SCRUM-81 — Tái kiểm điều kiện chạy staging ngày 19/11/2026

Xem phần [đo bổ sung](#đo-bổ-sung-lúc-2332-giờ-việt-nam) cho kết quả mới nhất trong ngày. Mỗi lượt kiểm công khai chỉ quan sát từ một máy Windows. Người giao việc xác nhận vẫn thiếu operator staging và người thử mạng B.

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

## Đo bổ sung lúc 23:32 giờ Việt Nam

Nhánh `chore/SCRUM-81-staging-acceptance-followup` được tạo trong checkout gốc bằng `git checkout -b` từ `origin/main` tại `226f2eb`, sau đó fast-forward tới `c08eb0b`, đầu nhánh [PR #133](https://github.com/Lightning1507/CoLearnia/pull/133). Phép đo dùng cùng phiên bản helper đã merge trong [PR #124](https://github.com/Lightning1507/CoLearnia/pull/124).

Windows NT `10.0.22621.0`, Node `26.12.1` qua pnpm `11.5.2`. Origin lấy từ bàn giao SCRUM-55. Chưa có operator xác nhận release hiện chạy hoặc xác nhận máy này là client A. Chưa có dữ liệu browser/ISP cho buổi nghiệm thu. Chạy ba GET công khai bằng helper trong phần trên, với TLS verification mặc định của script.

| Phép đo                                          | UTC ngày 19/11/2026       | Kết quả                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staging-preflight.mjs` với origin trong runbook | 16:32:37.813              | **FAIL**, exit 1. DNS PASS. Ba GET `/`, `/api/v1/system/status` và `/api/v1/auth/me` đều `httpStatus: null`, `tls-or-network-error`. Chưa có phản hồi HTTP để xác minh readiness hoặc anonymous rejection. |
| HTTPS GET `/` trực tiếp bằng curl                | 16:35:42.803–16:35:50.863 | **FAIL**, exit 28. `http=000 tcp_seconds=0.000000 tls_seconds=0.000000 total_seconds=8.014324`. Đường kết nối từ máy thử hết hạn trước khi lập TCP tới cổng 443.                                           |

```powershell
curl.exe --noproxy '*' --silent --output NUL --connect-timeout 8 --max-time 10 --write-out 'http=%{http_code} tcp_seconds=%{time_connect} tls_seconds=%{time_appconnect} total_seconds=%{time_total}\n' https://colearnia-staging.duckdns.org/
```

Lượt `curl` chưa tới bước xác minh hostname và chuỗi chứng chỉ. Handoff SCRUM-55 yêu cầu cấp đường vào TCP 443 cho máy thử. Operator cần xác nhận lại origin, đường truy cập hợp lệ cho A/B và listener HTTPS staging trước lượt đo tiếp theo. Kết quả từ máy này chưa xác định nguyên nhân timeout hoặc khả năng truy cập từ mạng khác.

Chrome chuyển tới màn hình đăng nhập Atlassian khi mở SCRUM-81. Nội dung Jira hiện tại chưa được xác minh. Đã đối chiếu [M3 proposal tại revision tham chiếu](https://github.com/Lightning1507/CoLearnia/blob/a5fce0a1dbf1db577f373047910fbb615c0fb731/docs/proposals/m3-media.md#L859) và [Sprint 1](../planning/sprint-1.md) với `origin/main`. Phạm vi T17.4 vẫn là hai mạng và rollback app-only. Kiểm credential hết hạn được theo dõi ở SCRUM-92, gate MAIN năm người ở SCRUM-89.

### Phụ thuộc và đầu mối

| Phụ thuộc                     | Bằng chứng đã có                                                                                                                                                                                       | Điều kiện staging còn thiếu                                                                                                                                         | Đầu mối                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| M3-T17.2 / SCRUM-55           | [PR #78](https://github.com/Lightning1507/CoLearnia/pull/78) ghi kết quả HTTPS, readiness và transaction trên release lịch sử `50eec8f`.                                                               | **BLOCKED**. Xác minh quyền truy cập, current release và DB/volume đang dùng.                                                                                       | Operator staging, M1/M4             |
| M3-T17.3 / SCRUM-63, SCRUM-64 | [PR #88](https://github.com/Lightning1507/CoLearnia/pull/88) có bằng chứng Allocate/relay lịch sử. [PR #116](https://github.com/Lightning1507/CoLearnia/pull/116) ghép REST bootstrap/ICE credentials. | **BLOCKED**. Xác minh cấp credential tạm qua hợp đồng app và đo qua MAIN thật với TLS 443/UDP 3478.                                                                 | M3/M4, operator TURN                |
| M3-T5.1 / SCRUM-71            | [PR #120](https://github.com/Lightning1507/CoLearnia/pull/120) triển khai bật/tắt mic/camera, có loopback thiết bị giả local.                                                                          | **BLOCKED**. Kiểm mic/camera vật lý trong MAIN cùng hai người thử.                                                                                                  | M3/M5, người thử A/B                |
| M3-T6.2 / SCRUM-75            | [PR #99](https://github.com/Lightning1507/CoLearnia/pull/99) có code publish/stop screen và screen audio.                                                                                              | **BLOCKED**. Chạy screen share, kiểm hình/âm thanh tại đầu nhận và dừng nguồn qua app staging.                                                                      | M3/M5, người thử A/B                |
| M3-T8.1 / SCRUM-77            | [PR #114](https://github.com/Lightning1507/CoLearnia/pull/114) có playback MAIN và bằng chứng fixture local.                                                                                           | **BLOCKED**. Xác minh playback, autoplay và nghe được hai chiều trong app.                                                                                          | M3/M5, người thử A/B                |
| M4-T2.4 / SCRUM-80            | [PR #75](https://github.com/Lightning1507/CoLearnia/pull/75) có bootstrap/readiness được kiểm với DB test.                                                                                             | **BLOCKED**. Đối chiếu startup, schema/index và quyền trên current/target staging.                                                                                  | M4, M1, operator                    |
| SCRUM-88                      | [PR #128 và evidence local](2026-11-18-scrum-88-main-auth-media.md) có auth/ACL MongoDB, signaling Socket.IO và native transports. Entry point tại baseline chưa nối registry/router MAIN vào app.     | **BLOCKED**. Cần build có browser join/SEND/RECV và xác nhận phạm vi lỗi thu hồi phiên cũ theo [issue #130](https://github.com/Lightning1507/CoLearnia/issues/130). | M1/M3/M4                            |
| SCRUM-93                      | Chưa xác minh được Jira, SHA/bản build hay nhánh trùng mã trên origin.                                                                                                                                 | **BLOCKED**. Cần đầu ra tích hợp và bản build chứa luồng app đủ cho người thử.                                                                                      | PM xác nhận đầu mối SCRUM-93, M3/M4 |

### NET-01–04 và TURN-01–04

NET-01 **BLOCKED** cho cả A/B. Trên đường thử công khai, DNS PASS và HTTPS FAIL. Mạng A/B chính thức đều **NOT TESTED**. Login, workspace, WebSocket authenticated, MAIN join và truyền mic/camera/share hai chiều đều **NOT TESTED**. NET-02–04 và TURN-01–04 **BLOCKED** vì thiếu build staging được xác nhận, hai client độc lập, tài khoản được cấp quyền và cấu hình relay-only của phiên thử.

| Client | Transport | TURN TLS 443 | TURN UDP 3478 | ICE/DTLS, selected pair và local type | RTP bytes/packets và nghe/nhìn |
| ------ | --------- | ------------ | ------------- | ------------------------------------- | ------------------------------ |
| A      | SEND      | NOT TESTED   | NOT TESTED    | Chưa đo                               | Chưa đo hoặc xác nhận          |
| A      | RECV      | NOT TESTED   | NOT TESTED    | Chưa đo                               | Chưa đo hoặc xác nhận          |
| B      | SEND      | NOT TESTED   | NOT TESTED    | Chưa đo                               | Chưa đo hoặc xác nhận          |
| B      | RECV      | NOT TESTED   | NOT TESTED    | Chưa đo                               | Chưa đo hoặc xác nhận          |

### RB-01–04 và DATA-01

RB-01 **BLOCKED**. Chưa có commit và image digest server/web của current, target và recovery, chứng cứ compatibility API/auth/socket/schema/index/storage, trạng thái call/recording/upload, drain, cửa sổ thực hiện hoặc lệnh và approval từ operator. RB-02/RB-04 **BLOCKED**. Thực thi rollback và recovery **NOT TESTED**, release cuối phiên chưa xác minh.

| Pha RB-03      | Mạng | UTC, commit và image digest server/web | HTTPS          | Readiness nội bộ | Auth, workspace, signaling, MAIN | Kết quả |
| -------------- | ---- | -------------------------------------- | -------------- | ---------------- | -------------------------------- | ------- |
| Trước rollback | A    | Chưa đo                                | Chưa đo trên A | Chưa nhận        | Chưa chạy                        | BLOCKED |
| Trước rollback | B    | Chưa đo                                | Chưa đo trên B | Chưa nhận        | Chưa chạy                        | BLOCKED |
| Sau rollback   | A    | Chưa đo                                | Chưa đo trên A | Chưa nhận        | Chưa chạy                        | BLOCKED |
| Sau rollback   | B    | Chưa đo                                | Chưa đo trên B | Chưa nhận        | Chưa chạy                        | BLOCKED |

DATA-01 **BLOCKED**. Identity MongoDB, volume/mount, canary hợp lệ và checksum trước/sau đều **NOT TESTED**. Chưa có bằng chứng kiểm object/recording storage, tải kết hợp hoặc queue/pool/gate/quota của staging. Operator cùng M1/M2/M3/M4 cần chốt baseline và compatibility trước khi xin phê duyệt đổi release. M5 điều phối hai người thử rồi bàn giao kết quả cho M3 review.

### Kiểm local của lượt đo bổ sung

`pnpm install --frozen-lockfile` và `pnpm doctor` exit 0. Doctor báo Docker Engine không chạy hoặc không truy cập được. `pnpm exec node --test scripts/scrum81/diagnostics.test.mjs` **PASS** 13/13, `pnpm exec eslint scripts/scrum81 --max-warnings=0` **PASS**, `pnpm media:smoke` **PASS** worker và Router Opus/VP8. Đây là kiểm local của cùng baseline code. Kết quả mạng, TURN và rollback được ghi riêng ở trên.

`pnpm check` **PASS** với 54 ca harness đạt, 1 ca symlink được bỏ qua trên Windows, 140 kiểm tra nguồn/link/runtime, format, lint, typecheck, 994 unit test trong 73 file và build. Đã kiểm tám liên kết nội bộ dẫn tới file và đủ bốn dòng riêng ở mỗi ma trận TURN/RB-03. DB integration và browser staging chưa chạy trong lượt đo bổ sung.
