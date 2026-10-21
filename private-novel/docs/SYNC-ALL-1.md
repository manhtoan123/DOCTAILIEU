# SYNC-ALL-1 — đồng bộ mọi chỉnh sửa

Phạm vi người dùng xác nhận 12/10/2026: Names riêng/chung, Name List Convert, kho prompt và lựa chọn/profile/config AI, reader display/TTS/options, vị trí đọc/nghe, Album/name/membership, title/author, nội dung chương và chia chương, từ điển nhập/thay/gỡ. Giữ local-first, chỉ truyện đã chọn; không tự nhập lại/chia lại truyện cũ. Kho prompt dùng endpoint cũ; overlay dùng /api/state; dictionary bytes immutable dùng /api/state-files/{sha256}. Không sync secrets/tokens/operational ACK/staging, audio hay AI result cache tạm.

D1 delta99 mục/trang, per-record CAS, tombstones và ledger64MiB/60.000rows; JSON900KiB/mục. Conflict giữ bản local/shared, chọn trong Cài đặt → Đồng bộ chỉnh sửa; không last-write-wins âm thầm. Offline giữ chỉnh sửa. Mở/focus/online/localwrite và30s visible poll. Truyện chưa chọn không tự tải; catalog đọc metadata overlay. Progress chung phục hồi khi mở lại, không nhảy vị trí khi đang đọc. Cursor chỉ phục hồi phù hợp identity/revision và không tự phát âm thanh. Timestamp-only cùng vị trí không gây PUT/conflict; hai vị trí khác vẫn cần chọn.

Chapter patch giữ sourceHash/sourceRevision/baseSHA; cumulative group gồm mọi descendants, atomic split+count/charCount. Lựa chọn xung đột giữ các phần chia riêng ở hai bản. Legacy edit không biết anchor cần so sánh rõ, không giả là bản gốc. Editor giữ opening snapshot/draft khi remote sửa. Published snapshot và original bytes không sửa. Book-delete tombstone chặn latePUT; cloud ACK trước local-delete. Overlay chapter không có API xóa riêng; xóa truyện giữ policy hiện có.

Dictionary: whole-file checksum/size verified trước publish descriptor, stream80MiB không gom80MiB trong Worker; reservation pending/ready đều tính256MiB/3000hashes, không DELETE/REPLACE quota bypass. Client giữ captured bytes để upload đúng phiên bản. RAW/AI chỉ đồng bộ manifest; Convert hoặc nút tải chủ động mới GET bytes. Stock files không tự upload; Names-only editor không tải VP; common patches áp lên actual verified Names và không tải lại base mỗi lần mở Convert.

## M0 và bằng chứng
- Hai browser layout:100Name+book=101records/10.018bytes, capture+SHA11–15ms;1000Name+book=1001records/100.918bytes,47–123ms.128k UTF16 escaping fixture256.467bytes <900KiB. Đây là đo browser trên Windows, không phải Android thật/RAM/4G thật.
- Stock manifest read-only7files/53.451.768bytes. Known R2 caps9.000.000.000+268.435.456+53.451.768=9.321.887.224bytes; không thay paid tier. Đây là budget của app, không cam kết toàn account còn dung lượng.
- Backend Sol/high native27 + actualworkerdD1/R2 local9 đạt, gồm checksum/80MiB/concurrent/cancellation/quota/CAS/source/delete/catalog. Client Sol/high31 realDexie regressions đạt. Root full/build/E2E logs sync-all-* trong .dsh-tmp; deployment status ở HANDOFF.md.
- E2E phạm vi44cases đạt qua run/rerun đúng ca; stale tests cập nhật RAW mặc định, route-preserving reload và prompt chỉ lượt sau.18 race repeats đạt (stale editor/offline conflict/recursive splits). Không giảm invariant. Fail logs giữ.
- Migration0010: parenthesized CASE-END để tương thích parser D1 remote; LF được giữ bằng .gitattributes riêng file. Lần fail rollback xác nhận không có shared_state objects; retry14commands đạt, kiểm remote3tables/8triggers/revision0 và migrationACK1 trước enable. Không upgrade Wrangler/deps.

Giới hạn: chưa Android thiết bị thật/4G; gateway TTS vẫn có độ trễ. Không thêm provider, shared audio/translation cache hoặc auto tải truyện. D: read-only. Reviewer chỉ phạm vi được giao, không audit toàn sản phẩm.
