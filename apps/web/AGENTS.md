# Web

- Đọc [scope](../../docs/product/scope.md), tài liệu miền qua [mục lục](../../docs/README.md) và [kiến trúc](../../docs/architecture.md).
- Import schema/types chia sẻ qua `@colearnia/contracts`; không import server internals hoặc đưa secret server vào VITE_*.
- Zustand giữ projection để render; TanStack Query giữ REST cache. Track/transport/audio nodes thuộc controller runtime, không persist store/localStorage.
- Chuyển panel không unmount call controller; cleanup chịu được StrictMode và phải kiểm generation.
- UI hiển thị rõ scope mic, freeze/live và consent; không tự bật thiết bị hoặc nâng audience do reconnect.
- Kiểm tra UI bằng browser khi thay hành vi; trạng thái mock phải được ghi rõ. Test quyền client không thay kiểm quyền server.
- Dùng lệnh check theo root AGENTS; typecheck bằng tsconfig của package. Giữ UI tiếng Việt, định danh kỹ thuật rõ nghĩa và pattern hiện có.
