# Kiểm soát chất lượng CoLearnia

## Các lớp kiểm soát

| Lớp                | Cách thực hiện                                                                 | Trạng thái                                                               |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Source             | TypeScript strict, ESLint, Prettier, contracts Zod                             | Đã cấu hình                                                              |
| Local hooks        | Husky, lint-staged và commitlint                                               | Cài qua pnpm install; tự format/lint staged files và kiểm commit message |
| Main protection    | PR, một review, CI, resolve conversations, linear history; chặn force push/xóa | Đã bật trên GitHub ngày 25/10/2026, áp dụng cả admin                     |
| Source CI          | Format, lint, typecheck, tests, build, media smoke                             | Đã cấu hình                                                              |
| Commit CI          | Conventional Commits cho commit range của PR                                   | Đã cấu hình                                                              |
| Dependency audit   | pnpm audit, chặn high/critical                                                 | Đã cấu hình; không tự bỏ qua khi registry lỗi                            |
| Secret scan        | Gitleaks CLI pin phiên bản, kiểm checksum; log redacted                        | Đã cấu hình trong CI                                                     |
| Docker smoke       | Build hai image có layer cache, chạy stack, kiểm qua Nginx                     | Chạy khi thay đổi triển khai hoặc kích hoạt thủ công                     |
| Database check     | Replica set primary, transaction commit/rollback                               | Đã cấu hình trong CI; chưa thay test nghiệp vụ                           |
| Dependency updates | Dependabot cho npm, Actions và Docker theo tuần                                | Kích hoạt khi file cấu hình vào main; không tự merge                     |
| Test nghiệp vụ/E2E | Policy, API/socket ACL, nhóm, reconnect, hai mạng và TURN                      | Phát triển theo feature IDs; scaffold chưa chứng minh các luồng này      |

Danh sách required checks thực tế nằm ở Settings của repo. Check mới chỉ được bổ sung sau khi đã chạy để xác nhận tên/kết quả; không coi việc có file workflow là bằng chứng đã pass. Mọi thay đổi cấu hình trong PR cần merge trước khi áp dụng chung từ main.

Unit/HTTP tests hiện có 7 ca ở contracts và HTTP foundation. Media smoke chỉ kiểm native worker/Router, chưa xác nhận cuộc gọi. Transaction check kiểm cơ chế DB, chưa kiểm transaction nhận lời mời hoặc chuyển owner.

### Khi nào chạy Docker smoke

- Tự chạy khi thay Dockerfile, Compose, `.dockerignore`, nội dung `infra/`, package manifests/lockfile, cấu hình Node/pnpm/TypeScript, `.env.example`, script cài hooks hoặc chính cấu hình CI/bộ lọc Docker.
- PR so sánh từ điểm chung với nhánh gốc; push vào main so sánh toàn bộ khoảng commit vừa đẩy. Thay đổi chỉ ở source nghiệp vụ, giao diện hoặc tài liệu bỏ qua build Docker. Các check source và bảo mật vẫn chạy.
- Job `Docker smoke` vẫn xuất hiện và thành công khi không cần build; lỗi xác định thay đổi sẽ làm job thất bại, không âm thầm bỏ qua.
- Có thể chạy đầy đủ bằng GitHub Actions → CI → Run workflow, chọn nhánh cần kiểm tra. Nút này xuất hiện sau khi workflow được merge vào main.
- Buildx dùng cache layer riêng cho server/web, không đẩy image lên registry. Lần đầu hoặc khi cache bị xóa vẫn cần build lại. Thiết lập theo [Docker GitHub Actions cache](https://docs.docker.com/build/ci/github-actions/cache/).
- Việc kiểm MongoDB/transaction trong job `check` vẫn chạy mỗi PR; đó là kiểm hạ tầng DB, không phải build cả ứng dụng bằng Docker.

**CI xanh nghĩa là những phép kiểm hiện có đã qua, không bảo đảm mọi hành vi của hệ thống đều đúng.**

## Local hooks

- `prepare` cài Husky trong repo local có Git; CI/production build hoặc Docker context không có `.git` bỏ qua.
- lint-staged chỉ xử lý phần được staged, tự cập nhật kết quả format. Không dùng `git add .` trong hook để tránh đưa nhầm phần chưa muốn commit.
- Commit message có scope: `feat(channels): add live channel creation`. Message như `update files` bị chặn.
- Hooks có thể bị bỏ qua trên máy cá nhân; CI vẫn chạy format/lint và kiểm commit range của PR.
- Chạy `pnpm check` trước khi mở PR. Không ép build/test toàn bộ trong mỗi commit để tránh làm chậm vòng làm việc.

## Review và bảo vệ main

Mỗi PR cần ít nhất một người khác review; review cũ bị hủy khi có thay đổi mới, push mới nhất cần được người khác chấp thuận. Yêu cầu xử lý hết review conversations, required checks thành công và branch cập nhật với main. Áp dụng cả admin, chặn force push/xóa nhánh, giữ lịch sử tuyến tính bằng squash merge.

Policy/media phải có review chéo. Chưa gán CODEOWNERS khi nhóm chưa cung cấp GitHub username cho từng module. Không tự approve hoặc bypass review của chính mình.

## Dependency và secrets

- Audit kiểm cả development tools. Không tự chạy audit --fix hoặc thêm ignore rộng chỉ để check xanh.
- Gitleaks quét lịch sử Git với output đã che giá trị. Khi phát hiện secret thật: thu hồi/rotate, không chỉ xóa dòng ở commit mới.
- Dependabot tạo PR cập nhật theo tuần, không tự merge. Mỗi PR vẫn qua review và CI.
- Native GitHub secret scanning/push protection và Dependabot alerts là các tính năng riêng; tài liệu này chỉ khẳng định các cấu hình thực hiện ở trên.

## Tiếp tục nâng chất lượng trong kế hoạch 4 tuần

1. Policy tests allow/deny trước routing: cùng/khác nhóm, host hỗ trợ, consent, revoke, chuyển nhóm.
2. Integration tests cho lời mời đồng thời, message dedupe, file ACL và Socket.IO.
3. PoC staging hai mạng và forced TURN, lưu bằng chứng cùng commit.
4. E2E Workspace → kênh → gọi → nhóm khi nghiệp vụ đã chạy được.

Coverage giúp tìm vùng chưa test; ưu tiên các nhánh policy và ca từ chối, không viết test chỉ để tăng tỷ lệ tổng.

## Prettier và Git

Commit `.prettierrc.json`, `.prettierignore`, package.json, lockfile, source đã format và cấu hình editor dùng chung. Không commit node_modules, extension/editor cài trên máy, cấu hình người dùng toàn máy, `.env` hoặc dữ liệu runtime. Mọi người có thể dùng `pnpm format` mà không cài extension.

## Nguồn

- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- [Husky](https://typicode.github.io/husky/get-started.html).
- [commitlint](https://commitlint.js.org/guides/local-setup.html).
- [lint-staged](https://github.com/lint-staged/lint-staged).
- [Gitleaks](https://github.com/gitleaks/gitleaks).
- [Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
