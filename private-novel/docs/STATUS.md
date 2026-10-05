# Đối chiếu kế hoạch với mã — 05/10/2026
Chỉ kiểm code/local tests; chưa phải nghiệm thu thiết bị thật hay deploy.

| Mốc | Trạng thái | Mã/bằng chứng và thiếu gì |
|---|---|---|
| M0 | Chưa làm đủ | Có project/fixtures; chưa benchmark dictionary thật, streaming và auth CPU mục tiêu |
| M1 | Một phần | src/db.ts, ui/Reader.tsx; CRUD/settings test; migration có dữ liệu cũ chưa xác minh |
| M2 | Một phần/lệch | Một TXT, worker/split preview; crash/resume chưa đầy đủ; A7 còn lỗi |
| M3 | Một phần | language.ts/worker, C1 unit; bộ 43 MB và RAM Android chưa kiểm |
| M4 | Một phần | Name merge/sửa tạm; full import/export và mở rộng selection chưa nghiệm thu |
| M5 | Ngoài R0 | TikTok adapter/mock; không có gateway/audio thật; BrowserPlayer chưa nối UI |
| M6 | Chưa đạt | A2/A3 qua nghiệm thu nhỏ; A1/A4/A5/A6 mở |
| M7 | Chưa đạt | server/auth + functions; chưa Pages runtime/KDF CPU/logout/deploy |
| M8 | Chưa đạt | Edge desktop/Pixel viewport; Android hardware chưa kiểm |

## Hợp đồng dữ liệu và layout
| Kế hoạch | Thực tế đọc mã | Quyết định |
|---|---|---|
| content chunks, không toàn văn chương | Chapter.text chứa toàn chương; sources.blob giữ TXT | Lệch có chủ ý ghi nhận, chưa chốt migration; không tự refactor |
| dictionary/chunk protocol | dictionaries store chứa Blob; worker giữ engine | Cần spike RAM trước chọn cấu trúc thay thế |
| checkpoint/resume đầy đủ | importJobs/restoreJobs theo dõi trạng thái, chưa crash resume hoàn chỉnh | Không quảng cáo resume đầy đủ |
| cây module §10 | src/*.ts, src/ui, src/workers; server/functions riêng | Cây dự kiến không bắt buộc rename |
| backup streaming | Base64 gộp part đầu, ngưỡng nhận 16 MiB | A1 mở; không data-safe với bộ lớn |
| nhận dạng filename | DictionaryPanel suy loại rồi cho đổi loại | Chưa kiểm chất lượng nội dung; PhienAm nhỏ vẫn có thể được nạp |

## Rủi ro đã xác minh trong mã
- .env.example/tts.ts còn route STV-like /io/s1213/tiktoktts và ID tiktok:1..3.
- fetch TTS hiện dùng GET text trong query; có thể vào URL/log. Cần route trung tính,
  POST body, hợp đồng gateway và test trước bật TTS thật; chưa có gateway để gọi.
- R0 không cần TTS theo quyết định người dùng; không ngầm coi BrowserPlayer là fallback đang chạy.
- A3 candidate dictionaries đã vào final transaction; 14 regression mới, reviewer38/38 backup, root75unit và native IndexedDB E2E qua.
- Kế hoạch cũ đã archive; không dùng D1 content sync/Gemini/Azure cũ để lấp thiếu local.

## Thứ tự thực thi
M0 backup/dictionary/auth spike → quyết định kiến trúc bằng số đo; A3 đã đóng phạm vi nhỏ.
Tạm hoãn feature mới. Android thật là gate riêng, không thay bằng viewport.

