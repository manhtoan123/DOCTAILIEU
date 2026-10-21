# Private Novel Reader — trạng thái hiện hành
21/10/2026.

Chỉ mục: private-novel/{docs,src,scripts}/README.md. AGENTS.md quy định phạm vi/kiểm thử; log .dsh-tmp/.

## Online
https://thu-phong-private.pages.dev/ — Pagesf718d1d3 (index-BRXwBbI0.js), deploy21/10 sửa/xóa chương TXT. AIWorker giữ9a20f69f, không migration. Remote0001–0012; index13local chờ quota; SHARED_STATE_ENABLED=1. Alias/deployment SHA khớp dist; smoke online4/4 PASS desktop/android-layout, cloud API chặn. Rollback Pages48925bcb. Log private-novel/.dsh-tmp/chapter-manage/.

## Kiến trúc và chức năng
React/Vite/Dexie + Pages/AIWorker/D1/R2. Refactor 144 file hoàn tất: features/{ai,reader,tts,names-convert,import-export,sync-cloud,library}; core/{db,storage,domain}; shared; workers. src gốc chỉ App.tsx/main.tsx/README; canonical diff 0 khi chuyển, production smoke PASS.
Thư phòng truyện lẻ; /phong-toi chứa tác giả Album→Series→truyện→chương, grid/list, tìm chương, xóa leaf. Folder giữ phân cấp. Tuyển tập TXT: xem/sửa mốc, byte slices, cap2000 fail-closed, batch atomic.
Local-first, chỉ nhập truyện được chọn; staging/cancel/bytes/SHA/atomicity; xóa cloud trước local; D chỉ đọc. Không tự tái nhập/sửa dữ liệu cũ.

## Đọc, AI, đồng bộ
Name riêng→AI; Name chung/từ điển→Convert. STV [i]URL[/]Tên: caption AI/TTS, raw nguồn/DB/cloud/backup giữ.
Split cùng model, tối đa 2 key/1 quota qua lease/cooldown; foreground ưu tiên prewarm. Form PromptFields chung; legacy hybrid vẫn lưu. Retry transient tối đa3; first60/idle30/hard180s/lease185s; cancel/partial/model pin. Tiến độ AI lấy chương hoàn tất cao nhất.
TTS Weilbyte gateway, tối đa3 request, một audio + carrier Blob10s; chưa kiểm audio thật/Android nền. TTS seek A1 cũ xem TTS-BACKUP-STABILITY-1.md.
Sync state/prompts CAS/delta/offline/tombstone/conflict; Names/profiles/reader/progress/cursor/Album/metadata/chapter edits/dictionaries/bìa/nền. DBv4 source revision/receipt index-only; 1000 truyện reload 0GET originals/0Blob reads. Stockdict chỉ tải khi Convert/chủ động.

## Dung lượng và giới hạn
TXT40MiB; EPUB256MiB/expanded512MiB/entry16MiB/derived128MiB; import worker flush1MiB/32ch. Cloud JSON>64MiB gzip/decoded256MiB; original>64MiB dùng parts16MiB tuần tự/resume/full SHA trước ready; ledger9GB. Shared-files256MiB/3000 reservations, metadata64MiB/60k.
Backup nguồn/từ điển xác minh SHA, packet≤16MiB, portable lớn chưa hỗ trợ; không chứa prompt/AI/cài đặt/cursor nghe. TXT append đã deploy: đầy đủ/chỉ chương mới; chia mặc định0, xem/tích/phân trang50, hiển thị cuối lên đầu nhưng commit thứ tự file. Khớp exact tự chọn; gợi ý tiêu đề hoặc thiếu mốc thì không chọn sẵn; khóa trùng ở service. Giữ bytes/ID/progress/CAS/atomic. Watchdog worker30s/conversion120s, hủy chặn ghi muộn. Review68 + full159file/1988test + build/E2E8 PASS. Log .dsh-tmp/tail-match/. PWA offline mở lại hoàn toàn chưa hoàn tất. Android thật chưa xác minh.

Sửa/xóa TXT đã triển khai: bật Quản lý chương mới hiện Sửa/checkbox/xóa; Đã xóa để khôi phục cùng ID. Giữ row/file nguồn; active counts/Reader/search lọc hidden IDs. Shared chapter-state CAS + pending ACK trước local, backupv3/cloudv2 bảo toàn và remap; legacy đọc được. Chặn ghi muộn progress/TTS/cache, hết chương hủy AI. Full161file/2007test, review18, build, E2E4 PASS. Thiết kế tối giản docs/CHAPTER-EDIT-DELETE-DESIGN.md; log .dsh-tmp/chapter-manage/.

Mã GitHub Private: https://github.com/manhtoan123/DOCTAILIEU; origin dùng HTTPS/GCM. Dữ liệu/secrets ngoài Git.
