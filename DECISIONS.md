
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

## 22/10/2026 — Chọn Name AI theo vị trí tương đối
Theo chỉ đạo trực tiếp người dùng: cụm AI/Convert chỉ cần gần đúng; bỏ điều kiện phải bằng số đoạn và toast chặn. Nội suy vị trí thứ tự giữa các đoạn không rỗng, chọn một đoạn nguồn; không căn chỉnh ngữ nghĩa, không gọi AI hoặc thêm bước xác nhận.

## 23/10/2026 — Convert server: chọn SQL candidate cho probe, chưa tích hợp Reader
- Trong Worker thử không public route, khi không có Rules, dùng mảng codepoint raw/normalized và SQL suffix-window loại trùng context để tạo cụm theo cap UTF16. Giữ LanguageEngine, thứ tự ordinal/token/lookup; có Rules dùng JS discovery cũ. Flag chỉ bật ở config probe.
- Mẫu remote mới đạt CPU mục tiêu; chưa coi là nghiệm thu production. Trước mở API/Reader cần shared quota guard (PUBLIC_LIBRARY1/sameOrigin không phải owner auth), pin phiên bản từ điển, cancellation/stale/token-range và cold/concurrency. Không thêm PIN/login, provider, paid tier; không tự lấy từ điển default thay bản người dùng.
- Bằng chứng/giới hạn: private-novel/docs/SERVER-CONVERT-FREE-M0.md, .dsh-tmp/server-convert/.

## 23/10/2026 — Convert AI Name trên Free, phạm vi có giới hạn

Reader AI TXT dùng service binding Convert mặc định, cửa sổ256 UTF-16 tại vị trí tương đối, tra theo token và whole lookup chỉ khi mở rộng. Cache riêng RAM8 mục; so SHA/version/snapshot và abort; local fallback chỉ do người dùng chọn. Corpus083752ea bất biến và pin manifest/version; không thêm provider/billing/PIN, không đổi AIWorker hoặc DB thư viện.

Quota CAS reserve2M/ceiling3M ngàyUTC là guard bảo thủ, không chứng nhận hard quota toàn account. Bộ đo bản7814891b có9observations, P50=6,7ms/P99=13,32ms,0runtime/exceededCPU errors; chưa đạt mục tiêu P99<10ms và không suy thành bảo đảm mọi input/cold/concurrency. Tài liệu Cloudflare hiện hành xác nhận10ms Free có rollover/flexibility khi thỉnh thoảng vượt; vượt liên tục sẽ bị terminate: https://developers.cloudflare.com/workers/platform/limits/#cpu-time và https://developers.cloudflare.com/workers/observability/metrics-and-analytics/ . Vì vậy triển khai tính năng Name có cap/fallback trên Free như khả năng best effort, không tuyên bố M0 Convert tổng quát đạt mọi tải hoặc nâng paid để vượt gate. Giữ cả số đo không đạt, các lỗi assertion và giới hạn trong docs/SERVER-CONVERT-FREE-M0.md.


## 23/10/2026 — AI Reader tự phục hồi qua nhiều đợt
Theo yêu cầu trực tiếp của người dùng, thay quyết định không tự cấp lại ngân sách chương ở mục phục hồi trước đây: mỗi đợt vẫn giữ nguyên deadline/send cap, nhưng khi hết đợt có thể tự mở đợt mới sau ít nhất60s và Retry-After. Session kiểm tra điều kiện exhausted/cooldown; giữ phần đã hoàn thành, model pin, snapshot, shared cooldown và tối đa2key. Lỗi mạng/quota/timeout tiếp tục tự động; kết quả rỗng/thiếu/sai định dạng thử lại chậm. Auth/input/config không thử mù, chờ điều kiện hợp lệ; không tự đổi key/prompt/provider. UI trạng thái chờ màu hổ phách, giữ mã lỗi chẩn đoán; chỉ hoàn tất khi mọi phần hợp lệ. Stop vô hiệu hóa timer/callback cũ; không xóa session prewarm trong khoảng chờ hydrate chương mới. Không đổi DB/schema, không tự dịch lại dữ liệu cũ.


## 23/10/2026 — Đọc tiếp theo vị trí đọc, không theo dịch sẵn
Theo báo lỗi trực tiếp của người dùng, bỏ hợp đồng bookmark AI là chương hoàn tất cao nhất (bao gồm prewarm). Prewarm/completion chỉ giữ cache; chương đang được mở và đoạn thực sự nhìn thấy mới ghi tiến độ. Progress.reading?:true đánh dấu bookmark thực, tương thích record cũ, không migration/tái nhập/sửa nguồn. AI dùng chỉ số đoạn bản dịch bounded512000/offset0; TXT prefix ngoài mốc lưu phải chờ, chỉ clamp khi bản đầy đủ; EPUB chờ đầy đủ. Mốc thực thắng AIlegacy/prewarm dù legacytimestamp mới hơn; actualAI/raw dùng thời điểm quan sát thay vì thứ tự chương, tie khác vị trí giữ conflict/CAS. Hash actualprogress gồm updatedAt để đồng bộ lần đọc mới cùng vị trí; cleanup/hidden chỉ flush timestamp quan sát cũ. Bookmark thực ưu tiên hơn TTS cursor cũ khi chọn chương/mode; không tự phát audio. Không tự suy diễn/sửa bookmark lịch sử đã sai khi không còn bằng chứng vị trí đọc.

## 23/10/2026 — Mốc phần dịch cho AI TXT Name, giữ nguyên UI
Theo yêu cầu người dùng, không thêm mũi tên/nút/UI. TXT nhiều phần ghi textMap nguồn→kết quả từ plan thật và thứ tự ghép có newline, không yêu cầu AI trả ID, không đổi prompt/chia phần/scheduler/request. Parser cache chỉ nhận offset hợp lệ, whitelist và bỏ riêng metadata khi sai/quá cap; cache cũ dùng tiếp. Reader tìm phần chứa điểm bấm, ưu tiên đoạn nguồn có phần giao lớn nhất với đoạn AI; cửa sổ256 UTF-16 giữ nguồn/Unicode. Đây là căn tương đối trong phần, không bảo đảm ngữ nghĩa. Một phần giữ response identity và fallback cũ. Không migration/xóa cache/dịch lại bản cũ/thêm provider; chỉ tính căn đoạn khi mở picker.

## 23/10/2026 — Hiện số phần dịch và lý do ngay trong bảng AI
- Theo yêu cầu người dùng: hai dòng Chương này/Chương sau hiện số phần và lý do chia; bỏ footer Cài đặt dịch AI. Điều hướng chương dùng ba vùng bấm rộng, cao tối thiểu 48px; mục lục mở trang chứa chương hiện tại, tự cuộn tới nhãn Đang đọc.
- `division` là metadata cục bộ theo kế hoạch/phục hồi thực tế, không suy từ dấu ♾ hay công tắc hiện tại. Đếm theo cây phần có ID ổn định, dùng metadata nhánh hoàn tất để tránh đếm lặp khi retry/resume. Lý do là enum, không chứa prompt/key/nội dung nguồn.
- Cache lưu metadata tùy chọn đã lọc trường và kiểm kích thước; sai/thiếu metadata không loại bản dịch hợp lệ. Cache cũ thiếu chứng cứ giữ trạng thái chưa biết; không tự dịch lại/xóa cache. Single response trong RAM giữ nguyên identity, metadata mới lưu qua bản sao. Không đổi request/model/ngân sách dịch, scheduler/lease/cancel, bytes nguồn hay bookmark.


## 24/10/2026 01:33 ICT — D1/D2: facts và runtime AI
Sidecar request identity giữ raw response identity/facts validation ở RAM; cache tiếp tục whitelist metadata hiện có, không lưu phase/countdown/Stop, không gọi AI để bù facts legacy. Presenter tách content/phase; cached complete vẫn ready khi prewarm off. UI đếm lá theo cây ID nguồn, aggregate hoàn tất authoritative; scheduler/lease giữ nhóm cũ. Hybrid legacy thiếu chứng cứ toàn chương thì tỷ lệ unknown. Dừng chương này/chương sau dùng điều khiển hiện có, không thêm UI. Theo yêu cầu D1→D2 và docs/UI-READER-UX-PLAN.md.


## 24/10/2026 10:13 ICT — URL Reader ngắn và ổn định
Người dùng chọn mã ngắn. Base64url22 đủ16byte UUID lowercase, không prefix/truncation/alias DB. Parser giải ngược full UUID trước lookup, /r/book/chapter; /read cũ giữ tương thích và replaceState khi xác định đúng chương, không thêm history entry. ID tùy ý/case-sensitive không phải UUID lowercase giữ route cũ; book/settings giữ nguyên. Không đổi nguồn/bookmark/cache/sync/migration.


## 24/10/2026 10:43 ICT — Numeric book code + TOC position
User đổi từ UUID22 sang /r/<mã-số>/<vị-trí-mục-lục>, đếm1 bỏ chương ẩn; không lấy số tiêu đề. Dùng registry D1 immutable rowid+10000, only ready nondeleted existing books, no-recycle/cap100k/auth/origin. Local cache hai chiều chỉ từ mapping server validated; unavailable/local-only keeps old URL. Chapter resolution cùng stable sort order+visible filter như TOC, out-of-range errors, không resume nhầm bookmark. Vị trí thay đổi theo sửa mục lục; UUID/base64 vẫn định danh chương gốc. Route canonicalization replaceState với owner generation/book guard. Schema0014 additive/direct; không chạy pending0013/đổi IDnguồn.


## 24/10/2026 11:33 ICT — Giới hạn agent và checkpoint trước full suite
Theo yêu cầu nghiên cứu bài rohit2113579599624114313 và cải tiến AGENTS.md: mặc định1agent, tốiđa1reviewer cho rủi ro thật trừ chỉ đạo khác; reviewer không spawn con/full-history. Chạy dài không tự tăng agent/phạm vi/model/effort. Nếu mơ hồ ảnh hưởng định danh/cách đếm/lưu trữ/kiến trúc, làm rõ trước phần phụ thuộc. Gom code/regression và kiểm tra rẻ trước full; thêm kiểm đúng ranh giới HTTP/runtime khi bị đổi. Không giảm gate an toàn/full test rủi ro, giữ model reviewer và toàn bộ khối bảo toàn. Chỉ guidance tại repo; không đổi global config hoặc trần runtime cứng. Nguồn/giới hạn ở private-novel/docs/AGENTS-MD-RESEARCH.md; chưa benchmark usage.

## 24/10/2026 — Kho Name dùng chung theo tác giả
- Người dùng xác nhận lấy Album tác giả ngoài cùng, gồm mọi series. Settings chọn một kho/Album, tìm Name/phân trang10; truyện ngoài Album giữ kho riêng.
- Thêm record album-name theo từng khóa vào shared-state CAS/tombstone hiện có; không thêm DB/billing/provider. Name mới áp dụng Convert và lượt AI sau, không dịch lại kết quả hiện tại.
- Không chuyển/xóa dữ liệu cũ: legacy cùng nghĩa đọc chung; nghĩa khác giữ riêng tới khi lưu lựa chọn Album. Tombstone che fallback. Đổi tên gốc mang cây/kho theo trong transaction, không gộp đích đã có dữ liệu.
- Backup optional albumNames kiểm cùng gốc, thêm thiếu lúc kích hoạt, giữ live/tomb hiện có. Nguồn/ID/chương/progress giữ nguyên. Chi tiết private-novel/docs/ALBUM-NAMES-M0.md.


## 25/10/2026 00:46 ICT — CapCut v2 dùng phiên của người dùng
Người dùng cho phép đổi gateway, chọn rõ CapCutv2 dùng phiên và chốt BV074_streaming. Tích hợp session-only cùng origin trên Pages; cookie/device metadata chỉ vào CAPCUT_SESSION_JSON secret, không UI/Git/DB/backups/log. Không tự đăng nhập bằng mật khẩu; không dùng phiên/profile mẫu. Giữ player/cursor/voice IDs; chỉ opt-in VITE_TTS_GATEWAY=capcut-v2 sau khi probe âm thanh thật đạt. Backend có thể deploy trước với client chưa bật. Mapping/giao thức pin trong docs/CAPCUT-TTS-V2-M0.md; không coi mapping hoặc mock pass là upstream hoạt động/miễn phí/SLA.

## 25/10/2026 15:54 ICT — TTS ít thao tác, cookie-only
Người dùng muốn ít can thiệp, chỉ đề nghị cookie. Cho phép giữ cookie mới của endpoint CapCut hiện có trong D1 runtime AES-GCM/CAS, khóa dẫn xuất từ bootstrap secret, namespace đổi khi bootstrap đổi; không mật khẩu/tự login. Quyết định này thay giới hạn session-only không lưu DB trong docs CapCut cũ bằng lưu encrypted runtime tách library/backup. Audio cache thiết bị riêng32MiB/256đoạn/24h, không sửa cursor; tối đa3active và no autoplay reload. Thu hồi phiên hoàn toàn vẫn cần chủ tài khoản login/cookie mới; không cam kết vĩnh viễn. docs/TTS-AUTONOMY-M0.md.
