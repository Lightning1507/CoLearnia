# Điều phối User/Workspace — SCRUM-19

Nguồn: [thứ tự mutation](../architecture.md#đồng-thời-db-ở-bước-5),
[integrity §4.1](../database/integrity-and-migrations.md#41-cơ-chế-chung),
[capacity](../capacity.md). Implementation này là khóa RAM cho **một app process**.
Không dùng nó cho nhiều process/replica hoặc migration ghi song song với app.

## Sử dụng chung

App sở hữu `operationCoordinator` trong `apps/server/src/lib/shared-coordination.ts`.
Truyền đúng object này cho M1/M2/M4; không tạo coordinator riêng theo domain, request
hoặc connection. Factory chỉ phục vụ composition/test cô lập.

Khai báo scope ban đầu **trước khi vào callback**. Coordinator tự acquire
User trước Workspace, nhả ngược lại. Chỉ lấy phạm vi cần thiết; không khóa cả User
khi thao tác chỉ cần Workspace. ObjectId được chuẩn hóa lowercase để không tạo hai
khóa cho cùng ID. Không nhận scope/identity trực tiếp từ client mà bỏ bước xác thực.

```ts
await coordinator.run(
  { userId, workspaceId },
  async (context) => {
    context.assertHeld({ userId, workspaceId });
    // Kiểm auth/ACL hiện tại ở đây. context không phải quyền truy cập.
    await database.transaction(async (dbSession) => {
      // M1/M2 dùng cùng session, thao tác DB tuần tự, IDs/time ổn định qua retry.
      // Không gọi coordinator.run lại từ transaction callback.
      await persistWithM2(dbSession, context);
    });
  },
  { signal },
);
```

Hàm con nhận `CoordinationContext`, gọi `assertHeld` cho phạm vi cần dùng và hoàn tất
trong callback của caller. Context chỉ hợp lệ trong async execution đang giữ khóa;
không giữ context để dùng sau callback, không chạy tác vụ detached/fire-and-forget
hoặc song song mutation bên trong cùng callback. Caller phải await toàn bộ công việc
cần bảo vệ trước khi trả về. Coordinator không tự tuần tự hóa các nhánh Promise.all
bên trong callback.

Không gọi lồng `run`, kể cả qua instance khác. Nếu đang giữ Workspace mà cần User,
đưa thao tác ra ngoài, xác định đủ scope rồi vào lại theo User → Workspace và kiểm
lại state; không nâng khóa ngược ngay trong callback. Hàm con dùng lại context,
không gọi lại `run`.

### Giữ User, lần lượt xử lý nhiều Workspace

Context chỉ giữ User cung cấp `withWorkspace`. Mỗi lượt chỉ giữ một Workspace,
nhả Workspace trước khi chuyển sang lượt kế tiếp; User giữ suốt chuỗi thao tác.
Context con bao gồm cả User và Workspace, phải dùng context con trong hàm nhận.
Không gọi `withWorkspace` song song, từ context ngoài execution, đã hết hiệu lực,
hoặc từ context đang giữ Workspace. Chỉ hỗ trợ một User trong một lượt.

```ts
await coordinator.run(
  { userId },
  async (userContext) => {
    // SCRUM-28 sẽ xác định tập phiên đích và đặt deny barrier trước cleanup.
    for (const workspaceId of affectedWorkspaceIds) {
      await userContext.withWorkspace(workspaceId, async (context) => {
        context.assertHeld({ userId, workspaceId });
        await cleanupWorkspace(context); // adapter nhận context, không acquire lại
      });
    }
  },
  { signal },
);
```

`affectedWorkspaceIds`, deny barrier và adapter trong ví dụ là trách nhiệm của
SCRUM-28, chưa được primitive này triển khai. Không suy ra quyền từ việc giữ khóa.

Mỗi lượt `withWorkspace` có ngân sách chờ riêng không vượt cấu hình, cho phép
`waitTimeoutMs` ngắn hơn và signal bổ sung. Signal cha luôn được kế thừa; hủy signal
con không hủy User hoặc các lượt khác. Lượt con là một phần của operation cha,
không chiếm thêm admission toàn process, nhưng vẫn chịu giới hạn queue Workspace.
Lỗi con nhả Workspace; nếu caller bắt lỗi, User vẫn giữ để xử lý lỗi/đối soát.
Không tự retry hoặc bỏ qua lỗi cleanup; quyết định giữ deny thuộc SCRUM-28.

Caller phải await lượt con. Nếu callback cha kết thúc/lỗi khi còn lượt con đang
chạy/chờ, coordinator vẫn đợi lượt đó kết thúc trước khi nhả User, và không nhận
lượt con mới từ context cha. Không dựa vào cơ chế bảo vệ này để chạy detached;
caller vẫn phải nhận/xử lý kết quả con. Không tự nhả khóa của callback con đang
chạy vì timeout/hủy.

## Điểm nối với M2/M4 và auth

- Login/đổi mật khẩu: băm/xác minh ngoài khóa User; vào khóa kiểm lại hash/version,
  phiên và điều kiện hiện hành trước khi ghi. Không giữ User khi băm.
- M2 commit tin/file và mutation Workspace: cùng Workspace gate; unique/CAS và
  transaction vẫn cần để bảo toàn dữ liệu. Ví dụ trên chỉ là cách ghép; service thật
  sẽ tích hợp trong task tương ứng.
- M4: thứ tự đầy đủ là User → Workspace → channel lifecycle → session mutation.
  Gọi queue/channel từ bên trong callback ngoài khi nghiệp vụ cần, hoàn tất trước
  khi trả callback; không lấy User/Workspace ngược từ callback đang giữ session
  queue. M4 phải kiểm/giữ thứ tự ở queue của mình; SCRUM-19 chưa có queue đó và
  không thể tự phát hiện session lock do miền khác quản lý.
- Revoke/đọc/gửi sau await vẫn kiểm auth, revision, deadline và ACL hiện tại.
  Khóa không thay deny barrier/cleanup, không làm quyền hoặc thời gian ngừng đổi.
- Không giữ khóa khi upload, stream file, chờ client hoặc băm mật khẩu. Reserve và
  commit ngắn trong gate, I/O dài bên ngoài rồi vào lại kiểm state/quyền.

## Giới hạn và lỗi

| Biến                              | Default | Ý nghĩa                                                      |
| --------------------------------- | ------: | ------------------------------------------------------------ |
| `COORDINATOR_MAX_PENDING_PER_KEY` |      64 | Số người chờ mỗi khóa, không tính holder                     |
| `COORDINATOR_MAX_OPERATIONS`      |    1024 | Tổng lượt gốc được nhận, gồm đang chạy/chờ/lấy một phần khóa |
| `COORDINATOR_WAIT_TIMEOUT_MS`     |    5000 | Ngân sách chờ chung cho toàn bộ bước lấy khóa                |

`run` cho phép `waitTimeoutMs` ngắn hơn và `AbortSignal` để hủy khi còn chờ.
Các giá trị khởi đầu chưa là kết quả capacity 25/50. Không có hàng đợi vô hạn;
không tự retry khi đầy. Lỗi `CoordinationError.code`:

- `BUSY`: đầy queue hoặc hết admission toàn process; callback chưa chạy.
- `TIMEOUT`: hết ngân sách lấy khóa; callback chưa chạy.
- `ABORTED`: bị hủy trước callback; callback chưa chạy.
- `INVALID_CONTEXT`: acquire lồng, dùng sai scope, ngoài execution hoặc sau khi nhả.

Consumer chuyển lỗi sang envelope thích hợp khi triển khai handler; không biến lỗi
coordination thành auth thành công. Callback ném lỗi được giữ nguyên, không tự retry.
Khi chờ khóa thứ hai lỗi/hủy, khóa thứ nhất cũng được nhả. FIFO trong mỗi khóa;
không cam kết FIFO toàn cục giữa thao tác cần tập khóa khác nhau.

Hết thời gian chờ hoặc hủy **không cưỡng bức nhả một callback đang chạy**. Consumer
cần truyền signal/deadline cho I/O hỗ trợ hủy và await việc đó kết thúc. Nếu callback
không kết thúc, khóa vẫn được giữ và queue còn lại có giới hạn/hết hạn; không cho
request sau chạy chồng để giả phục hồi. Không có timeout cho thời gian giữ khóa
trong task này.

## Quan sát và kiểm

`stats()` trả operations/keys/pending hiện tại và completed/rejected, tổng waitMs,
holdMs từ khi process khởi động. completed tính callback đã kết thúc kể cả ném lỗi;
rejected tính từ chối admission/acquisition. waitMs/holdMs tính các lượt đã vào
callback, chưa bao gồm thời gian giữ một phần khóa hoặc lượt chờ thất bại. Không
xuất ID/User/email; main ghi snapshot khi shutdown. Chưa có exporter/dashboard hay
số liệu tải kết hợp. `workspaceVisits/workspaceRejected/workspaceWaitMs/
workspaceHoldMs` đo riêng các lượt `withWorkspace`; completed/holdMs cha vẫn bao
trùm cả thời gian chờ/chạy con. Registry khóa được dọn khi hết holder/waiter.

Test: `pnpm exec vitest run apps/server/src/lib/operation-coordinator.test.ts`.
Kiểm FIFO, độc lập scope, User trước Workspace, chuỗi nhiều Workspace dưới User,
hủy/timeout/quá tải, lỗi, drain con và context.
Đây là test cơ chế RAM và consumer giả, chưa chứng minh auth/ACL, Mongo race,
thu media/fanout hay tích hợp session queue thật. M1-T5.3 và các task service cần nối
coordinator này với deny barrier/transaction/adapter; M4 review điểm nối trước dùng.
