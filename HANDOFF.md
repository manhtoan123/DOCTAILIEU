# Private Novel Reader — trạng thái hiện hành
Cập nhật: 05/10/2026 (Asia/Saigon). Đây là điểm bắt đầu; không suy ra trạng thái từ checkbox lịch sử.

Git baseline local: `a41f29a`. Đã loại secrets/generated/dữ liệu thật; chưa push hoặc deploy.

## Đọc theo thứ tự
1. AGENTS.md → tài liệu này → WEB-READER-IMPLEMENTATION-PLAN.md.
2. private-novel/docs/DECISIONS.md và docs/STATUS.md.
3. Chỉ đọc phiên liên quan trong docs/HANDOFF-LOG.md khi cần bằng chứng.

## Quyết định sản phẩm
- Người dùng chốt 05/10: **R0 đọc/Convert trước, chưa bắt buộc TTS**.
- R1 thêm auth server và deploy private. Chưa deploy.
- Không Gemini/content sync trong MVP local; TikTok cần gateway được phép, hiện chưa có.
- Windows + Android; Android viewport trong Edge không phải Android thật.
- Nguồn và bộ từ điển ở D: chỉ đọc, không copy/upload/chạy script.
- Bộ mới: D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data.

## Trạng thái và bằng chứng
| ID | Trạng thái hiện hành | Bằng chứng / hạn chế |
|---|---|---|
| A2 | Đã qua nghiệm thu nhỏ | Giữ source khi Compact Replace; unit và review độc lập trong log 09:05–09:28 |
| C1 | Đã kiểm thử | Longest Name giữa các tầng; 6 unit fixtures, chưa parity toàn engine |
| C2 | Đã kiểm thử | Hydration/settings race; 30 E2E toàn bộ phiên trước; multi-tab chưa xác minh |
| A3 | Đã qua nghiệm thu nhỏ | 14 regression mới; root75 unit; reviewer độc lập38/38 backup; native IndexedDB E2E qua |
| A1/A4/A5/A6/A7 | Còn mở | Portable lớn, integrity, conflict, packet order, Unicode |
| D1-alias | Đã kiểm thử fixture | DaiTuNhanXung.txt → names2; hai viewport E2E qua; chưa nhận bộ thật |
| M0 | Chưa hoàn tất | Benchmark 43 MB, streaming backup, auth CPU và Android thật còn thiếu |
| R0/R1 | Chưa đạt | Không dùng số tests hoặc baseline commit để tuyên bố release |

Kết quả mới: 75 unit, build pass; 4 E2E backup/alias và 6 lượt lặp settings qua.
Lượt chạy mới và kết quả cuối được ghi riêng trong docs/VALIDATION-2026-10-05.md.
A3 không được ghi hoàn thành chỉ vì ca smoke pass.

## Ba việc tiếp theo
1. **M0-BACKUP / A1**: spike backup streaming theo byte, định dạng/chunk và round-trip bộ lớn.
   Chỉ prototype/tests trước; giữ fixtures A2/A3 và tương thích v1/v2 hoặc chốt migration riêng.
   Bắt buộc source13MiB và dictionary43MB, giới hạn RAM/part, hủy và file thiếu/hỏng.
2. **M0-DICT**: benchmark parser/Convert với dữ liệu người dùng chọn; đo thời gian, RAM, dòng hợp lệ/bị bỏ.
   Giữ nguyên D:, không upload. PhienAm/HanViet là gợi ý loại, không chứng minh chất lượng từ điển.
3. **M0-AUTH / DEVICE**: đo KDF trong runtime mục tiêu và kiểm Android thật trước phát hành.
   Không hạ độ mạnh KDF để ép quota. Nếu chưa có thiết bị/runtime thì ghi chưa xác minh.

Tạm hoãn tính năng mới trước khi đóng hoặc quyết định lại các spike M0.
Không tự đổi schema/layout chỉ để giống kế hoạch; xem bảng lệch trong docs/STATUS.md.

## Kiểm thử bắt buộc
Chạy trong private-novel/: npm.cmd test; npm.cmd run build.
Thay đổi UI/import/worker: npm.cmd run test:e2e -- --reporter=line.
Audit: npm.cmd test -- --config audit/vitest.config.ts --reporter=verbose.
Reviewer chạy targeted regression của phạm vi rủi ro; không chạy được thì chưa đủ nghiệm thu.
E2E từng chập chờn cần --repeat-each=3 cho ca liên quan, ghi cả fail lẫn pass.

## Bàn giao
Lịch sử nguyên bản đã chuyển sang private-novel/docs/HANDOFF-LOG.md (append-only).
Không xóa hoặc sửa số test của phiên cũ. Trạng thái hiện hành chỉ nằm ở đây và STATUS.md.
Mỗi phiên thêm ngày giờ, model thực cấu hình, file/đoạn sửa, quyết định/lý do,
lệnh + exit code/kết quả, review, giới hạn và nhiệm vụ tiếp theo theo mẫu trong log.

