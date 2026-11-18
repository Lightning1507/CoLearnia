# SCRUM-52 — Bàn giao nghiệm thu R2 riêng tư

Nhánh `chore/SCRUM-52-r2-acceptance` bắt đầu từ main `a82b844`. Mang hai commit adapter đã được M1 review ở PR #123 sang main mới bằng cherry-pick, giữ hướng dẫn TEXT hiện có khi xử lý xung đột runbook. Commit nguồn là `134afb6` và bản sửa upload `b2a9532`. Code adapter, smoke và bảy fixture giữ nguyên hành vi ở head `4e2a041` đã review. [PR #123](https://github.com/Lightning1507/CoLearnia/pull/123)

## Phạm vi đã bàn giao

Adapter có upload với pipeline/PassThrough để truyền lỗi và giữ backpressure, read theo stream, delete, timeout và hủy từ caller. Cấu hình server-only dùng chung cho consumer file/video. Multipart, Range, metadata và ACL consumer tiếp tục theo các task tương ứng. [Runbook R2](../runbooks/local-development.md#private-r2-scrum-52)

## Nghiệm thu dịch vụ thật còn mở

Ngày 18/11/2026, nhánh nghiệm thu chưa có các biến R2 cần thiết trong môi trường chạy hoặc `.env` của checkout. Chỉ kiểm sự tồn tại của cấu hình, không đọc credential. Lệnh smoke dưới đây đã chạy, exit 1 tại validation trước I/O.

```powershell
pnpm --filter @colearnia/server exec tsx --env-file-if-exists=../../.env scripts/r2-smoke.ts
```

```text
Missing or invalid R2 configuration: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
```

| Bằng chứng cần có tại cùng SHA                  | Trạng thái                                                  |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Upload object thử với key ngẫu nhiên            | Chờ cấu hình bucket thử nghiệm                              |
| Đọc có chữ ký và so sánh đúng byte              | Chờ I/O R2 thật                                             |
| HEAD ẩn danh trả 401/403 khi object còn tồn tại | Chờ I/O R2 thật                                             |
| Delete và đọc có chữ ký trả NOT_FOUND           | Chờ I/O R2 thật, chưa có object thử được tạo trong lượt này |
| Dashboard xác nhận r2.dev tắt                   | Chờ người có quyền bucket                                   |
| Dashboard xác nhận public custom domains tắt    | Chờ người có quyền bucket                                   |

Người có quyền bucket thử nghiệm chạy smoke theo runbook và cung cấp SHA/lệnh/exit code/kết quả đã lọc cùng xác nhận dashboard, bao gồm xác nhận object thử đã dọn. M2 tổng hợp, M1 review đúng kết quả đó. SCRUM-52 giữ mở tới khi đủ bằng chứng và review. Bàn giao adapter trên nhánh này chưa đạt điều kiện đóng toàn bộ task.

## Phạm vi ngoại lệ picomatch

Main `a82b844` đã chứa ngoại lệ audit được mô tả trong issue #127 qua PR #117. Head PR #123 cũng chứa cùng cấu hình tại `4e2a041`. Nhánh nghiệm thu kế thừa ngoại lệ từ main và không thêm advisory vào danh sách bỏ qua. Phạm vi là audit toàn workspace, mốc rà soát giữ 25/11/2026. Điều kiện gỡ vẫn ở issue. [Issue #127](https://github.com/Lightning1507/CoLearnia/issues/127) · [PR #117](https://github.com/Lightning1507/CoLearnia/pull/117) · [PR #123](https://github.com/Lightning1507/CoLearnia/pull/123)

## Kiểm tra local ngày 18/11/2026

- Windows x64, pnpm 11.5.2 và Node v26.12.1 qua `pnpm exec node --version`.
- `pnpm install --frozen-lockfile` exit 0.
- `pnpm run doctor` xác nhận Node đúng pin, có lockfile, thiếu `.env` và Docker engine chưa chạy hoặc chưa truy cập được.
- `pnpm check` exit 0, gồm harness 54 pass/1 skip, format, lint, typecheck, 70 test files với 969 test pass và build cả ba package. Bảy fixture R2 nằm trong lượt test này. Đây là kiểm bản tích hợp trên main mới.
- `git diff --check` exit 0. Diff adapter/smoke/fixture với `4e2a041` rỗng.
- Smoke dịch vụ thật exit 1 do thiếu cấu hình như ghi ở trên. Chưa xác nhận I/O R2 hoặc dashboard trong lượt này.
