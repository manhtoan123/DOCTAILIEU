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
| TTS hiện micro-gap 100–300 ms; Web Audio cho 0 ms; chưa có wake lock/Media Session | Source có TTS player, audio cache/cursor và gateway. Báo cáo trước không cung cấp trace/audio measurement chứng minh micro-gap hoặc kiểm tra đầy đủ browser API hiện có | **Chưa chứng minh.** Không gọi 0 ms hoặc “gapless” trước khi đo waveform/end-to-end; hỗ trợ API phải kiểm lại theo browser |
| AI không có context window hoặc Name prompt injection | `ai-parts.ts` gắn context nguồn trước đó (tối đa khoảng 300 ký tự theo logic hiện tại); `ai-hybrid-prompt.ts` nhận `context` và `names` | **Sai hiện trạng.** Không đề xuất thêm lại chức năng đã có. Chất lượng xưng hô/Name cần đo trên corpus phù hợp, không hứa “100%” |
| OPFS / `navigator.storage.persist()` sẽ bảo vệ sách tuyệt đối | UI About đã có nút gọi `navigator.storage.persist()`; đây là lời xin browser cấp quyền, không bảo đảm browser chấp thuận hay dữ liệu tuyệt đối không bị mất | **Đã có một phần; không phải bảo đảm.** Không chuyển dictionary sang OPFS khi chưa benchmark tương thích/backup/quota |
| Tủ sách lớn sẽ mở tức thì nhờ virtualization; truyện 1.000+ chương cần scrubber | Album shelf xem trước tối đa 12 truyện mỗi Album; StoryDetail phân trang 60 chương; có tìm/chuyển tới chương và route số. Danh sách truyện chính vẫn render toàn bộ `filtered` | **Chỉ virtualization danh sách truyện chính là giả thuyết cần đo.** Album grouping có thể giảm quét lặp; scrubber cần nhu cầu riêng |
| Offline shell làm web độc lập/mở offline 100% | Không tìm thấy đăng ký service worker/Workbox trong source, `public`, Vite config hoặc dependencies; About cảnh báo app có thể không mở lại khi hoàn toàn mất mạng | **Khoảng trống thật, phạm vi lợi ích bị nói quá.** Service worker có thể cache app shell sau lần tải/cài online; API, AI, TTS và cloud vẫn cần mạng |

## So sánh trước/sau có căn cứ hơn

| Ưu tiên | Trước | Ý tưởng tham khảo | Sau có thể kỳ vọng | Bằng chứng còn cần |
|---|---|---|---|---|
| **P1: Offline app shell** | Vite/source không khai báo registration hoặc PWA plugin; `/sw.js` và `/service-worker.js` trên Pages trả `200 text/html` (route fallback), chưa chứng minh có worker | Workbox precaching và fallback điều hướng | Đã deploy: giao diện và truyện local đọc được offline sau khi shell cài; API/AI/TTS vẫn cần mạng | Production Edge E2E xác nhận registration/controller, mở deep route offline, local story và không cache API; lần deploy app tiếp theo cài build ID mới và offline test pass trong profile sạch. Chưa kiểm update khi tab bản cũ còn mở; không cache `/api/**`/dữ liệu cá nhân |
| **P2: Album grouping** | `AlbumShelf` map Album và mỗi Album lọc lại toàn bộ `books` | Đã gom một lượt vào Map theo Album/path; giữ sách trong mọi Album tổ tiên hợp lệ | Microbenchmark synthetic 5.000 sách/150 path: dựng nhóm p50 1.139,34→17,42 ms (65,4×); membership/order giống nhau. App vẫn filter/sort sau đó; bộ nhớ index tăng theo N×D | Unit 4/4 và local hierarchy E2E; xem [đo và giới hạn](ALBUM-GROUPING-PERF.md). Số tổng hợp không thay cho profile browser/thư viện thật/Android |
| **P2: List virtualization** | `App.tsx` render tất cả sách đang lọc; mục lục chương đã phân trang 60 | TanStack Virtual là công cụ headless cho danh sách dài | Chỉ giảm DOM khi profile cho thấy list sách lớn gây chậm | Fixture 1k/5k; kiểm bàn phím, focus, selection, chiều cao item, scroll restore, Android; không virtualize reader/chapter trước |
| **P3: Fuzzy metadata search** | So khớp substring sau chuẩn hóa dấu; hỗ trợ tên/author/Album và tìm tên chương đã Convert | Fuse.js hỗ trợ fuzzy, trọng số trường và match indices | Tìm tên sách gần đúng dễ hơn, nếu ranking tốt | Test typo tiếng Việt, chữ Hán, tên gốc/Convert, query ngắn; không fuzzy nội dung chương mặc định |
| **P3: EPUB navigation** | Renderer riêng giữ bố cục/Name/word selection; iframe sandbox/CSP/bridge | Readium TS Toolkit có navigator, preferences, positions và decorations | Có thể tham khảo locators, accessibility metadata hay điều hướng EPUB qua adapter | Spike cô lập trên EPUB synthetic; so parity với Name, TTS, AI, source mapping và sandbox. Readium Web tự ghi đang phát triển |
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
- [TanStack/virtual](https://github.com/TanStack/virtual): virtualization headless cho danh sách dài; chỉ áp dụng nếu profile hiện trạng biện minh.
- [tc39/proposal-array-grouping](https://github.com/tc39/proposal-array-grouping): ý tưởng nhóm theo khóa thành Map; app tự gom một sách vào từng Album tổ tiên vì cây cần nhiều bucket cho một item, không thêm dependency.
- [krisk/Fuse](https://github.com/krisk/Fuse): fuzzy/weighted search; tokenizer/ranking CJK cần kiểm riêng.
- [readium/ts-toolkit](https://github.com/readium/ts-toolkit) và [readium/web](https://github.com/readium/web): tham khảo API reader/position; Readium Web ghi trạng thái đang phát triển.
- [regosen/Gapless-5](https://github.com/regosen/Gapless-5): phối hợp HTML Audio và Web Audio cho mục tiêu gapless; không đảm bảo 0ms trên TTS stream động của app.
- [yomidevs/yomitan](https://github.com/yomidevs/yomitan): popup dictionary cho học/ngôn ngữ, chủ yếu hướng Nhật; chỉ tham khảo tương tác tra cứu, không coi là nguồn thuật toán phù hợp cho Trung–Việt.

## Thứ tự làm việc đề xuất

1. **Album grouping Map đã triển khai và đo microbenchmark tổng hợp** (chi tiết [ALBUM-GROUPING-PERF.md](ALBUM-GROUPING-PERF.md)). Profile list sách trên browser/thư viện đại diện trước khi quyết định virtualization.
2. **PWA app shell đã triển khai** (xem [PWA-OFFLINE-SHELL-M0.md](PWA-OFFLINE-SHELL-M0.md)); bước còn lại là test worker update trên deploy kế tiếp.
3. Chạy corpus tìm kiếm typo đa ngôn ngữ trước khi chọn fuzzy library hoặc tự triển khai.
4. Đo audio gap trên thiết bị/browser thật trước khi thử Web Audio; không cam kết 0 ms.
5. Chỉ làm EPUB prototype nếu chốt rõ nhu cầu (TOC, locator, accessibility, paged mode); không thay engine theo cảm tính.

## Phương pháp đo và tiêu chí đề xuất

Các ngưỡng sau là tiêu chí đề xuất để chốt trước lượt đo, không phải kết quả đã đạt.

| Hạng mục | Fixture/phương pháp trước–sau | Điều kiện đạt ban đầu |
|---|---|---|
| Album/list | Fixture 100/1k/5k sách; 10/100/500 Album; độ sâu 1–5, phân bố đều/lệch. 30 lượt sau warm-up; React Profiler + `performance.mark`; báo p50/p95, long tasks >50ms, DOM count và heap nếu browser hỗ trợ | Kết quả/filter/selection/path giống baseline; fixture lớn giảm ≥20% p95 grouping/render; fixture nhỏ regression không quá 5% |
| Virtualization | Cùng fixture; đo search input, đổi view, scroll, focus và checkbox; Chromium desktop và Android thật nếu có | Chỉ triển khai nếu profile cho thấy list tạo long task/interaction vượt mục tiêu đã chốt; không mất keyboard/focus/scroll anchoring |
| Nạp Vietphrase/Convert | Dùng `benchmark-convert.mjs` với file do người dùng chọn/cấp quyền hoặc fixture synthetic; tách cold load, warm load và Convert đoạn 10k/100k ký tự; đo 30 lượt p50/p95, output hash, dictionary/cache bytes, long task và heap. Script hiện tại chỉ convert câu ngắn một lần, heap chỉ ở main page, không đo tổng worker memory | Output/token map giống hệt; mục tiêu ban đầu: p95 Convert trên mẫu chương giảm ≥20%, p95 cold load/heap không tăng quá 10%. Tuyệt đối không dùng file D: |
| Packed dictionary | `benchmark-packed-dictionary.mjs` so Map và packed với 1,2 triệu entry synthetic; ghi riêng số này, không coi là benchmark thư viện thật | Chỉ đổi thuật toán/storage khi cả fixture synthetic và corpus đại diện chứng minh lợi ích mà giữ semantics |
| Offline shell | Browser profile sạch: online install → registration → offline refresh/deep route → mở sách local; sau đó deploy version mới và kiểm update | App shell/route local mở offline; API offline báo rõ; không cache API/user data giữa session; local DB giữ nguyên |
| TTS | Cùng text/voice/browser/network, timestamp chunk/playback, đo khoảng lặng p50/p95 trên desktop và Android thật | Chỉ gọi “gapless” sau khi p95 đạt ngưỡng thống nhất (ví dụ <50ms) qua các lượt; không cam kết 0ms |

### Nạp Vietphrase và Convert: hiện có so với khoảng trống

Source đã có `PackedBuilder`/`PackedIndex` và IndexedDB cache riêng cho một số dictionary; không phải trạng thái “chỉ Blob, không cache”. `benchmark-convert.mjs` hiện cài 4 dictionary, đo một lượt `loadDictionaries()` trong fresh Edge context, Convert một câu ngắn và timer gap/heap main page. `benchmark-packed-dictionary.mjs` so Map và packed index trên dữ liệu synthetic. Chưa có cold-vs-warm nhiều lượt trên đoạn chương, p95, tổng worker memory hoặc fixture thống nhất để xác định khâu nghẽn. Bước tiếp theo là mở rộng benchmark bằng input tự chọn rõ ràng/fixture synthetic, giữ checksum và output; không đọc file trên D:.

### Xóa batch: test hiện có và khoảng trống

Đã có unit cho cloud ACK fail giữ local, cloud ACK xong nhưng receipt local lỗi, owner đổi sau ACK và concurrency tối đa 4; server test repeated/simultaneous DELETE idempotent. `withBookLock` dùng Web Locks khi hỗ trợ. Chưa thấy ca batch worker đang bay khi một DELETE lỗi, retry phần còn lại sau reload, hay hai tab thật cùng gọi một batch. Cần bổ sung partial completion + retry regression trước khi deploy concurrency; batch không atomic và cloud/local status phải được báo riêng.

### Kiểm tra service worker production và giới hạn

Đã chạy tìm kiếm source `rg -n "serviceWorker|workbox|vite-plugin-pwa|registerSW" src public vite.config.ts package.json`; Vite config chỉ khai báo React và plugin PDF assets. Cũng tìm filenames/content trong local `dist` lúc audit; không thấy `sw.js`, `service-worker.js`, manifest PWA hoặc `navigator.serviceWorker`/Workbox trong JS. `HEAD /sw.js` và `/service-worker.js` tại `thu-phong-private.pages.dev` trả `200 text/html`, phù hợp SPA fallback chứ không phải script worker. Không có Playwright-bundled Chromium tại máy đó; Edge cài sẵn, và E2E production-build hiện pass trong Edge. Kết luận live tại thời điểm audit là **chưa xác minh registration**, không phải “DevTools xác nhận 0 worker”. Các phép dò local `dist` chỉ áp dụng cho artifact đang có, không chứng minh Pages deploy đã build đúng artifact đó.

### License và pin nguồn

Repository links là ý tưởng tham khảo, không có code được copy. Yomitan khai báo GPL-3.0; không nhúng code từ đó. Trước khi thêm dependency hoặc chép code cần ghi commit/tag, license ở commit đó, file dùng và kiểm tra tương thích. Link `main/master` là moving refs, không phải phiên bản đã pin.

Không có benchmark Convert, E2E offline, kiểm audio thiết bị thật hay production smoke nào được chạy trong lượt đánh giá. Mọi “sau” trong bảng là **kỳ vọng có điều kiện**, chưa phải kết quả đạt được.
