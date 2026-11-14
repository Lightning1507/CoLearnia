# SCRUM-92 — Kiểm ngắn Cloudflare TURN

Theo dõi: [Jira SCRUM-92](https://faker1652005.atlassian.net/browse/SCRUM-92), [issue #91](https://github.com/Lightning1507/CoLearnia/issues/91). Nền mã `22c074d`. Kiểm ngày 14/11/2026 trên một mạng của máy Windows local, Python 3 và Chrome headless dùng profile riêng; kết nối TURN qua TLS/TCP 443, relay IPv4. Chưa kiểm mạng thứ hai hoặc hết hạn credential 14.400 giây; phạm vi lượt này là kiểm ngắn.

## Kết quả đo

| Phép đo                                              | Quan sát                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Baseline credential TTL 14.400 giây                  | Python Allocate được relay; cùng username nhưng mật khẩu sai trả 400. `--auth-only` trả exit 2, expiryVerified=false.   |
| Credential TTL 60 giây, trước TTL                    | Python và Chrome đều tạo được relay.                                                                                    |
| Mật khẩu giữ nguyên chiều dài, sửa ký tự cuối        | Python trả 400; Chrome không có relay, icecandidateerror=400.                                                           |
| Ghép username với credential hợp lệ của lần cấp khác | Python trả 400. Không phải phép kiểm credential còn hạn dùng đúng cặp.                                                  |
| Sau TTL, khoảng 80–81 giây                           | Credential đã dùng và credential chưa dùng trước TTL vẫn Allocate được trên kết nối TLS mới.                            |
| Sau TTL, khoảng 180–181 giây                         | Cả hai credential cũ vẫn Allocate được; credential mới đối chứng cũng dùng được.                                        |
| Chrome sau TTL, khoảng 181–182 giây                  | PeerConnection mới với từng credential cũ đều có relay; credential mới đối chứng cũng có relay, không ghi nhận lỗi ICE. |
| Revoke khi kết thúc lượt Python diagnostic           | Hai credential cũ trả HTTP 404, credential mới trả 204. Không dùng 404 làm bằng chứng relay đã bị chặn.                 |

Phép Python `--diagnostic --ttl 60 --delay 120` trả `status=failed`, `reason=credential-still-accepted`, `expiryVerified=false`, exit 1. Mã 400 vẫn là kết quả chưa rõ về nguyên nhân xác thực; chế độ diagnostic chỉ cho tiếp tục thu quan sát, không đổi 400 thành 401 hoặc nới điều kiện pass.

## Nhận định và giới hạn

Hai implementation độc lập — packet builder Python và WebRTC của Chrome — cùng quan sát 400 với mật khẩu bị sửa, trong khi control đúng cặp tạo được relay. Điều này cho thấy hiện tượng không chỉ có trong script Python; chưa xác định nguyên nhân xử lý nội bộ của Cloudflare hoặc chứng minh mọi mã 400 đều là lỗi xác thực.

Builder MESSAGE-INTEGRITY được kiểm bằng vector long-term authentication của [RFC 5769 §2.4](https://www.rfc-editor.org/rfc/rfc5769.html#section-2.4). Test vector kiểm padding/độ dài/HMAC cho mẫu đó; không chứng minh toàn bộ TURN stack hoặc dịch vụ đúng chuẩn.

[Tài liệu cấp credential](https://developers.cloudflare.com/realtime/turn/generate-credentials/) mô tả TTL; [FAQ](https://developers.cloudflare.com/realtime/turn/faq/) nói allocation đang dùng sẽ bị ngắt sau một khoảng trễ khi credential hết hạn. Lượt này tạo allocation mới sau TTL, không chỉ quan sát allocation cũ còn sống. Chưa tìm được độ trễ tối đa được công bố cho hành vi đã đo.

Không suy từ TTL 60 giây sang TTL 14.400 giây. Chưa đo thời điểm bắt đầu bị từ chối, UDP, phân bố các edge hoặc phiên gọi CoLearnia thật. Candidate relay chứng minh nhận được relay, không chứng minh RTP/audio, cuộc gọi hai mạng hoặc tích hợp auth/ICE endpoint của SCRUM-64. Không đổi provider/firewall/TTL sản phẩm, không đánh dấu issue đã giải quyết.

## Chạy lại

Nạp secret qua môi trường hoặc `.env.turn.local` được Git bỏ qua. Không truyền credential/token trong tham số lệnh hoặc đưa output WebRTC thô vào PR.

```bash
python -B -m unittest scripts/verify_cloudflare_turn_test.py -v
python -u scripts/verify-cloudflare-turn.py --diagnostic --ttl 60 --delay 120
node --env-file=.env.turn.local scripts/diagnose-cloudflare-turn.mjs --ttl 60 --delay 120
```

Lệnh Python cần môi trường đã có hai biến TURN. Lệnh Node dùng Python trên PATH và Chrome/Edge tại đường cài đặt chuẩn Windows; chỉ truyền credential tạm qua stdin/CDP, bỏ khóa dài hạn khỏi môi trường tiến trình con, không ghi credential ra file/log. Profile trình duyệt tạo riêng và chỉ được dọn trong thư mục tạm đã kiểm đường dẫn. Exit 0 của runner Node chỉ là hoàn tất chẩn đoán; runner luôn ghi expiryVerified=false.

## Kiểm tra mã công cụ

- 15 unittest Python đạt, gồm diagnostic không nới điều kiện pass, mật khẩu sai được chấp nhận vẫn fail, các mã quota/protocol vẫn inconclusive và vector MESSAGE-INTEGRITY của RFC 5769.
- Runner Node đã chạy thật với Python/Chrome, gồm baseline, hai mốc sau TTL, credential mới đối chứng và cleanup; `--help` chạy không cần secret.
- 791 unit test repo trong 47 file, harness, format, lint, typecheck, build và `git diff --check` đạt. Bộ tương đương `pnpm check` chạy qua entrypoint Node với một Vitest worker. Vite giữ cảnh báo bundle trên 500 kB.
- CI bổ sung unittest Python offline, không gọi Cloudflare hoặc cần secret. Không thay DB/schema/media runtime nên không chạy DB integration local trong lượt này; các kết quả trên không chứng minh tiêu chí hết hạn đã đạt.

## Nội dung chuẩn bị cho nhà cung cấp

- Với credential yêu cầu TTL 60 giây, vì sao Allocate mới còn thành công ở khoảng 180 giây qua cả Python/TLS và Chrome, trong khi revoke credential cũ trả 404?
- Có cửa sổ chấp nhận sau TTL hoặc cache nào được hỗ trợ/chứng nhận, và giới hạn tối đa là bao lâu?
- Cùng username với mật khẩu bị sửa hoặc credential khác trả 400 trên cả hai client; cách phân biệt lỗi xác thực, token không hợp lệ và lỗi protocol của dịch vụ là gì?

Đây là nội dung chuẩn bị đối chiếu, chưa gửi yêu cầu hỗ trợ. Sau khi làm rõ cần kiểm TTL buổi học và phối hợp SCRUM-64; việc chấp nhận giới hạn vẫn cần M3 review. Jira giữ trạng thái công việc, issue GitHub lưu liên kết bằng chứng.
