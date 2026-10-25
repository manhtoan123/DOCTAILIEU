# M0 — Thử Convert trên máy chủ trong gói Free

Hiện hành23/10: AI TXT Name đã deploy Pages6d67f90f/Worker7814891b, sourcewindow256, Free best effort có cap/quota/local fallback. Smoke online2/2 PASS. Các mục prototype512 bên dưới là bằng chứng theo giai đoạn; mục Tích hợp Reader/Triển khai cuối là trạng thái dùng thực tế. Chưa chứng nhận M0 Convert tổng quát hoặc P99<10ms.


23/10/2026. Người dùng cho bắt đầu thử API Convert để hộp Name không cần nạp VietPhrase trên thiết bị. Chỉ dùng hạ tầng Cloudflare hiện có, không nâng gói/billing/provider. Trạng thái: bản SQL mới đạt mốc CPU trên mẫu remote; chưa nối Reader vì còn lớp quota/truy cập/version/cancel và kiểm cold/concurrency.

## Phạm vi bản thử

- Mã độc lập tại `experiments/server-convert/worker.ts`; schema dùng database D1 dùng một lần của Miniflare, không phải migration thư viện.
- POST `/convert` chưa nối vào Reader. D1 thử riêng `thu-phong-convert-probe` (`083752ea-454a-4fa4-aa10-98c64a1086e5`); config tại `experiments/server-convert/wrangler.jsonc`, tắt workers.dev và preview URLs. Không chạy schema vào DB thư viện.
- Xây các chuỗi con có thể xuất hiện trong đoạn yêu cầu, tra bằng khóa chuẩn hóa có index trong D1. Chỉ nạp các mục khớp và rules vào `LanguageEngine` hiện có, trả token và nghĩa tra cứu cùng response.
- Giữ khóa nguồn nguyên gốc, `lookup_key` chuẩn hóa và `ordinal` thứ tự nạp. Thứ tự quan trọng khi Name cùng độ dài chồng lấn; chuẩn hóa quan trọng với dấu câu. Script prepare tải bản cloud hiện có bằng GET, xác minh SHA/size, UTF-8 nghiêm ngặt và giới hạn dòng; không sao chép từ D.
- Name riêng đi kèm request, không ghi xuống database và không lưu/log đoạn truyện. Mọi response no-store. Không tạo API công khai chưa có kiểm soát truy cập/quota.

## Giới hạn thử nghiệm

Body stream tối đa32KiB; text tối đa512 UTF-16 units; tối đa100 Name; tối đa8192 chuỗi ứng viên; tối đa512 mục từ/rules; khóa nguồn1–256 ký tự; giá trị tối đa4096 ký tự. Mỗi yêu cầu dùng3–7 query, tối đa4 lượt tìm phụ thuộc Rules. Quá giới hạn trả lỗi, không trả bản dịch bị cắt.

512 ký tự là cap đầu vào, không bảo đảm mọi đoạn512 ký tự đều xử lý được: số ứng viên hoặc số kết quả có thể chạm giới hạn trước. Prototype chưa phục vụ yêu cầu dài của Reader. max_key_length khi import phải tính trên lookup_key đã chuẩn hóa, không chỉ khóa raw (một số dấu câu có thể nở dài). Giá trị từ điển thật dài tới65536 ký tự theo parser hiện tại, nên bản thử4096 chưa thay thế được toàn bộ corpus.

## Bằng chứng và các điểm chưa xác minh

Test `tests/server-convert-probe.test.ts` chạy trong workerd+D1 thật của Miniflare, với **5014 mục tổng hợp**, bao gồm5000 mục không liên quan. Kiểm đối chiếu bộ engine đầy đủ trên cùng mẫu: dấu câu, chuẩn hóa key, Unicode, Name riêng, rules và Name chồng lấn. EXPLAIN kiểm query có index; rows_read đo bằng D1 meta. Có kiểm body/input/candidate budget.

Báo cáo `.dsh-tmp/server-convert/local-report.json` chứa wall-clock round-trip từng request; **đây không phải CPU time Cloudflare**. CPU remote và peak RAM workerd để null, trạng thái Free `NOT VERIFIED`. Dataset tổng hợp không thay thế phép đo từ điển thật. File Vietphrase tham khảo trên D có kích thước43.687.000 byte; chỉ đọc metadata, không copy/upload nội dung vào prototype. Nguồn: `D:\linh tinh\tm\Vietphrase-data\Vietphrase.txt`.

Không suy CPU từ latency, không suy RAM từ kích thước file. Không hứa tránh toàn bộ nạp từ điển nếu phải fallback local. Không gửi nguồn/Name lên một API ngoài phạm vi người dùng chọn.

## Rules và dữ liệu thật

Đã sửa truy hồi phụ thuộc có giới hạn: quan sát các khóa engine thực sự tra, lấy thêm rồi chạy lại đến khi ổn định. Regression `第{0}卷=新{0}`, `新星=Nova`, input `第星卷` đã qua; reviewer xác nhận unexpected pass trước khi bỏ `it.fails`. Không coi đó là chứng minh mọi Rules đều tương đương. Rules có thể nở output lớn; cap đầu vào chưa chứng minh RAM an toàn.

Corpus cloud đã xác minh: 1.416.572 event từ7 loại từ điển, khóa chuẩn hóa dài nhất33, unsupported0. Bản rowwise154.386.432B không phù hợp nạp từng dòng trên Free. Bản packed chia theo hash4096 và khoảng khóa BINARY, mỗi trang≤45.000B: 4.855 trang +1 metadata, database gồm index111.050.752B. Giữ toàn bộ duplicate event theo ordinal. Export SQL lớn nhất45.105B/statement, từ chối quá99.000B. Số dòng này chưa phải số quota writes đã đo.

Local workerd+D1 với corpus thật: 8 mẫu tổng hợp ×2 lượt, token và lookup khớp16/16 với engine nạp đầy đủ; bản paged dùng3query và đọc67–3.519rows/request trên mẫu. Đây không phải kiểm toàn corpus. `.dsh-tmp/server-convert/real-report.json` giữ kết quả; local latency không chứng minh CPU Free. Số liệu remote ở mục sau; chưa đo peak riêng từng request.

## Kết quả remote23/10

- Import vào D1 probe trống: 9.718 rows_written thực (gồm index), 111.194.112B, SQL duration tổng10.095ms; log `remote-import.json`. Không sửa DB thư viện. Insights database cũ ghi173writes/23query trong1ngày trước import, chỉ là mẫu analytics, không coi là quota còn lại toàn account.
- Đăng ký subdomain account `thu-phong-private.workers.dev` vì trước đó chưa có. Worker thử deploy version `1a7ff2f4-4ca7-49dc-b67f-e209c2e959c4`, workers_dev/preview_urls=false, không routes. GET URL workers.dev không token trả404. Chỉ gọi qua remote preview token do Wrangler giữ, listener127.0.0.1; đã dừng sau thử.
- `benchmark-server-convert-remote.mjs`: remote preview + D1 thật, cùng8mẫu×2,16/16 token/lookup khớp. `.dsh-tmp/server-convert/remote-report.json`. Không gửi truyện thật hay Name người dùng; dữ liệu request tổng hợp.
- OAuth hiện tại đọc Telemetry API bị403; không đổi quyền/token. Đọc dashboard qua Edge đã đăng nhập:16invocations, CPU P50=3.091ms, P90=9.373ms, P99/P999=13.76ms; memory P50=1.864.046B, P99/P999=2.888.121B; exceeded CPU/memory=0. Đây là thống kê remote preview, không phải peak riêng từng request hay thử tải đủ mọi đoạn512 ký tự.
- Bản JS ban đầu chưa đạt gate CPU10ms ở P99. Không suy không lỗi là đã bảo đảm Free. Bản SQL tiếp theo ở mục dưới; chưa có auth/quota/version/cancel cho đường Reader, nên chưa mở endpoint công khai.
- Lỗi hạ tầng giữ log: remote preview ban đầu internal error; deploy đầu báo10007 sau upload; dừng preview rồi deploy lại thành công, preview sau đó chạy được. Không xác nhận nguyên nhân race hay lỗi Cloudflare từ chuỗi quan sát này.

## Tối ưu SQL và nghiệm thu mẫu23/10

`PROBE_SQL_CANDIDATES=1` chỉ bật trong config Worker thử. Khi Rules query trả0 mục, Worker chuẩn hóa input một lần và gửi mảng codepoint raw/normalized; D1 tạo cụm bằng CTE, cộng đúng đơn vị UTF-16 (ký tự ngoài BMP tính2). Cửa sổ tối đa M codepoint chứa đủ mọi cụm≤M UTF-16; loại trùng context trước đệ quy, rồi DISTINCT cụm với sentinel8193. Có Rules thì giữ nhánh JS/discovery đã kiểm. Engine/token/lookup/ordinal không đổi.

- SQL đầu đọc quá nhiều:95char25.990rows, near512 138.580rows. Đã thay bằng cửa sổ context trùng:95char10.561rows, near512 15.485rows, Unicode450 9.792rows; vẫn nhiều hơn JS trong một số mẫu. Không coi giảm CPU là hết rủi ro quota D1.
- Local corpus thật:28 lượt khớp token/lookup hoặc đúng413 budget, gồm đoạn512, Unicode450,100Name. Targeted9test PASS: cả rowwise/packed; CRLF/dấu câu/quote/backslash, Name chồng lấn; Unicode với cap1/2/3, số ứng viên0 có/không Name riêng; event512 thành công/513 từ chối; Rules fallback. Reviewer kiểm thêm480ca SQLite-vs-JSSet (gồm NUL) PASS, khác với workerd regression.
- Profiler local workerd + remote D1:6nhóm×30, artifacts `profile-*.cpuprofile` và `profile-summary.json`. Dùng để tìm nhóm hàm, **không dùng sampled duration như CPU Cloudflare**. Remote preview không mở DevTools; local inspector chỉ loopback9296, đã dừng. `ws` dùng package đã có, không thêm/upgrade dependency.
- Deploy Worker thử version `b478171f-2dd3-4bbc-99dd-9ec5c9030497`, không routes, workers_dev/preview_urls=false; DB giữ nguyên. `types`, dry-run, build PASS. Bản JS cũ vẫn có thể chọn bằng flag0 để đối chiếu; website Pages và AIWorker không deploy.
- Remote26/26 khớp, không chạy lại2ca overflow vì chưa có diagnostics reads; tổng124.710reads gồm metadata. Report `remote-report-1792694480546.json`, UTC18:41:14.454–18:41:20.546 ngày22/10 (GMT+7 ngày23/10). Dashboard lọc01:41–01:42 GMT+7:26invocations, CPU P50≈2,5/P90≈4,91/P99/P999≈8ms, RAM P99≈3,68MB,0errors.
- Warm5nhóm×30:150/150 khớp,1.401.540reads gồm metadata, UTC18:43:12.500–18:43:50.873; report `remote-report-1792694630873.json`. Dashboard riêng01:43–01:44 GMT+7 ghi149invocations khi đọc, CPU P50≈2,37/P90≈3,31/P99≈7,28/P999≈8,97ms, RAM P99≈7,14/P999≈7,16MB,0errors. Chưa giải thích chênh149/150; không gọi đây là P99 production hay chứng minh cold start.
- All-day metrics có cả request bridge D1 của profiler local nên **không dùng** để so CPU. Mẫu mới đáp ứng mốc10ms; chưa bao hết input hợp lệ, Rule nở output, giá trị Name lớn, cold isolate hay nhiều request đồng thời. RAM là số dùng chung isolate, không peak riêng request.
- Trước batch warm: probe insights4nhóm query khoảng200.313reads, auth23nhóm khoảng100.565reads/1ngày; cộng batch26 để xét ngân sách, không coi đó là quota remaining chắc chắn. Benchmark có fail-fast parity/status/mode, report partial trong finally và budget150k/1,5M. Sau đo đã thêm dự trù trước mỗi request:20k cho mẫu thành công đã kiểm local,100k cho overflow/thiếu diagnostics; nếu chi phí thay đổi thì dừng batch. Đây không phải bộ giới hạn quota production. Không tạo billing/gói mới.
- Kiểm cuối: `npm.cmd test -- --maxWorkers=2` exit0,164file/2032test; build exit0. Lượt full4workers trước đó timeout hook Convert/D1delta và assertion timing AI; recheck3file/29test một worker PASS. Fixture5000noise đổi từ50batch sang1CTE local, giữ nguyên event/key/ordinal; full sau đó PASS. Giữ `sql-full.log`, `sql-full-recheck.log`, `sql-full-workers2.log`, `sql-build-final.log`; không sửa logic AI/sync để né test.

Đi tiếp: chỉ nối luồng AI-TXT Name sau khi có route cùng origin qua service binding, kiểm revision từ điển để không dùng bản cũ khi người dùng đổi dữ liệu, giới hạn dùng chung chống cạn quota (PUBLIC_LIBRARY=1 không phải xác thực chủ sở hữu), cache có giới hạn/timeout/abort/stale guard, lookup popup không gọi full dictionary worker trên nhánh server thành công. Kiểm cold/concurrency và các cap còn lại trước nghiệm thu production. Giữ lưu Name chỉ thêm dòng riêng truyện, không sửa/dịch lại AI.

## Điều kiện để đưa lên web

1. Xây và kiểm importer từ bản từ điển cloud đã có, giữ bytes/SHA nguồn, precedence/duplicate keys/chuẩn hóa/loại từ điển và version; tạo chỉ mục ở khu vực độc lập. Đối chiếu kết quả corpus thật với engine hiện tại.
2. Đo kích thước database gồm indexes, thời gian và quota nạp dữ liệu. D1 Free chỉ100.000 rows written/ngày; cập nhật indexed columns còn phát sinh ghi index. Không tự chạy import lớn vào database đang dùng.
3. Đo trên Worker Free thật với đoạn ngắn/dài/nhiều khóa, cold/warm/concurrency; lấy CPU và memory từ bằng chứng runtime/observability. Bộ dữ liệu tổng hợp và thời gian local chưa đủ cho điều kiện này.
4. Kiểm CPU10ms/request, RAM128MB/isolate, D1 Free500MB/database, truy vấn/quota đọc ghi dùng chung account. Nếu không đạt, đánh giá index/shard R2 đọc theo vùng hoặc giảm phạm vi tra; không nâng paid để né lỗi.
5. Trước khi expose: tích hợp auth/origin/limit/quota hiện có, kiểm phiên bản từ điển/Name riêng, timeout/cancel/stale response và privacy cache. Không ghi đoạn truyện vào log hoặc public cache.
6. Chỉ khi đạt mới nối hộp Name vào API, kèm cache client theo dictionary revision. Kiểm tải trang và mở Name không đọc full dictionary Blob ở client trên đường server thành công. Offline/fallback phải có trạng thái rõ, giữ UI tối giản.

## Nghiệm thu lượt thử

- Targeted7test PASS, gồm phụ thuộc Rules và packed duplicate/chuẩn hóa/lookup. Log `.dsh-tmp/server-convert/paged-tests-retry.log`; lượt trước lỗi CreateDirectory AccessDenied, chạy lại TEMP/TMP riêng thành công.
- Full164file/2030test PASS với `--maxWorkers=4`; lượt mặc định trước đó có timeout, giữ `full-paged.log`. Typecheck prototype, Wrangler types (artifact ignored), dry-run và app build PASS; build ban đầu bắt lỗi type fixture, đã sửa và chạy lại. Review độc lập đã kiểm pack/export/query và cách ly DB; chưa chấp nhận production. Website hiện hành không thay đổi bởi lượt thử này.
- Chưa chứng minh chạy miễn phí bền vững với từ điển thật; chưa có API cho Reader; chưa sửa đường Convert của Reader.

Tài liệu kiểm tra22/10: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Query JSON](https://developers.cloudflare.com/d1/sql-api/query-json/). Giới hạn cần kiểm lại trước khi deploy.


Chạy lại từ private-novel (PowerShell, TEMP/TMP đặt vào .dsh-tmp/chapter-runtime):
- `npm.cmd test -- tests/server-convert-probe.test.ts`
- `npx.cmd tsc -p experiments/server-convert/tsconfig.json`
- `node scripts/prepare-server-convert-probe.mjs` (GET cloud, SHA/size verified)
- `node scripts/pack-server-convert-probe.mjs`
- `node scripts/export-server-convert-probe.mjs` (chỉ tạo SQL local, không tự import)
- `node scripts/benchmark-server-convert-probe.mjs`
- `node scripts/benchmark-server-convert-remote.mjs` (cần Wrangler remote preview đang nghe127.0.0.1:8796, chỉ DB probe)
- `node scripts/benchmark-server-convert-probe.mjs --sql --stress` (local, không tốn quota remote)
- `node scripts/profile-server-convert-probe.mjs` (inspector local9296, requests8796; không dùng remote preview)
- `node scripts/benchmark-server-convert-remote.mjs --stress --skip-overflow --expect-sql --rows-budget=150000`
- Batch warm chỉ chạy sau kiểm quota; không chạy lặp mặc định. Lượt đã kiểm: `--stress-only --skip-overflow --repeat=30 --expect-sql --rows-budget=1500000`.

Không chạy schema này vào DB thư viện. Không dùng prototype như endpoint production chưa có auth/rate limit. Báo cáo `.dsh-tmp/server-convert/local-report.json` là artifact local, không đưa vào Git vì chứa kết quả theo máy/phiên.

## Tích hợp Reader ngày23/10/2026

`server/convert-worker.ts` dùng index packed đã xác minh, chỉ nhận service binding từ Pages `/api/convert/name`; không workers.dev/routes công khai riêng. Giữ origin/auth hiện có (PUBLIC_LIBRARY=1 vẫn là public theo cấu hình sẵn có, không coi đó là owner auth). Request không được ghi/log; no-store. Index pin SHA manifest + engine version, index corpus phải bất biến: thay corpus cần DB/version mới và triển khai binding tương ứng.

Reader AI TXT ưu tiên server cho cả hộp chọn cụm và tra popup; không đọc Blob từ điển/khởi động language Worker trên nhánh thành công. Cache riêng trong RAM tối đa8 mục; descriptor/version, SHA tập từ điển đã chọn, Name chung/riêng và nguồn nằm trong cache key. Abort20s, hủy khi đổi/đóng chương và kiểm snapshot trước dùng/cache kết quả. Không có từ điển local thì dùng corpus mặc định server; bộ tùy chọn không khớp SHA phải dùng local bằng lựa chọn rõ ràng. Lỗi server/quá giới hạn có nút “Dùng từ điển trên máy”; không tự tải full VP. Đoạn dài cắt cửa sổ nguồn tối đa256 UTF-16 gần vị trí nhấn, tránh cắt surrogate pair, giữ offset nguồn thật. Luồng lưu Name và AI/TTS giữ nguyên.

Guard: body32KiB, nguồn256,100 Name, khóa256/giá trị Name256;8192 candidates,512 dictionary events, aggregate output65536 ký tự trước serialize và kiểm lặp giá trị lớn trước tạo tokens. Không trả output bị cắt. Response chỉ serialize1lần; accounting headers nội bộ bị loại khỏi route ngoài. Bộ đếm D1 dùng lease CAS120s và ngàyUTC; reserve2M, ceiling3M. Request mới chỉ được nhận khi spent<=1M vì còn chừa reserve; quota thực dùng thường quanh1M, không hứa3M usable. Lỗi không đo được giữ toàn bộ reserve và có thể ngừng Convert đến ngàyUTC mới. Đây là guard bảo thủ, không phải hard cap quota account tuyệt đối: chưa chứng minh upper bound2M rows mọi query; account còn các ứng dụng khác.

Regression: guard16ca workerd+D1 với engine accounting controlled; contention giữ engine chủ động xác minh serialization/CAS. Stress output chạy engine thật. E2E10/10 desktop+Android layout: server success,0dictionary Blob reads khi chọn/tra, lưu Name không dịch lại/không gọi stop, giữ picker, Name lượt sau, local fallback chủ động, đoạn không cùng số dòng, cửa sổ Unicode dài. Chưa thử Android thật. Vite trên OneDrive có thể treo watcher: runtime riêng `.dsh-tmp/server-convert/vite-reader.config.mjs` dùng `server.watch=null`, cache/port5176 và deps entries rõ ràng; giữ logs các lượt timeout, không coi là lỗi sản phẩm khi built-preview/isolated rerun qua.

Prefilter expansion là giới hạn chi phí bảo thủ: entry bị Name khác che hoặc dictionary event cũ có thể gây413 dù output cuối nhỏ. Không trả sai/cắt dịch; người dùng có thể chọn local. Cap bao gồm metadata NameImage (label/URL), không chỉ chữ hiển thị.

Tối ưu wrapper sau số đo trước mở Pages: bản9a13 input512 có P99=12,1ms (11observations), bảnb6a6 input256 vẫn có P99=16,45ms (9observations). Event near256 ghi CPU16ms, ca100Names8ms. Vì vậy chưa dùng những bản này cho Reader. Bản cuối không tra Hán Việt của toàn đoạn khi chỉ cần chọn token; tra theo cụm có cache trong mỗi request, mở rộng vùng chọn mới yêu cầu whole lookup riêng. Response chỉ JSON1lần. Body canonical whitelist và kiểm byte32KiB lần nữa trước lease; Pages bỏ credentials/cookies/metadata trước service binding. Tests40 targeted +1private-header case PASS; root full166files/2058tests PASS trước tối ưu lookup, build PASS; E2E10 luồng cũ +2 expanded selection PASS sau sửa assertion theo token unknown group. Hai lỗi assertion/infrastructure được giữ log.

Bản7814891b final qua service binding riêng:9synthetic POST PASS (5success cases,512input rejected400,Name expansion413,2short overlapping callers200 do có thể serialized), UTC22/10 23:44:55.771–58.024. Dashboard filter Actively deployed versions:9observations, CPU P50=6,7ms/P90/P99/P999=13,32ms, RAM P99≈3,46MB,0invocation/exceededCPU errors. Đây chưa đạt mục tiêu P99<10ms; không đổi tên mục tiêu thành kết quả đạt. Cloudflare nêu10ms Free có rollover cho lượt thỉnh thoảng vượt; vượt thường xuyên bị terminate ([Limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), [Metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)). Quyết định phạm vi: phát hành AI-Name có cap/quota/explicit local fallback trên Free như best effort; M0 Convert tổng quát/cold/tải mọi input chưa được chứng nhận. Không nâng paid. Xem DECISIONS ngày23/10.

Triển khai website: Pages e8b02326 / index-Dlrq-B9Z.js, service binding tới Worker7814891b. Alias khớp dist. Smoke production Reader2/2 (desktop/mobile layout) PASS, dùng Convert thật, mỗi ca1POST/0dictionary Blob reads; mock upstreamAI,0library writes, quota metadata có ghi thật. Log production-reader-smoke.log; ảnh/report .dsh-tmp/ai-name/. APIheader test riêngPASS xác thực bên ngoài nhưng không forward credentials/cookies/metadata vào private Worker. Không test trên truyện thật/Android thật/audio thật. DB auth/library/AIWorker không đổi; guard tables chỉ thêm vào indexDB riêng.
