# Đánh giá code web và ý tưởng GitHub

**Ngày:** 14/11/2026  
**Mục đích:** Đối chiếu một số hướng cải tiến với source hiện có; đây là báo cáo nghiên cứu, không phải benchmark hay kiểm toán bảo mật.

## Kết luận đánh giá

Bản báo cáo trước có nhiều ý tưởng đáng xem, nhưng **không đủ cơ sở để dùng làm roadmap nguyên trạng**. Nó đưa ra số liệu hiệu năng và lợi ích định lượng chưa đo, mô tả sai một số tính năng đã có, và trộn ý tưởng từ GitHub với suy đoán như thể đã được chứng minh. Bản này sửa các điểm đó và chỉ giữ đề xuất có thể truy nguyên về code hoặc nguồn tham khảo.

## Phạm vi

Checkout được rà là `DOCTAILIEU/private-novel` (package `private-novel`, cùng project được chỉ định trong HANDOFF), không phải source zip do người dùng tải lên. Kiểm kê source runtime/schema: 304 file, khoảng 18.289 dòng (`src` 246/15.382; Pages Functions 12/64; `server` 24/2.103; `convert-server` 4/297; migrations 18/443). Đã đọc sâu các đường đi chính của app, Reader/EPUB, Album/search, IndexedDB, AI/TTS, import và cloud; rà symbol/route trên toàn source. Không đọc từng dòng của toàn bộ unit tests, E2E, scripts, fixture và tài liệu; do đó không gọi đây là audit toàn code.

## Các claim cần sửa trong bản trước

| Claim trước | Đối chiếu source | Đánh giá |
|---|---|---|
| “~99% ít DOM hơn”, 8.000–15.000 node/chương, cuộn 60 FPS | Reader có `.word-token` và TTS sentence highlight; code dùng CSS Custom Highlight cho một số lựa chọn văn bản. Không có phép đếm DOM hoặc đo FPS trong checkout được xem | **Chưa chứng minh.** Đo trước/sau trên chương tổng hợp và thiết bị mục tiêu rồi mới ghi số |
| CSS Custom Highlight chạy trên GPU, bỏ mọi React render | API đang được dùng cho vùng chọn; chưa thấy bằng chứng bảo đảm GPU. TTS vẫn cập nhật `sentence` ở React/Reader | **Diễn đạt sai mức chắc chắn.** Có thể thử giảm DOM mutation, nhưng không hứa GPU hay loại bỏ toàn bộ render |
| Paged mode là “mượt”, rủi ro 0 | Foliate paginator dùng CSS multi-column; README của chính dự án cảnh báo có thể chậm và có giới hạn CSS | **Không phải quick win.** Phải kiểm tra scroll anchor, selection, TTS, Name/Convert và EPUB |
| Trie/Aho-Corasick cần thiết; tăng 3,5×, giảm RAM 65%; từ điển chỉ nằm Blob | Source đã có `PackedBuilder`/`PackedIndex` và cache IndexedDB riêng cho một số dictionary; chưa có benchmark hiện tại để so với Trie/OPFS | **Số liệu và tiền đề không đáng tin.** Chỉ làm benchmark đại diện nếu Convert vẫn là bottleneck |
| TTS: báo cáo cũ nói gap 100–300 ms và thiếu Media Session | Reader hiện dùng một Audio element với URL MP3 đổi theo đoạn; Media Session play/pause/stop có sẵn, chưa thấy Wake Lock. Edge fixture probe 23 chuyển: event gap p50 27,7/p95 32,3/max 33,8 ms; MP3 mẫu có im lặng đầu/cuối 114/138 ms | Gapless-5 gợi ý điều phối audio; không xóa im lặng đã mã hóa | Không sửa player: fixture không có độ trễ mạng và chưa đo gateway/current production audio, cảm nhận người nghe hoặc Android | Đây chỉ là browser media-event profile trên fixture tổng hợp, không phải end-to-end/TTS Android. Script kiểm nghiệm cũ dừng ở trạng thái chờ AI và gửi 0 request TTS. [Chi tiết](TTS-GAP-PROFILE-2026-11-14.md) |
| AI không có context window hoặc Name prompt injection | `ai-parts.ts` gắn context nguồn trước đó (tối đa khoảng 300 ký tự theo logic hiện tại); `ai-hybrid-prompt.ts` nhận `context` và `names` | **Sai hiện trạng.** Không đề xuất thêm lại chức năng đã có. Chất lượng xưng hô/Name cần đo trên corpus phù hợp, không hứa “100%” |
| OPFS / `navigator.storage.persist()` sẽ bảo vệ sách tuyệt đối | UI About đã có nút gọi `navigator.storage.persist()`; đây là lời xin browser cấp quyền, không bảo đảm browser chấp thuận hay dữ liệu tuyệt đối không bị mất | **Đã có một phần; không phải bảo đảm.** Không chuyển dictionary sang OPFS khi chưa benchmark tương thích/backup/quota |
| Tủ sách lớn sẽ mở tức thì nhờ virtualization; truyện 1.000+ chương cần scrubber | Album shelf xem trước tối đa 12 truyện mỗi Album; StoryDetail phân trang 60 chương; có tìm/chuyển tới chương và route số. Danh sách truyện chính vẫn render toàn bộ `filtered` | **Chỉ virtualization danh sách truyện chính là giả thuyết cần đo.** Album grouping có thể giảm quét lặp; scrubber cần nhu cầu riêng |
| Offline shell làm web độc lập/mở offline 100% | Không tìm thấy đăng ký service worker/Workbox trong source, `public`, Vite config hoặc dependencies; About cảnh báo app có thể không mở lại khi hoàn toàn mất mạng | **Khoảng trống thật, phạm vi lợi ích bị nói quá.** Service worker có thể cache app shell sau lần tải/cài online; API, AI, TTS và cloud vẫn cần mạng |

## So sánh trước/sau có căn cứ hơn

| Ưu tiên | Trước | Ý tưởng tham khảo | Sau có thể kỳ vọng | Bằng chứng còn cần |
|---|---|---|---|---|
| **P1: Offline app shell** | Source không có registration lúc audit; Pages khi đó trả SPA HTML tại /sw.js | Workbox precache và fallback điều hướng | Đã deploy; giao diện và truyện local mở được offline sau khi shell cài; API/AI/TTS vẫn cần mạng | Production Edge offline E2E pass sau deploy 97962f61, build ID 48b1e9cdcbd76e96. Local Edge lifecycle test xác nhận worker mới chờ tab cũ đóng rồi mới active và dọn cache cũ; fixture đổi build ID, cùng asset, chưa phải hai build production độc lập |
| **P2: Album grouping** | `AlbumShelf` map Album và mỗi Album lọc lại toàn bộ `books` | Đã gom một lượt vào Map theo Album/path; giữ sách trong mọi Album tổ tiên hợp lệ | Microbenchmark synthetic 5.000 sách/150 path: dựng nhóm p50 1.139,34→17,42 ms (65,4×); membership/order giống nhau. App vẫn filter/sort sau đó; bộ nhớ index tăng theo N×D | Unit 4/4 và local hierarchy E2E; xem [đo và giới hạn](ALBUM-GROUPING-PERF.md). Số tổng hợp không thay cho profile browser/thư viện thật/Android |
| **P2: List virtualization** | `App.tsx` render toàn bộ sách đang lọc: production Edge tạo 11.039 DOM elements ở 1k sách và 55.039 ở 5k; long task lớn nhất 99/891 ms desktop | TanStack Virtual headless rows, đo chiều cao và overscan | Đã deploy, chỉ bật khi trên 300 sách, giữ ba chế độ xem và focus/Tab. Sau: 320 DOM elements desktop (1k/5k), long task lớn nhất 0/164 ms; tìm 5k sách 1.363 ms | Production Edge E2E 2/2; Pixel 7 viewport emulation E2E 2/2; production PWA regression 1/1. Canonical bundle SHA khớp build. Mobile 393px profile 155 DOM và 167 ms long task ở 5k. Một lượt, synthetic; Android thật còn pending. [Chi tiết](LIST-VIRTUALIZATION-PERF.md). |
| **P3: Fuzzy metadata search** | Exact substring sau chuẩn hóa; không chịu typo | Fuse.js `match` theo trường metadata, chỉ làm fallback khi exact không có kết quả | Đã triển khai ở worker: typo tiếng Việt/CJK trên tên gốc, tiêu đề Convert đã lưu, tác giả, Album; không fuzzy nội dung chương | Unit 6/6, preview E2E 1/1, build pass. Synthetic 5k trên Edge desktop: median 693,8 ms (n=5), long task 68 ms query đầu/0 ms tiếp theo. Android và hiệu quả ranking với corpus thực chưa đo; tiêu đề Convert tạm thời trong RAM không fuzzy-index. [Chi tiết](FUZZY-LIBRARY-SEARCH.md) |
| **P3: EPUB navigation** | Renderer hiện giữ layout riêng; TOC flatten thành spine path/title, fragment không lưu; progress dùng chapter/offset và opaque iframe bridge | Readium Navigator/Locator chuẩn hóa href, text context, fragment, progression/position và nav links | Spike EPUB tổng hợp xác nhận gap hierarchy/fragment; giữ renderer hiện tại, chưa thêm adapter/package vì mapping Name/Convert, TTS/AI offsets và CSP còn cần | Unit 11/11; Edge synthetic E2E 3 pass, 2 skipped. Readium TS Toolkit BSD-3-Clause nhưng cảnh báo minor có breaking changes; Readium Web tự mô tả WIP. [Chi tiết](EPUB-NAVIGATION-SPIKE-2026-11-14.md) |
| **Đã có code local, chưa kết luận live** | Xóa nhiều truyện trước đây tuần tự | Bounded concurrency theo ý tưởng `p-limit` | Source local giới hạn 4 item, snapshot precondition từng DELETE và chỉ dọn local sau ACK | Unit/build lượt trước pass; chưa đo kho thật hoặc xác nhận deploy. Giữ riêng review vì đây là thao tác xóa |

## Ý tưởng nên hoãn/bác bỏ ở thời điểm này

- **Không hứa 0 ms audio gap hoặc 60 FPS**: phụ thuộc browser, audio codec, upstream latency và thiết bị; cần đo thực tế.
- **Không thêm Trie/OPFS chỉ vì phổ biến**: app đã có packed dictionary cache. Chuyển storage là thay đổi kiến trúc/quota/backup và phải có bằng chứng bottleneck.
- **Không thay reader bằng Foliate/epub.js/Readium ngay**: renderer hiện có ràng buộc layout, sanitization, mapping Name/Convert, chọn từ và TTS. Foliate.js tự cảnh báo API chưa ổn định; paginator dùng CSS columns cũng có giới hạn.
- **Không thay cloud sync bằng CRDT/Dexie Cloud theo mẫu**: source đang có CAS, revisions, conflict handling, tombstone và cloud ACK trước local delete. Chưa thấy yêu cầu hoặc bằng chứng lợi ích bù rủi ro migration.
- **Không coi `navigator.storage.persist()` là chống mất dữ liệu tuyệt đối**; tiếp tục khuyến khích backup và báo rõ khi browser từ chối.

## Nguồn GitHub đã kiểm tra

- [GoogleChrome/Workbox](https://github.com/GoogleChrome/workbox): thư viện service worker/cache cho offline; không tự chứng minh app này offline toàn phần.
- [johnfactotum/foliate-js](https://github.com/johnfactotum/foliate-js): có paginator, overlayer và progress; README nói thư viện chưa ổn định, CSS multi-column có thể chậm/giới hạn.
- [TanStack/virtual](https://github.com/TanStack/virtual): headless virtualizer hỗ trợ đo item, overscan và range tùy chỉnh; đã dùng sau khi profile danh sách lớn xác nhận DOM/long task cao. App thêm `@tanstack/react-virtual` MIT, không chép mã nguồn; chi tiết và giới hạn ở [LIST-VIRTUALIZATION-PERF.md](LIST-VIRTUALIZATION-PERF.md).
- [tc39/proposal-array-grouping](https://github.com/tc39/proposal-array-grouping): ý tưởng nhóm theo khóa thành Map; app tự gom một sách vào từng Album tổ tiên vì cây cần nhiều bucket cho một item, không thêm dependency.
- [krisk/Fuse, tag v7.5.0](https://github.com/krisk/Fuse/tree/v7.5.0) (Apache-2.0): fuzzy matching theo metadata; tích hợp API trong module Worker, không chép mã. Tokenizer/ranking CJK cần kiểm riêng.
- [readium/ts-toolkit](https://github.com/readium/ts-toolkit) và [readium/web](https://github.com/readium/web): tham khảo API reader/position; Readium Web ghi trạng thái đang phát triển.
- [regosen/Gapless-5](https://github.com/regosen/Gapless-5): phối hợp HTML Audio và Web Audio cho mục tiêu gapless; không đảm bảo 0ms trên TTS stream động của app.
- [yomidevs/yomitan](https://github.com/yomidevs/yomitan): popup dictionary cho học/ngôn ngữ, chủ yếu hướng Nhật; chỉ tham khảo tương tác tra cứu, không coi là nguồn thuật toán phù hợp cho Trung–Việt.

## Thứ tự làm việc đề xuất

1. **Album grouping Map và virtualization đã deploy.** Virtualization có production build profile, Edge E2E và PWA regression bằng fixture synthetic; còn kiểm tra Android thật (chi tiết [ALBUM-GROUPING-PERF.md](ALBUM-GROUPING-PERF.md), [LIST-VIRTUALIZATION-PERF.md](LIST-VIRTUALIZATION-PERF.md)).
2. **PWA app shell đã deploy** (xem [PWA-OFFLINE-SHELL-M0.md](PWA-OFFLINE-SHELL-M0.md)); bước còn lại là test worker update khi tab phiên bản cũ còn mở.
3. Đã đo cold/warm và Convert bằng Node với các từ điển chọn thật; còn đo Edge/Android với IndexedDB bền và chương đại diện. Người dùng cho phép chép tạm riêng Vietphrase qua USB vào Android, không gửi mạng và xóa sau phép đo; fuzzy metadata đã được triển khai và kiểm thử tổng hợp trên desktop; còn đánh giá typo/ranking trên corpus thực và Android.
4. Đo audio gap trên thiết bị/browser thật trước khi thử Web Audio; không cam kết 0 ms.
5. Chạy EPUB spike tổng hợp để đối chiếu TOC/locator/accessibility với các invariant reader; không thay engine theo cảm tính.

## Phương pháp đo và tiêu chí đề xuất

Các ngưỡng sau là tiêu chí đề xuất để chốt trước lượt đo, không phải kết quả đã đạt.

| Hạng mục | Fixture/phương pháp trước–sau | Điều kiện đạt ban đầu |
|---|---|---|
| Album/list | Fixture 100/1k/5k sách; 10/100/500 Album; độ sâu 1–5, phân bố đều/lệch. 30 lượt sau warm-up; React Profiler + `performance.mark`; báo p50/p95, long tasks >50ms, DOM count và heap nếu browser hỗ trợ | Kết quả/filter/selection/path giống baseline; fixture lớn giảm ≥20% p95 grouping/render; fixture nhỏ regression không quá 5% |
| Virtualization | Cùng fixture 1k/5k ở production build; đo search, scroll, focus, tab, đổi view, DOM và long task trên Edge desktop/393px mobile emulation | Khi list lớn, giảm số DOM và long task; keyboard/focus/scroll return giữ nguyên. Physical Android còn cần kiểm tra; thời gian search vẫn phải báo riêng vì App vẫn lọc toàn bộ metadata/chapter index |
| Nạp Vietphrase/Convert | Có Node benchmark với bốn dictionary thật (cold load n=3, packed warm cache in-memory n=25, Convert synthetic 10k/100k UTF-16 units n=30); thiếu Edge/Android, disk IndexedDB thật và chương đại diện. Script chỉ giữ hash trong RAM để so output | Output/token map giống hệt; mục tiêu ban đầu: p95 Convert trên mẫu chương giảm ≥20%, p95 cold load/heap không tăng quá 10%. `D:` là read-only; chỉ chuyển tạm Vietphrase qua USB vào Android theo quyền người dùng, không qua mạng, xóa bản trên máy sau đo |
| Packed dictionary | `benchmark-packed-dictionary.mjs` so Map và packed với 1,2 triệu entry synthetic; ghi riêng số này, không coi là benchmark thư viện thật | Chỉ đổi thuật toán/storage khi cả fixture synthetic và corpus đại diện chứng minh lợi ích mà giữ semantics |
| Offline shell | Browser profile sạch: online install → registration → offline refresh/deep route → mở sách local; sau đó deploy version mới và kiểm update | App shell/route local mở offline; API offline báo rõ; không cache API/user data giữa session; local DB giữ nguyên |
| TTS | Cùng text/voice/browser/network, timestamp chunk/playback, đo khoảng lặng p50/p95 trên desktop và Android thật | Chỉ gọi “gapless” sau khi p95 đạt ngưỡng thống nhất (ví dụ <50ms) qua các lượt; không cam kết 0ms |

### Nạp Vietphrase và Convert: hiện có so với khoảng trống

Source đã có `PackedBuilder`/`PackedIndex` và IndexedDB cache riêng cho một số dictionary; không phải trạng thái “chỉ Blob, không cache”. `benchmark-convert.mjs` đo một lượt `loadDictionaries()` trong fresh Edge context và Convert câu ngắn; `benchmark-packed-dictionary.mjs` dùng dữ liệu synthetic. Script [benchmark-vietphrase-readonly.mjs](../scripts/benchmark-vietphrase-readonly.mjs) vừa đo cold load/Convert với bốn dictionary được chọn thật trên Node: output Map/packed giống nhau, nhưng cold packed chậm hơn Map và Convert packed chậm hơn Map. Warm packed cache trong fake IndexedDB RAM nhanh hơn đáng kể, chưa đại diện disk. Chưa có Edge/Android, IndexedDB persistent, chương thực tế hay tổng worker memory; xem số và giới hạn trong [DICTIONARY-PACKED-CACHE.md](DICTIONARY-PACKED-CACHE.md). `D:` vẫn read-only; chỉ phép đo Android được người dùng cho phép mới chép tạm riêng Vietphrase qua USB, không qua mạng và xóa sau đo.

### Xóa batch: test hiện có và khoảng trống

Đã có unit cho cloud ACK fail giữ local, cloud ACK xong nhưng receipt local lỗi, owner đổi sau ACK và concurrency tối đa 4; server test repeated/simultaneous DELETE idempotent. `withBookLock` dùng Web Locks khi hỗ trợ. Chưa thấy ca batch worker đang bay khi một DELETE lỗi, retry phần còn lại sau reload, hay hai tab thật cùng gọi một batch. Cần bổ sung partial completion + retry regression trước khi deploy concurrency; batch không atomic và cloud/local status phải được báo riêng.

### Kiểm tra service worker production và giới hạn

Đã chạy tìm kiếm source `rg -n "serviceWorker|workbox|vite-plugin-pwa|registerSW" src public vite.config.ts package.json`; Vite config chỉ khai báo React và plugin PDF assets. Cũng tìm filenames/content trong local `dist` lúc audit; không thấy `sw.js`, `service-worker.js`, manifest PWA hoặc `navigator.serviceWorker`/Workbox trong JS. `HEAD /sw.js` và `/service-worker.js` tại `thu-phong-private.pages.dev` trả `200 text/html`, phù hợp SPA fallback chứ không phải script worker. Không có Playwright-bundled Chromium tại máy đó; Edge cài sẵn, và E2E production-build hiện pass trong Edge. Kết luận live tại thời điểm audit là **chưa xác minh registration**, không phải “DevTools xác nhận 0 worker”. Các phép dò local `dist` chỉ áp dụng cho artifact đang có, không chứng minh Pages deploy đã build đúng artifact đó.

### License và pin nguồn

Repository links là ý tưởng tham khảo, không có code được copy. Yomitan khai báo GPL-3.0; không nhúng code từ đó. Trước khi thêm dependency hoặc chép code cần ghi commit/tag, license ở commit đó, file dùng và kiểm tra tương thích. Link `main/master` là moving refs, không phải phiên bản đã pin.

Tại thời điểm lập báo cáo ban đầu, chưa có benchmark Convert, E2E offline, kiểm audio thiết bị thật hay production smoke gắn với các đề xuất. Sau đó đã có benchmark Node trên dictionary thật, profile/E2E local và production E2E cho virtualization; chúng được mô tả riêng, dùng fixture tổng hợp và không được coi là số đo Android hay corpus người dùng. Các mục chưa có bằng chứng vẫn là **kỳ vọng có điều kiện**.

## Cập nhật nghiệm thu web (14/11/2026)

- **Đã triển khai:** offline app shell; gom truyện theo Album; virtualization danh sách; fuzzy metadata search. Production E2E đã xác minh offline shell, virtualization và fuzzy search; Album grouping có unit và local hierarchy E2E; chi tiết từng fixture và số đo nằm ở tài liệu liên kết. EPUB navigation đã hoàn tất ở mức spike; chưa thay reader engine. TTS chỉ có profile MP3 tổng hợp, không sửa code theo yêu cầu người dùng.
- **PWA update:** offline E2E production pass; mô phỏng lifecycle trên Edge local xác nhận worker mới chờ tab cũ đóng rồi mới active. Chưa giữ một tab production thật qua lần deploy tiếp theo; đây là giới hạn kiểm chứng, không có code update nào đang chờ.
- **Vietphrase/Convert:** Node benchmark đã dùng bốn dictionary được chọn thật, chỉ đọc; kết quả cold load và Convert packed chậm hơn Map trong lượt đo. E2E Edge persistence/Convert 1/1 dùng dictionary tổng hợp. Chưa đo cold load/Convert trên Edge với file thật; không kết luận cache packed đã cải thiện tốc độ thực tế.
- **Xóa batch:** code hiện giới hạn 4 tác vụ đồng thời; unit `library-management` + `book-removal` đã pass 19/19 ở lượt kiểm tra tập trung trước đó. E2E tổng hợp lần này dừng trước thao tác xóa: fixture không mock GET snapshot từng truyện cloud nên app báo lỗi dữ liệu đồng bộ và thiếu checkbox mong đợi. Mọi `/api/**` đã bị chặn trong test, không có request hay xóa dữ liệu cloud thật. Không sửa semantics hoặc thêm test xóa khi chưa có reviewer Astra High độc lập như AGENTS.md yêu cầu; model đó không có trong runtime hiện tại.
- **Unit suite hiện tại:** một lượt `npm.cmd test` cho 83 fail/48 file, 2.676 pass, 105 skip. Đây là baseline hỗn hợp, không quy hết cho một thay đổi: có test assertion fail ở nhiều nhóm AI/Convert/TTS, cùng lỗi runtime/hook timeout. Suite `server-convert-guard-review` chạy riêng vẫn fail 21/21 tại khởi tạo Miniflare D1 (`getD1Database`, `tests/server-convert-guard-review.test.ts:25`); chưa có căn cứ để coi đó là lỗi feature web vừa triển khai.
- Người dùng xác nhận phạm vi hiện tại là làm web và không cần sửa TTS; không yêu cầu kết nối điện thoại. Vì vậy Android thật được ghi là **chưa đo**, không phải điều kiện chặn nghiệm thu web. Các kết quả mobile hiện có là Edge/Pixel viewport emulation.

Không có code sản phẩm mới hoặc deploy nào trong lượt chốt này; các thay đổi web nêu trên đã nằm trên `master` và production từ các lượt deploy được ghi tại từng tài liệu.
