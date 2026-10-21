
15/10/2026 — Prompt nửa sau dùng template riêng thay ô Quy ước xưng hô; canonical name/firstHalfTranslation/text và alias VI. Không ghi đè template riêng; restore nhận default mới. First checkpoint độc lập second template/Lite, đọc tương thích v1 cả2Lite; second identity gồm effective template/sample. Sample là toàn bản dịch first JSON-quoted; chưa gửi original firstSource. V1 API tiếp tục tương thích. Không tự sửa bản dịch cũ hoặc suy ra chất lượng/SLA từ STOP/noHan. Chi tiết private-novel/docs/AI-HYBRID-PROMPT-2.md.

15/10/2026 — Chia TXT: episode policy chỉ theo kiểu chương đang hoạt động, reset khi chuyển kiểu; custom regex kiểm raw. Wrapper/heading presentation không sửa chữ; damaged numeric chỉ next episode, không đoán tiêu đề. Đã audit14truyện theo yêu cầu nhưng không dùng preview/CAS snapshot cũ để re-split mù; shared-chapter v1 không đủ merge nhiều root. Áp dụng dữ liệu cũ cần capability layout có mapping IDs/progress/edits/atomic CAS/checksum; CHAPTER-REPAIR-M0.md. Gemma gọi được short, half1371 timeout30s; không kết luận model chết hoặc đổi thinking/timeout/tier chưa có đối chứng. AI header Convert dùng từ điển hiện có, RAW giữ nguồn.

## 15/10/2026 — Hybrid paired source v3
Nguồn nửa đầu + toàn bản dịch nửa đầu làm cặp mẫu; biến firstHalfSource/alias VI optional, thiếu thì tự chèn, không ghi đè template riêng. API v1/v2 giữ; whole-key protocol3, stage2 sourceHash/sampleHash; first checkpoint identity giữ. Reader Save giữ promise/prefix/error theo key+retry và rebind observers; chỉ retry/re-entry/navigation áp dụng prompt mới, prewarm settings không gửi lại foreground lỗi. Không đổi mặc định/model/key/provider/billing/bounds. AI-HYBRID-PAIR-3.md.


## 15/10/2026 — Thứ tự model ưu tiên 6 bậc
Cập nhật thứ tự fallback và ưu tiên theo yêu cầu người dùng: 3.8 Flash → 3.7 Flash → 3.5 Flash → Gemma 4 26B A4B → 2.5 Flash → 3 Flash Preview. Cập nhật AI_QUALITY_ORDER và danh sách AI_MODELS; menu hiển thị theo thứ tự ưu tiên mới; recommendedFallbackModels tự chuyển theo thứ tự xếp sau model đã chọn. DEFAULT_AI_MODEL giữ gemini-3.5-flash; không đổi provider/billing/quota.

## 15/10/2026 — Mốc đọc theo chương AI hoàn tất
Người dùng chốt tính cả prewarm. Progress.mode=ai/paragraph0/offset0 lấy chapter.order cao nhất đã hoàn tất, idempotent/chương cũ không kéo lùi. RAW/Convert cleanup không ghi đè. Resume không chỉ định chương ưu tiên mốc AI hơn TTS; không nhảy trang đang mở/autoplay. Đồng bộ existing progress kind tự max AI theo latest trong transaction/CAS, normal/tombstone giữ conflict. Không sync cache bản dịch/không quét cache lịch sử/không đổi source/DB version. AI-READING-PROGRESS-1.md.

16/10/2026 | AI-WHOLE-1/TXT-APPEND-1: hybridOFF gửi nguyên nguồn trong32k (EPUB đo JSONthực), chỉ chia limit/recovery, adopt legacycheckpoint cảspan/model. Reader chỉlatest/namescope, chosenold→custom giữsettings. TXT fullfile update append-only sauunique3tail; staging/CAS/bytesSHA; cloud snapshot immutable nên dùng state packet+manifest, dependencies trướcprogress, atomicsuffix+honestmissingblob, immutable keep-local intent khôngtombstone. Không schema/tier/provider/rotation mới; xem docs nghiệmthu.

16/10/2026 | TTS-WORD-BOUNDARY-1: giữ cap200normal/100recovery, ưu tiên clause ở nửa sau cửa sổ rồiwhitespace; hardcut chỉ tokenquá dài. UTF16offsets/text giữ; cursor oldoffset khôngkhớp segmentstart thì resetmediaTime, không seekaudio khác. Không đổi gateway/concurrency/schema.

16/10/2026 | AI-MINIMAL-UI-1: Reader chỉ giữ model thực tế this/next, chọn prompt theo body (không mất tên khi đổi model), prewarm/Name/retry. Chuyển soạn/thử prompt, hybrid/model/nhiệt độ/keys ra /settings/ai và /settings/ai/book; rời Reader dừng phiên theo navigation, checkpoint cũ giữ. Không schema/engine/key policy mới.

17/10/2026 | AI-UNIFIED-UI-1: DịchAI Settings chỉ chung; Reader nhớ prompt riêng và switch hybrid riêng, prewarm chỉ trong Reader. Runtime chọn đầu quality order hiện hành (3.8), nửa sau cố định3.5Lite; không bulk rewrite/cache clear. Chọn/lưu mẫu nửa sau giữ ID và snapshot gốc, tên prompt theo User/System độc lập mẫu chung. Bỏ Name/Stop/model chooser và scope chooser dư. Không schema/provider/key policy mới; hybrid cross-device vẫn là giới hạn hiện hành, chưa thêm cloud feature.

## 17/10/2026 06:57 — TTS-ANDROID-BACKGROUND-1
Hidden tạm hủy liveQuery(captureSharedRecords) và timer follow-scroll; visible đăng ký lại một observer + sync từ DB hiện hành. Không hủy transaction/sync đã bắt đầu, không đổi checkpoint/schema/CAS/audio/prefetch3. Lý do: checkpoint TTS mỗi giây đang kích hoạt chụp toàn thư viện dù mạng đã guard hidden. Đây là giảm tải đã xác minh, chưa kết luận nguyên nhân RAM hay hết giật khi Android khóa màn; cần thử thiết bị thật. Chi tiết private-novel/docs/TTS-ANDROID-BACKGROUND-1.md.

## 17/10/2026 07:06 — TTS-NETWORK-RESUME-1
Nút nghe khi loading chuyển sang pause giữ vị trí, không gọi Stop xóa cursor. Sau error, Reader gọi resume trên phiên player hiện tại; player cho phép resume từ error để giữ chunk/index/mediaTime và generation chống phản hồi muộn. Stop riêng vẫn xóa phiên. Không tự autoplay khi có mạng/reload, không đổi schema/persistence/provider/budget. Chi tiết private-novel/docs/TTS-NETWORK-RESUME-1.md.

## 17/10/2026 13:06 — thử giữ phiên TTS nền
Theo yêu cầu người dùng, thêm audio nền WAV im lặng 10s tự tạo/cùng origin, opt-in mặc định tắt và chỉ lưu thiết bị. Tối đa thêm một native Audio; pause/lỗi tạm dừng, Stop/tắt/unmount giải phóng. Giữ gateway, max3 request, nguồn/cursor/schema; không sao chép mã/media D. Chưa kết luận audio focus, tiết kiệm pin hoặc hết giật trên Android thật. docs/TTS-MEDIA-KEEPALIVE-M0.md và docs/TTS-MEDIA-KEEPALIVE-1.md.

## 17/10/2026 13:48 — giọng đọc thật giữ phiên media
Theo yêu cầu người dùng, MSE audio/mpeg sequence tự động trên trình duyệt hỗ trợ thay cho audio im lặng10s; bỏ file/helper/nút thử cũ. Một Audio/URL mỗi phiên, tối đa3 request gateway hiện có, giữ src khi nối chương đã chuẩn bị, trim đệm cũ30s. Cursor vẫn offset+giây trong đoạn; lỗi/pause/Stop/unmount và fallback trình duyệt không hỗ trợ theo docs/TTS-CONTINUOUS-1.md/M0. Không đổi schema/provider/cloud, không tự nhận đã xác minh focus/khóa màn Android thật.

## 17/10/2026 14:03 — rút MSE mặc định sau phản hồi Android
Người dùng báo MSE khựng giữa câu hơn bản cũ. Reader trở về MP3 từng đoạn và giữ phiên audio cũ đã có tác dụng; WAV10s cùng định dạng tạo tại máy bằng Blob, không tải HTTP. Tùy chọn/cờ local thiết bị được khôi phục; chưa chọn thì mặc định tắt. MSE chỉ opt-in qua constructor trong prototype tests, không tự bật theo supported(). Tests timeline không được coi là bằng chứng gapless/Android nghe thật. docs/TTS-PLAYBACK-RECOVERY-1.md.

## 18/10/2026 — Thống nhất AI/Prompt và mặc định nghe nền
- Một editor Dịch AI & Prompt; duyệt/chỉnh mẫu không thay snapshot đang đọc. Dùng mặc định áp dụng cấu hình chung; Reader giữ lựa chọn/switch của truyện. Profile validator/sync phải bảo toàn hybrid và template nửa sau, kể cả khi switch chưa bật.
- Giữ phiên và nối câu là hành vi tự động khi Nghe; bỏ checkbox kỹ thuật, không autoplay khi mở trang. Carrier vẫn Blob local/0HTTP, không đổi gateway/MSE/ngân sách.
- TTS cursor thêm grouping tùy chọn để không seek thời gian của câu cũ vào audio đã gom. Thiếu marker suy theo ttsFlex đã lưu; legacy retry nhỏ giữ ranh giới chuẩn đến khi trở lại canonical grouping. Không sửa nội dung truyện/offset để chuyển mặc định.
- Menu sách mobile dùng bottom sheet, desktop popover qua portal, gọi nguyên callback Sửa/Xóa; không thêm hoặc bỏ bước xóa dữ liệu. Chi tiết/bằng chứng: private-novel/docs/SETTINGS-UNIFIED-UX-PLAN.md.

## 18/10/2026 — Tổ chức tài liệu và output
README ở gốc là điểm bắt đầu; private-novel/docs/README.md phân nhóm tài liệu, src/README.md ánh xạ module và scripts/README.md hướng dẫn chọn lệnh. HANDOFF ở gốc vẫn là trạng thái hiện hành, nhật ký/DECISIONS ở gốc nhận entry mới; bản cũ giữ nguyên đường dẫn. Chỉ gom log gốc chưa tracked và không được source/script/tài liệu (kể cả archive) tham chiếu; lưu manifest và SHA-256 trong .dsh-tmp/project-organization. Log mới vào private-novel/.dsh-tmp/<tác-vụ>/. Giữ cấu trúc source/import và schema hiện có; không refactor runtime trong lần sắp xếp này.

## 18/10/2026 — TTS resume và tính toàn vẹn backup
- Khi seek audio cũ đang chờ metadata, giữ resumeTime thay vì lấy currentTime=0 của phần tử vừa tạo; callback phải thuộc đúng phiên phát.
- Backup per-book bổ sung Name List Convert tùy chọn để tương thích gói cũ. Restore hợp nhất trong transaction kích hoạt, chỉ thêm khóa thiếu, ưu tiên Name/tombstone hiện có; không biến backup thành đồng bộ ghi đè cài đặt.
- Xác minh SHA bytes nguồn/từ điển, size nguồn và thứ tự chương trước kích hoạt. Chặn export phần >16MiB theo giới hạn import hiện tại; đây không phải hỗ trợ Portable dung lượng lớn. Tham chiếu private-novel/docs/TTS-BACKUP-STABILITY-1.md.

## 19/10/2026 17:55 — Tuyển tập: ưu tiên mốc tên riêng trước cap chương
Scanner default giữ hai pool bounded2.000, quét hết bytes/SHA rồi chọn pool tên riêng khi có≥2 mốc; không tăng cap/truncate hay tự đổi Regex người dùng. Tên/chương dự đoán cần người dùng kiểm tra; thiếu dấu hiệu giữ fail-closed và mở Regex. Không đổi Batch atomic, byte partition/BOM/encoding, originals hay dữ liệu cũ. ANTHOLOGY-IMPORT-1.md; independent regression25 PASS/E2E16 PASS, production1dc91f16.

## 20/10/2026 — Tự tiếp tục dịch AI và nghe TTS
- Yêu cầu người dùng: lỗi tạm thời ở dịch AI/TTS phải tự phục hồi, giữ phần hoàn tất/vị trí nghe, có thông báo; nút nghe đổi biểu tượng theo trạng thái.
- TTS: hết retry nhanh thì chờ 2/4/8/16/tối đa 30 giây, tôn trọng Retry-After, chờ có mạng rồi tiếp tục cùng câu/giọng/thời điểm audio. Stop/Pause/đổi phiên hủy lịch; không thêm provider. Lỗi cấu hình/nguồn vượt giới hạn/quyền autoplay báo rõ thay vì lặp vô ích; phản hồi gateway hỏng được tải lại và vẫn phải qua validation.
- AI Reader (TXT/EPUB/hybrid và prewarm): tự tiếp tục lỗi transient sau backoff, dùng lại checkpoint; mỗi vòng có tối đa 3 send/đầu vào như cũ, vòng phục hồi sau cooldown được thử lại đầu vào lỗi. Tổng send/deadline của chương vẫn dùng chung, không tự cấp lại ngân sách, không fan-out. Lỗi auth/prompt/model/safety/giới hạn phục hồi vẫn cần được xử lý đúng loại và báo trạng thái.

## 2026-10-20 16:52 ICT — Dịch chia phần cùng model và tổ chức lại sau undo dở
Người dùng trực tiếp cho phép hai key đã cấp chạy đồng thời cho các phần khác nhau của một chương, thay nửa sau Lite. Đây là ngoại lệ cụ thể cho ràng buộc fan-out cũ; không thêm provider/billing/key. Reader mặc định splitParts, cùng model đã chốt; tắt switch dùng whole trong giới hạn API. Giữ dữ liệu/prompt hybrid cũ, chuyển chỉ ở runtime; không tái dịch hay sửa nguồn hàng loạt. Form PromptFields dùng chung; settings và scheduler tách module. Tài liệu hiện hành: private-novel/docs/AI-PARALLEL-PLAN.md; log/decisions chính ở root. Chưa cho phép nghe prefix trong lượt này; TTS tự phục hồi hiện có được giữ.

## 2026-10-20 — Kiến trúc feature-based cho src/ (theo giai đoạn)
- Chuyển dần `src/` sang `src/features/<domain>/{components,services,types,...}`; bước 1 `features/ai/` gồm toàn bộ dịch AI + prompt (38 file). Các nhóm khác (reader, tts, names-convert, import-export, sync-cloud, library) và `core/`, `shared/` làm ở bước sau.
- Mỗi bước chỉ move + cập nhật specifier (relative import, `vi.mock`, dynamic import, `new URL`, `@import`, và URL tuyệt đối `/src/...` trong E2E); không đổi tên export/API, không sửa schema Dexie/atomic/cancel/worker, không tạo migration.
- Dùng script mapping có verify canonical (mask specifier) để chứng minh chỉ import thay đổi; backup `src`/`tests` trước mỗi lần move; build phải exit0 trước khi sang bước kế.
- src/README.md cập nhật theo vị trí mới; không dùng việc đổi thư mục làm lý do đổi ngữ nghĩa hay viết lại tài liệu lịch sử.

## 2026-10-21 — Move file phải cập nhật cả literal path (không chỉ import)
Ngoài import specifier, tests/scripts còn đọc trực tiếp file nguồn bằng chuỗi đường dẫn (`readFile('src/ui/Reader.tsx')`, `readFileSync('src/tts.ts')`, esbuild entry `join(root,'src/ai-reading.ts')`). Mỗi lần move phải chạy `.dsh-tmp/refactor-ai/fix-literals.mjs <mapping...>` rồi quét lại `src/<tên-cũ>` trước khi build/test; đây là lỗi thực đã gặp ở bước 1–2 dù import đã sạch.

- 21/10/2026 14:02 | Hoàn thiện fix review F1–F7: title backfill chỉ update field dẫn xuất khi row/owner/raw title còn khớp; không bulkPut snapshot. Restore nhận order hữu hạn không âm tăng nghiêm ngặt xuyên packet và normalize, vẫn xác minh checksum/manifest/count/atomic replace, đọc được backup split cũ. EPUB batch theo policy mỗi file được chọn→một truyện như TXT/folder. Tên file tải và size limit theo source encoding, giữ đuôi khi cắt tên; không sửa bytes/tên nguồn lưu. Custom prompt hiển thị book??common nhưng CAS dùng book row thực tế. displayTitle đồng nhất capture/read-local/download baseline; thiếu field từ client cũ giữ tương thích hiện hành. Bằng chứng: private-novel/.dsh-tmp/fix-completion/COMPLETION.md.

- 21/10/2026 | TXT cập nhật: giữ chế độ file đầy đủ mặc định; thêm lựa chọn tường minh file chỉ có chương mới, nối toàn bộ file theo thứ tự sau chương cuối. Chặn trùng title/text chuẩn hóa với chương đã lưu và trong file; không suy đoán số chương hoặc tự thay chương cũ. Cả hai dùng preview + transaction/CAS/manifest hiện có; không đổi schema/provider/cloud protocol. Chưa deploy.

- 21/10/2026 | Cập nhật TXT dùng cùng StreamingSplitter và mặc định giữ nguyên chương(maxChars0) như Nhập truyện. Cho chọn tùy ý trong suffix đủ điều kiện, chỉ manifest/commit chương được chọn theo thứ tự file, không sửa old rows; bỏ chương có thể mất mốc full-file lần sau, UI nêu dùng new-only. Watchdog chia worker30s và chuyển tiêu đề/ghi batch120s, stop ngắt chờ conversion nhưng vẫn drain native IndexedDB trước dọn staging. Không đổi schema/cloud protocol.

- 21/10/2026 | TXT cập nhật full không còn bắt buộc nội dung100% giống. Exact tail vẫn yêu cầu mốc duy nhất; fallback title-tail chuẩn hóa là gợi ý, thiếu/đa mốc mở manual. Cả hai không tích sẵn và service bắt buộc IDs explicit; chặn known/repeated title/body ở mọi nhánh. Preview mới nhất cuối file lên trước; lưu vẫn theo thứ tự nguồn, không sửa chương cũ hay fuzzy-overwrite. Không đổi schema/cloud protocol. Cơ chế manual hỗ trợ kiểm tra lại khi lần nhập trước đã bỏ chương.
