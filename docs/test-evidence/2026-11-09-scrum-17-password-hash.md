# SCRUM-17 — Đo Argon2id trước khi triển khai đăng ký

Mật khẩu cần được băm trước khi ghi tài khoản. Băm càng tốn tài nguyên thì việc thử đoán mật khẩu càng đắt, nhưng nếu máy chủ nhận quá nhiều yêu cầu băm cùng lúc, những phần khác như nhắn tin và gọi cũng có thể bị chậm. Task này đo cả chi phí mỗi lần băm và tác động của việc chạy nhiều lần cùng lúc để M1 chọn cấu hình ban đầu.

Đo trên nhánh `chore/SCRUM-17-password-hash-benchmark` từ `c705520` ngày 09/11/2026. Đầu vào là [Q1 của M1](../proposals/m1-workspace-auth.md), [contract xác thực](../contracts/auth-profile.md) và [giới hạn tải](../capacity.md). Cấu hình thấp nhất trong phép đo là Argon2id với 19 MiB, 2 lượt, 1 lane theo mốc của proposal. [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id)

## Cách đo

- Linux x64, Ubuntu 26.04.1 trong WSL2, glibc 2.43, AMD Ryzen 7 H 255. Dùng Node 26.12.1 đúng phiên bản repo và kiểm SHA-256 của gói Node Linux với danh sách chính thức. Giới hạn tiến trình vào hai CPU logic bằng `taskset -c 0,1`, giữ `UV_THREADPOOL_SIZE=4`.
- So sánh Argon2id bất đồng bộ của `node:crypto` và package `argon2@0.45.2`. Package được cài trong thư mục thử riêng. Thử hash và verify thật trên Node Linux. Bản Docker của app dùng Debian Bookworm và vẫn cần kiểm cài/chạy riêng. [Node Crypto](https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback) · [node-argon2](https://github.com/ranisalt/node-argon2)
- Mỗi cấu hình chạy trong tiến trình riêng. Thử 19 MiB/2 lượt, 32 MiB/2 lượt, 64 MiB/3 lượt, đều 1 lane. Mỗi cấu hình đo 40 lần băm và 40 lần kiểm, ở mức 1, 2 hoặc 4 tác vụ đồng thời. Dữ liệu thử là chuỗi Unicode 128 ký tự. Mỗi hash dùng salt ngẫu nhiên 16 byte và kết quả 32 byte. Trước khi đo, mỗi cấu hình kiểm mật khẩu đúng và sai.
- Thời gian p95 là mức mà 95% tác vụ trong lượt đo hoàn thành trong hoặc dưới mức đó. Thời gian này bắt đầu khi tác vụ được đưa vào bộ chạy hash, chưa tính chờ ở hàng đợi mô phỏng. CPU tính cả user và system của process. RSS là bộ nhớ tiến trình dùng, gồm cả Node, thư viện và khâu khởi động. Số liệu là ảnh chụp của một lượt đo với dữ liệu thử, dùng để so cấu hình.

Chạy từ root repo trên Linux với Node 26.12.1. Thư mục cài package thử nằm ngoài repo:

```sh
bench_dir="$(mktemp -d)"
npm install --prefix "$bench_dir" --no-audit --no-fund --save-exact argon2@0.45.2
UV_THREADPOOL_SIZE=4 taskset -c 0,1 node scripts/benchmark-password-hash.mjs "$bench_dir/node_modules/argon2"
```

Script in JSON từng cấu hình gồm thời gian, CPU, RSS và số tác vụ chờ/từ chối. Nếu bỏ đối số đường dẫn package, script chỉ đo `node:crypto`. Chọn hai CPU logic thực sự được môi trường cho phép nếu danh sách CPU khác. Xem [script đo](../../scripts/benchmark-password-hash.mjs).

## Kết quả đo

| Cách băm    | MiB / lượt | Đồng thời | Băm p95 (ms) | Verify p95 (ms) | CPU băm / verify (ms mỗi tác vụ) | CPU khi băm (% một CPU logic) | RSS đỉnh (MiB) |
| ----------- | ---------- | --------- | ------------ | --------------- | -------------------------------- | ----------------------------- | -------------- |
| node:crypto | 19 / 2     | 1         | 59.21        | 31.62           | 33.62 / 29.29                    | 100.93                        | 182.76         |
| node:crypto | 19 / 2     | 2         | 38.27        | 34.7            | 32.01 / 31.22                    | 194.19                        | 183.14         |
| node:crypto | 19 / 2     | 4         | 112.57       | 69.92           | 32.76 / 31.46                    | 197.22                        | 182.74         |
| node:crypto | 32 / 2     | 1         | 66.08        | 65.91           | 64.38 / 63.43                    | 100.67                        | 81.7           |
| node:crypto | 32 / 2     | 2         | 80.2         | 74.57           | 69.99 / 68.58                    | 197.99                        | 113.94         |
| node:crypto | 32 / 2     | 4         | 178.02       | 175.1           | 73.09 / 69.61                    | 198                           | 177.74         |
| node:crypto | 64 / 3     | 1         | 209.65       | 209.96          | 187.97 / 192.45                  | 100.76                        | 113.69         |
| node:crypto | 64 / 3     | 2         | 238.09       | 262.58          | 209.65 / 210.14                  | 198.61                        | 177.87         |
| node:crypto | 64 / 3     | 4         | 437.3        | 462.22          | 201.23 / 202.64                  | 198.71                        | 305.7          |
| node-argon2 | 19 / 2     | 1         | 21.78        | 23.98           | 19.82 / 21.52                    | 100.85                        | 126.4          |
| node-argon2 | 19 / 2     | 2         | 28.58        | 25.94           | 23.18 / 22.64                    | 193.72                        | 126.43         |
| node-argon2 | 19 / 2     | 4         | 68.52        | 67.26           | 22.27 / 22.22                    | 195.58                        | 126.61         |
| node-argon2 | 32 / 2     | 1         | 58.83        | 65.27           | 55.99 / 57.93                    | 100.49                        | 82.38          |
| node-argon2 | 32 / 2     | 2         | 67.15        | 65.06           | 62.17 / 60.84                    | 197.11                        | 114.44         |
| node-argon2 | 32 / 2     | 4         | 137.76       | 149.77          | 62.64 / 61.96                    | 196.61                        | 178.43         |
| node-argon2 | 64 / 3     | 1         | 163.77       | 176.73          | 157.26 / 161.34                  | 100.84                        | 114.32         |
| node-argon2 | 64 / 3     | 2         | 201.68       | 189.09          | 178.36 / 174.64                  | 198.19                        | 178.56         |
| node-argon2 | 64 / 3     | 4         | 400.53       | 386.38          | 181.64 / 178.9                   | 198.41                        | 306.41         |

Ở `argon2@0.45.2` với 32 MiB/2 lượt, 2 tác vụ đồng thời xử lý khoảng 31,7 lần băm/giây. Tăng lên 4 tác vụ cho khoảng 31,4 lần/giây, nhưng p95 băm tăng từ 67,15 lên 137,76 ms và RSS đỉnh tăng từ 114,44 lên 178,43 MiB. CPU khi băm ở cả hai mức gần dùng hết hai CPU logic được cấp. Ở mức một tác vụ, p95 băm/verify lần lượt là 58,83 và 65,27 ms, RSS đỉnh là 82,38 MiB.

Ca tải dồn mô phỏng 12 yêu cầu đến cùng lúc với 2 tác vụ chạy và 4 chỗ chờ. Cấu hình 32 MiB/2 lượt của `argon2@0.45.2` nhận 6, từ chối 6. Tác vụ được nhận cuối bắt đầu sau 125,74 ms và cả lượt kết thúc sau 186,28 ms. Đây là phép mô phỏng giới hạn chỗ chờ trong script. Điều kiện hết hạn và hủy khi client ngắt cần kiểm ở luồng thật.

RSS nền trước lần băm đầu khoảng 47 MiB. RSS đỉnh là mức cao nhất hệ điều hành ghi nhận trong cả tiến trình thử. Một số lượt 19 MiB có RSS đỉnh cao hơn lượt 32 MiB cùng mức đồng thời. Nên dùng số RSS này như số đo của từng lượt, và đo lại trước khi suy ra mức tăng RAM cố định cho mỗi tác vụ.

## Đề xuất để M1 review

- **Thư viện:** thử tiếp `argon2@0.45.2` cho SCRUM-18. Package hỗ trợ tạo và kiểm chuỗi PHC có sẵn salt và tham số. Trong phép đo 32 MiB/2 lượt với một tác vụ, p95 băm là 58,83 ms so với 66,08 ms của `node:crypto`. `node:crypto` là phương án nếu không dùng addon, nhưng cần chốt cách mã hóa và đọc chuỗi lưu để dùng lại đúng salt và tham số khi verify. [API package và định dạng PHC](https://github.com/ranisalt/node-argon2)
- **Tham số khởi đầu:** Argon2id `memoryCost: 32768` KiB, `timeCost: 2`, `parallelism: 1`, salt ngẫu nhiên 16 byte, hash 32 byte. Dùng cùng cấu hình khi băm mật khẩu mới. Verify dựa vào tham số đã lưu và kiểm chúng nằm trong giới hạn được duyệt trước khi chạy. Giá trị 64 MiB/3 lượt cần đo lại nếu M1 muốn cân nhắc chi phí cao hơn.
- **Giới hạn thử ban đầu:** một tác vụ chạy và tối đa hai tác vụ chờ cho toàn process, dùng chung cho băm và verify. Hạn chờ đề xuất 250 ms. Đây là cấu hình bảo thủ để M1 thử với tải kết hợp, dựa trên chi phí ở mức một tác vụ. Phép đo tải dồn phía trên dùng cấu hình 2 chạy/4 chờ. Khi đầy hoặc chờ quá hạn, từ chối theo mã lỗi đã thống nhất với consumer. Kiểm tần suất đăng ký/đăng nhập riêng trước khi đưa vào hàng chờ.
- **Vòng đời tác vụ:** hủy việc đang chờ nếu client ngắt hoặc hết hạn. Nếu native hash đã bắt đầu, giữ chỗ đến khi tác vụ thực sự kết thúc. Không coi timeout của yêu cầu là đã dừng việc băm. Duy trì một app process và kiểm thêm độ trễ của các việc khác dùng chung threadpool.

## Bàn giao cho SCRUM-18

Sprint 1 cần nhóm năm người đăng nhập, vào cùng Workspace, nhắn tin và gọi trên staging. SCRUM-17 chặn trực tiếp **SCRUM-18 / M1-T3.2**, khớp ticket trong ảnh và liên kết Jira trong repo. SCRUM-12, SCRUM-15 và SCRUM-16 đã có trên nền nhánh này. Chúng lần lượt cung cấp contract, transaction và model lưu tài khoản/phiên. [Sprint Goal](../planning/sprint-1.md) · [Liên kết Jira](../planning/jira/sprint-1-jira-links.csv)

M1 review lựa chọn thư viện, tham số và giới hạn trước khi mở luồng đăng ký. SCRUM-18 dùng dữ liệu đã qua contract và giữ nguyên nội dung mật khẩu, thực hiện băm bên ngoài transaction/khóa, rồi lưu tài khoản và phiên trong cùng transaction. Q2/Q3 về giới hạn tần suất, kiểm đầu vào và CSRF/Origin tiếp tục theo contract và phân công Sprint 1.

Trước khi áp dụng trên staging, chạy lại trên image Debian đang dùng và đo cùng app, media và MongoDB trên máy thử. Ghi p95 của luồng đăng ký/đăng nhập, độ trễ event loop và CPU/RAM. Kiểm tải dồn, chờ quá hạn và tác vụ bị từ chối. Quyết định cấu hình chạy thật thuộc lượt review của M1.

## Kiểm repo

`pnpm check` đạt trên Windows với 339 test ứng dụng. Harness có 54 ca đạt và 1 ca symlink bỏ qua trên Windows. Lượt cài dependency đầu gặp HTTP 504 khi tải worker mediasoup. Lượt cài lại với lockfile giữ nguyên dùng `MEDIASOUP_WORKER_BIN` trỏ tới worker 3.31.0 đã cài từ trước trong workspace. Việc này phục vụ kiểm repo trên máy hiện tại. Benchmark Argon2id dùng Node Linux và package thử riêng như mục cách đo.
