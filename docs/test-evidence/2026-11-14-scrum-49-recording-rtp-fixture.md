# SCRUM-49 — Nguồn RTP/RTCP cố định cho recorder

Fixture tạo hai nguồn 4 giây trên loopback. Video dùng mẫu 320 × 240 ở 25 fps, VP8, ingress PT 96 và SSRC 111111. Audio dùng tone 440 Hz, Opus stereo ở 48 kHz, ingress PT 111 và SSRC 222222. Mỗi track đi vào một PlainTransport của mediasoup và ra qua một Consumer riêng. RTP và RTCP dùng hai cổng UDP riêng cho mỗi track.

Chạy từ thư mục gốc trong PowerShell với Docker Linux containers.

```powershell
docker run --rm --cpus 2 --memory 512m --mount "type=bind,source=$($PWD.Path)/apps/server/scripts/spike-recording-rtp.mjs,target=/fixture.mjs,readonly" node:26.12.1-bookworm-slim sh -ec '
  mkdir /tmp/fixture
  cd /tmp/fixture
  npm install --no-audit --no-fund --save-exact mediasoup@3.31.0
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends ffmpeg
  cp /fixture.mjs .
  timeout 40s node fixture.mjs
'
```

Không truyền tham số thì fixture tự bind các cổng nhận và kiểm RTP theo PT/SSRC trong descriptor của Consumer, cùng RTCP Sender Report của mỗi track. Các cổng, SSRC và PT đầu ra lấy từ descriptor thực tế của lần chạy. [mediasoup PlainTransport và RTP parameters](https://mediasoup.org/documentation/v3/communication-between-client-and-server/)

Lượt đo trên Docker Linux x64, Node 26.12.1 và mediasoup 3.31.0 dùng binary FFmpeg từ `@ffmpeg-installer/linux-x64@4.1.0` trong container tạm khi apt còn tải dependency. Phiên bản FFmpeg báo `N-47683-g0e8eb07980-static`. Video nhận 120 gói RTP và 3 RTCP Sender Report. Audio nhận 201 gói RTP và 4 RTCP Sender Report. Cả hai track có 0 gói RTP sai PT hoặc SSRC. Lượt chạy với bốn cổng do caller chỉ định (41000–41003) cũng xuất đúng descriptor và trả `sources-completed` sau lệnh `start`. Lượt thứ hai kiểm giao thức điều khiển và việc phát nguồn. Việc nhận và ghi qua recorder thuộc SCRUM-50.

Để nối SCRUM-50, chạy script trong cùng network namespace với recorder, truyền bốn cổng nhận theo thứ tự video RTP, video RTCP, audio RTP, audio RTCP. Đọc dòng JSONL `descriptor` để cấu hình recorder từ `tracks[].rtpParameters`, bind bốn cổng rồi gửi `start\n` vào stdin. Chế độ này trả `sources-completed` khi FFmpeg phát xong. Recorder chịu trách nhiệm đo dữ liệu nhận, stop/EOS, mux và kiểm tệp. Fixture chỉ dùng loopback và không mở route sản phẩm.
