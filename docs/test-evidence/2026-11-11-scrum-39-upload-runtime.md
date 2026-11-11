# SCRUM-39 — Thử thư viện upload trên runtime của dự án

Thử trên `node:26.12.1-bookworm-slim` (Linux x64), container giới hạn 2 CPU và 512 MiB RAM. Các bản dùng trong phép thử là Busboy `1.6.0`, file-type `22.3.0`, sharp `0.35.5` và libvips `8.18.7`. Script tự sinh dữ liệu và cài dependency trong container tạm.

## Chạy lại

Từ thư mục gốc repository, chạy trong PowerShell khi Docker đang dùng Linux containers.

```powershell
docker run --rm --cpus 2 --memory 512m --mount "type=bind,source=$($PWD.Path)/scripts/spike-upload-runtime.mjs,target=/spike.mjs,readonly" node:26.12.1-bookworm-slim sh -ec 'mkdir /tmp/spike; cd /tmp/spike; cp /spike.mjs ./spike.mjs; npm install --no-audit --no-fund --save-exact busboy@1.6.0 file-type@22.3.0 sharp@0.35.5; npm ls --depth=0; node spike.mjs'
```

## Kết quả

| Ca thử                         |             Thời gian | Kết quả                                                           |
| ------------------------------ | --------------------: | ----------------------------------------------------------------- |
| JPEG hợp lệ, 5 lượt tuần tự    | 105.91–141.15 ms/lượt | Mỗi ảnh đầu vào 2,597,604 byte, đầu ra 762,059 byte ở 1440 × 1080 |
| Hai JPEG hợp lệ chạy đồng thời |  188.52 ms cho cả hai | Cả hai cho cùng kích thước và số byte như trên                    |
| Multipart đúng 10 MiB          |              62.48 ms | Parser chấp nhận đúng biên                                        |
| Text khai báo `image/jpeg`     |               5.89 ms | Từ chối ở bước nhận diện định dạng                                |
| JPEG có chữ ký nhưng bị cắt    |              52.29 ms | Từ chối ở bước xử lý ảnh                                          |
| Multipart vượt 10 MiB một byte |              32.55 ms | Từ chối ở giới hạn byte                                           |
| PNG 4096 × 4096, 58,798 byte   |               4.23 ms | Từ chối ở giới hạn 16 triệu pixel của phép thử                    |
| Hủy giữa luồng multipart       |               3.01 ms | Promise bị từ chối và stream nguồn/parser/file được hủy           |

RSS là bộ nhớ cư trú của toàn bộ tiến trình Node, gồm phần native. Trong 5 lượt JPEG, RSS nền là 106.66–178.31 MiB, đỉnh lấy mẫu là 128.94–179.19 MiB và mức tăng so với đầu từng lượt là 0.88–22.28 MiB. Ca đồng thời bắt đầu ở 179.19 MiB và đạt 194.06 MiB. Đỉnh cao nhất quan sát được cả lần chạy là 204.31 MiB. Các lượt dùng chung tiến trình và RSS lấy mẫu có thể bỏ qua đỉnh ngắn. Các số này phản ánh một lần chạy fixture trên máy phát triển.

## Bàn giao cho SCRUM-52

Đề xuất dùng Busboy để đọc multipart, file-type để kiểm chữ ký và sharp để giải mã, giới hạn pixel và chuẩn hóa ảnh. Khi tích hợp, áp allowlist riêng cho chat/frame/avatar theo Q3/Q8 và chốt giới hạn pixel với team. Fixture giữ tệp đã giới hạn trong bộ nhớ để kiểm thư viện. Khi triển khai handler, thử writer có backpressure và cleanup khi client ngắt, timeout hoặc storage lỗi. Đo lại RSS và độ trễ khi có giới hạn byte toàn request, queue xử lý ảnh, nhiều upload cùng lúc và tải Web/API/media kết hợp. M1 review kết quả trước khi chốt dependency cho đường upload.
