# READER-MINIMAL-2 — kế hoạch thao tác tối giản
Ngày:08/10/2026 22:13 ICT. Root Codex khảo sát mã thực, chỉ lập kế hoạch; chưa sửa ứng dụng/deploy.
Yêu cầu: bỏ bảng Convert đoạn chữ Trung; ít nút, ít giải thích; thêm/xóa Album; kho prompt trong Cài đặt; mỗi truyện có Name và prompt riêng.

## Bằng chứng hiện trạng
- DictionaryPanel.tsx:7,173 import/render ConvertPanel; đây là bảng độc lập người dùng yêu cầu bỏ. Reader vẫn phải Convert bình thường.
- Reader.tsx:215–241 có Dịch AI trong hàng mode và floatingAI; Nghe toolbar/floating/speechpanel cùng handler, cài đặt nghe tách khỏi gear.
- App.tsx Album là distinct Book.album từ local/cloud union, chưa registry độc lập: Album rỗng không tồn tại. Có nút tiêu đề mở thông tin và Mở sách riêng.
- AiPanel.tsx lưu một ai-translate-settings trong db.settings, không bookId/profile registry. Reader truyền sourceIdentity nhưng chưa truyền bookId riêng.
- db.names đã có bookId/[bookId+key]; Name riêng đang hoạt động. Cloud snapshot immutable chỉ chứa Name lúc nhập, sửa Name/prompt/Album về sau chưa sync đầy đủ.

## Bố trí cuối
- Tủ sách: ô tìm → lọc Album → danh sách tên truyện đầy đủ, dễ đọc; Thêm truyện và menu ⋯. Nhấn tên mở đọc tiếp; Thông tin/Mục lục/Sửa/Xóa trong ⋯, bỏ Mở sách trùng.
- Bộ lọc Album có một nút quản lý bên cạnh: tạo, đổi tên, xóa, chuyển truyện; không trải nút trên từng card.
- Reader: tên chương gọn; điều hướng chương ở đầu/cuối vẫn giữ vì phục vụ hai vị trí cuộn khác nhau.
- Cụm điều khiển duy nhất luôn tiếp cận được: chọn Bản đọc (Convert/Bản gốc), Nghe/Tạm dừng/Tiếp tục, ⋯. AI/Name/Hiển thị/Giọng/tốc độ/Sửa chương/Xuất nằm trong ⋯. Không hàng toolbar và cụm floating trùng nhau.
- Nghe mở ngay bằng một chạm; khi đang nghe hiện Dừng trong cùng cụm. Không tự gọi AI hoặc TTS chỉ vì mở panel/chọn prompt.
- Bảng AI: Chọn prompt → Dịch → kết quả; Chỉnh prompt thu gọn. Có selector Chung/Riêng truyện khi quản lý, không hỏi xác nhận lại.
- Name: bấm từ trực tiếp mở popup, mở rộng cập nhật HV/nghĩa; Lưu cho truyện mặc định, thao tác Name chung trong phần nâng cao. Quản lý Name vẫn cùng kho bookId.
- Bỏ copy quảng bá/trạng thái thành công thường trực, SHA/path/giới hạn kỹ thuật đưa vào Thông tin nâng cao. Giữ lỗi có hành động xử lý, loading cần thiết và nhãn truy cập/aria. Không giấu lỗi mất dữ liệu thành toast thành công.
- Bỏ ConvertPanel khỏi Cài đặt; giữ quản lý từ điển và engine Reader. Không xóa globalNames/dict/test core vì bỏ panel.

## Kho prompt
- Cài đặt → Kho prompt: danh sách đặt tên, thêm/sửa/nhân bản/xóa; profile gồm id,title,systemPrompt,userPrompt,temperature,updatedAt,version. Một prompt chung mặc định.
- Mỗi truyện có tập profile riêng và activePromptId; tạo mới có thể sao chép profile chung. Bản riêng là snapshot, sửa chung không âm thầm đổi bản riêng.
- Reader hiển thị chung + riêng truyện, một lần chọn áp dụng và nhớ riêng theo bookId; đổi prompt/chương/Name hủy job cũ, giữ bản đọc.
- Chuyển ai-translate-settings hiện có thành profile chung qua migration idempotent; lỗi đọc không overwrite. Giữ giá trị cũ đến khi migration thành công, không reset nhiệt độ/prompt.
- Không dùng title/chapterId làm khóa truyện. Xóa profile đang chọn fallback rõ về mặc định; xóa truyện dọn riêng đúng bookId, không xóa profile chung.
- Không hứa đa thiết bị với db.settings local. Mục tiêu cuối prompt/Name/Album đồng bộ qua metadata revision API; không sửa snapshot immutable để giả đã sync.

## Album
- Registry có ID ổn định và tên hiển thị để tạo Album rỗng; quan hệ membership theo bookId. Chưa chốt schema trước khảo sát STORAGE2/migration.
- Xóa Album chỉ gỡ nhóm và đưa truyện về Chưa có Album; không gọi deleteBook/deleteCloudBook, không xóa chương/Name/prompt/originals.
- Không tự thêm tính năng xóa Album kèm truyện. Không hộp confirm; có Hoàn tác gỡ nhóm nếu khả thi.
- Folder nhập vẫn tạo Album theo fullrelativepath, mỗi TXT một truyện và bắt buộc chia chương. Không tự gộp các leafname giống nhau.
- Kho chung cần album registry + membership revisions độc lập; không chỉ cập nhật Book.album local rồi báo đồng bộ. Migration legacy album string không đổi ID truyện/nguồn.

## Thứ tự thực hiện và quyền sửa
1. MIN2-1 UI ít rủi ro: DictionaryPanel/App/Reader/style và E2E liên quan. Bỏ ConvertPanel render, gộp controls/copy, giữ engine/source/settings/Name/TTS/AI handlers. Không DB/server/schema. Nghiệm thu: không còn panel/nút AI-Nghe trùng; ChineseConvert+popup vẫn chạy, vị trí cuộn không nhảy.
2. MIN2-2 prompt local: module profile và Settings UI/AiPanel/Reader, migration legacy có test riêng. Scope settings data; reviewer độc lập kiểm idempotence/rollback/late-read/cancellation/deletion. Nghiệm thu hai truyện cùng chữ nguồn dùng prompt/Name riêng không lẫn, reload giữ đúng, chọn đổi một thao tác.
3. MIN2-3 Album local: chốt registry/mapping migration, create/rename/remove/move và import integration. Reviewer độc lập data. Nghiệm thu tạo rỗng/reload, xóa Album giữ từng byte truyện+Name+prompt, pathcollision và cancellation an toàn.
4. MIN2-4 metadata đa thiết bị: Name/prompt/Album revisions, conflict/delete/tombstone, atomic publish và backwardcompat. Spike số đo catalog/RAM/request trước feature; không bulk load text/dictionaries để hiển thị menu. Không migration server trước review/test.
5. Deploy sau test/build/E2E/review của mỗi phạm vi hoàn tất; production smoke dùng fixtures tổng hợp, không xóa truyện thật.

## Invariants và kiểm thử
- RAW/chương/sourceSHA/settings/tiến độ không thay do dọn UI; Convert không blank/nhấp nháy khi đổi Name; không gọi AI/TTS tự động.
- Giữ cloud-delete trước local-delete; rollback importer nativeabort đã nghiệm thu. Không PIN/login/AIcode/confirm phụ; key chỉ server. D chỉ đọc.
- Sau code: npm.cmd test; npm.cmd run build; npm.cmd run test:e2e -- --reporter=line với spec liên quan, --repeat-each=3 cho các ca race/flake.
- E2E Chinese fixture: mở truyện→Convert→sửa Name→expandHV/nghĩa→reload, scroll/source continuity; Nghe pause/resume/stop và AI close/sourcechange; không duplicate control.
- Prompt regression: legacy migration lặp/reload, savefail, A→B→A identity, profile bị xóa, Name/prompt stale response, malformedsettings, template variables/limits; không gọi Google thật trong test tự động.
- Album regression: rỗng/rename/trùngpath/removekeepbooks/move/multitab/importcancel/cloudconflict, từng nội dung/source/Name/prompt còn nguyên.
- Mobile Windows Edge viewport390/510/522 và desktop1280; nooverflow, controls≥44px, panel không che hết chữ. Android Chrome thật keyboard/rotation/background chưa xác minh đến khi có thiết bị.
- Không coi test cũ531/216 là nghiệm thu feature mới. Phiên này tài liệu chỉ; không chạy lại test/build, không đổi production387b2a49.

## Checkpoint09/10/2026 07:25
- MIN2-1 mộtphần đãdeploy91c7f479: bỏConvertPanel/Chỉđọc/Nghetoolbartrùng; AIinline và⚙AIconfig distinct. Truyện/card/danh sáchAlbum chưa đổi registry.
- Prompt mỗi truyện có một cấu hình riêng; kho namedprofiles chung/riêng trong Cài đặt chưa triểnkhai. MIN2-2 là nexttask, không coi configđơn là kho prompt.
- MIN2-3 Albumregistry/createempty/remove/move vàMIN2-4 cloudmetadata chưa làm. XóaAlbum phảigiữtruyện, không hỏiconfirmphụ.
- Proof root595unit/build84 và198scenarios đãcovered bằng192pass+6Namefinal; strongreview66/160/build0; realGemini/nativeTikTokprod đạt. Cácphần chưa làm không nhận proof từrelease này.

## Checkpoint09/10/2026 12:28 ICT — MIN2-2/3
- Kho prompt chung/riêng vàAlbumlocal registry đã deploy47fdc6f2; Quản lýAlbum thu gọn ngay Tủ sách, không thêm menu chính. Local-only chưaMIN2-4metadata.
- Root650unit/build88/48AlbumimportrepeatE2E/72promptinlinegatefinal, reviewer33Album+38prompt/build0, productionChineseUI/Gemini1280/510 đã kiểm. Androidhardware chưa.
- STORAGE2-IMPLEMENTATION-CHECKPOINT.md thiết kế+catalogspike; sourceoriginal40MiB nativeR2wholeSHAstreamspike đangdở, khôngenablefeature. ChưaEPUB/AIpersistent/cache/chunk/metadata/bulk.
