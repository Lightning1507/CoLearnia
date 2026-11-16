# SCRUM-51 — Thử bàn giao bản ghi M3 cho sink M2

PoC RECORD-01 dùng recorder và fixture RTP/RTCP của SCRUM-50. Sink M2 cấp thư mục riêng cho mỗi lượt. GStreamer `filesink` ghi WebM tạm trực tiếp vào đường dẫn seekable trong thư mục đó. Sau EOS và sau khi pipeline về `NULL`, M2 remux VP8/Opus bằng FFmpeg, `fsync` tệp staging, kiểm codec, thời lượng và phát/tua rồi mới rename sang tệp kết quả trong cùng filesystem. Mỗi lượt dọn thư mục sau khi đóng writer. [Contract SCRUM-37](../contracts/recording-sink.md) · [Bằng chứng đầu vào SCRUM-50](2026-11-14-scrum-50-recording-finalize.md)

## Chạy lại

Chạy từ root bằng PowerShell với Docker Linux x64. Lệnh dùng image đã có từ lần kiểm SCRUM-50. Nếu cần dựng lại môi trường, dùng base image và các package trong hướng dẫn SCRUM-50, cài mediasoup 3.31.0 tại `/opt/fixture`, rồi dùng tên image đó trong lệnh dưới đây. `timeout` giới hạn toàn bộ lượt thử ở 60 giây. Ca disk-full chỉ ghi vào tmpfs 64 KiB riêng.

```powershell
$root = $PWD.Path
docker run --rm --cpus 2 --memory 512m --tmpfs /full:size=64k `
  --mount "type=bind,source=$root/scripts,target=/spikes,readonly" `
  --mount "type=bind,source=$root/apps/server/scripts/spike-recording-rtp.mjs,target=/opt/fixture/rtp.mjs,readonly" `
  --env PYTHONDONTWRITEBYTECODE=1 --entrypoint timeout colearnia-scrum50-review `
  60s python3 /spikes/spike-recording-sink.py /opt/fixture/rtp.mjs --full-root /full
```

## Kết quả

Docker Linux x64, 2 CPU, 512 MiB. GStreamer 1.22.0, FFmpeg 5.1.9, Python 3.11.2 và Node 26.12.1. Hai lượt chạy bốn ca cho cùng kết quả kiểm chứng. Bảng ghi số đo lượt cuối. Độ trễ được chèn đồng bộ ở pad đầu vào của writer. Cột chờ là tổng thời gian ở đoạn chèn trễ trên các buffer, tính cả overhead đo. Số byte mà writer nhận có thể cao hơn kích thước tệp vì ghi đè, hoặc vì lỗi giữa lần ghi. RSS lấy mẫu mỗi 20 ms trong tiến trình Python/GStreamer, gồm lúc kiểm tệp và giữ bộ nhớ qua các ca. Phép đo RSS này không bao gồm tiến trình con.

| Ca           | Chờ writer (ms) | RSS đầu → đỉnh (MiB) | Stop → EOS (ms) | Tệp M2 / kết quả                                                        |
| ------------ | --------------: | -------------------: | --------------: | ----------------------------------------------------------------------- |
| Baseline     |             0,6 |          21,0 → 38,3 |             5,2 | 135.668 byte, finalize 802 ms                                           |
| 4 ms/buffer  |           2.129 |          37,6 → 45,8 |             119 | 134.690 byte, finalize 797 ms                                           |
| 12 ms/buffer |           6.227 |          45,5 → 56,8 |           3.665 | Từ chối công bố khi duration lệch vị trí Stop                           |
| Disk-full    |             0,3 |          51,9 → 58,9 |               — | Bus báo `No space left on the resource`, 65.536 byte dở, dọn thành công |

- Baseline và 4 ms xác nhận seek lùi của muxer theo byte segment và xác minh screen, camera cùng mic 440 Hz ở giây 1 và cách cuối 300 ms. Hai tệp đều có `seekWarnings: []`.
- Ở 12 ms, muxer trả vị trí 1,680 s lúc Stop, trong khi tệp sau khi drain và remux dài 3,287 s. EOS thành công nhưng vị trí đọc lúc Stop bị trễ theo pipeline. Ca này chưa xác định timestamp cắt input độc lập, nên sink từ chối công bố khi chênh quá 250 ms.
- Ở ca disk-full, lỗi phát sinh trong lúc capture, writer đóng và fixture kết thúc trước khi dọn tệp dở. Ca này không đi vào finalize.

## Review M2, M3 và M1

- M2 và M3 đối chiếu quyền sở hữu thư mục attempt, việc chuyển đường dẫn tạm qua helper, thứ tự input-stopped → EOS → writer đóng, và cách chuyển lỗi writer về M3. M1 review ranh giới lưu trữ và điều kiện công bố.
- Bước tiếp ở SCRUM-53 là lấy mốc cắt input độc lập với tiến độ muxer, đặt giới hạn byte in-flight và deadline drain, rồi lặp lại phép đo với clip dài và tải kết hợp trước khi chọn đích seekable cho sản phẩm.
- PoC dùng filesystem cục bộ. Reservation/quota, hủy lúc đang ghi, lỗi disk khi finalize, retry/receipt mất ACK, CAS và deny giữa transfer vẫn cần ca tích hợp theo SCRUM-37. Rename trong PoC không mô phỏng commit `READY` bền hoặc ngữ nghĩa phục hồi sau crash.
