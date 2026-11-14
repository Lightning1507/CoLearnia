# SCRUM-41 — Lưu tin nhắn gốc TEXT

Repository lưu tin gốc văn bản, giữ nội dung theo schema TEXT và dùng unique index `uq_message_retry` theo conversation, sender và client message ID. Cùng khóa và nội dung trả tin cũ. Cùng khóa khác nội dung trả conflict. Conversation counter `lastMessageCommitSeq` và tin mới được ghi trong cùng transaction. Conversation chưa có counter bắt đầu từ 1 khi ghi tin mới. Tin lịch sử chưa có `commitSeq` vẫn đọc được.

Index `ix_message_scope_cursor` hỗ trợ lọc root theo conversation và phân trang giảm dần theo `createdAt` rồi `_id`. Cursor nội bộ giữ conversation ID để phát hiện dùng lại ở hội thoại khác.

## Kiểm chứng

Chạy hai suite bên dưới với MongoDB 8.0.16 replica set `rs0` trên cổng loopback 27241. Suite tự tạo DB kiểm thử riêng. Tổng cộng 11 test đạt, gồm retry đồng thời, unique index, conflict, rollback khi lưu lỗi và phân trang cùng timestamp. Hai index được kiểm bằng preflight.

```powershell
$env:COLEARNIA_DB_TEST_PORT = '27241'
pnpm --filter @colearnia/contracts build
pnpm exec vitest run --config vitest.database.config.ts apps/server/test/text-message.integration.ts apps/server/test/conversation.integration.ts
```

## Bàn giao SCRUM-42

Tích hợp repository sau bước xác thực, kiểm quyền kênh TEXT và phân giải conversation. Dùng `textMessageIndexes` để kiểm preflight trước khi mở handler. Thực hiện provisioning index theo quy trình DB của môi trường. REST/Socket.IO, điều phối quyền và budget theo Workspace, cursor truyền qua mạng và đối soát khi mất ACK thuộc bước tích hợp. [Contract TEXT](../contracts/text-messaging.md) · [Quy trình DB](../database/integrity-and-migrations.md)

## Review PR #111

Chạy lại hai suite trên MongoDB 8.0.16 sau khi sửa: 13/13 test đạt.

- Gửi UUID chữ hoa rồi retry bằng chữ thường trả cùng ID và `commitSeq: 1`. MongoDB chỉ có một tin với UUID chữ thường.
- High hoặc low surrogate đứng một mình bị từ chối ngay ở lần gửi đầu và lần retry. MongoDB không ghi tin và bộ đếm chưa được cấp. Tin có emoji và khoảng trắng được đọc lại nguyên văn và retry trả tin cũ.
