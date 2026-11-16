# SCRUM-50 — Ghi và hoàn tất tệp từ nguồn cố định

Recorder dùng fixture SCRUM-49 đã có trong repo. Fixture cấp descriptor cho ba nguồn `screen`, `camera`, `mic`. GStreamer bind sáu cổng loopback, cấu hình RTP theo PT, SSRC và clock rate của từng Consumer, rồi mới gửi `start`. Ba phiên RTP/RTCP đi qua `rtpbin`. Recorder ghép mẫu màn hình 320 × 240 và sọc màu camera 160 × 120 thành video 480 × 240, rồi mux VP8 và tiếng mic Opus 48 kHz vào WebM. [Fixture SCRUM-49](../../apps/server/scripts/spike-recording-rtp.mjs)

## Chạy lại

Chạy từ thư mục gốc trong PowerShell với Docker Linux x64. Khi chạy mặc định, script tự dọn tệp thử. Để giữ tệp và mở bằng Chrome, mount một thư mục đầu ra và truyền `--output-dir` với tên thư mục con mới.

```powershell
$root = $PWD.Path
docker run --rm --cpus 2 --memory 512m --mount "type=bind,source=$root/scripts/spike-recording-finalize.py,target=/spike.py,readonly" --mount "type=bind,source=$root/apps/server/scripts/spike-recording-rtp.mjs,target=/rtp.mjs,readonly" node:26.12.1-bookworm-slim sh -ec '
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends python3-gi gir1.2-gstreamer-1.0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good ffmpeg >/tmp/apt.log
  mkdir -p /opt/fixture
  cd /opt/fixture
  npm install --no-audit --no-fund --save-exact mediasoup@3.31.0
  cp /rtp.mjs .
  timeout 40s python3 /spike.py
  for run in 1 2 3; do
    timeout 40s python3 /spike.py --rtp-fixture /opt/fixture/rtp.mjs
  done
'
```

## Kết quả với fixture RTP/RTCP

Docker Linux x64, 2 CPU, 512 MiB, GStreamer 1.22.0, mediasoup 3.31.0 và FFmpeg 5.1.9. Ba lượt đều nhận buffer giải mã của cả ba nguồn, gửi Stop sau khoảng 3 giây và nhận EOS.

| Lượt | Buffer screen / camera / mic | Stop (s) | EOS sau Stop (ms) | Remux (ms) | Tệp cuối (byte) | Thời lượng / điểm tua gần cuối (s) |
| ---- | ---------------------------: | -------: | ----------------: | ---------: | --------------: | ---------------------------------- |
| 1    |                79 / 79 / 157 |    3,280 |             12,91 |     165,07 |         136.150 | 3,299 / 2,999                      |
| 2    |                79 / 79 / 157 |    3,240 |              2,43 |     165,04 |         134.658 | 3,250 / 2,950                      |
| 3    |                78 / 78 / 156 |    3,240 |              3,94 |     114,70 |         134.631 | 3,271 / 2,971                      |

FFmpeg seek ở 1 giây và cách cuối 300 ms, giải mã 5 frame mỗi điểm, kiểm vùng màu riêng của screen/camera và xác nhận PCM có tần số gần 440 Hz. Ở gần cuối, mỗi lượt đọc được ít nhất 200 ms PCM. Thời lượng tệp khớp vị trí Stop trong sai số dưới 35 ms.

WebM trực tiếp từ GStreamer vẫn báo `File is broken, keyframes not correctly marked!`. Sau khi EOS đóng writer, script dùng FFmpeg `-c copy` để đóng gói lại hai track. Cả ba WebM cuối đều seek và decode thành công với `seekWarnings: []`. Kết luận áp dụng cho clip đầu ra đã remux của PoC.

Chrome 157.0.8103.51 trên Windows mở tệp cuối lượt 1 từ HTTP loopback, phát đến khi có frame rồi tua đến 1,000 và 2,999 giây. Cả hai lần đều nhận `seeked`, giữ kích thước 480 × 240 và có hình màu ở cả hai vùng. Số pixel màu screen/camera lần lượt là 74.870 / 13.474 và 74.510 / 13.444. PCM và tone mic được xác minh riêng bằng FFmpeg.

## Baseline nguồn GStreamer nội bộ

Giữ chế độ không truyền `--rtp-fixture` để kiểm encoder, EOS và muxer với mẫu bóng 320 × 240 và tone 440 Hz. Ba lượt baseline ban đầu dài 4,04 giây, tệp 67.455–67.623 byte và EOS mất 1,20–1,66 ms. Lượt chạy lại khi tích hợp cho 67.623 byte, EOS 1,83 ms và đọc được 5 frame cùng 200 ms PCM ở 1,000 và 3,740 giây. Baseline vẫn tái hiện cảnh báo keyframe trên tệp trực tiếp từ GStreamer.

PoC xác nhận ghép ba nguồn cố định, Stop/EOS và phát/tua tệp WebM ngắn. Cần kiểm drift, tải và thời gian finalize trên clip dài trước khi chọn cấu hình cho sản phẩm. Profile MP4 và bàn giao sink M2 nằm ở các bước tích hợp sau. [Kế hoạch PoC M3](../proposals/m3-media.md)
