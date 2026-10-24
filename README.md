# CoLearnia

**Nền tảng học tập trực tuyến với không gian cộng tác và thảo luận nhóm thời gian thực.**

Monorepo khởi tạo theo technical plan v2: Workspace → kênh TEXT/LIVE → phiên gọi → nhóm nhỏ. Mục tiêu xây dựng là **4 tuần**, sau đó tiếp tục review, hoàn thiện và chuẩn bị bảo vệ.

## Bắt đầu

Yêu cầu: Node **24.22.1**, pnpm **11.5.2** và Docker Desktop chạy Linux containers. Phiên bản runtime/package manager được ghi ở `.node-version` và `package.json`. pnpm có thể tải runtime của project theo `devEngines.runtime`; không cần thay Node toàn máy.

```sh
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install
```

Tạo `.env` tại root từ `.env.example`:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```sh
# macOS / Linux
cp .env.example .env
```

Khởi động database và ứng dụng:

```sh
pnpm infra:up
pnpm dev
```

- Web: <http://localhost:5173>
- API: <http://127.0.0.1:3001/api/v1/system/status>
- Liveness: <http://127.0.0.1:3001/health/live>
- Dependency readiness: <http://127.0.0.1:3001/health/ready>

Web và API chạy được khi chưa bật Docker; giao diện báo đúng trạng thái database/media và readiness trả 503. `MEDIA_ENABLED=false` là mặc định để xây UI/API; đặt `true` để bật native worker và WebRtcServer khi làm PoC. Readiness của scaffold chỉ kiểm database/worker, chưa xác nhận auth, indexes nghiệp vụ hoặc cuộc gọi đã hoàn thiện.

## Cấu trúc

```text
CoLearnia/
├── apps/
│   ├── web/                 # React, Vite, Tailwind; UI và media client
│   └── server/              # Express, Socket.IO, Mongoose, mediasoup
├── packages/contracts/     # Zod schemas + types frontend/backend dùng chung
├── infra/
│   ├── mongo/              # Khởi tạo replica set rs0
│   ├── nginx/              # REST/socket/SPA proxy cho local Compose
│   └── coturn/             # Hướng dẫn cấu hình TURN cho PoC
├── docs/
│   ├── technical-plan.md   # v2 — nguồn phạm vi chính
│   ├── adr/                # Quyết định kiến trúc
│   ├── contracts/          # Quy ước giao tiếp
│   ├── runbooks/           # Vận hành và môi trường
│   ├── test-evidence/      # Bằng chứng kiểm thử
│   └── archive/            # Technical plan v1 để đối chiếu
├── scripts/                # Công cụ hỗ trợ repo
├── storage/                # Dữ liệu local, không commit
├── .github/                # CI và PR template
├── docker-compose.yml
└── project-overview.html    # Giới thiệu ý tưởng sản phẩm
```

Thư mục module chưa triển khai được giữ bằng `.gitkeep`. Khi thêm file thực đầu tiên, xóa `.gitkeep` ở chính thư mục đó. Không thêm `.gitkeep` vào thư mục đã chứa mã nguồn. Dùng kebab-case cho tên file/thư mục, PascalCase cho React component, camelCase cho hàm/biến.

## Lệnh dùng chung

| Lệnh                | Tác dụng                                            |
| ------------------- | --------------------------------------------------- |
| `pnpm dev`          | Build/watch contracts, chạy server và web           |
| `pnpm check`        | Format check → ESLint → TypeScript → tests → build  |
| `pnpm format`       | Format source/config bằng Prettier                  |
| `pnpm test`         | Contract và HTTP foundation tests                   |
| `pnpm media:smoke`  | Khởi động native worker + Router Opus/VP8, rồi đóng |
| `pnpm doctor`       | Kiểm Node, .env, lockfile và Docker engine          |
| `pnpm infra:up`     | MongoDB và khởi tạo rs0, giữ dữ liệu trong volume   |
| `pnpm infra:down`   | Dừng Compose; không xóa volume                      |
| `pnpm infra:config` | Kiểm cấu hình Compose                               |

Không dùng `docker compose down -v` nếu cần giữ dữ liệu. Không commit `.env`, token, certificate key, database hoặc frame tạm.

## Hooks và CI

`pnpm install` cài pre-commit và commit-msg hooks khi repo có Git. `pnpm lint:staged` kiểm file staged; `pnpm audit` kiểm dependency, chặn advisory high/critical.

CI kiểm source, format commit trong PR, dependency audit, secret scan, transaction DB và build/chạy Docker qua Nginx. Dependabot được cấu hình tạo PR cập nhật dependency, Actions và Docker theo tuần sau khi cấu hình vào main; không tự merge. Xem [code quality](docs/code-quality.md) và [quy ước commit](CONTRIBUTING.md).

## Trạng thái bản init

Đã có: monorepo, contracts nền, React shell đọc trạng thái server thật, Express có error envelope/request ID, kiểm biến môi trường, database connector, Socket.IO entry point, media runtime và smoke test; format/lint/typecheck/test/build; Compose local và CI.

**Chưa triển khai nghiệp vụ:** auth, Workspace/kênh CRUD, chat/tệp, session/group, signaling call, policy, freeze/vẽ, floor/presentation và reconnect. Thư viện đã cài không đồng nghĩa chức năng đã hoàn thành. Socket hiện từ chối toàn bộ kết nối với `AUTH_REQUIRED` cho tới khi có auth/CSRF/expiry đúng; không mở endpoint gọi ẩn danh để làm UI mẫu.

TURN chưa chạy trong Compose. Cần public IP/hostname/secret và bằng chứng relay khi làm ADR-001. Hai Dockerfile và profile `app` là nền local để kiểm tiếp trên Linux, không phải bản triển khai production.

## Môi trường Docker đầy đủ

```sh
docker compose --profile app up --build
```

Web local Compose: <http://localhost:8080>. Mongo/media ports chỉ bind loopback; Mongo local chưa có auth. Không đưa nguyên Compose này lên Internet. Staging cần cấu hình TLS, database auth, secrets, public announced address, firewall và TURN theo [runbook](docs/runbooks/local-development.md).

## Cách nhận việc

1. Đọc [technical-plan.md](docs/technical-plan.md), đặc biệt mục 1–5 và 15–16.
2. Chọn feature ID và reviewer; theo [CONTRIBUTING.md](CONTRIBUTING.md).
3. Bắt đầu PoC tuần 1: B+C media/policy; D freeze/audio; A identity/Workspace; E Linux/staging/TURN.
4. Giữ `main` build được; mỗi PR cập nhật contract và test có liên quan.

Tham khảo quy ước [contracts](docs/contracts/README.md) và [ADR-001](docs/adr/001-media-foundation.md). Phần vẽ/quiz/thư viện ngoài phạm vi v2 không được thêm vào bản init như tính năng đã có.
