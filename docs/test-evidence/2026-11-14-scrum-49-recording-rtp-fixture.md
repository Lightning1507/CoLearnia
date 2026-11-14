# SCRUM-49 — Nguồn RTP/RTCP cố định cho recorder

Fixture phát đồng thời ba nguồn cố định trong 4 giây trên loopback. Mỗi nguồn có PlainTransport, Consumer, descriptor và cặp cổng UDP RTP/RTCP riêng.

| Nguồn    | Mẫu tham chiếu                                | Codec | PT / SSRC ingress |
| -------- | --------------------------------------------- | ----- | ----------------- |
| `screen` | Mẫu chuyển động `testsrc2`, 320 × 240, 25 fps | VP8   | 96 / 111111       |
| `camera` | Sọc màu SMPTE, 160 × 120, 25 fps              | VP8   | 97 / 333333       |
| `mic`    | Tone 440 Hz, stereo 48 kHz                    | Opus  | 111 / 222222      |

Chạy từ thư mục gốc trong PowerShell với Docker Linux x64.

```powershell
docker run --rm --cpus 2 --memory 512m --mount "type=bind,source=$($PWD.Path)/apps/server/scripts/spike-recording-rtp.mjs,target=/fixture.mjs,readonly" node:26.12.1-bookworm-slim sh -ec '
  mkdir /tmp/fixture
  cd /tmp/fixture
  npm install --no-audit --no-fund --save-exact mediasoup@3.31.0 @ffmpeg-installer/linux-x64@4.1.0
  export PATH="/tmp/fixture/node_modules/@ffmpeg-installer/linux-x64:$PATH"
  cp /fixture.mjs .
  timeout 40s node fixture.mjs
'
```

Không truyền tham số thì fixture tự bind các cổng nhận và kiểm RTP theo PT/SSRC trong descriptor của Consumer, cùng RTCP Sender Report của mỗi track. Các cổng, SSRC và PT đầu ra lấy từ descriptor thực tế của lần chạy. [mediasoup PlainTransport và RTP parameters](https://mediasoup.org/documentation/v3/communication-between-client-and-server/)

Lượt đo trên Docker Linux x64 (2 CPU, 512 MiB), Node 26.12.1, mediasoup 3.31.0 và FFmpeg từ `@ffmpeg-installer/linux-x64@4.1.0`:

| Nguồn    | Gói RTP | RTCP Sender Report | RTP sai PT/SSRC |
| -------- | ------: | -----------------: | --------------: |
| `screen` |     120 |                  3 |               0 |
| `camera` |     100 |                  4 |               0 |
| `mic`    |     201 |                  3 |               0 |

Cả ba descriptor có cặp cổng riêng. Hai video dùng cùng PT VP8 đầu ra của Router. Recorder phân biệt bằng `source`, cổng và SSRC từ descriptor. `pnpm media:smoke` cũng khởi động được worker và Router với Opus/VP8.

Lượt chạy với cổng do caller chỉ định xác nhận descriptor ánh xạ đúng `screen` 41000/41001, `camera` 41002/41003 và `mic` 41004/41005. Fixture trả `sources-completed` sau khi gửi `start` vào stdin.

Để nối SCRUM-50, chạy fixture cùng network namespace với recorder. Truyền sáu cổng nhận theo thứ tự screen RTP/RTCP, camera RTP/RTCP, mic RTP/RTCP. Đọc JSONL `descriptor`, cấu hình từ `tracks[].rtpParameters`, bind đủ sáu cổng rồi gửi `start\n` vào stdin. Recorder kiểm nhận và giải mã ba nguồn, ghép hình, stop/EOS, mux và phát/tua tệp cuối ở SCRUM-50.
