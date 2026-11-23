# SCRUM-53 — Tổng hợp PoC ghi hình và bước tiếp

Ngày tổng hợp 19/11/2026, nguồn trên main `6581585`. M3-T9.4 có timebox báo cáo 2 giờ, phụ thuộc M3-T9.3/SCRUM-50 và M2-T9.1/SCRUM-51, reviewer M3. Báo cáo tổng hợp số đo đã lưu trong repo và đối chiếu script, chưa chạy lại media trong lượt này. Giờ thực dùng của các PoC trước chưa có timesheet trong evidence, nên không suy ra từ timebox hoặc thời lượng clip. [WBS M3](../proposals/m3-media.md#91-task-con-và-ngân-sách-dự-kiến) · [Phân công Sprint 1](../planning/sprint-1.md)

## Kết luận và cấu hình đề xuất

Tiếp tục hướng mediasoup PlainTransport → GStreamer → artifact tạm seekable do M2 cấp → remux/verify → bàn giao M2. Các thử nghiệm đã tạo clip có screen/camera/mic và kiểm được writer, seek, EOS, lỗi disk, hủy và retry tuần tự ở filesystem local. Trước nguồn động và tích hợp sản phẩm, cần sửa cách xác định mốc cắt input, đo queue/byte in-flight và kiểm profile MP4 mục tiêu. [SCRUM-50](2026-11-14-scrum-50-recording-finalize.md) · [SCRUM-51](2026-11-16-scrum-51-recording-sink.md)

| Thành phần        | Cấu hình đã thử                                                                                                                                    | Đề xuất cho vòng tiếp theo                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Debian 12 Linux x64 trong Docker, 2 CPU/512 MiB, Node 26.12.1, mediasoup 3.31.0, Python 3.11.2, GStreamer 1.22.0, FFmpeg 5.1.9                     | Giữ môi trường này làm baseline tái lập. Ghi đầy đủ image/plugin/version khi đổi profile. Giới hạn container là điều kiện thử, chưa là budget đạt.                    |
| Đầu vào           | Fixture ba nguồn screen/camera/mic cố định, sáu cổng RTP/RTCP loopback, PT/SSRC/clock rate từ Consumer descriptor, `rtpbin` latency 100 ms         | Giữ fixture để hồi quy. Bổ sung mốc thời gian chung và sau đó kiểm nguồn động cùng quyền MAIN thật.                                                                   |
| Hình/tiếng        | Screen 320×240 + camera 160×120 thành khung 480×240/25 fps, VP8 với keyframe tối đa 25 frame, Opus mono 48 kHz, tone mic 440 Hz                    | Dùng WebM/VP8/Opus để so sánh hồi quy. Kiểm riêng H.264/AAC MP4 720p/15 fps theo profile sản phẩm đã ghi ở nguồn recording.                                           |
| Writer/finalize   | `filesink` seekable trong thư mục attempt do M2 cấp, đóng pipeline sau EOS, FFmpeg `-c copy`, fsync tệp staging, verify rồi rename cùng filesystem | Giữ artifact tạm có giới hạn để thử, M2 sở hữu budget/cleanup. Kiểm disk budget cả tệp raw và staging, deadline drain/remux/verify và đối soát receipt trước cleanup. |
| Admission/lưu trữ | PoC filesystem local, chạy tuần tự, thiết kế một slot toàn app process bao gồm finalize/transfer/verify/cleanup                                    | Giữ một app process/mediasoup worker, Mongo Docker. M2 kiểm quota/reservation và private R2 trước READY. Đo slot thực với tải kết hợp.                                |

MP4/H.264/AAC, 720p/15 fps, giới hạn 3 tiếng/đoạn và READY giữ vô thời hạn tiếp tục theo [nguồn recording](../product/recording.md). Plugin `x264enc`/`mp4mux` đã xuất hiện trong inventory SCRUM-48, còn phép ghi/seek MP4 thực tế vẫn cần thử. Việc dùng WebM trong fixture cung cấp baseline hồi quy cho hướng đã chọn. [Inventory SCRUM-48](2026-11-11-scrum-48-recording-runtime.md)

## Số đo và độ đồng bộ

### Clip từ fixture RTP — SCRUM-50

Ba lượt cùng nhận buffer giải mã của screen/camera/mic và EOS. Remux xử lý cảnh báo keyframe của WebM trực tiếp từ GStreamer. Các tệp cuối có `seekWarnings: []` khi kiểm bằng FFmpeg. Chrome kiểm phát/tua tệp cuối lượt 1 tại 1,000 và 2,999 giây. [Bằng chứng và lệnh chạy lại](2026-11-14-scrum-50-recording-finalize.md)

| Lượt | Buffer screen/camera/mic | Vị trí Stop (s) | Stop → EOS (ms) | Remux (ms) | Tệp cuối (byte) | Duration (s) |
| ---- | ------------------------ | --------------: | --------------: | ---------: | --------------: | -----------: |
| 1    | 79/79/157                |           3,280 |           12,91 |     165,07 |         136.150 |        3,299 |
| 2    | 79/79/157                |           3,240 |            2,43 |     165,04 |         134.658 |        3,250 |
| 3    | 78/78/156                |           3,240 |            3,94 |     114,70 |         134.631 |        3,271 |

Duration so với vị trí Stop lệch dưới 35 ms trong ba clip này. FFmpeg giải mã hình hai vùng và mic gần 440 Hz tại giây 1 và cách cuối 300 ms. Đây là kiểm phần đuôi và nội dung các track tại điểm tua. Tone liên tục và số buffer chưa đo được độ lệch tiếng–hình hoặc drift giữa các nguồn. Cần fixture có dấu hình/âm chung timestamp, báo offset/drift theo thời gian và kiểm sau đổi nguồn, mất gói, tải ghi chậm. [Script kiểm SCRUM-50](../../scripts/spike-recording-finalize.py)

### Sink và writer chậm — SCRUM-51

Chèn trễ đồng bộ ở pad đầu vào writer. Thời gian chờ là tổng ở đoạn chèn trễ, gồm overhead đo. RSS lấy mẫu 20 ms ở tiến trình Python/GStreamer, có bộ nhớ giữ lại giữa các ca, không gồm mediasoup/Node/FFmpeg con. Các số dưới đây thuộc lượt cuối của bốn ca ban đầu. [Bằng chứng SCRUM-51](2026-11-16-scrum-51-recording-sink.md)

| Ca                    | Chờ writer (ms) | RSS đầu → đỉnh (MiB) | Stop → EOS (ms) | Kết quả                                          |
| --------------------- | --------------: | -------------------: | --------------: | ------------------------------------------------ |
| Baseline              |             0,6 |          21,0 → 38,3 |             5,2 | 135.668 byte, sink finalize 802 ms, phát/tua đạt |
| 4 ms/buffer           |           2.129 |          37,6 → 45,8 |             119 | 134.690 byte, sink finalize 797 ms, phát/tua đạt |
| 12 ms/buffer          |           6.227 |          45,5 → 56,8 |           3.665 | EOS về, kiểm duration từ chối công bố            |
| Disk-full khi capture |             0,3 |          51,9 → 58,9 |               — | Bus báo hết dung lượng, 65.536 byte dở đã dọn    |

Thời gian sink finalize gồm remux, fsync, inspect và rename, khác phạm vi cột remux của SCRUM-50. Ở ca 12 ms, vị trí muxer khi Stop là 1,680 s nhưng tệp sau drain/remux dài 3,287 s, lượt bổ sung ghi 3,320 s và tiếp tục bị chặn. Kết quả chỉ ra vị trí muxer đang trễ theo backlog. Ngưỡng kiểm duration 250 ms của fixture cần được đối chiếu với mốc cắt input độc lập trước khi dùng trong pipeline tích hợp. [Script sink](../../scripts/spike-recording-sink.py)

Hai lượt bổ sung đã chạy đủ sáu ca. Ca hủy sau ít nhất 16 KiB để lại 17.007 byte, pipeline về NULL và fixture được thu hồi trước cleanup, không có staging/tệp công bố. Ca finalize lặp làm rơi phản hồi sau rename rồi retry tuần tự, trả cùng receipt local, giữ inode/mtime, một artifact 133.575–135.864 byte và không tạo staging lần hai. Receipt local chưa chứng minh transaction READY, restart hoặc mất ACK của DB/storage. [Bằng chứng bổ sung SCRUM-51](2026-11-16-scrum-51-recording-sink.md#review-m2-m3-và-m1)

CPU thực dùng, queue depth/byte in-flight, disk IOPS, network, tổng RSS cây tiến trình, drift dài hạn và tải gọi/share/chat/nhóm/TURN đồng thời chưa có số đo trong các evidence này. Giới hạn 2 CPU/512 MiB của Docker chưa cung cấp các số đó. Các clip khoảng 3 giây cũng chưa kiểm đủ 3 tiếng hoặc capacity 5/25/50 người. [Capacity](../capacity.md)

## Rủi ro và điều kiện thử tiếp

| Vấn đề                                         | Bước kiểm tiếp và điều kiện bàn giao                                                                                                                                                                                       | Đầu mối                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Stop theo tiến độ muxer bị trễ khi writer chậm | Ghi mốc cắt input và frame/sample cuối trên cùng timeline, xác nhận nguồn đã bị thu trước ack input-stopped. Chạy lại mức 0/4/12 ms, báo duration so với mốc này và kết quả drain/deadline.                                | M3 phối hợp M4, M2 review writer                         |
| Chưa đo độ đồng bộ và profile mục tiêu         | Kiểm marker hình/âm có timestamp, offset/drift tại đầu/giữa/cuối clip 1/5/15 phút. Thử MP4 H.264/AAC 720p/15 fps, playback/seek và đuôi tệp sau remux. M3/M2 review ngưỡng chấp nhận trước lượt thử.                       | M3, M2 review playback                                   |
| Chưa có budget queue/disk/CPU toàn pipeline    | Ghi queue buffers/bytes/time, tổng RSS/process CPU, disk/network và byte raw+staging. Thử chậm/hết disk, hết deadline, hủy và slot còn giữ trong verify/cleanup. Chọn giới hạn hữu hạn sau số đo và review trước tích hợp. | M3 đo helper, M2 quota/sink, phối hợp M1/M4 cho tải ghép |
| Nguồn động và quyền MAIN                       | Kiểm thêm/bớt camera/mic/share, rời MAIN, host hỗ trợ nhóm và đổi host, callback cũ. Nguồn nhóm riêng bị thu thật trước ghi tiếp, đổi host giữ đúng attempt.                                                               | M3/M4, M1 review quyền                                   |
| Storage/receipt còn thiếu port tích hợp        | M2 giữ AC ở SCRUM-51 tới khi có xác nhận nơi nhận. Kiểm finalize đồng thời, disk-full khi finalize, mất ACK/restart, quota, deny khi transfer và call ENDED theo contract, giữ locator khi kết quả pending.                | M2, phối hợp M1/M3/M4                                    |

Các ca storage trên tiếp tục thuộc SCRUM-51 theo bàn giao PR #121. SCRUM-53 tổng hợp kết quả và đề xuất thử tiếp, việc chốt task tiếp nhận cần xác nhận của các bên ở Jira/PR. Adapter R2 trên main có smoke riêng, bằng chứng đó chưa nối recorder tới commit READY hay kiểm ACL của video. [Contract bàn giao](../contracts/recording-sink.md#bàn-giao-review) · [Runbook R2](../runbooks/local-development.md#private-r2-scrum-52)

## Estimate điều chỉnh để M3 review

Đơn vị là giờ công chủ động, chưa có ngày cam kết. Baseline T9 là 16 giờ, trong đó T9.4 2 giờ tổng hợp, thời gian đã dùng thực tế còn cần người thực hiện đối chiếu. Baseline T11.1–T11.6 là 38 giờ (6+6+8+8+6+4). Đề xuất giữ hai spike nguồn động/readiness mỗi spike 6 giờ và bổ sung một vòng kiểm trước chúng, vì hiện thiếu mốc cắt input và profile MP4 thực đo. Các dòng lớn được chia thành phần tối đa 8 giờ trước khi nhận việc. [Baseline WBS và nguyên tắc timebox](../proposals/m3-media.md#91-task-con-và-ngân-sách-dự-kiến)

| Phần việc tiếp theo                     |    Baseline (h) | Đề xuất (h) | Phân rã/đầu ra cần review                                                    |
| --------------------------------------- | --------------: | ----------: | ---------------------------------------------------------------------------- |
| Mốc cắt input độc lập và hồi quy writer | Chưa tách riêng |           6 | Một timebox, đo lại Stop/EOS/duration ở 0/4/12 ms                            |
| Budget/telemetry queue và tài nguyên    | Chưa tách riêng |           4 | Một timebox, đo in-flight và tổng process tree, đề xuất deadline/quota       |
| Profile MP4 và fixture đo sync          | Chưa tách riêng |           6 | Một timebox 1/5/15 phút, marker sync, playback/seek hoặc blocker tái hiện    |
| T11.1 nguồn động/bố cục                 |               6 |           6 | Giữ timebox, chỉ bắt đầu sau vòng kiểm trên đạt hoặc M3 chốt xử lý blocker   |
| T11.2 readiness/keyframe/mất dữ liệu    |               6 |           6 | Giữ timebox, continuity, sync, kết quả khi mất nguồn                         |
| T11.3 tích hợp quyền nguồn/writer       |               8 |          16 | 8 h selector/thu nguồn MAIN, 8 h tích hợp bàn giao M2, đối soát receipt      |
| T11.4 Stop/end/cancel/error             |               8 |          12 | 6 h thứ tự input-stopped/EOS/finalize, 6 h race/callback muộn/cleanup        |
| T11.5 lỗi handoff storage               |               6 |          12 | 6 h fixture mất ACK/unknown result, 6 h đồng thời/deny/byte còn cần đối soát |
| T11.6 deadline 3 tiếng/admission        |               4 |           4 | Giữ budget fake-clock và một slot gồm cleanup, soak thực theo T15.4          |
| Tổng phạm vi trên                       |              38 |          72 | Tăng 34 h, gồm vòng kiểm mới 16 h và tăng tích hợp/lifecycle/fault 18 h      |

72 giờ là ngân sách đề xuất cho phần thử/tích hợp tiếp theo của M3, gồm phối hợp tại interface. Estimate giả định port M2/M4 và môi trường thử sẵn sàng trước bước tích hợp, chờ phụ thuộc chưa có số giờ để cộng. Repository/schema/quota/transaction/R2/REST của M2 và policy/runtime của M4 vẫn do từng miền estimate, tránh cộng lại AC SCRUM-51 vào cả hai bên. T15.4 vẫn có một lượt soak 3 tiếng trong budget 4 giờ của baseline, chỉ chạy sau gate nguồn/quyền/storage, clip 1/5/15 phút ở vòng profile không thay lượt soak đó.

Nếu giữ nguyên mọi phần còn lại, đề xuất này đưa mốc M3 từ 312 giờ task + 72 giờ buffer = 384 giờ lên 346 + 72 = 418 giờ. Đây là kịch bản để review, chưa thay tổng WBS được chốt. Buffer giữ nguyên trong phép tính, phần tăng 34 giờ cần review trước cam kết. M3 xác nhận effort và tiêu chí đo, M2/M4 xác nhận port/phụ thuộc, sau đó cập nhật task và tổng WBS tại nguồn. Hết từng timebox ghi failed/blocker cùng số đo, đánh giá lại effort còn lại trước lượt mới.

## Bàn giao reviewer

M3 review cấu hình thử tiếp, ngưỡng sync/duration, budget queue/deadline và đề xuất tăng 34 giờ. M2 xác nhận cách cấp artifact seekable và các AC storage còn ở SCRUM-51, M4 xác nhận mốc input-stopped/thu quyền MAIN. Jira giữ trạng thái, owner và quyết định nhận việc. Báo cáo này chưa có xác nhận review và chưa nghiệm thu RECORD-01 sản phẩm.

## Kiểm tra báo cáo ngày 19/11/2026

- `pnpm install --frozen-lockfile` exit 0, `pnpm exec node --version` xác nhận v26.12.1. `pnpm run doctor` thấy lockfile và Docker 29.9.3, `.env` chưa có trong checkout.
- `pnpm check` exit 0, gồm harness 54 pass/1 skip, format, lint, typecheck, 71 test files/973 test pass và build ba package.
- Đối chiếu số đo với evidence SCRUM-48/50/51 và code fixture. Các bảng giữ nguyên phạm vi đo của từng nguồn. Lượt SCRUM-53 tổng hợp tài liệu, chưa tạo số đo media mới hoặc chạy lại soak/R2.
