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
- PR #121 là PoC từng phần của M2-T9.1. Sáu ca local cung cấp bằng chứng cho writer và finalize. SCRUM-51 vẫn mở ở các tiêu chí tích hợp liệt kê trong contract.
- Hai lượt Docker bổ sung với cùng cấu hình trên xử lý đủ sáu ca. Hủy sau khi writer nhận ít nhất 16 KiB để lại 17.007 byte tạm. Bus ghi nhận hủy trước EOS, GStreamer về `NULL` và tiến trình fixture RTP được thu hồi trước cleanup. Không có tệp staging hoặc tệp công bố, thư mục attempt đã dọn.
- Ca finalize lặp làm rơi phản hồi đầu tiên tại ranh giới caller sau rename. Retry tuần tự trong cùng thư mục attempt trả cùng receipt (attempt, 133.575–135.864 byte và SHA-256), giữ nguyên inode/mtime, chỉ có một artifact công bố và không tạo tệp staging lần hai. Fixture dựng lại receipt từ artifact cục bộ đã kiểm. Ca này chưa bao phủ đồng thời, crash/restart, mất ACK của DB hay adapter lưu trữ ngoài.
- Ở lượt bổ sung, ca 12 ms vẫn bị từ chối công bố (vị trí Stop 1,680 s, duration 3,320 s). SCRUM-53 nhận kết quả này để M2/M3 kiểm mốc cắt input, giới hạn byte in-flight và deadline drain. RSS clip ngắn chỉ ghi nhận để đối chiếu khi chạy tải dài hơn.
- M2 giữ phần tích hợp lưu trữ trong SCRUM-51 cho tới khi M1/M3/M4 xác nhận nơi tiếp nhận. Khi có port, kiểm reservation/quota, disk-full lúc finalize và mất ACK khi commit theo cùng attempt/operation, cả READY lẫn cleanup. M4/M3 phối hợp ca callback muộn, end-call và đổi host; M1/M2 phối hợp ca deny giữa transfer. Điều kiện đạt từng ca nằm trong [contract](../contracts/recording-sink.md#bàn-giao-review).

## Ma trận bàn giao kiểm thử

| Ca                                                      | Bằng chứng hiện có                                                                                  | Đầu mối và điều kiện kiểm tiếp                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline, writer 4/12 ms, disk-full trong capture       | Docker đã chạy cả bốn. Baseline và 4 ms phát/tua được, 12 ms bị chặn công bố, disk-full dọn tệp dở. | M2/M3 xác nhận cách cấp đường dẫn seekable, quyền sở hữu writer/temp và đường báo lỗi. SCRUM-53 đo mốc cắt input độc lập với muxer, byte in-flight và deadline drain với clip dài, tải kết hợp. RSS clip ngắn và vị trí Stop hiện tại chỉ dùng để đối chiếu.                                                            |
| Hủy khi đang ghi                                        | Local đã kiểm pipeline và fixture RTP dừng trước cleanup, artifact dở không được công bố.           | M3/M4 phối hợp với M2 khi có port lifecycle/attempt. Kiểm hủy/Stop trong STARTING, callback capture-ready/finalize muộn và chuyển host. Attempt cũ không hồi RECORDING hoặc đi READY sai attempt. Hai host dùng cùng request ID vẫn có khóa retry riêng, và host mới bị chặn tạo attempt thứ hai khi attempt cũ còn mở. |
| Finalize lặp sau mất phản hồi local                     | Local đã kiểm retry tuần tự sau rename giữ nguyên receipt, inode/mtime và một artifact.             | M2 kiểm với port DB/storage và fixture mất ACK hoặc restart. Tra cùng attempt/operation trả đúng receipt đã commit. Kết quả chưa xác định vẫn pending, giữ byte cần đối soát, không báo fail, cleanup hoặc tạo artifact mới.                                                                                            |
| Finalize đồng thời, disk-full khi finalize, cleanup lỗi | Chưa chạy với port lưu trữ.                                                                         | M2 kiểm khi có port storage/quota và fixture lỗi I/O. Không công bố tệp dở, giữ quota khi byte/I/O chưa được giải quyết và giữ artifact đã chuyển quyền sở hữu.                                                                                                                                                         |
| Deny khi transfer và call ENDED sau input-stopped       | Chưa chạy với port điều phối quyền và transaction READY.                                            | M1/M2 kiểm deny và transaction với M3/M4 phối hợp end-call. Deny đã thắng chặn commit và sự kiện READY. Call ENDED chỉ finalize đúng attempt đã dừng input và còn quyền hợp lệ.                                                                                                                                         |

Jira giữ trạng thái SCRUM-51. Các tiêu chí tích hợp tiếp tục thuộc SCRUM-51 đến khi những bên liên quan xác nhận nơi tiếp nhận. Việc merge PoC chỉ bàn giao bằng chứng local.
