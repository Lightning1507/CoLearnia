# SCRUM-48 — Thử runtime ghi hình trên Linux

Phép thử dùng base image `node:26.12.1-bookworm-slim` của server và cài Python/PyGObject/GStreamer trong container tạm. Container giới hạn 2 CPU và 512 MiB RAM. Script in inventory và sự kiện dạng JSONL để M3 xem trực tiếp.

## Chạy lại

Từ thư mục gốc repository, chạy trong PowerShell khi Docker đang dùng Linux containers.

```powershell
docker run --rm --cpus 2 --memory 512m --mount "type=bind,source=$($PWD.Path)/scripts/spike-recording-runtime.py,target=/spike.py,readonly" node:26.12.1-bookworm-slim sh -ec '
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends python3-gi gir1.2-gstreamer-1.0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-ugly gstreamer1.0-libav >/tmp/apt.log || { tail -50 /tmp/apt.log; exit 1; }
  node --version
  for scenario in inventory eos error timeout; do
    status=0
    timeout 10s python3 /spike.py "$scenario" || status=$?
    echo "$scenario exit=$status"
    case "$scenario:$status" in inventory:0|eos:0|error:1|timeout:2) ;; *) exit 1;; esac
  done
'
```

## Kết quả ngày 11/11/2026

Debian 12 Bookworm x86_64, Node 26.12.1, Python 3.11.2, PyGObject 3.42.2, GLib 2.74.4 và GStreamer 1.22.0. Tất cả element trong inventory được tìm thấy với plugin phiên bản 1.22.0.

| Nhóm               | Element phát hiện được                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Nguồn và sink      | `videotestsrc`, `fakesink`, `filesrc`, `filesink`                                               |
| UDP và RTP/RTCP    | `udpsrc`, `udpsink`, `rtpbin`, `rtpjitterbuffer`, `rtpvp8depay`, `rtph264depay`, `rtpopusdepay` |
| Giải mã và trộn    | `vp8dec`, `avdec_h264`, `opusdec`, `compositor`, `audiomixer`                                   |
| Mã hóa và đóng gói | `vp8enc`, `opusenc`, `webmmux`, `x264enc`, `mp4mux`                                             |

| Ca                       | Sự kiện quan sát được                                    | Mã thoát |
| ------------------------ | -------------------------------------------------------- | -------: |
| 10 buffer video tổng hợp | `ready` ở 8 ms, `eos` ở 308 ms                           |        0 |
| Đầu vào không mở được    | `error` với `reason=pipeline` ở 4 ms                     |        1 |
| Nguồn chạy liên tục      | `ready` ở 7 ms, `error` với `reason=deadline` ở 1.001 ms |        2 |

Thời gian tính từ lúc helper bắt đầu dựng pipeline, lấy từ một lần chạy. `pnpm media:smoke` cũng đạt trên máy phát triển Windows khi khởi động native mediasoup worker và Router Opus/VP8.

## Phạm vi và bàn giao

`ready` trong helper nghĩa là pipeline thử đã vào `PLAYING`. Helper lấy sự kiện từ bus GStreamer và trả pipeline về `NULL` khi thoát. Thời hạn trong helper giới hạn thời gian chờ bus. Lệnh `timeout 10s` đặt thêm giới hạn cho mỗi tiến trình thử. [GStreamer Bus](https://gstreamer.freedesktop.org/documentation/application-development/basics/bus.html)

SCRUM-49 dùng kết quả inventory để chọn descriptor, cổng và nguồn RTP/RTCP cố định từ mediasoup. SCRUM-50 kiểm ghi, dừng và hoàn tất tệp thật. Các ca SCRUM-48 dùng nguồn tổng hợp và `fakesink`. Trạng thái video `READY`, A/V sync, tải kết hợp, encoder/container sản phẩm và triển khai staging nằm ngoài phạm vi phép thử này. [Kế hoạch PoC M3](../proposals/m3-media.md)
