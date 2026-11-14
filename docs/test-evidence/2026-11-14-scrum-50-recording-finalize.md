# SCRUM-50 — Ghi và hoàn tất tệp từ nguồn cố định

PoC dùng nguồn video 320 × 240 ở 25 fps và nguồn âm thanh 440 Hz ở 48 kHz của GStreamer. Pipeline ghi VP8 và Opus vào WebM trong thư mục tạm. Sau khoảng bốn giây, script gửi EOS, chờ pipeline báo hoàn tất rồi đóng writer. FFprobe đọc thông tin tệp và FFmpeg seek, giải mã từng track ở giây thứ nhất và cách cuối tệp 300 ms. Script yêu cầu ít nhất ba frame video và 150 ms PCM biến thiên tại mỗi điểm, đồng thời đối chiếu thời lượng tệp với vị trí lúc Stop trong sai số 250 ms.

## Chạy lại

Chạy từ thư mục gốc trong PowerShell với Docker Linux containers. Container giới hạn 2 CPU và 512 MiB RAM, tệp thử tự dọn sau khi kiểm.

```powershell
docker run --rm --cpus 2 --memory 512m --mount "type=bind,source=$($PWD.Path)/scripts/spike-recording-finalize.py,target=/spike.py,readonly" node:26.12.1-bookworm-slim sh -ec 'apt-get update -qq; apt-get install -y -qq --no-install-recommends python3-gi gir1.2-gstreamer-1.0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good ffmpeg >/tmp/apt.log; ffprobe -version | head -1; for run in 1 2 3; do timeout 40s python3 /spike.py; done'
```

## Kết quả

Ba lượt Docker Linux x64 với GStreamer 1.22.0 và FFmpeg 5.1.9 đều hoàn tất EOS và giải mã được hai track. Tệp WebM dài 4,04 giây, dung lượng 67.455–67.623 byte. Pipeline báo vị trí Stop khoảng 4,046 giây và EOS đến sau 1,20–1,66 ms. Tại cả 1,000 giây và 3,740 giây, FFmpeg giải mã 5 frame video và 200 ms PCM có tín hiệu.

FFmpeg báo `File is broken, keyframes not correctly marked!` trong phép seek. Lệnh vẫn thoát mã 0 và trả đủ dữ liệu ở hai điểm thử. Cảnh báo còn mở, cần kiểm lại đánh dấu keyframe/cue của WebM và phát/tua trong trình duyệt trước khi dùng cấu hình này cho bước tích hợp.

`pnpm check` đạt với 812 test Vitest. `pnpm media:smoke` đạt khi khởi động worker và Router Opus/VP8 trên máy phát triển.

## Phạm vi kiểm chứng

Lượt rà soát lại đã fetch toàn bộ nhánh trên `origin` và tìm `createPlainTransport` cùng mã SCRUM-49 trong `apps/` và `scripts/` trên các nhánh đã fetch. Danh sách PR cũng chưa cho thấy PR bàn giao fixture SCRUM-49. Để chạy lại cần nhánh, PR hoặc commit chứa fixture, cùng descriptor RTP/RTCP và lệnh chạy nếu các thông tin đó nằm ngoài repo.

Jira đánh dấu SCRUM-49 Done, nhưng fixture mediasoup RTP/RTCP và descriptor chưa tìm thấy trên `origin/main`, các nhánh remote liên quan hoặc trong ticket khi chạy thử. Kết quả ở đây dùng nguồn GStreamer nội bộ để kiểm encoder, EOS, muxer và tệp. Khi có fixture SCRUM-49, cần thay đầu vào bằng RTP/RTCP và chạy lại kiểm chứng trước khi kết luận về đường mediasoup. Các số đo clip ngắn không đủ để đánh giá drift giữa nguồn độc lập hoặc thời hạn finalize khi ghi lâu. [SCRUM-49](https://faker1652005.atlassian.net/browse/SCRUM-49) · [Kế hoạch PoC M3](../proposals/m3-media.md)
