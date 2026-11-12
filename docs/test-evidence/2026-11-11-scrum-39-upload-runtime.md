# SCRUM-39 — Thử thư viện upload trên runtime của dự án

Thử trên `node:26.12.1-bookworm-slim` (Linux x64), container giới hạn 2 CPU và 512 MiB RAM. Các bản dùng trong phép thử là Busboy `1.6.0`, file-type `22.3.0`, sharp `0.35.5` và libvips `8.18.7`. Script tự sinh dữ liệu và cài dependency trong container tạm.

## Chạy lại

Từ thư mục gốc repository, chạy trong PowerShell khi Docker đang dùng Linux containers.

```powershell
docker run --rm --cpus 2 --memory 512m --mount "type=bind,source=$($PWD.Path)/scripts/spike-upload-runtime.mjs,target=/spike.mjs,readonly" node:26.12.1-bookworm-slim sh -ec 'mkdir /tmp/spike; cd /tmp/spike; cp /spike.mjs ./spike.mjs; npm install --no-audit --no-fund --save-exact busboy@1.6.0 file-type@22.3.0 sharp@0.35.5; npm ls --depth=0; node spike.mjs'
```

## Kết quả

| Ca thử                         |            Thời gian | Kết quả                                                           |
| ------------------------------ | -------------------: | ----------------------------------------------------------------- |
| JPEG hợp lệ, 5 lượt tuần tự    | 76.47–137.87 ms/lượt | Mỗi ảnh đầu vào 2,597,604 byte, đầu ra 762,059 byte ở 1440 × 1080 |
| Hai JPEG hợp lệ chạy đồng thời | 161.95 ms cho cả hai | Cả hai cho cùng kích thước và số byte như trên                    |
| Multipart đúng 10 MiB          |             78.91 ms | Parser chấp nhận đúng biên                                        |
| Text khai báo `image/jpeg`     |              4.06 ms | Từ chối ở bước nhận diện định dạng                                |
| JPEG có chữ ký nhưng bị cắt    |             40.27 ms | Từ chối ở bước xử lý ảnh                                          |
| Multipart vượt 10 MiB một byte |             28.76 ms | Từ chối 10.485.761 byte ở giới hạn multipart                      |
| PNG 4096 × 4096, 58,798 byte   |              3.02 ms | Từ chối ở giới hạn 16 triệu pixel của phép thử                    |
| Hủy giữa luồng multipart       |              2.13 ms | Promise bị từ chối và stream nguồn/parser/file được hủy           |

RSS là bộ nhớ cư trú của toàn bộ tiến trình Node, gồm phần native. Trong 5 lượt JPEG, RSS nền là 102.16–174.71 MiB, đỉnh lấy mẫu là 124.71–175.71 MiB và mức tăng so với đầu từng lượt là 1.00–22.55 MiB. Ca đồng thời bắt đầu ở 175.71 MiB và đạt 190.71 MiB. Đỉnh cao nhất quan sát được cả lần chạy là 205.94 MiB. Các lượt dùng chung tiến trình và RSS lấy mẫu có thể bỏ qua đỉnh ngắn. Các số này phản ánh một lần chạy fixture trên máy phát triển.

## Timeout native và hủy request

Pipeline xử lý ảnh của spike đặt `sharp.timeout({ seconds: 1 })`. Để quan sát timeout, ca riêng chạy bộ lọc median 51 trên JPEG hợp lệ. Ca này đợi `sharp.counters().process` báo một job đang chạy rồi mới hủy request mô phỏng. Thời gian bên dưới tính từ lúc bắt đầu ca thử trên Linux x64.

| Mốc                            |   Thời gian | Kết quả                                 |
| ------------------------------ | ----------: | --------------------------------------- |
| Hủy request                    |     0,64 ms | Sharp đang xử lý một job                |
| Promise của request bị từ chối |     0,86 ms | `AbortError`, bộ đếm sharp vẫn là 1     |
| Promise native bị từ chối      | 1.021,65 ms | Lỗi timeout từ sharp, bộ đếm xử lý về 0 |

Ca này cho thấy hủy request có thể kết thúc việc chờ ở tầng JS trước khi job native kết thúc. Timeout của sharp bắt đầu khi libvips mở ảnh, nên thời gian chờ libuv nằm ngoài ngân sách đó. Bộ lọc nặng và ngưỡng một giây dùng để thử, còn deadline thực tế và cơ chế hủy job native cần kiểm tiếp. [Tài liệu sharp timeout](https://sharp.pixelplumbing.com/api-output/#timeout)

## Bàn giao cho SCRUM-52

Khi tích hợp, tách deadline của request và hàng đợi khỏi timeout native. Giới hạn số job chờ và đang xử lý, giữ slot tới khi Promise native settle, rồi dọn writer hoặc bỏ kết quả nếu request đã hủy. Thử bão hòa hàng đợi libuv, hủy trong lúc chờ và sau khi native bắt đầu, đồng thời xác minh slot được trả đúng lúc. Nếu cần dừng native cứng theo deadline đầu cuối, đánh giá chạy cô lập và cơ chế dừng tiến trình trước khi chốt Q3.

Đề xuất dùng Busboy để đọc multipart, file-type để kiểm chữ ký và sharp để giải mã, giới hạn pixel và chuẩn hóa ảnh. Khi tích hợp, áp allowlist riêng cho chat/frame/avatar theo Q3/Q8 và chốt giới hạn pixel với team. Fixture giữ tệp đã giới hạn trong bộ nhớ để kiểm thư viện. Khi triển khai handler, thử writer có backpressure và cleanup khi client ngắt, timeout hoặc storage lỗi. Đo lại RSS và độ trễ khi có giới hạn byte toàn request, queue xử lý ảnh, nhiều upload cùng lúc và tải Web/API/media kết hợp. M1 review kết quả trước khi chốt dependency cho đường upload.
