# Thiết kế hệ thống Bảng vẽ, Dừng hình và Chú thích trực tiếp (Board, Freeze & Drawing) — Miền M5 (BOARD-01, BOARD-02, BOARD-05, FREEZE-01)

| Thuộc tính                | Giá trị                                         |
| :------------------------ | :---------------------------------------------- |
| **Trạng thái**            | Bản nháp (Đã chuẩn hóa và hợp nhất kiến trúc)   |
| **Tác giả**               | Domain M5 Owner                                 |
| **Kích thước**            | L (Lớn)                                         |
| **Ước lượng kỳ vọng**     | **11.0 ngày công** (dao động 8.5 đến 16.0)      |
| **Yêu cầu chức năng phủ** | FR-06-01 đến FR-06-05 (PB-06)                   |
| **Các tầng bị tác động**  | `packages/contracts`, `apps/server`, `apps/web` |

> **TL;DR** — Miền M5 cung cấp tính năng vẽ chỉ dẫn trực tiếp (live overlay annotation) tại phòng chung MAIN và môi trường dừng hình / vẽ thảo luận đồng bộ (collaborative freeze & canvas drawing) cho các nhóm DISCUSSION và ACTIVITY trong phiên LiveSession.
>
> - **MAIN:** Tuyệt đối không freeze/resume. Chỉ host hiện hành ở MAIN/hướng dẫn được vẽ trực tiếp trên nguồn video chia sẻ bất kỳ tại MAIN (người tham gia khác chỉ xem). Hỗ trợ bút, bảng màu, con trỏ tạm, undo nét của chính mình, clear toàn bộ nét có xác nhận; tùy chọn nét thường (giữ tới khi xóa hoặc nguồn kết thúc) hoặc nét tự biến mất (vanishing strokes). Đổi hoặc dừng nguồn MAIN tự động xóa overlay; chuyển host thu hồi quyền vẽ/clear cũ.
> - **DISCUSSION:** Thành viên trong nhóm cùng freeze/vẽ/resume trên frame ảnh tĩnh chụp từ bài giảng MAIN được kế thừa; cấm share riêng; chỉ tác động phạm vi nhóm thảo luận; luồng âm thanh tiếp tục bình thường.
> - **ACTIVITY:** Thành viên trong nhóm cùng freeze/vẽ/resume trên nguồn screen share duy nhất của nhóm. Nếu đã FROZEN, frame hợp lệ được bảo toàn để giải thích/thảo luận ngay cả khi người đang chia sẻ dừng phát.
> - **Quy trình Freeze 3 bước:** Client chụp hình từ video bằng Canvas `drawImage` -> gọi `board.freeze.begin` lấy intentId (nhả mutation queue của phiên trong thời gian chờ I/O) -> upload ảnh HTTP vào Private File Service (M2) -> gọi `board.freeze.commit` xác nhận (kiểm tra lại quyền, epoch, contextVersion, sourceRevision và kích thước ảnh) -> server chuyển trạng thái sang `FROZEN`, phát event kèm frameId để cả nhóm tải frame tĩnh qua ACL nhóm.
> - **Dữ liệu & Vòng đời:** 100% in-memory trong RAM server cho `BoardRuntime` (BoardState, active intents, danh sách strokes, sequence tracking). Tuyệt đối không tạo collection MongoDB cho nét/board và không ghi điểm vẽ vào DB. Frame ảnh tĩnh sử dụng collection `files` có sẵn (E08/E15) với `purpose: 'FRAME'`, `scope.groupId` bắt buộc, liên kết binding `BOARD_FRAME`. Khi resume hoặc nhóm đóng, context cũ kết thúc và dọn dẹp frame/nét hết tham chiếu theo lifecycle.
> - **Ước lượng:** Size L (gồm Canvas engine FE, Socket.IO real-time protocol, state machine RAM, HTTP upload integration, ACL verification), dự kiến **11.0 ngày công** (khoảng dao động 8.5 – 16.0 ngày công).

---

## Mục lục

- [1. Context](#1-context)
  - [1.1 Bài toán nghiệp vụ](#11-bài-toán-nghiệp-vụ)
  - [1.2 Hiện trạng mã nguồn và kiến trúc](#12-hiện-trạng-mã-nguồn-và-kiến-trúc)
  - [1.3 Các quyết định nền tảng đã chốt (Baseline)](#13-các-quyết-định-nền-tảng-đã-chốt-baseline)
  - [1.4 Tài liệu tham chiếu](#14-tài-liệu-tham-chiếu)
- [2. Objective](#2-objective)
- [3. Goals và Non-goals](#3-goals-và-non-goals)
  - [3.1 Goals](#31-goals)
  - [3.2 Non-goals](#32-non-goals)
  - [3.3 Truy vết yêu cầu chức năng (Traceability Matrix)](#33-truy-vết-yêu-cầu-chức-năng-traceability-matrix)
- [4. Open questions và assumptions](#4-open-questions-và-assumptions)
- [5. High-level design](#5-high-level-design)
  - [5.1 Bốn trụ cột kiến trúc](#51-bốn-trụ-cột-kiến-trúc)
  - [5.2 Sơ đồ kiến trúc tổng thể](#52-sơ-đồ-kiến-trúc-tổng-thể)
  - [5.3 Máy trạng thái của Board](#53-máy-trạng-thái-của-board)
  - [5.4 Bảng chuyển trạng thái chi tiết](#54-bảng-chuyển-trạng-thái-chi-tiết)
  - [5.5 Entrypoints và lý do lựa chọn](#55-entrypoints-và-lý-do-lựa-chọn)
  - [5.6 Các thành phần bị tác động](#56-các-thành-phần-bị-tác-động)
  - [5.7 Các phương án đã cân nhắc](#57-các-phương-án-đã-cân-nhắc)
- [6. Detailed design](#6-detailed-design)
  - [6.1 Cấu trúc dữ liệu](#61-cấu-trúc-dữ-liệu)
  - [6.2 Hợp đồng Socket.IO và HTTP](#62-hợp-đồng-socketio-và-http)
  - [6.3 Phân quyền](#63-phân-quyền)
  - [6.4 Chuẩn hóa tọa độ và khử trôi nét](#64-chuẩn-hóa-tọa-độ-và-khử-trôi-nét)
  - [6.5 Giới hạn và biên an toàn](#65-giới-hạn-và-biên-an-toàn)
  - [6.6 Quản lý vòng đời](#66-quản-lý-vòng-đời)
  - [6.7 Rollout, flag và observability](#67-rollout-flag-và-observability)
  - [6.8 Chiến lược kiểm thử](#68-chiến-lược-kiểm-thử)
- [7. Ảnh hưởng tới các miền khác](#7-ảnh-hưởng-tới-các-miền-khác)
- [8. Design evaluation](#8-design-evaluation)
  - [8.1 Effort](#81-effort)
  - [8.2 Risk & Mitigation](#82-risk--mitigation)
  - [8.3 Ma trận rủi ro](#83-ma-trận-rủi-ro)
- [9. WBS (Work Breakdown Structure)](#9-wbs-work-breakdown-structure)
  - [9.1 Danh sách công việc](#91-danh-sách-công-việc)
  - [9.2 Đồ thị phụ thuộc](#92-đồ-thị-phụ-thuộc)
- [10. Estimation](#10-estimation)
  - [10.1 Bảng tổng hợp ước lượng công số](#101-bảng-tổng-hợp-ước-lượng-công-số)
  - [10.2 Giả định và tỷ lệ độ biến động](#102-giả-định-và-tỷ-lệ-độ-biến-động)
  - [10.3 Đối soát công số WBS và Ước lượng kỳ vọng](#103-đối-soát-công-số-wbs-và-ước-lượng-kỳ-vọng)
- [Appendix](#appendix)
  - [A. Đề xuất Zod Schemas](#a-đề-xuất-zod-schemas-packagescontractssrcboardts)
  - [B. Danh mục mã lỗi nghiệp vụ](#b-danh-mục-mã-lỗi-nghiệp-vụ)
  - [C. Từ điển thuật ngữ (Glossary)](#c-từ-điển-thuật-ngữ-glossary)

---

## 1. Context

Trong nền tảng học tập trực tuyến CoLearnia, trải nghiệm tương tác thị giác trong các buổi học trực tiếp (LiveSession) đòi hỏi sự kết hợp chặt chẽ giữa giảng viên và người học ở từng ngữ cảnh phòng họp.

### 1.1 Bài toán nghiệp vụ

|   #   | Tác nhân                  | Nhu cầu tương tác                                                                                                  | Phạm vi áp dụng |
| :---: | :------------------------ | :----------------------------------------------------------------------------------------------------------------- | :-------------- |
| **1** | **Giảng viên / Host**     | Giải thích, ghi chú trực tiếp lên bài giảng hoặc màn hình chia sẻ tại phòng chung                                  | **MAIN**        |
| **2** | **Người học (Thảo luận)** | "Chụp lại" một khoảnh khắc bài giảng để cùng khoanh vùng, ghi chú, trao đổi mà không làm gián đoạn bài giảng chung | **DISCUSSION**  |
| **3** | **Người học (Hoạt động)** | Cùng phân tích, chú thích trên màn hình làm việc nhóm độc lập                                                      | **ACTIVITY**    |

### 1.2 Hiện trạng mã nguồn và kiến trúc

| Hạng mục             | Hiện trạng                                                            | Ghi chú kỹ thuật                                               |
| :------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------- |
| **Monorepo**         | Tổ chức bằng `pnpm`                                                   | Quản lý đa gói packages & apps                                 |
| **Backend**          | Fastify + Socket.IO (`apps/server`)                                   | Xử lý logic nghiệp vụ và signaling thời gian thực              |
| **Frontend**         | React + Vite + Canvas (`apps/web`)                                    | Giao diện tương tác và render đồ họa                           |
| **Hợp đồng chung**   | `packages/contracts`                                                  | Định nghĩa Zod schemas dùng chung cho FE/BE                    |
| **Media WebRTC**     | mediasoup SFU worker                                                  | Truyền phát luồng âm thanh và video                            |
| **Cơ sở dữ liệu**    | MongoDB replica set                                                   | Lưu trữ dữ liệu cấu trúc bền vững                              |
| **Mã nghiệp vụ M5**  | Chưa có                                                               | Hiện tại scaffold chỉ có khung vỏ ứng dụng và media worker mẫu |
| **Dữ liệu bền vững** | Đã chốt **13 collection** tại [mô hình dữ liệu](../database/model.md) | Tuyệt đối không tạo thêm collection mới cho board/strokes      |
| **Dữ liệu realtime** | Trạng thái phiên, nhóm, bảng vẽ nằm trong **RAM server**              | Quản lý theo [vòng đời dữ liệu](../database/lifecycle.md)      |

### 1.3 Các quyết định nền tảng đã chốt (Baseline)

Theo [tài liệu cộng tác bảng vẽ](../product/board-collaboration.md), [chế độ nhóm](../product/group-modes.md), [chính sách media](../product/groups-media-policy.md) và [trạng thái quyết định](../decision-status.md):

- **B1. Phân định quyền 3 lớp:** Quyền Workspace (owner/admin/member) $
  ightarrow$ Quyền Session (host/member) $
  ightarrow$ Quyền Scope/Grant cụ thể (quyền vẽ, quyền freeze theo ngữ cảnh).
- **B2. Quy tắc tại MAIN:** Tuyệt đối không có thao tác freeze hoặc resume. Chỉ host hiện hành ở MAIN có quyền vẽ và clear. Nét vẽ gắn với `sourceRevision` của nguồn chia sẻ; khi nguồn dừng hoặc đổi, server tự động xóa overlay LIVE. Đổi host sẽ thu hồi quyền vẽ và clear của host cũ, đồng thời kiểm tra lại mọi mutation đang chờ.
- **B3. Quy tắc tại DISCUSSION và ACTIVITY:** Freeze, resume và vẽ chung là thao tác đồng thuận trong nhóm, tác động tới toàn bộ thành viên nhóm nhưng hoàn toàn cách ly với MAIN và nhóm khác.
- **B4. Hệ tọa độ Canvas chuẩn hóa:** Tọa độ nét vẽ được lưu và truyền đi dưới dạng tỷ lệ tương đối `[0, 1]` trên vùng hình ảnh thực tế (đã loại bỏ letterbox/pillarbox). Đảm bảo không trôi nét khi thay đổi kích thước cửa sổ (resize) hoặc mật độ điểm ảnh (DPR).
- **B5. Tách bạch lưu trữ:** Nét vẽ và trạng thái bảng chỉ tồn tại trong RAM runtime trong suốt thời gian context còn sống. Frame ảnh tĩnh sử dụng hạ tầng Private File Service (M2). Không lưu trữ bài làm vĩnh viễn (không `artifact.save`, không export thư viện bài giảng).

### 1.4 Tài liệu tham chiếu

| Tài liệu                                                                           | Nội dung và vai trò tham chiếu                         |
| :--------------------------------------------------------------------------------- | :----------------------------------------------------- |
| [`docs/product/board-collaboration.md`](../product/board-collaboration.md)         | Đặc tả nghiệp vụ vẽ MAIN và freeze/vẽ trong nhóm       |
| [`docs/product/delivery-domains.md`](../product/delivery-domains.md)               | Phân chia trách nhiệm Miền M5 và các giao điểm M1–M4   |
| [`docs/product/functional-requirements.md`](../product/functional-requirements.md) | FR-06-01 đến FR-06-05 (PB-06)                          |
| [`docs/database/collection-design.md`](../database/collection-design.md)           | Thiết kế collection `files` và cấu trúc scope `FRAME`  |
| [`docs/database/lifecycle.md`](../database/lifecycle.md)                           | Vòng đời dữ liệu, dọn dẹp frame và dọn dẹp RAM runtime |

---

## 2. Objective

Xây dựng hệ thống bảng vẽ và dừng hình tương tác trực tiếp (Domain M5) đáp ứng trọn vẹn 5 yêu cầu chức năng từ **FR-06-01 đến FR-06-05**:

|   #    | Mục tiêu cụ thể                                                                            | Tiêu chí quan sát được (Observable Criteria)                                                                            |
| :----: | :----------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **O1** | Cung cấp overlay vẽ trực tiếp tại phòng chung MAIN dành riêng cho host hiện hành           | Phản hồi nét vẽ cục bộ dưới 50ms; đồng bộ tới người xem qua Socket.IO; xóa overlay khi nguồn chia sẻ đổi/dừng.          |
| **O2** | Cho phép thành viên trong nhóm DISCUSSION và ACTIVITY đồng thuận dừng hình một frame video | Cả nhóm chuyển sang `FROZEN`, quan sát cùng một frame tĩnh đồng nhất; luồng âm thanh tiếp tục hoạt động bình thường.    |
| **O3** | Cho phép thành viên trong nhóm cùng vẽ, đánh dấu đồng thời trên frame tĩnh                 | Hỗ trợ vẽ đa người dùng, con trỏ thời gian thực (throttle 20Hz), undo nét của chính mình và clear toàn bộ theo quyền.   |
| **O4** | Đảm bảo tính nhất quán và an toàn tuyệt đối về phân quyền và tương tranh                   | Khóa CAS cho freeze intent, nhả queue phiên trong thời gian upload, kiểm tra epoch/version/sourceRevision trước commit. |
| **O5** | Resume đưa nhóm về luồng trực tiếp mượt mà; giải phóng tài nguyên triệt để                 | Trở lại video trực tiếp ngay lập tức, không xem lại video trễ; không còn frame hoặc nét mồ côi khi đóng nhóm.           |

---

## 3. Goals và Non-goals

### 3.1 Goals

|   Mã   | Tên mục tiêu                   | Mô tả chi tiết                                                                                                                                                                                 | Phủ FR                       |
| :----: | :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------- |
| **G1** | **Host vẽ tại MAIN**           | Chỉ host hiện hành ở MAIN/hướng dẫn được vẽ trên nguồn chia sẻ bất kỳ tại MAIN. Hỗ trợ bút, bảng màu, con trỏ chỉ dẫn, undo nét của mình, clear có xác nhận, nét thường và nét tự biến mất.    | FR-06-01, FR-06-03, FR-06-04 |
| **G2** | **Dừng hình đồng thuận**       | Thành viên có quyền trong DISCUSSION/ACTIVITY khởi tạo dừng hình thành công; toàn nhóm nhận cùng một frame tĩnh; âm thanh và media nền tiếp tục bình thường.                                   | FR-06-02                     |
| **G3** | **Vẽ cộng tác và hoàn tác**    | Nhiều thành viên cùng vẽ đồng thời trên frame tĩnh; hiển thị con trỏ của nhau (throttle 20Hz); undo nét vẽ gần nhất của chính mình; clear toàn bộ bảng theo quyền có hộp thoại xác nhận.       | FR-06-03, FR-06-04           |
| **G4** | **Kiểm soát tương tranh**      | Khi nhiều người cùng bấm freeze, chỉ duy nhất một intent được duyệt; nhả mutation queue của phiên trong suốt thời gian client chụp và upload ảnh HTTP; từ chối commit nếu nguồn đã đổi.        | FR-06-02                     |
| **G5** | **Trở lại trực tiếp (Resume)** | Thành viên nhóm kích hoạt resume đưa nhóm về luồng trực tiếp ngay, hủy pending intent, tăng `boardVersion`, đóng context cũ, không phát lại video trễ.                                         | FR-06-05                     |
| **G6** | **Khử trôi nét vẽ**            | Chuẩn hóa tọa độ về `[0, 1]` theo vùng hiển thị thực của video (loại bỏ letterbox/pillarbox); đảm bảo nét vẽ khớp chính xác trên mọi kích thước màn hình, tỷ lệ khung hình và DPR.             | FR-06-03                     |
| **G7** | **Quản lý vòng đời**           | Tự động xóa overlay MAIN khi nguồn dừng/đổi; giữ frame hợp lệ khi nguồn live dừng trong `FROZEN`; thu hồi quyền khi đổi host; thu quyền cá nhân khi rời nhóm; dọn dẹp frame/nét khi nhóm đóng. | FR-06-04, FR-06-05           |
| **G8** | **Chụp canvas gửi chat**       | Hỗ trợ xuất ảnh chụp màn hình canvas hiện tại kèm nét vẽ thành tệp ảnh để gửi vào chat cuộc họp (M2) dưới dạng tệp đính kèm độc lập có kiểm tra quyền.                                         | FR-06-03                     |

### 3.2 Non-goals

|   Mã    | Tên giới hạn                | Nội dung loại trừ (Non-goal)                                                                                                                                                       |
| :-----: | :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NG1** | **Không freeze tại MAIN**   | Tuyệt đối không cung cấp tính năng freeze/resume tại MAIN; mọi yêu cầu freeze tại MAIN bị server từ chối ngay lập tức.                                                             |
| **NG2** | **Không tracking vật thể**  | Không nhận diện hoặc neo nét theo đối tượng hình ảnh, slide thuyết trình hay cuộn trang web; nét vẽ cố định trên khung tọa độ video.                                               |
| **NG3** | **Không lưu nét vào DB**    | Không tạo collection MongoDB cho bảng vẽ hay nét vẽ; không ghi điểm vẽ xuống cơ sở dữ liệu bền vững.                                                                               |
| **NG4** | **Không lưu trữ vĩnh viễn** | Không cung cấp tính năng lưu bài làm lâu dài (`artifact.save`), thư viện bài giảng hay export ra ngoài phiên; dữ liệu board mất khi phiên kết thúc hoặc server restart.            |
| **NG5** | **Không công bố ra MAIN**   | Khi kết thúc thảo luận/hoạt động hoặc hết giờ TIMER-01, không tự động trình chiếu frame/nét của nhóm ra phòng chung MAIN.                                                          |
| **NG6** | **Không công cụ hình học**  | Không hỗ trợ hình tròn, chữ nhật, mũi tên vector phức tạp, text box soạn thảo văn bản hay nhận diện chữ viết; chỉ hỗ trợ nét vẽ tự do (freehand stroke), tẩy/clear và con trỏ tạm. |
| **NG7** | **Không freeze cá nhân**    | Không hỗ trợ chế độ dừng hình riêng cho từng cá nhân; freeze là trạng thái đồng thuận chung của cả nhóm.                                                                           |

### 3.3 Truy vết yêu cầu chức năng (Traceability Matrix)

| Yêu cầu chức năng (FR) | Nội dung nghiệp vụ                                           | Goal phục vụ   | Task WBS đảm nhiệm           |
| :--------------------- | :----------------------------------------------------------- | :------------- | :--------------------------- |
| **FR-06-01**           | Host vẽ chỉ dẫn trực tiếp tại MAIN                           | G1             | T1, T2, T3, T5, T6, T7, T9   |
| **FR-06-02**           | Dừng hình đồng thuận trong nhóm (DISCUSSION/ACTIVITY)        | G2, G4         | T1, T4, T5, T7, T8, T9, T11  |
| **FR-06-03**           | Vẽ cộng tác, con trỏ, chuẩn hóa tọa độ, chụp canvas gửi chat | G1, G3, G6, G8 | T1, T2, T3, T6, T7, T9, T10  |
| **FR-06-04**           | Undo nét của mình, clear toàn bảng theo quyền, thu hồi quyền | G1, G3, G7     | T1, T5, T6, T7, T9, T11      |
| **FR-06-05**           | Resume trở lại trực tiếp và giải phóng tài nguyên            | G5, G7         | T1, T4, T5, T7, T8, T11, T12 |

---

## 4. Open questions và assumptions

|   #   | Câu hỏi mở / Giả định                                                                        | Tại sao quan trọng                                                                                        | Người phụ trách            | Cần chốt trước         | Trạng thái hiện tại & Đề xuất                                                                                                                                                                                                                                                                 |
| :---: | :------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :------------------------- | :--------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Thời gian tồn tại (TTL) và hiệu ứng mờ dần (fade) của nét tự biến mất (vanishing stroke)** | Ảnh hưởng trực tiếp đến trải nghiệm giảng dạy của host tại MAIN và animation phía client.                 | UI/UX Designer & M5 Owner  | Sprint UI Review       | **Chưa chốt**. Baseline quy định không tự bịa số giây cố định. Giải pháp đề xuất: Tham số hóa cấu hình ở client (dự kiến default 3.0s, fade trong 1.0s) cho tới khi thống nhất sản phẩm.                                                                                                      |
| **2** | **Định dạng và giới hạn kích thước tệp ảnh frame tĩnh khi upload**                           | Ảnh hưởng đến băng thông upload của client, dung lượng Private File Service (M2) và tốc độ tải của peers. | M5 Owner phối hợp M2 Owner | Review Contract M2–M5  | **Giả định**: Chụp canvas dưới dạng `image/webp` (fallback `image/jpeg`), chất lượng 0.85, độ phân giải chụp mặc định tối đa 1920x1080 (hoặc theo video track gốc), dung lượng khống chế $le$ 2.0 MiB/frame; quota phiên tối đa 20 MiB theo baseline. Giới hạn cứng phía server là 2560x1440. |
| **3** | **Xử lý hiện tượng khung hình đen khi chụp video remote chưa giải mã xong**                  | Tránh trường hợp client chụp phải frame đen hoặc frame rỗng khi vừa bắt đầu freeze.                       | M5 Owner & M3 Owner        | Tích hợp Client Canvas | **Giả định**: Client kiểm tra `videoElement.readyState >= 2` và `videoWidth > 0` trước khi capture. Nếu frame đen hoàn toàn do video track chưa render, hiển thị toast cảnh báo người dùng thử lại; không coi mọi ảnh đen là lỗi mạng.                                                        |
| **4** | **Tần suất throttle của con trỏ (cursor) và phân đoạn nét vẽ (stroke points chunking)**      | Cân bằng giữa độ mượt của con trỏ/nét vẽ và tải xử lý của Socket.IO server.                               | M5 Owner                   | Performance Testing    | **Đã thiết kế**: Con trỏ preview batching tối đa 20Hz (mỗi 50ms), cho phép mất gói tin (loss-tolerant). Nét vẽ gửi điểm theo cụm trong khi kéo chuột và commit trọn gói khi nhả chuột (`pointerup`).                                                                                          |
| **5** | **Cơ chế khôi phục khi mất gói tin nét vẽ (sequence gap recovery)**                          | Đảm bảo tính toàn vẹn của bảng vẽ khi mạng gián đoạn nhẹ mà không cần kết nối lại toàn bộ phiên.          | M5 Owner                   | Implementation         | **Đã thiết kế**: Mỗi nét vẽ commit có `strokeSequence` tăng dần; nếu client nhận sequence không liên tục (gap), client tự động gửi yêu cầu `board.sync` để nhận snapshot các nét active hiện tại.                                                                                             |
| **6** | **Sai lệch giữa tổng công số WBS (12.5 pd) và Ước lượng kỳ vọng (11.0 pd)**                  | Cần sự minh bạch và nhất quán giữa phân rã công việc chi tiết và kế hoạch sprint.                         | M5 Owner                   | Estimation Review      | **Đã giải trình**: Tổng công số WBS là 12.5 pd thô theo tuần tự. Sau khi song song hóa luồng FE (T2, T3) và BE (T4, T5, T6), thời lượng thực thi thực tế đạt mức kỳ vọng **11.0 pd** (xem chi tiết tại Mục 10.3).                                                                             |
| **7** | **Thống nhất tên trường file ở bước commit (`fileId` vs `temporaryFileId`)**                 | Tránh lệch tên giữa contract Zod và sequence diagram triển khai.                                          | M5 Owner & M2 Owner        | Review Contract M2–M5  | **Đã chuẩn hóa**: Thống nhất dùng `fileId` trong toàn bộ Zod contract, API và sơ đồ tuần tự (giá trị chính là ID tệp tạm do M2 trả về sau upload).                                                                                                                                            |

---

## 5. High-level design

### 5.1 Bốn trụ cột kiến trúc

| Trụ cột                               | Tầng đảm nhiệm              | Trách nhiệm chính                                                                                                                                                             |
| :------------------------------------ | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rendering & Normalization**         | Client (`apps/web`)         | Render canvas 60fps mượt mà, khử trôi nét bằng phép biến đổi tọa độ chuẩn hóa, chụp frame video qua Web API Canvas.                                                           |
| **Real-time Synchronization**         | Socket.IO                   | Đồng bộ nét vẽ, vị trí con trỏ, thao tác undo/clear và trạng thái board với độ trễ thấp thông qua room Socket.IO phân theo `scopeId`.                                         |
| **State Machine & Intent Management** | `BoardRuntime` (RAM server) | Quản lý trạng thái bảng theo từng scope (`LIVE`, `FREEZING`, `FROZEN`), xử lý tranh chấp khóa CAS cho freeze intent, kiểm tra phân quyền 3 lớp và điều phối vòng đời context. |
| **File Storage Integration**          | Private File Service (M2)   | Tách luồng truyền byte ảnh tĩnh lớn ra khỏi WebSocket bằng HTTP POST upload có kiểm tra quyền và gắn binding với intent.                                                      |

### 5.2 Sơ đồ kiến trúc tổng thể

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif","fontSize":"13px","primaryColor":"#FFFFFF","primaryBorderColor":"#94A3B8","primaryTextColor":"#0F172A","lineColor":"#475569","textColor":"#0F172A","clusterBkg":"#F8FAFC","clusterBorder":"#CBD5E1"},"flowchart":{"curve":"basis","htmlLabels":true}}}%%
flowchart LR
  subgraph ArchitectureFrame ["Khung kiến trúc hệ thống Bảng vẽ và Dừng hình — Miền M5"]
    subgraph ClientApp ["CoLearnia Web Client"]
      UI["Stage / Call Shell (M3)"]
      CanvasOverlay["StageCanvasOverlay (FE Canvas Engine)"]
      Norm["Coordinate Normalizer<br/>(Letterbox & DPR Stripping)"]
      BoardSocketClient["Board Socket Client"]
      FileUploader["HTTP File Uploader"]

      UI --> CanvasOverlay
      CanvasOverlay --> Norm
      Norm --> BoardSocketClient
      CanvasOverlay -.->|"Capture Frame Blob"| FileUploader
    end

    subgraph ServerApp ["CoLearnia Server (Fastify + Socket.IO)"]
      SocketHandler["BoardSocketHandler<br/>(Envelope & Validation)"]
      AclPolicy["BoardAclPolicy<br/>(3 Layers Authorization)"]

      subgraph RAMRuntime ["RAM In-Memory Runtime"]
        BoardRT["BoardRuntime<br/>(BoardState, Strokes, Sequences)"]
        IntentMgr["FreezeIntentManager<br/>(CAS Intent, TTL 15s)"]
      end

      subgraph OtherDomains ["Các miền phối hợp"]
        SessionOrch["Session Orchestrator (M4)<br/>Scope, Lifecycle & Host"]
        MediaReg["Media / Source Registry (M3)<br/>SourceId & SourceRevision"]
        FileSvc["Private File Service (M2)<br/>Upload, Binding & Cleanup"]
      end

      SocketHandler --> AclPolicy
      AclPolicy --> BoardRT
      BoardRT <--> IntentMgr
      BoardRT <--> SessionOrch
      BoardRT <--> MediaReg
      BoardRT -.->|"Verify & Bind Frame"| FileSvc
    end

    subgraph Storage ["Lưu trữ dữ liệu"]
      MongoFiles[("MongoDB<br/>files collection (E08/E15)")]
      DiskStore[("Private File Storage<br/>(Frame JPEG/WebP Bytes)")]
    end

    BoardSocketClient <-->|"Socket.IO Events (board:*)"| SocketHandler
    FileUploader -->|"HTTP POST /api/files/upload (with intentId)"| FileSvc
    FileSvc --> MongoFiles
    FileSvc --> DiskStore
  end

  style ArchitectureFrame fill:#FFFFFF,stroke:#CBD5E1,stroke-width:2px,color:#0F172A
  style ClientApp fill:#F0F9FF,stroke:#0284C7,stroke-width:1.5px,color:#0C4A6E
  style ServerApp fill:#F0FDF4,stroke:#16A34A,stroke-width:1.5px,color:#14532D
  style Storage fill:#FFFBEB,stroke:#D97706,stroke-width:1.5px,color:#78350F
  style RAMRuntime fill:#FFFFFF,stroke:#86EFAC,stroke-width:1px,color:#14532D
  style OtherDomains fill:#FFFFFF,stroke:#94A3B8,stroke-width:1px,stroke-dasharray:3 3,color:#334155

  classDef default fill:#FFFFFF,stroke:#64748B,stroke-width:1px,color:#0F172A
  classDef store fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#78350F
  classDef ext fill:#F8FAFC,stroke:#64748B,stroke-width:1px,stroke-dasharray:3 3,color:#334155

  class MongoFiles,DiskStore store
  class SessionOrch,MediaReg,FileSvc ext
```

### 5.3 Máy trạng thái của Board

Mỗi scope có đúng một `BoardState`. Riêng phòng chung **MAIN**, trạng thái luôn luôn là `LIVE` và không bao giờ chuyển tiếp sang `FREEZING` hay `FROZEN`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, Helvetica, Arial","fontSize":"13px","primaryColor":"#EEF2FF","primaryBorderColor":"#6366F1","primaryTextColor":"#1E1B4B","lineColor":"#475569"}}}%%
stateDiagram-v2
  direction LR
  [*] --> LIVE: Khoi tao context
  LIVE --> FREEZING: board.freeze.begin hop le
  FREEZING --> FROZEN: board.freeze.commit hop le
  FREEZING --> LIVE: Het han 15s / SOURCE_CHANGED / Cancel
  FROZEN --> LIVE: board.resume hop le
  LIVE --> [*]: Nhom dong hoac phien ket thuc
  FREEZING --> [*]: Nhom dong hoac phien ket thuc
  FROZEN --> [*]: Nhom dong hoac phien ket thuc

  note right of LIVE
    Ve tren luong video truc tiep.
    Phòng MAIN luon o trang thai nay.
  end note

  note right of FREEZING
    Mutation queue phien da duoc nha.
    Client dang chup va upload anh HTTP.
  end note

  note right of FROZEN
    Ca nhom xem frame tinh dong nhat.
    Frame giu nguyen ke ca khi nguon live dung.
  end note
```

### 5.4 Bảng chuyển trạng thái chi tiết

| Trạng thái từ | Sự kiện kích hoạt                             | Điều kiện kiểm tra                                                                                                             | Trạng thái đến | Tác dụng phụ trên Server                                                                                                                 |
| :------------ | :-------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- | :------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **LIVE**      | `board.freeze.begin`                          | Thuộc nhóm; scope không phải MAIN; có nguồn video active; `boardVersion` và `sourceRevision` khớp; chưa có intent nào đang chờ | **FREEZING**   | Tạo FreezeIntent `PENDING` (TTL 15s, CAS lock); gán `activeIntentId`; nhả mutation queue của phiên; phát `board.state.updated`           |
| **FREEZING**  | `board.freeze.commit`                         | Đúng actor đã xin intent; intent còn hạn; `sourceRevision` không đổi; tệp upload hợp lệ                                        | **FROZEN**     | Bind file `BOARD_FRAME`, state `READY`; gán `frameId`; intent `COMMITTED`; phát `board.state.updated` kèm `frameId` và `frameUrl`        |
| **FREEZING**  | Quá hạn 15 giây                               | Không nhận được `freeze.commit`                                                                                                | **LIVE**       | Intent `EXPIRED`; giải phóng khóa CAS; gỡ `activeIntentId`; đặt lịch xóa file STAGED; phát `board.state.updated`                         |
| **FREEZING**  | `board.freeze.commit`                         | `sourceRevision` đã đổi trong lúc upload                                                                                       | **LIVE**       | Trả lỗi `SOURCE_CHANGED`; intent `CANCELLED`; đặt lịch xóa file tạm; phát `board.state.updated` đưa nhóm về LIVE                         |
| **FREEZING**  | `board.resume`                                | Thành viên nhóm hợp lệ                                                                                                         | **LIVE**       | Hủy intent đang chờ; tăng `boardVersion`; phát `board.state.updated`                                                                     |
| **FROZEN**    | `board.resume`                                | Thành viên nhóm hợp lệ; `boardVersion` khớp                                                                                    | **LIVE**       | Tăng `boardVersion`; đóng context frame cũ; gỡ bỏ `frameId` và strokes cũ; đặt `cleanupAfter` cho file frame; phát `board.state.updated` |
| **Bất kỳ**    | Đóng nhóm / Hết giờ TIMER-01 / Kết thúc phiên | Tín hiệu từ M4 Session Orchestrator                                                                                            | **HỦY**        | Giải phóng `BoardRuntime` trong RAM; hủy pending intent; đánh dấu `cleanupAfter` cho các frame hết tham chiếu                            |

### 5.5 Entrypoints và lý do lựa chọn

| Entrypoint                   | Công nghệ / Giao thức | Lý do lựa chọn kiến trúc                                                                                                                                                                                                                                                                                              |
| :--------------------------- | :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`board:*` events**         | Socket.IO WebSocket   | Tương tác vẽ và con trỏ đòi hỏi độ trễ cực thấp (<50ms). Socket.IO cho phép broadcast sự kiện ngay lập tức tới các peers trong cùng room `scopeId` mà không phải chịu chi phí kết nối liên tục của HTTP polling.                                                                                                      |
| **`POST /api/files/upload`** | HTTP Multipart (M2)   | Ảnh chụp frame tĩnh có dung lượng từ vài trăm KB đến 2 MB. Nếu truyền byte nhị phân qua WebSocket signaling sẽ gây tắc nghẽn hàng đợi (head-of-line blocking), làm gián đoạn các gói tin điều khiển phiên họp và nét vẽ thời gian thực. Tách luồng upload ảnh sang HTTP bảo đảm băng thông signaling luôn thông suốt. |

### 5.6 Các thành phần bị tác động

- **Frontend (`apps/web`):**
  - `StageCanvasOverlay.tsx`: Component React phủ lên trên video player trong Call Stage của M3, lắng nghe tương tác pointer (chuột, bút cảm ứng, touch).
  - `CanvasRenderer.ts`: Module vẽ Canvas 2D tối ưu hóa (`requestAnimationFrame`, path smoothing với Bezier curves, hỗ trợ vẽ nét thường và animation mờ dần cho nét tự biến mất).
  - `CoordinateNormalizer.ts`: Bộ tính toán hình học, bóc tách vùng video hiển thị thực, loại bỏ letterbox/pillarbox và chuẩn hóa tọa độ `(x, y)` về khoảng `[0.0, 1.0]`.
  - `useBoardSocket.ts`: React Hook quản lý kết nối Socket.IO của board, xử lý optimistic UI update cho nét vẽ cục bộ, lắng nghe remote strokes, con trỏ và khôi phục khi mất gói tin.
  - `CanvasExport.ts`: Công cụ chụp và xuất ảnh canvas hiện tại kèm nét vẽ để gửi vào chat cuộc họp (M2).
- **Backend (`apps/server`):**
  - `BoardRuntime.ts`: Domain service quản lý vòng đời và trạng thái các bảng vẽ trong RAM, lưu trữ danh sách nét vẽ, counter `strokeSequence`, broadcast sự kiện và snapshot.
  - `FreezeIntentManager.ts`: Bộ quản lý đặt chỗ freeze (CAS lock), sinh UUID intent, kiểm tra hạn 15 giây và giải phóng khóa khi quá hạn hoặc bị hủy.
  - `BoardSocketHandler.ts`: Tiếp nhận và xác thực phong bì gói tin Socket.IO, kiểm tra schema Zod từ `@colearnia/contracts`.
  - `BoardAclPolicy.ts`: Kiểm tra phân quyền 3 lớp tại thời điểm xử lý (Workspace membership, Session state, Scope role/grant).
  - `BoardFileIntegration.ts`: Cầu nối với Private File Service (M2): xác thực tệp tải lên, gắn binding `BOARD_FRAME`, đặt lịch dọn dẹp theo vòng đời.
- **Shared Contracts (`packages/contracts`):**
  - `src/board.ts`: Định nghĩa các Zod schema nghiêm ngặt cho BoardState, Stroke, Freeze commands, events và error codes.

### 5.7 Các phương án đã cân nhắc

| Phương án đề xuất                              | Đánh giá kỹ thuật                                                                                                                                                                                                                                                | Quyết định & Lý do                                                                                                                                                                       |
| :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Lưu toàn bộ nét vẽ vào MongoDB**          | Một phiên thảo luận có thể sinh ra hàng chục nghìn điểm vẽ mỗi phút. Việc ghi từng nét hoặc từng điểm vào MongoDB sẽ làm tê liệt I/O cơ sở dữ liệu, phá vỡ baseline kiến trúc 13 collection và vi phạm nguyên tắc vòng đời.                                      | **Bác bỏ**. Toàn bộ nét vẽ được lưu trữ trong RAM `BoardRuntime`, phục vụ đồng bộ tức thời và snapshot khi socket reconnect ngắn hạn. Khi phiên kết thúc, RAM được giải phóng hoàn toàn. |
| **2. Truyền frame ảnh qua WebRTC DataChannel** | mediasoup SFU trong scaffold được thiết kế tối ưu cho Media Stream (Audio/Video). Mở thêm DataChannel cho từng client để truyền ảnh tĩnh dung lượng lớn làm tăng độ phức tạp của media worker, khó kiểm soát quota và khó áp dụng phân quyền tải tệp thống nhất. | **Bác bỏ**. Tận dụng Private File Service (M2) sẵn có để lưu trữ byte và kiểm tra quyền tải theo ACL của nhóm.                                                                           |
| **3. Lưu tọa độ pixel tuyệt đối**              | Kích thước cửa sổ trình duyệt và độ phân giải màn hình của mỗi người dùng là hoàn toàn khác nhau. Lưu tọa độ tuyệt đối sẽ khiến nét vẽ bị lệch hoàn toàn khi hiển thị trên các màn hình khác nhau.                                                               | **Bác bỏ**. Bắt buộc sử dụng hệ tọa độ chuẩn hóa tương đối `[0, 1]` trên khung hình gốc của video.                                                                                       |

---

## 6. Detailed design

### 6.1 Cấu trúc dữ liệu

#### 6.1.1 Lưu trữ bền vững (MongoDB)

Miền M5 tuân thủ nghiêm ngặt nguyên tắc **không tạo collection mới** trong MongoDB (giữ nguyên 13 collection đã chốt). M5 chỉ tương tác với collection `files` (E08/E15) để lưu metadata của ảnh frame dừng hình.

Vòng đời trạng thái của document trong collection `files`:

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, Helvetica, Arial","fontSize":"13px","primaryColor":"#FEF3C7","primaryBorderColor":"#D97706","primaryTextColor":"#78350F","lineColor":"#475569"}}}%%
stateDiagram-v2
  direction LR
  [*] --> STAGED: Upload thanh cong, gan intentId
  STAGED --> READY: freeze.commit hop le, bind BOARD_FRAME
  STAGED --> DELETE_PENDING: Intent het han hoac SOURCE_CHANGED
  READY --> DELETE_PENDING: Resume hoac nhom dong, dat cleanupAfter
  DELETE_PENDING --> [*]: Sweeper xoa file va metadata
```

Cấu trúc document trong collection `files` khi lưu frame tĩnh:

```ts
{
  _id: ObjectId("..."),
  storageKey: "workspaces/.../sessions/.../frames/frame-uuid.webp",
  purpose: "FRAME",                          // Đánh dấu rõ mục đích sử dụng
  mimeType: "image/webp",
  sizeBytes: 458920,
  dimensions: { width: 1920, height: 1080 },
  state: "READY",                            // STAGED -> READY -> DELETE_PENDING
  scope: {
    sessionId: ObjectId("..."),
    epoch: "epoch-uuid",
    boardId: "board-uuid",
    contextVersion: 1,
    groupId: "group-uuid"                    // Bắt buộc cho DISCUSSION / ACTIVITY; MAIN không có
  },
  authorization: {
    memberships: [{ membershipId: ObjectId("..."), incarnation: 1, revision: 0 }],
    channel: { channelId: ObjectId("..."), revision: 0 }
  },
  binding: {
    kind: "BOARD_FRAME",
    intentId: "intent-uuid"                  // Gắn kết với freeze intent đã được cấp
  },
  expiresAt: null,                           // Null sau khi đã commit thành công
  cleanupAfter: null,                        // Sẽ được đặt lịch khi resume hoặc nhóm đóng
  createdAt: ISODate("2026-11-03T..."),
  updatedAt: ISODate("2026-11-03T...")
}
```

#### 6.1.2 Cấu trúc dữ liệu trong bộ nhớ (RAM BoardRuntime)

Toàn bộ trạng thái hoạt động của bảng vẽ được quản lý bởi `BoardRuntime` trong RAM server:

```ts
export type BoardStatus = 'LIVE' | 'FREEZING' | 'FROZEN';

export interface BoardState {
  id: string; // RuntimeId UUID
  sessionId: string; // LiveSession ID
  scopeId: string; // MAIN scope ID hoặc Group ID
  scopeType: 'MAIN' | 'DISCUSSION' | 'ACTIVITY';
  version: number; // Tăng mỗi khi resume hoặc đổi context
  status: BoardStatus; // MAIN luôn luôn là 'LIVE'
  sourceScopeId: string; // MAIN cho DISCUSSION; Group scope cho ACTIVITY
  sourceId: string | null; // ID của producer/stream màn hình đang share
  sourceRevision: number; // Phiên bản của nguồn video từ M3
  frameId: string | null; // ID tệp frame tĩnh trong files collection (khi FROZEN)
  frameUrl: string | null; // URL có chữ ký/kiểm tra quyền để client tải frame
  strokeSequence: number; // Counter tăng dần cho mỗi nét vẽ commit
  activeIntentId: string | null; // IntentId đang trong quá trình freeze (khi FREEZING)
  createdAt: number;
  updatedAt: number;
}

export interface Stroke {
  id: string; // UUID do client sinh
  boardId: string;
  contextVersion: number; // Khớp với version của BoardState tại thời điểm vẽ
  frameId: string | null; // Gắn với frame cụ thể nếu vẽ trong trạng thái FROZEN
  sourceScopeId: string;
  sourceId: string | null;
  sourceRevision: number;
  authorParticipantId: string; // Server gán từ session token, không tin client
  points: Array<{ x: number; y: number }>; // Tọa độ chuẩn hóa 0.0 .. 1.0
  color: string; // Mã màu HEX (vd: "#FF0000")
  width: number; // Độ dày nét vẽ (tỷ lệ chuẩn hóa hoặc pixel quy chuẩn)
  isVanishing: boolean; // True nếu là nét tự biến mất (chỉ MAIN hoặc LIVE nhóm)
  createdAt: number; // Server timestamp (epoch ms)
  isTombstoned: boolean; // True khi bị undo (đánh dấu xóa mềm trong runtime)
}

export interface FreezeIntent {
  intentId: string; // UUID
  boardId: string;
  scopeId: string;
  requestedByParticipantId: string;
  sourceRevision: number; // Bắt buộc khớp với revision tại thời điểm begin
  expiresAt: number; // Timestamp hết hạn (hiệu lực 15 giây)
  status: 'PENDING' | 'COMMITTED' | 'EXPIRED' | 'CANCELLED';
}
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, Helvetica, Arial","fontSize":"13px","primaryColor":"#EEF2FF","primaryBorderColor":"#6366F1","primaryTextColor":"#1E1B4B","lineColor":"#64748B","clusterBkg":"#F8FAFC","clusterBorder":"#CBD5E1"},"classDiagram":{"htmlLabels":true}}}%%
classDiagram
  direction LR
  class BoardState {
    +string id
    +string scopeId
    +string scopeType
    +int version
    +BoardStatus status
    +string sourceId
    +int sourceRevision
    +string frameId
    +int strokeSequence
    +string activeIntentId
  }

  class Stroke {
    +string id
    +string boardId
    +int contextVersion
    +string authorParticipantId
    +Array~Point~ points
    +string color
    +float width
    +bool isVanishing
    +bool isTombstoned
  }

  class FreezeIntent {
    +string intentId
    +string boardId
    +string requestedByParticipantId
    +int sourceRevision
    +int expiresAt
    +IntentStatus status
  }

  class FileMetadata {
    +ObjectId _id
    +string storageKey
    +string purpose
    +Object scope
    +Object binding
    +string state
  }

  BoardState "1" *-- "0..500" Stroke : "chứa trong RAM"
  BoardState "1" o-- "0..1" FreezeIntent : "quản lý trong RAM"
  BoardState ..> FileMetadata : "tham chiếu qua frameId khi FROZEN"
```

#### 6.1.3 Bất biến dữ liệu (Invariants)

|   #   | Mã bất biến | Nội dung bất biến bắt buộc duy trì                                                                                                 |
| :---: | :---------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **I1**      | Mỗi scope có tối đa một `BoardState` và tối đa một intent `PENDING` tại mọi thời điểm.                                             |
| **2** | **I2**      | `status = 'FREEZING'` khi và chỉ khi `activeIntentId` khác null.                                                                   |
| **3** | **I3**      | `status = 'FROZEN'` khi và chỉ khi `frameId` khác null.                                                                            |
| **4** | **I4**      | Scope **MAIN** luôn có `status = 'LIVE'`, `frameId = null`, `activeIntentId = null`.                                               |
| **5** | **I5**      | Mọi `Stroke` hợp lệ phải có `contextVersion` bằng `BoardState.version` hiện tại; nét thuộc version cũ bị loại bỏ khi version tăng. |
| **6** | **I6**      | `authorParticipantId` bắt buộc do server gán từ session token; mọi giá trị client tự gửi lên cho trường này đều bị bỏ qua.         |
| **7** | **I7**      | Số lượng nét vẽ hoạt động (chưa tombstone) trong một context không vượt quá **500 nét**.                                           |
| **8** | **I8**      | Counter `strokeSequence` tăng đơn điệu nghiêm ngặt, không bao giờ giảm trong suốt vòng đời của một `BoardState`.                   |

---

### 6.2 Hợp đồng Socket.IO và HTTP

#### 6.2.1 Danh mục lệnh Client gửi lên Server (Commands)

| Tên sự kiện / Command | Hướng                                                                      | Dữ liệu gửi (Payload)                                                                                  | Phản hồi (Ack / Broadcast)                                                                                          | Xử lý lỗi / Error codes |
| :-------------------- | :------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :---------------------- |
| `board.freeze.begin`  | Client $                                                                   |
| ightarrow$ Server     | `{ scopeId, boardVersion, sourceRevision }`                                | Ack: `{ intentId, expiresAt, uploadUrl }`<br/>Broadcast: `board.state.updated` (`status: 'FREEZING'`)  | `NOT_IN_GROUP`, `FREEZE_NOT_ALLOWED_IN_MAIN`, `NO_ACTIVE_SOURCE`, `CONCURRENT_FREEZE_IN_PROGRESS`, `STALE_REVISION` |
| `board.freeze.commit` | Client $                                                                   |
| ightarrow$ Server     | `{ intentId, fileId, dimensions: { width, height } }`                      | Ack: `{ success: true, frameId }`<br/>Broadcast: `board.state.updated` (`status: 'FROZEN'`, `frameId`) | `INTENT_EXPIRED`, `INTENT_INVALID`, `SOURCE_CHANGED`, `FILE_NOT_FOUND`, `INVALID_DIMENSIONS`                        |
| `board.resume`        | Client $                                                                   |
| ightarrow$ Server     | `{ scopeId, boardVersion }`                                                | Ack: `{ success: true, newVersion }`<br/>Broadcast: `board.state.updated` (`status: 'LIVE'`)           | `NOT_IN_GROUP`, `NOT_FROZEN`, `STALE_VERSION`, `PERMISSION_DENIED`                                                  |
| `board.stroke.draw`   | Client $                                                                   |
| ightarrow$ Server     | `{ strokeId, scopeId, contextVersion, points, color, width, isVanishing }` | Ack: `{ strokeId, sequence }`<br/>Broadcast: `board.stroke.added`                                      | `PERMISSION_DENIED`, `NOT_HOST`, `INVALID_CONTEXT`, `PAYLOAD_TOO_LARGE`, `INVALID_COORDINATES`                      |
| `board.stroke.undo`   | Client $                                                                   |
| ightarrow$ Server     | `{ scopeId, strokeId }`                                                    | Ack: `{ success: true }`<br/>Broadcast: `board.stroke.undone` (`{ strokeId }`)                         | `STROKE_NOT_FOUND`, `NOT_STROKE_AUTHOR`, `CONTEXT_EXPIRED`                                                          |
| `board.clear`         | Client $                                                                   |
| ightarrow$ Server     | `{ scopeId, contextVersion }`                                              | Ack: `{ success: true }`<br/>Broadcast: `board.cleared` (`{ scopeId, contextVersion }`)                | `PERMISSION_DENIED`, `NOT_AUTHORIZED_TO_CLEAR`, `CONTEXT_EXPIRED`                                                   |
| `board.cursor`        | Client $                                                                   |
| ightarrow$ Server     | `{ scopeId, x, y, isDrawing, color }`                                      | Không ack; Broadcast: `board.cursor.moved` (throttle 20Hz)                                             | Bỏ qua nếu sai scope (loss-tolerant)                                                                                |
| `board.sync`          | Client $                                                                   |
| ightarrow$ Server     | `{ scopeId, lastSequence }`                                                | Ack: `{ state: BoardState, activeStrokes: Stroke[] }`                                                  | `SCOPE_NOT_FOUND`, `PERMISSION_DENIED`                                                                              |

#### 6.2.2 Danh mục sự kiện Server phát xuống Client (Broadcast Events)

| Tên sự kiện           | Khi nào phát ra                                                                   | Dữ liệu kèm theo (Payload)                                                           | Phạm vi nhận (Room)                                                              |
| :-------------------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| `board.state.updated` | Mọi chuyển trạng thái (`FREEZING`, `FROZEN`, `LIVE`) hoặc tăng version            | `BoardState` đã cập nhật; khi FROZEN kèm theo `frameId` và `frameUrl`                | Toàn bộ thành viên trong room `scopeId`                                          |
| `board.stroke.added`  | Nét vẽ mới vừa được commit thành công vào RAM                                     | Đối tượng `Stroke` đầy đủ kèm theo `strokeSequence`                                  | Toàn bộ thành viên trong room `scopeId` (trừ người gửi nếu đã render optimistic) |
| `board.stroke.undone` | Nét vẽ được hoàn tác (undo) thành công                                            | `{ strokeId: string }`                                                               | Toàn bộ thành viên trong room `scopeId`                                          |
| `board.cleared`       | Toàn bộ nét bị xóa bởi người có quyền, hoặc overlay MAIN bị xóa do đổi/dừng nguồn | `{ scopeId: string, contextVersion: number, reason?: string }`                       | Toàn bộ thành viên trong room `scopeId`                                          |
| `board.cursor.moved`  | Tọa độ con trỏ của peer di chuyển (đã throttle)                                   | `{ participantId: string, x: number, y: number, isDrawing: boolean, color: string }` | Toàn bộ thành viên trong room `scopeId` (trừ chính người gửi)                    |

#### 6.2.3 Quy tắc xử lý chung cho mọi lệnh (Pipeline Rules)

1. **Feature flag check:** Kiểm tra `feature.board.enabled`. Nếu tắt, từ chối ngay lập tức mà không làm ảnh hưởng luồng media.
2. **Schema validation:** Kiểm tra payload bằng Zod schema tương ứng từ `@colearnia/contracts`. Nếu sai cấu trúc, trả lỗi validation và ngừng xử lý.
3. **Session authentication:** Xác thực socket connection; trích xuất `participantId` từ session token của server, tuyệt đối không tin cậy dữ liệu client gửi.
4. **Phân quyền 3 lớp:** Kiểm tra quyền theo ma trận tại Mục 6.3. Trả về `PERMISSION_DENIED` hoặc mã lỗi cụ thể nếu không đủ quyền.
5. **Phiên bản & Tương tranh:** Kiểm tra `boardVersion`, `contextVersion` và `sourceRevision` khớp với trạng thái hiện tại. Nếu lệch, trả về `STALE_VERSION` hoặc `STALE_REVISION`.
6. **Thực thi trong runtime:** Cập nhật `BoardRuntime` trong RAM, tăng `strokeSequence` tuần tự.
7. **Broadcast & Observability:** Phát broadcast tới room `scopeId`, ghi structured log và cập nhật Prometheus metric.

---

#### 6.2.4 Sequence Diagram 1: Quy trình Dừng hình (Freeze Flow)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (Nguoi bam Freeze)
  participant S as BoardRuntime / Server
  participant F as Private File Service (M2)
  participant G as Thanh vien khac trong nhom

  rect rgb(238, 242, 255)
    Note over C,S: Buoc 1: Xin intent dung hinh
    C->>S: board.freeze.begin(scopeId, boardVersion, sourceRevision)
    S->>S: Kiem tra quyen nhom, pha, nguon video hop le
    S->>S: Tao FreezeIntent (TTL 15s, CAS lock)
    S-->>C: Ack(intentId, expiresAt, uploadUrl)
    S-)G: board.state.updated(status: FREEZING, activeIntentId)
    Note over S: Nha mutation queue cua phien trong khi client xu ly anh
  end

  rect rgb(240, 253, 244)
    Note over C,F: Buoc 2: Chup va upload anh tinh
    C->>C: Chup frame tu video bang Canvas drawImage()
    C->>C: Nen thanh Blob image/webp
    C->>F: HTTP POST /api/files/upload (intentId, scope.groupId)
    F->>F: Luu byte, tao file record (state: STAGED)
    F-->>C: Tra ve fileId
  end

  rect rgb(254, 243, 199)
    Note over C,S: Buoc 3: Xac nhan dung hinh (Commit)
    C->>S: board.freeze.commit(intentId, fileId, dimensions)
    S->>S: Kiem tra lai actor, epoch, version, sourceRevision
    alt Nguon video da thay doi trong luc upload
      S-->>C: Error(SOURCE_CHANGED)
      S-)G: board.state.updated(status: LIVE)
      S->>F: Dat lich xoa file tam
    else Hop le
      S->>F: Bind file BOARD_FRAME, state READY
      S->>S: Chuyen BoardState sang FROZEN, gan frameId
      S-->>C: Ack(success: true, frameId)
      S-)G: board.state.updated(status: FROZEN, frameId, frameUrl)
      par Tai anh dong thoi
        C->>F: Tai frame tinh, kiem tra ACL nhom
        G->>F: Tai frame tinh, kiem tra ACL nhom
      end
    end
  end
```

---

#### 6.2.5 Sequence Diagram 2: Quy trình Trở lại trực tiếp (Resume Flow)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (Thanh vien nhom)
  participant S as BoardRuntime / Server
  participant F as Private File Service (M2)
  participant G as Thanh vien khac trong nhom

  C->>S: board.resume(scopeId, boardVersion)
  S->>S: Kiem tra quyen thanh vien nhom, kiem tra version
  S->>S: Huy pending intent neu co
  S->>S: Tang boardVersion, chuyen status sang LIVE
  S->>S: Dong context cu, go bo tham chieu frameId va strokes cu
  S->>F: Dat lich don frame cu (cleanupAfter)
  S-->>C: Ack(success: true, newVersion)
  S-)G: board.state.updated(status: LIVE, newVersion, frameId: null)
  Note over C,G: Ca nhom an lop anh tinh, hien thi video truc tiep hien tai
```

---

#### 6.2.6 Sequence Diagram 3: Luồng Vẽ nét và Hoàn tác (Draw & Undo Flow)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (Nguoi ve)
  participant S as BoardRuntime / Server
  participant P as Thanh vien cung scope

  rect rgb(239, 246, 255)
    Note over C,S: Thao tac ve net
    C->>C: Render net cuc bo (optimistic 60fps)
    C->>S: board.stroke.draw(strokeId, contextVersion, points, color, width, isVanishing)
    S->>S: Kiem tra quyen (MAIN chi host, nhom kiem tra membership)
    S->>S: Gan authorParticipantId = session.user.id
    S->>S: Tang strokeSequence, luu Stroke vao RAM
    S-->>C: Ack(strokeId, sequence)
    S-)P: board.stroke.added(stroke)
    P->>P: Render net ve cua peer tren canvas
  end

  rect rgb(254, 242, 242)
    Note over C,S: Thao tac Undo
    C->>S: board.stroke.undo(scopeId, strokeId)
    S->>S: Tim net ve theo strokeId trong context hien tai
    alt Net ve khong thuoc ve nguoi goi
      S-->>C: Error(NOT_STROKE_AUTHOR)
    else Dung tac gia
      S->>S: Danh dau isTombstoned = true
      S-->>C: Ack(success: true)
      S-)P: board.stroke.undone(strokeId)
      C->>C: Xoa net ve khoi canvas
      P->>P: Xoa net ve khoi canvas
    end
  end
```

---

#### 6.2.7 Sequence Diagram 4: Khôi phục khi lệch Sequence (Sequence Gap Recovery)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (Nhan lech goi)
  participant S as BoardRuntime / Server

  Note over C: Client phat hien strokeSequence nhay coc (vi du nhan seq 5 sau seq 2)
  C->>S: board.sync(scopeId, lastSequence: 2)
  S->>S: Kiem tra quyen thanh vien trong scope
  S->>S: Trich xuat BoardState hien tai va danh sach activeStrokes
  S-->>C: Ack(state: BoardState, activeStrokes: Stroke[])
  C->>C: Xoa buffer net ve cuc bo, ve lai toan bo activeStrokes
  Note over C: Canvas dong bo khop 100% voi trang thai RAM server
```

---

### 6.3 Phân quyền

#### 6.3.1 Phân quyền chi tiết (3 Layers Authorization Matrix)

| Thao tác                                 | MAIN                    | DISCUSSION                                     | ACTIVITY                                       | Ghi chú kiểm tra phân quyền                                                                            |
| :--------------------------------------- | :---------------------- | :--------------------------------------------- | :--------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **Vẽ nét (`stroke.draw`)**               | Chỉ Host hiện hành      | Mọi thành viên trong nhóm                      | Mọi thành viên trong nhóm                      | MAIN: Người share khác host bị từ chối; Host hỗ trợ vào ACTIVITY được vẽ trong ACTIVITY đó.            |
| **Bắt đầu dừng hình (`freeze.begin`)**   | **BỊ TỪ CHỐI (Deny)**   | Mọi thành viên trong nhóm                      | Mọi thành viên trong nhóm                      | MAIN trả về `FREEZE_NOT_ALLOWED_IN_MAIN`; DISCUSSION chụp bài giảng MAIN; ACTIVITY chụp màn hình nhóm. |
| **Xác nhận dừng hình (`freeze.commit`)** | **BỊ TỪ CHỐI (Deny)**   | Đúng người đã xin intent                       | Đúng người đã xin intent                       | Kiểm tra intent hợp lệ, chưa hết hạn (15s), khớp `sourceRevision`.                                     |
| **Trở lại trực tiếp (`resume`)**         | **BỊ TỪ CHỐI (Deny)**   | Mọi thành viên trong nhóm                      | Mọi thành viên trong nhóm                      | Đóng context ảnh tĩnh, chuyển về video trực tiếp của nhóm.                                             |
| **Hoàn tác (`stroke.undo`)**             | Chỉ Host (nét của mình) | Tác giả của nét vẽ                             | Tác giả của nét vẽ                             | Không cho phép undo nét vẽ của thành viên khác bằng cách sửa ID.                                       |
| **Xóa toàn bộ (`board.clear`)**          | Chỉ Host hiện hành      | Chủ frame / Chủ nguồn share LIVE / Host hỗ trợ | Chủ frame / Chủ nguồn share LIVE / Host hỗ trợ | Yêu cầu xác nhận ở UI; server kiểm tra quyền trước khi xóa nét trong context.                          |
| **Đồng bộ con trỏ (`cursor`)**           | Chỉ Host hiện hành      | Mọi thành viên trong nhóm                      | Mọi thành viên trong nhóm                      | Loss-tolerant, giới hạn tần suất 20Hz.                                                                 |

#### 6.3.2 Cây quyết định phân quyền vẽ nét

```mermaid
flowchart TD
  Start["Client gui lenh ve net"] --> Q1{"Scope la gi?"}
  Q1 -- "MAIN" --> Q2{"Nguoi gui la Host hien hanh?"}
  Q2 -- "Dung" --> AllowMain["Chap nhan ve net tai MAIN"]
  Q2 -- "Sai" --> DenyMain["Tu choi: NOT_HOST / PERMISSION_DENIED"]
  Q1 -- "DISCUSSION / ACTIVITY" --> Q3{"La thanh vien nhom hop le?"}
  Q3 -- "Dung" --> AllowGroup["Chap nhan ve net trong nhom"]
  Q3 -- "Sai" --> Q4{"La Host dang ho tro ACTIVITY?"}
  Q4 -- "Dung" --> AllowHelp["Chap nhan ve net ho tro"]
  Q4 -- "Sai" --> DenyGroup["Tu choi: NOT_IN_GROUP / PERMISSION_DENIED"]

  classDef allow fill:#DCFCE7,stroke:#16A34A,color:#14532D
  classDef deny fill:#FEE2E2,stroke:#DC2626,color:#7F1D1D
  classDef step fill:#EEF2FF,stroke:#6366F1,color:#1E1B4B

  class Start,Q1,Q2,Q3,Q4 step
  class AllowMain,AllowGroup,AllowHelp allow
  class DenyMain,DenyGroup deny
```

#### 6.3.3 Thu hồi quyền theo sự kiện

| Sự kiện từ hệ thống          | Quyền bị thu hồi                          | Hệ quả đối với các mutation đang chờ                                           |
| :--------------------------- | :---------------------------------------- | :----------------------------------------------------------------------------- |
| **Đổi host tại MAIN**        | Quyền vẽ và clear của host cũ             | Mọi mutation đang chờ bị kiểm tra lại, bị từ chối nếu host không còn hiệu lực. |
| **Thành viên rời nhóm**      | Quyền vẽ, undo, cursor cá nhân trong nhóm | Board chung của nhóm không bị xóa, nét vẽ cũ của thành viên vẫn hiển thị.      |
| **Thành viên rời Workspace** | Toàn bộ quyền trong phiên (qua M1 revoke) | Socket bị ngắt kết nối khỏi room ngay lập tức; mutation đang chờ bị từ chối.   |
| **Host hỗ trợ rời ACTIVITY** | Quyền vẽ trong ACTIVITY đó                | Các nét đã commit trước đó vẫn được giữ nguyên.                                |

---

### 6.4 Chuẩn hóa tọa độ và khử trôi nét

Khi video được render trong khung hiển thị (video container), tùy thuộc vào tỷ lệ khung hình của video gốc $A_{video} = W_v / H_v$ và tỷ lệ của vùng chứa $A_{container} = W_c / H_c$, trình duyệt sẽ chèn thêm các dải đen (letterbox ở trên/dưới hoặc pillarbox ở hai bên).

#### 6.4.1 Thuật toán chuẩn hóa hình học

```mermaid
flowchart TD
  Input["Dau vao: Container (Wc, Hc) va Video (Wv, Hv)"] --> Calc["Tinh Avideo = Wv / Hv va Acontainer = Wc / Hc"]
  Calc --> Check{"Acontainer > Avideo ?"}
  Check -- "Dung (pillarbox)" --> Pillar["Hrender = Hc<br/>Wrender = Hc x Avideo<br/>OffsetX = (Wc - Wrender) / 2, OffsetY = 0"]
  Check -- "Sai (letterbox)" --> Letter["Wrender = Wc<br/>Hrender = Wc / Avideo<br/>OffsetX = 0, OffsetY = (Hc - Hrender) / 2"]
  Pillar --> Norm["Chuan hoa con tro:<br/>x = (Xmouse - OffsetX) / Wrender<br/>y = (Ymouse - OffsetY) / Hrender"]
  Letter --> Norm
  Norm --> InBounds{"0 <= x <= 1 va 0 <= y <= 1 ?"}
  InBounds -- "Hop le" --> Accept["Chap nhan diem, dua vao net ve"]
  InBounds -- "Ngoai vung" --> Discard["Bo qua diem nam trong dai den"]

  classDef step fill:#EEF2FF,stroke:#6366F1,color:#1E1B4B
  classDef ok fill:#DCFCE7,stroke:#16A34A,color:#14532D
  classDef deny fill:#FEE2E2,stroke:#DC2626,color:#7F1D1D

  class Input,Calc,Check,Pillar,Letter,Norm,InBounds step
  class Accept ok
  class Discard deny
```

Công thức tính toán toán học:

$$	ext{Nếu } A_{container} > A_{video}: quad H_{render} = H_c, quad W_{render} = H_c 	imes A_{video}, quad 	ext{Offset}_X = rac{W_c - W_{render}}{2}, quad 	ext{Offset}_Y = 0$$

$$	ext{Nếu } A_{container} le A_{video}: quad W_{render} = W_c, quad H_{render} = W_c / A_{video}, quad 	ext{Offset}_X = 0, quad 	ext{Offset}_Y = rac{H_c - H_{render}}{2}$$

$$x_{norm} = rac{X_{mouse} - 	ext{Offset}_X}{W_{render}}, quad y_{norm} = rac{Y_{mouse} - 	ext{Offset}_Y}{H_{render}} quad (0.0 le x_{norm}, y_{norm} le 1.0)$$

#### 6.4.2 Ví dụ minh họa cụ thể

Giả sử Container có kích thước $1280 imes 720$ (tỷ lệ 16:9), nguồn video gốc là $1440 imes 1080$ (tỷ lệ 4:3):

| Đại lượng hình học       | Giá trị tính toán                                  | Ý nghĩa thực tế                             |
| :----------------------- | :------------------------------------------------- | :------------------------------------------ |
| $A_{container}$          | $1280 / 720 approx 1.778$                          | Tỷ lệ màn hình hiển thị rộng                |
| $A_{video}$              | $1440 / 1080 approx 1.333$                         | Tỷ lệ video vuông hơn container             |
| **Trường hợp**           | $A_{container} > A_{video}$                        | Xuất hiện dải đen hai bên (**Pillarbox**)   |
| $H_{render}$             | $720 ext{ px}$                                     | Chiều cao hiển thị khớp chiều cao container |
| $W_{render}$             | $720 imes 1.333 = 960 ext{ px}$                    | Chiều rộng hiển thị thực của nội dung video |
| $ ext{Offset}_X$         | $(1280 - 960) / 2 = 160 ext{ px}$                  | Dải đen mỗi bên dày 160 px                  |
| **Điểm chạm (640, 360)** | $x = (640 - 160) / 960 = 0.5, y = 360 / 720 = 0.5$ | Điểm chính giữa tâm video, hợp lệ           |
| **Điểm chạm (100, 360)** | $x = (100 - 160) / 960 < 0$                        | Nằm trong dải đen bên trái, bị bỏ qua       |

#### 6.4.3 Quy tắc tọa độ chuẩn hóa

- Mọi tọa độ truyền qua mạng đều là số thực trong khoảng `[0.0, 1.0]`. Server từ chối ngay lập tức điểm nằm ngoài khoảng với mã lỗi `INVALID_COORDINATES`.
- Khi hiển thị, thiết bị nhận tính ngược lại tọa độ pixel dựa trên $W_{render}, H_{render}$ và offset của chính thiết bị đó.
- Tọa độ hoàn toàn độc lập với DPR (`window.devicePixelRatio`); chỉ có canvas backing store được nhân với DPR để hiển thị sắc nét.
- Bắt buộc tính toán lại vùng render khi: resize cửa sổ, thay đổi nguồn chia sẻ, hoặc chuyển giữa video trực tiếp và frame tĩnh.
- Khi `FROZEN`, vùng render dựa trên `dimensions` của frame ảnh tĩnh, không phụ thuộc vào kích thước video track trước đó.

---

### 6.5 Giới hạn và biên an toàn

| Tham số cấu hình                              | Giá trị giới hạn                     | Cơ sở kỹ thuật và hành vi khi vượt ngưỡng                                    |
| :-------------------------------------------- | :----------------------------------- | :--------------------------------------------------------------------------- |
| **Số điểm tối đa mỗi nét**                    | 2.000 điểm                           | Tránh gói tin Socket.IO quá lớn. Vượt quá trả về `PAYLOAD_TOO_LARGE`.        |
| **Độ dày nét vẽ**                             | 1 đến 20 pixel (quy chuẩn)           | Kiểm tra nghiêm ngặt tại Zod schema.                                         |
| **Số nét hoạt động trong một context**        | Tối đa **500 nét**                   | Bảo vệ RAM server không bị rò rỉ. Vượt quá từ chối vẽ thêm.                  |
| **Dung lượng tệp frame ảnh tĩnh**             | Tối đa **2.0 MiB/ảnh**               | Khống chế tại Private File Service M2. Quá dung lượng từ chối upload.        |
| **Độ phân giải frame (Giới hạn cứng Server)** | Tối đa 2560x1440                     | Trả về `INVALID_DIMENSIONS` nếu vượt quá.                                    |
| **Độ phân giải chụp mặc định (Client)**       | Tối đa 1920x1080                     | Client tự động scale về 1080p trước khi nén để tiết kiệm băng thông.         |
| **Định dạng tệp frame**                       | `image/webp` (fallback `image/jpeg`) | Tối ưu dung lượng và tốc độ nén Canvas.                                      |
| **Quota frame theo phiên**                    | Tối đa **20 MiB/phiên**              | Khống chế tại M2; vượt quota báo lỗi không thể dừng hình thêm.               |
| **Thời hạn Freeze Intent (TTL)**              | **15 giây**                          | CAS lock tự giải phóng sau 15 giây nếu client không commit; dọn tệp dở dang. |
| **Tần suất con trỏ (Cursor Throttle)**        | Tối đa 20 gói/giây (50ms/gói)        | Client throttle trước khi gửi; server drop gói thừa (loss-tolerant).         |

---

### 6.6 Quản lý vòng đời

#### 6.6.1 Ma trận sự kiện và tác động

| Sự kiện từ hệ thống khác                             | Phạm vi áp dụng               | Tác động lên BoardRuntime trong RAM                                | Tác động lên File Storage (M2)       |
| :--------------------------------------------------- | :---------------------------- | :----------------------------------------------------------------- | :----------------------------------- |
| **Nguồn MAIN dừng hoặc đổi (`sourceRevision` tăng)** | MAIN                          | Xóa overlay LIVE, phát `board.cleared`                             | Không có (MAIN không có file)        |
| **Đổi host phiên họp (M4)**                          | MAIN, ACTIVITY có host hỗ trợ | Thu hồi quyền vẽ/clear của host cũ; kiểm tra lại mutation đang chờ | Không có                             |
| **Nguồn của nhóm dừng khi đang LIVE**                | DISCUSSION, ACTIVITY          | Overlay LIVE của nhóm bị xóa                                       | Không có                             |
| **Nguồn dừng khi đang FROZEN**                       | DISCUSSION, ACTIVITY          | **Giữ nguyên** frame và nét vẽ để nhóm tiếp tục thảo luận          | Giữ nguyên tệp frame                 |
| **Nguồn đổi khi đang FREEZING**                      | DISCUSSION, ACTIVITY          | Commit trả về `SOURCE_CHANGED`, đưa nhóm về LIVE                   | Tệp `STAGED` bị đặt lịch xóa         |
| **Thành viên rời nhóm**                              | DISCUSSION, ACTIVITY          | Thu quyền cá nhân; không xóa board chung của nhóm                  | Không có                             |
| **Nhóm kích hoạt Resume**                            | DISCUSSION, ACTIVITY          | Tăng `boardVersion`, đóng context cũ, xóa nét cũ trong RAM         | Đặt `cleanupAfter` cho tệp frame cũ  |
| **Nhóm đóng hoặc hết giờ TIMER-01**                  | DISCUSSION, ACTIVITY          | Hủy `BoardRuntime`, hủy pending intent; không mang board ra MAIN   | Đặt `cleanupAfter` cho toàn bộ frame |
| **Phiên họp kết thúc (Session ended)**               | Tất cả scopes                 | Giải phóng toàn bộ runtime RAM                                     | Dọn dẹp toàn bộ frame của phiên      |
| **Server restart đột ngột**                          | Tất cả scopes                 | Mất toàn bộ board trong RAM (theo thiết kế Non-goal NG4)           | Sweeper tự động dọn dẹp file mồ côi  |

#### 6.6.2 Hành vi khi Client Reconnect

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, Helvetica, Arial","fontSize":"13px","primaryColor":"#EEF2FF","primaryBorderColor":"#6366F1","primaryTextColor":"#1E1B4B","lineColor":"#475569"}}}%%
flowchart LR
  R1["Socket Reconnect"] --> R2["Gui board.sync(scopeId, lastSequence)"]
  R2 --> R3{"Scope va quyen con hop le?"}
  R3 -- "Khong" --> R4["SCOPE_NOT_FOUND / PERMISSION_DENIED<br/>Go overlay, thoat room"]
  R3 -- "Co" --> R5{"state.version thay doi?"}
  R5 -- "Co" --> R6["Bo toan bo net cu, ap dung state moi"]
  R5 -- "Khong" --> R7["Thay danh sach net bang activeStrokes"]
  R6 --> R8{"status = FROZEN?"}
  R7 --> R8
  R8 -- "Co" --> R9["Tai frame qua frameUrl (ACL nhom)"]
  R8 -- "Khong" --> R10["Hien video truc tiep va overlay"]

  classDef step fill:#EEF2FF,stroke:#6366F1,color:#1E1B4B
  classDef deny fill:#FEE2E2,stroke:#DC2626,color:#7F1D1D
  classDef ok fill:#DCFCE7,stroke:#16A34A,color:#14532D

  class R1,R2,R3,R5,R6,R7,R8 step
  class R4 deny
  class R9,R10 ok
```

---

### 6.7 Rollout, flag và observability

#### 6.7.1 Feature Flags

| Feature Flag                      | Mặc định             | Phạm vi áp dụng | Mục đích sử dụng                                                                                                                |
| :-------------------------------- | :------------------- | :-------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `feature.board.enabled`           | `true` (dev/staging) | Toàn hệ thống   | Bật/tắt toàn bộ tính năng bảng vẽ và dừng hình. Khi tắt, client ẩn UI và server từ chối socket events mà không ảnh hưởng media. |
| `feature.board.vanishing_strokes` | `true`               | Client & Server | Bật/tắt chế độ nét tự biến mất cho host tại MAIN.                                                                               |

#### 6.7.2 Structured Logs

Mỗi thao tác quan trọng ghi một log JSON gồm các trường:

| Trường               | Kiểu dữ liệu       | Ý nghĩa                                                             |
| :------------------- | :----------------- | :------------------------------------------------------------------ |
| `timestamp`          | ISO String / Epoch | Thời điểm thực hiện                                                 |
| `scopeId`, `boardId` | UUID String        | Định danh phạm vi và bảng vẽ                                        |
| `action`             | Enum String        | `FREEZE_BEGIN`, `FREEZE_COMMIT`, `RESUME`, `STROKE_COMMIT`, `CLEAR` |
| `actorId`            | String             | Định danh người dùng thực hiện                                      |
| `sourceRevision`     | Number             | Phiên bản nguồn chia sẻ tại thời điểm xử lý                         |
| `durationMs`         | Number             | Thời gian xử lý thao tác (ms)                                       |

> [!WARNING]
> Tuyệt đối không log tọa độ chi tiết của nét vẽ hoặc dữ liệu nhị phân của ảnh để tránh làm tràn đĩa cứng log.

#### 6.7.3 Metrics (Prometheus)

| Metric                                      | Kiểu      | Nhãn (Labels)                | Mục đích giám sát                                              |
| :------------------------------------------ | :-------- | :--------------------------- | :------------------------------------------------------------- |
| `colearnia_board_freeze_intent_total`       | Counter   | `scope_type`, `status`       | Đếm số lần yêu cầu freeze (thành công, quá hạn, xung đột race) |
| `colearnia_board_freeze_commit_duration_ms` | Histogram | —                            | Biểu đồ thời gian từ khi begin đến khi commit hoàn tất         |
| `colearnia_board_strokes_total`             | Counter   | `scope_type`, `is_vanishing` | Tổng số nét vẽ được commit thành công                          |
| `colearnia_board_active_contexts`           | Gauge     | —                            | Số lượng bảng vẽ đang hoạt động đồng thời trong RAM server     |

#### 6.7.4 Cảnh báo (Alerts)

| Điều kiện cảnh báo                                     | Ngưỡng kích hoạt                | Mức độ             | Hành động ứng phó                                                     |
| :----------------------------------------------------- | :------------------------------ | :----------------- | :-------------------------------------------------------------------- |
| Tỷ lệ freeze commit thất bại (timeout hoặc lỗi upload) | Vượt 15% trong 10 phút liên tục | Cảnh báo (Warning) | Kiểm tra băng thông upload client và kết nối Private File Service M2. |
| Số lượng frame mồ côi chưa dọn                         | Vượt 50 tệp trong 1 giờ         | Cảnh báo (Warning) | Kiểm tra hoạt động của sweeper dọn dẹp file định kỳ.                  |

#### 6.7.5 Kế hoạch Rollback và dọn dẹp

- Nếu xảy ra lỗi nghiêm trọng, lập tức tắt feature flag `feature.board.enabled`.
- Khi cờ tắt: client tự động ẩn nút vẽ/freeze; server từ chối các event `board:*` nhưng không ảnh hưởng tới luồng media âm thanh/video chính.
- Không cần rollback schema database vì không có bảng/collection mới nào được tạo trong MongoDB.
- Chạy sweeper thủ công để dọn dẹp các file `STAGED` và `DELETE_PENDING` còn sót lại.

---

### 6.8 Chiến lược kiểm thử

#### 6.8.1 Unit Tests

| Module                 | Nội dung kiểm thử                                                                                                                                               |
| :--------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CoordinateNormalizer` | Kiểm tra chính xác với tỷ lệ 16:9, 4:3, 21:9; loại bỏ hoàn toàn letterbox/pillarbox; DPR 1x, 2x, 3x không làm lệch tọa độ; loại bỏ điểm chạm nằm trong dải đen. |
| `FreezeIntentManager`  | Cấp intent thành công; từ chối intent thứ 2 khi intent thứ 1 đang chờ (CAS lock); tự động hết hạn sau 15 giây; giải phóng khóa khi bị hủy.                      |
| `BoardAclPolicy`       | Host vẽ được tại MAIN; participant thường tại MAIN bị từ chối; thành viên nhóm vẽ được trong nhóm; host ngoài nhóm bị từ chối (trừ khi đang hỗ trợ ACTIVITY).   |
| `BoardRuntime`         | `strokeSequence` tăng tuần tự; undo đánh dấu `isTombstoned` đúng nét của tác giả; từ chối undo nét người khác; khống chế tối đa 500 nét.                        |

#### 6.8.2 Datastore & File Integration Tests

|   Mã   | Kịch bản kiểm thử              | Kết quả mong đợi                                                    |
| :----: | :----------------------------- | :------------------------------------------------------------------ |
| **D1** | Upload frame ảnh tĩnh          | Tạo record trong `files` với `purpose: 'FRAME'`, `state: 'STAGED'`. |
| **D2** | Commit dừng hình hợp lệ        | Chuyển file sang `state: 'READY'`, gắn binding `BOARD_FRAME`.       |
| **D3** | Intent hết hạn hoặc bị hủy     | Sweeper tự động dọn dẹp tệp frame mồ côi.                           |
| **D4** | Tải frame bởi người ngoài nhóm | Bị từ chối truy cập theo ACL nhóm của Private File Service.         |

#### 6.8.3 Integration Tests (Socket.IO & Lifecycle)

|   Mã    | Kịch bản kiểm thử                                                          | Kết quả mong đợi                                                                           |
| :-----: | :------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| **I1**  | **MAIN Host Draw:** Host vẽ tại MAIN khi người khác đang chia sẻ           | Nét vẽ được đồng bộ tức thì tới tất cả participant tại MAIN.                               |
| **I2**  | **MAIN Member Deny:** Thành viên thường gửi event vẽ tại MAIN              | Server từ chối với mã lỗi `PERMISSION_DENIED`.                                             |
| **I3**  | **MAIN Freeze Deny:** Bất kỳ ai (kể cả host) gửi `freeze.begin` tại MAIN   | Server từ chối với mã lỗi `FREEZE_NOT_ALLOWED_IN_MAIN`.                                    |
| **I4**  | **Group Freeze Race:** Hai thành viên trong nhóm cùng bấm freeze đồng thời | Chỉ 1 người nhận được intent thành công; người thứ 2 nhận `CONCURRENT_FREEZE_IN_PROGRESS`. |
| **I5**  | **Source Change Conflict:** Đổi nguồn chia sẻ trong lúc client đang upload | `freeze.commit` trả về `SOURCE_CHANGED`; hủy bỏ frame; đưa nhóm về LIVE.                   |
| **I6**  | **FROZEN Source Stop:** Nhóm đã FROZEN, người chia sẻ dừng phát video      | Frame tĩnh và nét vẽ của nhóm vẫn được giữ nguyên để tiếp tục thảo luận.                   |
| **I7**  | **Group Close Cleanup:** Host đóng nhóm hoặc hết giờ ACTIVITY              | Context bị hủy, pending intent bị hủy, frame hết tham chiếu được đánh dấu `cleanupAfter`.  |
| **I8**  | **Host Change:** Đổi host trong khi host cũ có nét vẽ đang gửi lên         | Mutation của host cũ bị từ chối do host cũ không còn hiệu lực.                             |
| **I9**  | **Sequence Gap:** Bỏ qua một gói tin `board.stroke.added`                  | Client tự động gọi `board.sync` và render snapshot đúng 100%.                              |
| **I10** | **Stale Version:** Gửi `board.resume` với `boardVersion` cũ                | Server từ chối với lỗi `STALE_VERSION`.                                                    |

#### 6.8.4 Self-test Matrix (Thủ công / E2E)

| Loại kịch bản       | Thao tác thực hiện                                          | Kết quả quan sát thực tế                                               |
| :------------------ | :---------------------------------------------------------- | :--------------------------------------------------------------------- |
| **Thành công**      | Host vẽ tại MAIN                                            | Nét hiển thị tức thì trên client học viên.                             |
| **Thành công**      | Nhóm 3 người bấm dừng hình                                  | 1 người chụp, 3 người cùng thấy 1 frame và cùng vẽ lên frame đó.       |
| **Trường hợp rỗng** | Mở nhóm chưa có ai chia sẻ màn hình, bấm freeze             | Hiển thị thông báo "Chưa có nguồn chia sẻ để dừng hình".               |
| **Lỗi mạng**        | Tắt mạng client trong khi đang upload frame ảnh             | Sau 15 giây server tự động hủy intent và đưa nhóm về trạng thái LIVE.  |
| **Resize**          | Thay đổi kích thước cửa sổ khi đang có nét vẽ trên màn hình | Nét vẽ bám dính chính xác 100% vào nội dung video, không bị trôi lệch. |

#### 6.8.5 Tiêu chí nghiệm thu theo FR

| Yêu cầu      | Tiêu chí nghiệm thu cụ thể                                                                             |
| :----------- | :----------------------------------------------------------------------------------------------------- |
| **FR-06-01** | Chỉ host hiện hành vẽ được tại MAIN; nét hiện trên mọi client MAIN; đổi/dừng nguồn xóa sạch overlay.   |
| **FR-06-02** | Freeze thành công trong nhóm, cả nhóm thấy cùng frame; MAIN từ chối freeze; race chỉ có 1 người thắng. |
| **FR-06-03** | Nét khớp trên các tỷ lệ màn hình và DPR khác nhau; xuất được ảnh canvas gửi vào chat cuộc họp.         |
| **FR-06-04** | Undo chỉ xóa nét của mình; clear đúng quyền có xác nhận; đổi host thu hồi quyền ngay lập tức.          |
| **FR-06-05** | Resume đưa nhóm về live ngay, hủy intent chờ; đóng nhóm giải phóng toàn bộ frame và nét vẽ.            |

---

## 7. Ảnh hưởng tới các miền khác

| Miền liên quan              | Nội dung phối hợp                                                                                                                               | Thay đổi breaking? | Thứ tự triển khai                                          | Đầu mối phối hợp    |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :----------------- | :--------------------------------------------------------- | :------------------ |
| **M1 (Auth & Workspace)**   | Cung cấp danh tính `userId`, kiểm tra membership hợp lệ và cơ chế revoke token/quyền tức thì khi rời Workspace.                                 | Không              | Độc lập, dùng nền M1 sẵn có                                | M1 Owner            |
| **M2 (Chat & Files)**       | Cung cấp HTTP Upload endpoint cho frame (`purpose: 'FRAME'`), orphan file sweeper; tiếp nhận ảnh chụp canvas để gửi vào chat cuộc họp.          | Không              | M2 cung cấp upload trước khi M5 tích hợp commit            | M2 Owner & M5 Owner |
| **M3 (Media & Call Shell)** | Cung cấp `MediaStream`, `sourceId`, `sourceRevision` từ Media Registry; cung cấp vùng Stage để nhúng `StageCanvasOverlay`.                      | Không              | Cần M3 hoàn thiện khung Stage và video player              | M3 Owner & M5 Owner |
| **M4 (Session & Groups)**   | Cung cấp trạng thái phiên, `scopeId`, danh sách nhóm, host hiện hành; phát tín hiệu đóng nhóm, hết giờ TIMER-01, đổi host để M5 dọn tài nguyên. | Không              | M4 cung cấp event vòng đời trước khi M5 hoàn thiện cleanup | M4 Owner & M5 Owner |
| **Packages / Contracts**    | Bổ sung schemas cho các event `board:*`, `BoardState`, `Stroke` vào `@colearnia/contracts`.                                                     | Không              | **Làm đầu tiên**, chặn các task server và web              | M5 Owner            |

### 7.1 Hợp đồng kỳ vọng với từng miền

| Miền   | M5 cần từ miền đó                                                                             | M5 cung cấp cho miền đó                              |
| :----- | :-------------------------------------------------------------------------------------------- | :--------------------------------------------------- |
| **M1** | Xác thực socket, danh tính người dùng, sự kiện revoke tức thì                                 | Không                                                |
| **M2** | Endpoint upload tạm, verify file, bind `BOARD_FRAME`, ACL tải file theo nhóm, sweeper định kỳ | Ảnh chụp canvas xuất ra như một tệp đính kèm độc lập |
| **M3** | `sourceId`, `sourceRevision`, thông báo nguồn dừng/đổi; tham chiếu `videoElement` để chụp     | Overlay canvas gắn lên trên Video Stage              |
| **M4** | `scopeId`, phân loại scope, host hiện hành, event đóng nhóm / hết giờ / đổi host              | Không                                                |

---

## 8. Design evaluation

### 8.1 Effort

| Hạng mục                      | Nội dung đánh giá                                                                                                                                                                                                                                                                     |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phân loại quy mô**          | **Size L (Lớn)**                                                                                                                                                                                                                                                                      |
| **Lý do đánh giá**            | Bao phủ toàn diện từ Canvas 2D phía frontend (xử lý hình học phức tạp, khử trôi nét letterbox, render 60fps), giao thức Socket.IO thời gian thực, state machine quản lý intent tương tranh trong RAM server, đến tích hợp luồng upload tệp HTTP và tuân thủ ma trận phân quyền 3 lớp. |
| **Tầng mã nguồn bị tác động** | `packages/contracts`, `apps/server` (Socket handlers, RAM runtime, ACL policy), `apps/web` (Canvas overlay component, rendering engine, socket hooks).                                                                                                                                |

### 8.2 Risk & Mitigation

|   #    | Rủi ro kỹ thuật / nghiệp vụ                                                                                                                   | Khả năng   | Tác động   | Mức độ         | Biện pháp giảm thiểu                                                                                                                                                    |
| :----: | :-------------------------------------------------------------------------------------------------------------------------------------------- | :--------- | :--------- | :------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | **Xung đột tranh chấp dừng hình (Freeze Race Condition):** Hai thành viên cùng bấm dừng hình tại một thời điểm làm ghi đè trạng thái.         | Trung bình | Cao        | **Cao**        | Sử dụng cơ chế CAS (Compare-And-Swap) với `FreezeIntentManager` trong RAM server: chỉ intent đầu tiên được cấp phát, các request đến sau bị từ chối ngay lập tức.       |
| **R2** | **Trôi lệch nét vẽ khi thay đổi kích thước cửa sổ (Letterbox drift):** Nét vẽ bị trượt khỏi vị trí hình ảnh đối tượng.                        | Cao        | Cao        | **Cao**        | Bắt buộc bóc tách vùng video thực tế bằng thuật toán `CoordinateNormalizer`, chuẩn hóa toàn bộ tọa độ về tỷ lệ tương đối `[0.0, 1.0]` trước khi truyền đi hoặc lưu trữ. |
| **R3** | **Lệnh vẽ đến muộn (Stale Mutation) sau khi đổi host hoặc đổi nguồn:** Host cũ bị mất mạng rồi gửi nét vẽ cũ, hoặc nét gửi lên nguồn đã dừng. | Trung bình | Trung bình | **Trung bình** | Server gắn `sourceRevision` và `contextVersion` vào mỗi nét vẽ; kiểm tra lại quyền host và phiên bản nguồn tại thời điểm nhận lệnh; từ chối nếu không khớp.             |
| **R4** | **Tắc nghẽn hàng đợi Socket.IO do dữ liệu ảnh dung lượng lớn:** Truyền trực tiếp ảnh frame qua socket làm nghẽn kênh điều khiển.              | Cao        | Cao        | **Cao**        | Tách rời 100% việc truyền ảnh tĩnh sang đường HTTP POST upload của Private File Service (M2), giải phóng mutation queue trong thời gian chờ upload.                     |
| **R5** | **Rò rỉ bộ nhớ RAM do tích tụ nét vẽ trong phiên dài:** Số lượng nét vẽ tăng không giới hạn làm cạn kiệt RAM server.                          | Thấp       | Cao        | **Trung bình** | Giới hạn tối đa 500 nét vẽ hoạt động cho mỗi context; khi resume hoặc đổi context thì giải phóng toàn bộ nét cũ; giải phóng toàn bộ runtime khi phiên kết thúc.         |
| **R6** | **Khung hình đen do video remote chưa giải mã xong:** Client chụp phải frame đen khi vừa bắt đầu freeze.                                      | Trung bình | Trung bình | **Trung bình** | Kiểm tra `readyState >= 2` và `videoWidth > 0`; cảnh báo trên UI và cho phép người dùng thử lại.                                                                        |
| **R7** | **Tệp frame mồ côi tích tụ do client đứt mạng:** Client xin intent upload xong không commit.                                                  | Trung bình | Thấp       | **Thấp**       | Thiết lập TTL cho file STAGED, sweeper định kỳ tự dọn, cảnh báo khi vượt 50 tệp/giờ.                                                                                    |

### 8.3 Ma trận rủi ro

| Mức độ rủi ro                 | Rủi ro thành phần                                                            | Chiến lược xử lý                                                      |
| :---------------------------- | :--------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **Ưu tiên cao (Critical)**    | **R1** (Freeze Race), **R2** (Trôi nét Canvas), **R4** (Tắc nghẽn Socket.IO) | Giảm thiểu bằng CAS lock, chuẩn hóa tọa độ và tách luồng HTTP Upload  |
| **Theo dõi sát (Medium)**     | **R3** (Stale Mutation), **R5** (Rò rỉ RAM), **R6** (Frame đen)              | Kiểm soát bằng revision tagging, giới hạn 500 nét và check readyState |
| **Chấp nhận / Tự động (Low)** | **R7** (Tệp frame mồ côi)                                                    | Xử lý triệt để qua sweeper định kỳ và TTL 15s                         |

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, Helvetica, Arial","fontSize":"13px","primaryColor":"#EEF2FF","primaryBorderColor":"#6366F1","primaryTextColor":"#1E1B4B","lineColor":"#475569"}}}%%
quadrantChart
  title Ma trận rủi ro Domain M5
  x-axis Khả năng thấp --> Khả năng cao
  y-axis Tác động thấp --> Tác động cao
  quadrant-1 Ưu tiên cao
  quadrant-2 Theo dõi sát
  quadrant-3 Chấp nhận
  quadrant-4 Giảm thiểu
  R1 Freeze Race: [0.55, 0.85]
  R2 Troi net: [0.85, 0.85]
  R3 Stale Mutation: [0.55, 0.55]
  R4 Tac nghen Socket: [0.85, 0.80]
  R5 Ro ri RAM: [0.20, 0.80]
  R6 Frame den: [0.55, 0.50]
  R7 File mo coi: [0.55, 0.25]
```

---

## 9. WBS (Work Breakdown Structure)

### 9.1 Danh sách công việc

| Mã Task  | Tên công việc chi tiết                                                                        | Tầng kiến trúc / File phụ trách                         | Phụ thuộc  |   Dev   |  Test   | Tổng (pd) | Phục vụ mục tiêu |
| :------- | :-------------------------------------------------------------------------------------------- | :------------------------------------------------------ | :--------- | :-----: | :-----: | :-------: | :--------------- |
| **T1**   | Định nghĩa Zod schemas cho Board contracts (`board.ts`), State, Stroke, Commands & Events     | `packages/contracts/src/board.ts`                       | —          |   0.4   |   0.1   |  **0.5**  | G1–G8            |
| **T2**   | Xây dựng thuật toán hình học `CoordinateNormalizer` (Letterbox stripping, aspect ratio & DPR) | `apps/web/src/modules/board/CoordinateNormalizer.ts`    | —          |   0.8   |   0.2   |  **1.0**  | G6               |
| **T3**   | Xây dựng Canvas 2D Rendering Engine (Freehand path smoothing, Bezier, Vanishing animation)    | `apps/web/src/modules/board/CanvasRenderer.ts`          | T2         |   1.2   |   0.3   |  **1.5**  | G1, G3           |
| **T4**   | Xây dựng `FreezeIntentManager` trong RAM server (CAS reservation, TTL 15s, concurrency lock)  | `apps/server/src/modules/board/FreezeIntentManager.ts`  | T1         |   0.8   |   0.2   |  **1.0**  | G2, G4           |
| **T5**   | Xây dựng `BoardRuntime` (RAM state machine, BoardState, Stroke log, Sequence, Undo tombstone) | `apps/server/src/modules/board/BoardRuntime.ts`         | T1, T4     |   1.2   |   0.3   |  **1.5**  | G1–G5, G7        |
| **T6**   | Cài đặt `BoardAclPolicy` (Xác thực 3 lớp quyền: MAIN host-only, Group membership, Help role)  | `apps/server/src/modules/board/BoardAclPolicy.ts`       | T5         |   0.8   |   0.2   |  **1.0**  | G1, G3, G4       |
| **T7**   | Cài đặt Socket.IO Handlers & Envelopes cho toàn bộ sự kiện bảng vẽ (`board:*`)                | `apps/server/src/modules/board/BoardSocketHandler.ts`   | T1, T5, T6 |   0.8   |   0.2   |  **1.0**  | G1–G5            |
| **T8**   | Tích hợp upload frame với M2 (HTTP Upload, verify & bind `BOARD_FRAME`)                       | `apps/server/src/modules/board/BoardFileIntegration.ts` | T4, T7     |   0.8   |   0.2   |  **1.0**  | G2, G4           |
| **T9**   | Xây dựng Component `StageCanvasOverlay.tsx` và Hook `useBoardSocket.ts`                       | `apps/web/src/modules/board/StageCanvasOverlay.tsx`     | T1, T2, T3 |   1.2   |   0.3   |  **1.5**  | G1–G6            |
| **T10**  | Tích hợp công cụ xuất ảnh canvas để gửi vào chat cuộc họp (M2)                                | `apps/web/src/modules/board/CanvasExport.ts`            | T9         |   0.4   |   0.1   |  **0.5**  | G8               |
| **T11**  | Kiểm thử tự động: Unit tests (Normalizer, Runtime, Intent) & Integration tests (Socket, ACL)  | `apps/server/test/board/`, `apps/web/test/board/`       | T1–T10     |   0.5   |   1.0   |  **1.5**  | G1–G8            |
| **T12**  | Tài liệu hướng dẫn tích hợp, Metric dashboards và rà soát nghiệm thu                          | `docs/runbooks/`, `docs/board/`                         | T11        |   0.3   |   0.2   |  **0.5**  | —                |
| **Tổng** | **Toàn bộ 12 task phân rã kỹ thuật**                                                          | —                                                       | —          | **8.4** | **3.1** | **12.5**  | —                |

### 9.2 Đồ thị phụ thuộc

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, Helvetica, Arial","fontSize":"13px","primaryColor":"#EEF2FF","primaryBorderColor":"#6366F1","primaryTextColor":"#1E1B4B","lineColor":"#64748B"}}}%%
flowchart LR
  T1["T1 Contracts<br/>0.5d"]
  T2["T2 Normalizer<br/>1.0d"]
  T3["T3 Renderer<br/>1.5d"]
  T4["T4 IntentManager<br/>1.0d"]
  T5["T5 BoardRuntime<br/>1.5d"]
  T6["T6 AclPolicy<br/>1.0d"]
  T7["T7 SocketHandler<br/>1.0d"]
  T8["T8 FileIntegration<br/>1.0d"]
  T9["T9 Overlay + Hook<br/>1.5d"]
  T10["T10 CanvasExport<br/>0.5d"]
  T11["T11 Tests<br/>1.5d"]
  T12["T12 Docs<br/>0.5d"]

  T1 --> T4 --> T5 --> T6 --> T7 --> T8 --> T11 --> T12
  T1 --> T5
  T1 --> T7
  T5 --> T7
  T4 --> T8
  T2 --> T3 --> T9 --> T10 --> T11
  T1 --> T9
  T2 --> T9

  classDef crit fill:#FEE2E2,stroke:#DC2626,stroke-width:1.5px,color:#7F1D1D
  classDef norm fill:#EEF2FF,stroke:#6366F1,stroke-width:1px,color:#1E1B4B

  class T1,T4,T5,T6,T7,T8,T11 crit
  class T2,T3,T9,T10,T12 norm
```

---

## 10. Estimation

### 10.1 Bảng tổng hợp ước lượng công số

| Kịch bản               | Phát triển (Dev) | Kiểm thử (Test) | Review & Tích hợp | Dự phòng (Buffer) | Tổng cộng (Person-Days) |
| :--------------------- | :--------------: | :-------------: | :---------------: | :---------------: | :---------------------: |
| **Tốt nhất (Best)**    |       6.5        |       1.0       |        0.5        |        0.5        |         **8.5**         |
| **Dự kiến (Expected)** |     **8.0**      |     **1.5**     |      **0.5**      |      **1.0**      |        **11.0**         |
| **Xấu nhất (Worst)**   |       11.0       |       2.5       |        1.0        |        1.5        |        **16.0**         |

### 10.2 Giả định và tỷ lệ độ biến động

1. Đã có sẵn nền tảng Socket.IO gateway và cấu trúc phiên làm việc từ M4.
2. Private File Service (M2) đã sẵn sàng endpoint upload tệp tạm thời theo HTTP multipart.
3. Call Stage (M3) đã cung cấp sẵn video player element để lấy tham chiếu video frame cho Web API Canvas.
4. Tỷ lệ giữa cận trên (Worst) và cận dưới (Best) là $16.0 / 8.5 approx 1.88 imes$ (dưới ngưỡng 2.0x theo chuẩn công nghiệp cho thiết kế mức Size L).

### 10.3 Đối soát công số WBS và Ước lượng kỳ vọng

- **Tổng cộng 12 task WBS (T1–T12):** Tổng công số phân rã thô là **12.5 ngày công** (trong đó công số Dev thuần là 8.4 ngày, Test và Docs là 4.1 ngày).
- **Công số kỳ vọng thực tế (Expected: 11.0 ngày công):**
  - Trong thực tế triển khai, nhánh Frontend (T2 Normalizer, T3 Canvas Renderer) và nhánh Backend (T4 IntentManager, T5 BoardRuntime) được phát triển **song song độc lập** sau khi T1 (Contracts) hoàn tất.
  - Các công số kiểm thử trong từng task nhỏ (T1..T10) có sự gối đầu (overlap) với task kiểm thử tích hợp chuyên biệt T11.
  - Do đó, thời lượng thực tế của sprint đạt điểm cân bằng tại **11.0 ngày công**. Nếu dự án triển khai theo mô hình tuần tự đơn lẻ (single-engineer), tổng công số sẽ tiệm cận 12.5 ngày công.

---

## Appendix

### A. Đề xuất Zod Schemas (`packages/contracts/src/board.ts`)

```ts
import { z } from 'zod';

export const boardStatusSchema = z.enum(['LIVE', 'FREEZING', 'FROZEN']);

export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const strokeSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  contextVersion: z.number().int().nonnegative(),
  frameId: z.string().nullable(),
  sourceScopeId: z.string(),
  sourceId: z.string().nullable(),
  sourceRevision: z.number().int().nonnegative(),
  authorParticipantId: z.string(),
  points: z.array(pointSchema).min(1).max(2000),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  width: z.number().min(1).max(20),
  isVanishing: z.boolean().default(false),
  createdAt: z.number().int().positive(),
  isTombstoned: z.boolean().default(false),
});

export const freezeBeginInputSchema = z.object({
  scopeId: z.string(),
  boardVersion: z.number().int().nonnegative(),
  sourceRevision: z.number().int().nonnegative(),
});

export const freezeCommitInputSchema = z.object({
  intentId: z.string().uuid(),
  fileId: z.string(),
  dimensions: z.object({
    width: z.number().int().positive().max(2560),
    height: z.number().int().positive().max(1440),
  }),
});

export const resumeInputSchema = z.object({
  scopeId: z.string(),
  boardVersion: z.number().int().nonnegative(),
});

export const strokeDrawInputSchema = z.object({
  strokeId: z.string().uuid(),
  scopeId: z.string(),
  contextVersion: z.number().int().nonnegative(),
  points: z.array(pointSchema).min(1).max(2000),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  width: z.number().min(1).max(20),
  isVanishing: z.boolean().default(false),
});

export const strokeUndoInputSchema = z.object({
  scopeId: z.string(),
  strokeId: z.string().uuid(),
});

export const boardClearInputSchema = z.object({
  scopeId: z.string(),
  contextVersion: z.number().int().nonnegative(),
});

export const cursorInputSchema = z.object({
  scopeId: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  isDrawing: z.boolean(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const syncInputSchema = z.object({
  scopeId: z.string(),
  lastSequence: z.number().int().nonnegative(),
});
```

---

### B. Danh mục mã lỗi nghiệp vụ

#### B.1 Các mã lỗi cốt lõi

| Mã lỗi                          | Ý nghĩa kỹ thuật                                                                            | Hành động của Client                                                   |
| :------------------------------ | :------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------- |
| `PERMISSION_DENIED`             | Người gọi không có quyền trong scope này (ví dụ member cố vẽ tại MAIN).                     | Hiển thị thông báo quyền bị từ chối; vô hiệu hóa công cụ vẽ.           |
| `FREEZE_NOT_ALLOWED_IN_MAIN`    | Yêu cầu dừng hình tại phòng chung MAIN.                                                     | Chặn trên UI; không gửi request.                                       |
| `CONCURRENT_FREEZE_IN_PROGRESS` | Đã có một thành viên khác đang trong quá trình dừng hình.                                   | Hiển thị thông báo "Đang có người thực hiện dừng hình, vui lòng chờ".  |
| `SOURCE_CHANGED`                | Nguồn chia sẻ video đã thay đổi hoặc dừng trong khi đang upload ảnh dừng hình.              | Hủy bỏ frame, thông báo "Nguồn chia sẻ đã thay đổi", đưa nhóm về LIVE. |
| `INTENT_EXPIRED`                | Quá thời hạn 15 giây mà client chưa commit tệp ảnh.                                         | Khôi phục trạng thái LIVE, cho phép người dùng thử lại.                |
| `NOT_STROKE_AUTHOR`             | Yêu cầu undo nét vẽ không phải do chính mình tạo ra.                                        | Từ chối undo, giữ nguyên nét vẽ.                                       |
| `NOT_AUTHORIZED_TO_CLEAR`       | Người gọi không đủ quyền để xóa toàn bộ bảng (không phải host, không phải chủ frame/nguồn). | Hiển thị thông báo không có quyền clear.                               |
| `STALE_VERSION`                 | Version của client không khớp với phiên bản hiện tại của board.                             | Yêu cầu gọi `board.sync` để đồng bộ lại trạng thái mới nhất.           |

#### B.2 Các mã lỗi mở rộng

| Mã lỗi                | Ý nghĩa kỹ thuật                                                      | Hành động của Client                                           |
| :-------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------- |
| `NOT_IN_GROUP`        | Người gọi không phải thành viên nhóm của scope chỉ định.              | Ẩn công cụ freeze và vẽ của nhóm.                              |
| `NO_ACTIVE_SOURCE`    | Chưa có nguồn chia sẻ video để thực hiện dừng hình.                   | Hiển thị thông báo "Chưa có nguồn chia sẻ để dừng hình".       |
| `STALE_REVISION`      | `sourceRevision` gửi lên không khớp với nguồn video hiện tại.         | Lấy lại state từ server và cho phép thử lại.                   |
| `INTENT_INVALID`      | Intent không tồn tại, không thuộc người gọi, hoặc đã kết thúc.        | Đưa về trạng thái LIVE và đồng bộ lại.                         |
| `FILE_NOT_FOUND`      | Tệp tải lên không tồn tại trong Private File Service hoặc sai intent. | Cho phép người dùng thử lại quy trình freeze từ đầu.           |
| `INVALID_DIMENSIONS`  | Kích thước frame vượt quá giới hạn cứng (2560x1440).                  | Tự động resize ảnh chụp và thử lại.                            |
| `NOT_FROZEN`          | Gửi lệnh resume khi board không ở trạng thái FROZEN/FREEZING.         | Bỏ qua lệnh và đồng bộ lại state từ server.                    |
| `NOT_HOST`            | Người vẽ tại MAIN không phải là host hiện hành.                       | Vô hiệu hóa công cụ vẽ tại phòng MAIN.                         |
| `INVALID_CONTEXT`     | Context không hợp lệ hoặc phiên họp không còn hoạt động.              | Đồng bộ lại hoặc đóng overlay canvas.                          |
| `PAYLOAD_TOO_LARGE`   | Nét vẽ vượt quá 2.000 điểm hoặc vượt ngưỡng 500 nét active.           | Ngắt nét vẽ hoặc yêu cầu xóa bớt nét trước khi vẽ tiếp.        |
| `INVALID_COORDINATES` | Tọa độ điểm vẽ nằm ngoài dải chuẩn hóa `[0.0, 1.0]`.                  | Loại bỏ điểm vẽ; kiểm tra lại thuật toán CoordinateNormalizer. |
| `STROKE_NOT_FOUND`    | Không tìm thấy nét vẽ cần thao tác trong context hiện tại.            | Bỏ qua thao tác và đồng bộ lại.                                |
| `CONTEXT_EXPIRED`     | Context của bảng vẽ đã đóng hoặc đã chuyển version mới.               | Gọi `board.sync` và xóa buffer nét vẽ cục bộ cũ.               |
| `SCOPE_NOT_FOUND`     | Scope phòng hoặc nhóm không tồn tại hoặc đã bị hủy.                   | Gỡ bỏ overlay canvas và thoát khỏi room.                       |

---

### C. Từ điển thuật ngữ (Glossary)

| Thuật ngữ                             | Định nghĩa và giải thích                                                                                       | Ngữ cảnh sử dụng trong hệ thống    |
| :------------------------------------ | :------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| **MAIN**                              | Phòng họp chung của phiên LiveSession, nơi giảng viên trình bày bài giảng chính cho toàn bộ người tham gia.    | Scope gốc của phiên họp            |
| **DISCUSSION**                        | Nhóm thảo luận nhỏ được chia tự động; kế thừa bài giảng từ MAIN làm nguồn video để dừng hình.                  | Scope nhóm kế thừa                 |
| **ACTIVITY**                          | Nhóm hoạt động độc lập; các thành viên làm việc nhóm và có nguồn chia sẻ màn hình riêng của nhóm.              | Scope nhóm độc lập                 |
| **Freeze / FROZEN**                   | Trạng thái dừng hình: toàn bộ thành viên trong nhóm chuyển sang quan sát cùng một frame ảnh tĩnh đồng nhất.    | State của BoardState               |
| **Resume**                            | Thao tác đưa cả nhóm từ trạng thái dừng hình trở lại xem luồng video trực tiếp thời gian thực.                 | Transition trong State Machine     |
| **Intent**                            | Quyền đặt chỗ tạm thời (TTL 15 giây) để một client thực hiện chụp và tải ảnh tĩnh lên server.                  | Cơ chế chống race condition        |
| **CAS (Compare-And-Swap)**            | Kỹ thuật cấp phát khóa nguyên tử: chỉ cấp intent nếu trạng thái hiện tại chưa có intent nào khác đang chờ.     | Kiểm soát tương tranh trong RAM    |
| **`sourceRevision`**                  | Phiên bản của nguồn video do Media Registry (M3) cấp; tự động tăng khi nguồn chia sẻ thay đổi hoặc dừng.       | Kiểm tra tính hợp lệ của nguồn     |
| **`contextVersion` / `boardVersion`** | Số phiên bản của bảng vẽ; tự động tăng mỗi khi resume hoặc chuyển đổi ngữ cảnh vẽ.                             | Kiểm tra tính nhất quán của nét vẽ |
| **Tombstone**                         | Kỹ thuật xóa mềm trong bộ nhớ: đánh dấu nét vẽ đã bị undo mà không xáo trộn chỉ số mảng nét vẽ.                | Quản lý Stroke trong RAM           |
| **Letterbox / Pillarbox**             | Các dải đen xuất hiện ở cạnh trên/dưới hoặc hai bên khi tỷ lệ video khác tỷ lệ khung hiển thị của trình duyệt. | Hình học Canvas                    |
| **DPR (Device Pixel Ratio)**          | Tỷ lệ giữa độ phân giải vật lý của màn hình và độ phân giải logic CSS.                                         | Tối ưu hóa render Canvas           |
| **Vanishing stroke**                  | Nét vẽ tự động mờ dần và biến mất sau một khoảng thời gian ngắn, dùng cho chỉ dẫn trực tiếp.                   | Overlay host tại MAIN              |
| **Loss-tolerant**                     | Cơ chế truyền tin cho phép mất gói mà không làm gãy logic hệ thống (áp dụng cho tọa độ con trỏ).               | Tối ưu hóa băng thông Socket.IO    |
