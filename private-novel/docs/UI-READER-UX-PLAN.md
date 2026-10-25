# UI Reader: đọc được tên truyện, đọc thoải mái, sửa Name liền mạch

<a id="ke-hoach-reader-ai-2026-10-24"></a>

## Kế hoạch hiện hành — 24/10/2026

**Trạng thái 24/10: D1–D2 và phần component thuần D6 đã triển khai; Pages `d0eb3dc5`. D3–D5 và controller AI D6 chưa triển khai.** Phạm vi là sáu đề xuất cải tiến Reader/AI vừa được nghiên cứu, không mở audit toàn sản phẩm. Các mục và kết quả từ ngày 08/10 ở phần sau là hồ sơ cũ, không phải backlog tự chạy lại hoặc bằng chứng kiểm thử mới.

### Mục tiêu và nền hiện có

- Bảng AI đã có hai dòng chương hiện tại/chương sau, số phần và lý do; đã bỏ footer cài đặt. Điều hướng chương có vùng bấm tối thiểu 48px; mục lục mở trang chứa chương hiện tại và có nhãn Đang đọc. Giữ các hành vi này.
- Hoàn thiện tính nhất quán giữa trạng thái chạy, tiến độ và metadata; thu hẹp vùng ước lượng khi chọn Name sau phục hồi; xử lý dấu kết thúc có căn cứ; cải thiện tìm chương và chia nhỏ trách nhiệm trong Reader.
- Giữ UI tối giản: tận dụng hai dòng model, ô tìm chương và nút dừng hiện có; không thêm dashboard, hàng nút cố định hoặc mũi tên chọn nguồn.

### Ràng buộc xuyên suốt

1. Giữ nguyên bytes nguồn, Name, tiêu đề gốc, revision và bookmark. Prewarm chỉ chuẩn bị/cache, không ghi đè vị trí đang đọc. Không tự sửa/tái nhập truyện cũ.
2. Giữ model/prompt đã chọn, tối đa hai key hiện có qua lease/cooldown; không thêm provider, billing hoặc tăng fan-out. Thông tin UI phải dựa vào sự kiện thật, không suy từ số phần rằng hai request/key đang chạy.
3. Stop hủy đúng job và timer/callback muộn; giữ các phần đã hoàn thành và cursor. Không tự tiếp tục sau khi người dùng đã dừng, không autoplay sau reload.
4. Cache là tùy chọn: dữ liệu cũ/sai/thiếu metadata vẫn dùng được bản dịch hợp lệ và ghi chưa biết; không xóa cache, ép dịch lại hoặc giảm kiểm tra ownership/source/settings/Names để lấy hit.
5. Giữ identity đối tượng phản hồi gốc ở các đường đang có hợp đồng này. Metadata dùng wrapper/sidecar, không sửa trực tiếp response dùng chung. Không lưu credential, toàn bộ prompt hay bản sao nguồn chỉ để hiển thị trạng thái.
6. Không thêm schema DB/server, chỉ mục toàn thư viện hoặc khả năng dung lượng mới trong kế hoạch này. Nếu phát sinh nhu cầu đó, tách phạm vi và đánh giá trước, không gộp vào sửa UI.

### Thứ tự và phụ thuộc

| Đợt | Kết quả cần bàn giao | Phụ thuộc | Mức rủi ro chính |
|---|---|---|---|
| D1 | Một nguồn facts cho kết quả AI ở RAM, cache và UI | Hợp đồng hiện có | Metadata/cache, ownership và compatibility |
| D2 | Trạng thái, tiến độ và đối tượng của nút Dừng rõ ràng | D1 | Retry/Stop/prewarm, hai hệ đếm phần |
| D3 | Ánh xạ nguồn–dịch tới các nhánh phục hồi | D1 | Offset, Unicode, cache/resume |
| D4 | Quy tắc dấu kết thúc khi ghép kết quả | D3 | Chuỗi kết quả, map, TTS/cursor |
| D5 | Tìm chương không dấu, phân biệt số chương/vị trí | Độc lập với D1–D4 | Truy vấn hiển thị, điều hướng |
| D6 | Tách component thuần, rồi tách điều phối AI | D1–D2 cho component; sau D3–D4 cho AI hook | Ownership, mount/unmount, lifecycle |

Thực hiện từng đợt và nghiệm thu trước khi chuyển tiếp. D2 không phải chờ D3. D5 có thể làm riêng; không chạy kiểm tra nặng đồng thời. Người dùng đã triển khai D1 → D2, sau đó chọn D6 và bỏ D3 lúc này. D6 làm component thuần; controller giữ điều kiện sau D3–D4.

### D1 — Đồng nhất facts của một chương AI

**Code liên quan:** `src/features/ai/services/{ai-reading,ai-reading-cache,ai-division}.ts`, `src/features/import-export/services/epub-ai.ts`, phần nhận kết quả trong `src/features/reader/components/Reader.tsx`.

- Tạo hợp đồng wrapper/sidecar gồm response gốc và facts theo đúng request key/chapter/revision. RAM, kết quả đọc cache và hai dòng model lấy facts qua cùng adapter.
- Phân biệt thông tin đã biết với không có dữ liệu. Tác vụ mới một phần phải giữ được facts một phần cả khi dùng lại RAM và sau reload; không suy số phần của aggregate cũ từ dấu `♾` hoặc cấu hình hiện tại.
- Dữ liệu bền vững chỉ gồm facts kết quả được xác minh, như `division`/`textMap`. Trạng thái chạy, countdown, lease và Stop thuộc runtime, không phục hồi thành một job đang chạy chỉ vì đọc cache.
- Giữ định dạng cache cũ đọc được. Whitelist, validation và giới hạn kích thước vẫn áp dụng; metadata không hợp lệ không làm mất bản dịch hợp lệ.

**Nghiệm thu:** response gốc không bị mutate và identity vẫn giữ; RAM/persistent/reload cho cùng facts đã biết; source/prompt/Name thay đổi vẫn miss đúng; current/next không lẫn facts; legacy unknown vẫn unknown. Lỗi cache/metadata không phát thêm AI request để bù thông tin.

### D2 — Một cách biểu đạt trạng thái và tiến độ

**Code liên quan:** adapter trạng thái mới trong nhóm AI, `AiPanel.tsx`, `AiJobStatus.tsx`, các thanh trạng thái và nút dừng trong `Reader.tsx`.

- Tách trạng thái nội dung (`chưa có`, `có một phần`, `đủ kết quả`) khỏi trạng thái tác vụ (`chưa chạy`, `đang chạy`, `đang chờ`, `đã dừng`, `cần sửa cấu hình`). Nội dung đã cache vẫn sẵn sàng khi dịch sẵn đang tắt.
- Dòng model thể hiện đúng Đang dịch/Chờ mạng/Chờ thử lại/Đã dừng/Đã xong. Không dùng nhãn Chờ phục hồi cho một tác vụ đã bị người dùng dừng hoặc đang chờ sửa cấu hình.
- Đếm tiến độ theo các phần lá có ID nguồn ổn định, cùng cơ sở với số phần thực tế. Retry/resume không cộng trùng. Khi tiếp tục chia, tổng có thể tăng; lý do chia hiện ngay trên dòng chương đó. Nếu cache cũ thiếu chứng cứ thì không dựng tỷ lệ chính xác giả.
- Nhóm kế hoạch ban đầu và request/lease đang hoạt động là thông tin khác; không trộn vào mẫu số tiến độ. Có thể giữ trong diagnostics hiện có, không thêm thông tin kỹ thuật vào luồng đọc bình thường.
- Đổi nhãn nút hiện có thành Dừng chương này/Dừng chương sau theo đúng đối tượng. Dùng cùng adapter cho panel, trạng thái ngoài bài và nút AI nổi để tránh thông điệp mâu thuẫn.

Phần đầu bảng AI sử dụng cùng presenter; minh họa trạng thái:

```text
Chương này   Gemini …
Đã xong · 4 phần
Lý do chia: phục hồi bản dịch bị cắt

Chương sau   Gemini …
Đang dịch · 2/3 phần
[Dừng chương sau]
```

**Nghiệm thu:** bảng chuyển trạng thái cho cả current/next với success, mất mạng, quota/cooldown, cần cấu hình và Stop; count đúng ở nested split, cached-child resume, retry lặp cùng nhánh và hoàn thành lệch thứ tự. Stop chặn renew/retry/callback muộn, không dừng nhầm chương hoặc làm mất phần đã xong. Không thay scheduler chỉ để khớp nhãn UI.

### Nghiệm thu D1–D2 — 24/10/2026

Sidecar `ai-result-facts` giữ raw response/identity; `ai-leaf-progress` đếm cây nguồn, aggregate hoàn tất ưu tiên hơn checkpoint con cũ; `ai-chapter-view` dùng chung cho panel/thanh trạng thái/nút nổi. Không đổi scheduler, send budget, model/prompt hay giới hạn hai key. Metadata cũ thiếu vẫn unknown, không phát thêm AI để bù facts.

Review độc lập: `tests/ai-d1d2-independent-review.test.ts` (18 ca), không còn finding chặn. Root: 172 file/2.129 unit pass, build pass; E2E 56 ca desktop/Android layout đạt (48 ở lượt đầu, 8 chạy lại sau cập nhật fixture/kỳ vọng cũ về model, snapshot Name và Stop). Logs `.dsh-tmp/d1d2-{full-test,build,e2e,e2e-updated}.log`. Không thay hành vi snapshot Name chỉ để khớp test.

Pages `21834f59`, bundle `index-CwJ9fd3S.js`; production smoke 2/2, RAM và reload cùng facts, dữ liệu tổng hợp/0 cloud writes. Logs `.dsh-tmp/d1d2-{deploy,production-smoke}.log`. Chưa kiểm AI provider thật/Android thật; hybrid legacy chưa có số phần toàn chương đáng tin thì không dựng tỷ lệ giả.

### D3 — Giữ mốc nguồn khi chia thêm để phục hồi

**Code liên quan:** `ai-complete.ts`, `ai-parts.ts`, `ai-text-map.ts`, `ai-reading-cache.ts`, `src/features/reader/services/ai-name-paragraph.ts`.

- Ghi span nguồn/đích cho từng nhánh con thực tế; ghép và dịch offset theo đúng thứ tự nguồn và separator của chuỗi kết quả.
- Làm cả trường hợp kế hoạch ban đầu chỉ có một phần nhưng sau đó phải chia nhỏ. Khi resume, dùng metadata con hợp lệ đã lưu; không tạo mốc giả cho child cache cũ không có chứng cứ.
- Map phủ nguồn liên tục, không chồng/thiếu và khớp chuỗi đích thực tế. Giữ ranh giới UTF-16, surrogate pair, CRLF/newline.
- Popup Name dùng map chi tiết hơn nhưng vẫn cho phép ước lượng bên trong một span; không gọi AI/embedding để căn chỉnh, không hứa đúng từng câu hoặc từng từ.

**Nghiệm thu:** nguồn ngắn/dài, nested recovery, một phần ban đầu, cached-child resume, thiếu/hỏng metadata, AI gộp/tách đoạn và Unicode. Metadata sai dùng fallback đang có; mở Name không phát thêm request dịch AI, không đổi TTS/bookmark.

### D4 — Kiểm soát dấu kết thúc ở bước ghép

**Code liên quan:** bước hoàn thiện kết quả TXT dùng chung giữa `ai-complete.ts`/`ai-parts.ts`, reader text và đầu vào TTS; không tự xử lý trực tiếp trong JSON/HTML EPUB.

- Việc đầu tiên là xác định quy tắc terminal marker hỗ trợ từ chỉ dẫn tường minh của prompt/profile. Không bật toàn cục chỉ vì văn bản chứa `♾`; prompt không yêu cầu, yêu cầu không rõ hoặc nguồn có ký hiệu hợp lệ thì giữ nguyên.
- Với tác vụ xác định có quy tắc này: chỉ bỏ marker terminal ở cuối phần trung gian; không replace mọi `♾` trong nội dung. Chỉ giữ/đặt dấu kết thúc toàn chương khi mọi phần bắt buộc đã hoàn tất theo hợp đồng STOP/coverage hiện có.
- Chuỗi partial không được gắn dấu hoàn tất toàn chương. Dấu marker không chứng minh đã dịch đủ nghĩa; không giảm kiểm tra kết quả hiện có.
- Dựng chuỗi kết quả và span đích sau xử lý như một phép biến đổi thống nhất. Hiển thị, chọn Name và TTS dùng cùng phiên bản text/map. Khi partial đang được đọc/nghe, không sửa ngược prefix đã phát và không tái sử dụng cursor của chuỗi khác.
- Không tự chuẩn hóa lại cache cũ hoặc bản dịch đã có bookmark/cursor. EPUB JSON/layout giữ nguyên ở đợt này; mở rộng nếu cần phải có thiết kế riêng cho text-node/offset.

**Nghiệm thu:** prompt có/không có/không rõ yêu cầu marker; một phần và nhiều phần; ký hiệu hợp lệ trong nguồn; marker nội dung và marker cuối phần; partial→complete trong lúc nghe; map/cursor nhất quán. Cache cũ không bị viết lại hoặc gọi AI lại để làm sạch. Có thể bỏ qua formatter và trở về đường render cũ mà không làm hỏng dữ liệu đã lưu.

### D5 — Tìm chương dễ dùng bằng ô hiện có

**Code liên quan:** phần `tocFilter`/`openToc`/pagination trong `Reader.tsx`; helper tìm kiếm thuần nếu cần.

- Tạo khóa tìm kiếm local cho title/displayTitle: bỏ dấu tiếng Việt, chuẩn hóa `đ`, hoa/thường và khoảng trắng. Không sửa title gốc hoặc tải từ điển/Convert lại mỗi phím.
- Truy vấn bình thường tìm tên. Chuỗi chỉ có số ưu tiên khớp số chương được nhận diện trong tiêu đề; kết quả vẫn là danh sách để người dùng chọn, không tự điều hướng sang phần tử có index bằng số đó.
- Nếu số chương thiếu/trùng thì hiện các kết quả có căn cứ hoặc không tìm thấy; không đoán từ vị trí. Ghi riêng vị trí mục lục nếu cần giải thích trường hợp tên chương 1429 nhưng vị trí 1426.
- Giữ nhãn Đang đọc, header chương hiện tại, mở đúng trang và cuộn tới chương đó khi mở lại; kết quả rỗng có thông báo ngắn trong vùng danh sách, không thêm nút nhảy cố định.

**Nghiệm thu:** tìm có/không dấu, title/displayTitle, số chương khác index, số trùng/không có; trang cuối, clear/reopen, tiêu đề dài và bàn phím mobile. Tìm/đổi trang mục lục không tự sửa bookmark; chọn chương vẫn đi qua đường điều hướng hiện tại.

### D6 — Tách code theo trách nhiệm, giữ hành vi

**Code liên quan:** `Reader.tsx`, `ReaderTools.tsx`, `ChapterNavigation.tsx`, `ReaderToc.tsx`, `ReaderAiProgress.tsx`, `ReaderFloatingTools.tsx`; controller vẫn ở Reader.

1. Tách `ChapterNavigation` dùng chung đầu/cuối và `ReaderToc` trình bày. Component nhận props/callback, không tạo AI session, truy cập progress DB hay điều khiển player.
2. Tách adapter/presenter trạng thái AI đã ổn ở D1–D2, bỏ việc dựng cùng facts/nhãn ở nhiều nơi.
3. Sau D3–D4 mới tách `useReaderAi` hoặc controller tương đương: một nơi sở hữu current/prewarm, request key, AbortController/generation, snapshot Names/prompt và retry timer. Không tạo job mới do rerender hoặc mount panel.
4. Giữ lưu vị trí đọc và điều khiển TTS ở các luồng riêng; chỉ truyền sự kiện/hợp đồng cần thiết. Không chuyển quyền ghi bookmark sang controller prewarm để tiện refactor.

**Nghiệm thu:** so sánh hành vi trước/sau từng extraction; không tăng sends, reset session/Name, mất selection/focus, đổi chương hoặc dừng audio khi chỉ mở/đóng panel. Mount/unmount, retry, chuyển chương, partial listening và Stop giữ đúng ownership. Mỗi extraction có diff có thể hoàn nguyên riêng.

### Nghiệm thu phần component D6 — 24/10/2026

Tách bốn component chỉ nhận props/callback: `ChapterNavigation`, `ReaderToc`, `ReaderAiProgress`, `ReaderFloatingTools`; xóa hai nhãn cũ không còn dùng từ D2. Reader vẫn sở hữu state, ref mục lục, session AI, snapshot Names/prompt, retry/abort, bookmark và player. Không thêm UI, thay thuật toán tìm chương, persistence hoặc D3/D4. Phần controller AI của D6 chưa làm theo phụ thuộc trong kế hoạch.

Build pass; E2E Reader/AI 56/56 và nút nghe 2/2 (mock AI/TTS). Bổ sung kiểm mở/đóng panel giữ focus và không tăng request; fixture nghe cũ trả sai model/nội dung quá ngắn đã sửa, giữ log fail. Logs `.dsh-tmp/d6-{build,e2e,tts-e2e,tts-e2e-updated}.log`. Extraction thuần không thêm unit lặp JSX/full suite/reviewer.

Pages `d0eb3dc5`, bundle `index-qE9FPxVJ.js`; production smoke 2/2 desktop/mobile-layout, RAM/reload/mục lục/nav đúng, dữ liệu tổng hợp/0 cloud writes. Logs `.dsh-tmp/d6-{deploy,production-smoke}.log`. Chưa kiểm provider/audio/Android thật.

### Kiểm chứng và phát hành khi triển khai

| Phạm vi | Kiểm tra bắt buộc trước khi nghiệm thu |
|---|---|
| Chỉ kế hoạch/tài liệu ở lượt này | Kiểm diff, liên kết và đủ sáu đề xuất; **không** test/build/E2E/deploy |
| D1 và phần cache/span của D3; D4 nếu đổi dữ liệu lưu/cursor | Reviewer độc lập đọc diff + regression; root full `npm.cmd test`, build và E2E đúng luồng theo AGENTS |
| D2, D5 và extraction UI thuần D6 | Targeted unit cho logic, build; E2E đúng hành vi; không full suite/reviewer chỉ vì đổi trình bày |
| Controller AI/lifecycle D6 | Regression Stop/retry/prewarm/snapshot/cursor, build và E2E; áp dụng mức review/full test nếu chạm persistence/integrity |

- Dùng lại tests hiện có: `ai-division*`, `ai-complete`, `ai-reading-cache`, `ai-cache-session-review`, `ai-job-independent-review`, `ai-text-map`, `ai-name-paragraph`, `reading-bookmark-review`; chỉ thêm ca kiểm invariant/gap mới. Không bỏ test giữ response identity để tiện đổi metadata.
- E2E theo phạm vi: `reader-division.spec.ts`, `ai-txt-name.spec.ts`, các spec recovery/progress/TTS phù hợp. Những spec dùng footer đã bỏ phải cập nhật đường vào settings theo UI hiện hành trước khi dùng làm bằng chứng.
- Lệnh mẫu: `npm.cmd test -- tests/<file>.test.ts`; `npm.cmd run build`; `npm.cmd run test:e2e -- e2e/<spec>.spec.ts --workers=4 --reporter=line`. Chạy kiểm tra nặng tuần tự, TEMP/TMP riêng theo AGENTS khi cần; chỉ lặp khi có code ảnh hưởng hoặc vấn đề chưa giải quyết.
- Deploy sau khi đợt được triển khai và các gate liên quan đạt, theo quyền triển khai của phiên thực hiện. Smoke dùng context/IDB tổng hợp, chặn API cloud ngoài phạm vi; kiểm desktop/mobile-layout và cache reload. Không coi giả lập là Android thật hoặc mock là bằng chứng provider thật.
- Rollback code theo từng đợt; bỏ qua metadata tùy chọn vẫn đọc được cache cũ. Không reset DB, xóa cache/partial, ghi đè nguồn hoặc hoàn nguyên thay đổi khác trong dirtytree để rollback.

### Theo dõi thực hiện

- [x] D1 — Hợp đồng facts, RAM/cache và compatibility.
- [x] D2 — Trạng thái, tiến độ và Stop đúng đối tượng.
- [ ] D3 — Map tới các nhánh phục hồi.
- [ ] D4 — Marker theo quy tắc tường minh, text/map/cursor nhất quán.
- [ ] D5 — Tìm chương bằng ô hiện có.
- [x] D6 phần component thuần — điều hướng, mục lục, tiến độ và nút nổi.
- [ ] D6 phần controller AI — giữ sau D3–D4, chưa tách.

Đợt chỉ được đánh dấu xong khi có diff code, kết quả kiểm đúng phạm vi, review nếu bắt buộc và ghi rõ đã/chưa deploy. Giới hạn hoặc ca chưa kiểm phải ghi riêng. Không dùng kế hoạch này để tự đánh dấu các mục lịch sử phía dưới hoàn tất.

---

## Trạng thái triển khai — 08/10/2026 14:39 ICT

Phần UI software P0 và tìm tên Việt đã triển khai production454f94ce, https://thu-phong-private.pages.dev/. Root427unitreported/41files, app/serverTS+Vite80 build0,330/330 E2E qua3lượt; review độc lập57unit/build/72repeatE2E cuối. KnownbackupglobalNames expectedfailure vẫn còn. Đây không phải nghiệm thu Android thật hoặc toàn bộ website/EPUB/cloudsync.

| Phần | Kết quả hiện hành |
|---|---|
| UX0-A / UX-1A | Tiêu đề18/20px/fullwrap/left/hit44; bỏ converterbìaẩn trùng, raw không overwrite |
| UX0-B / UX-1B | Fresh19/1.65/760, commonsettings trước, advancedcollapse, stored22/40 và voice/TTS giữ; explicit reset display |
| UX0-C / UX-2 | Same-source snapshot liên tục, latestsemantic/cancellation/dict subscription/retry; stale selection/audio chặn; source token/literal Range/surrogate-safe anchor; progressrevision/rawobserver guards |
| UX0-D / UX-3 | Name inline/search/page50/251search/bulkcollapse/importdraft/exportdraft/failedsave-delete/latefile; dirtyexistingvalue giữquađóng, lazychunk6.75KB |
| UX1-A | VN/raw/author/Album search không dấu; indexRAM contextsignature, producerngoàifilter sống khi earlyquery/Namechange; không extraConvert mỗi phím |
| UX1-B manual / UX2-A | Androidhardware/IME/keyboard/rotation/zoom/resize, screenreader và catalogRAM/M0 còn mở; không được suy từ viewport/E2E. Namedphrase cực dài chỉ neo source-span start, không map mọi targetcharacter |

Production canonicalHTMLkhớpdist; actualNativeWorker với Chinese synthetic Names, font18/20/Reader19/max760/no DOMblank/Name reload đạt1280×800 và522×524. Default2-entry Name panel sau lazyload321.23px, trước430px mobile. Smoke cô lập dictmanifest để kiểm UI, không cold53MB benchmark; fixture đã DELETE200, giữ tombstone/reservation. Real nav/menu firstlast hit-test/anon200 đạt, không xóa truyện thật. Chi tiết commands/failhistory/modeldispatch trong HANDOFF-LOG.

Các nội dung khảo sát và acceptance bên dưới giữ làm lịch sử/kế hoạch; câu “chưa triển khai” thuộc mốc đầu. Checkpoint này là trạng thái mới nhất; P2storage/RAM/manual chưa bị gắn hoàn thành.

Ngày khảo sát: 08/10/2026, ICT. Người thực hiện: Codex, subagent nghiên cứu được root cấu hình `gpt-6-astra/high` theo yêu cầu người dùng; đây là tên cấu hình dispatch, không phải chứng nhận runtime ngoài công cụ. Tài liệu này là kế hoạch, chưa triển khai hoặc nghiệm thu UI mới.

Checkpoint root 08/10/2026 08:24 ICT: agent đã ghi tài liệu trước khi chạm quota/final lỗi; root đọc đối chiếu nguồn/bằng chứng và tiếp quản UX0-A. Typography Tủ sách đã sửa local18/20px với tên dài/fullwrap/hit44px; fullunit427reported/build0/30repeatE2E đạt. Chưa deploy, zoom/Androidhardware/hidden title optimization và các task khác còn mở. Giờ baseline subagent01:12 và root01:15–17 phía dưới ban đầu gắn ICT theo hostUTC; thực tế08:12/08:15–17 ICT, đối chiếu clock UTC01:23:52 → ICT08:23:52. Lịch sử giữ nguyên, không đổi các số đo DOM.

## 1. Phạm vi và kết luận

Ưu tiên số một là đọc rõ tên truyện để chọn. Giữ Tủ sách dạng danh sách gọn, Album/search/Add/menu hiện hành. Reader dùng cỡ chữ vừa phải và vùng đọc có độ rộng hữu hạn. Sửa một Name phải thực hiện ngay trên từ hoặc một hàng; bảng nhập cả file là chức năng nâng cao. Sau khi lưu, bản Convert tự cập nhật và giữ vị trí đọc, không thay toàn bộ nội dung bằng thông báo chờ.

Không thiết kế lại importer, không đảo quyết định mỗi TXT một truyện/mỗi direct-parent folder một Album, không đổi schema, backup, cloud snapshot hoặc auth. Không thêm Gemini, Web Speech fallback hoặc nối TTS mới. Name sửa vẫn lưu trên thiết bị; cloud hiện chỉ snapshot lúc thêm nên không được ghi “đã đồng bộ mọi thiết bị”.

Quyền phiên nghiên cứu: chỉ tạo tài liệu này, đọc source/test/docs, chạy targeted unit baseline. Root sở hữu cập nhật HANDOFF/log/DECISIONS và bằng chứng browser. Không đọc nội dung truyện thật ở D:, không sửa nguồn D:, không upload/deploy/commit/push. Git đã có nhiều thay đổi từ các phiên trước; không xem toàn bộ diff hiện tại là thay đổi của phiên này.

## 2. Bằng chứng hiện hành

Các line dưới đây là line của working tree lúc khảo sát; nhiều CSS đang nén thành một dòng dài. Phải tìm lại selector khi triển khai.

| Phát hiện | Bằng chứng | Mức xác minh / hệ quả |
|---|---|---|
| Tiêu đề tủ sách có thể nhỏ hơn quy tắc h3 | `src/ui/App.tsx:92`: h3 > button.text-button > ConvertedTitle. `src/stv-layout.css:5,13`: h3 17/16px, nhưng `.book-detail button` 12px | Xác minh cấu trúc/cascade từ source; root cần đo computed style. Tăng h3 đơn thuần không sửa đúng chỗ |
| Bìa nhỏ vẫn mount một ConvertedTitle đang bị CSS ẩn, tiêu đề hiển thị mount lần nữa | `App.tsx:92`, `stv-layout.css:5` `.cover strong{display:none}` | Xác minh source; số job và ảnh hưởng thời gian chưa đo. Bỏ công việc ẩn, không tự tuyên bố nhanh gấp đôi |
| Tiêu đề Việt chỉ là presentation, search vẫn theo nguồn | `ConvertedTitle.tsx:8–24`; `App.tsx:68` lọc title/author/album nguồn | Đúng quyết định 06/10. Tìm theo tên Việt là khoảng trống UX, không được chữa bằng ghi đè metadata |
| Title quay lại nguồn khi identity thay đổi | `ConvertedTitle.tsx:14–24`: result phải đúng text/signature, nếu khác trả text | Đường đổi chữ rõ trong source; chưa đo frame. Khi Name đổi: Việt cũ → nguồn → Việt mới có thể xuất hiện |
| Reader mặc định lớn | `src/domain.ts:21`: Arial 22px, lineHeight 1.8, width 1000; `Reader.tsx:161` gán trực tiếp inline | Giá trị source đã xác minh. Ảnh người dùng không chứng minh settings của họ còn mặc định |
| Name panel có hai bản trình bày cùng dữ liệu | `Reader.tsx:171–176`: toolbar Lưu/Chạy/Xuất, textarea rows=10, file input và danh sách đã lưu | Source đã xác minh. Ảnh được root mô tả ở 522×524 cho thấy bảng chiếm phần lớn vùng đọc; con số chiều cao textarea phải đo browser |
| Panel Name thực tế là non-modal utility dialog | `ReaderTools.tsx:7–17`; `stv-layout.css:12–13` | Không có backdrop/focus trap. Ở mobile top=12, width=vw−24, max-height=dvh−94. Không gọi nó modal chặn nền khi chỉ đánh giá code |
| Reconvert hiện xóa nội dung đọc | `Reader.tsx:76` reset conversionSource + setTokens([]); :80 renderedText rỗng; :163 thay paragraphs bằng notice khi waiting | Nguyên nhân có bằng chứng source. Chỉ bỏ setTokens([]) chưa đủ: renderedText và nhánh render vẫn che văn bản |
| Reconvert còn kích hoạt lại khôi phục tiến độ | `Reader.tsx:87–92` effect phụ thuộc converting/renderedText, đọc db.progress rồi scrollIntoView sau 80ms | Rủi ro nhảy vị trí có cơ sở; độ nhảy thực và tương tác timer600ms chưa đo |
| Name ở popup đã có guard/persistence quan trọng | `Reader.tsx:124–144`; `reader-word-edit.ts:9–22`; `book-names.ts:5–19` | Không viết lại bằng string.replace. Save kiểm book/chapter/revision, merge transaction, temp edit theo source range |
| Reader không có dictionary signature trong điều kiện render hiện tại | `Reader.tsx:29–30,51,76–77`; `language-client.ts:24–48` có snapshot/cache checks | Client chặn kết quả đang bay sai dictionary; Reader đang đứng yên không tự có subscription dictionary riêng. Cần regression thay dictionary khi Reader mở, chưa gắn nhãn lỗi đã tái hiện |

Nguồn đầu vào đã đọc: AGENTS.md, HANDOFF.md, WEB-READER-IMPLEMENTATION-PLAN.md, phần quyết định hiện hành của DECISIONS.md, App/Reader/ReaderTools/ConvertedTitle, CSS, language-client/cache, book-names/reader-word-edit và tests tương ứng. Không sử dụng mã hoặc dữ liệu từ D: trong nghiên cứu này.

Bổ sung bằng chứng browser độc lập do root chuyển giao trong cùng phiên, Edge Windows local/fresh context và fixture tổng hợp; subagent không tự chạy lại browser:

| Viewport | Prose computed | Name panel | Textarea | Shelf title thực |
|---|---|---|---|---|
| 320×568 | 22px / line-height39.6px | 296×474px,83.5% chiều cao viewport | 274×227.97px | h3=16px; button/span=12px |
| 522×524 | 22px / line-height39.6px | 498×430px,82.1% | 476×227.97px | h3=16px; button/span=12px |
| 1280×800 | 22px / line-height39.6px | 410×522.56px | 388×227.97px | h3=17px; button/span=12px |

Không có horizontal overflow trong ba ca baseline. `test-results/ux-research/measure.mjs` exit0, screenshots `name-{320,522,1280}.png` (ignored). Lượt đầu timeout vì locator Name không đúng nhãn ✎ Name; root giữ lỗi trong log. Như vậy textarea đo được khoảng228px, không phải 350px; panel lớn là tổng toolbar/hướng dẫn/form/list và chiều cao cho phép.

Root còn chạy `test-results/ux-research/name-reconvert.mjs` exit0 ở522×524 với200 đoạn Chinese tổng hợp và đổi Name từ Trần Cảnh Nhiên sang Trần Mới. MutationObserver thấy paragraphs=0/loading=true tại461.1ms và paragraphs=200/loading=false tại511.1ms: khoảng trống DOM50ms trong đúng lượt này. Đây là đo DOM state, không là số frame render hoặc benchmark production; không suy ra mọi máy chớp50ms. Lượt scratch đầu exit1 vì orderBy('order') không có index, đã sửa test sang toArray/sort và giữ fail log. Nhảy scroll, keyboard Android và full dictionary cold còn chưa xác minh.

## 3. Một hệ thống giao diện thống nhất

### Tủ sách: tên là vùng nhìn và bấm chính

Giữ danh sách một cột. Mỗi hàng dành chiều ngang cho tên; marker bìa chỉ phụ trợ và có thể bỏ ở màn hình rất hẹp. Dùng một class riêng cho nút tiêu đề, `font:inherit`, `text-align:left`, width phù hợp và màu chữ tương phản. Đề xuất ban đầu: tên 18px ở mobile, 20px desktop, weight600, line-height1.4–1.5; metadata 12–13px. Đây là lựa chọn thử nghiệm sản phẩm, không phải thông số chuẩn bắt buộc.

Không cắt tên thành dấu … hoặc giới hạn hai dòng trong lượt đầu: để tên dài xuống dòng đầy đủ, kể cả không có dấu cách. Không trộn tên gốc và tên Việt vào cùng một chuỗi. Tên Việt là nhãn chính khi đã có; nguồn vẫn xem tại trang thông tin. `title` hover có thể bổ trợ desktop, không phải cách duy nhất đọc nguồn trên Android.

Tên/bìa tiếp tục mở thông tin, “Mở sách” đọc tiếp theo hành vi hiện hành; không đổi đột ngột click semantics trong bản sửa độ rõ. Tên truy cập được phải khớp nhãn mà người dùng thấy, không chỉ một raw Chinese aria-label khó nhận ra. ⋯ giữ flow nở hàng và hit target44px đã sửa; không dùng overflow:hidden để làm hàng trông đều rồi cắt menu.

```
[Tìm truyện…                         ] [Album ▾]

Tên Việt của truyện, xuống dòng nếu cần          ⋯
Album · Tác giả (nếu có) · 75 chương
Mở sách →
────────────────────────────────────────────────
```

Tìm theo tên Việt: P1, index presentation riêng keyed bằng bookId + semantic identity; tiếp tục tìm raw/author/Album. Không ghi vào book.title, không làm nguyên catalog cần Convert xong mới dùng search, không khởi tạo engine cho tất cả sách để hoàn thành một lần gõ. Hiển thị nguồn ngay khi bản Việt chưa sẵn; trạng thái đang chuẩn bị không chặn chọn sách.

### Reader: ưu tiên đoạn văn

Đề xuất cho người chưa có settings: 19px, line-height1.65, width tối đa760px, lề16px mobile/24px desktop. Width chỉ là max-width và không ép min-width500px vào màn hình320px. Giữ tùy chỉnh cỡ chữ của người dùng, kể cả 22–40px; không dùng CSS `!important` để bí mật thu nhỏ settings đã lưu. Nút “Mặc định hiển thị” hiện có áp dụng preset mới một cách tường minh. Cần review việc đổi defaults vì cùng object còn chứa voice settings; tuyệt đối không reset lựa chọn TTS khi chỉnh typography.

Ở đầu Reader chỉ cần quay lại, tên truyện/chương và hàng chương trước–mục lục–chương sau; không lặp heading cùng cấp. Giữ ⚙ và công cụ hiện hữu, chưa thêm thanh icon mới. Settings đầu tiên là cỡ chữ/giãn dòng/font/nền; bảng màu chi tiết, bóng chữ, căn lề ít dùng gom trong mục nâng cao. TTS chưa là R0 gate; không tự thêm chế độ nghe hoặc auto-play.

Không coi giảm font là đã chữa panel quá lớn. Panel cần layout riêng theo chức năng, độc lập font của prose. Trên desktop đủ chiều ngang dùng panel phải rộng khoảng340–380px; trên mobile/viewport thấp dùng sheet gọn, ưu tiên form một Name. Ở 522×524 có bàn phím, nút đóng và trường đang nhập phải cuộn tới được, không nằm dưới fixed footer. Body panel là vùng cuộn chính, tránh textarea cuộn trong body rồi còn danh sách cuộn lồng nhau.

### Name: sửa một tên trước, xử lý hàng loạt sau

Luồng đọc: chạm từ → popup hiện nghĩa hiện hữu → sửa giá trị → “Lưu cho truyện”. Một lần lưu thành công tự reconvert, không cần bấm Chạy lần nữa. Sửa tạm và Name chung vẫn có nhưng nằm trong lựa chọn scope rõ nghĩa; mặc định giữ scope truyện, không âm thầm nâng thành chung. Phương án đầu ưu tiên giữ popup STV đã kiểm thử và thu gọn màn quản lý; không thay mọi popup cùng một commit.

Màn quản lý Name: tìm key/giá trị, danh sách mỗi hàng `chữ nguồn → tên Việt`, chạm hàng mở hai trường nhập ngắn. Nút lưu duy nhất cho form, feedback cạnh form; xóa là thao tác riêng theo đúng key, không suy “xóa dòng trong draft” thành xóa dữ liệu. Với 1 Name chỉ hiển thị hàng đó và editor gọn, không mở sẵn textarea10 dòng. Danh sách cần pagination tìm được mọi key; không mất khả năng sửa mục ngoài200 mục đầu.

```
Name của truyện                                  ×
[Tìm tên…                                       ]
张三                 Trương Tam                  ›

Chữ nguồn            [张三                     ]
Tên Việt             [Trương Tam               ]
Phạm vi: Truyện này                  [Lưu tên]

▸ Nhập / xuất và sửa nhiều dòng
```

Nâng cao thu gọn mặc định gồm import/export/bulk textarea. Textarea auto-grow theo nội dung với trần chiều cao, không chỉ giảm rows một cách cố định. Phân biệt “Xuất Name đã lưu” với “Xuất bản nháp” nếu còn draft; export hiện tại lấy nameDraft nên không được đổi nhãn thành đã lưu mà giữ nguyên dữ liệu đầu ra. Import đọc xong chỉ đưa vào draft, hiển thị số dòng hợp lệ/bị bỏ; một lần Lưu áp dụng merge đã có. Không auto-save mỗi phím: người dùng có thể đang gõ Unicode/IME hoặc chưa chọn scope. “Cập nhật ngay” ở đây nghĩa là sau commit đã xác nhận thành công; không bắt bấm Chạy thêm.

Lỗi write/quota giữ form và draft; không đóng panel với toast báo thành công trước commit. Đóng rồi mở lại trong cùng Reader giữ draft dirty như hiện tại. Các completion của file import/save phải có book/session/draft generation: không append file vào phiên đã đổi truyện hoặc xóa nháp mới. Nếu thêm đổi key, coi là thao tác riêng cần transaction/guard, không thực hiện bằng delete-then-put rời nhau; lượt P0 chỉ sửa value của key hiện hữu/thêm key mới.

## 4. Hợp đồng chống nhấp nháy

Tách ba khái niệm trong state: nguồn đang đọc, snapshot đã trình bày, job đang tính. `converting` không đồng nghĩa phải ẩn snapshot. Snapshot gồm bookId/chapterId/revision/source identity, semantic identity (ordered book/global Names + dictionary signature + options), tokens và trạng thái current/stale. Token array luôn đi cùng identity tạo ra nó.

| Tình huống | Nội dung trình bày | Tương tác |
|---|---|---|
| Mở chương lần đầu, chưa có snapshot phù hợp | Trạng thái tải gọn, không dùng nội dung chương trước để lấp chỗ | Navigation/Back/Cancel còn dùng được; selection/TTS chờ |
| Cùng nguồn, vừa lưu Name hoặc đổi dictionary | Giữ snapshot cũ, nhãn nhỏ “Đang cập nhật…” ở vùng status ổn định | Hủy selection cũ; chặn commit dựa token cũ và TTS mới; người dùng vẫn đọc/cuộn |
| Job hiện hành thành công | Atomically swap snapshot mới, chiếu các temp ranges còn tương thích | Cho tương tác lại sau identity check; không fade/crossfade văn bản |
| Job cũ trả về sau job mới/chuyển chương | Bỏ kết quả | Không đổi nội dung/title/scroll/selection hoặc phát audio |
| Reconvert lỗi nhưng có snapshot cùng nguồn | Giữ snapshot và nói rõ chưa cập nhật; Retry hoặc Xem bản gốc tường minh | Không coi snapshot là current, không phát TTS cũ |
| Đổi chapter/revision/book | Snapshot cũ không được gắn dưới heading mới | Reset selection, hủy continuation; only exact-source snapshot/cache mới được dùng |

Giữ kiểm tra epoch/identity/checksum/provenance của language-client và convert-cache. Không “chữa flicker” bằng cache chỉ theo chapterId, bỏ dict signature hoặc dùng output của request cuối hoàn thành bất kể generation. Đóng popup khi Name/global/dictionary semantic identity đổi; guard lookup và translated selection dùng cùng context hiện hành. Khác object reference nhưng cùng nội dung Name không nhất thiết cần reconvert; so semantic signature ổn định thay reference array là tối ưu thứ cấp sau correctness.

Tiêu đề áp dụng cùng nguyên tắc hẹp: giữ title Việt trước đó chỉ khi cùng bookId+raw text trong lúc cập nhật; hiển thị nguồn khi chưa từng Convert thành công. Không reset title về nguồn giữa hai bản Việt mỗi lần Name đổi. Nếu text/bookId đổi, không giữ title sách trước. Cache/đồng bộ title có identity riêng, không lưu output vào metadata nguồn.

Giữ vị trí: tách hydration tiến độ lần mở chương khỏi reflow/reconvert cùng chương. Trước swap/settings reflow, chụp điểm neo đang thấy bằng source offset hợp lệ và độ lệch pixel trong viewport; sau swap map sang token/paragraph mới rồi bù vị trí. Dùng anchor của vị trí người dùng hiện tại nếu họ cuộn trong khi job chạy, không khóa vị trí tại lúc bắt đầu job. Không reload progress cũ ở mọi lần renderedText đổi. P0 chưa đổi schema progress: anchor trong RAM, vẫn serialize paragraph/offset/revision hiện hành. Đổi schema/source-based progress lâu dài là task dữ liệu riêng.

DOM keys nên theo source span + loại decoration ổn định nơi khả thi; không key toàn prose theo conversion revision vì sẽ remount cả vùng đọc. SourceStart/sourceEnd phải giữ UTF-16 normalized source, surrogate-safe, không overlap hoặc tự chuyển thành target offsets. Temp ranges bị retokenization làm mất nguyên token được loại riêng, các range còn hợp lệ vẫn giữ theo hàm hiện có.

## 5. Chia nhiệm vụ triển khai

Thứ tự đề xuất: UX0-A → UX0-B → UX0-C → UX0-D; UX0-C phải có invariant trước khi nối form Name mới. Mỗi task có diff riêng và nghiệm thu riêng, không gộp redesign toàn app. Đây là phạm vi được đề xuất, chưa là báo cáo đã sửa.

Ánh xạ ID handoff của root: **UX-1 = UX0-A + UX0-B** (typography, làm từng diff hẹp); **UX-2 = UX0-C** (snapshot/anchor/race); **UX-3 = UX0-D** (Name inline/advanced). Có thể thu gọn layout Name bằng CSS/presentation sớm, nhưng không nối semantics editor mới trước UX-2. Không tạo hai backlog song song với ID khác nghĩa.

| ID / ưu tiên | Quyền sửa hẹp | Invariant và đầu ra | Test bắt buộc |
|---|---|---|---|
| UX0-A / P0 tên dễ đọc | App.tsx đoạn shelf, stv-layout.css selector library, ConvertedTitle chỉ loại instance bị ẩn nếu cần; e2e shelf/title | font title đúng computed style18/20, full title readable, Album/search/open/menu semantics giữ, không metadata writes | shelf-minimal-v2, minimal-library, converted-titles; fixture tên Việt/Han/mixed/120+chars/no-space;320/390/522/1280,zoom200% và reflow320 |
| UX0-B / P0 Reader vừa màn hình | domain.ts defaults display fields; ReaderTools display grouping; scoped reader CSS; không persistence/schema handlers | chỉ profile mới/reset nhận preset19/1.65/760; settings đã lưu và voice giữ nguyên, không overflow/che nút ở524px height | reader, stv-ui, settings hydration/regression hiện có; computed typography với fresh/existing settings; mở/đóng/Escape/focus, resize và zoom |
| UX0-C / P0 render liên tục | Reader.tsx conversion/render/progress/selection guards; hook/helper mới nhỏ nếu cần; ConvertedTitle stability; tests mới | source/semantic identities, oldjob discard, no body blank cùng source, current anchor/progress giữ, no stale selection/audio | deterministic delayed Worker integration; reader-race, reader-word-popup, converted-titles, convert-cache, story-detail-review; targeted unit Names/cache/provenance |
| UX0-D / P0 Name gọn | Reader Name panel tách component nếu cần, ReaderTools/reader CSS; giữ writer API; tests Name UI | một key/form, commit→reconvert một lần, bulk advanced collapsed, merge không xóa omitted, scope rõ, failedwrite giữdraft | CRUD Name/book isolation/global distinction, import generation, invalid/quota failure, reload persistence, >200 rows searchable, mobile panel/keyboard/manual |
| UX1-A / P1 tên Việt tìm được | hook/index presentation trong RAM hoặc cache riêng theo kế hoạch, App search, tests; không books.title/schema | kết quả tìm raw luôn sẵn, converted index không stale khi Name/dict đổi; bounded work, không all-catalog conversion bắt buộc | search tiếng Việt có/không dấu theo quyết định cụ thể, late result/filter/backscroll; benchmark synthetic catalog trước lựa chọn batch/virtualize |
| UX1-B / P1 hoàn thiện đọc | ReaderTools/Name accessibility, CSS, tests; không engine/auth | order/tab/labels/focus rõ, advanced persisted chỉ khi đã quyết định, textspacing/reflow hoạt động | keyboard-only, screen-reader smoke, Android thật keyboard/rotate/back/background; longtext/fontmax40 |
| UX2-A / P2 hiệu năng và tiến độ dài hạn | lập spike trước; chưa cấp quyền sửa storage/worker protocol/schema | đo title queue, cold/warm chapter, memory incl Worker; quyết định M0 bằng dữ liệu | thiết bị Windows/Android ghi browser/RAM/corpusfixture; cancellation/20chapters/cachebounded; independent review nếu đổi data/protocol |

Vùng cấm các task P0: server/functions/migrations/cloud snapshot/backup/importer/splitter/nguồn D. Nếu cần sửa writer Name, dictionary pipeline hoặc progress persistence vượt presentation, tách task rủi ro dữ liệu và yêu cầu reviewer độc lập chạy regression; không lén đưa vào task CSS.

## 6. Nghiệm thu cụ thể

Các số dưới đây là mục tiêu mới, chưa phải số đã đạt:

- Tủ sách: text node tiêu đề có computed font đúng18px mobile/20px desktop, không bị rule button12px ghi đè; toàn tên nhìn được khi xuống dòng. Chọn được truyện bằng tên, menu đầu/cuối danh sách không clipped và hit-test đúng. Search/Album không đổi selection mapping.
- Reader: fresh preset19px, line-height31.35px; user font22/40 không bị override. Nội dung không có horizontal scroll ở320px; kiểm bao gồm control/Name/longtitle, không chỉ prose. Lề không ăn hết màn hình. Khác số pixel do browser rounding phải có tolerance ghi rõ.
- Name: trạng thái mặc định ở522×524 không có textarea bulk10 dòng hoặc native file input mở sẵn. Editor một tên có nguồn/giá trị/scope/save/close dễ thấy; khi bàn phím mở có thể cuộn tới save/close. Target thao tác chính44×44CSSpx, không ép word-token inline44px làm vỡ dòng.
- Khi giữ delayed Convert chưa resolve và đã có snapshot cùng source, mọi lần quan sát DOM/animation frame đều có paragraph cũ; status updating hiện riêng. Khi resolve, nghĩa mới xuất hiện không cần Chạy. Không có frame rendered body trống hoặc toàn notice thay body. Đếm frame là test continuity; không lấy unit/mock delay làm benchmark production.
- Đổi Name hai lần nhanh; switch chapter A→B→A; đổi dictionary A→B→A; close Reader; delayed lookup và late write đều không ghi nhầm context. Chuỗi test phải quan sát intermediate state, không chỉ assert cuối.
- Scroll anchor cùng source giữ sai lệch tối đa một dòng khi text phía trên đổi độ dài; nếu người dùng cuộn khi chờ thì giữ anchor mới. Reload vẫn đúng progress; Back trong lúc hydrate không ghi paragraph0 đè progress cũ; sửa font/width/rotate không reset chương.
- Lưu một key không làm biến mất key khác; merge giữ IDs, duplicate key rule hiện hành; xóa chỉ key chỉ định; failed save không báo đã lưu. Bản raw chapter/title, original Blob/hash, source ranges và book khác byte-for-byte unchanged ngoài Name/progress được chủ đích sửa.
- Stop/Back/change chapter trong khi đang cập nhật không phát audio muộn; không dùng snapshot stale làm speechText ready. Không thêm fallback hoặc nghiệm thu TTS thật bằng Audio mock.

Nguồn accessibility chính thức: [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) hỗ trợ tiêu chí bố trí một chiều ở320CSSpx; [W3C Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) yêu cầu không mất nội dung/chức năng khi người dùng thay giãn chữ/dòng; đây không phải bắt mọi trang dùng một line-height mặc định. [W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) phân biệt minimum/spacing exceptions;44px ở đây là mục tiêu touch của dự án, không gán nhầm thành yêu cầu AA minimum. Các lựa chọn19px/760px/1.65 cần người dùng và thiết bị thật kiểm chứng.

## 7. Bộ kiểm thử, bằng chứng và rollout

Baseline do subagent thực chạy 08/10/2026 01:12 ICT từ private-novel:

```powershell
npm.cmd test -- tests/book-names.test.ts tests/reader-word-edit.test.ts tests/reader-word-review.test.ts tests/reader-word-actions.test.ts tests/language-client.test.ts tests/convert-cache.test.ts tests/convert-cache-review.test.ts
```

Kết quả: exit0,57/57 tests,7/7 files. Synthetic warm cache test in stdout không là số đo UI/device; không dùng1ms để cam kết trải nghiệm. Không chạy build hoặc E2E ở subagent vì không sửa code và root đang sở hữu browser session. Chưa xác minh layout/thời gian Android thật. Các lần grep đầu có path App.tsx sai vị trí và wildcard Windows không hợp lệ, đã sửa về src/ui/App.tsx và `rg -g`; không coi lỗi đọc command đó là kết quả test.

Sau mỗi thay đổi code, root bắt buộc:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e -- e2e/shelf-minimal-v2.spec.ts e2e/minimal-library.spec.ts e2e/converted-titles.spec.ts e2e/reader.spec.ts e2e/stv-ui.spec.ts e2e/reader-word-popup.spec.ts e2e/reader-race.spec.ts e2e/story-detail-review.spec.ts e2e/convert-cache.spec.ts --reporter=line --repeat-each=3
```

Thêm specs regression mới của từng task vào lệnh thực tế; không chạy lệnh như nghi thức rồi bỏ test mới. Nếu runner gây xung đột output/port dùng output directory riêng/workers phù hợp và ghi cả fail trước lẫn kết quả rerun. Reviewer UX0-C/D kiểm diff và tự chạy delayed-Worker + progress/Name regressions, không chấp nhận chỉ đọc source. Root vẫn chạy tích hợp. Known `it.fails` backup nằm ngoài57 tests nói trên vẫn là lỗi mở, không bị che bởi release UI xanh.

Ma trận thực nghiệm: Chromium/Edge Windows viewport1280×900,390×844,522×524 và320px reflow; zoom200%/400%; fresh profile và saved settings; tên rất dài/Han/mixed,0/1/200+ Name, chương nhiều đoạn, dictionary cold/warm. Browser Android-layout chỉ là mô phỏng Windows, phải ghi nhãn đó. Android thật cần keyboard/IME/dvh/rotate/fontscale/background/return, đọc vài phút và sửa liên tục; chưa được đánh dấu đạt từ screenshot viewport.

Rollout: chụp baseline cùng fixture → diff/task unit/build/repeatE2E → reviewer độc lập các guard/data touch → preview synthetic và user nhìn thử → production chỉ khi root được giao triển khai và có smoke bundle/layout/persistence. Không đổi schema nên rollback bundle đơn giản hơn nhưng vẫn kiểm Name đã lưu đọc được; không xóa cache/userdata để làm smoke xanh. Trong phiên lập kế hoạch này không deploy.

Nhật ký bàn giao root cần ghi: tên cấu hình model thực gọi; file plan được tạo; source evidence vs runtime measurement; commands/exit và missing checks; UX0-A là bước đầu nhỏ, UX0-C là gate trước Name editor mới; M0 RAM/Android/cold-worker còn mở. Số đo browser độc lập của root có thể bổ sung thành phụ lục với URL/build/fixture/viewport/time; không chuyển suy luận ở bảng trên thành measured nếu chưa có kết quả.
