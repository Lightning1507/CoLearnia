# Sơ đồ collection MongoDB — CoLearnia

[Bản DBML để copy vào dbdiagram.io](CoLearnia-mongodb.dbml) biểu diễn **13 collection** từ [collection-design](../collection-design.md), sau [review bước 6](../review-2026-11-01.md). Đây là bản trình bày thiết kế, chưa phải database được tạo hoặc script khởi tạo.

## Cách xem và xuất hình

1. Mở file CoLearnia-mongodb.dbml, copy toàn bộ nội dung.
2. Mở [dbdiagram.io](https://dbdiagram.io), tạo diagram và dán vào vùng nhập DBML.
3. Sắp xếp các collection theo nhóm Identity, Workspace, Messaging, Meetings và Operations.
4. Dùng chức năng export của giao diện để lấy ảnh theo định dạng công cụ hỗ trợ.

Bản này dùng cú pháp Table/Ref/Note và nhóm của [DBML](https://dbml.dbdiagram.io/docs/). dbdiagram thiên về cơ sở dữ liệu quan hệ; cách biểu diễn NoSQL bằng notes/embedded fields là một [workaround được mô tả trên cộng đồng của công cụ](https://community.dbdiagram.io/t/modeling-nosql-database-mongodb-etc-with-dbdiagram-a-workaround/3108). Không export SQL từ bản này để khởi tạo MongoDB.

## Cách đọc cho đúng MongoDB

| Ký hiệu trên hình                     | Ý nghĩa trong CoLearnia                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Table                                 | Một collection MongoDB, không phải chuyển dự án sang SQL                                                                  |
| Một dòng field                        | Field của document; _id dùng BSON ObjectId                                                                                |
| Ref                                   | Quan hệ tham chiếu do ứng dụng kiểm, MongoDB không tự enforce foreign key/cascade                                         |
| Document                              | Embedded document; cấu trúc theo loại ghi trong Note và nguồn thiết kế                                                    |
| ObjectId[]                            | Mảng ID tham chiếu; ví dụ attachmentIds có 0–4 phần tử, không cần bảng nối                                                |
| Tên có dấu chấm như scope.channelId   | Đường dẫn bên trong object, được trải ra để nối hình; không thêm field top-level hoặc lưu bản sao ngoài scope             |
| null trên đường dẫn theo variant      | Cách DBML biểu diễn đường dẫn không có ở mọi variant; nguồn quy định loại khác phải **vắng mặt**, không lưu null tùy tiện |
| null trên field nullable thông thường | Field bắt buộc có mặt nhưng được mang null theo trạng thái; không có nghĩa bỏ field                                       |
| UUID như groupId/boardId/epoch        | ID runtime; không tự thêm collection groups/boards từ các ID này                                                          |

Các Ref chỉ vẽ field scalar và một số đường dẫn ObjectId lồng để hình còn đọc được. Mảng participants/attachments và snapshot authorization được mô tả ở notes, không vẽ tất cả cạnh. Ref không chứng minh ACL, đúng Workspace hoặc trạng thái runtime; cardinality có điều kiện đọc theo nguồn collection-design.

**Index:** DBML chỉ đánh dấu các unique đơn/compound không điều kiện để dễ đọc. Partial unique theo kind, unique phiên ACTIVE/ENDING, TTL và index query đầy đủ vẫn ở [integrity-and-migrations](../integrity-and-migrations.md). Không dùng bản vẽ như danh sách index/migration thực thi hoặc tự thêm unique OWNER đã bỏ sau review.

Không có collection cho request DISCUSSION, nhóm, lượt ACTIVITY, board hoặc nét vẽ vì thiết kế giữ chúng ở RAM. File frame chỉ lưu metadata trong files và byte ở kho private.

## Nguồn và bảo trì

Sửa field/quyền/lifecycle tại nguồn chính trước, rồi đồng bộ DBML. Bản DBML là đầu ra để trình bày, không tạo nguồn quyết định thứ hai. Các thư viện/tham số hash, retention metadata và nhánh host còn mở vẫn theo [decision-status](../../decision-status.md).

Đợt tạo bản vẽ không sửa Mongoose/Zod, cài dependency vào project, chạy MongoDB, seed hoặc migration. Việc kiểm cú pháp DBML không chứng minh schema/ACL/database đã chạy.
