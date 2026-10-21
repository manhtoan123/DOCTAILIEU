# Cập nhật chương TXT — hoàn tất 16/10/2026

Production Pagesd09d36b5/master, index-BXNphOti.js. AIWorker0569335b-9a8f-40a1-bd0e-9504a9c82527 giữ nguyên. D1schema0001–0012, bindings, tier, keys và policy không đổi.

## Sử dụng
Thông tin truyện → Cập nhật chương từ file TXT đầy đủ → chọn TXT mới → Kiểm tra chương mới → Thêm các chương mới. Có thể bỏ bản xem trước hoặc hủy đang xử lý. Encoding, regex và giới hạn chương nằm trong “Cách đọc file”; dùng cùng cách chia với bản cũ nếu không tìm được mốc.

File tối đa40MiB, dùng importer/worker/SHA hiện có, không cắt file gốc. Tìm duy nhất dãy liên tiếp tối đa ba chương cuối theo tiêu đề+nội dung chuẩn hóa newline/trim. File không có chương mới, không khớp hoặc khớp nhiều chỗ sẽ báo lỗi và giữ truyện. Không đoán bằng số thứ tự. Chỉ áp dụng TXT, không sửa hay tự tái nhập truyện khác.

Commit append-only và CAS trong một transaction: giữ chương cũ cùng ID/revision/text/order; giữ progress, Name, TTS và cache AI. Chỉ suffix nhận ID staging mới và order sau mốc; file cũ và fullfile mới giữ blob/SHA riêng. Abort/native error/CAS stale rollback cả nguồn, chương, bộ đếm, staging và nhật ký đồng bộ. Preview chưa commit không được xuất bản.

## Đồng bộ
Không sửa cloud snapshot immutable. State thêm packet+manifest immutable, không migration/tài nguyên mới. Packet≤900KiB,128chapters/256kchars; manifest≤1000packets/128kchapters, tổng text≤40MiB, mỗi chương≤128k. Máy nhận kiểm đủ packet hashes/IDs/order/source descriptor/baseSHA/tail trước khi công bố toàn bộ suffix trong transaction; thiếu/xung đột không nối một phần.

Publication: packet → edit/append theo dependency chapter order → progress/TTS. Manifest theo mốc, không theo UUID. Newer anchor có chứng cứ patch cùng base và target khớp được giữ; CAS rechecks proof. Replay suffix đã có giữ những sửa đổi revision mới và các suffix tiếp theo, không ghi đè chúng. Hai suffix cạnh tranh giữ conflict để so sánh; “Giữ nội dung trên máy” ghi ignore intent theo localhash+remoteRevision, không gửi immutable tombstone hay lặp PUT vô hạn. Preview conflict hiển thị file/số chương thay JSON/UUID.

Nguồn mới dùng coordinator original có sẵn (vẫn gọi khi snapshot ACK), kiểm SHA/size, gửi tuần tự. Máy chưa tải blob ghi `dataStatus:missing`, không giả có bytes. Không có thao tác cloud-delete/local-delete mới.

## Bằng chứng và giới hạn
- Root full129files/1732tests PASS (.dsh-tmp/txt-append-full.log), build PASS; sau đó thêm đúng1regression packet-ignore, own25 PASS (.dsh-tmp/txt-append-review-final.log). Không đổi production logic sau full; cuối chỉ copy/preview conflict, build và2E2E thêm PASS.
- Reviewer độc lập:25cases +7SQL/API cases mới trong shared-state-independent-review, static chấp nhận; descriptor restart, ordering, source metadata, post-edit anchor và immutable keep-local đều đã xử lý.
-14E2E append/story +6shared state +2conflict UI PASS; cộng14AI/prompt trước là36ca desktop/Android-layout. Layout không thay Android thật.
- Production synthetic/no cloudwrites:869px/393px,3→5chapters, reload, oldIDs/revisions/text/progress/SHA+bytes giữ; smoke whole5.407chars→1call, incomplete khôngcache. scripts/smoke-txt-append-production.mjs và smoke-ai-whole-production.mjs; reports .dsh-tmp/txt-append/production.json, .dsh-tmp/ai-whole/production.json.
- Chưa dùng file hoặc truyện thật của người dùng để thay dữ liệu; chưa thử upload original mới qua mạng production (đường upload hiện có được review và regression, smoke chặn cloud writes). Không đọc/upload D:.

Thiết kế/bất biến: TXT-APPEND-M0.md. Không còn việc bắt buộc trong phạm vi thay đổi này.
