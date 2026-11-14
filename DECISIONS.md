
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

## 25/10/2026 21:03 (UTC+7) — Cấu hình thực dùng và thử prompt
- Theo yêu cầu mục1/mục5: cấu hình request được server ghi bằng metadata tùy chọn (model sau alias, nhiệt độ thực gửi hoặc null, thinking theo provider, maxOutputTokens, SHA256 cấu hình prompt); không lưu nguồn/Name/prompt/secret trong metadata, không thay mặc định thinking/model. JSON cũ và cache thiếu metadata vẫn dùng, UI ghi chưa biết. Chỉ gộp metadata khi mọi phần giống nhau.
- Cache chỉ bỏ ảnh hưởng nhiệt độ khi TẤT CẢ model reachable (kể cả fallback/hybrid) không dùng tham số này. Giữ identity cũ làm nhánh đọc, không di trú hàng legacy khác hash; giữ LRU hiện có cho canonical. Không đổi schema/progress/source.
- A/B chỉ ở cài đặt prompt, hai request thủ công lần lượt với nguồn/Name/model/nhiệt độ chung, snapshot DTO trước khi gửi; không fallback/cache/ghi settings hoặc progress. Dừng/input đổi/unmount chặn kết quả muộn. Mục3 văn phong/hiệu năng và mục4 nhất quán ngữ cảnh chỉ giải thích, chưa triển khai.

### 26/10/2026 — Restore Name bảo toàn nghĩa đang dùng
- Add-only tính cả legacy consensus hiện hành: backup không được ghi đè nghĩa/xóa bằng tombstone hoặc tự giải quyết legacy conflict của Album đang dùng. Kho trống vẫn phục hồi tombstone. Không sửa legacy nguồn.
- Capacity kho Album kiểm shared base cộng conflict-key riêng của mọi thành viên trong cùng transaction, trước commit restore/sync/chọn conflict/chuyển Album; kiểm cả root cũ/mới. Vượt20k rollback, không ACK/drop record. Review và bằng chứng: private-novel/docs/RELEASE-REVIEW-2026-10-26.md.

### 26/10/2026 — TTS phục hồi đầu không chờ
- Theo yêu cầu người dùng, request mạng/5xx thử lại đầu không có600ms, audio/current-chunk phục hồi đầu không có2s. Sự kiện online đánh thức ngay tại cursor hiện hành, bỏ giãn lượt cục bộ nhưng không bỏ Retry-After máy chủ.
- Giữ burst hữu hạn, backoff2–30s khi lỗi lặp; phiên hết hạn vẫn chờ phiên hợp lệ, không tính lần chờ phiên vào backoff lỗi audio. Stop/pause/unmount gỡ cả timer+online callback, giữ ≤3active và no-autoplay reload. Không thêm provider/key/schema. Bằng chứng: .dsh-tmp/tts-immediate/, docs/TTS-AUTONOMY-M0.md.

## 26/10/2026 22:05 +07 — Hai cải tiến latency AI đã chốt
TXT mới dùng plan txt-output-budget-1 khi ước lượng vượt ngân sách output8192/headroom2048; ước lượng không phải tokenizer. Giữ nguồn/biên Name/Unicode; Name chặn chia sớm thì dùng bố cục an toàn cũ. Checkpoint cùng identity chọn một plan tương thích, không ghép namespace; legacy hybrid giữ hợp đồng hai nửa.
Bật song song chỉ mở sớm slot2 khi lease báo đủkey và model đã ghim hoặc chỉ cấu hình một model; shared admission/cooldown vẫn cap2. Phục hồi chỉ fork một cấp, drain sibling trước lỗi. Prefix chỉ gồm STOP liên tục từ đầu, parent thắng con cũ, dừng ở gap; cache toàn chương chỉ ghi khi đủ. Điểm nối TTS qua newline giữ indentation ở đầu câu kế tiếp để không đọc lặp. Không đổi prompt/temperature/thinking/provider/keys/UI. Chi tiết: private-novel/docs/AI-LATENCY-RESEARCH-2026-10-26.md.

## 27/10/2026 — TXT tự nhận diện từng file, suy luận tiêu đề vẫn qua preview
- Theo lựa chọn tự động của người dùng: mọi bộ chọn encoding của nhập/cập nhật TXT truyện mặc định auto, mỗi file nhận diện riêng. Auto chỉ là sentinel UI, không lưu vào nguồn. BOM ưu tiên; kiểm tra fatal toàn bộ và decoder tail, lỗi BOM/manual không fallback. BOMless dùng dấu hiệu UTF16 đủ mạnh hoặc UTF8→GB18030; giữ manual vì byte có thể mơ hồ.
- Có thể đề xuất ranh giới 第N章 dính giữa dòng khi có tiêu đề rõ, chuỗi số liên tiếp/duy nhất và khoảng cách theo marker thô gần nhất đủ lớn. Giữ trần tiêu đề80, guard tham chiếu và bỏ inference khi có regex tùy chỉnh. Số mốc chỉ là metadata preview tạm; không thay schema hay source bytes.
- Không tự chia lại dữ liệu cũ hoặc thêm chương khi chưa xác nhận. Append vẫn dựa mốc nội dung/title/manual và CAS; số chương suy luận không quyết định ghi đè. Cảnh báo hiển thị ngoài phần thu gọn. Phạm vi không đổi JSON/API/Name/dictionary/EPUB.

## 27/10/2026 — Cải tiến UI theo từng lần nhắn
- Người dùng yêu cầu tiếp tục cải tiến UI/UX, giữ tích hợp tính năng và tự hoàn thiện từng phần mỗi khi gửi lại prompt này. Mỗi lượt chọn một khu rõ ràng, làm xong kiểm tra và deploy trong phạm vi đã được phép; không cần hỏi lại lựa chọn UI thông thường.
- Lượt này hoàn thiện cập nhật TXT và bản xem trước trên trang truyện; lượt tiếp theo ưu tiên mục lục. Tính năng dữ liệu, đọc/nghe, đối chiếu, chọn chương và xác nhận giữ nguyên; dùng progressive disclosure cho tùy chọn đọc file.

## 27/10/2026 — Ba màu giao diện dùng chung
- Trắng/Giấy/Tối dùng reader.theme hiện có cho shell, hộp thoại và Reader; không thêm schema hoặc nguồn cài đặt thứ hai. Bộ chọn ở Cài đặt→Giao diện và mục Nền trong Reader. LocalStorage chỉ cache màu khởi động; IndexedDB/sync vẫn là nguồn chính. Mặc định Giấy, legacy gray chỉ hiển thị tương đương Tối trên shell, không tự ghi lại dữ liệu.
- Chỉ thao tác chọn bộ màu mới xóa background/textColor tùy chọn, giữ các thiết lập khác và ảnh nền; writer đọc bản mới dưới queue/transaction reader. Màu tùy chọn nâng cao của Reader tiếp tục hoạt động.

## 27/10/2026 12:12 ICT — Quy tắc model/agent đã chốt
- Người dùng yêu cầu đưa bộ quy tắc mới vào AGENTS.md, thay các quyết định cũ về model/effort/số agent/reviewer. Astra chính mặc định Medium→High theo rủi ro; Sol triển khai logic; Terra UI/ảnh/thao tác/viết; Luna thu thập/kiểm tra cơ học. Trần3 gồm chính+2phụ; Ultra/tăng trần cần lựa chọn riêng.
- Review rủi ro cao: Astra High độc lập, bao phủ diff cuối; logic nhiều trạng thái/module có Sol High review theo nhu cầu. Sau2phương án không tiến triển phải xét lại giả định/trả điều phối; giữ bằng chứng runtime về model thực tế.
- AGENTS.md là hướng dẫn thực thi; private-novel/docs/MODEL-USAGE-RULES-DRAFT.md được đánh dấu đã chốt, giữ diễn giải. Cập nhật này không chỉnh config.toml/model phiên đang chạy/quyền công cụ; ràng buộc dữ liệu/secrets tiếp tục có hiệu lực.

## 27/10/2026 17:02 ICT — TXT dưới6.000 ký tự dịch nguyên chương
- Người dùng chốt: nội dung gốc TXT source.text.length<6000 (UTF-16, gồm khoảng trắng/xuống dòng) không chia, kể cả splitParts=true; lỗi phục hồi thử lại nguyên văn trong retry/cooldown/send/deadline hiện có. Đúng6000+ giữ planner và phục hồi cũ; EPUB validate và các stage nội bộ của hybrid chương dài giữ contract riêng.
- Plan txt-short-whole-1 tách namespace checkpoint khỏi bố cục cũ, không nhận child/partial root từ plan cũ; completed full cache giữ nguyên. None-mode không nối descendants cũ. New-plan root cache/progress/facts là1/1; fresh response/RAM giữ đúng object identity, metadata chỉ chuẩn hóa khi serialize checkpoint/facts. Chặn late publication/Stop như cũ.
- Không đổi provider/keys/output8192/thinking/prompt/temperature/schema hoặc nguồn/progress. Retry không bảo đảm vượt được output cap cố định; upstream thật chưa benchmark. Đã cập nhật mô tả lựa chọn trong Reader/Prompt và USER-GUIDE.

## 2026-10-28 — Giảm chờ foreground AI, giữ nguyên chương ngắn
TXT <6000 UTF-16 vẫn nguyên chương. Lỗi tạm thời ở model còn dự phòng chuyển sớm; model cuối/single/pinned giữ tối đa2 retry. Output-limit/copied-source có tối đa2 retry nguyên chương độc lập; ghi quota trước quyết định retry, giữ cooldown/Retry-After, budget, Stop và trần2key. Pending TXT/EPUB khi thành chương hiện tại giữ promise/controller/cache key và progress, cập nhật priority hàng đợi và replay/theo dõi model; không preempt request đang chạy. Không đổi protocol/provider/schema/nguồn/cursor/cache hoàn chỉnh. Nested hybrid cũ chưa được mở rộng kế thừa priority.

## 2026-10-28 — Streaming xem trước TXT nguyên chương
TXT <6000 UTF16 tiếp tục một request nguyên chương. Client có callback preview mới opt-in X-AI-Preview:1; Worker chuyển text không phải thought, client cũ chỉ nhận progress/final. Preview hiển thị tới newline hoàn tất, tách previewText khỏi completed text/cache/checkpoint/TTS/bookmark; STOP hợp lệ mới lưu/nghe. Mỗi retry/model mới xóa draft; Stop/retain/deadline xóa đúng controller, callback muộn không hồi sinh. Giữ protocol NDJSON hiện có với event text opt-in, tối đa3000 preview events/512000 encoded bytes; client opt-in tăng đúng ngân sách preview. EPUB/chương dài giữ complete-prefix. Không provider/key/migration/dependency mới. Streaming giảm thời gian bắt đầu đọc, không hứa giảm tổng thời gian sinh.

## 2026-10-28 — Tham khảo mã mở trước, ghi tài liệu sau mỗi tính năng
Theo yêu cầu người dùng: trước khi triển khai tính năng/cải tiến, tham khảo GitHub hoặc nguồn mã mở liên quan để lấy ý tưởng và đối chiếu code hiện tại. Khi hoàn thành tự cập nhật .md tương ứng, gồm hành vi, link nguồn/ý tưởng áp dụng, kiểm chứng, giới hạn và deploy nếu có. Không tìm được nguồn thì ghi rõ; không tự thêm dependency/provider/hạ tầng. AGENTS.md là quy tắc thực thi.

## 2026-10-28 — Gemini 2.5 trước Gemma
Người dùng yêu cầu ưu tiên Gemini 2.5 Flash trước Gemma: chuỗi chuẩn3.8→3.7→3.5→2.5→Gemma26B→3Preview. Menu AI_MODELS đồng bộ thứ tự; model được chọn vẫn là điểm bắt đầu. Không đổi model IDs/allowlist, provider, giới hạn key, retry/cooldown hay bản ghi dữ liệu. Tham khảo cơ chế ordered fallback LiteLLM Router https://github.com/BerriAI/litellm-docs/blob/main/docs/routing.md đã đọc trong phiên; vị trí model cụ thể theo người dùng, không là đánh giá chất lượng từ nguồn này.

## 2026-10-28 — Lite theo vai trò hiện tại/prewarm
Theo chốt người dùng: foreground thêm Gemini3.5Flash-Lite sau2.5Flash, trướcGemma; prewarm không gửi3.5Lite. Mở chương đang prewarm giữ request/promise/model hiện tại; thành công dùng luôn, lỗi mới chọn model tiếp theo theo vai trò sống, kể cả Lite đã bỏ qua trước đó. Khi có phần hoàn tất ghim model, giữ pin để không trộn model. Vai trò runtime chia sẻ xuống TXT/EPUB/nested stage, không đưa vào cache key, không restart/double send. Model cuối xét theo danh sách còn hợp lệ, tránh mất retry khi Lite bị chặn. Khôi phục3.5Lite thành ID thật trong allowlist/normalizer, không alias sang3.5Flash;3.6 vẫn tương thích legacy. Không đổi key/provider/fan-out/budget/Stop/cache ownership/nguồn. Ý tưởng request-scoped fallback controls tham khảo https://github.com/BerriAI/litellm/blob/main/litellm/router_utils/fallback_event_handlers.py ; không cài thêm thư viện.

## 29/10/2026 — Chốt nâng cấp quy trình đo đạc dịch AI L1–L4
Người dùng yêu cầu chốt kế hoạch sau đề xuất log phục vụ cải tiến. Chốt thứ tự L1 liên kết work/part/request/upstream + cấu hình thực dùng; L2 thời gian foreground/preview/accepted/complete theo clock đúng runtime; L3 cây phục hồi và trạng thái/model cuối đúng chứng cứ; L4 thống kê cùng cohort và metadata trial chủ động ở trang prompt hiện có. Chi tiết/tiêu chí: private-novel/docs/AI-LOG-M0.md, mục kế hoạch29/10. Giữ hai key, model/Lite policy, budget/Stop/pin, TXT<6000 nguyên chương và thuật toán chia hiện có; không thêm providercall/wait/auto-A-B, không đổi cache identity/nguồn/tiến độ/TTS. Giữ cap5000/30d/outbox100/payload8KiB, v1/v2 tương thích/failopen/allowlist. Dữ liệu thiếu unknown, không xếp hạng model dự phòng bằng tỉ lệ thô. Tổng hợp dài hạn/dataset chất lượng/auto-routing để sau, cần phạm vi/M0 riêng. Đây là quyết định kế hoạch, chưa triển khai hay deploy nâng cấp.
## 29/10/2026 — Điều chỉnh mức model
Theo yêu cầu người dùng: vai trò Astra High chuyển sang GPT-6.1 Sol High; vai trò Sol High chuyển sang GPT-6.1 Sol Medium, ánh xạ một lần theo vai trò cũ. Giữ reviewer độc lập, yêu cầu bằng chứng và trần ba agent. Không đổi model chat chính khi runtime chưa xác nhận. Quy tắc thực thi ở AGENTS.md.

## 29/10/2026 — Liên kết thật cho điều hướng
Album/Series/truyện/chương dùng anchor có href; chỉ click trái không modifier giữ callback SPA, không chặn contextmenu/Ctrl/Meta/Shift/Alt/chuột giữa. URL Album dùng query album đã encode để reload/tab mới/Back phục hồi nhánh; không đổi định danh hoặc dữ liệu. Liên kết disabled bỏ href; thao tác mở hộp thoại/phân trang/sửa/xóa vẫn là button. Chi tiết: private-novel/docs/NATIVE-NAVIGATION-LINKS.md.

## 29/10/2026 — Capacity không phải model đã được chấp nhận
Thông tin2key của chương trước chỉ cho phép prepin khi thực sự khởi chạy đa phần song song cùngmodel. Một phần/admission đầu1request còn được fallback cấu hình trước khi có kết quả; checkpoint/savepin giữ nguyên. Không suy ra L1–L4 gây upstream timeout từ trùng thời điểm deploy. Chi tiết private-novel/docs/PREWARM-CAPACITY-FALLBACK-2026-10-29.md.


29/10/2026 — Người dùng chốt AI first-answer23s, idle7s kể từ answer delta cuối; thought/heartbeat/usage/lease không gia hạn. Lỗi rõ ràng rotation ngay như cũ; giữ hard180s và transport grace client10s. Timeout không chứng minh upstream ngừng tính. Chi tiết private-novel/docs/AI-ACTIVITY-STREAM-1.md.


29/10/2026 — Chốt mới thay first23 bằng60giây theo yêu cầu người dùng; idle7giây answer-only giữ nguyên. Theo dõi nhật ký để đề xuất tối ưu dựa N/model/purpose/policy, không tự thay ngưỡng từ mẫu nhỏ. Chi tiết private-novel/docs/AI-ACTIVITY-STREAM-1.md.


29/10/2026 — Người dùng chốt model đã có answer rồi lỗi giữa chừng được replay cùng model1lần trước fallback. Áp mỗi request/phần, không thêm vòng retry thường sau replay thất bại, không nới Stop/budget/pin. Giữ first60/idle7s; safe lease không được tính answer. Chi tiết private-novel/docs/AI-ACTIVITY-STREAM-1.md.


29/10/2026 — Người dùng xác nhận chỉ exact gemini-3.5-flash và gemini-2.5-flash được retry cùng request; không Lite. Allowlist giữ ở recovery và identity theo vị trí mỗi job/round; phần nguồn khác không phải retry. Dựa success firstChunk quan sát<=39,628ms, chọn first45s + idle7s, tiếp tục theo dõi mẫu còn ít. Chi tiết private-novel/docs/AI-ACTIVITY-STREAM-1.md.

## 30/10/2026 — Đổi giới hạn chương ngắn sang 3.000 chữ và không giới hạn số lần chia chương
- Người dùng chốt: nội dung gốc TXT source.text.length < 3000 (UTF-16 code units) dịch nguyên chương (whole short), thử lại nguyên chương có giới hạn (tối đa 2 lần ở model cuối/single) khi gặp lỗi phục hồi. Từ 3000 ký tự trở lên tiếp tục chia chương theo song song và ngân sách đầu ra.
- Không giới hạn số lần chia chương: loại bỏ giới hạn độ sâu cứng (depth < 3, depth >= 3) trong phục hồi chia nhị phân (translateComplete) và EPUB, mở rộng regex part ID sang /^\d{1,4}(?:\/[01])*$/; quá trình chia tiếp tục đệ quy cho đến khi hoàn thành hoặc đạt ngưỡng tối thiểu an toàn của đoạn văn (text.length < 400 hoặc không thể chia an toàn). Giữ trần an toàn chống lặp vô hạn (requests > 1000).
- Tham khảo ý tưởng phân chia đệ quy thích ứng: LangChain RecursiveCharacterTextSplitter (https://github.com/langchain-ai/langchain) và LiteLLM fallback retry policies. Không cài thêm thư viện hay hạ tầng mới.


01/11/2026 — Người dùng yêu cầu chọn model cố định: Reader/current/prewarm/retry chỉ dùng model đã chọn, không tự fallback; cho phép Groq qwen/qwen3.8-27b với pool key người dùng cấp luân phiên server-side, giữ tối đa hai request đồng thời/Stop/checkpoint. Thay quy tắc whitelist retry29/10 bằng retry có giới hạn cho model chọn, giữ Retry-After và lỗi quyền/cấu hình không lặp nóng. Hai web nếu tách phải có dữ liệu riêng; mới xác nhận phương án, chưa tạo/chuyển dữ liệu. Cuối lượt người dùng yêu cầu không chạy test thêm và hoàn thành nhanh; dừng kiểm thử, ghi rõ2706/2709 full +22/22 builtE2E +build/review, không gán full xanh. Chi tiết private-novel/docs/WEB-RECOVERY-2026-11-01.md.


01/11/2026 — Người dùng xác nhận cần UI/UX hai tính năng: Tự động hạ model và Cố định model. Thay chính sách chỉ-fixed toàn Reader vừa triển khai bằng modelMode auto/fixed rõ ràng; mặc định cũ giữfixed, chọn prompt không đổi mode/model; auto dùng chuỗi dự phòng hiện có, pin sau phần đầu hoàn tất để không trộn model. Không thêm provider/key/schema. Theo yêu cầu tiết kiệmusage, không thêm/chạy test; chỉ build và review đọc. Chi tiết private-novel/docs/AI-DUAL-MODE-2026-11-01.md.


01/11/2026 — Key/model không thể phục hồi403/404 phải loại theo cặp, giữkey cho modelkhác; chỉ structuredprovidererror mới lưu vĩnh viễn, không backfill từ HTTPstatus cũ. Invalidkey rõ ràng vẫn toànkey. GroqQwen đặt ngay sauGemini2.5 trongAuto. URLreader404 GET/HEAD được phục vụSPA sau auth/secure, khôngđổi API/auth. Không testtheochỉđạouser; build/review/GET thật. docs/AI-KEY-MODEL-EXCLUSION-2026-11-01.md.


01/11/2026 — SửaAuto theo ranhgiới: chưa có phần hợp lệ thì không pin từ capacitywarm; sauaccept mới song song cùngmodel. Providerkhôngkey là lỗi safe riêng cho Auto đi tiếp, Fixed khôngretryvôhạn. Quota có thểphục hồi ưu tiên429 trước404model. Gemma26/31 tốiưudịch: thinkingminimal, firstanswerstream90s đồngbộ client/server, modelkhác45s; idle/hard/Stopkhôngđổi. User yêu cầu xemthời gian/lỗi từngmodel: bounded requesttimelineRAM theo workID, khôngdựnggiờ/cache vàkhônglưu nguồn/key. Không thêm/chạytesttheochỉđạouser; chỉbuild/review/GETrelease. Chi tiết private-novel/docs/AI-REPAIR-AND-TIMELINE-2026-11-01.md.

## 01/11/2026 — Sửa riêng chữ Hán trước khi chấp nhận bản dịch
Client mới opt-in sửa Han có ngữ cảnh, cùng model/key/lease, một lượt bổ sung có giới hạn; không sửa hồi tố cache/bản đang nghe hoặc đổi định danh cursor. Metadata audit tách khỏi prose/TTS. Chi tiết private-novel/docs/AI-HAN-REPAIR-2026-11-01.md. Chưa deploy theo chỉ đạo mới.

01/11/2026 — Người dùng đổi quản lý Phòng tối: checkbox trực tiếp ngoài danh sách chọn Album để sửa tên/xóa; trong Album chọn truyện và Album con tương tự. Chỉ Sửa tên (một mục) và Xóa (nhiều mục) khi có chọn, bỏ nút Quản lý. Xóa Album gồm cây con sau preview/xác nhận, tái dùng cloud ACK-before-local. Không đổi service/schema. Chưa deploy. Chi tiết private-novel/docs/LIBRARY-MANAGEMENT.md.

01/11/2026 — Thống nhất metadata sách cloud/snapshot/catalog/shared/rename/server/backup ở1000 ký tự theo backup hiện có; headerencoded9x, DELETEreview32KiB. Migration0018 chỉnớiCHECKtitle, giữcácguard/ledger/rows. Không cắt/đổi nội dung/chia lại chương hoặc nới128000/codec/Name. Lỗi rõfield/type/length; author thiếu mặc địnhrỗng trongpayload. docs/CLOUD-METADATA-COMPATIBILITY-2026-11-01.md.

01/11/2026 — Điều chỉnh theo phản hồi UI: mặc định ẩn checkbox. Nút Quản lý đầu Phòng tối/Album bật chọn; Xong xóa chọn và ẩn. Giữ thao tác Sửa tên/Xóa trực tiếp và xác nhận hiện có. Ô tích truyện ở phần riêng trước bìa; albumgrid chọn min260px. Thay quyết định luôn hiện checkbox trước đó, không đổi service dữ liệu.

02/11/2026 — Đổi Auto/Fixed hoặc model: ưu tiên giữ chương AI đã hoàn tất, gồm prewarm; cấu hình mới dùng cho chương chưa có bản hoàn tất tương thích. Identity nguồn/prompt/Names và tùy chọn ngoài model vẫn bắt buộc khớp; partial/hybrid/continuation không nới. Giữ model/execution thực của bản cũ, không viết lại dưới tên model mới. Chi tiết private-novel/docs/AI-COMPLETED-CHAPTER-REUSE-2026-11-02.md.

02/11/2026 — Người dùng chọn nghe ngay trước khi AI dịch full, chấp nhận khác biệt bản nháp/accepted. TXT cho TTS đọc preview chỉ gồm đoạn đã đóng; chờ/nối offset khi có thêm chữ. Dừng và báo khi draft bị thay/lỗi, không ghi cursor/cache draft; chỉ nhận identity khi full khớp prefix. EPUB/PDF/DOCX giữ prefix node đã kiểm tra. Không bật MSE/provider mới hay đổi concurrency/retry. Thay quy tắc không phát draft trước đây trong phạm vi người dùng đã chọn. docs/AI-STREAMING-LISTEN-2026-11-02.md.

02/11/2026 — Người dùng yêu cầu nghe tự động, không dừng/chờ bấm lại khi AI thay bản dịch. Thay quyết định dừng prefix mismatch trước đó: nghe hết audio đã xếp, rồi nối theo thứ tự đoạn ở bản mới; bản mới chưa tới thì tự chờ, không thêm nút. Giữ offset chính xác khi prefix chưa đổi, final-only cursor/no reload autoplay/Stop vẫn hủy. Ánh xạ thứ tự gần đúng nếu AI gộp/tách/đảo đoạn; không gọi AI/công cụ mới để căn chỉnh. docs/AI-STREAMING-LISTEN-2026-11-02.md.

## 02/11/2026 — Trau chuốt thay Convert
Người dùng đổi lựa chọn lưu riêng sang bản hoàn tất thay Convert để đọc/nghe và có prompt trau chuốt riêng chỉnh được. Áp dụng override local theo chapter/revision/hash bản Convert, không ghi đè source/chapter; bảo vệ EPUB text-node/ảnh bằng kiểm tra số dòng. Audio đang nghe giữ bản hiện tại; lần nghe sau dùng Convert mới. Chi tiết docs/CONVERT-POLISH.md.

02/11/2026 — Người dùng đổi UX trau chuốt: bỏ modal, chạy inline, phần STOP hoàn tất thay dần Convert; Name từ đoạn nguồn và song song hiện có. Giữ suffix nguồn chưa xử lý; không ghép output theo tỷ lệ độ dài. Chi tiết docs/CONVERT-POLISH.md.

02/11/2026 — Người dùng chốt Convert/tra Name dùng 100% từ điển trên máy. Reader và khung chọn cụm từ bỏ nhánh gọi máy chủ; AI dịch/trau chuốt là tính năng riêng. Không xóa hạ tầng/dữ liệu Cloudflare. docs/LOCAL-CONVERT-ONLY.md.

02/11/2026 — Prompt/tùy chọn trau chuốt đặt ở Cài đặt AI ngoài Reader. Reader chỉ còn vận hành/tiến độ. Prompt key cũ giữ, options key mới local; cập nhật từ lượt sau. Thống nhất toàn lifecycle AI vẫn còn việc; không bỏ validation hoặc vượt chặn để che lỗi nhà cung cấp.

02/11/2026 — Theo yêu cầu bỏ giới hạn128k đầu vào toàn chương Dịch AI/trau chuốt; dùng planner chia request hiện có. Không bỏ giới hạn import/nguồn/response/output/budget/STOP hoặc tăng concurrency. docs/AI-LARGE-SOURCE-M0.md.

02/11/2026 — Trau chuốt tự tiếp tục trong cùng phiên khi transient/hếtbudget theo recoveryplan AI hiện có; giữ checkpoint, Stop hủy cả wait và write transaction. Không retry semantic/nonSTOP/refusal; không nới acceptance/provider limits. Chưa durablecheckpoint sau reload/prewarm.

02/11/2026 — Người dùng chốt bấm Convert lần2 khi đã chọn để hủy cache trau chuốt chương đang mở và đọc Convert thuần. Không xác nhận phụ; chỉ derivedcache của chương, giữ source/Names/dictionary/AIcachekhác.


## 2026-11-02 21:10 +07 — Trau chuốt giữ kết quả qua Edit Name
Theo yêu cầu: kết quả paired-polish gắn với nguyên văn/revision; giữ prefix đã xác nhận và rebase đuôi bằng originalEnd chính xác, không bỏ cache vì Name. Chọn cụm từ double-click/double-tap; token Convert oneclick/Enter EditName. Chi tiết private-novel/docs/CONVERT-POLISH.md.

## 2026-11-08 · Convert từ điển riêng trên OCI

- Dùng chung LanguageEngine và bộ đọc với worker local. OCI giữ một bộ TXT có thứ tự trong một profile SHA-256. Ghi ứng viên trên cùng volume, kiểm byte/UTF-8 và dựng chỉ mục trước khi đổi profile; khôi phục từ đĩa khi service khởi động.
- Máy chủ được bật bằng origin HTTPS tường minh. Dùng mTLS với CA thiết bị riêng và Origin/CSP chính xác. App có máy chủ yêu cầu chọn đích; lỗi server giữ nguyên đích. Reader Bản gốc giữ nội dung nguồn và tiêu đề có sẵn, không khởi chạy Convert.
- Chưa cấp hoặc phát hành OCI/Pages. Hạn mức, file triển khai, bằng chứng và giới hạn ở private-novel/docs/OCI-CONVERT.md.

## 2026-11-14 — Virtualize large library lists

After a production-build profile showed tens of thousands of DOM elements and long tasks at 1,000–5,000 synthetic books, use `@tanstack/react-virtual` 3.14.26 (MIT) for filtered lists above 300 items. Keep the existing renderer for 300 or fewer. Preserve stable book order, all three view modes, focus/Tab traversal, selection, and scroll restoration. The 300 threshold caps a 300-item list near 3,300 DOM elements while avoiding a new layout path for smaller shelves. This is a measured synthetic-browser cutoff, not proof for physical Android or real libraries. Details/evidence: `private-novel/docs/LIST-VIRTUALIZATION-PERF.md`.
